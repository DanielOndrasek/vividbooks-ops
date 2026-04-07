/** Proměnné pro Gmail API (mailbox + OAuth). */

export function getGmailOAuthCredentials() {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  return { clientId, clientSecret, refreshToken };
}

export function assertGmailConfigured() {
  const { clientId, clientSecret, refreshToken } = getGmailOAuthCredentials();
  if (!clientId?.trim() || !clientSecret?.trim() || !refreshToken?.trim()) {
    throw new Error(
      "Gmail není nakonfigurován: nastav GMAIL_CLIENT_ID (nebo GOOGLE_CLIENT_ID), " +
        "GMAIL_CLIENT_SECRET (nebo GOOGLE_CLIENT_SECRET) a GMAIL_REFRESH_TOKEN.",
    );
  }
}

export function gmailFilterLabel() {
  return (process.env.GMAIL_FILTER_LABEL || "INBOX").trim();
}

export function gmailProcessedLabel() {
  return (process.env.GMAIL_PROCESSED_LABEL || "Zpracováno").trim();
}

export function gmailPollMaxResults() {
  const n = Number(process.env.GMAIL_POLL_MAX_RESULTS);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 25;
}
