import { notFound } from "next/navigation";
import { PackageCheck } from "lucide-react";

import { InventoryAvailabilityTable } from "@/components/inventory-availability";
import { InventoryLowStock } from "@/components/inventory-low-stock";
import { loadAvailability } from "@/lib/inventory/load-availability";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PublicAvailabilityPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const link = await prisma.inventoryShareLink.findFirst({
    where: { token, active: true },
    select: { id: true },
  });
  if (!link) {
    notFound();
  }

  const { rows } = await loadAvailability();

  return (
    <div className="from-background via-background to-muted/30 min-h-screen bg-gradient-to-b">
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="space-y-8">
          <header className="space-y-3">
            <div className="text-primary inline-flex items-center gap-2 text-sm font-medium">
              <PackageCheck className="size-4" aria-hidden />
              Vividbooks — sklad
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Dostupná zásoba</h1>
            <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">
              Veřejný přehled <strong>aktuálně dostupných kusů</strong> (k dispozici po odečtení rezervací),
              přepočtený na základní kusy. Balíky s kódem{" "}
              <code className="bg-muted rounded px-1 py-0.5 text-xs">-C&lt;N&gt;</code> se násobí.
            </p>
          </header>

          <InventoryLowStock rows={rows} />

          <InventoryAvailabilityTable rows={rows} />
        </div>
      </main>
    </div>
  );
}
