import { isExcludedInventoryItem } from "@/lib/inventory/excluded-codes";
import { pragueMonth } from "@/lib/inventory/month";
import { computeInventoryValue } from "@/lib/inventory/value";
import { prisma } from "@/lib/prisma";

export type SnapshotRunResult = {
  month: string;
  written: { currency: string; value: number; itemsCount: number }[];
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
      },
      update: {
        valueTotal: v.value,
        itemsCount: v.itemsCount,
        quantityTotal: v.quantityTotal,
        computedAt: now,
        source,
        final: false,
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
  }));
}
