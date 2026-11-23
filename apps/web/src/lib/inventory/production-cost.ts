import { prisma } from "@/lib/prisma";

import type { ProductionCostMap } from "./value";

/** Mapa základní SKU → výrobní cena za kus (Kč bez DPH). */
export async function loadProductionCostMap(): Promise<ProductionCostMap> {
  const rows = await prisma.productionCost.findMany({ select: { baseSku: true, unitCost: true } });
  return new Map(rows.map((r) => [r.baseSku, Number(r.unitCost.toString())]));
}
