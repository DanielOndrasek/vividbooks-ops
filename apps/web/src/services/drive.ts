/**
 * Google Drive (Shared Drive): upload přes service account JSON v env.
 */

import { Readable } from "node:stream";

import { google } from "googleapis";

import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { loadDocumentFileBuffer } from "@/lib/document-file-buffer";
import { DocumentType, DocumentStatus } from "@prisma/client";

import { safeFileName } from "@/services/gmail";

type DriveFile = {
  id: string;
  webViewLink: string | null;
};

function parseServiceAccountJson(): {
  client_email: string;
  private_key: string;
} {
  const raw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new Error("Chybí GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON.");
  }
  const parsed = JSON.parse(raw) as {
    client_email?: string;
    private_key?: string;
  };
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: chybí client_email nebo private_key.");
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

function getDrive() {
  const { client_email, private_key } = parseServiceAccountJson();
  const auth = new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

export function isDriveConfigured(): boolean {
  try {
    parseServiceAccountJson();
    const inv = process.env.GOOGLE_DRIVE_INVOICES_FOLDER_ID?.trim();
    const rec = process.env.GOOGLE_DRIVE_RECEIPTS_FOLDER_ID?.trim();
    return Boolean(inv && rec);
  } catch {
    return false;
  }
}

/** Stažení binárního obsahu souboru ze Shared Drive (náhled, když není webViewLink nebo lokální soubor). */
export async function downloadDriveFileBuffer(
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const drive = getDrive();
  const meta = await drive.files.get({
    fileId,
    fields: "mimeType",
    supportsAllDrives: true,
  });
  const mimeType = meta.data.mimeType || "application/octet-stream";
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  const raw = res.data as ArrayBuffer | Buffer;
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  return { buffer, mimeType };
}

function invoicesRootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_INVOICES_FOLDER_ID?.trim();
  if (!id) {
    throw new Error("Chybí GOOGLE_DRIVE_INVOICES_FOLDER_ID.");
  }
  return id;
}

function receiptsRootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_RECEIPTS_FOLDER_ID?.trim();
  if (!id) {
    throw new Error("Chybí GOOGLE_DRIVE_RECEIPTS_FOLDER_ID.");
  }
  return id;
}

