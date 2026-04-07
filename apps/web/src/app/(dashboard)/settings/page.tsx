import { auth } from "@/auth";
import { PipedriveDealFieldsButton } from "@/components/pipedrive-deal-fields-button";
import { PollEmailButton } from "@/components/poll-email-button";
import { ProcessDocumentsButton } from "@/components/process-documents-button";
import { assertGmailConfigured } from "@/lib/gmail-config";
import { getPipedriveEnv, maskSecret } from "@/lib/integrations/env";
import { buildUnprocessedQuery } from "@/services/gmail";
import { isDriveConfigured } from "@/services/drive";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const previewQuery = buildUnprocessedQuery();
  const pd = getPipedriveEnv();

  let gmailOk = false;
  try {
    assertGmailConfigured();
    gmailOk = true;
  } catch {
    gmailOk = false;
  }
  const driveOk = isDriveConfigured();

  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim() || "";
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN?.trim() || "";

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nastavení integrací</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Jedna aplikace Vividbooks Ops — všechny klíče se nastavují v prostředí
          (lokálně <code className="bg-muted rounded px-1 text-xs">apps/web/.env</code>, v cloudu GitHub
          Secrets → Vercel). Citlivé hodnoty zde jen zkráceně.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="font-medium">Přihlášení uživatelů (Google / NextAuth)</h2>
        <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
          <li>
            <code>AUTH_SECRET</code>, <code>NEXTAUTH_URL</code> (veřejná URL této aplikace)
          </li>
          <li>
            <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>
          </li>
          <li>
            <code>ALLOWED_EMAIL_DOMAIN</code> — volitelně omezení Workspace
          </li>
        </ul>
        <div className="text-muted-foreground grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <span className="block text-[10px] uppercase">NEXTAUTH_URL</span>
            <code className="bg-muted block rounded p-2 break-all">
              {nextAuthUrl || "(prázdné)"}
            </code>
          </div>
          <div>
            <span className="block text-[10px] uppercase">ALLOWED_EMAIL_DOMAIN</span>
            <code className="bg-muted block rounded p-2">{allowedDomain || "(vypnuto)"}</code>
          </div>
          <div>
            <span className="block text-[10px] uppercase">GOOGLE_CLIENT_ID</span>
            <code className="bg-muted block rounded p-2">
              {maskSecret(process.env.GOOGLE_CLIENT_ID)}
            </code>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="font-medium">Pipedrive (provize)</h2>
        {pd.configured ? (
          <p className="text-green-600 text-sm dark:text-green-400">Pipedrive je nakonfigurován.</p>
        ) : (
          <p className="text-amber-700 text-sm dark:text-amber-300">
            Chybí: {pd.missing.join(", ")}
          </p>
        )}
        <div className="text-muted-foreground grid gap-2 text-xs">
          <div>
            <span className="block text-[10px] uppercase">PIPEDRIVE_API_TOKEN</span>
            <code className="bg-muted block rounded p-2">{maskSecret(pd.apiToken)}</code>
          </div>
          <div>
            <span className="block text-[10px] uppercase">PIPEDRIVE_DOMAIN</span>
            <code className="bg-muted block rounded p-2">{pd.domain || "(prázdné)"}</code>
          </div>
          <div>
            <span className="block text-[10px] uppercase">PIPEDRIVE_CATEGORY_FIELD_KEY</span>
            <code className="bg-muted block rounded p-2 break-all">
              {pd.categoryFieldKey || "(prázdné)"}
            </code>
          </div>
        </div>
        {isAdmin && pd.configured ? (
          <PipedriveDealFieldsButton />
        ) : (
          <p className="text-muted-foreground text-sm">
            Tabulku polí může načíst jen administrátor a jen při kompletní konfiguraci.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="font-medium">Gmail (doklady)</h2>
        <p className="text-muted-foreground text-sm">
          Stav:{" "}
          <span className={gmailOk ? "text-green-600 dark:text-green-400" : ""}>
            {gmailOk ? "nakonfigurováno" : "chybí token / client"}
          </span>
        </p>
        <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
          <li>
            <code>GMAIL_REFRESH_TOKEN</code>, <code>GMAIL_CLIENT_ID</code>,{" "}
            <code>GMAIL_CLIENT_SECRET</code> (nebo sdílené s Google OAuth)
          </li>
          <li>
            <code>GMAIL_FILTER_LABEL</code>, <code>GMAIL_PROCESSED_LABEL</code>,{" "}
            <code>CRON_SECRET</code>
          </li>
        </ul>
        <p className="text-muted-foreground text-xs">
          Dotaz:{" "}
          <code className="bg-muted mt-1 block rounded p-2 text-[11px] break-all">
            {previewQuery}
          </code>
        </p>
        {isAdmin ? (
          <PollEmailButton />
        ) : (
          <p className="text-muted-foreground text-sm">Ruční stahování jen administrátor.</p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="font-medium">AI extrakce (Claude)</h2>
        <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
          <li>
            <code>ANTHROPIC_API_KEY</code>, <code>ANTHROPIC_MODEL</code>
          </li>
          <li>
            <code>AI_CONFIDENCE_THRESHOLD</code>, <code>AI_BATCH_LIMIT</code>
          </li>
        </ul>
        {isAdmin ? (
          <ProcessDocumentsButton />
        ) : (
          <p className="text-muted-foreground text-sm">Jen administrátor.</p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="font-medium">Google Drive (Shared Drive)</h2>
        <p className="text-muted-foreground text-sm">
          Stav:{" "}
          <span className={driveOk ? "text-green-600 dark:text-green-400" : ""}>
            {driveOk ? "připraveno k uploadu" : "neúplné"}
          </span>
        </p>
        <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
          <li>
            <code>GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON</code>
          </li>
          <li>
            <code>GOOGLE_DRIVE_INVOICES_FOLDER_ID</code>,{" "}
            <code>GOOGLE_DRIVE_RECEIPTS_FOLDER_ID</code>
          </li>
        </ul>
      </section>

      <section className="space-y-2 rounded-lg border bg-card p-5">
        <h2 className="font-medium">Volitelně</h2>
        <ul className="text-muted-foreground list-inside list-disc text-sm">
          <li>
            <code>OPS_ADMIN_CONTACT</code> — zobrazení kontaktu v patičce / nápovědě (jeden řádek)
          </li>
          <li>
            <code>DATABASE_URL</code> — PostgreSQL (viz Prisma)
          </li>
        </ul>
      </section>

      <section className="space-y-2 rounded-lg border bg-card p-5">
        <h2 className="font-medium">Cron (Vercel)</h2>
        <ul className="text-muted-foreground space-y-1 text-sm">
          <li>
            <code>GET /api/jobs/poll-email</code> — <code>Bearer CRON_SECRET</code>
          </li>
          <li>
            <code>GET /api/jobs/process-documents</code> — <code>Bearer CRON_SECRET</code>
          </li>
        </ul>
      </section>
    </div>
  );
}
