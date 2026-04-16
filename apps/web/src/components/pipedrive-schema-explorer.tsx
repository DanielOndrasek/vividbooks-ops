"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type FieldRow = {
  id: unknown;
  key: unknown;
  name: unknown;
  field_type: unknown;
  edit_flag: unknown;
  options: { id: unknown; label: unknown }[];
};

type PipelineStage = {
  id: unknown;
  name: unknown;
  order_nr: unknown;
  pipeline_id: unknown;
};

type PipelineBlock = {
  id: unknown;
  name: unknown;
  active: unknown;
  url_title: unknown;
  stages: PipelineStage[];
};

type UserRow = {
  id: unknown;
  name: unknown;
  email: unknown;
  active_flag: unknown;
};

type ProductRow = {
  id: unknown;
  name: unknown;
  code: unknown;
  unit: unknown;
  tax: unknown;
  active_flag: unknown;
};

type SchemaPayload = {
  dealFields: FieldRow[];
  personFields: FieldRow[];
  organizationFields: FieldRow[];
  productFields: FieldRow[];
  products: ProductRow[];
  pipelines: PipelineBlock[];
  users: UserRow[];
};

const TABS = [
  { id: "pipelines", label: "Pipeline + fáze" },
  { id: "deals", label: "Pole obchodů" },
  { id: "people", label: "Pole osob" },
  { id: "orgs", label: "Pole organizací" },
  { id: "productFields", label: "Pole produktů" },
  { id: "products", label: "Produkty" },
  { id: "users", label: "Uživatelé" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function matchesFilter(q: string, ...parts: unknown[]): boolean {
  if (!q) {
    return true;
  }
  return parts.some((p) => String(p ?? "").toLowerCase().includes(q));
}

function FieldTable({ rows, filter }: { rows: FieldRow[]; filter: string }) {
  const q = filter.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) {
      return rows;
    }
    return rows.filter((r) => {
      if (matchesFilter(q, r.name, r.key, r.id, r.field_type)) {
        return true;
      }
      return (r.options ?? []).some((o) => matchesFilter(q, o.label, o.id));
    });
  }, [rows, q]);

  if (filtered.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">Žádné řádky.</p>;
  }

  return (
    <div className="max-h-[min(28rem,70vh)] overflow-auto rounded-md border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            <th className="p-2">id</th>
            <th className="p-2">key</th>
            <th className="p-2">name</th>
            <th className="p-2">type</th>
            <th className="p-2">custom</th>
            <th className="p-2">volby</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r, i) => (
            <tr key={i} className="border-b align-top last:border-0">
              <td className="p-2 tabular-nums">{String(r.id ?? "—")}</td>
              <td className="max-w-[9rem] break-all p-2 font-mono">{String(r.key ?? "")}</td>
              <td className="p-2">{String(r.name ?? "")}</td>
              <td className="p-2">{String(r.field_type ?? "")}</td>
              <td className="p-2">{r.edit_flag === true ? "ano" : r.edit_flag === false ? "ne" : "—"}</td>
              <td className="max-w-[18rem] p-2">
                <span className="text-muted-foreground">{r.options?.length ?? 0}</span>
                {(r.options?.length ?? 0) > 0 ? (
                  <ul className="text-muted-foreground mt-1 max-h-48 list-inside list-disc overflow-y-auto text-[10px] leading-snug">
                    {(r.options ?? []).map((o, j) => (
                      <li key={`${String(o.id)}-${j}`}>
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
  );
}

export function PipedriveSchemaExplorer() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SchemaPayload | null>(null);
  const [tab, setTab] = useState<TabId>("pipelines");
  const [filter, setFilter] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pipedrive/schema");
      const j = (await res.json()) as SchemaPayload & { error?: string };
      if (!res.ok) {
        setError(j.error || "Chyba");
        return;
      }
      if (!Array.isArray(j.dealFields) || !Array.isArray(j.productFields)) {
        setError("Neočekávaná odpověď");
        return;
      }
      setData({
        dealFields: j.dealFields,
        personFields: j.personFields ?? [],
        organizationFields: j.organizationFields ?? [],
        productFields: j.productFields,
        products: j.products ?? [],
        pipelines: j.pipelines ?? [],
        users: j.users ?? [],
      });
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const pipelineBlocks = useMemo(() => {
    if (!data) {
      return [];
    }
    const q = filter.trim().toLowerCase();
    if (!q) {
      return data.pipelines;
    }
    return data.pipelines.filter((p) => {
      if (matchesFilter(q, p.name, p.id, p.url_title)) {
        return true;
      }
      return p.stages.some((s) => matchesFilter(q, s.name, s.id));
    });
  }, [data, filter]);

  const userRows = useMemo(() => {
    if (!data) {
      return [];
    }
    const q = filter.trim().toLowerCase();
    if (!q) {
      return data.users;
    }
    return data.users.filter((u) => matchesFilter(q, u.name, u.email, u.id));
  }, [data, filter]);

  const productRows = useMemo(() => {
    if (!data) {
      return [];
    }
    const q = filter.trim().toLowerCase();
    if (!q) {
      return data.products;
    }
    return data.products.filter((p) =>
      matchesFilter(q, p.name, p.code, p.id, p.unit, p.tax),
    );
  }, [data, filter]);

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}>
        {loading
          ? "Načítám…"
          : "Načíst schéma Pipedrive (pipeline, fáze, pole, produkty, uživatelé)"}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {open && data && (
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">
            Do env <code className="bg-muted rounded px-1">PIPEDRIVE_CATEGORY_FIELD_KEY</code> patří{" "}
            <strong>key</strong> pole (hash) u obchodu i u produktu, ne číselné <strong>id</strong> řádku
            pole — to slouží k úpravě definice v Pipedrive.
          </p>
          <div className="flex flex-wrap gap-1 border-b pb-2">
            {TABS.map((t) => (
              <Button
                key={t.id}
                type="button"
                size="sm"
                variant={tab === t.id ? "default" : "ghost"}
                className="h-8 rounded-md"
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              Filtrovat v aktivní záložce (název, id, e-mail, key…)
            </label>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Začni psát…"
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring w-full max-w-md rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            />
          </div>
          {tab === "pipelines" && (
            <div className="max-h-[min(32rem,75vh)] space-y-4 overflow-y-auto pr-1">
              {pipelineBlocks.length === 0 ? (
                <p className="text-muted-foreground text-sm">Žádné pipeline nebo nic neodpovídá filtru.</p>
              ) : (
                pipelineBlocks.map((p) => (
                  <div key={String(p.id)} className="rounded-lg border bg-card">
                    <div className="border-b bg-muted/30 px-3 py-2 text-sm">
                      <span className="font-medium">{String(p.name ?? "")}</span>
                      <span className="text-muted-foreground ml-2 font-mono text-xs">
                        pipeline_id={String(p.id)}
                        {p.active === false ? " · neaktivní" : ""}
                      </span>
                      {p.url_title ? (
                        <span className="text-muted-foreground ml-2 text-xs">url: {String(p.url_title)}</span>
                      ) : null}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="p-2">stage id</th>
                            <th className="p-2">název</th>
                            <th className="p-2">pořadí</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.stages.length === 0 ? (
                            <tr>
                              <td className="text-muted-foreground p-3" colSpan={3}>
                                Žádné fáze v této pipeline.
                              </td>
                            </tr>
                          ) : (
                            p.stages.map((s, idx) => (
                              <tr key={String(s.id ?? idx)} className="border-t">
                                <td className="p-2 tabular-nums">{String(s.id ?? "—")}</td>
                                <td className="p-2">{String(s.name ?? "")}</td>
                                <td className="text-muted-foreground p-2 tabular-nums">
                                  {String(s.order_nr ?? "—")}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {tab === "deals" && <FieldTable rows={data.dealFields} filter={filter} />}
          {tab === "people" && <FieldTable rows={data.personFields} filter={filter} />}
          {tab === "orgs" && <FieldTable rows={data.organizationFields} filter={filter} />}
          {tab === "productFields" && <FieldTable rows={data.productFields} filter={filter} />}
          {tab === "products" && (
            <div className="max-h-[min(28rem,70vh)] overflow-auto rounded-md border">
              {productRows.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">Žádné produkty.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-2">id</th>
                      <th className="p-2">název</th>
                      <th className="p-2">kód</th>
                      <th className="p-2">jednotka</th>
                      <th className="p-2">daň</th>
                      <th className="p-2">aktivní</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productRows.map((p, i) => (
                      <tr key={String(p.id ?? i)} className="border-b align-top last:border-0">
                        <td className="p-2 tabular-nums">{String(p.id ?? "—")}</td>
                        <td className="p-2">{String(p.name ?? "")}</td>
                        <td className="max-w-[10rem] break-all p-2 font-mono">{String(p.code ?? "—")}</td>
                        <td className="p-2">{String(p.unit ?? "—")}</td>
                        <td className="p-2 tabular-nums">{String(p.tax ?? "—")}</td>
                        <td className="p-2">{p.active_flag === false ? "ne" : "ano"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {tab === "users" && (
            <div className="max-h-[min(28rem,70vh)] overflow-auto rounded-md border">
              {userRows.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">Žádní uživatelé.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-2">id</th>
                      <th className="p-2">jméno</th>
                      <th className="p-2">e-mail</th>
                      <th className="p-2">aktivní</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userRows.map((u, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-2 tabular-nums">{String(u.id ?? "—")}</td>
                        <td className="p-2">{String(u.name ?? "")}</td>
                        <td className="max-w-[14rem] break-all p-2">{String(u.email ?? "")}</td>
                        <td className="p-2">{u.active_flag === false ? "ne" : "ano"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
