import { TriangleAlert } from "lucide-react";

import type { AvailabilityRow } from "@/lib/inventory/availability";
import { cn } from "@/lib/utils";

/** Práh nízké zásoby (ks) a kritického stavu (ks). */
export const LOW_STOCK_THRESHOLD = 100;
export const CRITICAL_STOCK_THRESHOLD = 50;

function fmtPieces(n: number): string {
  return n.toLocaleString("cs-CZ", { maximumFractionDigits: 3 });
}

/** Seznam produktů s nízkou dostupnou zásobou (< 100 ks); kriticky (< 50 ks) zvýrazněné červeně. */
export function InventoryLowStock({ rows }: { rows: AvailabilityRow[] }) {
  const low = rows
    .filter((row) => row.totalPieces < LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.totalPieces - b.totalPieces);

  const criticalCount = low.filter(
    (row) => row.totalPieces < CRITICAL_STOCK_THRESHOLD,
  ).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <TriangleAlert className="size-4 text-amber-600" aria-hidden />
        <h2 className="text-sm font-semibold">
          Nízká zásoba — méně než {LOW_STOCK_THRESHOLD} ks
        </h2>
        <span className="text-muted-foreground text-sm">
          ({low.length}
          {criticalCount > 0 && (
            <>
              {" "}
              z toho <span className="font-semibold text-red-600">{criticalCount} kriticky</span>
            </>
          )}
          )
        </span>
      </div>

      {low.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Všechny produkty mají dostatek (≥ {LOW_STOCK_THRESHOLD} ks).
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {low.map((row) => {
            const critical = row.totalPieces < CRITICAL_STOCK_THRESHOLD;
            return (
              <li
                key={row.baseCode}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 shadow-sm",
                  critical
                    ? "border-red-500/40 bg-red-500/10"
                    : "border-border/70 bg-card",
                )}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{row.name || row.baseCode}</div>
                  <div className="text-muted-foreground font-mono text-xs">{row.baseCode}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={cn(
                      "text-lg font-semibold tabular-nums",
                      critical && "text-red-600",
                    )}
                  >
                    {fmtPieces(row.totalPieces)}{" "}
                    <span className="text-xs font-normal">{row.unit}</span>
                  </div>
                  {critical && (
                    <div className="text-[11px] font-semibold tracking-wide text-red-600 uppercase">
                      Kriticky
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
