import { NextResponse } from "next/server";

import { requireRoles, requireSession } from "@/lib/api-session";
import { writeAuditLog } from "@/lib/audit";
import { runFulfillmentInventorySync } from "@/services/fulfillment/sync-inventory";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  const denied = requireRoles(session!, ["ADMIN", "APPROVER"]);
  if (denied) {
    return denied;
  }

  const result = await runFulfillmentInventorySync({ userId: session!.user.id });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Synchronizace selhala." }, { status: 502 });
  }

  await writeAuditLog({
    entityType: "InventoryItem",
    entityId: "fulfillment-sync",
    action: "synced",
    userId: session!.user.id,
    metadata: {
      fetchedVariants: result.fetchedVariants,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
    },
  });

  return NextResponse.json(result);
}
