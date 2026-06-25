import type { InventoryItemDto } from "@/lib/inventory/types";

/**
 * Rozpoznání balení z kódu položky.
 * Konvence: přípona `-C<N>` (např. `PF6000-C10`) = balík po N kusech.
 * Základní produkt = kód bez této přípony (`PF6000`).
 */
export type PackagingParse = {
  baseCode: string;
  multiplier: number;
  isPack: boolean;
};

const PACK_RE = /[-_ ]C(\d+)(?![A-Za-z0-9])/i;

export function parsePackaging(code: string): PackagingParse {
  const trimmed = (code ?? "").trim();
  const match = trimmed.match(PACK_RE);
  if (match) {
    const multiplier = Number.parseInt(match[1]!, 10);
    if (Number.isFinite(multiplier) && multiplier > 1) {
      const baseCode =
        trimmed.replace(PACK_RE, "").replace(/[-_ ]+$/, "").trim() || trimmed;
      return { baseCode, multiplier, isPack: true };
    }
  }
  return { baseCode: trimmed, multiplier: 1, isPack: false };
}

/**
 * Ruční sloučení produktů, jejichž kód kartonu neodpovídá single variantě
 * (karton má v ext_code „0" navíc — `PMV910` × karton `PMV9100`).
 * Klíč i hodnota jsou základní kódy (bez balení `-C<N>`), velkými písmeny.
 */
const SKU_BASE_ALIASES: Record<string, string> = {
  PMV9100: "PMV910",
  PMV9200: "PMV920",
};

/**
 * Normalizace základního kódu pro seskupení dostupnosti:
 *  - odstraní kolizní příponu „ [FF 12345]" (vzniká při shodě SKU během synchronizace),
 *  - sloučí ručně mapované karton/single varianty (SKU_BASE_ALIASES).
 */
export function normalizeBaseCode(baseCode: string): string {
  const cleaned = baseCode.replace(/\s*\[FF\s+\d+\]\s*$/i, "").trim();
  return SKU_BASE_ALIASES[cleaned.toUpperCase()] ?? cleaned;
}

export type AvailabilityComponent = {
  sku: string;
  name: string;
  /** Dostupné množství dané položky (k dispozici, po rezervacích). */
  available: number;
  multiplier: number;
  /** Přepočet na základní kusy = available × multiplier. */
  pieces: number;
  isPack: boolean;
};

export type AvailabilityRow = {
  baseCode: string;
  name: string;
  unit: string;
  totalPieces: number;
  components: AvailabilityComponent[];
};

/** „K dispozici" = dostupné množství; u ručních položek bez dostupnosti se použije stav. */
function availableOf(item: InventoryItemDto): number {
  return item.availableQuantity != null ? item.availableQuantity : item.quantity;
}

/**
 * Sloučí položky na základní produkt a přepočte dostupnost na kusy
 * (balíky `-C<N>` se násobí N). Bere jen aktivní položky.
 */
export function aggregateAvailability(items: InventoryItemDto[]): AvailabilityRow[] {
  const groups = new Map<string, AvailabilityRow>();

  for (const item of items) {
    if (!item.active) {
      continue;
    }
    const { baseCode, multiplier } = parsePackaging(item.sku);
    const groupKey = normalizeBaseCode(baseCode);
    const available = availableOf(item);
    const pieces = available * multiplier;

    let row = groups.get(groupKey);
    if (!row) {
      row = {
        baseCode: groupKey,
        name: "",
        unit: item.unit || "ks",
        totalPieces: 0,
        components: [],
      };
      groups.set(groupKey, row);
    }
    row.totalPieces += pieces;
    row.components.push({
      sku: item.sku,
      name: item.name,
      available,
      multiplier,
      pieces,
      isPack: multiplier > 1,
    });
  }

  for (const row of groups.values()) {
    const single = row.components.find((c) => c.multiplier === 1);
    row.name = (single ?? row.components[0]!).name;
    row.components.sort((a, b) => a.multiplier - b.multiplier);
  }

  return [...groups.values()].sort((a, b) =>
    a.baseCode.localeCompare(b.baseCode, "cs"),
  );
}

export type AvailabilitySummary = {
  productCount: number;
  totalPieces: number;
};

export function summarizeAvailability(rows: AvailabilityRow[]): AvailabilitySummary {
  return {
    productCount: rows.length,
    totalPieces: rows.reduce((acc, r) => acc + r.totalPieces, 0),
  };
}
