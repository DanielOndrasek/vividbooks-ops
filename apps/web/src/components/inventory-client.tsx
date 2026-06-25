"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CloudDownload,
  History,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  Trash2,
  Warehouse,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildInventorySummary,
  stockStatus,
  type InventoryItemDto,
  type InventoryMovementDto,
  type InventoryMovementType,
  type StockStatus,
} from "@/lib/inventory/types";

function fmtQty(n: number): string {
  return n.toLocaleString("cs-CZ", { maximumFractionDigits: 3 });
}

function fmtMoney(n: number): string {
  return n.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("cs-CZ");
}

const STATUS_META: Record<
  StockStatus,
  { label: string; className: string }
> = {
  ok: {
    label: "Skladem",
    className:
      "bg-emerald-500/15 text-emerald-900 dark:bg-emerald-950/55 dark:text-emerald-100",
  },
  low: {
    label: "Nízká zásoba",
    className:
      "bg-amber-500/20 text-amber-900 dark:bg-amber-950/55 dark:text-amber-100",
  },
  out: {
    label: "Vyprodáno",
    className: "bg-red-500/20 text-red-950 dark:bg-red-950/60 dark:text-red-100",
  },
};

const MOVEMENT_META: Record<
  InventoryMovementType,
  { label: string; className: string }
> = {
  IN: { label: "Příjem", className: "text-emerald-700 dark:text-emerald-300" },
  OUT: { label: "Výdej", className: "text-red-700 dark:text-red-300" },
  ADJUSTMENT: { label: "Korekce", className: "text-amber-700 dark:text-amber-300" },
};

