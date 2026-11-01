"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function RestoreDuplicateButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/restore-duplicate`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Chyba ${res.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={() => void onClick()}>
        {loading ? "Obnovuji…" : "Obnovit"}
      </Button>
      {error && <span className="text-destructive text-xs">{error}</span>}
    </div>
  );
}
