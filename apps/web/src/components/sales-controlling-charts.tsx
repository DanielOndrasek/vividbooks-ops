"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import type {
  MonthControllingBlock,
  SalesControllingYearBundle,
  YearTotalsByCurrency,
} from "@/lib/sales-controlling/types";

const MONTH_SHORT = [
  "Led",
  "Úno",
  "Bře",
  "Dub",
  "Kvě",
  "Čvn",
  "Čvc",
  "Srp",
  "Zář",
  "Říj",
  "Lis",
  "Pro",
] as const;

const COST_RATIO_WARN_PCT = 30;

function currenciesInBundle(months: MonthControllingBlock[]): string[] {
  const s = new Set<string>();
  for (const m of months) {
    for (const c of Object.keys(m.teamByCurrency)) {
      s.add(c);
    }
  }
  return [...s].sort();
}

function pickDefaultCurrency(ccys: string[]): string {
  if (ccys.includes("CZK")) {
    return "CZK";
  }
  return ccys[0] ?? "CZK";
}

function fmtMoneyFull(n: number): string {
  return n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function axisTickCompact(n: number): string {
  return new Intl.NumberFormat("cs-CZ", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export type MonthlyChartRow = {
  month: number;
  label: string;
  revenue: number;
  commission: number;
  fixed: number;
  totalCost: number;
  net: number;
  costRatioPct: number | null;
};

function buildMonthlyRows(months: MonthControllingBlock[], ccy: string): MonthlyChartRow[] {
  return months.map((block) => {
    const r = block.teamByCurrency[ccy];
    const label = MONTH_SHORT[block.month - 1] ?? String(block.month);
    if (!r) {
      return {
        month: block.month,
        label,
        revenue: 0,
        commission: 0,
        fixed: 0,
        totalCost: 0,
        net: 0,
        costRatioPct: null,
      };
    }
    const totalCost = r.commissionCost + r.fixedCost;
    return {
      month: block.month,
      label,
      revenue: r.revenue,
      commission: r.commissionCost,
      fixed: r.fixedCost,
      totalCost,
      net: r.net,
      costRatioPct: r.costRatio != null ? r.costRatio * 100 : null,
    };
  });
}

function KpiCard({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasize?: "danger" | "success" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card/90 p-4 shadow-sm",
        emphasize === "danger" && "border-red-500/35 bg-red-500/[0.06]",
        emphasize === "success" && "border-emerald-500/30 bg-emerald-500/[0.06]",
      )}
    >
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl",
          emphasize === "danger" && "text-red-700 dark:text-red-300",
          emphasize === "success" && "text-emerald-800 dark:text-emerald-200",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

type Props = {
  bundle: SalesControllingYearBundle;
  yearTotals: YearTotalsByCurrency;
  yearRatio: Record<string, number | null>;
};

export function SalesControllingOverview({ bundle, yearTotals, yearRatio }: Props) {
  const ccys = useMemo(() => {
    const fromTotals = Object.keys(yearTotals).sort();
    if (fromTotals.length > 0) {
      return fromTotals;
    }
    return currenciesInBundle(bundle.months);
  }, [bundle.months, yearTotals]);

  const defaultCcy = useMemo(() => pickDefaultCurrency(ccys), [ccys]);
  const [currencyOverride, setCurrencyOverride] = useState<string | null>(null);

  const safeCurrency =
    currencyOverride != null && ccys.includes(currencyOverride) ? currencyOverride : defaultCcy;

  const rows = useMemo(
    () => buildMonthlyRows(bundle.months, safeCurrency),
    [bundle.months, safeCurrency],
  );

  const totals = yearTotals[safeCurrency];
  const ratio = yearRatio[safeCurrency] ?? null;
  const ratioPct = ratio != null ? ratio * 100 : null;

  const hasAnyMonthData = rows.some((r) => r.revenue > 0 || r.totalCost > 0);

  if (ccys.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed bg-muted/20 px-6 py-10 text-center">
        <p className="text-muted-foreground text-sm">
          Pro grafy zatím nejsou k dispozici žádné měny — po prvním výpočtu provizí nebo doplnění dat se zobrazí přehled.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6" aria-label="Grafy a KPI sales controllingu">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Přehled a grafy</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Metriky podle měny — nesčítáme různé měny dohromady. Grafy používají týmová data z každého měsíce (včetně měsíců
            jen s fixy). <strong>Roční KPI</strong> odpovídají tabulce „Roční souhrn“ — započítávají jen měsíce s načtenými
            provizemi, ne prázdné měsíce pouze s fixními náklady.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Měna pro grafy">
          {ccys.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={c === safeCurrency}
              onClick={() => setCurrencyOverride(c)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                c === safeCurrency
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted/60",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {totals ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Výnos (rok)" value={`${fmtMoneyFull(totals.revenue)} ${safeCurrency}`} />
          <KpiCard
            label="Náklady celkem"
            value={`${fmtMoneyFull(totals.commissionCost + totals.fixedCost)} ${safeCurrency}`}
            hint="Provize + fixní"
          />
          <KpiCard
            label="Čistý"
            value={`${fmtMoneyFull(totals.net)} ${safeCurrency}`}
            emphasize={totals.net < 0 ? "danger" : totals.net > 0 ? "success" : "neutral"}
          />
          <KpiCard
            label="Podíl nákladů"
            value={
              ratioPct != null
                ? `${ratioPct.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`
                : "—"
            }
            hint="Náklady / výnos"
            emphasize={
              ratioPct != null && ratioPct > COST_RATIO_WARN_PCT ? "danger" : "neutral"
            }
          />
        </div>
      ) : null}

      {!hasAnyMonthData ? (
        <p className="text-muted-foreground text-sm">
          Pro měnu {safeCurrency} nejsou v měsících žádná čísla — grafy se doplní po uloženém výpočtu provizí nebo po
          zadání statických dat.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-1 xl:grid-cols-2">
          <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <h3 className="text-foreground text-sm font-semibold">Výnos vs náklady po měsících</h3>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Sloupce: výnos (won) a celkové náklady (provize + fix). Čára: podíl nákladů v % (pravá osa).
            </p>
            <div className="mt-4 h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={axisTickCompact}
                    width={44}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v} %`}
                    width={36}
                    domain={[0, (max: number) => Math.max(35, Math.ceil(max / 5) * 5 + 5)]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "10px",
                      fontSize: "12px",
                      boxShadow: "0 4px 20px oklch(0 0 0 / 0.08)",
                    }}
                    formatter={(value: number | string, name: string) => {
                      const v = typeof value === "number" ? value : Number(value);
                      if (name === "Podíl nákladů") {
                        return [
                          `${v.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`,
                          name,
                        ];
                      }
                      return [`${fmtMoneyFull(v)} ${safeCurrency}`, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
                  <Bar
                    yAxisId="left"
                    dataKey="revenue"
                    name="Výnos"
                    fill="var(--chart-1)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="totalCost"
                    name="Náklady celkem"
                    fill="var(--chart-4)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={28}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="costRatioPct"
                    name="Podíl nákladů"
                    stroke="var(--chart-5)"
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 0 }}
                    connectNulls
                  />
                  <ReferenceLine
                    yAxisId="right"
                    y={COST_RATIO_WARN_PCT}
                    stroke="var(--destructive)"
                    strokeDasharray="5 5"
                    label={{
                      value: "30 %",
                      position: "insideTopRight",
                      fill: "var(--muted-foreground)",
                      fontSize: 10,
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <h3 className="text-foreground text-sm font-semibold">Skladba nákladů (provize + fix)</h3>
            <p className="text-muted-foreground mt-0.5 text-xs">Skládané sloupce podle měsíce — stejná měna.</p>
            <div className="mt-4 h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={axisTickCompact}
                    width={44}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number | string, name: string) => {
                      const v = typeof value === "number" ? value : Number(value);
                      return [`${fmtMoneyFull(v)} ${safeCurrency}`, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
                  <Bar
                    dataKey="commission"
                    stackId="costs"
                    name="Provize"
                    fill="var(--chart-3)"
                    radius={[0, 0, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    dataKey="fixed"
                    stackId="costs"
                    name="Fixní"
                    fill="var(--chart-2)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
