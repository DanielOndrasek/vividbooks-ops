import { DocumentStatus, DocumentType } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export type DeletePaymentProofResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code: "not_found" | "has_invoice";
    };

/**
 * Stejná logika jako DELETE /api/payment-proofs/[id].
 */
export async function deletePaymentProofById(
  proofId: string,
  userId: string,
): Promise<DeletePaymentProofResult> {
  const proof = await prisma.paymentProof.findUnique({
    where: { id: proofId },
    include: {
      document: { include: { invoice: { select: { id: true } } } },
    },
  });

  if (!proof) {
    return { ok: false, error: "Záznam nenalezen.", code: "not_found" };
  }

  if (proof.document.invoice) {
    return {
      ok: false,
      error:
        "U tohoto dokladu existuje faktura — nelze smazat jen evidenci platby. Použijte smazání celého dokladu nebo zamítnutí faktury.",
      code: "has_invoice",
    };
  }

  const note = "Evidence platby odstraněna.";

  await prisma.$transaction([
    prisma.paymentProof.delete({ where: { id: proofId } }),
    prisma.document.update({
      where: { id: proof.documentId },
      data: {
        documentType: DocumentType.UNKNOWN,
        status: DocumentStatus.REJECTED,
        needsManualReview: false,
        parseError: note,
      },
    }),
  ]);

  await writeAuditLog({
    entityType: "PaymentProof",
    entityId: proofId,
    userId,
    action: "payment_proof_deleted",
    metadata: { documentId: proof.documentId },
  });

  return { ok: true };
}
