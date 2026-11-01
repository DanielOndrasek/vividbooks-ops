/**
 * Orchestrace: Gmail → Email + Document, hash přílohy, deduplikace.
 */

import { createHash } from "node:crypto";

import type { gmail_v1 } from "googleapis";

import { writeAuditLog } from "@/lib/audit";
import {
  isNoiseAttachment,
  stripeInvoicesSupersededByReceipts,
} from "@/lib/document-dedupe";
import { gmailOnlyUnread } from "@/lib/gmail-config";
import { prisma } from "@/lib/prisma";
import {
  buildUnprocessedQuery,
  downloadAttachment,
  fetchUnprocessedMessageIds,
  getGmailClient,
  listEligibleAttachments,
  markAsProcessed,
  parseMessageMeta,
  saveAttachmentToDisk,
  tmpDirForMessage,
} from "@/services/gmail";

export type EmailPollResult = {
  jobId: string;
  messagesScanned: number;
  documentsCreated: number;
  skippedDuplicates: number;
  /** Loga z podpisů, obchodní podmínky, Stripe faktury s účtenkou v témže e-mailu. */
  skippedFiltered: number;
  perMessage: Array<{
    gmailMessageId: string;
    subject: string;
    senderEmail: string | null;
    senderHeader: string;
    eligibleAttachments: number;
    attachmentFilenames: string[];
    documentsCreated: number;
    skippedDuplicates: number;
    skippedFiltered: string[];
  }>;
  /** Gmail search query (diagnostics). */
  queryUsed: string;
  /** When true, only unread messages match — read mail won’t reappear after removing „Zpracováno“ only. */
  onlyUnread: boolean;
};

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function fetchFullMessage(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<gmail_v1.Schema$Message> {
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  if (!res.data) {
    throw new Error(`Zpráva ${messageId} nenalezena.`);
  }
  return res.data;
}

export async function runEmailPoll(): Promise<EmailPollResult> {
  const gmail = getGmailClient();
  const messageIds = await fetchUnprocessedMessageIds(gmail);

  const job = await prisma.processingJob.create({
    data: {
      type: "email_fetch",
      status: "processing",
      metadata: { messageIds, query: buildUnprocessedQuery() },
    },
  });

  let documentsCreated = 0;
  let skippedDuplicates = 0;
  let skippedFiltered = 0;
  const perMessage: Array<{
    gmailMessageId: string;
    subject: string;
    senderEmail: string | null;
    senderHeader: string;
    eligibleAttachments: number;
    attachmentFilenames: string[];
    documentsCreated: number;
    skippedDuplicates: number;
    skippedFiltered: string[];
  }> = [];

  try {
    for (const messageId of messageIds) {
      const message = await fetchFullMessage(gmail, messageId);
      const attachments = listEligibleAttachments(message);
      const meta = parseMessageMeta(message);
      const dir = tmpDirForMessage(messageId);

      const subject = meta.emailSubject || "(bez předmětu)";
      const sender = meta.emailFrom || "(neznámý odesílatel)";

      const email = await prisma.email.upsert({
        where: { gmailMessageId: messageId },
        create: {
          gmailMessageId: messageId,
          subject,
          sender,
          senderEmail: meta.senderEmail,
          receivedAt: meta.emailReceivedAt,
          status: "PENDING",
        },
        update: {
          subject,
          sender,
          senderEmail: meta.senderEmail,
        },
      });

      let msgDocs = 0;
      let msgSkipped = 0;
      const msgFiltered: string[] = [];
      const supersededInvoices = stripeInvoicesSupersededByReceipts(attachments);

      for (const att of attachments) {
        if (isNoiseAttachment(att) || supersededInvoices.has(att.filename)) {
          skippedFiltered += 1;
          msgFiltered.push(att.filename);
          continue;
        }

        const existingPair = await prisma.document.findUnique({
          where: {
            emailId_gmailAttachmentId: {
              emailId: email.id,
              gmailAttachmentId: att.attachmentId,
            },
          },
        });
        if (existingPair) {
          skippedDuplicates += 1;
          msgSkipped += 1;
          continue;
        }

        const bytes = await downloadAttachment(gmail, messageId, att.attachmentId);
        const hash = sha256(bytes);

        const existingHash =
          (await prisma.document.findUnique({
            where: { contentHash: hash },
            select: { id: true },
          })) ??
          // Stopa přežije promazání DB i smazání vlastních vydaných faktur.
          (await prisma.documentFingerprint
            .findUnique({ where: { contentHash: hash }, select: { documentId: true } })
            .then((f) => (f ? { id: f.documentId ?? "(promazáno)" } : null)));
        if (existingHash) {
          skippedDuplicates += 1;
          msgSkipped += 1;
          await writeAuditLog({
            entityType: "Email",
            entityId: email.id,
            action: "skipped_duplicate_hash",
            metadata: {
              gmailAttachmentId: att.attachmentId,
              existingDocumentId: existingHash.id,
              senderEmail: meta.senderEmail,
              subject: subject.slice(0, 300),
            },
          });
          continue;
        }

        const localPath = await saveAttachmentToDisk(dir, att.filename, bytes);

        await prisma.document.create({
          data: {
            emailId: email.id,
            gmailAttachmentId: att.attachmentId,
            originalFilename: att.filename,
            mimeType: att.mimeType,
            contentHash: hash,
            localFilePath: localPath,
          },
        });
        documentsCreated += 1;
        msgDocs += 1;
      }

      perMessage.push({
        gmailMessageId: messageId,
        subject: subject.slice(0, 500),
        senderEmail: meta.senderEmail,
        senderHeader: sender.slice(0, 500),
        eligibleAttachments: attachments.length,
        attachmentFilenames: attachments.map((a) => `${a.filename} (${a.mimeType})`),
        documentsCreated: msgDocs,
        skippedDuplicates: msgSkipped,
        skippedFiltered: msgFiltered,
      });
      if (msgFiltered.length > 0) {
        await writeAuditLog({
          entityType: "Email",
          entityId: email.id,
          action: "skipped_filtered_attachments",
          metadata: {
            filenames: msgFiltered,
            senderEmail: meta.senderEmail,
            subject: subject.slice(0, 300),
          },
        });
      }

      await prisma.email.update({
        where: { id: email.id },
        data: {
          processedAt: new Date(),
          status: "PROCESSED",
        },
      });

      await markAsProcessed(gmail, messageId);
    }

    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        metadata: {
          query: buildUnprocessedQuery(),
          messageIds,
          messagesScanned: messageIds.length,
          documentsCreated,
          skippedDuplicates,
          skippedFiltered,
          perMessage,
        },
      },
    });

    return {
      jobId: job.id,
      messagesScanned: messageIds.length,
      documentsCreated,
      skippedDuplicates,
      skippedFiltered,
      perMessage,
      queryUsed: buildUnprocessedQuery(),
      onlyUnread: gmailOnlyUnread(),
    };
  } catch (err) {
    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
        metadata: {
          query: buildUnprocessedQuery(),
          messageIds,
          partialPerMessage: perMessage,
        },
      },
    });
    throw err;
  }
}
