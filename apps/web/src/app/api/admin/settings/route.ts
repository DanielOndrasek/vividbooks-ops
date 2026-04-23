import { NextResponse } from "next/server";

import { requireRoles, requireSession } from "@/lib/api-session";
import { assertGmailConfigured } from "@/lib/gmail-config";
import { getPipedriveEnv, maskSecret } from "@/lib/integrations/env";
import { getPohodaEnvStatus } from "@/lib/pohoda-env-status";
import { isDriveConfigured } from "@/services/drive";

export async function GET() {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  const forbidden = requireRoles(session!, ["ADMIN"]);
  if (forbidden) {
    return forbidden;
  }

  let gmailOk = false;
  try {
    assertGmailConfigured();
    gmailOk = true;
  } catch {
    gmailOk = false;
  }

  const driveOk = isDriveConfigured();
  const pd = getPipedriveEnv();
  const pohoda = getPohodaEnvStatus();

  return NextResponse.json({
    pipedrive: {
      configured: pd.configured,
      missing: pd.missing,
      domain: pd.domain || null,
      categoryFieldKey: pd.categoryFieldKey || null,
      apiToken: maskSecret(pd.apiToken),
    },
    gmail: {
      configured: gmailOk,
      filterLabel: process.env.GMAIL_FILTER_LABEL || "INBOX",
      processedLabel: process.env.GMAIL_PROCESSED_LABEL || "Zpracováno",
      clientId: maskSecret(process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID),
      refreshTokenSet: Boolean(process.env.GMAIL_REFRESH_TOKEN?.trim()),
    },
    drive: {
      configured: driveOk,
      invoicesFolderId: maskSecret(process.env.GOOGLE_DRIVE_INVOICES_FOLDER_ID),
      receiptsFolderId: maskSecret(process.env.GOOGLE_DRIVE_RECEIPTS_FOLDER_ID),
      serviceAccountEmail: (() => {
        try {
          const raw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
          if (!raw) {
            return null;
          }
          const j = JSON.parse(raw) as { client_email?: string };
          return j.client_email ?? null;
        } catch {
          return null;
        }
      })(),
    },
    ai: {
      apiKeySet: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    },
    pohoda: {
      invoiceExportConfigured: pohoda.invoiceExportConfigured,
      bankImportConfigured: pohoda.bankImportConfigured,
      missingForInvoice: pohoda.missingForInvoice,
      missingForBankImport: pohoda.missingForBankImport,
      mserverUrl: pohoda.mserverUrl,
      ico: pohoda.ico,
      application: pohoda.application,
      httpUser: pohoda.httpUser,
      httpPassword: pohoda.httpPasswordMasked,
      invoiceAccountingIds: pohoda.invoiceAccountingIds,
      invoiceClassificationVatIds: pohoda.invoiceClassificationVatIds,
      defaultBankAccountIds: pohoda.defaultBankAccountIds,
    },
  });
}
