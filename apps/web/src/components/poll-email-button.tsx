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
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        messagesScanned?: number;
        documentsCreated?: number;
        skippedDuplicates?: number;
        queryUsed?: string;
        onlyUnread?: boolean;
      };
      if (!res.ok) {
        setMessage(`Chyba ${res.status}: ${data.error ?? res.statusText}`);
      } else {
        const ms = data.messagesScanned ?? 0;
        const dc = data.documentsCreated ?? 0;
        const sk = data.skippedDuplicates ?? 0;
        let text =
          `Hotovo: naskenováno zpráv ${ms}, ` +
          `nových dokladů ${dc}, ` +
          `duplicit ${sk}.`;
        if (ms === 0 && data.onlyUnread) {
          text +=
            "\n\nŽádná zpráva nevyhověla dotazu. Častý důvod: zpráva je už přečtená — aplikace při zpracování odebere nepřečtení. " +
            "Odebrání jen štítku „Zpracováno“ nestačí: v Gmailu ji označ znovu jako nepřečtenou, nebo na Vercelu nastav GMAIL_ONLY_UNREAD=0 " +
            "(stáhne i přečtené bez štítku zpracováno; může jich být víc).";
        }
        if (ms > 0 && dc === 0 && sk > 0) {
          text +=
            "\n\nZprávy se našly, ale všechny přílohy byly přeskočeny jako duplicity (stejný soubor nebo stejná příloha už v databázi).";
        }
        if (data.queryUsed) {
          text += `\n\nDotaz Gmail: ${data.queryUsed}`;
        }
        setMessage(text);
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
