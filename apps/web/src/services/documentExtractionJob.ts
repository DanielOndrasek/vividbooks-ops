/**
 * Dokumenty NEW + UNCLASSIFIED → klasifikace + extrakce → faktury (schválení) / platby (Drive).
 */

import { readFile } from "node:fs/promises";

import { DocumentStatus, DocumentType } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  classifyDocument,
  extractInvoiceData,
  resolveMediaType,
} from "@/services/documentParser";
import { uploadPaymentReceiptIfConfigured } from "@/services/drive";

function confidenceThreshold(): number {
  const n = Number(process.env.AI_CONFIDENCE_THRESHOLD);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.7;
}

function batchLimit(): number {
  const n = Number(process.env.AI_BATCH_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 10;
}

function parseIsoDate(raw: string | null): Date | null {
  if (!raw?.trim()) {
    return null;
  }
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function numToDecimalString(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) {
    return null;
  }
  return String(n);
}

function missingInvoiceCriticalFields(extraction: {
  supplierName: string | null;
  amountWithoutVat: number | null;
  amountWithVat: number | null;
  dueDate: string | null;
}): boolean {
  return (
    !extraction.supplierName?.trim() ||
    extraction.amountWithoutVat == null ||
    extraction.amountWithVat == null ||
    !extraction.dueDate?.trim()
  );
}

export type DocumentExtractionJobResult = {
  jobId: string;
  candidates: number;
  processed: number;
  failed: number;
};

export async function runDocumentExtractionJob(): Promise<DocumentExtractionJobResult> {
  const limit = batchLimit();
  const docs = await prisma.document.findMany({
    where: {
      status: "NEW",
      documentType: "UNCLASSIFIED",
      localFilePath: { not: null },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const job = await prisma.processingJob.create({
    data: {
      type: "ocr_extract",
      status: "processing",
      metadata: {
        documentIds: docs.map((d) => d.id),
        limit,
      },
    },
  });

  let processed = 0;
  let failed = 0;
  const threshold = confidenceThreshold();

  try {
    for (const doc of docs) {
      try {
        await processOneDocument(
          doc.id,
          doc.localFilePath!,
          doc.originalFilename,
          threshold,
        );
        processed += 1;
      } catch (err) {
        failed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.document.update({
          where: { id: doc.id },
          data: {
            status: DocumentStatus.ERROR,
            parseError: msg.slice(0, 8000),
            aiRawResponse: msg.slice(0, 8000),
          },
        });
        await writeAuditLog({
          entityType: "Document",
          entityId: doc.id,
          action: "extraction_failed",
          metadata: { error: msg },
        });
      }
    }

    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        metadata: {
          candidates: docs.length,
          processed,
          failed,
        },
      },
    });

    return {
      jobId: job.id,
      candidates: docs.length,
      processed,
      failed,
    };
  } catch (err) {
    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

async function processOneDocument(
  id: string,
  localFilePath: string,
  originalFilename: string,
  threshold: number,
): Promise<void> {
  const buffer = await readFile(localFilePath);
  const mediaType = resolveMediaType(originalFilename);

  const classification = await classifyDocument(buffer, mediaType);

  if (classification.type === "UNKNOWN") {
    const rawBundle = JSON.stringify({ classification, threshold });
    await prisma.document.update({
      where: { id },
      data: {
        documentType: DocumentType.UNKNOWN,
        status: DocumentStatus.NEEDS_REVIEW,
        classificationConfidence: classification.confidence,
        aiRawResponse: rawBundle.slice(0, 65000),
        needsManualReview: true,
      },
    });
    await writeAuditLog({
      entityType: "Document",
      entityId: id,
      action: "classified_unknown",
      metadata: { confidence: classification.confidence },
    });
    return;
  }

  const extraction = await extractInvoiceData(
    buffer,
    mediaType,
    classification.type,
  );

  const combinedConfidence = Math.min(
    classification.confidence,
    extraction.confidence,
  );

  const rawBundle = JSON.stringify({
    classification,
    extraction,
    threshold,
  });

  if (classification.type === "PAYMENT_RECEIPT") {
    const note = [
      extraction.supplierName,
      extraction.bankAccount,
      extraction.invoiceNumber,
    ]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 4000);

    await prisma.paymentProof.create({
      data: {
        documentId: id,
        proofType: "PAYMENT_RECEIPT",
        note: note || null,
      },
    });

    await prisma.document.update({
      where: { id },
      data: {
        documentType: DocumentType.PAYMENT_RECEIPT,
        status: DocumentStatus.RECEIVED,
        classificationConfidence: classification.confidence,
        aiRawResponse: rawBundle.slice(0, 65000),
        needsManualReview: combinedConfidence < threshold,
      },
    });

    await writeAuditLog({
      entityType: "Document",
      entityId: id,
      action: "data_extracted",
      metadata: {
        type: "PAYMENT_RECEIPT",
        combinedConfidence,
      },
    });

    await uploadPaymentReceiptIfConfigured(id);
    return;
  }

  const missingCritical = missingInvoiceCriticalFields(extraction);
  const needsManualReview =
    combinedConfidence < threshold || missingCritical;
  const nextStatus = needsManualReview
    ? DocumentStatus.NEEDS_REVIEW
    : DocumentStatus.PENDING_APPROVAL;

  await prisma.invoice.create({
    data: {
      documentId: id,
      supplierName: extraction.supplierName,
      supplierICO: extraction.supplierICO,
      invoiceNumber: extraction.invoiceNumber,
      amountWithVat: numToDecimalString(extraction.amountWithVat),
      amountWithoutVat: numToDecimalString(extraction.amountWithoutVat),
      currency: (extraction.currency?.trim() || "CZK").slice(0, 8),
      issueDate: parseIsoDate(extraction.issueDate),
      dueDate: parseIsoDate(extraction.dueDate),
      extractionConfidence: combinedConfidence,
    },
  });

  await prisma.document.update({
    where: { id },
    data: {
      documentType: DocumentType.INVOICE,
      status: nextStatus,
      classificationConfidence: classification.confidence,
      aiRawResponse: rawBundle.slice(0, 65000),
      needsManualReview,
    },
  });

  await writeAuditLog({
    entityType: "Document",
    entityId: id,
    action: "data_extracted",
    metadata: {
      type: "INVOICE",
      combinedConfidence,
      needsManualReview,
      missingCritical,
    },
  });
}
