"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
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
    <div className="space-y-1">
      {title ? (
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{title}</p>
      ) : null}
      <div className="table-panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2 font-medium">Měna</th>
              <th className="p-2 font-medium">Výnos (won)</th>
              <th className="p-2 font-medium">Provize</th>
              <th className="p-2 font-medium">Fixní</th>
              <th className="p-2 font-medium">Čistý</th>
              <th className="p-2 font-medium">Nákl./výnos</th>
            </tr>
          </thead>
          <tbody>
            {ccys.map((ccy) => {
              const r = rows[ccy]!;
              return (
                <tr key={ccy} className="border-b last:border-0">
                  <td className="p-2 font-mono text-xs">{ccy}</td>
                  <td className="p-2 tabular-nums">{fmtMoney(r.revenue)}</td>
                  <td className="p-2 tabular-nums">{fmtMoney(r.commissionCost)}</td>
                  <td className="p-2 tabular-nums">{fmtMoney(r.fixedCost)}</td>
                  <td className="p-2 tabular-nums">{fmtMoney(r.net)}</td>
                  <td className="p-2 tabular-nums">{fmtPct(r.costRatio)}</td>
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
  const label = `${String(block.month).padStart(2, "0")}. měsíc`;
  return (
    <details className="rounded-lg border bg-card/40">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        {label}
        {block.missingSnapshot && (
          <span className="text-muted-foreground ml-2 font-normal">
            (není uložený výpočet provizí)
          </span>
        )}
      </summary>
      <div className="space-y-4 border-t px-4 py-4">
        {block.missingSnapshot ? (
          <p className="text-muted-foreground text-sm">
            V nástroji <strong>Provize</strong> pro tento měsíc zatím neproběhl výpočet — po spuštění se zde objeví
            výnosy a náklady.
          </p>
        ) : (
          <>
            <CurrencyBlock title="Tým (všichni won v měsíci)" rows={block.teamByCurrency} />
            {block.owners.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Obchodníci</p>
                {block.owners.map((o) => (
                  <div key={o.ownerLabel} className="rounded-md border border-border/60 p-3">
                    <p className="mb-2 text-sm font-medium">{o.ownerLabel}</p>
                    <CurrencyBlock title="" rows={o.byCurrency} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}

export type FixedCostItemDto = {
  id: string;
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
  fixedInitial,
}: {
  bundle: SalesControllingYearBundle;
  yearTotals: YearTotalsByCurrency;
  isAdmin: boolean;
  fixedInitial: FixedCostItemDto[];
}) {
  const yearRatio = useMemo(() => yearTotalsCostRatio(yearTotals), [yearTotals]);
  const totalCcys = Object.keys(yearTotals).sort();

  return (
    <div className="space-y-8">
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Rok</span>
          <select
            name="year"
            defaultValue={bundle.year}
            className="border-input bg-background rounded-md border px-3 py-2"
          >
            <option value={2023}>2023 (historie)</option>
            <option value={2024}>2024 (historie)</option>
            <option value={2025}>2025 (historie)</option>
            {Array.from({ length: 2031 - 2026 }, (_, i) => 2026 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Zobrazit</Button>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Roční souhrn (tým)</h2>
        <p className="text-muted-foreground text-sm">
          Součty pouze z měsíců, kde je uložený výpočet provizí (od 2026 z DB). Fixní odměny jsou v každém měsíci
          započteny znovu — roční součet fixů odpovídá 12× měsíční fix pro tým.
        </p>
        {totalCcys.length === 0 ? (
          <p className="text-muted-foreground text-sm">Žádná data pro tento rok.</p>
        ) : (
          <div className="table-panel overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2 font-medium">Měna</th>
                  <th className="p-2 font-medium">Výnos</th>
                  <th className="p-2 font-medium">Provize</th>
                  <th className="p-2 font-medium">Fixní</th>
                  <th className="p-2 font-medium">Čistý</th>
                  <th className="p-2 font-medium">Nákl./výnos</th>
                </tr>
              </thead>
              <tbody>
                {totalCcys.map((ccy) => {
                  const t = yearTotals[ccy]!;
                  const ratio = yearRatio[ccy] ?? null;
                  return (
                    <tr key={ccy} className="border-b last:border-0">
                      <td className="p-2 font-mono text-xs">{ccy}</td>
                      <td className="p-2 tabular-nums">{fmtMoney(t.revenue)}</td>
                      <td className="p-2 tabular-nums">{fmtMoney(t.commissionCost)}</td>
                      <td className="p-2 tabular-nums">{fmtMoney(t.fixedCost)}</td>
                      <td className="p-2 tabular-nums">{fmtMoney(t.net)}</td>
                      <td className="p-2 tabular-nums">{fmtPct(ratio)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Měsíční detail</h2>
        <div className="space-y-2">
          {bundle.months.map((m) => (
            <MonthSection key={m.month} block={m} />
          ))}
        </div>
      </section>

      {isAdmin && (
        <FixedCostsAdminPanel initialItems={fixedInitial} />
      )}
    </div>
  );
}

function FixedCostsAdminPanel({ initialItems }: { initialItems: FixedCostItemDto[] }) {
  const [items, setItems] = useState(initialItems);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ownerLabel, setOwnerLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("CZK");
  const [note, setNote] = useState("");

  async function refresh() {
    const res = await fetch("/api/sales-controlling/fixed-costs", { cache: "no-store" });
    const j = (await res.json()) as { items?: FixedCostItemDto[] };
    if (res.ok && j.items) {
      setItems(j.items);
    }
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
      await refresh();
      setMsg("Přidáno.");
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
      await refresh();
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
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-dashed p-4">
      <h2 className="text-lg font-semibold tracking-tight">Fixní měsíční odměny (admin)</h2>
      <p className="text-muted-foreground text-sm">
        <code>ownerLabel</code> musí odpovídat jménu obchodníka z Pipedrive / provizí (bez rozlišení velikosti písmen).
      </p>
      {msg && <p className="text-muted-foreground text-sm">{msg}</p>}
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

      <div className="table-panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2 font-medium">Obchodník</th>
              <th className="p-2 font-medium">Částka</th>
              <th className="p-2 font-medium">Měna</th>
              <th className="p-2 font-medium">Aktivní</th>
              <th className="p-2 font-medium">Akce</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="p-2">{row.ownerLabel}</td>
                <td className="p-2 tabular-nums">{fmtMoney(row.amount)}</td>
                <td className="p-2 font-mono text-xs">{row.currency}</td>
                <td className="p-2">{row.active ? "ano" : "ne"}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
