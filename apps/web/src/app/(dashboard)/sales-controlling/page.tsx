import { auth } from "@/auth";
import {
  SalesControllingClient,
  type FixedCostItemDto,
} from "@/components/sales-controlling-client";
import { getHistoricalYearBundle } from "@/data/sales-controlling/historical";
import { prisma } from "@/lib/prisma";
import {
  buildYearBundleFromSnapshots,
  emptyMonthBlock,
  sumYearTotals,
} from "@/lib/sales-controlling/metrics";
import type { SalesControllingYearBundle } from "@/lib/sales-controlling/types";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ year?: string }>;
};

function parseYear(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) {
    return new Date().getFullYear();
  }
  return Math.floor(n);
}

export default async function SalesControllingPage({ searchParams }: Props) {
  const sp = await searchParams;
  const year = parseYear(sp.year);
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  const fixedRows = await prisma.salesPersonMonthlyFixed.findMany({
    orderBy: [{ active: "desc" }, { ownerLabel: "asc" }],
  });

  const fixedInitial: FixedCostItemDto[] = fixedRows.map((f) => ({
    id: f.id,
    ownerLabel: f.ownerLabel,
    amount: Number(f.amount),
    currency: f.currency,
    note: f.note,
    active: f.active,
  }));

  let bundle;
  if (year >= 2026) {
    const snapshots = await prisma.commissionMonthSnapshot.findMany({
      where: { year },
      orderBy: { month: "asc" },
      select: { month: true, payload: true },
    });
    bundle = buildYearBundleFromSnapshots(year, snapshots, fixedRows);
  } else {
    const hist = getHistoricalYearBundle(year);
    const fallback: SalesControllingYearBundle = {
      year,
      source: "static",
      months: Array.from({ length: 12 }, (_, i) => emptyMonthBlock(i + 1)),
    };
    bundle = hist ?? fallback;
  }

  const yearTotals = sumYearTotals(bundle.months);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales controlling</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-relaxed">
          <strong>Výnos</strong> = součet hodnoty všech won dealů v kalendářním měsíci (
          <code>won_time</code>). <strong>Náklady na provize</strong> ze započtených dealů (nástroj Provize).{" "}
          <strong>Fixní odměny</strong> se nastavují níže (admin) a počítají se každý měsíc znovu. Metriky jsou
          vždy <strong>po měnách</strong> — nesčítáme různé měny do jedné částky.
        </p>
        {bundle.source === "static" && (
          <p className="text-muted-foreground mt-2 text-sm">
            Rok {year}: data ze statického souboru — doplníš čísla v{" "}
            <code className="bg-muted rounded px-1">src/data/sales-controlling/historical.ts</code>.
          </p>
        )}
      </div>

      <SalesControllingClient
        bundle={bundle}
        yearTotals={yearTotals}
        isAdmin={isAdmin}
        fixedInitial={fixedInitial}
      />
    </div>
  );
}
