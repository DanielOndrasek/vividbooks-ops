import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRoles, requireSession } from "@/lib/api-session";
import {
  executeReviewResolve,
  type ReviewResolveAction,
} from "@/services/document-review-resolve";

const bodySchema = z.object({
  action: z.enum(["requeue_ai", "confirm_invoice", "confirm_payment", "dismiss"]),
  reason: z.string().max(4000).optional(),
});

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

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatné JSON tělo." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatné tělo požadavku." }, { status: 400 });
  }

  const { id: documentId } = await ctx.params;
  const r = await executeReviewResolve(
    documentId,
    parsed.data.action as ReviewResolveAction,
    session!.user!.id,
    parsed.data.reason,
  );

  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.httpStatus });
  }

  return NextResponse.json({ ok: true });
}
