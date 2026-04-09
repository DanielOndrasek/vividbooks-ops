import type { SalesControllingYearBundle } from "@/lib/sales-controlling/types";

/** Prázdná šablona měsíců — po dodání tabulek od obchodu vyplň `teamByCurrency` a `owners` u každého měsíce. */
function emptyYearMonths(): SalesControllingYearBundle["months"] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    missingSnapshot: false,
    teamByCurrency: {},
    owners: [],
  }));
}

/**
 * Ruční doplnění 2023–2025, kde v DB ještě není uložený výpočet z nástroje Provize.
 * Po přepočtu měsíce v Provizích (Pipedrive) má Sales controlling přednost z DB; tento soubor platí jen pro mezery.
 */
export const HISTORICAL_SALES_YEARS: Partial<
  Record<2023 | 2024 | 2025, SalesControllingYearBundle>
> = {
  2023: {
    year: 2023,
    source: "static",
    months: emptyYearMonths(),
  },
  2024: {
    year: 2024,
    source: "static",
    months: emptyYearMonths(),
  },
  2025: {
    year: 2025,
    source: "static",
    months: emptyYearMonths(),
  },
};

export const HISTORICAL_YEARS = [2023, 2024, 2025] as const;

export function getHistoricalYearBundle(y: number): SalesControllingYearBundle | null {
  if (y !== 2023 && y !== 2024 && y !== 2025) {
    return null;
  }
  return HISTORICAL_SALES_YEARS[y] ?? null;
}
