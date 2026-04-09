"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, ChevronDown } from "lucide-react";

import { SalesControllingOverview } from "@/components/sales-controlling-charts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  CurrencyControllingRow,
  MonthControllingBlock,
  SalesControllingYearBundle,
  YearTotalsByCurrency,
} from "@/lib/sales-controlling/types";
import { yearTotalsCostRatio } from "@/lib/sales-controlling/metrics";

function fmtMoney(n: number): string {
  return n.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(ratio: number | null): string {
  if (ratio == null) {
    return "—";
  }
  return `${(ratio * 100).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`;
}

/** Podíl nákladů (provize + fix) / výnos — nad prahem zvýrazníme buňku. */
const COST_RATIO_WARN = 0.3;

function costRatioCellClass(ratio: number | null): string {
  if (ratio != null && ratio > COST_RATIO_WARN) {
    return "bg-red-500/25 font-medium text-red-950 dark:bg-red-950/55 dark:text-red-100";
  }
  return "";
}

const MONTH_NAMES_CS = [
  "Leden",
  "Únor",
  "Březen",
  "Duben",
  "Květen",
  "Červen",
  "Červenec",
  "Srpen",
  "Září",
  "Říjen",
  "Listopad",
  "Prosinec",
] as const;

function PanelCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
      <div className="border-b border-border/60 bg-muted/30 px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? <div className="text-muted-foreground mt-1 text-sm leading-relaxed">{description}</div> : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function CurrencyBlock({
  title,
  rows,
}: {
  title: string;
  rows: Record<string, CurrencyControllingRow>;
}) {
  const ccys = Object.keys(rows).sort();
  if (ccys.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {title}: žádná data (0 měn).
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {title ? (
        <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">{title}</p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/45">
              <th className="text-muted-foreground px-3 py-2.5 text-xs font-semibold tracking-wide">Měna</th>
              <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide">
                Výnos (won)
              </th>
              <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide">
                Provize
              </th>
              <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide">
                Fixní
              </th>
              <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide">
                Celkem nákl.
              </th>
              <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide">
                Čistý
              </th>
              <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide">
                Nákl./výnos
              </th>
            </tr>
          </thead>
          <tbody>
            {ccys.map((ccy) => {
              const r = rows[ccy]!;
              const totalCost = r.commissionCost + r.fixedCost;
              return (
                <tr
                  key={ccy}
                  className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/35"
                >
                  <td className="px-3 py-2.5 font-mono text-xs font-medium">{ccy}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(r.revenue)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(r.commissionCost)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(r.fixedCost)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(totalCost)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(r.net)}</td>
                  <td className={cn("px-3 py-2.5 text-right tabular-nums", costRatioCellClass(r.costRatio))}>
                    {fmtPct(r.costRatio)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonthSection({ block }: { block: MonthControllingBlock }) {
  const monthName = MONTH_NAMES_CS[block.month - 1] ?? `Měsíc ${block.month}`;
  const hasMetrics =
    Object.keys(block.teamByCurrency).length > 0 || block.owners.length > 0;
  return (
    <details className="group rounded-xl border border-border/80 bg-card shadow-sm transition-shadow open:shadow-md">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className="bg-primary/12 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums">
            {block.month}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{monthName}</span>
            <span className="text-muted-foreground text-xs">
              {String(block.month).padStart(2, "0")}. měsíc
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {block.missingSnapshot ? (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-200">
              Bez provizí
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-xs font-medium text-emerald-900 dark:text-emerald-200">
              S provizemi
            </span>
          )}
          <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-4 border-t border-border/60 px-4 py-4 sm:px-5 sm:py-5">
        {block.missingSnapshot && (
          <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2.5 text-sm text-amber-950 dark:text-amber-100">
            Bez uloženého výpočtu z <strong>Provize</strong> nejsou výnosy ani náklady na provize z Pipedrive.
            {hasMetrics ? (
              <>
                {" "}
                Níže jsou aspoň <strong>fixní měsíční náklady</strong> (tým + obchodníci). Po přepočtu provizí se
                doplní celý obrázek.
              </>
            ) : (
              <> Nastav fixní odměny níže nebo spusť výpočet provizí pro tento měsíc.</>
            )}
          </p>
        )}
        {hasMetrics ? (
          <>
            <CurrencyBlock title="Tým (všichni won v měsíci)" rows={block.teamByCurrency} />
            {block.owners.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Obchodníci</p>
                {block.owners.map((o) => (
                  <div
                    key={o.ownerLabel}
                    className="rounded-xl border border-border/70 bg-muted/15 p-3 sm:p-4"
                  >
                    <p className="mb-3 text-sm font-semibold">{o.ownerLabel}</p>
                    <CurrencyBlock title="" rows={o.byCurrency} />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          !block.missingSnapshot && (
            <p className="text-muted-foreground text-sm">Žádná data pro tento měsíc.</p>
          )
        )}
      </div>
    </details>
  );
}

export type FixedCostItemDto = {
  id: string;
  year: number;
  ownerLabel: string;
  amount: number;
  currency: string;
  note: string | null;
  active: boolean;
};

export function SalesControllingClient({
  bundle,
  yearTotals,
  isAdmin,
  fixedCostsYear,
  fixedInitial,
}: {
  bundle: SalesControllingYearBundle;
  yearTotals: YearTotalsByCurrency;
  isAdmin: boolean;
  fixedCostsYear: number;
  fixedInitial: FixedCostItemDto[];
}) {
  const yearRatio = useMemo(() => yearTotalsCostRatio(yearTotals), [yearTotals]);
  const totalCcys = Object.keys(yearTotals).sort();

  return (
    <div className="space-y-10 pb-4">
      <div className="flex flex-col gap-5 rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-4">
          <div className="bg-primary/12 text-primary flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-inner">
            <BarChart3 className="size-6" aria-hidden />
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Přehled roku</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">{bundle.year}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {bundle.source === "database"
                ? "Provize z DB + fixní odměny pro tento rok"
                : "Statická data (historie) + fixní odměny"}
            </p>
          </div>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-3 border-t border-border/60 pt-4 sm:border-t-0 sm:pt-0">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground text-xs font-medium">Změnit rok</span>
            <select
              name="year"
              defaultValue={bundle.year}
              className="border-input bg-background focus-visible:ring-ring h-9 min-w-[10rem] rounded-lg border px-3 py-1.5 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <option value={2023}>2023 — historie</option>
              <option value={2024}>2024 — historie</option>
              <option value={2025}>2025 — historie</option>
              {Array.from({ length: 2031 - 2026 }, (_, i) => 2026 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" className="h-9">
            Načíst
          </Button>
        </form>
      </div>

      <SalesControllingOverview bundle={bundle} yearTotals={yearTotals} yearRatio={yearRatio} />

      <PanelCard
        title="Roční souhrn (tým)"
        description={
          <>
            Součty jen z měsíců, kde jsou načtené provize (uložený výpočet / vyplněná historie). Fixní náklady se do ročního součtu započítají jen v těchto měsících — měsíce „jen fix“ bez provizí v souhrnu nejsou. Sloupec{" "}
            <strong>Celkem náklady</strong> = provize + fix. Buňka <strong>Nákl./výnos</strong> je zvýrazněná červeně nad
            30 %.
          </>
        }
      >
        {totalCcys.length === 0 ? (
          <p className="text-muted-foreground text-sm">Žádná agregovaná data pro tento rok.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/45">
                  <th className="text-muted-foreground px-3 py-2.5 text-xs font-semibold tracking-wide">Měna</th>
                  <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide">
                    Výnos
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide">
                    Provize
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide">
                    Fixní
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide">
                    Celkem nákl.
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide">
                    Čistý
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide">
                    Nákl./výnos
                  </th>
                </tr>
              </thead>
              <tbody>
                {totalCcys.map((ccy) => {
                  const t = yearTotals[ccy]!;
                  const ratio = yearRatio[ccy] ?? null;
                  const totalCost = t.commissionCost + t.fixedCost;
                  return (
                    <tr
                      key={ccy}
                      className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/35"
                    >
                      <td className="px-3 py-2.5 font-mono text-xs font-medium">{ccy}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(t.revenue)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(t.commissionCost)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(t.fixedCost)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(totalCost)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(t.net)}</td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums", costRatioCellClass(ratio))}>
                        {fmtPct(ratio)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Měsíční detail</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Rozklikni měsíc pro tým a jednotlivé obchodníky. Stav „S provizemi“ znamená uložený výpočet v nástroji Provize.
          </p>
        </div>
        <div className="space-y-2.5">
          {bundle.months.map((m) => (
            <MonthSection key={m.month} block={m} />
          ))}
        </div>
      </section>

      {isAdmin && (
        <FixedCostsAdminPanel key={fixedCostsYear} fixedCostsYear={fixedCostsYear} initialItems={fixedInitial} />
      )}
    </div>
  );
}

function FixedCostsAdminPanel({
  fixedCostsYear,
  initialItems,
}: {
  fixedCostsYear: number;
  initialItems: FixedCostItemDto[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ownerLabel, setOwnerLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("CZK");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOwner, setEditOwner] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState("CZK");
  const [editNote, setEditNote] = useState("");

  function startEdit(row: FixedCostItemDto) {
    setEditingId(row.id);
    setEditOwner(row.ownerLabel);
    setEditAmount(String(row.amount));
    setEditCurrency(row.currency);
    setEditNote(row.note ?? "");
    setMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function refreshListAndPage() {
    const res = await fetch(
      `/api/sales-controlling/fixed-costs?year=${encodeURIComponent(String(fixedCostsYear))}`,
      { cache: "no-store" },
    );
    const j = (await res.json()) as { items?: FixedCostItemDto[] };
    if (res.ok && j.items) {
      setItems(j.items);
    }
    router.refresh();
  }

  async function addRow(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const a = Number(amount.replace(",", "."));
      if (!ownerLabel.trim() || !Number.isFinite(a)) {
        setMsg("Vyplň jméno a částku.");
        return;
      }
      const res = await fetch("/api/sales-controlling/fixed-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: fixedCostsYear,
          ownerLabel: ownerLabel.trim(),
          amount: a,
          currency: currency.trim() || "CZK",
          note: note.trim() || null,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(j.error || "Chyba");
        return;
      }
      setOwnerLabel("");
      setAmount("");
      setNote("");
      await refreshListAndPage();
      setMsg("Přidáno. Tabulky výše se přenačetly.");
    } finally {
      setLoading(false);
    }
  }

  async function saveEdit(id: string) {
    setLoading(true);
    setMsg(null);
    try {
      const a = Number(editAmount.replace(",", "."));
      if (!editOwner.trim() || !Number.isFinite(a)) {
        setMsg("U úpravy vyplň jméno a částku.");
        return;
      }
      const res = await fetch(`/api/sales-controlling/fixed-costs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerLabel: editOwner.trim(),
          amount: a,
          currency: editCurrency.trim() || "CZK",
          note: editNote.trim() || null,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(j.error || "Chyba");
        return;
      }
      setEditingId(null);
      await refreshListAndPage();
      setMsg("Uloženo. Tabulky výše se přenačetly.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(id: string, active: boolean) {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/sales-controlling/fixed-costs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setMsg(j.error || "Chyba");
        return;
      }
      await refreshListAndPage();
    } finally {
      setLoading(false);
    }
  }

  async function removeRow(id: string) {
    if (!window.confirm("Smazat tuto fixní odměnu?")) {
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/sales-controlling/fixed-costs/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setMsg(j.error || "Chyba");
        return;
      }
      if (editingId === id) {
        setEditingId(null);
      }
      await refreshListAndPage();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-dashed border-primary/25 bg-muted/15 p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Fixní měsíční odměny (admin)</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Platí pro <strong>rok {fixedCostsYear}</strong> — jiný rok vyber v přehledu výše. Jméno v poli{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">Obchodník</code> se páruje s Pipedrive / provizemi
          (normalizace mezer a písmen). Po uložení se přenačtou tabulky a grafy.
        </p>
      </div>
      {msg && (
        <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">{msg}</p>
      )}
      <form onSubmit={(e) => void addRow(e)} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Obchodník</span>
          <input
            className="border-input bg-background min-w-[12rem] rounded-md border px-3 py-2"
            value={ownerLabel}
            onChange={(e) => setOwnerLabel(e.target.value)}
            placeholder="Jméno jako v Pipedrive"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Částka / měsíc</span>
          <input
            className="border-input bg-background w-28 rounded-md border px-3 py-2"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Měna</span>
          <input
            className="border-input bg-background w-20 rounded-md border px-3 py-2"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </label>
        <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Poznámka</span>
          <input
            className="border-input bg-background rounded-md border px-3 py-2"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={loading}>
          Přidat
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/45">
              <th className="text-muted-foreground px-3 py-2.5 text-xs font-semibold">Obchodník</th>
              <th className="text-muted-foreground px-3 py-2.5 text-xs font-semibold">Částka</th>
              <th className="text-muted-foreground px-3 py-2.5 text-xs font-semibold">Měna</th>
              <th className="text-muted-foreground px-3 py-2.5 text-xs font-semibold">Poznámka</th>
              <th className="text-muted-foreground px-3 py-2.5 text-xs font-semibold">Aktivní</th>
              <th className="text-muted-foreground px-3 py-2.5 text-xs font-semibold">Akce</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/30">
                {editingId === row.id ? (
                  <>
                    <td className="p-2">
                      <input
                        className="border-input bg-background w-full min-w-[8rem] rounded-md border px-2 py-1 text-sm"
                        value={editOwner}
                        onChange={(e) => setEditOwner(e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        className="border-input bg-background w-24 rounded-md border px-2 py-1 text-sm"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        className="border-input bg-background w-16 rounded-md border px-2 py-1 text-sm"
                        value={editCurrency}
                        onChange={(e) => setEditCurrency(e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        className="border-input bg-background min-w-[6rem] max-w-[14rem] rounded-md border px-2 py-1 text-sm"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="Volitelně"
                      />
                    </td>
                    <td className="p-2 text-muted-foreground text-xs">{row.active ? "ano" : "ne"}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="xs"
                          disabled={loading}
                          onClick={() => void saveEdit(row.id)}
                        >
                          Uložit
                        </Button>
                        <Button type="button" size="xs" variant="outline" disabled={loading} onClick={cancelEdit}>
                          Zrušit
                        </Button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-2">{row.ownerLabel}</td>
                    <td className="p-2 tabular-nums">{fmtMoney(row.amount)}</td>
                    <td className="p-2 font-mono text-xs">{row.currency}</td>
                    <td className="p-2 text-muted-foreground text-xs">{row.note?.trim() ? row.note : "—"}</td>
                    <td className="p-2">{row.active ? "ano" : "ne"}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          disabled={loading}
                          onClick={() => startEdit(row)}
                        >
                          Upravit
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={loading}
                          onClick={() => void toggleActive(row.id, row.active)}
                        >
                          {row.active ? "Deaktivovat" : "Aktivovat"}
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="destructive"
                          disabled={loading}
                          onClick={() => void removeRow(row.id)}
                        >
                          Smazat
                        </Button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
