"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export type PaymentProofRowDto = {
  id: string;
  documentId: string;
  proofType: string | null;
  note: string | null;
  driveUrl: string | null;
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

export function PaymentProofsTable({ rows, canAct }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
              <th className="p-3 font-medium">Přijato</th>
              <th className="p-3 font-medium">Zpracováno e-mailu</th>
              <th className="p-3 font-medium">Soubor</th>
              <th className="p-3 font-medium">Stav</th>
              <th className="p-3 font-medium">Uloženo</th>
              <th className="p-3 font-medium min-w-[140px]">Odkaz</th>
              {canAct && <th className="p-3 font-medium w-32">Akce</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
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
                  <td className="p-3">
                    {p.driveUrl ? (
                      <a
                        href={p.driveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline"
                      >
                        Drive
                      </a>
                    ) : (
                      <a
                        href={p.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary text-xs underline"
                      >
                        Náhled
                      </a>
                    )}
                  </td>
                  {canAct && (
                    <td className="space-y-1 p-3">
                      {!p.driveUrl && (
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          disabled={b}
                          onClick={() => void retryDriveUpload(p.id)}
                          className="mr-1"
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
                      >
                        {b ? "…" : "Smazat platbu"}
                      </Button>
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
