import { prisma } from "@/lib/prisma";

import {
  aggregateAvailability,
  summarizeAvailability,
  type AvailabilityRow,
  type AvailabilitySummary,
} from "./availability";
import { isExcludedInventoryItem } from "./excluded-codes";
import { toInventoryItemDto } from "./serialize";

/** Načte aktivní (nevyřazené) skladové položky a spočítá přehled dostupné zásoby. */
export async function loadAvailability(): Promise<{
  rows: AvailabilityRow[];
  summary: AvailabilitySummary;
}> {
  const items = await prisma.inventoryItem.findMany({
    where: { active: true },
    orderBy: [{ name: "asc" }],
  });

  const rows = aggregateAvailability(
    items.filter((it) => !isExcludedInventoryItem(it)).map(toInventoryItemDto),
  );

  return { rows, summary: summarizeAvailability(rows) };
}
