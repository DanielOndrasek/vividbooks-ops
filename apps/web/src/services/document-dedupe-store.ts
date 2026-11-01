/**
 * Duplicity dokladů v DB: hledání podle logického klíče, trvalé stopy, označení duplicity / obnovení.
 */

import { DocumentStatus, DocumentType } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import type { ExistingDocForDedup } from "@/lib/document-dedupe";
import { prisma } from "@/lib/prisma";

export type FingerprintOutcome = "kept" | "duplicate" | "own_issued";

/**
 * Existující doklad se stejným klíčem. Přednost má účtenka (doklad k platbě), pak cokoli živého v DB,
 * nakonec jen stopa po promazaném dokladu.
 */
export async function findExistingByDedupKey(
  dedupKey: string,
  excludeDocumentId?: string,
): Promise<ExistingDocForDedup | null> {
  const docs = await prisma.document.findMany({
    where: {
      dedupKey,
      // Zamítnutý originál nesmí schovat opravenou verzi faktury.
      status: { notIn: [DocumentStatus.DUPLICATE, DocumentStatus.REJECTED] },
      ...(excludeDocumentId ? { id: { not: excludeDocumentId } } : {}),
    },
    select: { id: true, documentType: true, status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const storedReceipt = docs.find(
    (d) => d.documentType === DocumentType.PAYMENT_RECEIPT && d.status === DocumentStatus.STORED,
  );
  const receipt = docs.find((d) => d.documentType === DocumentType.PAYMENT_RECEIPT);
  const pick = storedReceipt ?? receipt ?? docs[0];
  if (pick) {
    return { documentId: pick.id, documentType: pick.documentType, status: pick.status };
  }
  // Stopa platí jen za dokument, který už v DB není (promazané schválené faktury).
  // Živé dokumenty (i zamítnuté) rozhodl dotaz výše — zamítnutý originál nic neschová.
  const fps = await prisma.documentFingerprint.findMany({
    where: {
      dedupKey,
      outcome: "kept",
      ...(excludeDocumentId ? { NOT: { documentId: excludeDocumentId } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  for (const fp of fps) {
    if (fp.documentId) {
      const alive = await prisma.document.findUnique({ where: { id: fp.documentId }, select: { id: true } });
      if (alive) continue;
    }
    return { documentId: null, documentType: fp.documentType, status: null };
  }
  return null;
}

export async function recordFingerprint(input: {
  contentHash: string | null;
  dedupKey: string | null;
  documentType: DocumentType;
  outcome: FingerprintOutcome;
  documentId: string | null;
  supplierName?: string | null;
  documentNumber?: string | null;
}): Promise<void> {
  const data = {
    dedupKey: input.dedupKey,
    documentType: input.documentType,
    outcome: input.outcome,
    documentId: input.documentId,
    supplierName: input.supplierName?.slice(0, 300) ?? null,
    documentNumber: input.documentNumber?.slice(0, 120) ?? null,
  };
  if (input.contentHash) {
    await prisma.documentFingerprint.upsert({
      where: { contentHash: input.contentHash },
      create: { contentHash: input.contentHash, ...data },
      update: data,
    });
    return;
  }
  if (input.documentId) {
    const existing = await prisma.documentFingerprint.findFirst({
      where: { documentId: input.documentId },
      select: { id: true },
    });
    if (existing) {
      await prisma.documentFingerprint.update({ where: { id: existing.id }, data });
      return;
    }
  }
  await prisma.documentFingerprint.create({ data: { contentHash: null, ...data } });
}

/** Označí dokument jako duplicitu (zůstane v DB kvůli obnovení, ze seznamů zmizí). */
export async function markDocumentDuplicate(input: {
  documentId: string;
  keepDocumentId: string | null;
  reason: string;
  userId?: string | null;
}): Promise<void> {
  await prisma.document.update({
    where: { id: input.documentId },
    data: {
      status: DocumentStatus.DUPLICATE,
      duplicateOfDocumentId: input.keepDocumentId,
      needsManualReview: false,
    },
  });
  await prisma.documentFingerprint.updateMany({
    where: { documentId: input.documentId },
    data: { outcome: "duplicate" },
  });
  await writeAuditLog({
    entityType: "Document",
    entityId: input.documentId,
    userId: input.userId ?? null,
    action: "marked_duplicate",
    metadata: { keepDocumentId: input.keepDocumentId, reason: input.reason },
  });
}

export type RestoreDuplicateResult =
  | { ok: true; status: DocumentStatus }
  | { ok: false; error: string; httpStatus: number };

/** Vrátí duplicitu zpět do evidence: faktura → ke kontrole, platba → uložení na Drive. */
export async function restoreDuplicateDocument(
  documentId: string,
  userId: string | null,
): Promise<RestoreDuplicateResult> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { invoice: { select: { id: true } }, paymentProof: { select: { id: true } } },
  });
  if (!doc) {
    return { ok: false, error: "Doklad nenalezen.", httpStatus: 404 };
  }
  if (doc.status !== DocumentStatus.DUPLICATE) {
    return { ok: false, error: "Doklad není označený jako duplicita.", httpStatus: 400 };
  }

  let nextStatus: DocumentStatus;
  if (doc.invoice) {
    nextStatus = DocumentStatus.NEEDS_REVIEW;
  } else if (doc.paymentProof) {
    nextStatus = DocumentStatus.RECEIVED;
  } else {
    nextStatus = DocumentStatus.NEEDS_REVIEW;
  }

  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: nextStatus,
      duplicateOfDocumentId: null,
      // Klíč smažeme, jinak by se obnovený doklad dál „srážel“ s originálem.
      dedupKey: null,
      needsManualReview: nextStatus === DocumentStatus.NEEDS_REVIEW,
    },
  });
  await prisma.documentFingerprint.updateMany({
    where: { documentId },
    data: { outcome: "kept", dedupKey: null },
  });
  await writeAuditLog({
    entityType: "Document",
    entityId: documentId,
    userId,
    action: "duplicate_restored",
    metadata: { status: nextStatus },
  });

  if (doc.paymentProof) {
    const { uploadPaymentReceiptIfConfigured } = await import("@/services/drive");
    await uploadPaymentReceiptIfConfigured(documentId);
  }

  const after = await prisma.document.findUnique({
    where: { id: documentId },
    select: { status: true },
  });
  return { ok: true, status: after?.status ?? nextStatus };
}
