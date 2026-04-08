"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  stuckCount: number;
};

export function RequeueFailedDocumentsButton({ stuckCount }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/documents/requeue-failed", { method: "POST" });
      const data = (await res.json()) as { reset?: number; error?: string };
      if (!res.ok) {
        setMessage(data.error ?? `Chyba ${res.status}`);
        return;
      }
      setMessage(`Zařazeno zpět do fronty: ${data.reset ?? 0} dokladů. Spusťte „Zpracovat nové doklady (AI)“.`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (stuckCount <= 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-md border border-amber-300/60 bg-amber-50/80 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <p className="text-sm">
        <strong>{stuckCount}</strong> dokladů má stav <code className="bg-muted rounded px-1">ERROR</code> a typ{" "}
        <code className="bg-muted rounded px-1">UNCLASSIFIED</code> (často po nasazení na Vercel nebo chybějícím
        souboru v <code className="bg-muted rounded px-1">/tmp</code>). Můžete je hromadně vrátit do fronty pro AI.
      </p>
      <Button type="button" variant="secondary" disabled={loading} onClick={() => void onClick()}>
        {loading ? "Upravuji…" : "Zařadit znovu do fronty AI"}
      </Button>
      {message && <p className="text-muted-foreground text-sm whitespace-pre-wrap">{message}</p>}
    </div>
  );
}
