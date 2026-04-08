import { DocumentStatus, DocumentType } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import {
  DOCUMENT_REQUEUE_AI_DATA,
  isDocumentEligibleForAiRequeue,
  prismaWhereDocumentsEligibleForAiRequeue,
} from "@/lib/document-ai-requeue";
import { prisma } from "@/lib/prisma";
import { uploadPaymentReceiptIfConfigured } from "@/services/drive";

export type ReviewResolveAction =
  | "requeue_ai"
  | "confirm_invoice"
  | "confirm_payment"
  | "dismiss";

export type ReviewResolveResult =
  | { ok: true }
  | { ok: false; error: string; httpStatus: number };

export type DocumentReviewCapabilities = {
  canRequeueAi: boolean;
  canConfirmInvoice: boolean;
  canConfirmPayment: boolean;
  canDismiss: boolean;
  canRejectInvoice: boolean;
};

export function getDocumentReviewCapabilities(doc: {
  documentType: DocumentType;
  status: DocumentStatus;
  invoice: { id: string } | null;
  paymentProof: { id: string } | null;
}): DocumentReviewCapabilities {
  const st = doc.status;
  const canRejectInvoice =
    doc.invoice != null &&
    (st === DocumentStatus.NEEDS_REVIEW || st === DocumentStatus.PENDING_APPROVAL);

  const canConfirmInvoice =
    doc.invoice != null &&
    doc.documentType === DocumentType.INVOICE &&
    st === DocumentStatus.NEEDS_REVIEW;

  const canConfirmPayment =
    doc.paymentProof != null &&
    doc.documentType === DocumentType.PAYMENT_RECEIPT &&
    st === DocumentStatus.NEEDS_REVIEW;

  const canRequeueAi = isDocumentEligibleForAiRequeue({
    status: doc.status,
    documentType: doc.documentType,
    invoice: doc.invoice,
    paymentProof: doc.paymentProof,
  });

  const hasInvoice = doc.invoice != null;

  const canDismiss =
    !hasInvoice &&
    ((doc.paymentProof != null && st === DocumentStatus.NEEDS_REVIEW) ||
      (doc.paymentProof == null &&
        (doc.documentType === DocumentType.UNKNOWN ||
          st === DocumentStatus.ERROR ||
          (st === DocumentStatus.NEEDS_REVIEW &&
            doc.documentType !== DocumentType.INVOICE))));

  return {
    canRequeueAi,
    canConfirmInvoice,
    canConfirmPayment,
    canDismiss,
    canRejectInvoice,
  };
}

export async function executeReviewResolve(
  documentId: string,
  action: ReviewResolveAction,
  userId: string,
  reason?: string | null,
): Promise<ReviewResolveResult> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { invoice: { select: { id: true } }, paymentProof: { select: { id: true } } },
  });

  if (!doc) {
    return { ok: false, error: "Doklad nenalezen.", httpStatus: 404 };
  }

  const caps = getDocumentReviewCapabilities(doc);

  switch (action) {
    case "requeue_ai": {
      if (!caps.canRequeueAi) {
        return {
          ok: false,
          error: "Tento doklad nelze znovu zařadit k AI (typ, stav nebo už existuje faktura / platba).",
          httpStatus: 400,
        };
      }
      const n = await prisma.document.updateMany({
        where: prismaWhereDocumentsEligibleForAiRequeue({ equals: documentId }),
        data: DOCUMENT_REQUEUE_AI_DATA,
      });
      if (n.count === 0) {
        return { ok: false, error: "Aktualizace se nezdařila.", httpStatus: 400 };
      }
      await writeAuditLog({
        entityType: "Document",
        entityId: documentId,
        userId,
        action: "review_requeue_ai",
        metadata: {},
      });
      return { ok: true };
    }

    case "confirm_invoice": {
      if (!caps.canConfirmInvoice) {
        return {
          ok: false,
          error: "Lze jen u faktury ve stavu ke kontrole.",
          httpStatus: 400,
        };
      }
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.PENDING_APPROVAL,
          needsManualReview: false,
          parseError: null,
        },
      });
      await writeAuditLog({
        entityType: "Document",
        entityId: documentId,
        userId,
        action: "review_confirm_invoice",
        metadata: { invoiceId: doc.invoice!.id },
      });
      return { ok: true };
    }

    case "confirm_payment": {
      if (!caps.canConfirmPayment) {
        return {
          ok: false,
          error: "Lze jen u dokladu platby ve stavu ke kontrole.",
          httpStatus: 400,
        };
      }
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.RECEIVED,
          needsManualReview: false,
          parseError: null,
        },
      });
      await writeAuditLog({
        entityType: "Document",
        entityId: documentId,
        userId,
        action: "review_confirm_payment",
        metadata: { paymentProofId: doc.paymentProof!.id },
      });
      await uploadPaymentReceiptIfConfigured(documentId);
      return { ok: true };
    }

    case "dismiss": {
      if (!caps.canDismiss) {
        return {
          ok: false,
          error: "Vyřadit lze doklady bez faktury (např. neplatná příloha nebo špatná platba).",
          httpStatus: 400,
        };
      }
      if (doc.invoice) {
        return {
          ok: false,
          error: "U faktury použijte „Zamítnout fakturu“.",
          httpStatus: 400,
        };
      }

      const note = (reason?.trim() || "Vyřazeno z kontroly").slice(0, 4000);

      if (doc.paymentProof) {
        await prisma.$transaction([
          prisma.paymentProof.delete({ where: { documentId } }),
          prisma.document.update({
            where: { id: documentId },
            data: {
              documentType: DocumentType.UNKNOWN,
              status: DocumentStatus.REJECTED,
              needsManualReview: false,
              parseError: note,
            },
          }),
        ]);
      } else {
        await prisma.document.update({
          where: { id: documentId },
          data: {
            status: DocumentStatus.REJECTED,
            needsManualReview: false,
            parseError: note,
          },
        });
      }

      await writeAuditLog({
        entityType: "Document",
        entityId: documentId,
        userId,
        action: "review_dismissed",
        metadata: { hadPaymentProof: Boolean(doc.paymentProof) },
      });
      return { ok: true };
    }

    default:
      return { ok: false, error: "Neznámá akce.", httpStatus: 400 };
  }
}
