"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  invoiceId: string;
};

export function PohodaExportRetryButton({ invoiceId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/export-pohoda`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        error?: string;
        pohodaExportStatus?: string;
        pohodaExportLastError?: string | null;
      };
      if (!res.ok) {
        setMsg(data.error ?? `Chyba ${res.status}`);
        return;
      }
      setMsg(
        data.pohodaExportLastError
          ? `Stav: ${data.pohodaExportStatus ?? "?"}. ${data.pohodaExportLastError}`
          : `Stav: ${data.pohodaExportStatus ?? "hotovo"}.`,
      );
      await router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="xs"
        variant="secondary"
        disabled={busy}
        onClick={() => void retry()}
      >
        {busy ? "Odesílám…" : "Znovu zkusit export POHODA"}
      </Button>
      {msg && <p className="text-muted-foreground text-xs">{msg}</p>}
    </div>
  );
}
