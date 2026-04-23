import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRoles, requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  supplierName: z.string().nullable().optional(),
  supplierICO: z.string().nullable().optional(),
  supplierDIC: z.string().nullable().optional(),
  supplierStreet: z.string().nullable().optional(),
  supplierCity: z.string().nullable().optional(),
  supplierZip: z.string().nullable().optional(),
  supplierCountry: z.string().nullable().optional(),
  amountWithoutVat: z.string().nullable().optional(),
  amountWithVat: z.string().nullable().optional(),
  vatAmount: z.string().nullable().optional(),
  vatRate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  issueDate: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  currency: z.string().max(8).nullable().optional(),
  variableSymbol: z.string().nullable().optional(),
  constantSymbol: z.string().nullable().optional(),
  specificSymbol: z.string().nullable().optional(),
  bankAccount: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  domesticAccount: z.string().nullable().optional(),
  bic: z.string().nullable().optional(),
  documentKind: z.string().max(64).nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  void session;

  const { id } = await ctx.params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      document: { include: { email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Nenalezeno." }, { status: 404 });
  }

  return NextResponse.json({
    id: invoice.id,
    documentId: invoice.documentId,
    supplierName: invoice.supplierName,
    supplierICO: invoice.supplierICO,
    supplierDIC: invoice.supplierDIC,
    supplierStreet: invoice.supplierStreet,
    supplierCity: invoice.supplierCity,
    supplierZip: invoice.supplierZip,
    supplierCountry: invoice.supplierCountry,
    amountWithoutVat: invoice.amountWithoutVat?.toString() ?? null,
    amountWithVat: invoice.amountWithVat?.toString() ?? null,
    vatAmount: invoice.vatAmount?.toString() ?? null,
    vatRate: invoice.vatRate?.toString() ?? null,
    dueDate: invoice.dueDate?.toISOString() ?? null,
    issueDate: invoice.issueDate?.toISOString() ?? null,
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency,
    variableSymbol: invoice.variableSymbol,
    constantSymbol: invoice.constantSymbol,
    specificSymbol: invoice.specificSymbol,
    bankAccount: invoice.bankAccount,
    iban: invoice.iban,
    domesticAccount: invoice.domesticAccount,
    bic: invoice.bic,
    documentKind: invoice.documentKind,
    invoiceLines: invoice.invoiceLines,
    missingStructuredLines: invoice.missingStructuredLines,
    extractionConfidence: invoice.extractionConfidence,
    pohodaExportStatus: invoice.pohodaExportStatus,
    pohodaExportedAt: invoice.pohodaExportedAt?.toISOString() ?? null,
    pohodaExternalId: invoice.pohodaExternalId,
    pohodaExportLastError: invoice.pohodaExportLastError,
    approvedAt: invoice.approvedAt?.toISOString() ?? null,
    approvedBy: invoice.approvedBy,
    rejectionReason: invoice.rejectionReason,
    driveUrl: invoice.driveUrl,
    driveFileId: invoice.driveFileId,
    document: {
      status: invoice.document.status,
      documentType: invoice.document.documentType,
      originalFilename: invoice.document.originalFilename,
      mimeType: invoice.document.mimeType,
      needsManualReview: invoice.document.needsManualReview,
      classificationConfidence: invoice.document.classificationConfidence,
      parseError: invoice.document.parseError,
      localFilePath: Boolean(invoice.document.localFilePath),
    },
    email: {
      subject: invoice.document.email.subject,
      sender: invoice.document.email.sender,
      receivedAt: invoice.document.email.receivedAt.toISOString(),
    },
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  const forbidden = requireRoles(session!, ["ADMIN", "APPROVER"]);
  if (forbidden) {
    return forbidden;
  }

  const { id } = await ctx.params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { document: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Nenalezeno." }, { status: 404 });
  }

  const allowedStatuses = ["PENDING_APPROVAL", "NEEDS_REVIEW"];
  if (!allowedStatuses.includes(invoice.document.status)) {
    return NextResponse.json(
      { error: "V tomto stavu nelze metadata měnit." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatné JSON tělo." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validace selhala.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;

  function parseOptDate(raw: string | null | undefined): Date | null | undefined {
    if (raw === undefined) {
      return undefined;
    }
    if (raw === null || raw === "") {
      return null;
    }
    const parsedDate = new Date(raw);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  const dueDate = parseOptDate(d.dueDate);
  const issueDate = parseOptDate(d.issueDate);

  const updated = await prisma.invoice.update({
    where: { id },
    data: {
      supplierName: d.supplierName ?? undefined,
      supplierICO:
        d.supplierICO === undefined
          ? undefined
          : d.supplierICO?.replace(/\D/g, "") || null,
      supplierDIC: d.supplierDIC ?? undefined,
      supplierStreet: d.supplierStreet ?? undefined,
      supplierCity: d.supplierCity ?? undefined,
      supplierZip: d.supplierZip ?? undefined,
      supplierCountry: d.supplierCountry ?? undefined,
      amountWithoutVat:
        d.amountWithoutVat === undefined ? undefined : d.amountWithoutVat,
      amountWithVat:
        d.amountWithVat === undefined ? undefined : d.amountWithVat,
      vatAmount: d.vatAmount === undefined ? undefined : d.vatAmount,
      vatRate: d.vatRate === undefined ? undefined : d.vatRate,
      dueDate: dueDate === undefined ? undefined : dueDate,
      issueDate: issueDate === undefined ? undefined : issueDate,
      invoiceNumber: d.invoiceNumber ?? undefined,
      currency: d.currency ?? undefined,
      variableSymbol:
        d.variableSymbol === undefined
          ? undefined
          : d.variableSymbol?.replace(/\D/g, "") || null,
      constantSymbol:
        d.constantSymbol === undefined
          ? undefined
          : d.constantSymbol?.replace(/\D/g, "") || null,
      specificSymbol:
        d.specificSymbol === undefined
          ? undefined
          : d.specificSymbol?.replace(/\D/g, "") || null,
      bankAccount: d.bankAccount ?? undefined,
      iban:
        d.iban === undefined
          ? undefined
          : d.iban?.replace(/\s/g, "").toUpperCase() || null,
      domesticAccount: d.domesticAccount ?? undefined,
      bic: d.bic ?? undefined,
      documentKind: d.documentKind ?? undefined,
    },
    include: { document: { include: { email: true } } },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Invoice",
      entityId: id,
      userId: session!.user!.id,
      action: "metadata_updated",
      metadata: { fields: Object.keys(d).filter((k) => d[k as keyof typeof d] !== undefined) },
    },
  });

  return NextResponse.json({ ok: true, id: updated.id });
}
