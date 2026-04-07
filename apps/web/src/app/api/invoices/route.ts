import { type DocumentStatus, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const INVOICE_STATUSES: DocumentStatus[] = [
  "NEW",
  "PARSED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "UPLOAD_FAILED",
  "NEEDS_REVIEW",
];

export async function GET(req: NextRequest) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  void session;

  const { searchParams } = req.nextUrl;
  const statusParam = searchParams.get("status");
  const q = searchParams.get("q")?.trim();
  const sort = searchParams.get("sort") || "receivedAt";

  const where: Prisma.InvoiceWhereInput = {
    document: {
      documentType: "INVOICE",
      ...(statusParam &&
      INVOICE_STATUSES.includes(statusParam as DocumentStatus)
        ? { status: statusParam as DocumentStatus }
        : {}),
    },
  };

  if (q) {
    where.OR = [
      { supplierName: { contains: q, mode: "insensitive" } },
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      {
        document: {
          originalFilename: { contains: q, mode: "insensitive" },
        },
      },
    ];
  }

  const orderBy: Prisma.InvoiceOrderByWithRelationInput[] =
    sort === "dueDate"
      ? [{ dueDate: "asc" }]
      : [{ document: { email: { receivedAt: "desc" } } }];

  const rows = await prisma.invoice.findMany({
    where,
    orderBy,
    take: 200,
    include: {
      document: { include: { email: true } },
    },
  });

  return NextResponse.json({
    items: rows.map((inv) => ({
      id: inv.id,
      supplierName: inv.supplierName,
      amountWithoutVat: inv.amountWithoutVat?.toString() ?? null,
      amountWithVat: inv.amountWithVat?.toString() ?? null,
      dueDate: inv.dueDate?.toISOString() ?? null,
      invoiceNumber: inv.invoiceNumber,
      currency: inv.currency,
      extractionConfidence: inv.extractionConfidence,
      status: inv.document.status,
      originalFilename: inv.document.originalFilename,
      receivedAt: inv.document.email.receivedAt.toISOString(),
      needsManualReview: inv.document.needsManualReview,
      documentId: inv.documentId,
      driveUrl: inv.driveUrl,
    })),
  });
}
