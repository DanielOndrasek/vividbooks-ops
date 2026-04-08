"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

export type PaymentProofRowDto = {
  id: string;
  documentId: string;
  proofType: string | null;
  note: string | null;
  driveUrl: string | null;
  /** Pro řazení podle data přijetí e-mailu (UTC timestamp). */
  receivedAtMs: number;
  receivedAtLabel: string;
  processedAtLabel: string | null;
  originalFilename: string;
  documentStatus: string;
  storedAtLabel: string | null;
  previewUrl: string;
};

type Props = {
  rows: PaymentProofRowDto[];
  canAct: boolean;
};

type ReceivedSort = "desc" | "asc";

export function PaymentProofsTable({ rows, canAct }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [receivedSort, setReceivedSort] = useState<ReceivedSort>("desc");

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) =>
      receivedSort === "desc"
        ? b.receivedAtMs - a.receivedAtMs
        : a.receivedAtMs - b.receivedAtMs,
    );
    return copy;
  }, [rows, receivedSort]);

  function toggleReceivedSort() {
    setReceivedSort((s) => (s === "desc" ? "asc" : "desc"));
  }

  async function retryDriveUpload(proofId: string) {
    setBusyId(proofId);
    setMessage(null);
    try {
      const res = await fetch(`/api/payment-proofs/${proofId}`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        driveUrl?: string | null;
      };
      if (!res.ok) {
        setMessage(data.error ?? `Chyba ${res.status}`);
        return;
      }
      if (data.ok) {
        setMessage(
          data.driveUrl
            ? "Soubor je na Google Drive (složka dokladů o platbě)."
            : "Hotovo.",
        );
        router.refresh();
        return;
      }
      setMessage(data.error ?? "Neznámá chyba.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProof(proofId: string) {
    if (
      !window.confirm(
        "Smazat evidenci platby? Doklad v systému zůstane jako zamítnutý (bez vazby na platbu).",
      )
    ) {
      return;
    }
    setBusyId(proofId);
    setMessage(null);
    try {
      const res = await fetch(`/api/payment-proofs/${proofId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? `Chyba ${res.status}`);
        return;
      }
      setMessage("Evidence platby byla odstraněna.");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {message && (
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">{message}</p>
      )}
      <div className="table-panel">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-3 font-medium">Typ / pozn.</th>
              <th className="p-3 font-medium">
                <button
                  type="button"
                  className="hover:text-foreground text-muted-foreground inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
                  onClick={toggleReceivedSort}
                  aria-label={
                    receivedSort === "desc"
                      ? "Řadit přijato od nejnovějších, kliknutím od nejstarších"
                      : "Řadit přijato od nejstarších, kliknutím od nejnovějších"
                  }
                >
                  Přijato
                  <span className="text-foreground tabular-nums" aria-hidden>
                    {receivedSort === "desc" ? "↓" : "↑"}
                  </span>
                </button>
              </th>
              <th className="p-3 font-medium">Zpracováno e-mailu</th>
              <th className="p-3 font-medium">Soubor</th>
              <th className="p-3 font-medium">Stav</th>
              <th className="p-3 font-medium">Uloženo</th>
              <th className="p-3 font-medium">Detail</th>
              <th className="p-3 font-medium whitespace-nowrap">Drive</th>
              {canAct && (
                <th className="p-3 text-right font-medium whitespace-nowrap">Akce</th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((p) => {
              const b = busyId === p.id;
              return (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="max-w-[200px] p-3">
                    <div className="font-medium">{p.proofType || "—"}</div>
                    {p.note && (
                      <div className="text-muted-foreground truncate text-xs" title={p.note}>
                        {p.note}
                      </div>
                    )}
                  </td>
                  <td className="text-muted-foreground whitespace-nowrap p-3">
                    {p.receivedAtLabel}
                  </td>
                  <td className="text-muted-foreground whitespace-nowrap p-3">
                    {p.processedAtLabel ?? "—"}
                  </td>
                  <td className="max-w-[140px] truncate p-3" title={p.originalFilename}>
                    {p.originalFilename}
                  </td>
                  <td className="p-3 font-mono text-xs">{p.documentStatus}</td>
                  <td className="text-muted-foreground whitespace-nowrap p-3">
                    {p.storedAtLabel ?? "—"}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <a
                      href={p.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary text-sm underline underline-offset-2"
                    >
                      Otevřít
                    </a>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {p.driveUrl ? (
                      <a
                        href={p.driveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary text-sm underline underline-offset-2"
                      >
                        Otevřít na Drive
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {canAct && (
                    <td className="p-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {!p.driveUrl && (
                          <Button
                            type="button"
                            size="xs"
                            variant="secondary"
                            disabled={b}
                            onClick={() => void retryDriveUpload(p.id)}
                            className="shrink-0"
                          >
                            {b ? "…" : "Nahrát na Drive"}
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="xs"
                          variant="destructive"
                          disabled={b}
                          onClick={() => void deleteProof(p.id)}
                          className="shrink-0"
                        >
                          {b ? "…" : "Smazat platbu"}
                        </Button>
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
