/**
 * Kódy produktů, které se NIKDY nesynchronizují z Fulfillment.cz
 * a NIKDY se nezobrazují ve skladu (`/inventory`).
 *
 * Porovnává se na úrovni „základního kódu" (bez přípony balení `-C<N>`)
 * proti více identifikátorům položky:
 *  - `sku` (typicky ext_code, např. `PMV910`, `PM8100`),
 *  - Fulfillment `code` (např. `DS16943130`) — u nasynchronizovaných položek
 *    uložený v `note` jako „Fulfillment kód: …".
 *
 * Díky tomu stačí zadat libovolný z těchto kódů (ext_code i Fulfillment code)
 * a skryjí se obě varianty produktu (základ i balík `-C<N>`).
 */
export const EXCLUDED_INVENTORY_CODES = [
  "PM8200",
  "PM8100",
  "DS16943130",
  "DS16943130-C10",
  "DS28502295",
  "DS28502295-C10",
] as const;

const PACK_RE = /[-_ ]C(\d+)(?![A-Za-z0-9])/i;

/** Základní kód bez přípony balení `-C<N>`, oříznutý a velkými písmeny. */
function baseOf(code: string): string {
  const trimmed = code.trim().toUpperCase();
  return trimmed.replace(PACK_RE, "").replace(/[-_ ]+$/, "").trim() || trimmed;
}

const EXCLUDED_BASES = new Set<string>(
  EXCLUDED_INVENTORY_CODES.map((c) => baseOf(c)),
);

/** Fulfillment kód z note ve tvaru „Fulfillment kód: DS16943130". */
function codeFromNote(note: string | null | undefined): string | null {
  if (!note) {
    return null;
  }
  const match = note.match(/Fulfillment\s+kód:\s*(\S+)/i);
  return match ? match[1] : null;
}

/** True, pokud kterýkoli z předaných kódů (po redukci na základ) patří mezi vyřazené. */
export function isExcludedInventoryCode(
  ...codes: (string | null | undefined)[]
): boolean {
  for (const code of codes) {
    if (code && EXCLUDED_BASES.has(baseOf(code))) {
      return true;
    }
  }
  return false;
}

/** True, pokud má být skladová položka vyřazena (podle SKU i Fulfillment kódu v note). */
export function isExcludedInventoryItem(item: {
  sku?: string | null;
  note?: string | null;
}): boolean {
  return isExcludedInventoryCode(item.sku, codeFromNote(item.note));
}
