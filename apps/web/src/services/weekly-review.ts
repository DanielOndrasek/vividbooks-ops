/**
 * Podklad pro středeční procházení s agentem: co čeká na schválení, co se ověřit, co půjde účetní.
 */

import { DocumentStatus } from "@prisma/client";

import { normalizeSupplierName, OWN_ISSUED_MARKER } from "@/lib/document-dedupe";
import { prisma } from "@/lib/prisma";
import { collectBatchCandidates, summarizeCandidates } from "@/services/accounting-batch";

function appUrl(): string {
  return (process.env.APP_PUBLIC_URL?.trim() || "https://vividbooks-ops.vercel.app").replace(/\/$/, "");
}

const DAY = 86_400_000;

export async function buildWeeklyReview(since: Date | null) {
  const now = new Date();
  const lastBatch = await prisma.accountingBatch.findFirst({ orderBy: { periodTo: "desc" } });
  const reviewFrom = lastBatch?.periodTo ?? since ?? new Date(now.getTime() - 7 * DAY);

  const pending = await prisma.invoice.findMany({
    where: { document: { status: { in: [DocumentStatus.PENDING_APPROVAL, DocumentStatus.NEEDS_REVIEW] } } },
    orderBy: { document: { email: { receivedAt: "asc" } } },
    include: {
      document: {
        select: {
          id: true,
          status: true,
          needsManualReview: true,
          originalFilename: true,
          email: { select: { senderEmail: true, subject: true, receivedAt: true } },
        },
      },
    },
  });

  // Historie dodavatelů pro kontrolu „nový dodavatel“ / „neobvyklá částka“.
  const history = await prisma.invoice.findMany({
    where: { document: { status: DocumentStatus.APPROVED } },
    select: { supplierName: true, amountWithVat: true, currency: true },
  });
  const knownSuppliers = new Set(
    (
      await prisma.documentFingerprint.findMany({
        where: { outcome: "kept" },
        select: { supplierName: true },
      })
    )
      .map((f) => normalizeSupplierName(f.supplierName))
      .concat(history.map((h) => normalizeSupplierName(h.supplierName)))
      .filter(Boolean),
  );
  const amountsBySupplier = new Map<string, number[]>();
  for (const h of history) {
    const k = `${normalizeSupplierName(h.supplierName)}|${h.currency}`;
    if (h.amountWithVat == null) continue;
    amountsBySupplier.set(k, [...(amountsBySupplier.get(k) ?? []), Number(h.amountWithVat)]);
  }

  const pendingOut = pending.map((inv) => {
    const flags: string[] = [];
    const sup = normalizeSupplierName(inv.supplierName);
    if (inv.document.needsManualReview || inv.document.status === "NEEDS_REVIEW") flags.push("ke_kontrole");
    if (!inv.supplierICO && !inv.supplierDIC) flags.push("chybi_ico_dic");
    if (!inv.dueDate) flags.push("chybi_splatnost");
    if (!inv.invoiceNumber) flags.push("chybi_cislo");
    if ((inv.currency || "CZK") === "CZK" && !inv.variableSymbol) flags.push("chybi_vs");
    if (inv.dueDate) {
      const days = Math.floor((inv.dueDate.getTime() - now.getTime()) / DAY);
      if (days < 0) flags.push(`po_splatnosti_${-days}d`);
      else if (days <= 7) flags.push(`splatnost_do_${days}d`);
    }
    if (sup && !knownSuppliers.has(sup)) flags.push("novy_dodavatel");
    const prev = amountsBySupplier.get(`${sup}|${inv.currency}`) ?? [];
    if (prev.length >= 2 && inv.amountWithVat != null) {
      const sorted = [...prev].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      const amt = Number(inv.amountWithVat);
      if (median > 0 && (amt > median * 1.5 || amt < median * 0.5)) {
        flags.push(`neobvykla_castka_median_${median}`);
      }
    }
    if ((inv.extractionConfidence ?? 1) < 0.7) flags.push("nizka_jistota_ai");
    return {
      invoiceId: inv.id,
      documentId: inv.documentId,
      status: inv.document.status,
      supplierName: inv.supplierName,
      supplierICO: inv.supplierICO,
      invoiceNumber: inv.invoiceNumber,
      amountWithVat: inv.amountWithVat?.toString() ?? null,
      amountWithoutVat: inv.amountWithoutVat?.toString() ?? null,
      currency: inv.currency,
      issueDate: inv.issueDate?.toISOString().slice(0, 10) ?? null,
      dueDate: inv.dueDate?.toISOString().slice(0, 10) ?? null,
      variableSymbol: inv.variableSymbol,
      account: inv.iban || inv.domesticAccount || inv.bankAccount,
      senderEmail: inv.document.email.senderEmail,
      emailSubject: inv.document.email.subject,
      receivedAt: inv.document.email.receivedAt.toISOString(),
      originalFilename: inv.document.originalFilename,
      detailUrl: `${appUrl()}/invoices/${inv.id}`,
      fileUrl: `${appUrl()}/api/documents/${inv.documentId}/file`,
      flags,
    };
  });

  const [uploadFailed, unknownDocs, duplicates, ownDropped] = await Promise.all([
    prisma.invoice.count({ where: { document: { status: DocumentStatus.UPLOAD_FAILED } } }),
    prisma.document.count({ where: { documentType: "UNKNOWN", status: DocumentStatus.NEEDS_REVIEW } }),
    prisma.document.findMany({
      where: {
        status: DocumentStatus.DUPLICATE,
        updatedAt: { gte: reviewFrom },
        OR: [{ duplicateOfDocumentId: null }, { duplicateOfDocumentId: { not: OWN_ISSUED_MARKER } }],
      },
      select: {
        id: true,
        originalFilename: true,
        documentType: true,
        duplicateOfDocumentId: true,
        email: { select: { senderEmail: true } },
      },
      take: 200,
    }),
    prisma.auditLog.count({ where: { action: "own_issued_invoice_dropped", createdAt: { gte: reviewFrom } } }),
  ]);

  let batchPreview: ReturnType<typeof summarizeCandidates> | null = null;
  let batchPreviewError: string | null = null;
  try {
    batchPreview = summarizeCandidates(await collectBatchCandidates(since, now));
  } catch (e) {
    batchPreviewError = e instanceof Error ? e.message : String(e);
  }

  // Stav načítání pošty: agent před schvalováním volá POST /api/agent/sync, tady je kontrola,
  // jestli v aplikaci něco nečeká (bez dotazu na Gmail — ten dělá sync).
  const [aiQueue, lastMailFetch] = await Promise.all([
    prisma.document.count({ where: { status: DocumentStatus.NEW, documentType: "UNCLASSIFIED" } }),
    prisma.processingJob.findFirst({
      where: { type: "email_fetch", status: "completed" },
      orderBy: { createdAt: "desc" },
      select: { completedAt: true, metadata: true },
    }),
  ]);
  const lastMailMeta = (lastMailFetch?.metadata ?? {}) as { remainingMail?: number };

  return {
    generatedAt: now.toISOString(),
    inbox: {
      lastMailFetchAt: lastMailFetch?.completedAt?.toISOString() ?? null,
      /** Nezpracovaná pošta po posledním stažení (null = starší běh, který to neměřil). */
      remainingMailAfterLastFetch:
        typeof lastMailMeta.remainingMail === "number" ? lastMailMeta.remainingMail : null,
      /** Stažené doklady, které ještě nezpracovala AI (v pendingInvoices zatím nejsou). */
      aiQueue,
    },
    appUrl: appUrl(),
    lastBatch: lastBatch
      ? {
          id: lastBatch.id,
          label: lastBatch.label,
          periodTo: lastBatch.periodTo.toISOString(),
          sentAt: lastBatch.sentAt?.toISOString() ?? null,
          invoicesFolderUrl: lastBatch.invoicesFolderUrl,
          paymentsFolderUrl: lastBatch.paymentsFolderUrl,
        }
      : null,
    pendingInvoices: pendingOut,
    attention: {
      uploadFailedInvoices: uploadFailed,
      unknownDocumentsToReview: unknownDocs,
      duplicatesSinceLastBatch: duplicates.length,
      ownIssuedDroppedSinceLastBatch: ownDropped,
    },
    duplicatesSinceLastBatch: duplicates.map((d) => ({
      documentId: d.id,
      originalFilename: d.originalFilename,
      type: d.documentType,
      senderEmail: d.email.senderEmail,
      duplicateOfDocumentId: d.duplicateOfDocumentId,
    })),
    batchPreview,
    batchPreviewError,
  };
}
