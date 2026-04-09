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
 * Statická historie 2023–2025 (stejná struktura jako výpočet z DB od roku 2026).
 * Zatím prázdné měsíce — čísla doplníš přímo zde podle tabulek.
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
