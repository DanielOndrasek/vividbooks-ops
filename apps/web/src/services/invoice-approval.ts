import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { uploadApprovedInvoiceToDrive } from "@/services/drive";
import { runInvoicePohodaExportIfConfigured } from "@/services/pohoda/export-invoice";

const APPROVABLE_STATUSES = new Set(["PENDING_APPROVAL", "NEEDS_REVIEW"]);

export type InvoiceApprovalResult =
  | { ok: true; invoiceId: string; driveUrl: string | null }
  | { ok: false; invoiceId: string; error: string; httpStatus: number };

/**
 * Jedno schválení faktury (DB + audit + upload na Drive). Používá API jednotlivě i hromadně.
 */
export async function runInvoiceApproval(
  invoiceId: string,
  userId: string,
): Promise<InvoiceApprovalResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { document: true },
  });

  if (!invoice) {
    return {
      ok: false,
      invoiceId,
      error: "Nenalezeno.",
      httpStatus: 404,
    };
  }

  if (!APPROVABLE_STATUSES.has(invoice.document.status)) {
    return {
      ok: false,
      invoiceId,
      error: "Fakturu lze schválit jen ve stavu čeká / ke kontrole.",
      httpStatus: 400,
    };
  }

  await prisma.$transaction([
    prisma.document.update({
      where: { id: invoice.documentId },
      data: { status: "APPROVED" },
    }),
    prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        approvedByUserId: userId,
        approvedAt: new Date(),
        rejectionReason: null,
      },
    }),
  ]);

  await writeAuditLog({
    entityType: "Invoice",
    entityId: invoiceId,
    userId,
    action: "approved",
    metadata: {},
  });

  const upload = await uploadApprovedInvoiceToDrive(invoice.documentId);
  if (!upload.ok) {
    return {
      ok: false,
      invoiceId,
      error: upload.error,
      httpStatus: 502,
    };
  }

  await runInvoicePohodaExportIfConfigured(invoiceId);

  return {
    ok: true,
    invoiceId,
    driveUrl: upload.url,
  };
}
