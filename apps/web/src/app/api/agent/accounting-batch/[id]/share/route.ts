import { NextResponse } from "next/server";

import { requireAgentOrApprover } from "@/lib/agent-auth";
import { finalizeAccountingBatch } from "@/services/accounting-batch";

/** Znovu vytvořit přehledy a nasdílet složku dávky (po chybě). Opakovatelné. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { actor, response } = await requireAgentOrApprover(req);
  if (response) return response;
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await finalizeAccountingBatch(id, actor!.userId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
