import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-jobs-auth";
import { runEmailPoll } from "@/services/emailPoll";

/**
 * POST — ruční spuštění (jen ADMIN).
 * GET — pro Vercel Cron / externí scheduler: hlavička Authorization: Bearer CRON_SECRET.
 */
export async function POST() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Povoleno jen administrátorům." }, { status: 403 });
  }
  try {
    const result = await runEmailPoll();
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Neplatný nebo chybějící CRON_SECRET." }, { status: 401 });
  }
  try {
    const result = await runEmailPoll();
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
