import { isExcludedInventoryItem } from "@/lib/inventory/excluded-codes";
import { pragueMonth } from "@/lib/inventory/month";
import { loadProductionCostMap } from "@/lib/inventory/production-cost";
import { computeInventoryValue, computeProductionCost, parseSku } from "@/lib/inventory/value";
import { prisma } from "@/lib/prisma";

export type SnapshotRunResult = {
  month: string;
  written: { currency: string; value: number; itemsCount: number }[];
  productionCost: { value: number; unpricedQuantity: number; quantityPieces: number };
  finalizedMonths: number;
};

/**
 * Upsertuje snímek aktuálního měsíce (Europe/Prague) a uzavře (`final = true`) všechny starší měsíce.
 * Idempotentní — denní běh přepisuje hodnotu aktuálního měsíce; výpadek posledního dne nevadí,
 * zůstane poslední známá hodnota.
 */
export async function runInventoryValueSnapshot(
  now: Date = new Date(),
  source = "job",
): Promise<SnapshotRunResult> {
  const month = pragueMonth(now);

  const rows = await prisma.inventoryItem.findMany({
    where: { active: true },
    select: { sku: true, note: true, active: true, quantity: true, unitPrice: true, currency: true },
  });
  const items = rows
    .filter((r) => !isExcludedInventoryItem(r))
    .map((r) => ({
      active: r.active,
      quantity: Number(r.quantity),
      unitPrice: r.unitPrice == null ? null : Number(r.unitPrice),
      currency: r.currency,
    }));
  const values = computeInventoryValue(items);

  // Výrobní náklady (Kč bez DPH) — stejné položky jako prodejní hodnota, kusy včetně kartonů ×N.
  const costs = await loadProductionCostMap();
  const prodItems = rows
    .filter((r) => !isExcludedInventoryItem(r) && r.currency === "CZK")
    .map((r) => {
      const { baseSku, packSize } = parseSku(r.sku);
      return {
        active: r.active,
        quantity: Number(r.quantity),
        packSize,
        productionUnitCost: costs.get(baseSku) ?? null,
      };
    });
  const production = computeProductionCost(prodItems);
  const pieces = production.pricedQuantity + production.unpricedQuantity;
  const prodFields = (currency: string) =>
    currency === "CZK"
      ? {
          valueProductionCost: production.value,
          unpricedQuantity: production.unpricedQuantity,
          quantityPieces: pieces,
        }
      : {};

  for (const v of values) {
    await prisma.inventoryValueSnapshot.upsert({
      where: { month_currency: { month, currency: v.currency } },
      create: {
        month,
        currency: v.currency,
        valueTotal: v.value,
        itemsCount: v.itemsCount,
        quantityTotal: v.quantityTotal,
        computedAt: now,
        source,
        ...prodFields(v.currency),
      },
      update: {
        valueTotal: v.value,
        itemsCount: v.itemsCount,
        quantityTotal: v.quantityTotal,
        computedAt: now,
        source,
        final: false,
        ...prodFields(v.currency),
      },
    });
  }

  const closed = await prisma.inventoryValueSnapshot.updateMany({
    where: { month: { lt: month }, final: false },
    data: { final: true },
  });

  return {
    month,
    written: values.map((v) => ({ currency: v.currency, value: v.value, itemsCount: v.itemsCount })),
    productionCost: {
      value: production.value,
      unpricedQuantity: production.unpricedQuantity,
      quantityPieces: pieces,
    },
    finalizedMonths: closed.count,
  };
}

export type SnapshotDto = {
  month: string;
  value: number;
  currency: string;
  final: boolean;
  computedAt: string;
  itemsCount: number;
  /** Výrobní náklady (Kč bez DPH): kusy × průměrná nákupní cena; null = snímek bez výrobních nákladů. */
  productionCost: number | null;
  /** Kusy bez výrobní ceny (neoceněno); null = neznámo. */
  unpricedQuantity: number | null;
  /** Celkem kusů (kartony přepočtené na kusy); null = neznámo. */
  quantityPieces: number | null;
};

export async function listInventoryValueSnapshots(): Promise<SnapshotDto[]> {
  const rows = await prisma.inventoryValueSnapshot.findMany({
    orderBy: [{ month: "asc" }, { currency: "asc" }],
  });
  return rows.map((r) => ({
    month: r.month,
    value: Number(r.valueTotal),
    currency: r.currency,
    final: r.final,
    computedAt: r.computedAt.toISOString(),
    itemsCount: r.itemsCount,
    productionCost: r.valueProductionCost == null ? null : Number(r.valueProductionCost),
    unpricedQuantity: r.unpricedQuantity == null ? null : Number(r.unpricedQuantity),
    quantityPieces: r.quantityPieces == null ? null : Number(r.quantityPieces),
  }));
}
