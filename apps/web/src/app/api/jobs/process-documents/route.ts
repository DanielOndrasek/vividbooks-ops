import { NextRequest, NextResponse } from "next/server";

import { requireJobRunnerSession } from "@/lib/api-jobs-auth";
import { runDocumentExtractionJob } from "@/services/documentExtractionJob";
import { runInboxSync } from "@/services/inbox-sync";

/**
 * POST — ADMIN nebo APPROVER (session).
 * GET — Bearer CRON_SECRET (např. druhý Vercel cron).
 *
 * Extrakce je pomalá (dva dotazy na Claude na doklad), proto explicitně maximum, které Hobby plán
 * dovolí. Jeden běh frontu obvykle nevyprázdní — `remaining` v odpovědi říká, kolik ještě zbývá,
 * a workflow „Process documents (AI)“ volá endpoint opakovaně, dokud není nula.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST() {
  const session = await requireJobRunnerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Povoleno jen administrátorům nebo schvalovatelům." },
      { status: 403 },
    );
  }
  try {
    const result = await runDocumentExtractionJob();
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** Vypnutí stahování pošty před AI (GET): PROCESS_DOCUMENTS_FETCH_MAIL=0. */
function fetchMailBeforeAi(): boolean {
  const v = process.env.PROCESS_DOCUMENTS_FETCH_MAIL?.trim().toLowerCase() ?? "";
  return !(v === "0" || v === "false" || v === "off" || v === "no");
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Neplatný nebo chybějící CRON_SECRET." }, { status: 401 });
  }
  try {
    if (!fetchMailBeforeAi()) {
      return NextResponse.json(await runDocumentExtractionJob());
    }
    // Hodinový workflow volá tento endpoint — nejdřív stáhne novou poštu, jinak by čekala na denní
    // cron poll-email (Vercel Hobby = 1× denně). Tvar odpovědi (processed/failed/remaining/
    // skippedReason) zůstává kvůli workflow, pošta je navíc v `mail`.
    const r = await runInboxSync({ totalBudgetMs: 240_000, mailBudgetMs: 60_000 });
    if (r.aiError) {
      return NextResponse.json({ error: r.aiError, mailError: r.mailError }, { status: 500 });
    }
    const ai = r.ai ?? {
      jobId: null,
      candidates: 0,
      processed: 0,
      failed: 0,
      remaining: r.remainingAi,
      stoppedEarly: true,
    };
    // Selhání stahování pošty nesmí projít jako úspěch: AI už v tomto volání proběhla, ale
    // workflow dostane chybový status a běh v GitHub Actions zčervená (jinak by se o výpadku
    // Gmailu nikdo nedozvěděl). Další hodinový běh to zkusí znovu.
    return NextResponse.json({
      ...(r.mailError ? { error: `Stažení pošty selhalo: ${r.mailError}` } : {}),
      ...ai,
      remaining: r.remainingAi,
      mail: r.mail
        ? {
            messagesScanned: r.mail.messagesScanned,
            documentsCreated: r.mail.documentsCreated,
            remainingMail: r.mail.remainingMail,
            stoppedEarly: r.mail.stoppedEarly,
          }
        : null,
      mailError: r.mailError,
    }, { status: r.mailError ? 502 : 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
