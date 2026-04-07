import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRoles, requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({
  reason: z.string().max(4000).optional(),
});

export async function POST(
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

  const { id: invoiceId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatné tělo." }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { document: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Nenalezeno." }, { status: 404 });
  }

  const allowed = ["PENDING_APPROVAL", "NEEDS_REVIEW"];
  if (!allowed.includes(invoice.document.status)) {
    return NextResponse.json({ error: "V tomto stavu nelze zamítnout." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.document.update({
      where: { id: invoice.documentId },
      data: { status: "REJECTED" },
    }),
    prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        rejectionReason: parsed.data.reason?.trim() || "(bez důvodu)",
        approvedByUserId: session!.user!.id,
        approvedAt: new Date(),
      },
    }),
  ]);

  await writeAuditLog({
    entityType: "Invoice",
    entityId: invoiceId,
    userId: session!.user!.id,
    action: "rejected",
    metadata: { reason: parsed.data.reason },
  });

  return NextResponse.json({ ok: true, invoiceId });
}
