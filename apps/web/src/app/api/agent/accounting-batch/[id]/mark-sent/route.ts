import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAgentOrApprover } from "@/lib/agent-auth";
import { markAccountingBatchSent } from "@/services/accounting-batch";

const bodySchema = z.object({ sentTo: z.string().min(3).max(500) });

/** Agent po odeslání e-mailu účetní zapíše, že dávka odešla. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { actor, response } = await requireAgentOrApprover(req);
  if (response) return response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Očekávám { sentTo }." }, { status: 400 });
  }
  const { id } = await ctx.params;
  try {
    const b = await markAccountingBatchSent(id, parsed.data.sentTo, actor!.userId);
    return NextResponse.json({ ok: true, batchId: b.id, sentAt: b.sentAt });
  } catch {
    return NextResponse.json({ error: "Dávka nenalezena." }, { status: 404 });
  }
}
