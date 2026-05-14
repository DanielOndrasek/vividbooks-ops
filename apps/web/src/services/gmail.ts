/**
 * Gmail: stažení příloh, označení jako zpracované a přečtené (odebrání UNREAD).
 * Vyžaduje OAuth2 refresh token s rozsahy gmail.readonly + gmail.modify.
 */

import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { google, type gmail_v1 } from "googleapis";

import {
  assertGmailConfigured,
  getGmailOAuthCredentials,
  gmailAddressMatchMode,
  gmailDeliveredToAddress,
  gmailFilterLabel,
  gmailOnlyUnread,
  gmailPollMaxResults,
  gmailProcessedLabel,
} from "@/lib/gmail-config";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

function mimeFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return null;
}

function eligibleMimeType(rawMimeType: string, filename: string): string | null {
  const mime = rawMimeType.toLowerCase();
  const normMime = mime === "image/jpg" ? "image/jpeg" : mime;
  if (ALLOWED_MIME.has(normMime)) {
    return normMime === "image/jpg" ? "image/jpeg" : normMime;
  }
  // Někteří odesílatelé posílají PDF jako application/octet-stream.
  // U faktur je přípona souboru spolehlivější než MIME hlavička z Gmailu.
  return mimeFromFilename(filename);
}

function getOAuth2Client() {
  assertGmailConfigured();
  const { clientId, clientSecret, refreshToken } = getGmailOAuthCredentials();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export function getGmailClient(): gmail_v1.Gmail {
  const auth = getOAuth2Client();
  return google.gmail({ version: "v1", auth });
}

function labelQueryToken(name: string): string {
  const t = name.trim();
  if (!t) return "";
  return /\s/.test(t) ? `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : t;
}

/** Gmail vyhledávací dotaz: přílohy, volitelně jen nepřečtené, příjemce, label, bez „zpracováno“. */
export function buildUnprocessedQuery(): string {
  const filter = labelQueryToken(gmailFilterLabel());
  const processed = labelQueryToken(gmailProcessedLabel());
  const parts = ["has:attachment"];
  if (gmailOnlyUnread()) {
    parts.push("is:unread");
  }
  const inboxAddr = gmailDeliveredToAddress();
  if (inboxAddr) {
    const op = gmailAddressMatchMode();
    parts.push(`${op}:${labelQueryToken(inboxAddr)}`);
  }
  if (filter) {
    parts.push(`label:${filter}`);
  }
  if (processed) {
    parts.push(`-label:${processed}`);
  }
  return parts.join(" ");
}

export async function listLabelIdByName(
  gmail: gmail_v1.Gmail,
  labelName: string,
): Promise<string | null> {
  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels ?? [];
  const want = labelName.trim().toLowerCase();
  const hit = labels.find((l) => (l.name ?? "").toLowerCase() === want);
  return hit?.id ?? null;
}

export type GmailLabelSummary = {
  id: string;
  name: string;
  type: string;
  labelListVisibility: string | null;
  messageListVisibility: string | null;
};

/** Seznam všech štítků v Gmailu (system + user). Pro diagnostiku v UI. */
export async function listAllLabels(
  gmail: gmail_v1.Gmail,
): Promise<GmailLabelSummary[]> {
  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels ?? [];
  return labels
    .filter((l): l is { id: string; name: string } & typeof l =>
      Boolean(l.id && l.name),
    )
    .map((l) => ({
      id: l.id ?? "",
      name: l.name ?? "",
      type: l.type ?? "user",
      labelListVisibility: l.labelListVisibility ?? null,
      messageListVisibility: l.messageListVisibility ?? null,
    }));
}

/** Mapuje label IDy → human-friendly jména pro perMessage diagnostiku. */
export function buildLabelIdToNameMap(
  labels: GmailLabelSummary[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of labels) {
    m.set(l.id, l.name);
  }
  return m;
}

export async function ensureLabelExists(
  gmail: gmail_v1.Gmail,
  labelName: string,
): Promise<string> {
  const existing = await listLabelIdByName(gmail, labelName);
  if (existing) {
    return existing;
  }
  const created = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName.trim(),
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });
  if (!created.data.id) {
    throw new Error(`Nepodařilo se vytvořit label „${labelName}“.`);
  }
  return created.data.id;
}

/** ID zpráv k načtení (stručný list). */
export async function fetchUnprocessedMessageIds(gmail: gmail_v1.Gmail): Promise<string[]> {
  const q = buildUnprocessedQuery();
  const max = gmailPollMaxResults();
  const res = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: max,
  });
  const messages = res.data.messages ?? [];
  return messages.map((m) => m.id).filter((id): id is string => Boolean(id));
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  if (!headers) {
    return "";
  }
  const h = headers.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase());
  return (h?.value ?? "").trim();
}

function walkParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  visit: (p: gmail_v1.Schema$MessagePart) => void,
): void {
  if (!part) {
    return;
  }
  if (part.parts?.length) {
    for (const p of part.parts) {
      walkParts(p, visit);
    }
  }
  visit(part);
}

export type EligibleAttachment = {
  attachmentId: string;
  filename: string;
  mimeType: string;
};

export type GmailAttachmentPartSummary = {
  filename: string;
  mimeType: string;
  normalizedMimeType: string | null;
  hasAttachmentId: boolean;
  eligible: boolean;
  reason: string | null;
};

export function listAttachmentPartSummaries(
  message: gmail_v1.Schema$Message,
): GmailAttachmentPartSummary[] {
  const payload = message.payload;
  if (!payload) {
    return [];
  }
  const out: GmailAttachmentPartSummary[] = [];
  walkParts(payload, (part) => {
    const rawFilename = part.filename || "";
    const rawMime = part.mimeType ?? "";
    const attachmentId = part.body?.attachmentId;
    if (!rawFilename && !attachmentId) {
      return;
    }
    const filename = safeFileName(rawFilename || `attachment.${extensionForMime(rawMime)}`);
    const normalizedMimeType = eligibleMimeType(rawMime, rawFilename ? filename : "");
    const eligible = Boolean(attachmentId && normalizedMimeType);
    out.push({
      filename,
      mimeType: rawMime || "application/octet-stream",
      normalizedMimeType,
      hasAttachmentId: Boolean(attachmentId),
      eligible,
      reason: eligible
        ? null
        : !attachmentId
          ? "část nemá attachmentId"
          : "nepodporovaný typ/přípona",
    });
  });
  return out;
}

export function listEligibleAttachments(
  message: gmail_v1.Schema$Message,
): EligibleAttachment[] {
  const payload = message.payload;
  if (!payload) {
    return [];
  }
  const out: EligibleAttachment[] = [];
  walkParts(payload, (part) => {
    const rawMime = (part.mimeType ?? "").toLowerCase();
    const rawFilename = part.filename || "";
    const filename =
      safeFileName(rawFilename || `attachment.${extensionForMime(rawMime)}`);
    const normMime = eligibleMimeType(rawMime, rawFilename ? filename : "");
    if (!normMime) {
      return;
    }
    const attachmentId = part.body?.attachmentId;
    if (!attachmentId) {
      return;
    }
    out.push({
      attachmentId,
      filename,
      mimeType: normMime,
    });
  });
  return out;
}

function extensionForMime(mime: string): string {
  if (mime === "application/pdf") {
    return "pdf";
  }
  if (mime === "image/png") {
    return "png";
  }
  return "jpg";
}

export function safeFileName(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "attachment";
  return base.slice(0, 200);
}

function decodeBase64Url(data: string): Buffer {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

export async function downloadAttachment(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });
  const data = res.data.data;
  if (!data) {
    throw new Error("Gmail vrátil prázdná data přílohy.");
  }
  return decodeBase64Url(data);
}

export function tmpDirForMessage(messageId: string): string {
  const base = process.env.INVOICE_TMP_DIR?.trim() || path.join(os.tmpdir(), "invoices");
  return path.join(base, messageId);
}

export async function saveAttachmentToDisk(
  dir: string,
  filename: string,
  data: Buffer,
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, filename);
  await writeFile(target, data);
  return target;
}

export async function markAsProcessed(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<void> {
  const labelName = gmailProcessedLabel();
  const labelId = await ensureLabelExists(gmail, labelName);
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds: [labelId],
      /** Po stažení příloh má zpráva v Gmailu zmizet z nepřečtených. */
      removeLabelIds: ["UNREAD"],
    },
  });
}

/**
 * Z hlavičky From (např. `Acme <faktury@acme.cz>`) izoluje adresu pro logy a filtry.
 */
export function parseSenderEmail(fromHeader: string): string | null {
  const raw = fromHeader.trim();
  if (!raw) {
    return null;
  }
  const angle = raw.match(/<([^<>]+)>/);
  const candidate = (angle ? angle[1] : raw).trim().replace(/^mailto:/i, "");
  if (!candidate) {
    return null;
  }
  if (!/^[^\s@<>]+@[^\s@<>]+$/.test(candidate)) {
    return null;
  }
  return candidate.toLowerCase();
}

export function parseMessageMeta(message: gmail_v1.Schema$Message): {
  emailFrom: string;
  emailSubject: string;
  emailReceivedAt: Date;
  senderEmail: string | null;
} {
  const headers = message.payload?.headers;
  const emailFrom = getHeader(headers, "From");
  const emailSubject = getHeader(headers, "Subject");
  const internalMs = message.internalDate ? Number(message.internalDate) : Date.now();
  const emailReceivedAt = new Date(Number.isFinite(internalMs) ? internalMs : Date.now());
  const senderEmail = parseSenderEmail(emailFrom);
  return { emailFrom, emailSubject, emailReceivedAt, senderEmail };
}
