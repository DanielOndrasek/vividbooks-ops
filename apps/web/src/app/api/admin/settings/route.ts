import { NextResponse } from "next/server";

import { requireRoles, requireSession } from "@/lib/api-session";
import { assertGmailConfigured } from "@/lib/gmail-config";
import { isDriveConfigured } from "@/services/drive";

function mask(s: string | undefined, keep = 4): string {
  if (!s?.trim()) {
    return "(prázdné)";
  }
  if (s.length <= keep * 2) {
    return "•••";
  }
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}

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

  return NextResponse.json({
    gmail: {
      configured: gmailOk,
      filterLabel: process.env.GMAIL_FILTER_LABEL || "INBOX",
      processedLabel: process.env.GMAIL_PROCESSED_LABEL || "Zpracováno",
      clientId: mask(process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID),
      refreshTokenSet: Boolean(process.env.GMAIL_REFRESH_TOKEN?.trim()),
    },
    drive: {
      configured: driveOk,
      invoicesFolderId: mask(process.env.GOOGLE_DRIVE_INVOICES_FOLDER_ID),
      receiptsFolderId: mask(process.env.GOOGLE_DRIVE_RECEIPTS_FOLDER_ID),
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
  });
}
