/**
 * Orchestrace: Gmail → Email + Document, hash přílohy, deduplikace.
 */

import { createHash } from "node:crypto";

import type { gmail_v1 } from "googleapis";

import { writeAuditLog } from "@/lib/audit";
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
          receivedAt: meta.emailReceivedAt,
          status: "PENDING",
        },
        update: {
          subject,
          sender,
        },
      });

      for (const att of attachments) {
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
          continue;
        }

        const bytes = await downloadAttachment(gmail, messageId, att.attachmentId);
        const hash = sha256(bytes);

        const existingHash = await prisma.document.findUnique({
          where: { contentHash: hash },
        });
        if (existingHash) {
          skippedDuplicates += 1;
          await writeAuditLog({
            entityType: "Email",
            entityId: email.id,
            action: "skipped_duplicate_hash",
            metadata: {
              gmailAttachmentId: att.attachmentId,
              existingDocumentId: existingHash.id,
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
          messagesScanned: messageIds.length,
          documentsCreated,
          skippedDuplicates,
        },
      },
    });

    return {
      jobId: job.id,
      messagesScanned: messageIds.length,
      documentsCreated,
      skippedDuplicates,
    };
  } catch (err) {
    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
