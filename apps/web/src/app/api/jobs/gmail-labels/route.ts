import { NextResponse } from "next/server";

import { requireJobRunnerSession } from "@/lib/api-jobs-auth";
import { gmailProcessedLabel } from "@/lib/gmail-config";
import { getGmailClient, listAllLabels } from "@/services/gmail";

/**
 * GET – výpis všech Gmail štítků na účtu, ke kterému patří GMAIL_REFRESH_TOKEN.
 *
 * Cíl: odhalit nesoulad mezi tím, co je v `GMAIL_PROCESSED_LABEL`, a tím,
 * jakým jménem (nebo zda vůbec) je štítek v Gmailu opravdu vytvořený.
 */
export async function GET() {
  const session = await requireJobRunnerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Povoleno jen administrátorům nebo schvalovatelům." },
      { status: 403 },
    );
  }

  try {
    const gmail = getGmailClient();
    const labels = await listAllLabels(gmail);
    const configuredName = gmailProcessedLabel();
    const configuredLower = configuredName.toLowerCase();
    const exactMatch = labels.find(
      (l) => l.name.toLowerCase() === configuredLower,
    );
    const fuzzyMatches = labels.filter(
      (l) =>
        l.name.toLowerCase() !== configuredLower &&
        (l.name.toLowerCase().includes(configuredLower) ||
          configuredLower.includes(l.name.toLowerCase())),
    );
    return NextResponse.json({
      configuredProcessedLabel: configuredName,
      labels,
      exactMatch: exactMatch ?? null,
      fuzzyMatches,
    });
  } catch (e) {
    console.error("[gmail-labels]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
