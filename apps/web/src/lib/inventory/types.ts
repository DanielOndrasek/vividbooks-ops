export type StockStatus = "ok" | "low" | "out";

export type InventoryMovementType = "IN" | "OUT" | "ADJUSTMENT";

/** Serializovatelná položka skladu (Decimal → number, Date → ISO string). */
export type InventoryItemDto = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  quantity: number;
  minQuantity: number | null;
  unitPrice: number | null;
  currency: string;
  location: string | null;
  supplier: string | null;
  note: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InventoryMovementDto = {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string;
  unit: string;
  type: InventoryMovementType;
  quantity: number;
  quantityAfter: number;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type InventorySummary = {
  totalItems: number;
  activeItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  /** Celková hodnota skladu po měnách (jen aktivní položky s jednotkovou cenou). */
  valueByCurrency: Record<string, number>;
};

/**
 * Stav zásoby vůči minimu:
 * - `out` — nulová (nebo záporná) zásoba,
 * - `low` — na/pod nastaveným minimem,
 * - `ok` — dostatek.
 */
export function stockStatus(item: {
  quantity: number;
  minQuantity: number | null;
}): StockStatus {
  if (item.quantity <= 0) {
    return "out";
  }
  if (item.minQuantity != null && item.quantity <= item.minQuantity) {
    return "low";
  }
  return "ok";
}

export function buildInventorySummary(items: InventoryItemDto[]): InventorySummary {
  const valueByCurrency: Record<string, number> = {};
  let activeItems = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const item of items) {
    if (!item.active) {
      continue;
    }
    activeItems += 1;

    const status = stockStatus(item);
    if (status === "out") {
      outOfStockCount += 1;
    } else if (status === "low") {
      lowStockCount += 1;
    }

    if (item.unitPrice != null) {
      const ccy = item.currency || "CZK";
      valueByCurrency[ccy] = (valueByCurrency[ccy] ?? 0) + item.unitPrice * item.quantity;
    }
  }

  return {
    totalItems: items.length,
    activeItems,
    lowStockCount,
    outOfStockCount,
    valueByCurrency,
  };
}
