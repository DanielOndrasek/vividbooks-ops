import { NextRequest, NextResponse } from "next/server";

import { requireJobRunnerSession } from "@/lib/api-jobs-auth";
import { runFulfillmentInventorySync } from "@/services/fulfillment/sync-inventory";
import { runInventoryValueSnapshot } from "@/services/inventory/value-snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function run(userId: string | null, source: string) {
  // Nejdřív čerstvá data z Fulfillment.cz; když sync selže, snímek se přesto uloží z posledního stavu.
  const sync = await runFulfillmentInventorySync({ userId });
  const snapshot = await runInventoryValueSnapshot(new Date(), source);
  return NextResponse.json({ syncOk: sync.ok, syncError: sync.ok ? undefined : sync.error, ...snapshot });
}

/** GET — denní GitHub Action (Bearer CRON_SECRET). POST — přihlášený ADMIN/APPROVER. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Neplatný nebo chybějící CRON_SECRET." }, { status: 401 });
  }
  return run(null, "job");
}

export async function POST() {
  const session = await requireJobRunnerSession();
  if (!session) {
    return NextResponse.json({ error: "Povoleno jen administrátorům nebo schvalovatelům." }, { status: 403 });
  }
  return run(session.user.id, "manual");
}
