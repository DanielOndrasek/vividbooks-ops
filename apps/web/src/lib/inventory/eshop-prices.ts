/**
 * Skladová cena = prodejní cena z e-shopu (rozhodnutí 1. 11. 2026).
 * Čisté funkce bez závislostí (testovatelné přes `node --test`), importy jen relativní.
 *
 * Zdroj: Supabase projekt e-shopu, tabulka public.kv_store_33b2092f, klíč
 * `vividbooks_master_products_v1` → value.products[]. Ceny jsou v Kč S DPH
 * (e-shop zobrazuje ceny včetně DPH, import ze Shoptetu bere PRICE_VAT).
 * Primární je textové pole `price` ("1 190 Kč"), `priceAmount` je záložní (jako v e-shopu product-price.ts).
 */

export type EshopProduct = {
  basecomSku?: string | null;
  shoptetId?: string | null;
  isbn?: string | null;
  price?: unknown;
  priceAmount?: unknown;
};

export type EshopPriceIndex = {
  bySku: Map<string, number>;
  byIsbn: Map<string, number>;
};

export function parsePriceTextToKc(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.max(0, raw) : null;
  }
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (/zdarma/i.test(text)) return 0;
  const compact = text.replace(/\s/g, "");
  if (/^[^\d]*$/.test(compact)) return null;
  const normalized = compact
    .replace(/Kč/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

export function normalizeSku(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

export function normalizeIsbn(v: unknown): string {
  return String(v ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

const PLACEHOLDER_SKUS = new Set(["", "NEW", "NULL", "UNDEFINED", "-", "NONE", "N/A"]);

/** Cena produktu v Kč s DPH; 0 / nesmyslné hodnoty se nepoužijí (0 = nevyplněno). */
export function eshopProductPriceKc(p: EshopProduct): number | null {
  const fromText = parsePriceTextToKc(p.price);
  const kc = fromText ?? parsePriceTextToKc(p.priceAmount);
  return kc !== null && kc > 0 ? kc : null;
}

/** Z `value` záznamu kv_store vytáhne pole produktů (value.products nebo přímo pole). */
export function extractProducts(value: unknown): EshopProduct[] {
  if (Array.isArray(value)) return value as EshopProduct[];
  const products = (value as { products?: unknown } | null)?.products;
  return Array.isArray(products) ? (products as EshopProduct[]) : [];
}

export function buildEshopPriceIndex(products: EshopProduct[]): EshopPriceIndex {
  const bySku = new Map<string, number>();
  const byIsbn = new Map<string, number>();
  for (const p of products) {
    const kc = eshopProductPriceKc(p);
    if (kc === null) continue;
    for (const raw of [p.basecomSku, p.shoptetId]) {
      const sku = normalizeSku(raw);
      if (!PLACEHOLDER_SKUS.has(sku) && !bySku.has(sku)) bySku.set(sku, kc);
    }
    const isbn = normalizeIsbn(p.isbn);
    if (isbn.length >= 10 && !byIsbn.has(isbn)) byIsbn.set(isbn, kc);
  }
  return { bySku, byIsbn };
}

/** Párování: nejdřív SKU (ext_code, code, sku položky), pak ISBN. */
export function lookupEshopPrice(
  index: EshopPriceIndex | null,
  keys: { skus: Array<string | null | undefined>; isbns?: Array<string | null | undefined> },
): number | null {
  if (!index) return null;
  for (const s of keys.skus) {
    const hit = index.bySku.get(normalizeSku(s));
    if (hit !== undefined) return hit;
  }
  for (const i of keys.isbns ?? []) {
    const n = normalizeIsbn(i);
    if (n) {
      const hit = index.byIsbn.get(n);
      if (hit !== undefined) return hit;
    }
  }
  return null;
}

/** Pořadí: e-shop → meta.priceRetail → price_per_unit (Fulfillment, nespolehlivé). */
export function resolveUnitPrice(args: {
  eshop: number | null;
  priceRetail: number | null | undefined;
  pricePerUnit: number | null | undefined;
}): { value: number | null; source: "eshop" | "priceRetail" | "pricePerUnit" | null } {
  if (args.eshop != null) return { value: args.eshop, source: "eshop" };
  if (args.priceRetail != null) return { value: args.priceRetail, source: "priceRetail" };
  if (args.pricePerUnit != null) return { value: args.pricePerUnit, source: "pricePerUnit" };
  return { value: null, source: null };
}
