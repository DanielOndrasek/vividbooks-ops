import { NextRequest, NextResponse } from "next/server";

import { requireJobRunnerSession } from "@/lib/api-jobs-auth";
import { runDocumentExtractionJob } from "@/services/documentExtractionJob";

/**
 * POST — ADMIN nebo APPROVER (session).
 * GET — Bearer CRON_SECRET (např. druhý Vercel cron).
 */
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

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Neplatný nebo chybějící CRON_SECRET." }, { status: 401 });
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
