import { NextResponse } from "next/server";

import { requireRoles, requireSession } from "@/lib/api-session";
import { restoreDuplicateDocument } from "@/services/document-dedupe-store";

/** Vrátí doklad označený jako duplicita zpět do evidence. */
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
  const { id } = await ctx.params;
  const result = await restoreDuplicateDocument(id, session!.user!.id ?? null);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus });
  }
  return NextResponse.json({ ok: true, status: result.status });
}
