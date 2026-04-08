"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
};

type Props = {
  rows: NeedsReviewRowDto[];
  canAct: boolean;
};

export function NeedsReviewTable({ rows, canAct }: Props) {
  const router = useRouter();
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error || `Chyba ${res.status}`);
        return;
      }
      setMessage("Uloženo.");
      router.refresh();
    } finally {
      setBusyDoc(null);
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
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error || "Zamítnutí selhalo.");
        return;
      }
      setMessage("Faktura zamítnuta.");
      router.refresh();
    } finally {
      setBusyDoc(null);
    }
  }

  return (
    <div className="space-y-3">
      {message && (
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">{message}</p>
      )}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
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
              const b = busyDoc === d.documentId || busyDoc === `inv:${d.invoiceId ?? ""}`;
              return (
                <tr key={d.documentId} className="border-b last:border-0">
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
                        {!d.canConfirmInvoice &&
                          !d.canConfirmPayment &&
                          !d.canRequeueAi &&
                          !d.canRejectInvoice &&
                          !d.canDismiss && (
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
