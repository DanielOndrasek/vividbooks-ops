import { NextResponse } from "next/server";

import { requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { response } = await requireSession();
  if (response) {
    return response;
  }

  const rows = await prisma.document.findMany({
    where: {
      OR: [{ status: "NEEDS_REVIEW" }, { documentType: "UNKNOWN" }],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      email: true,
      invoice: true,
      paymentProof: true,
    },
  });

  return NextResponse.json({
    items: rows.map((d) => ({
      id: d.id,
      documentType: d.documentType,
      status: d.status,
      originalFilename: d.originalFilename,
      needsManualReview: d.needsManualReview,
      parseError: d.parseError,
      classificationConfidence: d.classificationConfidence,
      emailSubject: d.email.subject,
      emailSender: d.email.sender,
      receivedAt: d.email.receivedAt.toISOString(),
      invoiceId: d.invoice?.id ?? null,
    })),
  });
}
