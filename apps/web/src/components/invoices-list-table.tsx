"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

export type InvoiceListRowDto = {
  id: string;
  documentId: string;
  receivedAtLabel: string;
  supplierName: string | null;
  amountWithoutVatLabel: string | null;
  amountWithVatLabel: string | null;
  dueDateLabel: string | null;
  documentType: string;
  documentStatus: string;
  needsManualReview: boolean;
  detailHref: string;
  canApprove: boolean;
  canConvertToPayment: boolean;
  canDeleteDocument: boolean;
};

type Props = {
  rows: InvoiceListRowDto[];
  canAct: boolean;
};

type Busy =
  | { kind: "approve"; id: string }
  | { kind: "convert"; id: string }
  | { kind: "delete"; documentId: string }
  | { kind: "bulk-approve" }
  | { kind: "bulk-convert" }
  | { kind: "bulk-delete" }
  | null;

export function InvoicesListTable({ rows, canAct }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectableIds = useMemo(
    () =>
      rows
        .filter(
          (r) => r.canApprove || r.canConvertToPayment || r.canDeleteDocument,
        )
        .map((r) => r.id),
    [rows],
  );

  const bulkBusy =
    busy?.kind === "bulk-approve" ||
    busy?.kind === "bulk-convert" ||
    busy?.kind === "bulk-delete";

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

  const selectedDeletableDocumentIds = useMemo(() => {
    const list: string[] = [];
    for (const id of selected) {
      const row = rows.find((r) => r.id === id);
      if (row?.canDeleteDocument) {
        list.push(row.documentId);
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
  function rowBusyDelete(documentId: string) {
    return busy?.kind === "delete" && busy.documentId === documentId;
  }

  async function approveOne(invoiceId: string) {
    setBusy({ kind: "approve", id: invoiceId });
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/approve`, {
        method: "POST",
        cache: "no-store",
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
      await router.refresh();
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
        { method: "POST", cache: "no-store" },
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
      await router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function deleteDocumentRow(documentId: string, invoiceId: string) {
    if (
      !window.confirm(
        "Trvale smazat doklad včetně této faktury v databázi? Soubory na Drive se tím nesmažou.",
      )
    ) {
      return;
    }
    setBusy({ kind: "delete", documentId });
    setMessage(null);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error || "Smazání selhalo.");
        return;
      }
      setMessage("Doklad byl smazán.");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(invoiceId);
        return next;
      });
      await router.refresh();
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
        cache: "no-store",
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
      await router.refresh();
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
        cache: "no-store",
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
      await router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function deleteBulk() {
    if (selectedDeletableDocumentIds.length === 0) {
      return;
    }
    const n = selectedDeletableDocumentIds.length;
    if (
      !window.confirm(
        `Trvale smazat ${n} dokladů včetně souvisejících faktur v databázi? Soubory na Drive se tím nesmažou.`,
      )
    ) {
      return;
    }
    setBusy({ kind: "bulk-delete" });
    setMessage(null);
    try {
      const res = await fetch("/api/documents/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: selectedDeletableDocumentIds }),
        cache: "no-store",
      });
      const data = (await res.json()) as {
        error?: string;
        deleted?: number;
        failed?: number;
        results?: { documentId: string; ok: boolean; error?: string }[];
      };
      if (!res.ok) {
        setMessage(data.error || `Chyba ${res.status}`);
        return;
      }
      const parts = [
        `Smazáno: ${data.deleted ?? 0}, neúspěch: ${data.failed ?? 0}.`,
      ];
      const errs = data.results?.filter((x) => !x.ok) ?? [];
      if (errs.length > 0 && errs.length <= 5) {
        for (const e of errs) {
          parts.push(`${e.documentId.slice(0, 8)}…: ${e.error ?? "?"}`);
        }
      } else if (errs.length > 5) {
        parts.push(`${errs.length} chyb — zkontrolujte auditní log.`);
      }
      setMessage(parts.join(" "));
      setSelected(new Set());
      await router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const rowDisabled = busy !== null;

  return (
    <div className="space-y-3">
      {canAct && selected.size > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          {selectedApprovable.length > 0 && (
            <Button
              type="button"
              variant="default"
              disabled={bulkBusy || selectedApprovable.length === 0}
              onClick={() => void approveBulk()}
            >
              {busy?.kind === "bulk-approve" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Schvaluji…
                </>
              ) : (
                `Schválit vybrané (${selectedApprovable.length})`
              )}
            </Button>
          )}
          {selectedConvertible.length > 0 && (
            <Button
              type="button"
              variant="outline"
              disabled={bulkBusy || selectedConvertible.length === 0}
              onClick={() => void convertBulk()}
            >
              {busy?.kind === "bulk-convert" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Převádím…
                </>
              ) : (
                `Na doklad platby (${selectedConvertible.length})`
              )}
            </Button>
          )}
          {selectedDeletableDocumentIds.length > 0 && (
            <Button
              type="button"
              variant="destructive"
              disabled={bulkBusy || selectedDeletableDocumentIds.length === 0}
              onClick={() => void deleteBulk()}
            >
              {busy?.kind === "bulk-delete" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Mažu…
                </>
              ) : (
                `Smazat vybrané (${selectedDeletableDocumentIds.length})`
              )}
            </Button>
          )}
        </div>
      )}
      {message && (
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">{message}</p>
      )}
      <div className="table-panel">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {canAct && (
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    className="accent-primary h-4 w-4 cursor-pointer"
                    checked={allSelectableSelected}
                    disabled={selectableIds.length === 0}
                    onChange={() => toggleAllSelectable()}
                    title="Vybrat všechny řádky vhodné ke schválení, převodu nebo smazání"
                    aria-label="Vybrat vše na stránce"
                  />
                </th>
              )}
              <th className="p-3 font-medium">Přijato</th>
              <th className="p-3 font-medium">Dodavatel</th>
              <th className="p-3 font-medium">Částka</th>
              <th className="p-3 font-medium">Splatnost</th>
              <th className="p-3 font-medium">Typ</th>
              <th className="p-3 font-medium">Stav</th>
              <th className="p-3 font-medium">Kontrola</th>
              <th className="p-3 font-medium">Odkaz</th>
              {canAct && <th className="p-3 font-medium w-36">Záznam</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => (
              <tr
                key={inv.id}
                className={
                  inv.needsManualReview
                    ? "border-b border-amber-300/80 bg-amber-50/50 last:border-0 dark:bg-amber-950/20"
                    : "border-b last:border-0"
                }
              >
                {canAct && (
                  <td className="p-3 align-middle">
                    {inv.canApprove || inv.canConvertToPayment || inv.canDeleteDocument ? (
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
                <td className="max-w-[160px] truncate p-3">
                  {inv.supplierName || "—"}
                </td>
                <td className="whitespace-nowrap p-3">
                  {inv.amountWithVatLabel ? (
                    <div className="flex flex-col gap-0.5">
                      <span>{inv.amountWithVatLabel}</span>
                      {inv.amountWithoutVatLabel ? (
                        <span className="text-muted-foreground text-xs">
                          bez DPH {inv.amountWithoutVatLabel}
                        </span>
                      ) : null}
                    </div>
                  ) : inv.amountWithoutVatLabel ? (
                    inv.amountWithoutVatLabel
                  ) : (
                    "—"
                  )}
                </td>
                <td className="whitespace-nowrap p-3">{inv.dueDateLabel || "—"}</td>
                <td className="p-3 font-mono text-xs">{inv.documentType}</td>
                <td className="p-3 font-mono text-xs">{inv.documentStatus}</td>
                <td className="p-3">
                  {inv.needsManualReview ? (
                    <span className="text-amber-800 dark:text-amber-200 text-xs font-medium">
                      Ano
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
                    <Link href={inv.detailHref} className="text-primary underline">
                      Detail
                    </Link>
                    <a
                      href={`/api/documents/${inv.documentId}/file`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary text-xs underline"
                    >
                      Soubor
                    </a>
                  </div>
                </td>
                {canAct && (
                  <td className="p-3">
                    <div className="flex flex-col items-stretch gap-1.5">
                      {inv.canApprove && (
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          disabled={rowDisabled || rowBusyConvert(inv.id)}
                          onClick={() => void approveOne(inv.id)}
                        >
                          {rowBusyApprove(inv.id) ? (
                            <>
                              <Loader2
                                className="size-3.5 shrink-0 animate-spin"
                                aria-hidden
                              />
                              Schvaluji…
                            </>
                          ) : (
                            "Schválit"
                          )}
                        </Button>
                      )}
                      {inv.canConvertToPayment && (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={rowDisabled || rowBusyApprove(inv.id)}
                          onClick={() => void convertOne(inv.id)}
                        >
                          {rowBusyConvert(inv.id) ? (
                            <>
                              <Loader2
                                className="size-3.5 shrink-0 animate-spin"
                                aria-hidden
                              />
                              Převádím…
                            </>
                          ) : (
                            "→ Platba"
                          )}
                        </Button>
                      )}
                      {inv.canDeleteDocument ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="destructive"
                          disabled={
                            rowDisabled ||
                            rowBusyApprove(inv.id) ||
                            rowBusyConvert(inv.id)
                          }
                          onClick={() =>
                            void deleteDocumentRow(inv.documentId, inv.id)
                          }
                        >
                          {rowBusyDelete(inv.documentId) ? (
                            <>
                              <Loader2
                                className="size-3.5 shrink-0 animate-spin"
                                aria-hidden
                              />
                              Mažu…
                            </>
                          ) : (
                            "Smazat"
                          )}
                        </Button>
                      ) : (
                        <span
                          className="text-muted-foreground text-xs"
                          title="Schválené nelze smazat"
                        >
                          —
                        </span>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
