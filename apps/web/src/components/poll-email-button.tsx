"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function PollEmailButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/jobs/poll-email", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(`Chyba ${res.status}: ${(data as { error?: string }).error ?? res.statusText}`);
      } else {
        setMessage(
          `Hotovo: naskenováno zpráv ${(data as { messagesScanned?: number }).messagesScanned ?? 0}, ` +
            `nových dokladů ${(data as { documentsCreated?: number }).documentsCreated ?? 0}, ` +
            `duplicit ${(data as { skippedDuplicates?: number }).skippedDuplicates ?? 0}.`,
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" disabled={loading} onClick={onClick}>
        {loading ? "Stahuji…" : "Stáhnout nové přílohy z Gmailu"}
      </Button>
      {message && (
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">{message}</p>
      )}
    </div>
  );
}
