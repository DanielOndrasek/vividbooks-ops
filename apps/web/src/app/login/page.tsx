import { redirect } from "next/navigation";
import type { Session } from "next-auth";

import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";

function loginErrorHint(code: string | undefined): string | null {
  if (!code) {
    return null;
  }
  const c = code.toLowerCase();
  if (c === "configuration") {
    return (
      "Chyba konfigurace serveru (Auth.js). Na Vercelu v Production zkontrolujte proměnné: " +
      "AUTH_SECRET nebo NEXTAUTH_SECRET (min. 32 znaků), GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, " +
      "DATABASE_URL. Po úpravě env proměnných znovu nasaďte (Redeploy). " +
      "Volitelně AUTH_URL nebo NEXTAUTH_URL = veřejná URL aplikace (https://…)."
    );
  }
  if (c === "accessdenied") {
    return (
      "Přístup odepřen. Účet nemusí být z povolené domény (ALLOWED_EMAIL_DOMAIN) nebo Google přihlášení odmítlo oprávnění."
    );
  }
  if (c === "verification") {
    return "Ověřovací odkaz vypršel nebo už byl použit. Zkuste se přihlásit znovu.";
  }
  if (c === "oauthsignin" || c === "oauthcallback" || c === "oauthaccountnotlinked") {
    return "Problém s Google přihlášením (OAuth). Zkontrolujte redirect URI v Google Cloud Console a shodu klienta s Vercel env.";
  }
  return `Přihlášení se nezdařilo (kód: ${code}). Zkuste znovu nebo kontaktujte správce.`;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;

  let session: Session | null = null;
  let authBroken: string | null = null;
  try {
    session = await auth();
  } catch (e) {
    console.error("[login] auth()", e);
    authBroken =
      "Relace se nepodařila načíst (pravděpodobně chybí AUTH_SECRET nebo je poškozená konfigurace). Zkontrolujte prostředí na Vercelu.";
  }

  if (session?.user) {
    redirect(params.callbackUrl ?? "/");
  }

  const errorDetail =
    authBroken ?? loginErrorHint(params.error);

  return (
    <div className="from-background via-primary/[0.06] to-muted/40 relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.55 0.12 198 / 0.25), transparent)",
        }}
        aria-hidden
      />
      <div className="relative w-full max-w-md space-y-8">
        <div className="text-center">
          <p className="text-primary text-sm font-semibold tracking-wide uppercase">
            Vividbooks Ops
          </p>
          <h1 className="text-foreground mt-2 text-3xl font-semibold tracking-tight">
            Přihlášení
          </h1>
          <p className="text-muted-foreground mx-auto mt-3 max-w-sm text-sm leading-relaxed">
            Interní přístup k fakturám a dokladům. Použijte firemní účet Google z povolené domény.
          </p>
        </div>
        <div className="border-border/80 space-y-6 rounded-2xl border bg-card/95 p-8 shadow-lg backdrop-blur-sm">
          {errorDetail && (
            <p className="text-destructive bg-destructive/10 rounded-xl px-4 py-3 text-center text-sm leading-snug whitespace-pre-wrap">
              {errorDetail}
            </p>
          )}
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: params.callbackUrl ?? "/" });
            }}
          >
            <Button type="submit" size="lg" className="h-11 w-full text-base font-semibold">
              Pokračovat přes Google
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
