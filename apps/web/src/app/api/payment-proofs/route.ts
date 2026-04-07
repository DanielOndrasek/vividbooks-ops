import { NextResponse } from "next/server";

import { requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { response } = await requireSession();
  if (response) {
    return response;
  }

  const rows = await prisma.paymentProof.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      document: { include: { email: true } },
    },
  });

  return NextResponse.json({
    items: rows.map((p) => ({
      id: p.id,
      proofType: p.proofType,
      note: p.note,
      driveUrl: p.driveUrl,
      driveFileId: p.driveFileId,
      storedAt: p.storedAt?.toISOString() ?? null,
      documentId: p.documentId,
      originalFilename: p.document.originalFilename,
      documentStatus: p.document.status,
      emailSubject: p.document.email.subject,
      emailSender: p.document.email.sender,
      receivedAt: p.document.email.receivedAt.toISOString(),
      processedAt: p.document.email.processedAt?.toISOString() ?? null,
    })),
  });
}
