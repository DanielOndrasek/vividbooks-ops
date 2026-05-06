"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type DiagnoseMessage = {
  gmailMessageId: string;
  subject: string;
  senderHeader: string;
  receivedAt: string;
  labels: {
    inbox: boolean;
    unread: boolean;
    processed: boolean | null;
    raw: string[];
  };
  matchesCurrentImportQuery: boolean;
  attachmentParts: Array<{
    filename: string;
    mimeType: string;
    normalizedMimeType: string | null;
    hasAttachmentId: boolean;
    eligible: boolean;
    reason: string | null;
  }>;
  eligibleAttachments: Array<{ filename: string; mimeType: string }>;
  database: {
    emailId: string;
    processedAt: string | null;
    status: string;
    documents: Array<{
      id: string;
      originalFilename: string;
      mimeType: string;
      documentType: string;
      status: string;
    }>;
  } | null;
};

type DiagnoseResult = {
  currentImportQuery: string;
  senderSearchQuery: string;
  filteredSenderSearchQuery: string;
  senderMessagesFound: number;
  filteredSenderMessagesFound: number;
  messages: DiagnoseMessage[];
};

export function GmailDiagnoseForm() {
  const [from, setFrom] = useState("jan.nohejl@elaborate.cz");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnoseResult | null>(null);

  async function diagnose() {
    const addr = from.trim();
    if (!addr) {
      setError("Zadej e-mailovou adresu.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/jobs/gmail-diagnose?from=${encodeURIComponent(addr)}`,
        { cache: "no-store" },
      );
      const data = (await res.json().catch(() => ({}))) as
        | DiagnoseResult
        | { error?: string };
      if (!res.ok) {
        setError(("error" in data && data.error) || `Chyba ${res.status}`);
        return;
      }
      setResult(data as DiagnoseResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="border-input bg-background min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
          placeholder="odesilatel@example.com"
        />
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={() => void diagnose()}
        >
          {loading ? "Diagnostikuji..." : "Diagnostika Gmailu"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Ukáže, jestli Gmail zprávu od odesílatele vidí, zda projde aktuálním
        importním dotazem a jaké MIME typy mají přílohy.
      </p>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {result ? (
        <div className="space-y-3 text-xs">
          <div className="text-muted-foreground space-y-1">
            <p>
              Aktuální importní dotaz:{" "}
              <code className="bg-muted rounded px-1">{result.currentImportQuery}</code>
            </p>
            <p>
              Od odesílatele nalezeno:{" "}
              <strong className="text-foreground">{result.senderMessagesFound}</strong>{" "}
              zpráv; přes aktuální importní dotaz:{" "}
              <strong className="text-foreground">
                {result.filteredSenderMessagesFound}
              </strong>
              .
            </p>
          </div>
          {result.messages.length === 0 ? (
            <p className="text-amber-700 dark:text-amber-300">
              Gmail pro tohoto odesílatele nevrátil žádnou zprávu s přílohou.
              Zkontroluj, jestli je refresh token ze správné schránky.
            </p>
          ) : (
            <ul className="space-y-2">
              {result.messages.map((m) => (
                <li key={m.gmailMessageId} className="rounded-md bg-muted/40 p-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium text-foreground">{m.subject}</span>
                    <span
                      className={
                        m.matchesCurrentImportQuery
                          ? "text-green-700 dark:text-green-300"
                          : "text-amber-700 dark:text-amber-300"
                      }
                    >
                      {m.matchesCurrentImportQuery
                        ? "projde importem"
                        : "neprojde importním dotazem"}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    {m.senderHeader} · {new Date(m.receivedAt).toLocaleString("cs-CZ")}
                  </p>
                  <p className="text-muted-foreground">
                    Štítky: inbox={String(m.labels.inbox)}, unread=
                    {String(m.labels.unread)}, zpracováno=
                    {m.labels.processed === null ? "?" : String(m.labels.processed)}
                  </p>
                  <ul className="mt-1 list-inside list-disc">
                    {m.attachmentParts.map((a, idx) => (
                      <li key={`${m.gmailMessageId}-${idx}`}>
                        {a.filename} · Gmail MIME: <code>{a.mimeType}</code>
                        {a.normalizedMimeType ? (
                          <>
                            {" "}
                            → import jako <code>{a.normalizedMimeType}</code>
                          </>
                        ) : null}{" "}
                        · {a.eligible ? "OK" : `přeskočeno: ${a.reason}`}
                      </li>
                    ))}
                  </ul>
                  {m.database ? (
                    <p className="text-muted-foreground mt-1">
                      V DB: {m.database.status}, dokladů:{" "}
                      {m.database.documents.length}
                    </p>
                  ) : (
                    <p className="text-muted-foreground mt-1">V DB zatím není.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
