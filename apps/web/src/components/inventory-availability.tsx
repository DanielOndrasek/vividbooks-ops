"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Search } from "lucide-react";

import type { AvailabilityRow } from "@/lib/inventory/availability";

function fmtPieces(n: number): string {
  return n.toLocaleString("cs-CZ", { maximumFractionDigits: 3 });
}

type SortKey = "name" | "pieces";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />;
  }
  return dir === "asc" ? (
    <ArrowUp className="size-3.5" aria-hidden />
  ) : (
    <ArrowDown className="size-3.5" aria-hidden />
  );
}

export function InventoryAvailabilityTable({ rows }: { rows: AvailabilityRow[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((row) => {
          if (
            row.name.toLowerCase().includes(q) ||
            row.baseCode.toLowerCase().includes(q)
          ) {
            return true;
          }
          return row.components.some(
            (c) =>
              c.sku.toLowerCase().includes(q) ||
              c.name.toLowerCase().includes(q),
          );
        })
      : rows.slice();

    const dir = sortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      if (sortKey === "pieces") {
        if (a.totalPieces !== b.totalPieces) {
          return (a.totalPieces - b.totalPieces) * dir;
        }
        return a.name.localeCompare(b.name, "cs");
      }
      return a.name.localeCompare(b.name, "cs") * dir;
    });

    return filtered;
  }, [rows, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // U množství dává smysl výchozí „od nejmenší zásoby"; u názvu A→Z.
      setSortDir("asc");
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Zatím žádné aktivní položky. Přidej položku ručně, nebo spusť synchronizaci z Fulfillment.cz na stránce
        Sklad.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <label className="relative flex max-w-md items-center">
        <Search className="text-muted-foreground pointer-events-none absolute left-3 size-4" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hledat produkt (název, kód, SKU)"
          className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-lg border pl-9 pr-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none"
        />
      </label>

      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/45">
              <th className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleSort("name")}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-semibold tracking-wide"
                >
                  Produkt <SortIcon active={sortKey === "name"} dir={sortDir} />
                </button>
              </th>
              <th className="px-3 py-2.5 text-right">
                <button
                  type="button"
                  onClick={() => toggleSort("pieces")}
                  className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1 text-xs font-semibold tracking-wide"
                >
                  Dostupné kusy <SortIcon active={sortKey === "pieces"} dir={sortDir} />
                </button>
              </th>
              <th className="text-muted-foreground px-3 py-2.5 text-xs font-semibold tracking-wide">
                Rozpad
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-muted-foreground px-3 py-6 text-center text-sm">
                  Nic neodpovídá hledání: {query.trim()}
                </td>
              </tr>
            ) : (
              visible.map((row) => {
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
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
