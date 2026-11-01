"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/** Místo mazání: doklad se schová mezi duplicity a jde kdykoli obnovit. */
export function MarkDuplicateButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (!window.confirm("Označit doklad jako duplicitu? Zmizí ze seznamu, obnovit jde v záložce Duplicity.")) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/mark-duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "manual" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(data.error ?? `Chyba ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" size="xs" variant="outline" disabled={loading} onClick={() => void onClick()}>
      {loading ? "…" : "Duplicita"}
    </Button>
  );
}
