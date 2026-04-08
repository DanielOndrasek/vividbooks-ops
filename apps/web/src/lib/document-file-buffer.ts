import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { getGmailEnvStatus } from "@/lib/gmail-config";
import { downloadAttachment, getGmailClient } from "@/services/gmail";

/** Minimální tvar dokumentu pro načtení bajtů souboru. */
export type DocumentFileSource = {
  localFilePath: string | null;
  gmailAttachmentId: string;
  email: { gmailMessageId: string } | null;
};

export type LoadDocumentBufferOptions = {
  /** Už nahraný soubor na Drive (opakování po chybě / /tmp zmizel). */
  driveFileId?: string | null;
};

/**
 * Bajty přílohy: lokální soubor jen pokud fyzicky existuje, pak Gmail, pak Drive.
 * Na Vercelu často zmizí /tmp — nevoláme readFile na neexistující cestu (žádné ENOENT).
 */
export async function loadDocumentFileBuffer(
  doc: DocumentFileSource,
  opts?: LoadDocumentBufferOptions,
): Promise<Buffer> {
  const localPath = doc.localFilePath;
  if (localPath && existsSync(localPath)) {
    return readFile(localPath);
  }

  if (
    getGmailEnvStatus().configured &&
    doc.email?.gmailMessageId &&
    doc.gmailAttachmentId
  ) {
    try {
      const gmail = getGmailClient();
      return await downloadAttachment(
        gmail,
        doc.email.gmailMessageId,
        doc.gmailAttachmentId,
      );
    } catch {
      /* zpráva smazaná, expirovaná příloha, OAuth — zkusíme Drive */
    }
  }

  const driveId = opts?.driveFileId?.trim();
  if (driveId) {
    const { downloadDriveFileBuffer } = await import("@/services/drive");
    const { buffer } = await downloadDriveFileBuffer(driveId);
    return buffer;
  }

  throw new Error(
    "Soubor není k dispozici: na serveru chybí kopie (/tmp), nepodařilo se stáhnout z Gmailu a není uložený driveFileId. Ověřte GMAIL_REFRESH_TOKEN a přílohu ve zprávě.",
  );
}
