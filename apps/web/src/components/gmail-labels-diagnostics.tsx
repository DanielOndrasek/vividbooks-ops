"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";

type GmailLabel = {
  id: string;
  name: string;
  type: string;
  labelListVisibility: string | null;
  messageListVisibility: string | null;
};

type LabelsResult = {
  configuredProcessedLabel: string;
  labels: GmailLabel[];
  exactMatch: GmailLabel | null;
  fuzzyMatches: GmailLabel[];
  error?: string;
};

type DiagnoseMessage = {
  gmailMessageId: string;
  subject: string;
  senderEmail: string | null;
  senderHeader: string;
  receivedAt: string | null;
  labelIds: string[];
  labelNames: string[];
  hasProcessedLabel: boolean;
  stillMatchesPolling: boolean;
  found: boolean;
  error?: string;
};

type DiagnoseResult = {
  hasJob: boolean;
  jobId?: string;
  jobStatus?: string;
  jobCreatedAt?: string;
  jobCompletedAt?: string | null;
  configuredProcessedLabel?: string;
  processedLabelExistsInGmail?: boolean;
  queryUsed?: string;
  currentQuery?: string;
  messagesScanned?: number;
  messagesInspected?: number;
  stillMatchingCurrentQuery?: number;
  withProcessedLabel?: number;
  notFound?: number;
  messages?: DiagnoseMessage[];
  message?: string;
  error?: string;
};

