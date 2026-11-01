import { DocumentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { markDocumentDuplicate } from "@/services/document-dedupe-store";

export type MarkDuplicateResult =
  | { ok: true }
  | { ok: false; error: string; httpStatus: number };

/** Schválené (už odeslané) a uložené platby neoznačujeme — to by jen schovalo, co už má účetní. */
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
  await markDocumentDuplicate({
    documentId: input.documentId,
    keepDocumentId: input.duplicateOfDocumentId,
    reason: input.reason,
    userId: input.userId,
  });
  return { ok: true };
}
