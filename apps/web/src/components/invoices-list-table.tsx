"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

export type InvoiceListRowDto = {
  id: string;
  receivedAtLabel: string;
  supplierName: string | null;
  amountWithoutVatLabel: string | null;
  amountWithVatLabel: string | null;
  dueDateLabel: string | null;
  documentStatus: string;
  originalFilename: string;
  extractionConfidenceLabel: string | null;
  detailHref: string;
  canApprove: boolean;
  canConvertToPayment: boolean;
};

type Props = {
  rows: InvoiceListRowDto[];
  canAct: boolean;
};

type Busy =
  | { kind: "approve"; id: string }
  | { kind: "convert"; id: string }
  | { kind: "bulk-approve" }
  | { kind: "bulk-convert" }
  | null;

export function InvoicesListTable({ rows, canAct }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectableIds = useMemo(
    () =>
      rows.filter((r) => r.canApprove || r.canConvertToPayment).map((r) => r.id),
    [rows],
  );

  const bulkBusy = busy?.kind === "bulk-approve" || busy?.kind === "bulk-convert";

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAllSelectable = useCallback(() => {
    if (selectableIds.length === 0) {
      return;
    }
    setSelected((prev) => {
      const allOnPage = selectableIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOnPage) {
        for (const id of selectableIds) {
          next.delete(id);
        }
      } else {
        for (const id of selectableIds) {
          next.add(id);
        }
      }
      return next;
    });
  }, [selectableIds]);

  const selectedApprovable = useMemo(() => {
    const list: string[] = [];
    for (const id of selected) {
      const row = rows.find((r) => r.id === id);
      if (row?.canApprove) {
        list.push(id);
      }
    }
    return list;
  }, [selected, rows]);

  const selectedConvertible = useMemo(() => {
    const list: string[] = [];
    for (const id of selected) {
      const row = rows.find((r) => r.id === id);
      if (row?.canConvertToPayment) {
        list.push(id);
      }
    }
    return list;
  }, [selected, rows]);

  const allSelectableSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function rowBusyApprove(id: string) {
    return busy?.kind === "approve" && busy.id === id;
  }
  function rowBusyConvert(id: string) {
    return busy?.kind === "convert" && busy.id === id;
  }

  async function approveOne(invoiceId: string) {
    setBusy({ kind: "approve", id: invoiceId });
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/approve`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        error?: string;
        driveUrl?: string | null;
        ok?: boolean;
      };
      if (!res.ok) {
        setMessage(data.error || "Schválení selhalo.");
        return;
      }
      setMessage(
        data.driveUrl
          ? `Faktura schválena. Drive: ${data.driveUrl}`
          : "Faktura schválena.",
      );
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(invoiceId);
        return next;
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function convertOne(invoiceId: string) {
    const ok = window.confirm(
      "Převést tuto položku z faktur na doklad o platbě? Záznam faktury se smaže, dokument bude v sekci plateb (a případně se nahraje na Drive do složky plateb).",
    );
    if (!ok) {
      return;
    }
    setBusy({ kind: "convert", id: invoiceId });
    setMessage(null);
    try {
      const res = await fetch(
        `/api/invoices/${invoiceId}/convert-to-payment-proof`,
        { method: "POST" },
      );
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) {
        setMessage(data.error || "Převod selhal.");
        return;
      }
      setMessage("Doklad převeden na platbu. Zkontrolujte záložku Platby.");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(invoiceId);
        return next;
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function approveBulk() {
    if (selectedApprovable.length === 0) {
      return;
    }
    setBusy({ kind: "bulk-approve" });
    setMessage(null);
    try {
      const res = await fetch("/api/invoices/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: selectedApprovable }),
      });
      const data = (await res.json()) as {
        error?: string;
        approved?: number;
        failed?: number;
        results?: { invoiceId: string; ok: boolean; error?: string }[];
      };
      if (!res.ok) {
        setMessage(data.error || `Chyba ${res.status}`);
        return;
      }
      const parts: string[] = [
        `Schválení: úspěch ${data.approved ?? 0}, chyb ${data.failed ?? 0}.`,
      ];
      const errs = data.results?.filter((x) => !x.ok) ?? [];
      if (errs.length > 0 && errs.length <= 5) {
        for (const e of errs) {
          parts.push(`${e.invoiceId.slice(0, 8)}…: ${e.error ?? "?"}`);
        }
      } else if (errs.length > 5) {
        parts.push(`${errs.length} chyb — auditu (bulk_approved).`);
      }
      setMessage(parts.join(" "));
      setSelected(new Set());
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function convertBulk() {
    if (selectedConvertible.length === 0) {
      return;
    }
    const ok = window.confirm(
      `Převést ${selectedConvertible.length} položek z faktur na doklady o platbě? U každé se smaže řádek faktury a dokument se objeví mezi platbami.`,
    );
    if (!ok) {
      return;
    }
    setBusy({ kind: "bulk-convert" });
    setMessage(null);
    try {
      const res = await fetch("/api/invoices/bulk-convert-to-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: selectedConvertible }),
      });
      const data = (await res.json()) as {
        error?: string;
        converted?: number;
        failed?: number;
        results?: { invoiceId: string; ok: boolean; error?: string }[];
      };
      if (!res.ok) {
        setMessage(data.error || `Chyba ${res.status}`);
        return;
      }
      const parts: string[] = [
        `Převod na platbu: úspěch ${data.converted ?? 0}, chyb ${data.failed ?? 0}.`,
      ];
      const errs = data.results?.filter((x) => !x.ok) ?? [];
      if (errs.length > 0 && errs.length <= 5) {
        for (const e of errs) {
          parts.push(`${e.invoiceId.slice(0, 8)}…: ${e.error ?? "?"}`);
        }
      } else if (errs.length > 5) {
        parts.push(`${errs.length} chyb — audit (bulk_converted_to_payment_proof).`);
      }
      setMessage(parts.join(" "));
      setSelected(new Set());
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const rowDisabled = busy !== null;

  return (
    <div className="space-y-3">
      {canAct && selectableIds.length > 0 && (
        <div className="flex flex-col gap-3 rounded-md border bg-card/50 p-4">
          <p className="text-muted-foreground text-sm">
            Zaškrtněte řádky a použijte hromadné schválení, nebo hromadný převod na doklad platby (špatná
            klasifikace AI). Checkbox je u položek, které lze schválit nebo převést.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="default"
              disabled={bulkBusy || selectedApprovable.length === 0}
              onClick={() => void approveBulk()}
            >
              {busy?.kind === "bulk-approve"
                ? "Schvaluji…"
                : `Schválit vybrané (${selectedApprovable.length})`}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={bulkBusy || selectedConvertible.length === 0}
              onClick={() => void convertBulk()}
            >
              {busy?.kind === "bulk-convert"
                ? "Převádím…"
                : `Na doklad platby (${selectedConvertible.length})`}
            </Button>
          </div>
        </div>
      )}
      {message && (
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">{message}</p>
      )}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              {canAct && (
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    className="accent-primary h-4 w-4 cursor-pointer"
                    checked={allSelectableSelected}
                    disabled={selectableIds.length === 0}
                    onChange={() => toggleAllSelectable()}
                    title="Vybrat všechny řádky vhodné ke schválení nebo převodu na platbu"
                    aria-label="Vybrat vše na stránce"
                  />
                </th>
              )}
              <th className="p-3 font-medium">Přijato</th>
              <th className="p-3 font-medium">Dodavatel</th>
              <th className="p-3 font-medium">Bez DPH</th>
              <th className="p-3 font-medium">S DPH</th>
              <th className="p-3 font-medium">Splatnost</th>
              <th className="p-3 font-medium">Stav</th>
              <th className="p-3 font-medium">Soubor</th>
              <th className="p-3 font-medium">Jistota</th>
              <th className="p-3 font-medium">Akce</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => (
              <tr key={inv.id} className="border-b last:border-0">
                {canAct && (
                  <td className="p-3 align-middle">
                    {inv.canApprove || inv.canConvertToPayment ? (
                      <input
                        type="checkbox"
                        className="accent-primary h-4 w-4 cursor-pointer"
                        checked={selected.has(inv.id)}
                        onChange={() => toggle(inv.id)}
                        aria-label={`Vybrat fakturu ${inv.id}`}
                      />
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">—</span>
                    )}
                  </td>
                )}
                <td className="text-muted-foreground whitespace-nowrap p-3">
                  {inv.receivedAtLabel}
                </td>
                <td className="max-w-[140px] truncate p-3">
                  {inv.supplierName || "—"}
                </td>
                <td className="whitespace-nowrap p-3">
                  {inv.amountWithoutVatLabel || "—"}
                </td>
                <td className="whitespace-nowrap p-3">
                  {inv.amountWithVatLabel || "—"}
                </td>
                <td className="whitespace-nowrap p-3">{inv.dueDateLabel || "—"}</td>
                <td className="p-3 font-mono text-xs">{inv.documentStatus}</td>
                <td className="max-w-[120px] truncate p-3" title={inv.originalFilename}>
                  {inv.originalFilename}
                </td>
                <td className="text-muted-foreground p-3">
                  {inv.extractionConfidenceLabel || "—"}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={inv.detailHref}
                      className="text-primary font-medium underline"
                    >
                      Detail
                    </Link>
                    {canAct && inv.canApprove && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={rowDisabled || rowBusyConvert(inv.id)}
                        onClick={() => void approveOne(inv.id)}
                      >
                        {rowBusyApprove(inv.id) ? "…" : "Schválit"}
                      </Button>
                    )}
                    {canAct && inv.canConvertToPayment && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={rowDisabled || rowBusyApprove(inv.id)}
                        onClick={() => void convertOne(inv.id)}
                      >
                        {rowBusyConvert(inv.id) ? "…" : "→ Platba"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
