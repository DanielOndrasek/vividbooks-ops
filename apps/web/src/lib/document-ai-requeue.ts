import type { DocumentStatus, DocumentType, Prisma } from "@prisma/client";

/** Společná data pro návrat dokladu do fronty AI extrakce. */
export const DOCUMENT_REQUEUE_AI_DATA: Prisma.DocumentUpdateManyMutationInput = {
  status: "NEW",
  documentType: "UNCLASSIFIED",
  parseError: null,
  aiRawResponse: null,
  needsManualReview: false,
  classificationConfidence: null,
};

export type DocumentRequeueEligibilityInput = {
  status: DocumentStatus;
  documentType: DocumentType;
  invoice: { id: string } | null;
  paymentProof: { id: string } | null;
};

/** Lze znovu zařadit k AI (bez vazby na fakturu / platbu). */
export function isDocumentEligibleForAiRequeue(
  d: DocumentRequeueEligibilityInput,
): boolean {
  if (d.invoice != null || d.paymentProof != null) {
    return false;
  }
  if (d.status === "ERROR" && d.documentType === "UNCLASSIFIED") {
    return true;
  }
  if (d.documentType === "UNKNOWN" && d.status === "NEEDS_REVIEW") {
    return true;
  }
  if (d.status === "NEEDS_REVIEW" && d.documentType === "UNCLASSIFIED") {
    return true;
  }
  return false;
}

/** Prisma filtr pro hromadné / výběrové zařazení (shodné s `isDocumentEligibleForAiRequeue`). */
export function prismaWhereDocumentsEligibleForAiRequeue(
  idFilter?: Prisma.StringFilter,
): Prisma.DocumentWhereInput {
  return {
    ...(idFilter ? { id: idFilter } : {}),
    invoice: { is: null },
    paymentProof: { is: null },
    OR: [
      { status: "ERROR", documentType: "UNCLASSIFIED" },
      { documentType: "UNKNOWN", status: "NEEDS_REVIEW" },
      { status: "NEEDS_REVIEW", documentType: "UNCLASSIFIED" },
    ],
  };
}
