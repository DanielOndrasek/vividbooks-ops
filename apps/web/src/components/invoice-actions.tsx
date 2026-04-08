"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  invoiceId: string;
  canAct: boolean;
};

type Busy = false | "approve" | "reject";

export function InvoiceActions({ invoiceId, canAct }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(false);
  const [message, setMessage] = useState<string | null>(null);

  async function approve() {
    setBusy("approve");
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/approve`, {
        method: "POST",
        cache: "no-store",
      });
      const data = (await res.json()) as { error?: string; driveUrl?: string | null };
      if (!res.ok) {
        setMessage(data.error || "Schválení selhalo.");
        return;
      }
      setMessage(
        data.driveUrl
          ? `Schváleno. Odkaz na Drive byl uložen.`
          : "Schváleno.",
      );
      await router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    const reason = window.prompt("Důvod zamítnutí (volitelné):") ?? "";
    setBusy("reject");
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
      setMessage("Zamítnuto.");
      await router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!canAct) {
    return null;
  }

  const disabled = busy !== false;

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap gap-2"
        aria-busy={disabled}
        aria-live="polite"
      >
        <Button
          type="button"
          disabled={disabled}
          onClick={() => void approve()}
          className="min-w-[8.5rem]"
        >
          {busy === "approve" ? (
            <>
              <Loader2
                className="size-4 shrink-0 animate-spin"
                aria-hidden
              />
              Schvaluji…
            </>
          ) : (
            "Schválit"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => void reject()}
          className="min-w-[8.5rem]"
        >
          {busy === "reject" ? (
            <>
              <Loader2
                className="size-4 shrink-0 animate-spin"
                aria-hidden
              />
              Odesílám…
            </>
          ) : (
            "Zamítnout"
          )}
        </Button>
      </div>
      {message && (
        <p className="text-muted-foreground text-sm leading-relaxed">{message}</p>
      )}
    </div>
  );
}
