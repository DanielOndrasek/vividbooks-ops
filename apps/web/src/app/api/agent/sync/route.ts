import { NextResponse } from "next/server";

import { requireAgentOrApprover } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { runInboxSync } from "@/services/inbox-sync";

/**
 * POST /api/agent/sync — „načti poštu teď“ před středečním schvalováním.
 *
 * 1) stáhne z hr@ všechnu nezpracovanou poštu (všechny stránky, ne jen první),
 * 2) ve zbylém čase pustí AI zpracování nových dokladů.
 *
 * Jeden běh se nemusí vejít do limitu funkce (300 s), proto je opakovatelný: agent volá, dokud
 * `done` není true (`remainingMail` i `remainingAi` = 0). Každý běh stáhne vše, co je ve schránce
 * v okamžiku volání (`cutoff`); pošta, která přijde později, se vezme při dalším volání.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAY = 86_400_000;

export async function POST(req: Request) {
  const { response } = await requireAgentOrApprover(req);
  if (response) return response;

  const r = await runInboxSync({ totalBudgetMs: 270_000, mailBudgetMs: 110_000 });

  const failedDocuments = await prisma.document.findMany({
    where: { status: "ERROR", createdAt: { gte: new Date(r.startedAt.getTime() - 7 * DAY) } },
    select: {
      id: true,
      originalFilename: true,
      parseError: true,
      email: { select: { subject: true, senderEmail: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    cutoff: r.startedAt.toISOString(),
    elapsedMs: Date.now() - r.startedAt.getTime(),
    done: r.done,
    remainingMail: r.remainingMail,
    remainingAi: r.remainingAi,
    mail: r.mail
      ? {
          messagesScanned: r.mail.messagesScanned,
          documentsCreated: r.mail.documentsCreated,
          skippedDuplicates: r.mail.skippedDuplicates,
          skippedFiltered: r.mail.skippedFiltered,
          stoppedEarly: r.mail.stoppedEarly,
          stuckMessageIds: r.mail.stuckMessageIds,
          messages: r.mail.perMessage.map((m) => ({
            subject: m.subject,
            senderEmail: m.senderEmail,
            documentsCreated: m.documentsCreated,
            skippedDuplicates: m.skippedDuplicates,
          })),
        }
      : null,
    mailError: r.mailError,
    ai: r.ai
      ? {
          processed: r.ai.processed,
          failed: r.ai.failed,
          stoppedEarly: r.ai.stoppedEarly,
          skippedReason: r.ai.skippedReason ?? null,
        }
      : null,
    aiSkipped: r.aiSkippedForTime ? "málo času po stahování pošty — zavolej znovu" : null,
    aiError: r.aiError,
    /** Doklady za posledních 7 dní, které AI nezpracovala (rozhodne člověk v aplikaci). */
    failedDocuments: failedDocuments.map((d) => ({
      documentId: d.id,
      filename: d.originalFilename,
      subject: d.email.subject,
      senderEmail: d.email.senderEmail,
      error: d.parseError?.slice(0, 300) ?? null,
    })),
  });
}