export function GmailLabelsDiagnostics() {
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [labelsData, setLabelsData] = useState<LabelsResult | null>(null);
  const [labelsError, setLabelsError] = useState<string | null>(null);

  const [diagLoading, setDiagLoading] = useState(false);
  const [diagData, setDiagData] = useState<DiagnoseResult | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);

  const loadLabels = useCallback(async () => {
    setLabelsLoading(true);
    setLabelsError(null);
    setLabelsData(null);
    try {
      const res = await fetch("/api/jobs/gmail-labels", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as LabelsResult;
      if (!res.ok) {
        setLabelsError(data.error || `Chyba ${res.status}`);
        return;
      }
      setLabelsData(data);
    } catch (e) {
      setLabelsError(e instanceof Error ? e.message : String(e));
    } finally {
      setLabelsLoading(false);
    }
  }, []);

  const loadDiag = useCallback(async () => {
    setDiagLoading(true);
    setDiagError(null);
    setDiagData(null);
    try {
      const res = await fetch("/api/jobs/diagnose-last-poll", {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as DiagnoseResult;
      if (!res.ok) {
        setDiagError(data.error || `Chyba ${res.status}`);
        return;
      }
      setDiagData(data);
    } catch (e) {
      setDiagError(e instanceof Error ? e.message : String(e));
    } finally {
      setDiagLoading(false);
    }
  }, []);

  return (
    <div className="space-y-4 rounded-lg border border-dashed p-3">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Diagnostika štítků a posledního stahování</h3>
        <p className="text-muted-foreground text-xs">
          {`Pokud jste označili e-maily v Gmailu jako "Zpracováno", ale aplikace pořád
          něco stahuje, ukáže se tu, kde je nesoulad — typicky špatný název štítku,
          vnořený štítek (např. `}
          <code>Faktury/Zpracováno</code>
          {`), nebo nové zprávy, které ještě štítek nemají.`}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={labelsLoading}
            onClick={() => void loadLabels()}
          >
            {labelsLoading ? "Načítám…" : "Zobrazit štítky v Gmailu"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={diagLoading}
            onClick={() => void loadDiag()}
          >
            {diagLoading ? "Diagnostikuji…" : "Diagnostika posledního stahování"}
          </Button>
        </div>

        {labelsError ? (
          <p className="text-destructive text-sm">Štítky: {labelsError}</p>
        ) : null}

        {labelsData ? (
          <div className="space-y-3 rounded-md border bg-card p-3 text-xs">
            <div>
              <p className="text-foreground">
                Konfigurace <code>GMAIL_PROCESSED_LABEL</code>:{" "}
                <strong>{labelsData.configuredProcessedLabel}</strong>
              </p>
              {labelsData.exactMatch ? (
                <p className="text-green-700 dark:text-green-300">
                  ✓ Štítek existuje v Gmailu (ID {labelsData.exactMatch.id}).
                </p>
              ) : (
                <p className="text-destructive">
                  ✗ V Gmailu se NENAŠEL štítek s tímto názvem (case-insensitive).
                  Polling proto nemá co odfiltrovat — všechny zprávy s přílohou
                  projdou.
                </p>
              )}
              {labelsData.fuzzyMatches.length > 0 ? (
                <p className="text-amber-700 dark:text-amber-300">
                  Možní kandidáti (částečná shoda jména):{" "}
                  {labelsData.fuzzyMatches.map((l) => l.name).join(", ")} — možná
                  jste použili jeden z těchto.
                </p>
              ) : null}
            </div>
            <details>
              <summary className="text-muted-foreground cursor-pointer">
                Všech {labelsData.labels.length} štítků v Gmailu
              </summary>
              <ul className="mt-2 max-h-64 space-y-0.5 overflow-auto">
                {labelsData.labels.map((l) => (
                  <li
                    key={l.id}
                    className={
                      labelsData.exactMatch?.id === l.id
                        ? "rounded bg-green-500/15 px-1.5 py-0.5"
                        : ""
                    }
                  >
                    <code>{l.name}</code>{" "}
                    <span className="text-muted-foreground">
                      ({l.type}, id={l.id})
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ) : null}

        {diagError ? (
          <p className="text-destructive text-sm">Diagnostika: {diagError}</p>
        ) : null}

        {diagData ? (
          <div className="space-y-3 rounded-md border bg-card p-3 text-xs">
            {!diagData.hasJob ? (
              <p className="text-muted-foreground">{diagData.message}</p>
            ) : (
              <>
                <div className="space-y-1">
                  <p>
                    Job <code>{diagData.jobId}</code> · status{" "}
                    <strong>{diagData.jobStatus}</strong> ·{" "}
                    {diagData.jobCreatedAt
                      ? new Date(diagData.jobCreatedAt).toLocaleString("cs-CZ")
                      : null}
                  </p>
                  <p className="text-muted-foreground">
                    Hledaný štítek <code>{diagData.configuredProcessedLabel}</code> v
                    Gmailu existuje:{" "}
                    <strong
                      className={
                        diagData.processedLabelExistsInGmail
                          ? "text-green-700 dark:text-green-300"
                          : "text-destructive"
                      }
                    >
                      {diagData.processedLabelExistsInGmail ? "ano" : "ne"}
                    </strong>
                  </p>
                  <p className="text-muted-foreground">
                    Dotaz použitý při tomto pollu:{" "}
                    <code className="bg-muted rounded px-1">{diagData.queryUsed}</code>
                  </p>
                  {diagData.queryUsed !== diagData.currentQuery ? (
                    <p className="text-amber-700 dark:text-amber-300">
                      Konfigurace dotazu se od té doby změnila — aktuálně by polling
                      použil:{" "}
                      <code className="bg-muted rounded px-1">
                        {diagData.currentQuery}
                      </code>
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md bg-muted/40 p-2">
                    <div className="text-muted-foreground">Naskenováno zpráv</div>
                    <div className="text-foreground text-lg font-semibold tabular-nums">
                      {diagData.messagesScanned ?? 0}
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <div className="text-muted-foreground">
                      Aktuálně mají štítek <code>{diagData.configuredProcessedLabel}</code>
                    </div>
                    <div className="text-foreground text-lg font-semibold tabular-nums">
                      {diagData.withProcessedLabel ?? 0}
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <div className="text-muted-foreground">
                      Pořád by prošly pollingem
                    </div>
                    <div
                      className={`text-lg font-semibold tabular-nums ${
                        (diagData.stillMatchingCurrentQuery ?? 0) > 0
                          ? "text-destructive"
                          : "text-foreground"
                      }`}
                    >
                      {diagData.stillMatchingCurrentQuery ?? 0}
                    </div>
                  </div>
                </div>
                {diagData.messages && diagData.messages.length > 0 ? (
                  <details>
                    <summary className="text-muted-foreground cursor-pointer">
                      Detail po jednotlivých zprávách ({diagData.messages.length})
                    </summary>
                    <ul className="mt-2 max-h-96 space-y-2 overflow-auto">
                      {diagData.messages.map((m) => (
                        <li
                          key={m.gmailMessageId}
                          className={
                            m.stillMatchesPolling
                              ? "rounded-md bg-destructive/10 p-2"
                              : "rounded-md bg-muted/30 p-2"
                          }
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-foreground font-medium">
                              {m.subject}
                            </span>
                            <span
                              className={
                                m.hasProcessedLabel
                                  ? "text-green-700 dark:text-green-300"
                                  : "text-destructive"
                              }
                            >
                              {m.hasProcessedLabel
                                ? "má štítek Zpracováno"
                                : "NEMÁ štítek Zpracováno"}
                            </span>
                          </div>
                          <p className="text-muted-foreground">
                            {m.senderEmail ?? m.senderHeader} ·{" "}
                            {m.receivedAt
                              ? new Date(m.receivedAt).toLocaleString("cs-CZ")
                              : "(nenalezeno v Gmailu)"}
                          </p>
                          <p className="text-muted-foreground break-all">
                            Štítky:{" "}
                            {m.labelNames.length > 0
                              ? m.labelNames.join(", ")
                              : "(žádné)"}
                          </p>
                          {m.error ? (
                            <p className="text-destructive">Chyba: {m.error}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
