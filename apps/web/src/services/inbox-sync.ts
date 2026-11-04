/**
 * „Načti poštu a zpracuj ji“ v jednom běhu funkce: nejdřív Gmail (všechny stránky), ve zbylém čase AI.
 * Používá agentní `POST /api/agent/sync` (před středečním schvalováním) i hodinový
 * `GET /api/jobs/process-documents` (GitHub Actions), aby pošta nečekala na denní cron.
 */

import { queueCount, runDocumentExtractionJob } from "@/services/documentExtractionJob";
import { runEmailPoll } from "@/services/emailPoll";

/** Méně času než na pár dokladů (~20 s každý) AI nespouštět, zbytek dokončí další volání. */
const MIN_AI_BUDGET_MS = 45_000;

export type InboxSyncResult = {
  startedAt: Date;
  mail: Awaited<ReturnType<typeof runEmailPoll>> | null;
  mailError: string | null;
  ai: Awaited<ReturnType<typeof runDocumentExtractionJob>> | null;
  aiError: string | null;
  /** AI se nespustila, protože po stahování pošty nezbyl čas. */
  aiSkippedForTime: boolean;
  remainingMail: number | null;
  remainingAi: number;
  done: boolean;
};

export async function runInboxSync(opts: {
  /** Celkový čas běhu (s rezervou pod limitem funkce 300 s). */
  totalBudgetMs: number;
  /** Strop pro stahování pošty; zbytek dostane AI. */
  mailBudgetMs: number;
}): Promise<InboxSyncResult> {
  const startedAt = new Date();
  const t0 = startedAt.getTime();

  let mail: InboxSyncResult["mail"] = null;
  let mailError: string | null = null;
  try {
    mail = await runEmailPoll({ budgetMs: opts.mailBudgetMs });
  } catch (e) {
    mailError = e instanceof Error ? e.message : String(e);
  }

  let ai: InboxSyncResult["ai"] = null;
  let aiError: string | null = null;
  const aiBudget = opts.totalBudgetMs - (Date.now() - t0);
  const aiSkippedForTime = aiBudget < MIN_AI_BUDGET_MS;
  if (!aiSkippedForTime) {
    try {
      ai = await runDocumentExtractionJob({ budgetMs: aiBudget });
    } catch (e) {
      aiError = e instanceof Error ? e.message : String(e);
    }
  }

  const remainingAi = ai?.remaining ?? (await queueCount());
  const remainingMail = mail ? mail.remainingMail : null;
  const done =
    !mailError &&
    !aiError &&
    remainingMail === 0 &&
    remainingAi === 0 &&
    ai?.skippedReason !== "already_running";

  return { startedAt, mail, mailError, ai, aiError, aiSkippedForTime, remainingMail, remainingAi, done };
}
