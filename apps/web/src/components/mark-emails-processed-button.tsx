"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";

type MarkResult = {
  jobId?: string | null;
  query?: string;
  dryRun?: boolean;
  matchedCount?: number;
  markedCount?: number;
  reachedLimit?: boolean;
  limit?: number;
  error?: string;
};

type Stage =
  | { kind: "idle" }
  | { kind: "counting" }
  | { kind: "preview"; matchedCount: number; reachedLimit: boolean; limit: number; query: string }
  | { kind: "marking"; expected: number }
  | {
      kind: "done";
      matchedCount: number;
      markedCount: number;
      reachedLimit: boolean;
      limit: number;
      query: string;
    }
  | { kind: "error"; message: string };

async function postMark(body: Record<string, unknown>): Promise<MarkResult> {
  const res = await fetch("/api/jobs/mark-emails-processed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as MarkResult;
  if (!res.ok) {
    throw new Error(data.error || `Chyba ${res.status}`);
  }
  return data;
}

export function MarkEmailsProcessedButton() {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });

  const reset = useCallback(() => setStage({ kind: "idle" }), []);

  const onCount = useCallback(async () => {
    setStage({ kind: "counting" });
    try {
      const data = await postMark({ dryRun: true });
      setStage({
        kind: "preview",
        matchedCount: data.matchedCount ?? 0,
        reachedLimit: Boolean(data.reachedLimit),
        limit: data.limit ?? 0,
        query: data.query ?? "",
      });
    } catch (e) {
      setStage({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const onConfirmMark = useCallback(
    async (expected: number) => {
      setStage({ kind: "marking", expected });
      try {
        const data = await postMark({});
        setStage({
          kind: "done",
          matchedCount: data.matchedCount ?? 0,
          markedCount: data.markedCount ?? 0,
          reachedLimit: Boolean(data.reachedLimit),
          limit: data.limit ?? 0,
          query: data.query ?? "",
        });
      } catch (e) {
        setStage({
          kind: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [],
  );

  return (
    <div className="space-y-2">
      {stage.kind === "idle" && (
        <Button type="button" variant="outline" onClick={() => void onCount()}>
          Označit současné e-maily jako zpracované…
        </Button>
      )}

      {stage.kind === "counting" && (
        <Button type="button" variant="outline" disabled>
          Počítám zprávy…
        </Button>
      )}

      {stage.kind === "preview" && (
        <div className="border-amber-500/30 bg-amber-500/10 space-y-3 rounded-lg border p-3 text-sm">
          {stage.matchedCount === 0 ? (
            <>
              <p>
                Žádná zpráva neodpovídá aktuálnímu dotazu — buď je schránka prázdná, nebo
                všechny mají štítek <code>Zpracováno</code> (viz GMAIL_PROCESSED_LABEL).
                Nemám co označit.
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={reset}>
                  Zavřít
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => void onCount()}>
                  Přepočítat
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>
                Najde se <strong>{stage.matchedCount}</strong>{" "}
                {stage.reachedLimit ? `(strop ${stage.limit})` : ""} zpráv k označení.
                Přidá se jim štítek <code>Zpracováno</code> a odebere se UNREAD, aby je{" "}
                <strong>polling do aplikace nestáhl</strong>.
                <br />
                Přílohy se <strong>nestahují</strong> a v aplikaci se nevytvoří žádné nové
                doklady. Tuto akci v Gmailu vrátíte odebráním štítku.
              </p>
              {stage.reachedLimit ? (
                <p className="text-amber-700 dark:text-amber-300">
                  Pozor: stropuje se na {stage.limit}. Pokud je v schránce víc starých zpráv,
                  spusťte akci znovu, dokud nebude počet 0.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    const ok = window.confirm(
                      `Opravdu označit ${stage.matchedCount} zpráv jako zpracované? ` +
                        "Tato akce v Gmailu jim přidá štítek a odebere UNREAD.",
                    );
                    if (ok) {
                      void onConfirmMark(stage.matchedCount);
                    }
                  }}
                >
                  Označit {stage.matchedCount} zpráv jako zpracované
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={reset}>
                  Zrušit
                </Button>
              </div>
              {stage.query ? (
                <p className="text-muted-foreground text-xs">
                  Dotaz Gmail: <code>{stage.query}</code>
                </p>
              ) : null}
            </>
          )}
        </div>
      )}

      {stage.kind === "marking" && (
        <Button type="button" variant="destructive" disabled>
          Označuji {stage.expected} zpráv…
        </Button>
      )}

      {stage.kind === "done" && (
        <div className="border-green-500/30 bg-green-500/10 space-y-2 rounded-lg border p-3 text-sm">
          <p>
            Hotovo. Označeno <strong>{stage.markedCount}</strong> z{" "}
            <strong>{stage.matchedCount}</strong> zpráv jako zpracované.
            {stage.reachedLimit
              ? ` Strop ${stage.limit} byl využit — v Gmailu mohou ještě být další staré zprávy, akci klidně spusťte znovu.`
              : ""}
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void onCount()}>
              Spočítat zbytek
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset}>
              Zavřít
            </Button>
          </div>
        </div>
      )}

      {stage.kind === "error" && (
        <div className="border-destructive/30 bg-destructive/10 space-y-2 rounded-lg border p-3 text-sm">
          <p className="text-destructive">Chyba: {stage.message}</p>
          <Button type="button" size="sm" variant="outline" onClick={reset}>
            Zavřít
          </Button>
        </div>
      )}
    </div>
  );
}
