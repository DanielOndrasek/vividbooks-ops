import type { InventoryItem, InventoryMovement, User } from "@prisma/client";

import type { InventoryItemDto, InventoryMovementDto } from "@/lib/inventory/types";

type DecimalLike = { toString(): string } | null | undefined;

function toNumber(value: DecimalLike): number {
  if (value == null) {
    return 0;
  }
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

function toNullableNumber(value: DecimalLike): number | null {
  if (value == null) {
    return null;
  }
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

export function toInventoryItemDto(row: InventoryItem): InventoryItemDto {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    unit: row.unit,
    quantity: toNumber(row.quantity),
    minQuantity: toNullableNumber(row.minQuantity),
    unitPrice: toNullableNumber(row.unitPrice),
    currency: row.currency,
    location: row.location,
    supplier: row.supplier,
    note: row.note,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toInventoryMovementDto(
  row: InventoryMovement & {
    item: Pick<InventoryItem, "name" | "sku" | "unit">;
    createdBy: Pick<User, "name" | "email"> | null;
  },
): InventoryMovementDto {
  return {
    id: row.id,
    itemId: row.itemId,
    itemName: row.item.name,
    itemSku: row.item.sku,
    unit: row.item.unit,
    type: row.type,
    quantity: toNumber(row.quantity),
    quantityAfter: toNumber(row.quantityAfter),
    note: row.note,
    createdByName: row.createdBy?.name ?? row.createdBy?.email ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
