import Link from "next/link";
import { ArrowLeft, Boxes, PackageCheck } from "lucide-react";

import { auth } from "@/auth";
import { InventoryAvailabilityTable } from "@/components/inventory-availability";
import { InventoryShareControl } from "@/components/inventory-share-control";
import { loadAvailability } from "@/lib/inventory/load-availability";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function fmtPieces(n: number): string {
  return n.toLocaleString("cs-CZ", { maximumFractionDigits: 3 });
}

export default async function InventoryAvailabilityPage() {
  const session = await auth();
  const role = session?.user?.role;
  const canWrite = role === "ADMIN" || role === "APPROVER";

  const [{ rows, summary }, shareLink] = await Promise.all([
    loadAvailability(),
    canWrite
      ? prisma.inventoryShareLink.findFirst({
          where: { active: true },
          orderBy: { createdAt: "desc" },
          select: { token: true },
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <Link
          href="/inventory"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden /> Zpět na sklad
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Dostupná zásoba</h1>
        <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">
          Přehled <strong>aktuálně dostupných kusů</strong> (k dispozici po odečtení rezervací), přepočtený na
          základní kusy. Balíky s kódem <code className="bg-muted rounded px-1 py-0.5 text-xs">-C&lt;N&gt;</code>{" "}
          se násobí — např. <code className="bg-muted rounded px-1 py-0.5 text-xs">PF6000-C10</code> = 1 balík ×
          10 = 10 ks, k tomu <code className="bg-muted rounded px-1 py-0.5 text-xs">PF6000</code> = 1 ks → celkem
          11 ks.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="border-border/80 from-card to-muted/20 relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-sm">
          <div className="bg-primary/12 text-primary mb-3 flex size-10 items-center justify-center rounded-xl">
            <Boxes className="size-5" aria-hidden />
          </div>
          <div className="text-muted-foreground text-sm font-medium">Produktů</div>
          <div className="text-foreground mt-1 text-3xl font-semibold tabular-nums tracking-tight">
            {summary.productCount}
          </div>
        </div>
        <div className="border-border/80 from-card to-muted/20 relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-sm">
          <div className="bg-primary/12 text-primary mb-3 flex size-10 items-center justify-center rounded-xl">
            <PackageCheck className="size-5" aria-hidden />
          </div>
          <div className="text-muted-foreground text-sm font-medium">Celkem dostupných kusů</div>
          <div className="text-foreground mt-1 text-3xl font-semibold tabular-nums tracking-tight">
            {fmtPieces(summary.totalPieces)}
          </div>
        </div>
      </section>

      {canWrite && <InventoryShareControl initialToken={shareLink?.token ?? null} />}

      <InventoryAvailabilityTable rows={rows} />
    </div>
  );
}
