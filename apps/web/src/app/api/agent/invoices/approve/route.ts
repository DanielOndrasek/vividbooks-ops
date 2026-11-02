import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAgentOrApprover } from "@/lib/agent-auth";
import { runInvoiceApproval } from "@/services/invoice-approval";

export const maxDuration = 300;

const bodySchema = z.object({ invoiceIds: z.array(z.string().min(1)).min(1).max(100) });

/** Schválení faktur (každá → Drive). */
export async function POST(req: Request) {
  const { actor, response } = await requireAgentOrApprover(req);
  if (response) return response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Očekávám { invoiceIds: string[] }." }, { status: 400 });
  }
  const results = [];
  for (const id of parsed.data.invoiceIds) {
    const r = await runInvoiceApproval(id, actor!.userId);
    results.push(r.ok ? { invoiceId: id, ok: true, driveUrl: r.driveUrl } : { invoiceId: id, ok: false, error: r.error });
  }
  return NextResponse.json({
    approved: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
