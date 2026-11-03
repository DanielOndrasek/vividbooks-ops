import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRoles, requireSession } from "@/lib/api-session";
import { markDuplicateFromUser } from "@/services/document-mark-duplicate";

const bodySchema = z.object({
  duplicateOfDocumentId: z.string().min(1).nullable().optional(),
  reason: z.string().max(2000).optional(),
});

/** Ruční označení duplicity (místo mazání) — doklad zmizí ze seznamů, jde obnovit. */
export async function POST(
  req: Request,
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
  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    json = {};
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatné tělo požadavku." }, { status: 400 });
  }
  const { id } = await ctx.params;
  const result = await markDuplicateFromUser({
    documentId: id,
    duplicateOfDocumentId: parsed.data.duplicateOfDocumentId ?? null,
    reason: parsed.data.reason ?? "manual",
    userId: session!.user!.id ?? null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus });
  }
  return NextResponse.json({ ok: true });
}
