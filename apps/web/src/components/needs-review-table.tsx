"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

export type NeedsReviewRowDto = {
  documentId: string;
  receivedAtLabel: string;
  documentType: string;
  status: string;
  originalFilename: string;
  noteShort: string;
  noteFull: string | null;
  invoiceId: string | null;
  fileUrl: string;
  canRequeueAi: boolean;
  canConfirmInvoice: boolean;
  canConfirmPayment: boolean;
  canDismiss: boolean;
  canRejectInvoice: boolean;
  canDeleteDocument: boolean;
};

type Props = {
  rows: NeedsReviewRowDto[];
  canAct: boolean;
};

export function NeedsReviewTable({ rows, canAct }: Props) {
  const router = useRouter();
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const deletableIds = useMemo(
    () => rows.filter((r) => r.canDeleteDocument).map((r) => r.documentId),
    [rows],
  );

  const toggle = useCallback((documentId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      return next;
    });
  }, []);

  const toggleAllDeletable = useCallback(() => {
    if (deletableIds.length === 0) {
      return;
    }
    setSelected((prev) => {
      const allOn = deletableIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOn) {
        for (const id of deletableIds) {
          next.delete(id);
        }
      } else {
        for (const id of deletableIds) {
          next.add(id);
        }
      }
      return next;
    });
  }, [deletableIds]);

  const selectedDeletable = useMemo(() => {
    const list: string[] = [];
    for (const id of selected) {
      if (deletableIds.includes(id)) {
        list.push(id);
      }
    }
    return list;
  }, [selected, deletableIds]);

  const allDeletableSelected =
    deletableIds.length > 0 && deletableIds.every((id) => selected.has(id));

  async function callResolve(
    documentId: string,
    action: "requeue_ai" | "confirm_invoice" | "confirm_payment" | "dismiss",
    reason?: string,
  ) {
    setBusyDoc(documentId);
    setMessage(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/review-resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
        cache: "no-store",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error || `Chyba ${res.status}`);
        return;
      }
      setMessage("Uloženo.");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
      await router.refresh();
    } finally {
      setBusyDoc(null);
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
    setBusyDoc(documentId);
    setMessage(null);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error || `Chyba ${res.status}`);
        return;
      }
      setMessage("Doklad byl smazán.");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
      await router.refresh();
    } finally {
      setBusyDoc(null);
    }
  }

  async function deleteBulk() {
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
    setBulkDeleting(true);
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
      setBulkDeleting(false);
    }
  }

  async function rejectInvoice(invoiceId: string) {
    const reason = window.prompt("Důvod zamítnutí (volitelné):") ?? "";
    setBusyDoc(`inv:${invoiceId}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
        cache: "no-store",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error || "Zamítnutí selhalo.");
        return;
      }
      setMessage("Faktura zamítnuta.");
      await router.refresh();
    } finally {
      setBusyDoc(null);
    }
  }

  return (
    <div className="space-y-3">
      {canAct && selected.size > 0 && selectedDeletable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            disabled={bulkDeleting}
            onClick={() => void deleteBulk()}
          >
            {bulkDeleting
              ? "Mažu…"
              : `Smazat vybrané (${selectedDeletable.length})`}
          </Button>
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
                    checked={allDeletableSelected}
                    disabled={deletableIds.length === 0}
                    onChange={() => toggleAllDeletable()}
                    title="Vybrat všechny doklady, které lze smazat"
                    aria-label="Vybrat vše ke smazání"
                  />
                </th>
              )}
              <th className="p-3 font-medium">Přijato</th>
              <th className="p-3 font-medium">Typ</th>
              <th className="p-3 font-medium">Stav</th>
              <th className="p-3 font-medium">Soubor</th>
              <th className="p-3 font-medium">Chyba / pozn.</th>
              <th className="p-3 font-medium min-w-[200px]">Doklad</th>
              {canAct && <th className="p-3 font-medium min-w-[280px]">Vyřešit kontrolu</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const b =
                bulkDeleting ||
                busyDoc === d.documentId ||
                busyDoc === `inv:${d.invoiceId ?? ""}`;
              return (
                <tr key={d.documentId} className="border-b last:border-0">
                  {canAct && (
                    <td className="p-3 align-middle">
                      {d.canDeleteDocument ? (
                        <input
                          type="checkbox"
                          className="accent-primary h-4 w-4 cursor-pointer"
                          checked={selected.has(d.documentId)}
                          onChange={() => toggle(d.documentId)}
                          disabled={bulkDeleting}
                          aria-label={`Vybrat doklad ${d.documentId}`}
                        />
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                  )}
                  <td className="text-muted-foreground whitespace-nowrap p-3">
                    {d.receivedAtLabel}
                  </td>
                  <td className="p-3 font-mono text-xs">{d.documentType}</td>
                  <td className="p-3 font-mono text-xs">{d.status}</td>
                  <td className="max-w-[160px] truncate p-3" title={d.originalFilename}>
                    {d.originalFilename}
                  </td>
                  <td
                    className="text-muted-foreground max-w-[240px] truncate p-3 text-xs"
                    title={d.noteFull ?? undefined}
                  >
                    {d.noteShort}
                  </td>
                  <td className="p-3">
                    <a
                      href={d.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary font-medium underline"
                    >
                      Otevřít doklad
                    </a>
                    {d.invoiceId ? (
                      <>
                        {" · "}
                        <Link
                          href={`/invoices/${d.invoiceId}`}
                          className="text-primary underline"
                        >
                          Detail faktury
                        </Link>
                      </>
                    ) : null}
                  </td>
                  {canAct && (
                    <td className="p-3">
                      <div className="flex flex-col gap-1.5">
                        {d.canConfirmInvoice && (
                          <Button
                            type="button"
                            size="xs"
                            variant="default"
                            disabled={b}
                            onClick={() =>
                              void callResolve(d.documentId, "confirm_invoice")
                            }
                          >
                            {busyDoc === d.documentId ? "…" : "OK → ke schválení"}
                          </Button>
                        )}
                        {d.canConfirmPayment && (
                          <Button
                            type="button"
                            size="xs"
                            variant="default"
                            disabled={b}
                            onClick={() =>
                              void callResolve(d.documentId, "confirm_payment")
                            }
                          >
                            {busyDoc === d.documentId ? "…" : "Platba v pořádku"}
                          </Button>
                        )}
                        {d.canRequeueAi && (
                          <Button
                            type="button"
                            size="xs"
                            variant="secondary"
                            disabled={b}
                            onClick={() =>
                              void callResolve(d.documentId, "requeue_ai")
                            }
                          >
                            Znovu k AI
                          </Button>
                        )}
                        {d.canRejectInvoice && d.invoiceId && (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={b}
                            onClick={() => void rejectInvoice(d.invoiceId!)}
                          >
                            Zamítnout fakturu
                          </Button>
                        )}
                        {d.canDismiss && (
                          <Button
                            type="button"
                            size="xs"
                            variant="destructive"
                            disabled={b}
                            onClick={() => {
                              const r = window.prompt(
                                "Vyřadit doklad z fronty (volitelný důvod):",
                              );
                              if (r === null) {
                                return;
                              }
                              void callResolve(d.documentId, "dismiss", r || undefined);
                            }}
                          >
                            Vyřadit z fronty
                          </Button>
                        )}
                        {d.canDeleteDocument && (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={b}
                            onClick={() => void deleteDocument(d.documentId)}
                          >
                            Smazat doklad
                          </Button>
                        )}
                        {!d.canConfirmInvoice &&
                          !d.canConfirmPayment &&
                          !d.canRequeueAi &&
                          !d.canRejectInvoice &&
                          !d.canDismiss &&
                          !d.canDeleteDocument && (
                            <span className="text-muted-foreground text-xs">—</span>
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
