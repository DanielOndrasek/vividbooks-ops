import { NextResponse } from "next/server";

import { requireAgentOrApprover } from "@/lib/agent-auth";
import { listInventoryValueSnapshots } from "@/services/inventory/value-snapshot";

export const dynamic = "force-dynamic";

/**
 * GET — měsíční snímky hodnoty skladu (od nejstaršího), pro CRM.
 * Autorizace: `Authorization: Bearer <AGENT_API_TOKEN>` (nebo session ADMIN/APPROVER), jinak 401.
 * Odpověď: [{ month: "2026-10", value, currency, final, computedAt, itemsCount }]
 */
export async function GET(req: Request) {
  const { response } = await requireAgentOrApprover(req);
  if (response) return response;
  return NextResponse.json(await listInventoryValueSnapshots());
}
