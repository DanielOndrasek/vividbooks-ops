"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  invoiceId: string;
  canAct: boolean;
};

export function InvoiceActions({ invoiceId, canAct }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/approve`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string; driveUrl?: string | null };
      if (!res.ok) {
        setMessage(data.error || "Schválení selhalo.");
        return;
      }
      setMessage(data.driveUrl ? `Nahráno. Odkaz: ${data.driveUrl}` : "Schváleno.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    const reason = window.prompt("Důvod zamítnutí (volitelné):") ?? "";
    setBusy(true);
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
      setMessage("Zamítnuto.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!canAct) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void approve()}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Schválit
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void reject()}
          className="border-input bg-background rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Zamítnout
        </button>
      </div>
      {message && <p className="text-muted-foreground text-sm">{message}</p>}
    </div>
  );
}
