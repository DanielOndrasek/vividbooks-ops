"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

function prevMonth(): { year: number; month: number } {
  const d = new Date();
  const m = d.getMonth();
  const y = d.getFullYear();
  if (m === 0) {
    return { year: y - 1, month: 12 };
  }
  return { year: y, month: m };
}

function fmtMoney(n: number): string {
  return n.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) {
    return "";
  }
  const keys = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    keys.join(","),
    ...rows.map((r) => keys.map((k) => esc(r[k])).join(",")),
  ];
  return lines.join("\n");
}

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Props = { pipedriveConfigured: boolean };

export function CommissionTool({ pipedriveConfigured }: Props) {
  const def = useMemo(() => prevMonth(), []);
  const [year, setYear] = useState(def.year);
  const [month, setMonth] = useState(def.month);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/commission/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(j.error || "Chyba výpočtu");
        setData(null);
        return;
      }
      setData(j as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  if (!pipedriveConfigured) {
    return (
      <p className="text-muted-foreground text-sm">
        Doplň v prostředí <code className="bg-muted rounded px-1">PIPEDRIVE_*</code> v{" "}
        <strong>Nastavení integrací</strong> (viz dokumentace v repozitáři).
      </p>
    );
  }

  const rows = (data?.rows as Record<string, unknown>[]) ?? [];
  const aggregate = (data?.aggregate as Record<string, unknown>[]) ?? [];
  const diag = data?.diagnostics as Record<string, unknown> | undefined;
  const exportCommissioned = (data?.exportCommissioned as Record<string, unknown>[]) ?? [];
  const exportFullMonth = (data?.exportFullMonth as Record<string, unknown>[]) ?? [];

  const totalComm = rows.reduce(
    (s, r) => s + Number((r as { commission?: number }).commission ?? 0),
    0,
  );
  const totalVal = rows.reduce(
    (s, r) => s + Number((r as { value?: number }).value ?? 0),
    0,
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Rok</span>
          <input
            type="number"
            className="border-input bg-background w-28 rounded-md border px-3 py-2"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2000}
            max={2100}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Měsíc</span>
          <select
            className="border-input bg-background rounded-md border px-3 py-2"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" disabled={loading} onClick={() => void run()}>
          {loading ? "Počítám…" : "Spočítat provize"}
        </Button>
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {data && (
        <>
          <p className="text-muted-foreground text-sm">
            Měsíc <strong>{year}-{String(month).padStart(2, "0")}</strong> podle{" "}
            <code>won_time</code>. Won v měsíci:{" "}
            <strong>{String(diag?.won_deals_in_month ?? "—")}</strong>, v provizích:{" "}
            <strong>{rows.length}</strong>.
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="text-muted-foreground text-xs">Celkové provize</div>
              <div className="text-2xl font-semibold">{fmtMoney(totalComm)}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-muted-foreground text-xs">Hodnota započtených</div>
              <div className="text-2xl font-semibold">{fmtMoney(totalVal)}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-muted-foreground text-xs">Započtené dealy</div>
              <div className="text-2xl font-semibold">{rows.length}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadText(
                  `provize_${year}_${String(month).padStart(2, "0")}_zapoctene.csv`,
                  toCsv(exportCommissioned),
                  "text/csv;charset=utf-8",
                )
              }
            >
              CSV — započtené
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadText(
                  `provize_${year}_${String(month).padStart(2, "0")}_vsechny_won.csv`,
                  toCsv(exportFullMonth),
                  "text/csv;charset=utf-8",
                )
              }
            >
              CSV — všechny won v měsíci
            </Button>
          </div>

          <div>
            <h2 className="mb-2 font-medium">Souhrn po obchodnících</h2>
            <div className="table-panel">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Obchodník</th>
                    <th className="p-2">Dealy</th>
                    <th className="p-2">Hodnota</th>
                    <th className="p-2">Provize</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregate.map((r) => (
                    <tr key={String(r.obchodník)}>
                      <td className="p-2">{String(r.obchodník)}</td>
                      <td className="p-2">{String(r.počet_dealů)}</td>
                      <td className="p-2">{fmtMoney(Number(r.hodnota_dealů))}</td>
                      <td className="p-2">{fmtMoney(Number(r.provize_celkem))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer font-medium">Diagnostika (JSON)</summary>
            <pre className="text-muted-foreground mt-2 max-h-96 overflow-auto text-xs">
              {JSON.stringify(diag, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
