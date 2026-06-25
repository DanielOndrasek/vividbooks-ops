import type { Prisma } from "@prisma/client";

/**
 * Kódy produktů, které se NIKDY nesynchronizují z Fulfillment.cz
 * a NIKDY se nezobrazují ve skladu (`/inventory`).
 *
 * Porovnává se proti `code` i `ext_code` (tj. i proti uloženému SKU),
 * po ořezu mezer a bez ohledu na velikost písmen.
 */
export const EXCLUDED_INVENTORY_CODES = [
  "PM8200",
  "PM8100",
  "DS16943130",
  "DS16943130-C10",
  "DS28502295",
  "DS28502295-C10",
] as const;

const EXCLUDED_SET = new Set<string>(
  EXCLUDED_INVENTORY_CODES.map((c) => c.trim().toUpperCase()),
);

/** True, pokud kterýkoli z předaných kódů patří mezi vyřazené. */
export function isExcludedInventoryCode(
  ...codes: (string | null | undefined)[]
): boolean {
  for (const code of codes) {
    if (code && EXCLUDED_SET.has(code.trim().toUpperCase())) {
      return true;
    }
  }
  return false;
}

/** Prisma filtr: skladová položka s vyřazeným SKU se nikdy nevrací. */
export const excludedInventoryItemWhere: Prisma.InventoryItemWhereInput = {
  sku: { notIn: [...EXCLUDED_INVENTORY_CODES] },
};

/** Prisma filtr: pohyby vyřazených položek se nikdy nevracejí. */
export const excludedInventoryMovementWhere: Prisma.InventoryMovementWhereInput =
  {
    item: { sku: { notIn: [...EXCLUDED_INVENTORY_CODES] } },
  };
