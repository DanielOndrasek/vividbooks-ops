import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAgentOrApprover } from "@/lib/agent-auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ invoiceId: z.string().min(1), reason: z.string().max(4000).optional() });

export async function POST(req: Request) {
  const { actor, response } = await requireAgentOrApprover(req);
  if (response) return response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Očekávám { invoiceId, reason? }." }, { status: 400 });
  }
  const { invoiceId, reason } = parsed.data;
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { document: true } });
  if (!invoice) return NextResponse.json({ error: "Nenalezeno." }, { status: 404 });
  if (!["PENDING_APPROVAL", "NEEDS_REVIEW"].includes(invoice.document.status)) {
    return NextResponse.json({ error: "V tomto stavu nelze zamítnout." }, { status: 400 });
  }
  await prisma.$transaction([
    prisma.document.update({ where: { id: invoice.documentId }, data: { status: "REJECTED" } }),
    prisma.invoice.update({
      where: { id: invoiceId },
      data: { rejectionReason: reason?.trim() || "(bez důvodu)", approvedByUserId: actor!.userId, approvedAt: new Date() },
    }),
  ]);
  await writeAuditLog({ entityType: "Invoice", entityId: invoiceId, userId: actor!.userId, action: "rejected", metadata: { reason, via: actor!.via } });
  return NextResponse.json({ ok: true, invoiceId });
}
