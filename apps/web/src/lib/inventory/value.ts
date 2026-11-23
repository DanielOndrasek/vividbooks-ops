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

/* ------------------------------------------------------------------------- *
 * Výrobní náklady (druhá hodnota skladu)
 * Kusy × průměrná nákupní cena za kus (faktury tiskárny, bez DPH). Cena se drží
 * po základním SKU (tabulka ProductionCost), balení `-C<N>` = N kusů.
 * ------------------------------------------------------------------------- */

const PACK_SUFFIX_RE = /[-_ ]C(\d+)$/i;
/** Kód z Fulfillmentu se u 9. ročníku PMV liší od kódu e-shopu (PMV9100 → PMV910). */
const BASE_SKU_ALIASES: Record<string, string> = { PMV9100: "PMV910", PMV9200: "PMV920" };

/** Základní SKU (bez „[FF …]“ a bez přípony balení) a počet kusů v jedné skladové položce. */
export function parseSku(sku: string): { baseSku: string; packSize: number } {
  let s = sku.replace(/\s*\[[^\]]*\]\s*$/, "").trim().toUpperCase();
  let packSize = 1;
  const m = s.match(PACK_SUFFIX_RE);
  if (m) {
    packSize = Math.max(1, Number(m[1]));
    s = s.slice(0, m.index).trim();
  }
  return { baseSku: BASE_SKU_ALIASES[s] ?? s, packSize };
}

export type ProductionCostMap = ReadonlyMap<string, number>;

export type ProductionCostItem = {
  active: boolean;
  /** Stav v jednotkách položky (u `-C10` počet kartonů). */
  quantity: number;
  /** Kusů v jedné jednotce položky (1 nebo N z `-C<N>`). */
  packSize: number;
  /** Výrobní cena za 1 kus (Kč bez DPH) nebo null, když cena není známá. */
  productionUnitCost: number | null;
};

export type ProductionCostResult = {
  /** Součet kusy × výrobní cena za kus (Kč bez DPH). */
  value: number;
  /** Kusy s výrobní cenou. */
  pricedQuantity: number;
  /** Kusy bez výrobní ceny (neoceněno, do hodnoty se nepočítají). */
  unpricedQuantity: number;
};

export function productionUnitCostOf(sku: string, costs: ProductionCostMap): number | null {
  const c = costs.get(parseSku(sku).baseSku);
  return c == null ? null : c;
}

export function computeProductionCost(items: ProductionCostItem[]): ProductionCostResult {
  let value = 0;
  let priced = 0;
  let unpriced = 0;
  for (const item of items) {
    if (!item.active || item.quantity <= 0) {
      continue;
    }
    const pieces = item.quantity * item.packSize;
    if (item.productionUnitCost == null) {
      unpriced += pieces;
    } else {
      value += pieces * item.productionUnitCost;
      priced += pieces;
    }
  }
  return { value: round2(value), pricedQuantity: round3(priced), unpricedQuantity: round3(unpriced) };
}
