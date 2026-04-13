"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function PipedriveDealFieldsButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<
    {
      id: unknown;
      key: unknown;
      name: unknown;
      field_type: unknown;
      optionsCount: number;
      optionsSample: { id: unknown; label: unknown }[];
    }[]
  >([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pipedrive/deal-fields");
      const j = (await res.json()) as {
        error?: string;
        items?: typeof items;
      };
      if (!res.ok) {
        setError(j.error || "Chyba");
        return;
      }
      setItems(j.items ?? []);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={loading}
        onClick={() => void load()}
      >
        {loading ? "Načítám…" : "Načíst pole obchodů z Pipedrive (id + key)"}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {open && items.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            Do env <code className="bg-muted rounded px-1">PIPEDRIVE_CATEGORY_FIELD_KEY</code> dej hodnotu sloupce{" "}
            <strong>key</strong> (hash), ne číselné <strong>id</strong> — ten je z API pro orientaci.
          </p>
          <div className="max-h-80 overflow-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-2">id</th>
                  <th className="p-2">key</th>
                  <th className="p-2">name</th>
                  <th className="p-2">type</th>
                  <th className="p-2">volby</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r, i) => (
                  <tr key={i} className="border-b align-top last:border-0">
                    <td className="p-2 tabular-nums">{String(r.id ?? "—")}</td>
                    <td className="max-w-[10rem] break-all p-2 font-mono">{String(r.key ?? "")}</td>
                    <td className="p-2">{String(r.name ?? "")}</td>
                    <td className="p-2">{String(r.field_type ?? "")}</td>
                    <td className="p-2">
                      <span className="text-muted-foreground">{r.optionsCount}</span>
                      {r.optionsSample.length > 0 ? (
                        <ul className="text-muted-foreground mt-1 list-inside list-disc text-[10px] leading-snug">
                          {r.optionsSample.map((o, j) => (
                            <li key={j}>
                              id {String(o.id)} — {String(o.label ?? "")}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
