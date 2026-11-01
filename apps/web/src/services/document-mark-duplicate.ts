import { DocumentStatus } from "@prisma/client";

import { normalizeSupplierName } from "@/lib/document-dedupe";
import { prisma } from "@/lib/prisma";
import { markDocumentDuplicate } from "@/services/document-dedupe-store";

export type MarkDuplicateResult =
  | { ok: true }
  | { ok: false; error: string; httpStatus: number };

/** Schválené faktury už odešly — ty neoznačujeme. Uloženou platbu jen s odkazem na doklad, který zůstává. */
const NOT_MARKABLE = new Set<DocumentStatus>([
  DocumentStatus.APPROVED,
  DocumentStatus.DUPLICATE,
]);

export async function markDuplicateFromUser(input: {
  documentId: string;
  duplicateOfDocumentId: string | null;
  reason: string;
  userId: string | null;
}): Promise<MarkDuplicateResult> {
  const doc = await prisma.document.findUnique({
    where: { id: input.documentId },
    select: { id: true, status: true },
  });
  if (!doc) {
    return { ok: false, error: "Doklad nenalezen.", httpStatus: 404 };
  }
  if (NOT_MARKABLE.has(doc.status)) {
    return {
      ok: false,
      error: "Schválený doklad nebo už označenou duplicitu nelze označit.",
      httpStatus: 400,
    };
  }
  if (input.duplicateOfDocumentId === input.documentId) {
    return { ok: false, error: "Doklad nemůže být duplicitou sám sebe.", httpStatus: 400 };
  }
  if (input.duplicateOfDocumentId) {
    const keep = await prisma.document.findUnique({
      where: { id: input.duplicateOfDocumentId },
      select: { status: true },
    });
    if (!keep || keep.status === DocumentStatus.DUPLICATE) {
      return { ok: false, error: "Doklad, který má zůstat, neexistuje nebo je sám duplicitou.", httpStatus: 400 };
    }
    if (doc.status === DocumentStatus.STORED) {
      // Uloženou platbu skrýt jen za doklad se stejným dodavatelem a částkou.
      const [a, b] = await Promise.all([
        docMoney(input.documentId),
        docMoney(input.duplicateOfDocumentId),
      ]);
      const sameSupplier = a.supplier !== "" && a.supplier === b.supplier;
      const sameAmount = a.amount != null && b.amount != null && Math.abs(Math.abs(a.amount) - Math.abs(b.amount)) < 0.01;
      if (!sameSupplier || !sameAmount) {
        return {
          ok: false,
          error: "Uložená platba se neshoduje s ponechaným dokladem (dodavatel nebo částka) — nelze skrýt.",
          httpStatus: 400,
        };
      }
    }
  } else if (doc.status === DocumentStatus.STORED) {
    // Bez originálu by uložená platba tiše zmizela z dávky pro účetní.
    return {
      ok: false,
      error: "U uložené platby uveďte duplicateOfDocumentId (doklad, který v evidenci zůstává).",
      httpStatus: 400,
    };
  }
  await markDocumentDuplicate({
    documentId: input.documentId,
    keepDocumentId: input.duplicateOfDocumentId,
    reason: input.reason,
    userId: input.userId,
  });
  return { ok: true };
}

async function docMoney(documentId: string): Promise<{ supplier: string; amount: number | null }> {
  const d = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      invoice: { select: { supplierName: true, amountWithVat: true } },
      paymentProof: { select: { counterpartyName: true, amount: true } },
    },
  });
  const supplier = normalizeSupplierName(d?.invoice?.supplierName ?? d?.paymentProof?.counterpartyName ?? "");
  const raw = d?.invoice?.amountWithVat ?? d?.paymentProof?.amount ?? null;
  return { supplier, amount: raw != null ? Number(raw) : null };
}
