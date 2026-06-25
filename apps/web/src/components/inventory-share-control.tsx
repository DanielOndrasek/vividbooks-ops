"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Link2, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function InventoryShareControl({
  initialToken,
}: {
  initialToken: string | null;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = token ? `${origin}/share/availability/${token}` : null;

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/inventory/share", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };
      if (!res.ok) {
        setErr(j.error || "Odkaz se nepodařilo vytvořit.");
        return;
      }
      setToken(j.token ?? null);
    } catch {
      setErr("Odkaz se nepodařilo vytvořit.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/inventory/share", { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error || "Odkaz se nepodařilo zrušit.");
        return;
      }
      setToken(null);
    } catch {
      setErr("Odkaz se nepodařilo zrušit.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr("Kopírování se nezdařilo — zkopíruj odkaz ručně.");
    }
  }

  return (
    <div className="border-border/70 bg-card space-y-3 rounded-xl border px-4 py-4">
      <div className="flex items-center gap-2">
        <Link2 className="text-primary size-4" aria-hidden />
        <h2 className="text-sm font-semibold">Veřejné sdílení</h2>
      </div>
      <p className="text-muted-foreground text-sm leading-relaxed">
        Vytvoř veřejný odkaz na tento přehled dostupné zásoby. Kdokoliv s odkazem ho uvidí{" "}
        <strong>bez přihlášení</strong> (jen ke čtení). Zrušením odkaz okamžitě přestane platit.
      </p>

      {url ? (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="border-input bg-background h-9 w-full flex-1 rounded-lg border px-3 font-mono text-xs shadow-sm focus-visible:outline-none"
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => void copy()}>
                {copied ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Copy className="size-4" aria-hidden />
                )}
                {copied ? "Zkopírováno" : "Kopírovat"}
              </Button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="border-input hover:bg-muted inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium shadow-sm transition-colors"
              >
                <ExternalLink className="size-4" aria-hidden />
                Otevřít
              </a>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="text-red-600 hover:text-red-700"
            disabled={busy}
            onClick={() => void revoke()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-4" aria-hidden />
            )}
            Zrušit odkaz
          </Button>
        </div>
      ) : (
        <Button type="button" disabled={busy} onClick={() => void create()}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Link2 className="size-4" aria-hidden />
          )}
          Vytvořit veřejný odkaz
        </Button>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
