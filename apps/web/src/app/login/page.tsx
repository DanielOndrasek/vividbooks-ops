import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (session?.user) {
    redirect(params.callbackUrl ?? "/");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Přihlášení</h1>
          <p className="text-muted-foreground text-sm">
            Interní nástroj pro faktury a doklady. Pouze účty z povolené domény.
          </p>
        </div>
        {params.error && (
          <p className="text-destructive text-center text-sm">
            Přihlášení se nezdařilo. Zkontroluj doménu účtu nebo konfiguraci OAuth.
          </p>
        )}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: params.callbackUrl ?? "/" });
          }}
        >
          <Button type="submit" className="w-full">
            Pokračovat přes Google
          </Button>
        </form>
      </div>
    </div>
  );
}
