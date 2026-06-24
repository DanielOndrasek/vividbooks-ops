import Link from "next/link";
import { PackageCheck } from "lucide-react";

import { auth } from "@/auth";
import { InventoryClient } from "@/components/inventory-client";
import {
  toInventoryItemDto,
  toInventoryMovementDto,
} from "@/lib/inventory/serialize";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const session = await auth();
  const role = session?.user?.role;
  const canWrite = role === "ADMIN" || role === "APPROVER";

  const [items, movements] = await Promise.all([
    prisma.inventoryItem.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.inventoryMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        item: { select: { name: true, sku: true, unit: true } },
        createdBy: { select: { name: true, email: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight">Skladové zásoby</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Evidence skladových položek, aktuální stav zásob a pohyby (příjem, výdej, korekce). Stav lze stahovat
            z <strong>Fulfillment.cz</strong> (tlačítko Synchronizovat) nebo vést ručně. Položky pod nastaveným
            minimem se zvýrazní, ať víš, co je potřeba doobjednat.
          </p>
        </div>
        <Link
          href="/inventory/availability"
          className="border-border/80 bg-card hover:border-primary/30 hover:bg-muted inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition-colors"
        >
          <PackageCheck className="size-4" aria-hidden />
          Přehled dostupné zásoby
        </Link>
      </header>

      <InventoryClient
        initialItems={items.map(toInventoryItemDto)}
        initialMovements={movements.map(toInventoryMovementDto)}
        canWrite={canWrite}
      />
    </div>
  );
}
