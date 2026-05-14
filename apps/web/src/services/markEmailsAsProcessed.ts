/**
 * Hromadné označení e-mailů v Gmailu jako zpracované – štítkem GMAIL_PROCESSED_LABEL
 * a odebráním UNREAD. Záměrně NESTAHUJE přílohy a NEVKLÁDÁ nic do DB; účel je
 * jednorázový „cutover" při zavedení aplikace, aby se historické faktury z
 * dosavadní schránky už při dalším pollu nestahovaly.
 *
 * Iteruje výsledek `buildUnprocessedQuery()` (stejný dotaz, jaký pak používá
 * cron poll) a používá Gmail `users.messages.batchModify`, který přijímá až
 * 1000 IDs v jediném volání.
 */

import type { gmail_v1 } from "googleapis";

import { writeAuditLog } from "@/lib/audit";
import { gmailProcessedLabel } from "@/lib/gmail-config";
import { prisma } from "@/lib/prisma";
import {
  buildUnprocessedQuery,
  ensureLabelExists,
  getGmailClient,
} from "@/services/gmail";

/** Default když klient nepošle vlastní limit. */
const DEFAULT_LIMIT = 5_000;
/** Tvrdý strop – ochrana před omylem. */
const HARD_LIMIT = 50_000;
/** Stránka pro `users.messages.list` – Gmail povoluje max 500. */
const LIST_PAGE_SIZE = 500;
/** Velikost dávky pro `batchModify` (Gmail max 1000, necháváme rezervu). */
const BATCH_MODIFY_CHUNK = 500;

export type MarkEmailsAsProcessedResult = {
  /** ID `ProcessingJob` záznamu (jen u skutečného běhu, ne dry-runu). */
  jobId: string | null;
  /** Gmail dotaz, který se použil. */
  query: string;
  dryRun: boolean;
  /** Kolik zpráv vyhovělo dotazu (po případném ořezu na `limit`). */
  matchedCount: number;
  /** Kolika z nich byl skutečně přidán štítek (0 v dry-runu). */
  markedCount: number;
  /** True, když výsledek dosáhl `limit` a další zprávy ještě v Gmailu jsou. */
  reachedLimit: boolean;
  /** Efektivní limit (po ořezu na HARD_LIMIT). */
  limit: number;
};

export type MarkEmailsAsProcessedOptions = {
  dryRun?: boolean;
  /** Volitelný strop kolik zpráv označit (default 5 000, hard cap 50 000). */
  maxMessages?: number;
};

async function listAllMatchingIds(
  gmail: gmail_v1.Gmail,
  query: string,
  limit: number,
): Promise<{ ids: string[]; reachedLimit: boolean }> {
  const ids: string[] = [];
  let pageToken: string | undefined = undefined;
  do {
    const data: gmail_v1.Schema$ListMessagesResponse = (
      await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: LIST_PAGE_SIZE,
        pageToken,
      })
    ).data;
    const msgs = data.messages ?? [];
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.id) {
        ids.push(m.id);
        if (ids.length >= limit) {
          // Pokud po načtení této stránky stále existují další zprávy, je to
          // skutečný hit do limitu. Jinak je výsledek úplný, jen zrovna sedí na
          // hranici limitu.
          const hasMore = Boolean(data.nextPageToken) || i < msgs.length - 1;
          return { ids, reachedLimit: hasMore };
        }
      }
    }
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);
  return { ids, reachedLimit: false };
}

export async function markEmailsAsProcessed(
  opts: MarkEmailsAsProcessedOptions = {},
): Promise<MarkEmailsAsProcessedResult> {
  const dryRun = Boolean(opts.dryRun);
  const rawLimit = opts.maxMessages ?? DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, Math.floor(rawLimit)), HARD_LIMIT);

  const gmail = getGmailClient();
  const query = buildUnprocessedQuery();
  const { ids: matchedIds, reachedLimit } = await listAllMatchingIds(
    gmail,
    query,
    limit,
  );

  if (dryRun) {
    return {
      jobId: null,
      query,
      dryRun: true,
      matchedCount: matchedIds.length,
      markedCount: 0,
      reachedLimit,
      limit,
    };
  }

  const job = await prisma.processingJob.create({
    data: {
      type: "email_mark_processed",
      status: "processing",
      metadata: { query, matchedCount: matchedIds.length, limit, reachedLimit },
    },
  });

  if (matchedIds.length === 0) {
    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        metadata: {
          query,
          matchedCount: 0,
          markedCount: 0,
          limit,
          reachedLimit,
        },
      },
    });
    return {
      jobId: job.id,
      query,
      dryRun: false,
      matchedCount: 0,
      markedCount: 0,
      reachedLimit,
      limit,
    };
  }

  try {
    const labelId = await ensureLabelExists(gmail, gmailProcessedLabel());
    let markedCount = 0;
    for (let i = 0; i < matchedIds.length; i += BATCH_MODIFY_CHUNK) {
      const chunk = matchedIds.slice(i, i + BATCH_MODIFY_CHUNK);
      await gmail.users.messages.batchModify({
        userId: "me",
        requestBody: {
          ids: chunk,
          addLabelIds: [labelId],
          removeLabelIds: ["UNREAD"],
        },
      });
      markedCount += chunk.length;
    }

    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        metadata: {
          query,
          matchedCount: matchedIds.length,
          markedCount,
          limit,
          reachedLimit,
        },
      },
    });
    await writeAuditLog({
      entityType: "Gmail",
      entityId: "bulk",
      action: "marked_emails_processed",
      metadata: {
        query,
        matchedCount: matchedIds.length,
        markedCount,
        limit,
        reachedLimit,
        jobId: job.id,
      },
    });

    return {
      jobId: job.id,
      query,
      dryRun: false,
      matchedCount: matchedIds.length,
      markedCount,
      reachedLimit,
      limit,
    };
  } catch (err) {
    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
        metadata: {
          query,
          matchedCount: matchedIds.length,
          limit,
          reachedLimit,
        },
      },
    });
    throw err;
  }
}
