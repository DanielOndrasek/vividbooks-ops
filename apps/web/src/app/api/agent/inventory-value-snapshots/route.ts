import { NextResponse } from "next/server";

import { requireAgentOrApprover } from "@/lib/agent-auth";
import { listInventoryValueSnapshots } from "@/services/inventory/value-snapshot";

export const dynamic = "force-dynamic";

/**
 * GET — měsíční snímky hodnoty skladu (od nejstaršího), pro CRM.
 * Autorizace: `Authorization: Bearer <AGENT_API_TOKEN>` (nebo session ADMIN/APPROVER), jinak 401.
 * Odpověď: [{ month: "2026-10", value, currency, final, computedAt, itemsCount,
 *   productionCost, unpricedQuantity, quantityPieces }]
 *  - `value` = prodejní hodnota (quantity × prodejní cena z e-shopu s DPH), beze změny,
 *  - `productionCost` = výrobní náklady (kusy × průměrná nákupní cena podle faktur tiskárny, Kč bez DPH),
 *  - `unpricedQuantity` = kusy bez výrobní ceny (neoceněno), `quantityPieces` = kusy celkem (kartony ×N).
 *  Hodnoty jsou u starších snímků `null`, když výrobní náklady nejsou k dispozici.
 */
export async function GET(req: Request) {
  const { response } = await requireAgentOrApprover(req);
  if (response) return response;
  return NextResponse.json(await listInventoryValueSnapshots());
}
