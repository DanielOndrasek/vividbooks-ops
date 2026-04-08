import { DocumentStatus, DocumentType } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

function retentionDays(): number {
  const n = Number(process.env.INVOICE_DB_RETENTION_DAYS);
  if (Number.isFinite(n) && n >= 1 && n <= 3650) {
    return Math.floor(n);
  }
  return 30;
}

export type InvoiceDbPruneResult = {
  deleted: number;
  retentionDays: number;
  cutoffIso: string;
};

/**
 * Schválené faktury už nahrané na Drive: po X dnech od schválení smaže Document (a kaskádou Invoice)
 * z databáze. Soubor na sdíleném disku zůstane.
 */
export async function runInvoiceDbPruneJob(): Promise<InvoiceDbPruneResult> {
  const days = retentionDays();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  cutoff.setUTCHours(0, 0, 0, 0);

  const invoices = await prisma.invoice.findMany({
    where: {
      approvedAt: { lt: cutoff },
      driveFileId: { not: null },
      document: {
        status: DocumentStatus.APPROVED,
        documentType: DocumentType.INVOICE,
      },
    },
    select: { id: true, documentId: true },
  });

  if (invoices.length === 0) {
    return {
      deleted: 0,
      retentionDays: days,
      cutoffIso: cutoff.toISOString(),
    };
  }

  const documentIds = invoices.map((i) => i.documentId);

  await prisma.document.deleteMany({
    where: { id: { in: documentIds } },
  });

  await writeAuditLog({
    entityType: "System",
    entityId: "invoice_db_prune",
    action: "invoices_pruned_from_db",
    metadata: {
      deleted: invoices.length,
      retentionDays: days,
      cutoffIso: cutoff.toISOString(),
      invoiceIdsSample: invoices.slice(0, 40).map((i) => i.id),
    },
  });

  return {
    deleted: invoices.length,
    retentionDays: days,
    cutoffIso: cutoff.toISOString(),
  };
}
