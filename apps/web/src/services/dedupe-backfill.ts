/**
 * Jednorázový úklid: dopočítá klíče a stopy u existujících dokladů, najde duplicity a vydané faktury VB.
 * dryRun = jen přehled; apply = označí duplicity (DUPLICATE) a smaže neschválené vydané faktury VB z evidence.
 */

import { DocumentStatus, DocumentType } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import {
  amountFromPaymentNote,
  buildDedupKey,
  classificationHintFromFilename,
  documentNumberFromPaymentNote,
  isOwnCompanySupplier,
  OWN_ISSUED_MARKER,
} from "@/lib/document-dedupe";
import { prisma } from "@/lib/prisma";
import { markDocumentDuplicate, recordFingerprint } from "@/services/document-dedupe-store";

type Row = {
  documentId: string;
  type: "INVOICE" | "PAYMENT_RECEIPT";
  status: DocumentStatus;
  createdAt: Date;
  contentHash: string | null;
  supplierName: string | null;
  number: string | null;
  amount: number | null;
  currency: string | null;
  filename: string;
  sender: string | null;
  key: string | null;
  own: boolean;
};

function rank(r: Row): number {
  // Kdo zůstane: uložená účtenka > schválená faktura > ostatní; soubor „Receipt…“ před „Invoice…“; pak nejstarší.
  const receiptFile = classificationHintFromFilename(r.filename) ? 0 : 0.5;
  if (r.type === "PAYMENT_RECEIPT" && r.status === "STORED") return 0 + receiptFile;
  if (r.type === "PAYMENT_RECEIPT") return 1 + receiptFile;
  if (r.status === "APPROVED") return 2;
  return 3 + receiptFile;
}

