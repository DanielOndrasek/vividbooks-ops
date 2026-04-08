/** Proměnné pro Gmail API (mailbox + OAuth). */

export function getGmailOAuthCredentials() {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  return { clientId, clientSecret, refreshToken };
}

export type GmailEnvStatus = {
  configured: boolean;
  /** Co doplnit na Vercelu (bez citlivých hodnot). */
  missing: string[];
};

/** Diagnostika pro UI — která proměnná chybí. */
export function getGmailEnvStatus(): GmailEnvStatus {
  const { clientId, clientSecret, refreshToken } = getGmailOAuthCredentials();
  const missing: string[] = [];
  if (!clientId?.trim()) {
    missing.push("GOOGLE_CLIENT_ID nebo GMAIL_CLIENT_ID");
  }
  if (!clientSecret?.trim()) {
    missing.push("GOOGLE_CLIENT_SECRET nebo GMAIL_CLIENT_SECRET");
  }
  if (!refreshToken?.trim()) {
    missing.push("GMAIL_REFRESH_TOKEN");
  }
  return { configured: missing.length === 0, missing };
}

export function assertGmailConfigured() {
  const { configured, missing } = getGmailEnvStatus();
  if (!configured) {
    throw new Error(
      "Gmail není nakonfigurován. Chybí: " +
        missing.join(", ") +
        ".",
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

/**
 * Gmail API používá `userId: "me"` = schránka účtu, ke kterému patří GMAIL_REFRESH_TOKEN.
 * Není tam samostatná konfigurace „stahuj z adresy X“ — ta adresa = ten účet, pod kterým
 * jsi vygeneroval refresh token (npm run gmail:token).
 *
 * Výchozí: brát jen nepřečtené (`is:unread`). Vypnout: GMAIL_ONLY_UNREAD=0
 */
export function gmailOnlyUnread(): boolean {
  const v = (process.env.GMAIL_ONLY_UNREAD ?? "1").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") {
    return false;
  }
  return true;
}

/**
 * Jen zprávy doručené na tuto adresu (alias / skupina / směrování ve Workspace).
 * Gmail operátor `deliveredto:` — vhodnější než `to:` u aliasů a více příjemců.
 *
 * U samostatného účtu (např. jen hr@vividbooks.com) nech prázdné: `me` už je celá jeho schránka;
 * stačí GMAIL_REFRESH_TOKEN vygenerovaný přihlášením jako tento účet.
 */
export function gmailDeliveredToAddress(): string {
  return (process.env.GMAIL_DELIVERED_TO ?? "").trim();
}

/** `to` = jen pole Komu, `deliveredto` = kam byla zpráva doručena (výchozí). */
export type GmailAddressMatchMode = "deliveredto" | "to";

export function gmailAddressMatchMode(): GmailAddressMatchMode {
  const v = (process.env.GMAIL_ADDRESS_MATCH_MODE ?? "deliveredto")
    .trim()
    .toLowerCase();
  return v === "to" ? "to" : "deliveredto";
}
