import { NextResponse } from "next/server";

import { requireRoles, requireSession } from "@/lib/api-session";
import { deleteDocumentById } from "@/services/document-delete";

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

  const { id: documentId } = await ctx.params;

  const r = await deleteDocumentById(documentId, session!.user!.id);
  if (!r.ok) {
    const status = r.code === "not_found" ? 404 : 400;
    return NextResponse.json({ error: r.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