/** Service account nemá úložiště na „Můj disk“ — kořen musí být na Shared Drive (driveId u položky). */
async function assertFolderIsOnSharedDrive(
  drive: ReturnType<typeof getDrive>,
  folderId: string,
  label: string,
): Promise<void> {
  let meta;
  try {
    meta = await drive.files.get({
      fileId: folderId,
      fields: "id,name,driveId,mimeType",
      supportsAllDrives: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Složka Google Drive (${label}) není pro service account dostupná: ${msg}. Ověřte ID složky a že je účet z JSON přidaný jako člen sdíleného disku.`,
    );
  }
  if (meta.data.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error(
      `Proměnná pro ${label} neukazuje na složku (mimeType: ${meta.data.mimeType ?? "?"}).`,
    );
  }
  if (!meta.data.driveId) {
    throw new Error(
      `Složka „${meta.data.name ?? folderId}“ (${label}) není na Google Shared Drive. ` +
        `Service account nemá vlastní kvótu na osobním „Můj disk“. ` +
        `V Google Workspace zřiďte sdílený disk, přidejte e-mail service accountu z GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON jako člena (např. Správce obsahu), ` +
        `v tomto disku vytvořte kořenové složky pro faktury a doklady platby a jejich ID nastavte v GOOGLE_DRIVE_INVOICES_FOLDER_ID / GOOGLE_DRIVE_RECEIPTS_FOLDER_ID. ` +
        `Návod: https://developers.google.com/workspace/drive/api/guides/about-shareddrives`,
    );
  }
}

function explainDriveStorageError(raw: string): string {
  if (/storage quota|shared drives|Service Accounts do not have storage/i.test(raw)) {
    return (
      "Google Drive odmítl upload: service account nemůže ukládat na osobní „Můj disk“. " +
      "Kořenové složky v env musí ležet na Shared Drive (sdílený disk) a service account musí být jeho členem se zápisem. " +
      "Podrobnosti viz Nastavení → Google Drive nebo https://developers.google.com/workspace/drive/api/guides/about-shareddrives"
    );
  }
  return raw;
}

/** Diagnostika pro UI (Nastavení): obě kořenové složky musí mít driveId. */
export async function verifyDriveRootsOnSharedDrive(): Promise<{
  checked: boolean;
  invoicesOnSharedDrive: boolean | null;
  receiptsOnSharedDrive: boolean | null;
  error?: string;
}> {
  if (!isDriveConfigured()) {
    return {
      checked: false,
      invoicesOnSharedDrive: null,
      receiptsOnSharedDrive: null,
    };
  }
  try {
    const drive = getDrive();
    const inv = invoicesRootFolderId();
    const rec = receiptsRootFolderId();
    const [invMeta, recMeta] = await Promise.all([
      drive.files.get({
        fileId: inv,
        fields: "driveId,mimeType",
        supportsAllDrives: true,
      }),
      drive.files.get({
        fileId: rec,
        fields: "driveId,mimeType",
        supportsAllDrives: true,
      }),
    ]);
    return {
      checked: true,
      invoicesOnSharedDrive: Boolean(invMeta.data.driveId),
      receiptsOnSharedDrive: Boolean(recMeta.data.driveId),
    };
  } catch (e) {
    return {
      checked: true,
      invoicesOnSharedDrive: null,
      receiptsOnSharedDrive: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function ymFromDate(d: Date): { year: string; month: string } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return {
    year: String(y),
    month: String(m).padStart(2, "0"),
  };
}

function escapeQueryName(name: string): string {
  return name.replace(/'/g, "\\'");
}

async function findChildFolder(
  drive: ReturnType<typeof getDrive>,
  parentId: string,
  name: string,
): Promise<string | null> {
  const q = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${escapeQueryName(name)}' and trashed = false`;
  const res = await drive.files.list({
    q,
    fields: "files(id)",
    pageSize: 2,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const id = res.data.files?.[0]?.id;
  return id ?? null;
}

async function createFolder(
  drive: ReturnType<typeof getDrive>,
  parentId: string,
  name: string,
): Promise<string> {
  const created = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });
  const id = created.data.id;
  if (!id) {
    throw new Error(`Nepodařilo se vytvořit složku „${name}“.`);
  }
  return id;
}

/** Složky YYYY / MM podle předaného data — u uploadů používat datum nahrání na disk, ne datum z dokladu. */
async function ensureYearMonthFolder(
  drive: ReturnType<typeof getDrive>,
  rootFolderId: string,
  anchor: Date,
): Promise<{ folderId: string; displayPath: string }> {
  const { year, month } = ymFromDate(anchor);
  let yId = await findChildFolder(drive, rootFolderId, year);
  if (!yId) {
    yId = await createFolder(drive, rootFolderId, year);
  }
  let mId = await findChildFolder(drive, yId, month);
  if (!mId) {
    mId = await createFolder(drive, yId, month);
  }
  return { folderId: mId, displayPath: `${year}/${month}` };
}

async function uploadBufferToFolder(
  drive: ReturnType<typeof getDrive>,
  folderId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<DriveFile> {
  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id, webViewLink",
  });
  return {
    id: res.data.id!,
    webViewLink: res.data.webViewLink ?? null,
  };
}

function mimeForFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return "application/octet-stream";
}

/**
 * Doklad o platbě — ihned po zpracování AI, po převodu z faktury nebo po „Platba v pořádku“.
 * Po úspěchu: stav STORED, smazání lokálního souboru a vyčištění objemných polí dokumentu v DB.
 */
export async function uploadPaymentReceiptIfConfigured(
  documentId: string,
): Promise<void> {
  if (!isDriveConfigured()) {
    await writeAuditLog({
      entityType: "Document",
      entityId: documentId,
      action: "drive_skipped",
      metadata: { reason: "not_configured", kind: "payment" },
    });
    return;
  }

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { paymentProof: true, email: true },
  });
  if (
    !doc ||
    doc.documentType !== DocumentType.PAYMENT_RECEIPT ||
    !doc.paymentProof
  ) {
    await writeAuditLog({
      entityType: "Document",
      entityId: documentId,
      action: "drive_upload_invalid",
      metadata: {
        reason: "not_payment_or_missing_file",
        type: doc?.documentType,
      },
    });
    return;
  }

  if (doc.paymentProof.storedAt != null && doc.paymentProof.driveFileId) {
    return;
  }

  try {
    const fs = await import("node:fs/promises");
    const buffer = await loadDocumentFileBuffer(doc, {
      driveFileId: doc.paymentProof.driveFileId,
    });
    const drive = getDrive();
    const root = receiptsRootFolderId();
    await assertFolderIsOnSharedDrive(drive, root, "doklady platby (GOOGLE_DRIVE_RECEIPTS_FOLDER_ID)");
    const uploadedAt = new Date();
    const { folderId, displayPath } = await ensureYearMonthFolder(
      drive,
      root,
      uploadedAt,
    );
    const fileName = safeFileName(doc.originalFilename);
    const uploaded = await uploadBufferToFolder(
      drive,
      folderId,
      fileName,
      buffer,
      doc.mimeType || mimeForFilename(fileName),
    );

    await prisma.paymentProof.update({
      where: { id: doc.paymentProof.id },
      data: {
        driveFileId: uploaded.id,
        driveUrl: uploaded.webViewLink,
        storedAt: new Date(),
      },
    });

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.STORED,
        localFilePath: null,
        extractedText: null,
        aiRawResponse: null,
        parseError: null,
        contentHash: null,
        classificationConfidence: null,
        needsManualReview: false,
      },
    });

    if (doc.localFilePath) {
      try {
        await fs.unlink(doc.localFilePath);
      } catch {
        /* temp */
      }
    }

    await writeAuditLog({
      entityType: "Document",
      entityId: documentId,
      action: "drive_uploaded",
      metadata: {
        kind: "payment",
        driveFileId: uploaded.id,
        folder: displayPath,
        fileName,
      },
    });

    const { runPaymentProofPohodaExportIfConfigured } = await import(
      "@/services/pohoda/export-payment-proof"
    );
    await runPaymentProofPohodaExportIfConfigured(doc.paymentProof.id);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const msg = explainDriveStorageError(raw);
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.NEEDS_REVIEW,
        parseError: msg.slice(0, 4000),
      },
    });
    await writeAuditLog({
      entityType: "Document",
      entityId: documentId,
      action: "drive_upload_failed",
      metadata: { kind: "payment", error: msg.slice(0, 2000) },
    });
  }
}

