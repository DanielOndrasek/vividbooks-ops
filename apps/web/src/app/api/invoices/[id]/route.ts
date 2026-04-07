import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRoles, requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  supplierName: z.string().nullable().optional(),
  amountWithoutVat: z.string().nullable().optional(),
  amountWithVat: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  currency: z.string().max(8).nullable().optional(),
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
    amountWithoutVat: invoice.amountWithoutVat?.toString() ?? null,
    amountWithVat: invoice.amountWithVat?.toString() ?? null,
    dueDate: invoice.dueDate?.toISOString() ?? null,
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency,
    issueDate: invoice.issueDate?.toISOString() ?? null,
    supplierICO: invoice.supplierICO,
    extractionConfidence: invoice.extractionConfidence,
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
  let dueDate: Date | null | undefined;
  if (d.dueDate === undefined) {
    dueDate = undefined;
  } else if (d.dueDate === null || d.dueDate === "") {
    dueDate = null;
  } else {
    const parsedDate = new Date(d.dueDate);
    dueDate = Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  const updated = await prisma.invoice.update({
    where: { id },
    data: {
      supplierName: d.supplierName ?? undefined,
      amountWithoutVat:
        d.amountWithoutVat === undefined
          ? undefined
          : d.amountWithoutVat,
      amountWithVat:
        d.amountWithVat === undefined ? undefined : d.amountWithVat,
      dueDate: dueDate === undefined ? undefined : dueDate,
      invoiceNumber: d.invoiceNumber ?? undefined,
      currency: d.currency ?? undefined,
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
