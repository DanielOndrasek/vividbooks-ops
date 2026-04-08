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
};

type Props = {
  rows: DocumentTableRow[];
  canRunJobs: boolean;
};

export function DocumentsInteractiveTable({ rows, canRunJobs }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const requeueableIds = useMemo(
    () => rows.filter((r) => r.canRequeueAi).map((r) => r.id),
    [rows],
  );

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
    if (requeueableIds.length === 0) {
      return;
    }
    setSelected((prev) => {
      const allSelected = requeueableIds.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        for (const id of requeueableIds) {
          next.delete(id);
        }
        return next;
      }
      const next = new Set(prev);
      for (const id of requeueableIds) {
        next.add(id);
      }
      return next;
    });
  }, [requeueableIds]);

  const selectedEligible = useMemo(() => {
    const list: string[] = [];
    for (const id of selected) {
      const row = rows.find((r) => r.id === id);
      if (row?.canRequeueAi) {
        list.push(id);
      }
    }
    return list;
  }, [selected, rows]);

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
    if (selectedEligible.length === 0) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/documents/requeue-selected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: selectedEligible }),
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
        `Zařazeno k AI: ${data.updated ?? 0} z ${data.requested ?? selectedEligible.length} vybraných. Spusťte „Zpracovat nové doklady (AI)“ na dashboardu.`,
      );
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const allRequeueableSelected =
    requeueableIds.length > 0 && requeueableIds.every((id) => selected.has(id));

  return (
    <div className="space-y-3">
      {canRunJobs && requeueableIds.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            Vyberte doklady vhodné k opakované AI extrakci (bez vazby na fakturu), potvrďte tlačítkem.
          </p>
          <Button
            type="button"
            disabled={loading || selectedEligible.length === 0}
            onClick={() => void submitRequeue()}
          >
            {loading
              ? "Odesílám…"
              : `Zařadit vybrané k AI (${selectedEligible.length})`}
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
              {canRunJobs && (
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    className="accent-primary h-4 w-4 cursor-pointer"
                    checked={allRequeueableSelected}
                    disabled={requeueableIds.length === 0}
                    onChange={() => toggleAllOnPage()}
                    title="Vybrat na stránce všechny, které lze znovu k AI"
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
              {canRunJobs && <th className="p-3 font-medium w-28">Záznam</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
                    {r.canRequeueAi ? (
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
                    {r.canDeleteDocument ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="destructive"
                        disabled={loading}
                        onClick={() => void deleteDocument(r.id)}
                      >
                        Smazat
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs" title="Schválené nelze smazat">
                        —
                      </span>
                    )}
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
