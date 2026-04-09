"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

export type DocumentTableRow = {
  id: string;
  receivedAtLabel: string;
  supplierName: string | null;
  amountWithVatLabel: string | null;
  documentType: string;
  status: string;
  needsManualReview: boolean;
  invoiceId: string | null;
  canRequeueAi: boolean;
  canDeleteDocument: boolean;
  canConfirmPayment: boolean;
};

type Props = {
  rows: DocumentTableRow[];
  canRunJobs: boolean;
};

export function DocumentsInteractiveTable({ rows, canRunJobs }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busyPaymentDoc, setBusyPaymentDoc] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const requeueableIds = useMemo(
    () => rows.filter((r) => r.canRequeueAi).map((r) => r.id),
    [rows],
  );

  const deletableIds = useMemo(
    () => rows.filter((r) => r.canDeleteDocument).map((r) => r.id),
    [rows],
  );

  const bulkSelectableIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.canRequeueAi || r.canDeleteDocument) {
        set.add(r.id);
      }
    }
    return [...set];
  }, [rows]);

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

  const toggleAllOnPage = useCallback(() => {
    if (bulkSelectableIds.length === 0) {
      return;
    }
    setSelected((prev) => {
      const allSelected = bulkSelectableIds.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        for (const id of bulkSelectableIds) {
          next.delete(id);
        }
        return next;
      }
      const next = new Set(prev);
      for (const id of bulkSelectableIds) {
        next.add(id);
      }
      return next;
    });
  }, [bulkSelectableIds]);

  const selectedEligibleRequeue = useMemo(() => {
    const list: string[] = [];
    for (const id of selected) {
      const row = rows.find((r) => r.id === id);
      if (row?.canRequeueAi) {
        list.push(id);
      }
    }
    return list;
  }, [selected, rows]);

  const selectedDeletable = useMemo(() => {
    const list: string[] = [];
    for (const id of selected) {
      const row = rows.find((r) => r.id === id);
      if (row?.canDeleteDocument) {
        list.push(id);
      }
    }
    return list;
  }, [selected, rows]);

  const allBulkSelected =
    bulkSelectableIds.length > 0 &&
    bulkSelectableIds.every((id) => selected.has(id));

  const rowBusy = loading || busyPaymentDoc !== null;

  async function confirmPayment(documentId: string) {
    setBusyPaymentDoc(documentId);
    setMessage(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/review-resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_payment" }),
        cache: "no-store",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error || `Chyba ${res.status}`);
        return;
      }
      setMessage("Platba potvrzena.");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
      router.refresh();
    } finally {
      setBusyPaymentDoc(null);
    }
  }

  async function deleteDocument(documentId: string) {
    if (
      !window.confirm(
        "Trvale smazat tento doklad včetně související faktury nebo evidence platby v databázi? Tuto akci nelze vrátit. Soubory na Google Drive se tím nesmažou.",
      )
    ) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? `Chyba ${res.status}`);
        return;
      }
      setMessage("Doklad byl smazán.");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function submitRequeue() {
    if (selectedEligibleRequeue.length === 0) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/documents/requeue-selected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: selectedEligibleRequeue }),
      });
      const data = (await res.json()) as {
        updated?: number;
        requested?: number;
        error?: string;
      };
      if (!res.ok) {
        setMessage(data.error ?? `Chyba ${res.status}`);
        return;
      }
      setMessage(
        `Zařazeno k AI: ${data.updated ?? 0} z ${data.requested ?? selectedEligibleRequeue.length} vybraných. Spusťte „Zpracovat nové doklady (AI)“ na dashboardu.`,
      );
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function submitBulkDelete() {
    if (selectedDeletable.length === 0) {
      return;
    }
    const n = selectedDeletable.length;
    if (
      !window.confirm(
        `Trvale smazat ${n} dokladů včetně souvisejících faktur nebo evidence plateb v databázi? Soubory na Google Drive se tím nesmažou.`,
      )
    ) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/documents/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: selectedDeletable }),
        cache: "no-store",
      });
      const data = (await res.json()) as {
        error?: string;
        deleted?: number;
        failed?: number;
        results?: { documentId: string; ok: boolean; error?: string }[];
      };
      if (!res.ok) {
        setMessage(data.error ?? `Chyba ${res.status}`);
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
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {canRunJobs && selected.size > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          {selectedEligibleRequeue.length > 0 && (
            <Button
              type="button"
              disabled={loading}
              onClick={() => void submitRequeue()}
            >
              {loading
                ? "Odesílám…"
                : `Zařadit vybrané k AI (${selectedEligibleRequeue.length})`}
            </Button>
          )}
          {selectedDeletable.length > 0 && (
            <Button
              type="button"
              variant="destructive"
              disabled={loading}
              onClick={() => void submitBulkDelete()}
            >
              {loading ? "Mažu…" : `Smazat vybrané (${selectedDeletable.length})`}
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
              {canRunJobs && (
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    className="accent-primary h-4 w-4 cursor-pointer"
                    checked={allBulkSelected}
                    disabled={bulkSelectableIds.length === 0}
                    onChange={() => toggleAllOnPage()}
                    title="Vybrat na stránce všechny, u kterých jde mazání nebo zařazení k AI"
                    aria-label="Vybrat vše způsobilé na stránce"
                  />
                </th>
              )}
              <th className="p-3 font-medium">Přijato</th>
              <th className="p-3 font-medium">Dodavatel</th>
              <th className="p-3 font-medium">Částka</th>
              <th className="p-3 font-medium">Typ</th>
              <th className="p-3 font-medium">Stav</th>
              <th className="p-3 font-medium">Kontrola</th>
              <th className="p-3 font-medium">Odkaz</th>
              {canRunJobs && <th className="p-3 font-medium min-w-[9rem]">Záznam</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const canCheck = r.canRequeueAi || r.canDeleteDocument;
              const payBusy = busyPaymentDoc === r.id;
              return (
                <tr
                  key={r.id}
                  className={
                    r.needsManualReview
                      ? "border-b border-amber-300/80 bg-amber-50/50 last:border-0 dark:bg-amber-950/20"
                      : "border-b last:border-0"
                  }
                >
                  {canRunJobs && (
                    <td className="p-3 align-middle">
                      {canCheck ? (
                        <input
                          type="checkbox"
                          className="accent-primary h-4 w-4 cursor-pointer"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          aria-label={`Vybrat doklad ${r.id}`}
                        />
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                  )}
                  <td className="text-muted-foreground whitespace-nowrap p-3">
                    {r.receivedAtLabel}
                  </td>
                  <td className="max-w-[160px] truncate p-3">
                    {r.supplierName || "—"}
                  </td>
                  <td className="whitespace-nowrap p-3">{r.amountWithVatLabel || "—"}</td>
                  <td className="p-3 font-mono text-xs">{r.documentType}</td>
                  <td className="p-3 font-mono text-xs">{r.status}</td>
                  <td className="p-3">
                    {r.needsManualReview ? (
                      <span className="text-amber-800 dark:text-amber-200 text-xs font-medium">
                        Ano
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {r.invoiceId ? (
                      <Link href={`/invoices/${r.invoiceId}`} className="text-primary underline">
                        Detail
                      </Link>
                    ) : (
                      <a
                        href={`/api/documents/${r.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary text-xs underline"
                      >
                        Soubor
                      </a>
                    )}
                  </td>
                  {canRunJobs && (
                    <td className="p-3">
                      <div className="flex flex-col gap-1.5">
                        {r.canConfirmPayment && (
                          <Button
                            type="button"
                            size="xs"
                            variant="default"
                            disabled={rowBusy || payBusy}
                            onClick={() => void confirmPayment(r.id)}
                          >
                            {payBusy ? "…" : "Platba v pořádku"}
                          </Button>
                        )}
                        {r.canDeleteDocument ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="destructive"
                            disabled={rowBusy || payBusy}
                            onClick={() => void deleteDocument(r.id)}
                          >
                            Smazat
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
