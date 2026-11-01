import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAgentOrApprover } from "@/lib/agent-auth";
import { markDuplicateFromUser } from "@/services/document-mark-duplicate";

const bodySchema = z.object({
  documentId: z.string().min(1),
  duplicateOfDocumentId: z.string().min(1).nullable().optional(),
  reason: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const { actor, response } = await requireAgentOrApprover(req);
  if (response) return response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Očekávám { documentId, duplicateOfDocumentId?, reason? }." }, { status: 400 });
  }
  const r = await markDuplicateFromUser({
    documentId: parsed.data.documentId,
    duplicateOfDocumentId: parsed.data.duplicateOfDocumentId ?? null,
    reason: parsed.data.reason ?? "agent",
    userId: actor!.userId,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.httpStatus });
  return NextResponse.json({ ok: true });
}
