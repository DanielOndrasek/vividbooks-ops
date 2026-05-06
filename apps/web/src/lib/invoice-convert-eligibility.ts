import { DocumentStatus, DocumentType } from "@prisma/client";

/** Doklady ve stavu „ještě ne hotová schválená faktura na Drive“. */
const CONVERTIBLE_STATUSES = new Set<DocumentStatus>([
  DocumentStatus.PENDING_APPROVAL,
  DocumentStatus.NEEDS_REVIEW,
  DocumentStatus.REJECTED,
  DocumentStatus.UPLOAD_FAILED,
]);

/** Čistá logika bez importu služeb (Drive, Prisma klient) — bezpečné pro RSC stránky. */
export function isInvoiceConvertibleToPaymentProof(
  documentType: DocumentType,
  documentStatus: DocumentStatus,
): boolean {
  return (
    documentType === DocumentType.INVOICE &&
    CONVERTIBLE_STATUSES.has(documentStatus)
  );
}
