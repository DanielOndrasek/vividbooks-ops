import { NextRequest, NextResponse } from "next/server";

import { requireJobRunnerSession } from "@/lib/api-jobs-auth";
import { runInvoiceDbPruneJob } from "@/services/invoice-db-prune";

/**
 * Odstraní z DB schválené faktury s Drive souborem starší než INVOICE_DB_RETENTION_DAYS (výchozí 30).
 * GET — Bearer CRON_SECRET. POST — přihlášený ADMIN nebo APPROVER.
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
    const result = await runInvoiceDbPruneJob();
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
    const result = await runInvoiceDbPruneJob();
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
