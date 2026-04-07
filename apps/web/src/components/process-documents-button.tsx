"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ProcessDocumentsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/jobs/process-documents", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(`Chyba ${res.status}: ${(data as { error?: string }).error ?? res.statusText}`);
      } else {
        const d = data as {
          candidates?: number;
          processed?: number;
          failed?: number;
        };
        setMessage(
          `Fronta: ${d.candidates ?? 0} kandidátů, zpracováno ${d.processed ?? 0}, chyb ${d.failed ?? 0}.`,
        );
        router.refresh();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" disabled={loading} onClick={onClick}>
        {loading ? "Extrahuji data (Claude)…" : "Zpracovat nové doklady (AI)"}
      </Button>
      {message && (
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">{message}</p>
      )}
    </div>
  );
}