/**
 * Faktura po schválení — volá approve API.
 */
export async function uploadApprovedInvoiceToDrive(
  documentId: string,
): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  if (!isDriveConfigured()) {
    await writeAuditLog({
      entityType: "Document",
      entityId: documentId,
      action: "drive_skipped",
      metadata: { reason: "not_configured", kind: "invoice" },
    });
    return { ok: false, error: "Drive není nakonfigurován." };
  }

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { invoice: true, email: true },
  });
  if (
    !doc ||
    doc.documentType !== DocumentType.INVOICE ||
    doc.status !== DocumentStatus.APPROVED ||
    !doc.invoice
  ) {
    return {
      ok: false,
      error: "Neplatný stav dokumentu pro upload faktury.",
    };
  }

  try {
    const fs = await import("node:fs/promises");
    const buffer = await loadDocumentFileBuffer(doc, {
      driveFileId: doc.invoice.driveFileId,
    });
    const drive = getDrive();
    const root = invoicesRootFolderId();
    await assertFolderIsOnSharedDrive(drive, root, "faktury (GOOGLE_DRIVE_INVOICES_FOLDER_ID)");
    const uploadedAt = new Date();
    const { folderId, displayPath } = await ensureYearMonthFolder(
      drive,
      root,
      uploadedAt,
    );
    const fileName = safeFileName(doc.originalFilename);
    const uploaded = await uploadBufferToFolder(
      drive,
      folderId,
      fileName,
      buffer,
      doc.mimeType || mimeForFilename(fileName),
    );

    await prisma.invoice.update({
      where: { id: doc.invoice.id },
      data: {
        driveFileId: uploaded.id,
        driveUrl: uploaded.webViewLink,
      },
    });

    await prisma.document.update({
      where: { id: documentId },
      data: {
        localFilePath: null,
      },
    });

    if (doc.localFilePath) {
      try {
        await fs.unlink(doc.localFilePath);
      } catch {
        /* ignore */
      }
    }

    await writeAuditLog({
      entityType: "Document",
      entityId: documentId,
      action: "drive_uploaded",
      metadata: {
        kind: "invoice",
        driveFileId: uploaded.id,
        folder: displayPath,
        fileName,
      },
    });

    return { ok: true, url: uploaded.webViewLink };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const msg = explainDriveStorageError(raw);
    await prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.UPLOAD_FAILED, parseError: msg.slice(0, 4000) },
    });
    await writeAuditLog({
      entityType: "Document",
      entityId: documentId,
      action: "drive_upload_failed",
      metadata: { kind: "invoice", error: msg.slice(0, 2000) },
    });
    return { ok: false, error: msg };
  }
}
