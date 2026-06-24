import { ChevronDown } from "lucide-react";

import type { AvailabilityRow } from "@/lib/inventory/availability";

function fmtPieces(n: number): string {
  return n.toLocaleString("cs-CZ", { maximumFractionDigits: 3 });
}

export function InventoryAvailabilityTable({ rows }: { rows: AvailabilityRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Zatím žádné aktivní položky. Přidej položku ručně, nebo spusť synchronizaci z Fulfillment.cz na stránce
        Sklad.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/70">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/45">
            <th className="text-muted-foreground px-3 py-2.5 text-xs font-semibold tracking-wide">
              Produkt
            </th>
            <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide">
              Dostupné kusy
            </th>
            <th className="text-muted-foreground px-3 py-2.5 text-xs font-semibold tracking-wide">
              Rozpad
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const hasPack = row.components.some((c) => c.isPack);
            return (
              <tr
                key={row.baseCode}
                className="border-b border-border/50 align-top transition-colors last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2.5">
                  <div className="font-medium">{row.name || row.baseCode}</div>
                  <div className="text-muted-foreground font-mono text-xs">{row.baseCode}</div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className="text-lg font-semibold tabular-nums">{fmtPieces(row.totalPieces)}</span>{" "}
                  <span className="text-muted-foreground text-xs">{row.unit}</span>
                </td>
                <td className="px-3 py-2.5">
                  {hasPack ? (
                    <details className="group">
                      <summary className="text-muted-foreground flex cursor-pointer list-none items-center gap-1 text-xs hover:text-foreground [&::-webkit-details-marker]:hidden">
                        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
                        {row.components.length} {row.components.length === 1 ? "varianta" : "variant"}
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {row.components.map((c) => (
                          <li key={c.sku} className="text-muted-foreground text-xs">
                            <span className="font-mono">{c.sku}</span> —{" "}
                            {c.isPack ? (
                              <>
                                {fmtPieces(c.available)} bal. × {c.multiplier} ={" "}
                                <strong className="text-foreground">{fmtPieces(c.pieces)} ks</strong>
                              </>
                            ) : (
                              <strong className="text-foreground">{fmtPieces(c.pieces)} ks</strong>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <span className="text-muted-foreground text-xs">jednotlivé kusy</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
