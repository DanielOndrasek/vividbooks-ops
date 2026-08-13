import { NextResponse } from "next/server";

import { requireRoles, requireSession } from "@/lib/api-session";
import { prismaErrorMessage } from "@/lib/api-json";
import { deleteDocumentById } from "@/services/document-delete";

async function deleteDocumentResponse(documentId: string, userId: string) {
  try {
    const r = await deleteDocumentById(documentId, userId);
    if (!r.ok) {
      const status =
        r.code === "not_found" ? 404 : r.code === "failed" ? 500 : 400;
      return NextResponse.json({ error: r.error }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: prismaErrorMessage(err, "Smazání dokladu selhalo.") },
      { status: 500 },
    );
  }
}

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
  return deleteDocumentResponse(documentId, session!.user!.id);
}

/** Stejné jako DELETE — POST je spolehlivější přes proxy / WAF, které DELETE blokují. */
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

  let action: string | undefined;
  try {
    const body = (await req.json()) as { action?: unknown };
    action = typeof body.action === "string" ? body.action : undefined;
  } catch {
    action = "delete";
  }
  if (action && action !== "delete") {
    return NextResponse.json({ error: "Neplatná akce." }, { status: 400 });
  }

  const { id: documentId } = await ctx.params;
  return deleteDocumentResponse(documentId, session!.user!.id);
}
