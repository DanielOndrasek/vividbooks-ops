import { auth } from "@/auth";
import {
  SalesControllingClient,
  type FixedCostItemDto,
} from "@/components/sales-controlling-client";
import { getHistoricalYearBundle } from "@/data/sales-controlling/historical";
import { prisma } from "@/lib/prisma";
import {
  buildSalesControllingYearBundle,
  emptyMonthBlock,
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
    where: { year },
    orderBy: [{ active: "desc" }, { ownerLabel: "asc" }],
  });

  const fixedInitial: FixedCostItemDto[] = fixedRows.map((f) => ({
    id: f.id,
    year: f.year,
    ownerLabel: f.ownerLabel,
    amount: Number(f.amount),
    currency: f.currency,
    note: f.note,
    active: f.active,
  }));

  const snapshots = await prisma.commissionMonthSnapshot.findMany({
    where: { year },
    orderBy: { month: "asc" },
    select: { month: true, payload: true },
  });

  const staticTemplate: SalesControllingYearBundle | null =
    year < 2026
      ? (getHistoricalYearBundle(year) ?? {
          year,
          source: "static",
          months: Array.from({ length: 12 }, (_, i) => emptyMonthBlock(i + 1)),
        })
      : null;

  const bundle = buildSalesControllingYearBundle(year, snapshots, fixedRows, staticTemplate);

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">Sales controlling</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Přehled výnosů z won dealů, nákladů na provize a fixních odměn — přehledně po měnách a měsících.
        </p>
        <details className="group mt-4">
          <summary className="text-primary cursor-pointer text-sm font-medium hover:underline">
            Jak se metriky počítají
          </summary>
          <div className="text-muted-foreground mt-3 space-y-2 border-l-2 border-primary/25 pl-4 text-sm leading-relaxed">
            <p>
              <strong>Výnos</strong> = součet hodnoty všech won dealů v kalendářním měsíci (
              <code className="bg-muted rounded px-1 py-0.5 text-xs">won_time</code>).{" "}
              <strong>Náklady na provize</strong> ze započtených dealů (nástroj Provize).{" "}
              <strong>Fixní odměny</strong> nastaví admin <strong>pro každý rok zvlášť</strong> a v každém měsíci se
              započítají znovu.
            </p>
            <p>
              Čísla jsou <strong>vždy po měnách</strong> — různé měny se nesčítají do jedné částky. Grafy a KPI vždy
              ukazují jednu zvolenou měnu najednou.
            </p>
            <p>
              U let <strong>2023–2025</strong> se výnosy a provize načítají z <strong>uložených výpočtů</strong> v nástroji
              Provize (stejná DB jako u roku 2026+), pokud jsi daný měsíc přepočítal. Chybějící měsíce můžeš doplnit ručně
              v{" "}
              <code className="bg-muted rounded px-1 py-0.5 text-xs">src/data/sales-controlling/historical.ts</code>.
            </p>
            {bundle.source === "static" && (
              <p>
                Rok {year}: zatím žádné uložené výpočty z Provizí — zobrazuje se jen šablona / fixní náklady. Po prvním
                přepočtu měsíce v Provizích se data objeví i zde.
              </p>
            )}
          </div>
        </details>
      </header>

      <SalesControllingClient
        bundle={bundle}
        isAdmin={isAdmin}
        fixedCostsYear={year}
        fixedInitial={fixedInitial}
      />
    </div>
  );
}
