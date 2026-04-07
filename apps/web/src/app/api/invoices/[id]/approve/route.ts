import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireRoles, requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { uploadApprovedInvoiceToDrive } from "@/services/drive";

export async function POST(
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

  const { id: invoiceId } = await ctx.params;
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { document: true },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Nenalezeno." }, { status: 404 });
  }

  const allowed = ["PENDING_APPROVAL", "NEEDS_REVIEW"];
  if (!allowed.includes(invoice.document.status)) {
    return NextResponse.json(
      { error: "Fakturu lze schválit jen ve stavu čeká / ke kontrole." },
      { status: 400 },
    );
  }

  if (!invoice.document.localFilePath) {
    return NextResponse.json(
      { error: "Chybí lokální soubor — nelze nahrát na Drive." },
      { status: 400 },
    );
  }

  await prisma.$transaction([
    prisma.document.update({
      where: { id: invoice.documentId },
      data: { status: "APPROVED" },
    }),
    prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        approvedByUserId: session!.user!.id,
        approvedAt: new Date(),
        rejectionReason: null,
      },
    }),
  ]);

  await writeAuditLog({
    entityType: "Invoice",
    entityId: invoiceId,
    userId: session!.user!.id,
    action: "approved",
    metadata: {},
  });

  const upload = await uploadApprovedInvoiceToDrive(invoice.documentId);
  if (!upload.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: upload.error,
        invoiceId,
        hint: "Stav dokumentu může být UPLOAD_FAILED — zkuste znovu po opravě Drive.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    driveUrl: upload.url,
    invoiceId,
  });
}
