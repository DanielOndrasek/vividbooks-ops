"use client";

import { useState } from "react";

export function PipedriveDealFieldsButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<
    { key: unknown; name: unknown; field_type: unknown; options: number }[]
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
      <button
        type="button"
        disabled={loading}
        onClick={() => void load()}
        className="border-input bg-background rounded-md border px-3 py-2 text-sm"
      >
        {loading ? "Načítám…" : "Načíst pole obchodů z Pipedrive (key)"}
      </button>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {open && items.length > 0 && (
        <div className="max-h-80 overflow-auto rounded-md border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="p-2">key</th>
                <th className="p-2">name</th>
                <th className="p-2">type</th>
                <th className="p-2">opts</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-2 font-mono">{String(r.key)}</td>
                  <td className="p-2">{String(r.name)}</td>
                  <td className="p-2">{String(r.field_type)}</td>
                  <td className="p-2">{r.options}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
