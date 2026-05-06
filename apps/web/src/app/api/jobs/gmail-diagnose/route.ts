import { NextRequest, NextResponse } from "next/server";

import { requireJobRunnerSession } from "@/lib/api-jobs-auth";
import { gmailProcessedLabel } from "@/lib/gmail-config";
import { prisma } from "@/lib/prisma";
import {
  buildUnprocessedQuery,
  getGmailClient,
  listAttachmentPartSummaries,
  listEligibleAttachments,
  listLabelIdByName,
  parseMessageMeta,
} from "@/services/gmail";

function senderQueryToken(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function listMessageIds(q: string, maxResults = 10): Promise<string[]> {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults,
  });
  return (res.data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id));
}

export async function GET(req: NextRequest) {
  const session = await requireJobRunnerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Povoleno jen administrátorům nebo schvalovatelům." },
      { status: 403 },
    );
  }

  const from = req.nextUrl.searchParams.get("from")?.trim().toLowerCase() ?? "";
  if (!/^[^\s@<>]+@[^\s@<>]+$/.test(from)) {
    return NextResponse.json(
      { error: "Zadej platnou e-mailovou adresu odesílatele." },
      { status: 400 },
    );
  }

  const gmail = getGmailClient();
  const processedLabelId = await listLabelIdByName(gmail, gmailProcessedLabel());
  const baseQuery = buildUnprocessedQuery();
  const fromQuery = `from:${senderQueryToken(from)} has:attachment`;
  const filteredFromQuery = `${baseQuery} from:${senderQueryToken(from)}`;

  const [fromIds, filteredFromIds] = await Promise.all([
    listMessageIds(fromQuery, 10),
    listMessageIds(filteredFromQuery, 10),
  ]);
  const filteredSet = new Set(filteredFromIds);

  const messages = await Promise.all(
    fromIds.map(async (id) => {
      const [messageRes, dbEmail] = await Promise.all([
        gmail.users.messages.get({ userId: "me", id, format: "full" }),
        prisma.email.findUnique({
          where: { gmailMessageId: id },
          select: {
            id: true,
            subject: true,
            sender: true,
            processedAt: true,
            status: true,
            documents: {
              select: {
                id: true,
                originalFilename: true,
                mimeType: true,
                documentType: true,
                status: true,
                contentHash: true,
              },
            },
          },
        }),
      ]);
      const message = messageRes.data;
      const meta = parseMessageMeta(message);
      const labelIds = message.labelIds ?? [];
      const partSummaries = listAttachmentPartSummaries(message);
      const eligible = listEligibleAttachments(message);
      return {
        gmailMessageId: id,
        subject: meta.emailSubject || "(bez předmětu)",
        senderHeader: meta.emailFrom || "(neznámý odesílatel)",
        senderEmail: meta.senderEmail,
        receivedAt: meta.emailReceivedAt.toISOString(),
        labels: {
          raw: labelIds,
          inbox: labelIds.includes("INBOX"),
          unread: labelIds.includes("UNREAD"),
          processed: processedLabelId ? labelIds.includes(processedLabelId) : null,
        },
        matchesCurrentImportQuery: filteredSet.has(id),
        attachmentParts: partSummaries,
        eligibleAttachments: eligible.map((a) => ({
          filename: a.filename,
          mimeType: a.mimeType,
        })),
        database: dbEmail
          ? {
              emailId: dbEmail.id,
              subject: dbEmail.subject,
              sender: dbEmail.sender,
              processedAt: dbEmail.processedAt?.toISOString() ?? null,
              status: dbEmail.status,
              documents: dbEmail.documents,
            }
          : null,
      };
    }),
  );

  return NextResponse.json({
    from,
    currentImportQuery: baseQuery,
    senderSearchQuery: fromQuery,
    filteredSenderSearchQuery: filteredFromQuery,
    senderMessagesFound: fromIds.length,
    filteredSenderMessagesFound: filteredFromIds.length,
    messages,
  });
}
