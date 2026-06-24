import { NextRequest, NextResponse } from "next/server";

import { requireJobRunnerSession } from "@/lib/api-jobs-auth";
import { runFulfillmentInventorySync } from "@/services/fulfillment/sync-inventory";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Synchronizace skladových zásob z Fulfillment.cz do `InventoryItem`.
 * GET — Vercel Cron (Bearer CRON_SECRET). POST — přihlášený ADMIN nebo APPROVER.
 */
export async function POST() {
  const session = await requireJobRunnerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Povoleno jen administrátorům nebo schvalovatelům." },
      { status: 403 },
    );
  }
  const result = await runFulfillmentInventorySync({ userId: session.user.id });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Neplatný nebo chybějící CRON_SECRET." }, { status: 401 });
  }
  const result = await runFulfillmentInventorySync({ userId: null });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
