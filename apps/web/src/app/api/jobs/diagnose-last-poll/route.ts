import { NextResponse } from "next/server";

import { requireJobRunnerSession } from "@/lib/api-jobs-auth";
import { gmailProcessedLabel } from "@/lib/gmail-config";
import { prisma } from "@/lib/prisma";
import {
  buildLabelIdToNameMap,
  buildUnprocessedQuery,
  getGmailClient,
  listAllLabels,
  parseMessageMeta,
} from "@/services/gmail";

/**
 * GET – diagnostika POSLEDNÍHO úspěšného email_fetch jobu:
 * pro každou stažanou zprávu vrátí její aktuální labels v Gmailu,
 * jestli má `Zpracováno` štítek a jestli teď znovu odpovídá importnímu dotazu.
 *
 * Use case: uživatel říká „označil jsem všechny doklady v Gmailu jako
 * Zpracováno, ale aplikace stejně stáhla X nových." Tímto endpointem
 * uvidí přesně, jaké štítky těch X zpráv mělo v okamžiku stažení.
 */
export async function GET() {
  const session = await requireJobRunnerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Povoleno jen administrátorům nebo schvalovatelům." },
      { status: 403 },
    );
  }

  const lastJob = await prisma.processingJob.findFirst({
    where: { type: "email_fetch" },
    orderBy: { createdAt: "desc" },
  });
  if (!lastJob) {
    return NextResponse.json({
      hasJob: false,
      message:
        'Zatím žádný email_fetch job v DB. Spusťte "Stáhnout nové přílohy z Gmailu" a pak diagnostiku znovu.',
    });
  }

  const metadata =
    (lastJob.metadata as Record<string, unknown> | null) ?? {};
  const messageIds =
    Array.isArray(metadata.messageIds) &&
    (metadata.messageIds as unknown[]).every((x) => typeof x === "string")
      ? (metadata.messageIds as string[])
      : [];

  const configuredLabel = gmailProcessedLabel();
  const queryUsed =
    typeof metadata.query === "string" ? metadata.query : buildUnprocessedQuery();
  const currentQuery = buildUnprocessedQuery();

  if (messageIds.length === 0) {
    return NextResponse.json({
      hasJob: true,
      jobId: lastJob.id,
      jobStatus: lastJob.status,
      jobCreatedAt: lastJob.createdAt.toISOString(),
      jobCompletedAt: lastJob.completedAt?.toISOString() ?? null,
      configuredProcessedLabel: configuredLabel,
      queryUsed,
      currentQuery,
      messagesScanned: 0,
      messages: [],
      stillMatchingCurrentQuery: 0,
      message: "Job nezachytil žádné message IDs.",
    });
  }

  const gmail = getGmailClient();
  const allLabels = await listAllLabels(gmail);
  const labelIdToName = buildLabelIdToNameMap(allLabels);
  const processedLower = configuredLabel.toLowerCase();
  const processedLabelId =
    allLabels.find((l) => l.name.toLowerCase() === processedLower)?.id ?? null;

  // Zjistíme, které z původních messageIds by AKTUÁLNĚ pořád prošly
  // pollingem (tj. v Gmailu stále nemají Zpracováno štítek nebo zmizely
  // úplně). Gmail neumí query po IDs, takže pro každou ID použijeme
  // `messages.get` a labels si vyhodnotíme sami.
  const messages = await Promise.all(
    messageIds.slice(0, 100).map(async (id) => {
      try {
        const res = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["Subject", "From"],
        });
        const m = res.data;
        const meta = parseMessageMeta(m);
        const rawIds = m.labelIds ?? [];
        const names = rawIds.map((lid) => labelIdToName.get(lid) ?? lid);
        const hasProcessed =
          (processedLabelId !== null && rawIds.includes(processedLabelId)) ||
          names.some((n) => n.toLowerCase() === processedLower);
        // Zpráva by polling teď stále prošla, pokud nemá Zpracováno
        // (a další filtry query — INBOX label apod. — budeme aproximovat
        // takto, je to dobrý indikátor pro diagnostiku).
        const stillMatchesPolling = !hasProcessed;
        return {
          gmailMessageId: id,
          subject: meta.emailSubject || "(bez předmětu)",
          senderEmail: meta.senderEmail,
          senderHeader: (meta.emailFrom || "").slice(0, 200),
          receivedAt: meta.emailReceivedAt.toISOString(),
          labelIds: rawIds,
          labelNames: names,
          hasProcessedLabel: hasProcessed,
          stillMatchesPolling,
          found: true as const,
        };
      } catch (e) {
        return {
          gmailMessageId: id,
          subject: "(zpráva nenalezena)",
          senderEmail: null,
          senderHeader: "",
          receivedAt: null,
          labelIds: [],
          labelNames: [],
          hasProcessedLabel: false,
          stillMatchesPolling: false,
          found: false as const,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );

  const stillMatching = messages.filter((m) => m.stillMatchesPolling).length;
  const withProcessedLabel = messages.filter((m) => m.hasProcessedLabel).length;
  const notFound = messages.filter((m) => !m.found).length;

  return NextResponse.json({
    hasJob: true,
    jobId: lastJob.id,
    jobStatus: lastJob.status,
    jobCreatedAt: lastJob.createdAt.toISOString(),
    jobCompletedAt: lastJob.completedAt?.toISOString() ?? null,
    configuredProcessedLabel: configuredLabel,
    processedLabelExistsInGmail: processedLabelId !== null,
    queryUsed,
    currentQuery,
    messagesScanned: messageIds.length,
    messagesInspected: messages.length,
    stillMatchingCurrentQuery: stillMatching,
    withProcessedLabel,
    notFound,
    messages,
  });
}