function StatusBadge({ status }: { status: StockStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

function PanelCard({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
      <div className="border-b border-border/60 bg-muted/30 px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? (
          <div className="text-muted-foreground mt-1 text-sm leading-relaxed">{description}</div>
        ) : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone?: "default" | "amber" | "red";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      : tone === "red"
        ? "bg-red-500/15 text-red-700 dark:text-red-400"
        : "bg-primary/12 text-primary";
  return (
    <div className="border-border/80 from-card to-muted/20 relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-sm">
      <div className={cn("mb-3 flex size-10 items-center justify-center rounded-xl", toneClass)}>
        {icon}
      </div>
      <div className="text-muted-foreground text-sm font-medium">{label}</div>
      <div className="text-foreground mt-1 text-3xl font-semibold tabular-nums tracking-tight">
        {value}
      </div>
    </div>
  );
}

const EMPTY_ADD = {
  sku: "",
  name: "",
  category: "",
  unit: "ks",
  quantity: "",
  minQuantity: "",
  unitPrice: "",
  currency: "CZK",
  location: "",
  supplier: "",
  note: "",
};

export function InventoryClient({
  initialItems,
  initialMovements,
  canWrite,
}: {
  initialItems: InventoryItemDto[];
  initialMovements: InventoryMovementDto[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [movements, setMovements] = useState(initialMovements);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);
  useEffect(() => {
    setMovements(initialMovements);
  }, [initialMovements]);

  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [add, setAdd] = useState({ ...EMPTY_ADD });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ ...EMPTY_ADD });

  const [movementItemId, setMovementItemId] = useState<string | null>(null);
  const [movType, setMovType] = useState<InventoryMovementType>("IN");
  const [movQty, setMovQty] = useState("");
  const [movNote, setMovNote] = useState("");

  const summary = useMemo(() => buildInventorySummary(items), [items]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (!includeInactive && !it.active) {
        return false;
      }
      if (!q) {
        return true;
      }
      return [it.name, it.sku, it.category, it.supplier, it.location]
        .filter((v): v is string => Boolean(v))
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [items, query, includeInactive]);

  const valueCurrencies = Object.keys(summary.valueByCurrency).sort();

  function flash(message: string) {
    setMsg(message);
    setErr(null);
  }
  function fail(message: string) {
    setErr(message);
    setMsg(null);
  }

  async function refresh() {
    try {
      const [itemsRes, movRes] = await Promise.all([
        fetch("/api/inventory/items?includeInactive=1", { cache: "no-store" }),
        fetch("/api/inventory/movements?limit=20", { cache: "no-store" }),
      ]);
      const itemsJson = (await itemsRes.json()) as { items?: InventoryItemDto[] };
      const movJson = (await movRes.json()) as { movements?: InventoryMovementDto[] };
      if (itemsRes.ok && itemsJson.items) {
        setItems(itemsJson.items);
      }
      if (movRes.ok && movJson.movements) {
        setMovements(movJson.movements);
      }
    } catch {
      // ticho — UI zůstane se starými daty, uživatel může obnovit stránku
    }
    router.refresh();
  }

  async function runSync() {
    setSyncing(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/inventory/sync", { method: "POST" });
      const j = (await res.json()) as {
        error?: string;
        fetchedVariants?: number;
        created?: number;
        updated?: number;
        unchanged?: number;
        skipped?: number;
        excluded?: number;
      };
      if (!res.ok) {
        fail(j.error || "Synchronizace selhala.");
        return;
      }
      await refresh();
      flash(
        `Synchronizace z Fulfillment.cz hotová: ${j.fetchedVariants ?? 0} variant — nově ${j.created ?? 0}, ` +
          `aktualizováno ${j.updated ?? 0}, beze změny ${j.unchanged ?? 0}` +
          (j.skipped ? `, přeskočeno ${j.skipped}` : "") +
          (j.excluded ? `, vyřazeno ${j.excluded}` : "") +
          ".",
      );
    } catch {
      fail("Synchronizaci se nepodařilo spustit.");
    } finally {
      setSyncing(false);
    }
  }

  function parseNum(raw: string): number | null {
    const t = raw.trim();
    if (t === "") {
      return null;
    }
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      if (!add.sku.trim() || !add.name.trim()) {
        fail("Vyplň SKU a název položky.");
        return;
      }
      const quantity = parseNum(add.quantity);
      const minQuantity = parseNum(add.minQuantity);
      const unitPrice = parseNum(add.unitPrice);
      if (
        Number.isNaN(quantity) ||
        Number.isNaN(minQuantity) ||
        Number.isNaN(unitPrice)
      ) {
        fail("Množství, minimum a cena musí být čísla.");
        return;
      }
      const res = await fetch("/api/inventory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: add.sku.trim(),
          name: add.name.trim(),
          category: add.category.trim() || null,
          unit: add.unit.trim() || "ks",
          quantity: quantity ?? 0,
          minQuantity: minQuantity,
          unitPrice: unitPrice,
          currency: add.currency.trim() || "CZK",
          location: add.location.trim() || null,
          supplier: add.supplier.trim() || null,
          note: add.note.trim() || null,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        fail(j.error || "Chyba");
        return;
      }
      setAdd({ ...EMPTY_ADD });
      setShowAdd(false);
      await refresh();
      flash("Položka přidána.");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(row: InventoryItemDto) {
    setEditingId(row.id);
    setMovementItemId(null);
    setEdit({
      sku: row.sku,
      name: row.name,
      category: row.category ?? "",
      unit: row.unit,
      quantity: String(row.quantity),
      minQuantity: row.minQuantity != null ? String(row.minQuantity) : "",
      unitPrice: row.unitPrice != null ? String(row.unitPrice) : "",
      currency: row.currency,
      location: row.location ?? "",
      supplier: row.supplier ?? "",
      note: row.note ?? "",
    });
    setErr(null);
    setMsg(null);
  }

  async function saveEdit(id: string) {
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      if (!edit.sku.trim() || !edit.name.trim()) {
        fail("Vyplň SKU a název položky.");
        return;
      }
      const minQuantity = parseNum(edit.minQuantity);
      const unitPrice = parseNum(edit.unitPrice);
      if (Number.isNaN(minQuantity) || Number.isNaN(unitPrice)) {
        fail("Minimum a cena musí být čísla.");
        return;
      }
      const res = await fetch(`/api/inventory/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: edit.sku.trim(),
          name: edit.name.trim(),
          category: edit.category.trim() || null,
          unit: edit.unit.trim() || "ks",
          minQuantity,
          unitPrice,
          currency: edit.currency.trim() || "CZK",
          location: edit.location.trim() || null,
          supplier: edit.supplier.trim() || null,
          note: edit.note.trim() || null,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        fail(j.error || "Chyba");
        return;
      }
      setEditingId(null);
      await refresh();
      flash("Uloženo.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(row: InventoryItemDto) {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/inventory/items/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !row.active }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        fail(j.error || "Chyba");
        return;
      }
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function removeItem(row: InventoryItemDto) {
    if (
      !window.confirm(
        `Smazat položku „${row.name}" (${row.sku})? Smažou se i její pohyby. Tip: místo mazání lze položku deaktivovat.`,
      )
    ) {
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/inventory/items/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        fail(j.error || "Chyba");
        return;
      }
      if (editingId === row.id) {
        setEditingId(null);
      }
      if (movementItemId === row.id) {
        setMovementItemId(null);
      }
      await refresh();
      flash("Položka smazána.");
    } finally {
      setLoading(false);
    }
  }

  function startMovement(row: InventoryItemDto) {
    setMovementItemId(row.id);
    setEditingId(null);
    setMovType("IN");
    setMovQty("");
    setMovNote("");
    setErr(null);
    setMsg(null);
  }

  async function submitMovement(e: FormEvent, id: string) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const qty = parseNum(movQty);
      if (qty == null || Number.isNaN(qty) || qty < 0) {
        fail("Zadej platné množství.");
        return;
      }
      const res = await fetch(`/api/inventory/items/${id}/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: movType, quantity: qty, note: movNote.trim() || null }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        fail(j.error || "Chyba");
        return;
      }
      setMovementItemId(null);
      await refresh();
      flash("Pohyb zapsán a stav skladu aktualizován.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8 pb-4">
      <section aria-label="Souhrn" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Boxes className="size-5" aria-hidden />}
          label="Aktivní položky"
          value={summary.activeItems}
        />
        <KpiCard
          icon={<Warehouse className="size-5" aria-hidden />}
          label="Hodnota skladu"
          value={
            valueCurrencies.length === 0 ? (
              <span className="text-muted-foreground text-xl">—</span>
            ) : (
              <span className="flex flex-col gap-0.5">
                {valueCurrencies.map((ccy) => (
                  <span key={ccy} className="text-2xl">
                    {fmtMoney(summary.valueByCurrency[ccy]!)}{" "}
                    <span className="text-muted-foreground text-sm font-medium">{ccy}</span>
                  </span>
                ))}
              </span>
            )
          }
        />
        <KpiCard
          icon={<TriangleAlert className="size-5" aria-hidden />}
          label="Nízká zásoba"
          value={summary.lowStockCount}
          tone="amber"
        />
        <KpiCard
          icon={<TriangleAlert className="size-5" aria-hidden />}
          label="Vyprodáno"
          value={summary.outOfStockCount}
          tone="red"
        />
      </section>

      {(msg || err) && (
        <p
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            err
              ? "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
          )}
        >
          {err ?? msg}
        </p>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <label className="relative flex min-w-[14rem] flex-1 items-center">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 size-4" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hledat (název, SKU, kategorie, dodavatel, lokace)"
              className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-lg border pl-9 pr-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary h-4 w-4"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            <span className="text-muted-foreground">Zobrazit i neaktivní</span>
          </label>
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={syncing || loading}
              onClick={() => void runSync()}
              title="Stáhnout aktuální skladové zásoby z Fulfillment.cz"
            >
              <RefreshCw aria-hidden className={syncing ? "animate-spin" : undefined} />
              {syncing ? "Synchronizuji…" : "Synchronizovat z Fulfillment.cz"}
            </Button>
            <Button
              type="button"
              size="lg"
              variant={showAdd ? "secondary" : "default"}
              onClick={() => {
                setShowAdd((v) => !v);
                setErr(null);
                setMsg(null);
              }}
            >
              <Plus aria-hidden />
              {showAdd ? "Zavřít formulář" : "Přidat položku"}
            </Button>
          </div>
        )}
      </div>

      {canWrite && showAdd && (
        <PanelCard
          title="Nová skladová položka"
          description="SKU musí být unikátní. Počáteční stav je nepovinný (lze doplnit pohybem příjmu)."
        >
          <form onSubmit={(e) => void addItem(e)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="SKU *">
              <input
                className="inv-input"
                value={add.sku}
                onChange={(e) => setAdd({ ...add, sku: e.target.value })}
                placeholder="např. SKLAD-001"
              />
            </Field>
            <Field label="Název *">
              <input
                className="inv-input"
                value={add.name}
                onChange={(e) => setAdd({ ...add, name: e.target.value })}
              />
            </Field>
            <Field label="Kategorie">
              <input
                className="inv-input"
                value={add.category}
                onChange={(e) => setAdd({ ...add, category: e.target.value })}
              />
            </Field>
            <Field label="Počáteční množství">
              <input
                className="inv-input"
                value={add.quantity}
                onChange={(e) => setAdd({ ...add, quantity: e.target.value })}
                placeholder="0"
              />
            </Field>
            <Field label="Jednotka">
              <input
                className="inv-input"
                value={add.unit}
                onChange={(e) => setAdd({ ...add, unit: e.target.value })}
                placeholder="ks"
              />
            </Field>
            <Field label="Minimální zásoba">
              <input
                className="inv-input"
                value={add.minQuantity}
                onChange={(e) => setAdd({ ...add, minQuantity: e.target.value })}
                placeholder="volitelné"
              />
            </Field>
            <Field label="Jednotková cena">
              <input
                className="inv-input"
                value={add.unitPrice}
                onChange={(e) => setAdd({ ...add, unitPrice: e.target.value })}
                placeholder="volitelné"
              />
            </Field>
            <Field label="Měna">
              <input
                className="inv-input"
                value={add.currency}
                onChange={(e) => setAdd({ ...add, currency: e.target.value })}
              />
            </Field>
            <Field label="Lokace">
              <input
                className="inv-input"
                value={add.location}
                onChange={(e) => setAdd({ ...add, location: e.target.value })}
                placeholder="např. Regál A3"
              />
            </Field>
            <Field label="Dodavatel">
              <input
                className="inv-input"
                value={add.supplier}
                onChange={(e) => setAdd({ ...add, supplier: e.target.value })}
              />
            </Field>
            <Field label="Poznámka" className="sm:col-span-2 lg:col-span-1">
              <input
                className="inv-input"
                value={add.note}
                onChange={(e) => setAdd({ ...add, note: e.target.value })}
              />
            </Field>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" size="lg" disabled={loading}>
                Uložit položku
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={loading}
                onClick={() => {
                  setShowAdd(false);
                  setAdd({ ...EMPTY_ADD });
                }}
              >
                Zrušit
              </Button>
            </div>
          </form>
        </PanelCard>
      )}

      <PanelCard
        title="Položky na skladě"
        description={
          <>
            {visibleItems.length} {visibleItems.length === 1 ? "položka" : "položek"} zobrazeno
            {query.trim() ? " (filtrováno)" : ""}. Řádky pod minimem jsou zvýrazněné.
          </>
        }
      >
        {visibleItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Žádné položky{query.trim() ? " neodpovídají hledání" : ""}.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/45">
                  <Th>Položka</Th>
                  <Th className="text-right">Stav</Th>
                  <Th className="text-right">Min.</Th>
                  <Th className="text-right">Jedn. cena</Th>
                  <Th className="text-right">Hodnota</Th>
                  <Th>Lokace</Th>
                  <Th>Stav zásoby</Th>
                  {canWrite && <Th className="text-right">Akce</Th>}
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((row) => {
                  const status = stockStatus(row);
                  const value = row.unitPrice != null ? row.unitPrice * row.quantity : null;
                  const isEditing = editingId === row.id;
                  const isMoving = movementItemId === row.id;
                  const isSynced = row.source === "FULFILLMENT";
                  return (
                    <FragmentRow key={row.id}>
                      <tr
                        className={cn(
                          "border-b border-border/50 align-top transition-colors last:border-0 hover:bg-muted/30",
                          !row.active && "opacity-55",
                          status === "low" && "bg-amber-500/[0.06]",
                          status === "out" && "bg-red-500/[0.06]",
                        )}
                      >
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{row.name}</div>
                          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                            <span className="font-mono">{row.sku}</span>
                            {isSynced ? (
                              <span className="text-primary bg-primary/12 inline-flex items-center gap-0.5 rounded px-1">
                                <CloudDownload className="size-3" aria-hidden /> Fulfillment.cz
                              </span>
                            ) : null}
                            {row.category ? <span>· {row.category}</span> : null}
                            {row.supplier ? <span>· {row.supplier}</span> : null}
                            {isSynced && row.lastSyncedAt ? (
                              <span>· sync {fmtDateTime(row.lastSyncedAt)}</span>
                            ) : null}
                            {!row.active ? (
                              <span className="rounded border border-dashed px-1">neaktivní</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                          {fmtQty(row.quantity)}{" "}
                          <span className="text-muted-foreground text-xs">{row.unit}</span>
                          {row.availableQuantity != null ? (
                            <div className="text-muted-foreground text-[11px] font-normal">
                              dostupné {fmtQty(row.availableQuantity)}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {row.minQuantity != null ? fmtQty(row.minQuantity) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                          {row.unitPrice != null ? (
                            <>
                              {fmtMoney(row.unitPrice)}{" "}
                              <span className="text-muted-foreground text-xs">{row.currency}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                          {value != null ? (
                            <>
                              {fmtMoney(value)}{" "}
                              <span className="text-muted-foreground text-xs">{row.currency}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground text-xs">
                          {row.location ?? "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={status} />
                        </td>
                        {canWrite && (
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <Button
                                type="button"
                                size="xs"
                                variant="secondary"
                                disabled={loading || !row.active || isSynced}
                                title={
                                  isSynced
                                    ? "Stav řídí Fulfillment.cz (synchronizace), ruční pohyb není možný."
                                    : undefined
                                }
                                onClick={() => startMovement(row)}
                              >
                                Pohyb
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                disabled={loading}
                                onClick={() => startEdit(row)}
                              >
                                <Pencil aria-hidden />
                                Upravit
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                disabled={loading}
                                onClick={() => void toggleActive(row)}
                              >
                                {row.active ? "Deaktivovat" : "Aktivovat"}
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                variant="destructive"
                                disabled={loading}
                                onClick={() => void removeItem(row)}
                              >
                                <Trash2 aria-hidden />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>

                      {canWrite && isMoving && (
                        <tr className="border-b border-border/50 bg-muted/25">
                          <td colSpan={8} className="px-3 py-4">
                            <form
                              onSubmit={(e) => void submitMovement(e, row.id)}
                              className="flex flex-wrap items-end gap-3"
                            >
                              <div className="flex flex-col gap-1 text-sm">
                                <span className="text-muted-foreground text-xs">Typ pohybu</span>
                                <div className="flex gap-1.5">
                                  <MovementTypeButton
                                    active={movType === "IN"}
                                    onClick={() => setMovType("IN")}
                                    icon={<ArrowDownToLine aria-hidden />}
                                    label="Příjem"
                                  />
                                  <MovementTypeButton
                                    active={movType === "OUT"}
                                    onClick={() => setMovType("OUT")}
                                    icon={<ArrowUpFromLine aria-hidden />}
                                    label="Výdej"
                                  />
                                  <MovementTypeButton
                                    active={movType === "ADJUSTMENT"}
                                    onClick={() => setMovType("ADJUSTMENT")}
                                    icon={<SlidersHorizontal aria-hidden />}
                                    label="Korekce"
                                  />
                                </div>
                              </div>
                              <label className="flex flex-col gap-1 text-sm">
                                <span className="text-muted-foreground text-xs">
                                  {movType === "ADJUSTMENT" ? "Nový stav" : "Množství"} ({row.unit})
                                </span>
                                <input
                                  autoFocus
                                  className="inv-input w-32"
                                  value={movQty}
                                  onChange={(e) => setMovQty(e.target.value)}
                                  placeholder="0"
                                />
                              </label>
                              <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-sm">
                                <span className="text-muted-foreground text-xs">Poznámka</span>
                                <input
                                  className="inv-input"
                                  value={movNote}
                                  onChange={(e) => setMovNote(e.target.value)}
                                  placeholder="Volitelně (např. dodací list, příjemce)"
                                />
                              </label>
                              <div className="flex gap-2">
                                <Button type="submit" disabled={loading}>
                                  Zapsat pohyb
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={loading}
                                  onClick={() => setMovementItemId(null)}
                                >
                                  Zrušit
                                </Button>
                              </div>
                              <p className="text-muted-foreground basis-full text-xs">
                                Aktuální stav: <strong>{fmtQty(row.quantity)} {row.unit}</strong>.{" "}
                                {movType === "IN" && "Příjem stav navýší."}
                                {movType === "OUT" && "Výdej stav sníží (nesmí klesnout pod nulu)."}
                                {movType === "ADJUSTMENT" && "Korekce nastaví nový absolutní stav (inventura)."}
                              </p>
                            </form>
                          </td>
                        </tr>
                      )}

                      {canWrite && isEditing && (
                        <tr className="border-b border-border/50 bg-muted/25">
                          <td colSpan={8} className="px-3 py-4">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <Field label="SKU *">
                                <input
                                  className="inv-input"
                                  value={edit.sku}
                                  onChange={(e) => setEdit({ ...edit, sku: e.target.value })}
                                />
                              </Field>
                              <Field label="Název *">
                                <input
                                  className="inv-input"
                                  value={edit.name}
                                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                                />
                              </Field>
                              <Field label="Kategorie">
                                <input
                                  className="inv-input"
                                  value={edit.category}
                                  onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                                />
                              </Field>
                              <Field label="Jednotka">
                                <input
                                  className="inv-input"
                                  value={edit.unit}
                                  onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
                                />
                              </Field>
                              <Field label="Minimální zásoba">
                                <input
                                  className="inv-input"
                                  value={edit.minQuantity}
                                  onChange={(e) => setEdit({ ...edit, minQuantity: e.target.value })}
                                />
                              </Field>
                              <Field label="Jednotková cena">
                                <input
                                  className="inv-input"
                                  value={edit.unitPrice}
                                  onChange={(e) => setEdit({ ...edit, unitPrice: e.target.value })}
                                />
                              </Field>
                              <Field label="Měna">
                                <input
                                  className="inv-input"
                                  value={edit.currency}
                                  onChange={(e) => setEdit({ ...edit, currency: e.target.value })}
                                />
                              </Field>
                              <Field label="Lokace">
                                <input
                                  className="inv-input"
                                  value={edit.location}
                                  onChange={(e) => setEdit({ ...edit, location: e.target.value })}
                                />
                              </Field>
                              <Field label="Dodavatel">
                                <input
                                  className="inv-input"
                                  value={edit.supplier}
                                  onChange={(e) => setEdit({ ...edit, supplier: e.target.value })}
                                />
                              </Field>
                              <Field label="Poznámka" className="sm:col-span-2 lg:col-span-3">
                                <input
                                  className="inv-input"
                                  value={edit.note}
                                  onChange={(e) => setEdit({ ...edit, note: e.target.value })}
                                />
                              </Field>
                              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
                                <Button type="button" disabled={loading} onClick={() => void saveEdit(row.id)}>
                                  Uložit změny
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={loading}
                                  onClick={() => setEditingId(null)}
                                >
                                  Zrušit
                                </Button>
                                <span className="text-muted-foreground text-xs">
                                  Stav zásoby měň přes <strong>Pohyb</strong>, ne tady.
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </FragmentRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>

      <PanelCard
        title={
          <span className="inline-flex items-center gap-2">
            <History className="size-4" aria-hidden /> Poslední pohyby
          </span>
        }
        description="Posledních 20 záznamů příjmů, výdejů a korekcí."
      >
        {movements.length === 0 ? (
          <p className="text-muted-foreground text-sm">Zatím žádné pohyby.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/45">
                  <Th>Kdy</Th>
                  <Th>Položka</Th>
                  <Th>Typ</Th>
                  <Th className="text-right">Množství</Th>
                  <Th className="text-right">Stav po</Th>
                  <Th>Kdo</Th>
                  <Th>Poznámka</Th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-xs tabular-nums">
                      {fmtDateTime(m.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{m.itemName}</span>{" "}
                      <span className="text-muted-foreground font-mono text-xs">{m.itemSku}</span>
                    </td>
                    <td className={cn("px-3 py-2 font-medium", MOVEMENT_META[m.type].className)}>
                      {MOVEMENT_META[m.type].label}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      {m.type === "IN" ? "+" : m.type === "OUT" ? "−" : ""}
                      {fmtQty(m.quantity)} <span className="text-muted-foreground text-xs">{m.unit}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      {fmtQty(m.quantityAfter)} <span className="text-muted-foreground text-xs">{m.unit}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{m.createdByName ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {m.note?.trim() ? m.note : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </label>
  );
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "text-muted-foreground px-3 py-2.5 text-xs font-semibold tracking-wide",
        className,
      )}
    >
      {children}
    </th>
  );
}

function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function MovementTypeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary/12 text-primary"
          : "border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
