/**
 * Hodnota skladu — jediný výpočet pro kartu „Hodnota skladu“ na /inventory
 * i pro měsíční snímky (InventoryValueSnapshot).
 * Hodnota = součet quantity × unitPrice aktivních položek s cenou, po měnách.
 */
export type ValueItem = {
  active: boolean;
  quantity: number;
  unitPrice: number | null;
  currency: string;
};

export type CurrencyValue = {
  currency: string;
  value: number;
  /** Aktivní položky s cenou a kladným stavem. */
  itemsCount: number;
  quantityTotal: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function computeInventoryValue(items: ValueItem[]): CurrencyValue[] {
  const byCcy = new Map<string, CurrencyValue>();
  for (const item of items) {
    if (!item.active || item.unitPrice == null) {
      continue;
    }
    const currency = item.currency || "CZK";
    const row = byCcy.get(currency) ?? { currency, value: 0, itemsCount: 0, quantityTotal: 0 };
    row.value += item.unitPrice * item.quantity;
    if (item.quantity > 0) {
      row.itemsCount += 1;
      row.quantityTotal += item.quantity;
    }
    byCcy.set(currency, row);
  }
  return [...byCcy.values()]
    .map((r) => ({ ...r, value: round2(r.value), quantityTotal: round3(r.quantityTotal) }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function valueByCurrency(items: ValueItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of computeInventoryValue(items)) {
    out[r.currency] = r.value;
  }
  return out;
}
