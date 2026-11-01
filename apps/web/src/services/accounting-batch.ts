/**
 * Týdenní dávka pro účetní: schválené faktury a doklady k platbě od minulé dávky
 * → kopie do složek na sdíleném disku (Faktury / Doklady k platbě) + přehled CSV.
 */

import { DocumentStatus } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  copyDriveFileToFolder,
  ensureAccountingBatchFolders,
  shareFolderWithEmails,
  upsertTextFileInFolder,
} from "@/services/drive";

export function accountantEmails(): string[] {
  return (process.env.ACCOUNTANT_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+$/.test(e));
}

/** ISO týden (pro název složky „2026-11-04 týden 45“). */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function pragueDateIso(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(d);
}

function fileSafe(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

function extOf(filename: string): string {
  const m = filename.match(/\.([A-Za-z0-9]{2,4})$/);
  return m ? `.${m[1]!.toLowerCase()}` : ".pdf";
}

/** Dodavatel_Cislo_Datum.pdf */
export function accountingFileName(
  supplier: string | null,
  number: string | null,
  date: Date | null,
  originalFilename: string,
): string {
  const parts = [fileSafe(supplier) || "Dodavatel", fileSafe(number) || "bez-cisla", date ? pragueDateIso(date) : null]
    .filter(Boolean)
    .join("_");
  return `${parts}${extOf(originalFilename)}`;
}

function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Ochrana proti vzorcům v Excelu (=, +, -, @) — kromě čísel (záporná částka dobropisu).
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) {
    s = `'${s}`;
  }
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: unknown[][]): string {
  // BOM + středník → české Excely otevřou správně.
  return "\ufeff" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

async function firstBatch() {
  return prisma.accountingBatch.findFirst({ orderBy: { periodFrom: "asc" } });
}

export type BatchCandidates = {
  periodFrom: Date;
  periodTo: Date;
  firstBatch: boolean;
  invoices: Awaited<ReturnType<typeof loadInvoices>>;
  payments: Awaited<ReturnType<typeof loadPayments>>;
};

function loadInvoices(from: Date, to: Date) {
  return prisma.invoice.findMany({
    where: {
      accountingBatchId: null,
      driveFileId: { not: null },
      approvedAt: { gte: from, lte: to },
      document: { status: DocumentStatus.APPROVED },
    },
    orderBy: [{ supplierName: "asc" }, { issueDate: "asc" }],
    include: { document: { select: { originalFilename: true } } },
  });
}

function loadPayments(from: Date, to: Date) {
  return prisma.paymentProof.findMany({
    where: {
      accountingBatchId: null,
      driveFileId: { not: null },
      storedAt: { gte: from, lte: to },
      document: { status: DocumentStatus.STORED },
    },
    orderBy: [{ counterpartyName: "asc" }, { paymentDate: "asc" }],
    include: { document: { select: { originalFilename: true } } },
  });
}

/** Co by šlo do dávky. První dávka potřebuje `since` (dřívější doklady účetní už má). */
export async function collectBatchCandidates(since: Date | null, now = new Date()): Promise<BatchCandidates> {
  // Počátek = začátek úplně první dávky (ne konec minulé): doklad, jehož kopírování selhalo,
  // zůstane bez accountingBatchId a dostane se do další dávky.
  const first = await firstBatch();
  const from = first ? first.periodFrom : since;
  if (!from) {
    throw new Error(
      "První dávka: zadejte „since“ (od kdy brát schválené faktury a doklady) — starší účetní už má.",
    );
  }
  const [invoices, payments] = await Promise.all([loadInvoices(from, now), loadPayments(from, now)]);
  return { periodFrom: from, periodTo: now, firstBatch: !first, invoices, payments };
}

export function summarizeCandidates(c: BatchCandidates) {
  const sum = (rows: { amount: string | null; currency: string | null }[]) => {
    const by: Record<string, number> = {};
    for (const r of rows) {
      if (r.amount == null) continue;
      const cur = r.currency || "CZK";
      by[cur] = Math.round(((by[cur] ?? 0) + Number(r.amount)) * 100) / 100;
    }
    return by;
  };
  const inv = c.invoices.map((i) => ({
    id: i.id,
    supplierName: i.supplierName,
    invoiceNumber: i.invoiceNumber,
    amount: i.amountWithVat?.toString() ?? null,
    currency: i.currency,
    issueDate: i.issueDate?.toISOString().slice(0, 10) ?? null,
    dueDate: i.dueDate?.toISOString().slice(0, 10) ?? null,
    approvedAt: i.approvedAt?.toISOString() ?? null,
  }));
  const pay = c.payments.map((p) => ({
    id: p.id,
    counterpartyName: p.counterpartyName,
    documentNumber: p.documentNumber,
    amount: p.amount?.toString() ?? null,
    currency: p.currency,
    paymentDate: p.paymentDate?.toISOString().slice(0, 10) ?? null,
    storedAt: p.storedAt?.toISOString() ?? null,
  }));
  return {
    periodFrom: c.periodFrom.toISOString(),
    periodTo: c.periodTo.toISOString(),
    firstBatch: c.firstBatch,
    invoiceCount: inv.length,
    paymentCount: pay.length,
    invoiceTotals: sum(inv),
    paymentTotals: sum(pay),
    invoices: inv,
    payments: pay,
  };
}

export type CreatedBatch = {
  batchId: string;
  label: string;
  invoicesFolderUrl: string | null;
  paymentsFolderUrl: string | null;
  invoiceCount: number;
  paymentCount: number;
  sharedWith: string[];
  shareErrors: string[];
  copyErrors: string[];
  overviewError: string | null;
  missingItems: number;
  /** Agent smí poslat e-mail účetní jen když true (vše zkopírováno, přehled nahraný, nasdíleno). */
  readyToSend: boolean;
};

type InvoiceForBatch = {
  id: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  issueDate: Date | null;
  document: { originalFilename: string };
};
type PaymentForBatch = {
  id: string;
  counterpartyName: string | null;
  documentNumber: string | null;
  paymentDate: Date | null;
  document: { originalFilename: string };
};

/** Jména pro nové kopie: nekolidují s už použitými jmény v dávce (ta se nemění). */
function fileNamesFor<T extends { id: string }>(
  rows: T[],
  nameOf: (r: T) => string,
  taken: Iterable<string>,
): Map<string, string> {
  const used = new Set<string>([...taken].map((n) => n.toLowerCase()));
  const out = new Map<string, string>();
  for (const r of rows) {
    const base = nameOf(r);
    let n = base;
    let i = 2;
    while (used.has(n.toLowerCase())) {
      n = base.replace(/(\.[a-z0-9]+)$/i, `_${i}$1`);
      i += 1;
    }
    used.add(n.toLowerCase());
    out.set(r.id, n);
  }
  return out;
}

const invName = (i: InvoiceForBatch) =>
  accountingFileName(i.supplierName, i.invoiceNumber, i.issueDate, i.document.originalFilename);
const payName = (p: PaymentForBatch) =>
  accountingFileName(p.counterpartyName, p.documentNumber, p.paymentDate, p.document.originalFilename);

function batchItems(batchId: string) {
  return Promise.all([
    prisma.invoice.findMany({
      where: { accountingBatchId: batchId },
      include: { document: { select: { originalFilename: true } } },
    }),
    prisma.paymentProof.findMany({
      where: { accountingBatchId: batchId },
      include: { document: { select: { originalFilename: true } } },
    }),
  ]);
}

/**
 * Vytvoří dávku, nebo navá na neodeslanou dávku téhož dne (po chybě): zkopíruje jen dosud
 * nezařazené doklady, pak přehled + nasdílení z celé dávky. Opakované volání je bezpečné.
 */
export async function createAccountingBatch(input: {
  since: Date | null;
  userId: string | null;
  now?: Date;
}): Promise<CreatedBatch> {
  const now = input.now ?? new Date();
  if (accountantEmails().length === 0) {
    throw new Error("Chybí ACCOUNTANT_EMAILS — dávku by nikdo z účetní neotevřel.");
  }
  let c = await collectBatchCandidates(input.since, now);
  const baseLabel = `${pragueDateIso(now)} týden ${isoWeek(now)}`;
  // Navázat na neodeslanou dávku dne; po odeslání má další dávka téhož dne vlastní složku „(2)“.
  const sameDay = await prisma.accountingBatch.findMany({
    where: { label: { startsWith: baseLabel } },
    orderBy: { createdAt: "asc" },
  });
  let batch = sameDay.find((b) => b.sentAt == null) ?? null;
  const label = batch ? batch.label : sameDay.length === 0 ? baseLabel : `${baseLabel} (${sameDay.length + 1})`;

  if (!batch && c.invoices.length === 0 && c.payments.length === 0) {
    throw new Error("Od minulé dávky nejsou žádné schválené faktury ani doklady k platbě.");
  }
  const folders = await ensureAccountingBatchFolders(label, now);
  if (!batch) {
    const lastBatch = await prisma.accountingBatch.findFirst({ orderBy: { periodTo: "desc" } });
    // label je unikátní → souběžné vytvoření téže dávky spadne a druhý běh na ni naváže.
    batch = await prisma.accountingBatch.upsert({
      where: { label },
      update: {},
      create: {
        label,
        periodFrom: lastBatch?.periodTo ?? c.periodFrom,
        periodTo: c.periodTo,
        invoicesFolderId: folders.invoicesFolderId,
        invoicesFolderUrl: folders.invoicesFolderUrl,
        paymentsFolderId: folders.paymentsFolderId,
        paymentsFolderUrl: folders.paymentsFolderUrl,
        createdByUserId: input.userId,
      },
    });
  } else {
    batch = await prisma.accountingBatch.update({ where: { id: batch.id }, data: { periodTo: c.periodTo } });
  }

  // Zabrané, ale nepotvrzené kopie z přerušeného běhu uvolnit — znovu se vyberou a zkopírují níž.
  const released =
    (await prisma.invoice.updateMany({
      where: { accountingBatchId: batch.id, accountingFileName: null },
      data: { accountingBatchId: null },
    })).count +
    (await prisma.paymentProof.updateMany({
      where: { accountingBatchId: batch.id, accountingFileName: null },
      data: { accountingBatchId: null },
    })).count;
  if (released > 0) {
    c = await collectBatchCandidates(input.since, now);
  }

  const [doneInv, donePay] = await batchItems(batch.id);
  const invNames = fileNamesFor<InvoiceForBatch>(
    c.invoices,
    invName,
    doneInv.map((i) => i.accountingFileName ?? ""),
  );
  const payNames = fileNamesFor<PaymentForBatch>(
    c.payments,
    payName,
    donePay.map((p) => p.accountingFileName ?? ""),
  );

  const copyErrors: string[] = [];
  for (const inv of c.invoices) {
    const name = invNames.get(inv.id)!;
    // Nejdřív doklad atomicky „zabrat“ (souběžný běh ho už nezkopíruje), při chybě kopie uvolnit.
    const claimed = await prisma.invoice.updateMany({
      where: { id: inv.id, accountingBatchId: null },
      data: { accountingBatchId: batch.id, accountingFileName: null },
    });
    if (claimed.count === 0) continue;
    try {
      const copy = await copyDriveFileToFolder(inv.driveFileId!, folders.invoicesFolderId, name);
      // Jméno kopie = potvrzení, že kopie na Disku opravdu je.
      await prisma.invoice.update({ where: { id: inv.id }, data: { accountingFileName: copy.name } });
    } catch (e) {
      await prisma.invoice.update({ where: { id: inv.id }, data: { accountingBatchId: null, accountingFileName: null } });
      copyErrors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  for (const p of c.payments) {
    const name = payNames.get(p.id)!;
    const claimed = await prisma.paymentProof.updateMany({
      where: { id: p.id, accountingBatchId: null },
      data: { accountingBatchId: batch.id, accountingFileName: null },
    });
    if (claimed.count === 0) continue;
    try {
      const copy = await copyDriveFileToFolder(p.driveFileId!, folders.paymentsFolderId, name);
      await prisma.paymentProof.update({ where: { id: p.id }, data: { accountingFileName: copy.name } });
    } catch (e) {
      await prisma.paymentProof.update({ where: { id: p.id }, data: { accountingBatchId: null, accountingFileName: null } });
      copyErrors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const fin = await finalizeAccountingBatch(batch.id, input.userId);
  await writeAuditLog({
    entityType: "AccountingBatch",
    entityId: batch.id,
    userId: input.userId,
    action: "accounting_batch_created",
    metadata: {
      label,
      invoiceCount: fin.invoiceCount,
      paymentCount: fin.paymentCount,
      copyErrors: copyErrors.slice(0, 20),
      shareErrors: fin.shareErrors,
      overviewError: fin.overviewError,
    },
  });
  return { ...fin, copyErrors, readyToSend: fin.readyToSend && copyErrors.length === 0 };
}

/** Přehledy CSV z celé dávky (přepíše) + nasdílení účetní. Opakovatelné. */
export async function finalizeAccountingBatch(batchId: string, userId: string | null) {
  void userId;
  const batch = await prisma.accountingBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    throw new Error("Dávka nenalezena.");
  }
  const folders = await ensureAccountingBatchFolders(batch.label, batch.createdAt);
  const [invs, pays] = await batchItems(batchId);

  let overviewError: string | null = null;
  try {
    if (invs.length > 0) {
      await upsertTextFileInFolder(
        folders.invoicesFolderId,
        "prehled-faktury.csv",
        toCsv(
          ["Soubor", "Dodavatel", "IČO", "Číslo faktury", "VS", "Vystaveno", "Splatnost", "Bez DPH", "S DPH", "Měna"],
          invs
            .filter((i) => i.accountingFileName)
            .map((i) => [
              i.accountingFileName ?? invName(i),
              i.supplierName,
              i.supplierICO,
              i.invoiceNumber,
              i.variableSymbol,
              i.issueDate?.toISOString().slice(0, 10),
              i.dueDate?.toISOString().slice(0, 10),
              i.amountWithoutVat?.toString(),
              i.amountWithVat?.toString(),
              i.currency,
            ])
            .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        ),
        "text/csv",
      );
    }
    if (pays.length > 0) {
      await upsertTextFileInFolder(
        folders.paymentsFolderId,
        "prehled-platby.csv",
        toCsv(
          ["Soubor", "Obchodník", "Číslo dokladu", "Datum platby", "Částka", "Měna"],
          pays
            .filter((p) => p.accountingFileName)
            .map((p) => [
              p.accountingFileName ?? payName(p),
              p.counterpartyName,
              p.documentNumber,
              p.paymentDate?.toISOString().slice(0, 10),
              p.amount?.toString(),
              p.currency,
            ])
            .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        ),
        "text/csv",
      );
    }
  } catch (e) {
    overviewError = e instanceof Error ? e.message : String(e);
  }

  const share = await shareFolderWithEmails(folders.batchFolderId, accountantEmails());

  // Úplnost: nezůstal do konce období dávky nějaký schválený doklad nezařazený (např. selhala kopie)?
  // -1 = kontrolu se nepodařilo provést → dávka není připravená.
  let missingItems = -1;
  try {
    const rest = await collectBatchCandidates(batch.periodFrom, batch.periodTo);
    const unconfirmed =
      invs.filter((i) => !i.accountingFileName).length + pays.filter((p) => !p.accountingFileName).length;
    missingItems = rest.invoices.length + rest.payments.length + unconfirmed;
  } catch {
    missingItems = -1;
  }

  await prisma.accountingBatch.update({
    where: { id: batchId },
    data: {
      invoiceCount: invs.length,
      paymentCount: pays.length,
      sharedWith: share.shared.join(", ") || null,
      shareError: [...share.errors, ...(overviewError ? [`přehled: ${overviewError}`] : [])].join("\n") || null,
    },
  });
  return {
    batchId,
    label: batch.label,
    invoicesFolderUrl: folders.invoicesFolderUrl,
    paymentsFolderUrl: folders.paymentsFolderUrl,
    invoiceCount: invs.length,
    paymentCount: pays.length,
    sharedWith: share.shared,
    shareErrors: share.errors,
    overviewError,
    /** Doklady z období dávky, které v ní chybí — opakujte POST /api/agent/accounting-batch (doplní je). */
    missingItems,
    readyToSend:
      share.errors.length === 0 && overviewError === null && share.shared.length > 0 && missingItems === 0,
  };
}

export async function markAccountingBatchSent(batchId: string, sentTo: string, userId: string | null) {
  const current = await prisma.accountingBatch.findUnique({ where: { id: batchId } });
  if (!current) {
    throw new Error("Dávka nenalezena.");
  }
  // Před označením vždy znovu: přehled CSV z aktuálního obsahu, sdílení, úplnost.
  const fin = await finalizeAccountingBatch(batchId, userId);
  if (!fin.readyToSend) {
    const problems = [
      ...fin.shareErrors.map((e) => `sdílení: ${e}`),
      ...(fin.overviewError ? [`přehled: ${fin.overviewError}`] : []),
      ...(fin.sharedWith.length === 0 ? ["složka není nasdílená účetní"] : []),
      ...(fin.missingItems !== 0 ? [`chybí doklady: ${fin.missingItems === -1 ? "nelze ověřit" : fin.missingItems}`] : []),
    ];
    throw new Error(`Dávka není připravená: ${problems.join("; ")}. Zopakujte POST /api/agent/accounting-batch.`);
  }
  const batch = await prisma.accountingBatch.update({
    where: { id: batchId },
    data: { sentAt: new Date(), sentTo: sentTo.slice(0, 500) },
  });
  await writeAuditLog({
    entityType: "AccountingBatch",
    entityId: batchId,
    userId,
    action: "accounting_batch_sent",
    metadata: { sentTo },
  });
  return batch;
}
