import { auth } from "@/auth";
import { PollEmailButton } from "@/components/poll-email-button";
import { ProcessDocumentsButton } from "@/components/process-documents-button";
import { assertGmailConfigured } from "@/lib/gmail-config";
import { buildUnprocessedQuery } from "@/services/gmail";
import { isDriveConfigured } from "@/services/drive";

export default async function SettingsPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const previewQuery = buildUnprocessedQuery();

  let gmailOk = false;
  try {
    assertGmailConfigured();
    gmailOk = true;
  } catch {
    gmailOk = false;
  }
  const driveOk = isDriveConfigured();

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nastavení</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Proměnné prostředí a ruční úlohy. Detailní seznam je v{" "}
          <code className="bg-muted rounded px-1 text-xs">apps/web/.env.example</code>.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="font-medium">Gmail</h2>
        <p className="text-muted-foreground text-sm">
          Stav:{" "}
          <span className={gmailOk ? "text-green-600 dark:text-green-400" : ""}>
            {gmailOk ? "nakonfigurováno" : "chybí token / client"}
          </span>
        </p>
        <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
          <li>
            <code>GMAIL_REFRESH_TOKEN</code> — účet, který čte poštu (
            <code>gmail.readonly</code> + <code>gmail.modify</code>).
          </li>
          <li>
            <code>GMAIL_CLIENT_ID</code> / <code>GMAIL_CLIENT_SECRET</code> nebo stejné jako{" "}
            <code>GOOGLE_*</code> z NextAuth.
          </li>
          <li>
            <code>GMAIL_FILTER_LABEL</code>, <code>GMAIL_PROCESSED_LABEL</code>,{" "}
            <code>CRON_SECRET</code>, <code>INVOICE_TMP_DIR</code>.
          </li>
        </ul>
        <p className="text-muted-foreground text-xs">
          Dotaz (náhled):{" "}
          <code className="bg-muted mt-1 block rounded p-2 text-[11px] break-all">
            {previewQuery}
          </code>
        </p>
        {isAdmin ? (
          <PollEmailButton />
        ) : (
          <p className="text-muted-foreground text-sm">
            Ruční stahování může spustit jen administrátor.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="font-medium">AI extrakce (Claude)</h2>
        <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
          <li>
            <code>ANTHROPIC_API_KEY</code>, volitelně <code>ANTHROPIC_MODEL</code>.
          </li>
          <li>
            <code>AI_CONFIDENCE_THRESHOLD</code>, <code>AI_BATCH_LIMIT</code>.
          </li>
        </ul>
        <p className="text-muted-foreground text-xs">
          Zpracovávají se dokumenty ve stavu <code>NEW</code> a typu{" "}
          <code>UNCLASSIFIED</code>. Faktury přejdou do <code>PENDING_APPROVAL</code> nebo{" "}
          <code>NEEDS_REVIEW</code>. Doklady o platbě se po klasifikaci nahrají na Google Drive.
        </p>
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
            {driveOk ? "připraveno k uploadu" : "neúplné — upload se přeskočí (audit)"}
          </span>
        </p>
        <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
          <li>
            <code>GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON</code> — celý JSON klíče service accountu;
            účet musí být členem sdíleného disku.
          </li>
          <li>
            <code>GOOGLE_DRIVE_INVOICES_FOLDER_ID</code> — kořenová složka pro faktury (po
            schválení).
          </li>
          <li>
            <code>GOOGLE_DRIVE_RECEIPTS_FOLDER_ID</code> — kořen pro doklady o platbě (hned po
            zpracování).
          </li>
        </ul>
        <p className="text-muted-foreground text-xs">
          Struktura uvnitř kořene: <code>rok/měsíc</code> (UTC).
        </p>
      </section>

      <section className="space-y-2 rounded-lg border bg-card p-5">
        <h2 className="font-medium">API (cron)</h2>
        <ul className="text-muted-foreground space-y-1 text-sm">
          <li>
            <code>GET /api/jobs/poll-email</code> — <code>Bearer CRON_SECRET</code>.
          </li>
          <li>
            <code>GET /api/jobs/process-documents</code> — <code>Bearer CRON_SECRET</code>.
          </li>
          <li>
            <code>GET /api/admin/settings</code> — jen ADMIN (stav integrací).
          </li>
        </ul>
      </section>
    </div>
  );
}
