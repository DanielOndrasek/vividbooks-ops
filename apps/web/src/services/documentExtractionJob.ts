/**
 * Dokumenty NEW + UNCLASSIFIED → klasifikace + extrakce → faktury (schválení) / platby (Drive).
 */

import { DocumentStatus, DocumentType, Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import type { ExtractionResult } from "@/lib/documentSchemas";
import { loadDocumentFileBuffer } from "@/lib/document-file-buffer";
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
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 30;
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

function digitsOnly(raw: string | null | undefined): string | null {
  const d = raw?.replace(/\D/g, "") ?? "";
  return d.length > 0 ? d : null;
}

function hasIcoOrDic(extraction: ExtractionResult): boolean {
  return Boolean(
    digitsOnly(extraction.supplierICO) ||
      extraction.supplierDIC?.trim(),
  );
}

function missingInvoiceCriticalFields(extraction: ExtractionResult): boolean {
  return (
    !extraction.supplierName?.trim() ||
    !extraction.invoiceNumber?.trim() ||
    extraction.amountWithoutVat == null ||
    extraction.amountWithVat == null ||
    !extraction.dueDate?.trim() ||
    !hasIcoOrDic(extraction)
  );
}

function missingStructuredInvoiceLines(extraction: ExtractionResult): boolean {
  return !Array.isArray(extraction.invoiceLines) || extraction.invoiceLines.length === 0;
}

function czkMissingVariableSymbol(extraction: ExtractionResult): boolean {
  const cur = (extraction.currency?.trim() || "CZK").toUpperCase();
  if (cur !== "CZK") {
    return false;
  }
  return !digitsOnly(extraction.variableSymbol);
}

function paymentReceiptNeedsReview(
  extraction: ExtractionResult,
  threshold: number,
  combinedConfidence: number,
): boolean {
  if (combinedConfidence < threshold) {
    return true;
  }
  if (extraction.amountWithVat == null || !Number.isFinite(extraction.amountWithVat)) {
    return true;
  }
  return false;
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
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { email: true },
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
        await processOneDocument(doc, threshold);
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
  doc: {
    id: string;
    originalFilename: string;
    localFilePath: string | null;
    gmailAttachmentId: string;
    email: { gmailMessageId: string } | null;
  },
  threshold: number,
): Promise<void> {
  const buffer = await loadDocumentFileBuffer(doc);
  const mediaType = resolveMediaType(doc.originalFilename);
  const id = doc.id;

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
      extraction.bankMessage,
    ]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 4000);

    const payNeedsReview = paymentReceiptNeedsReview(
      extraction,
      threshold,
      combinedConfidence,
    );

    await prisma.paymentProof.create({
      data: {
        documentId: id,
        proofType: "PAYMENT_RECEIPT",
        note: note || null,
        paymentDate: parseIsoDate(extraction.paymentDate),
        amount: numToDecimalString(extraction.amountWithVat),
        currency: (extraction.currency?.trim() || "CZK").slice(0, 8),
        counterpartyName: extraction.supplierName,
        counterpartyICO: digitsOnly(extraction.supplierICO),
        variableSymbol: digitsOnly(extraction.variableSymbol),
        constantSymbol: digitsOnly(extraction.constantSymbol),
        specificSymbol: digitsOnly(extraction.specificSymbol),
        bankMessage: extraction.bankMessage,
        bankAccountNo: extraction.domesticAccountNumber?.trim() || null,
        bankCode: extraction.domesticBankCode?.replace(/\D/g, "") || null,
      },
    });

    await prisma.document.update({
      where: { id },
      data: {
        documentType: DocumentType.PAYMENT_RECEIPT,
        status: DocumentStatus.RECEIVED,
        classificationConfidence: classification.confidence,
        aiRawResponse: rawBundle.slice(0, 65000),
        needsManualReview: payNeedsReview,
      },
    });

    await writeAuditLog({
      entityType: "Document",
      entityId: id,
      action: "data_extracted",
      metadata: {
        type: "PAYMENT_RECEIPT",
        combinedConfidence,
        needsManualReview: payNeedsReview,
      },
    });

    await uploadPaymentReceiptIfConfigured(id);
    return;
  }

  const missingCritical = missingInvoiceCriticalFields(extraction);
  const missingLines = missingStructuredInvoiceLines(extraction);
  const czkNoVs = czkMissingVariableSymbol(extraction);
  const needsManualReview =
    combinedConfidence < threshold ||
    missingCritical ||
    missingLines ||
    czkNoVs;
  const nextStatus = needsManualReview
    ? DocumentStatus.NEEDS_REVIEW
    : DocumentStatus.PENDING_APPROVAL;

  const addr = extraction.supplierAddress;

  await prisma.invoice.create({
    data: {
      documentId: id,
      supplierName: extraction.supplierName,
      supplierICO: digitsOnly(extraction.supplierICO),
      supplierDIC: extraction.supplierDIC?.trim() || null,
      supplierStreet: addr?.street?.trim() || null,
      supplierCity: addr?.city?.trim() || null,
      supplierZip: addr?.zip?.trim() || null,
      supplierCountry: addr?.country?.trim() || null,
      invoiceNumber: extraction.invoiceNumber,
      amountWithVat: numToDecimalString(extraction.amountWithVat),
      amountWithoutVat: numToDecimalString(extraction.amountWithoutVat),
      vatAmount: numToDecimalString(extraction.vatAmount),
      vatRate: numToDecimalString(extraction.vatRate),
      currency: (extraction.currency?.trim() || "CZK").slice(0, 8),
      issueDate: parseIsoDate(extraction.issueDate),
      dueDate: parseIsoDate(extraction.dueDate),
      variableSymbol: digitsOnly(extraction.variableSymbol),
      constantSymbol: digitsOnly(extraction.constantSymbol),
      specificSymbol: digitsOnly(extraction.specificSymbol),
      bankAccount: extraction.bankAccount?.trim() || null,
      iban: extraction.iban?.replace(/\s/g, "").toUpperCase() || null,
      domesticAccount:
        extraction.domesticAccount?.trim() ||
        extraction.bankAccount?.trim() ||
        null,
      bic: extraction.bic?.trim() || null,
      documentKind: extraction.documentKind?.trim().slice(0, 64) || null,
      ...(extraction.invoiceLines !== null
        ? {
            invoiceLines: extraction.invoiceLines as Prisma.InputJsonValue,
          }
        : {}),
      missingStructuredLines: missingLines,
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
      missingStructuredLines: missingLines,
      czkMissingVariableSymbol: czkNoVs,
    },
  });
}
