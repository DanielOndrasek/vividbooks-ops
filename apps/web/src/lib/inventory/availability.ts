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
    const available = availableOf(item);
    const pieces = available * multiplier;

    let row = groups.get(baseCode);
    if (!row) {
      row = {
        baseCode,
        name: "",
        unit: item.unit || "ks",
        totalPieces: 0,
        components: [],
      };
      groups.set(baseCode, row);
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
