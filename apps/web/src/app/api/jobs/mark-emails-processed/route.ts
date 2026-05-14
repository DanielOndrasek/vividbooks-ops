import { NextRequest, NextResponse } from "next/server";

import { requireJobRunnerSession } from "@/lib/api-jobs-auth";
import { markEmailsAsProcessed } from "@/services/markEmailsAsProcessed";

/**
 * POST – hromadně označí e-maily vyhovující polling dotazu jako „Zpracováno"
 * (přidá štítek a odebere UNREAD) BEZ stahování příloh a zápisu do DB.
 *
 * Body (volitelně JSON):
 *   - `dryRun: boolean`   – jen spočítá, nic neoznačí.
 *   - `maxMessages: number` – strop kolik zpráv označit (default 5 000, max 50 000).
 *
 * Použití: jednorázové „vyčištění" historické pošty po nasazení, aby se do
 * aplikace dále stahovaly jen nové e-maily.
 */
export async function POST(req: NextRequest) {
  const session = await requireJobRunnerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Povoleno jen administrátorům nebo schvalovatelům." },
      { status: 403 },
    );
  }

  let body: { dryRun?: unknown; maxMessages?: unknown } = {};
  try {
    const text = await req.text();
    if (text.trim().length > 0) {
      body = JSON.parse(text) as typeof body;
    }
  } catch {
    return NextResponse.json(
      { error: "Tělo požadavku není platný JSON." },
      { status: 400 },
    );
  }

  const dryRun = body.dryRun === true;
  const maxMessages =
    typeof body.maxMessages === "number" && Number.isFinite(body.maxMessages)
      ? body.maxMessages
      : undefined;

  try {
    const result = await markEmailsAsProcessed({ dryRun, maxMessages });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[mark-emails-processed]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
