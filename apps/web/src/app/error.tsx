"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Zachytí neošetřené chyby v serverových komponentách pod stromem app.
 * Obecná hláška z Vercelu bez kontextu — tady alespoň návod pro správce.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error.message, error.digest ?? "");
  }, [error]);

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="border-border max-w-md space-y-6 rounded-2xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-foreground text-xl font-semibold tracking-tight">
          Stránku se nepodařilo načíst
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Na serveru došlo k chybě (často databáze nebo přihlášení). Zkuste obnovit stránku. Jestli to
          nepomůže, v{" "}
          <strong className="text-foreground">Vercel → Logs → Runtime</strong> najdete přesnou příčinu
          při opakování chyby.
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Typicky zkontrolujte proměnné: <code className="text-foreground">DATABASE_URL</code>,{" "}
          <code className="text-foreground">AUTH_SECRET</code> / <code className="text-foreground">NEXTAUTH_SECRET</code>
          , <code className="text-foreground">GOOGLE_CLIENT_ID</code>,{" "}
          <code className="text-foreground">GOOGLE_CLIENT_SECRET</code>.
          {error.digest ? (
            <>
              {" "}
              <span className="text-foreground">Digest: {error.digest}</span>
            </>
          ) : null}
        </p>
        <Button type="button" onClick={() => reset()} className="w-full">
          Zkusit znovu
        </Button>
      </div>
    </div>
  );
}
