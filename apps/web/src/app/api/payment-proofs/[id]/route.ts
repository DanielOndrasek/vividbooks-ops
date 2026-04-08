import { DocumentStatus, DocumentType } from "@prisma/client";
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireRoles, requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
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

  const { id: proofId } = await ctx.params;

  const proof = await prisma.paymentProof.findUnique({
    where: { id: proofId },
    include: {
      document: { include: { invoice: { select: { id: true } } } },
    },
  });

  if (!proof) {
    return NextResponse.json({ error: "Záznam nenalezen." }, { status: 404 });
  }

  if (proof.document.invoice) {
    return NextResponse.json(
      {
        error:
          "U tohoto dokladu existuje faktura — nelze smazat jen evidenci platby. Použijte smazání celého dokladu nebo zamítnutí faktury.",
      },
      { status: 400 },
    );
  }

  const note = "Evidence platby odstraněna.";

  await prisma.$transaction([
    prisma.paymentProof.delete({ where: { id: proofId } }),
    prisma.document.update({
      where: { id: proof.documentId },
      data: {
        documentType: DocumentType.UNKNOWN,
        status: DocumentStatus.REJECTED,
        needsManualReview: false,
        parseError: note,
      },
    }),
  ]);

  await writeAuditLog({
    entityType: "PaymentProof",
    entityId: proofId,
    userId: session!.user!.id,
    action: "payment_proof_deleted",
    metadata: { documentId: proof.documentId },
  });

  return NextResponse.json({ ok: true });
}
