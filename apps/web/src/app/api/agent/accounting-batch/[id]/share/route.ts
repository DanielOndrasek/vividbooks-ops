import { NextResponse } from "next/server";

import { requireAgentOrApprover } from "@/lib/agent-auth";
import { reshareAccountingBatch } from "@/services/accounting-batch";

/** Znovu nasdílet složku dávky účetní (po chybě sdílení). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { response } = await requireAgentOrApprover(req);
  if (response) return response;
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await reshareAccountingBatch(id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