export async function runDedupeBackfill(input: { apply: boolean; userId: string | null }) {
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: { document: { status: { not: DocumentStatus.DUPLICATE } } },
      include: {
        document: {
          select: { id: true, status: true, createdAt: true, contentHash: true, originalFilename: true, email: { select: { senderEmail: true } } },
        },
      },
    }),
    prisma.paymentProof.findMany({
      where: { document: { status: { not: DocumentStatus.DUPLICATE } } },
      include: {
        document: {
          select: { id: true, status: true, createdAt: true, contentHash: true, originalFilename: true, email: { select: { senderEmail: true } } },
        },
      },
    }),
  ]);

  const rows: Row[] = [];
  for (const i of invoices) {
    const amount = i.amountWithVat != null ? Number(i.amountWithVat) : null;
    rows.push({
      documentId: i.documentId,
      type: "INVOICE",
      status: i.document.status,
      createdAt: i.document.createdAt,
      contentHash: i.document.contentHash,
      supplierName: i.supplierName,
      number: i.invoiceNumber,
      amount,
      currency: i.currency,
      filename: i.document.originalFilename,
      sender: i.document.email.senderEmail,
      own: isOwnCompanySupplier(i.supplierICO, i.supplierDIC),
      key: buildDedupKey({
        supplierName: i.supplierName,
        supplierICO: i.supplierICO,
        documentNumber: i.invoiceNumber,
        amount,
        currency: i.currency,
        documentKind: i.documentKind,
        originalFilename: i.document.originalFilename,
      }),
    });
  }
  for (const p of payments) {
    const supplier = p.counterpartyName ?? (p.note ?? "").split(/ · | \| /)[0] ?? null;
    const number = p.documentNumber ?? documentNumberFromPaymentNote(p.note, p.document.originalFilename);
    const fromNote = amountFromPaymentNote(p.note);
    const amount = p.amount != null ? Number(p.amount) : fromNote?.amount ?? null;
    const currency = p.currency ?? fromNote?.currency ?? null;
    rows.push({
      documentId: p.documentId,
      type: "PAYMENT_RECEIPT",
      status: p.document.status,
      createdAt: p.document.createdAt,
      contentHash: p.document.contentHash,
      supplierName: supplier,
      number,
      amount,
      currency,
      filename: p.document.originalFilename,
      sender: p.document.email.senderEmail,
      own: isOwnCompanySupplier(p.counterpartyICO, null),
      key: buildDedupKey({
        supplierName: supplier,
        supplierICO: p.counterpartyICO,
        documentNumber: number,
        amount,
        currency,
        originalFilename: p.document.originalFilename,
      }),
    });
  }

  const ownIssued = rows.filter((r) => r.own);
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.own || !r.key) continue;
    groups.set(r.key, [...(groups.get(r.key) ?? []), r]);
  }

  const duplicateGroups: Array<{ key: string; keep: Row; duplicates: Row[]; skippedApproved: Row[] }> = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => rank(a) - rank(b) || a.createdAt.getTime() - b.createdAt.getTime());
    const keep = sorted[0]!;
    const rest = sorted.slice(1);
    // Fakturu skrýt za účtenku jen když je účtenka uložená (STORED) — jinak by účetní nedostala nic.
    const receiptNotStored = keep.type === "PAYMENT_RECEIPT" && keep.status !== "STORED";
    const unsafe = (r: Row) => r.status === "APPROVED" || (receiptNotStored && r.type === "INVOICE");
    duplicateGroups.push({
      key,
      keep,
      duplicates: rest.filter((r) => !unsafe(r)),
      // Schválené faktury (už odešly) a faktury bez uložené účtenky — neměníme, jen hlásíme.
      skippedApproved: rest.filter(unsafe),
    });
  }

  const report = {
    scanned: rows.length,
    duplicateGroups: duplicateGroups.length,
    duplicatesToMark: duplicateGroups.reduce((n, g) => n + g.duplicates.length, 0),
    ownIssued: ownIssued.map((r) => ({
      documentId: r.documentId,
      type: r.type,
      status: r.status,
      number: r.number,
      filename: r.filename,
      action:
        r.type === "INVOICE" && r.status !== "APPROVED"
          ? "skrýt (vydaná faktura VB)"
          : "ponechat – rozhodne člověk (schválená faktura nebo uložená platba)",
    })),
    groups: duplicateGroups.map((g) => ({
      key: g.key,
      keep: { documentId: g.keep.documentId, type: g.keep.type, status: g.keep.status, filename: g.keep.filename, sender: g.keep.sender },
      duplicates: g.duplicates.map((d) => ({ documentId: d.documentId, type: d.type, status: d.status, filename: d.filename, sender: d.sender })),
      skippedApproved: g.skippedApproved.map((d) => ({ documentId: d.documentId, filename: d.filename })),
    })),
    applied: false,
  };

  if (!input.apply) {
    return report;
  }

  // 1) klíče + stopy u všech živých dokladů
  const dupIds = new Set(duplicateGroups.flatMap((g) => g.duplicates.map((d) => d.documentId)));
  for (const r of rows) {
    if (r.own) continue;
    await prisma.document.update({ where: { id: r.documentId }, data: { dedupKey: r.key } });
    await recordFingerprint({
      contentHash: r.contentHash,
      dedupKey: r.key,
      documentType: r.type === "INVOICE" ? DocumentType.INVOICE : DocumentType.PAYMENT_RECEIPT,
      outcome: dupIds.has(r.documentId) ? "duplicate" : "kept",
      documentId: r.documentId,
      supplierName: r.supplierName,
      documentNumber: r.number,
    });
  }
  // 2) duplicity
  for (const g of duplicateGroups) {
    for (const d of g.duplicates) {
      await markDocumentDuplicate({
        documentId: d.documentId,
        keepDocumentId: g.keep.documentId,
        reason: "backfill",
        userId: input.userId,
      });
    }
  }
  // 3) vydané faktury VB (neschválené) pryč z evidence, stopa zůstane
  // Automaticky mažeme jen neschválené FAKTURY s IČO/DIČ vlastní firmy; platby a schválené jen hlásíme.
  const ownToDelete = ownIssued.filter((r) => r.type === "INVOICE" && r.status !== "APPROVED");
  for (const r of ownToDelete) {
    await prisma.document.update({
      where: { id: r.documentId },
      data: { status: DocumentStatus.DUPLICATE, duplicateOfDocumentId: OWN_ISSUED_MARKER, needsManualReview: false, dedupKey: null },
    });
    await recordFingerprint({
      contentHash: r.contentHash,
      dedupKey: null,
      documentType: DocumentType.INVOICE,
      outcome: "own_issued",
      documentId: r.documentId,
      supplierName: r.supplierName,
      documentNumber: r.number,
    });
    await writeAuditLog({
      entityType: "Document",
      entityId: r.documentId,
      userId: input.userId,
      action: "own_issued_invoice_dropped",
      metadata: { originalFilename: r.filename, invoiceNumber: r.number, via: "backfill" },
    });
  }
  await writeAuditLog({
    entityType: "System",
    entityId: "dedupe_backfill",
    userId: input.userId,
    action: "dedupe_backfill_applied",
    metadata: { duplicatesMarked: dupIds.size, ownIssuedRemoved: ownToDelete.length },
  });
  return { ...report, applied: true };
}
