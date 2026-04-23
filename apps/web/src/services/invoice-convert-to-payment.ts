import { DocumentStatus, DocumentType } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { uploadPaymentReceiptIfConfigured } from "@/services/drive";

/** Doklady ve stavu „ještě ne hotová schválená faktura na Drive“. */
const CONVERTIBLE_STATUSES = new Set<DocumentStatus>([
  DocumentStatus.PENDING_APPROVAL,
  DocumentStatus.NEEDS_REVIEW,
  DocumentStatus.REJECTED,
  DocumentStatus.UPLOAD_FAILED,
]);

export function isInvoiceConvertibleToPaymentProof(
  documentType: DocumentType,
  documentStatus: DocumentStatus,
): boolean {
  return (
    documentType === DocumentType.INVOICE &&
    CONVERTIBLE_STATUSES.has(documentStatus)
  );
}

function noteFromInvoice(inv: {
  supplierName: string | null;
  invoiceNumber: string | null;
  amountWithVat: { toString(): string } | null;
  currency: string;
}): string | null {
  const parts = [
    inv.supplierName,
    inv.invoiceNumber ? `č. ${inv.invoiceNumber}` : null,
    inv.amountWithVat != null ? `${inv.amountWithVat.toString()} ${inv.currency}` : null,
  ].filter(Boolean);
  const s = parts.join(" · ").slice(0, 4000);
  return s || null;
}

export type ConvertInvoiceResult =
  | { ok: true; documentId: string; formerInvoiceId: string }
  | { ok: false; error: string; httpStatus: number; invoiceId: string };

/**
 * Smaže řádek Invoice, vytvoří PaymentProof a nastaví dokument jako PAYMENT_RECEIPT.
 * Poté zkusí upload na Drive (složky plateb), stejně jako po AI klasifikaci platby.
 */
export async function convertInvoiceToPaymentProof(
  invoiceId: string,
  userId: string,
): Promise<ConvertInvoiceResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { document: true },
  });

  if (!invoice) {
    return {
      ok: false,
      invoiceId,
      error: "Faktura nenalezena.",
      httpStatus: 404,
    };
  }

  const doc = invoice.document;
  if (!isInvoiceConvertibleToPaymentProof(doc.documentType, doc.status)) {
    return {
      ok: false,
      invoiceId,
      error:
        "Převod je možný jen pro faktury ve stavu čeká, ke kontrole, zamítnuté nebo chyba uploadu — ne pro již schválené.",
      httpStatus: 400,
    };
  }

  const documentId = invoice.documentId;
  const note = noteFromInvoice(invoice);
  const icoDigits = invoice.supplierICO?.replace(/\D/g, "") || null;

  await prisma.$transaction([
    prisma.invoice.delete({ where: { id: invoiceId } }),
    prisma.paymentProof.create({
      data: {
        documentId,
        proofType: "PAYMENT_RECEIPT",
        note,
        amount: invoice.amountWithVat,
        currency: invoice.currency,
        counterpartyName: invoice.supplierName,
        counterpartyICO: icoDigits,
        variableSymbol: invoice.variableSymbol?.replace(/\D/g, "") || null,
        constantSymbol: invoice.constantSymbol?.replace(/\D/g, "") || null,
        specificSymbol: invoice.specificSymbol?.replace(/\D/g, "") || null,
        bankAccountNo: invoice.domesticAccount?.trim() || null,
      },
    }),
    prisma.document.update({
      where: { id: documentId },
      data: {
        documentType: DocumentType.PAYMENT_RECEIPT,
        status: DocumentStatus.RECEIVED,
        needsManualReview: false,
        parseError: null,
      },
    }),
  ]);

  await writeAuditLog({
    entityType: "Document",
    entityId: documentId,
    userId,
    action: "converted_invoice_to_payment_proof",
    metadata: {
      formerInvoiceId: invoiceId,
      supplierName: invoice.supplierName,
      notePreview: note?.slice(0, 200) ?? null,
    },
  });

  await uploadPaymentReceiptIfConfigured(documentId);

  return {
    ok: true,
    documentId,
    formerInvoiceId: invoiceId,
  };
}
