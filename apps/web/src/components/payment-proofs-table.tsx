"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

export type PaymentProofRowDto = {
  id: string;
  documentId: string;
  proofType: string | null;
  note: string | null;
  driveUrl: string | null;
  /** Hromadné / jednotlivé smazání evidence (nelze, pokud existuje faktura u stejného dokumentu). */
  canDeleteProof: boolean;
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
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  const deletableProofIds = useMemo(
    () => sortedRows.filter((p) => p.canDeleteProof).map((p) => p.id),
    [sortedRows],
  );

  const toggle = useCallback((proofId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(proofId)) {
        next.delete(proofId);
      } else {
        next.add(proofId);
      }
      return next;
    });
  }, []);

  const toggleAllDeletable = useCallback(() => {
    if (deletableProofIds.length === 0) {
      return;
    }
    setSelected((prev) => {
      const allOn = deletableProofIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOn) {
        for (const id of deletableProofIds) {
          next.delete(id);
        }
      } else {
        for (const id of deletableProofIds) {
          next.add(id);
        }
      }
      return next;
    });
  }, [deletableProofIds]);

  const selectedDeletableProofIds = useMemo(() => {
    const list: string[] = [];
    for (const id of selected) {
      if (deletableProofIds.includes(id)) {
        list.push(id);
      }
    }
    return list;
  }, [selected, deletableProofIds]);

  const allDeletableSelected =
    deletableProofIds.length > 0 &&
    deletableProofIds.every((id) => selected.has(id));

  function toggleReceivedSort() {
    setReceivedSort((s) => (s === "desc" ? "asc" : "desc"));
  }

  const rowBusyGlobal = bulkDeleting || busyId !== null;

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
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(proofId);
        return next;
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteBulk() {
    if (selectedDeletableProofIds.length === 0) {
      return;
    }
    const n = selectedDeletableProofIds.length;
    if (
      !window.confirm(
        `Smazat evidenci u ${n} vybraných plateb? Doklady v systému zůstanou jako zamítnuté (bez vazby na platbu), pokud u nich není faktura.`,
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/payment-proofs/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proofIds: selectedDeletableProofIds }),
        cache: "no-store",
      });
      const data = (await res.json()) as {
        error?: string;
        deleted?: number;
        failed?: number;
        results?: { proofId: string; ok: boolean; error?: string }[];
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
          parts.push(`${e.proofId.slice(0, 8)}…: ${e.error ?? "?"}`);
        }
      } else if (errs.length > 5) {
        parts.push(`${errs.length} chyb — zkontrolujte stav řádků.`);
      }
      setMessage(parts.join(" "));
      setSelected(new Set());
      router.refresh();
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      {canAct && selected.size > 0 && selectedDeletableProofIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            disabled={bulkDeleting}
            onClick={() => void deleteBulk()}
          >
            {bulkDeleting
              ? "Mažu…"
              : `Smazat vybrané (${selectedDeletableProofIds.length})`}
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
                    disabled={deletableProofIds.length === 0 || bulkDeleting}
                    onChange={() => toggleAllDeletable()}
                    title="Vybrat všechny řádky, u kterých lze smazat evidenci platby"
                    aria-label="Vybrat vše ke smazání evidence"
                  />
                </th>
              )}
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
                  {canAct && (
                    <td className="p-3 align-middle">
                      {p.canDeleteProof ? (
                        <input
                          type="checkbox"
                          className="accent-primary h-4 w-4 cursor-pointer"
                          checked={selected.has(p.id)}
                          onChange={() => toggle(p.id)}
                          disabled={bulkDeleting}
                          aria-label={`Vybrat platbu ${p.id}`}
                        />
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                  )}
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
                            disabled={rowBusyGlobal}
                            onClick={() => void retryDriveUpload(p.id)}
                            className="shrink-0"
                          >
                            {b ? "…" : "Nahrát na Drive"}
                          </Button>
                        )}
                        {p.canDeleteProof && (
                          <Button
                            type="button"
                            size="xs"
                            variant="destructive"
                            disabled={rowBusyGlobal}
                            onClick={() => void deleteProof(p.id)}
                            className="shrink-0"
                          >
                            {b ? "…" : "Smazat platbu"}
                          </Button>
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
