import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAgentOrApprover } from "@/lib/agent-auth";
import {
  collectBatchCandidates,
  createAccountingBatch,
  summarizeCandidates,
} from "@/services/accounting-batch";

export const maxDuration = 300;

const bodySchema = z.object({
  /** Jen u první dávky: od kdy (ISO datum). */
  since: z.string().optional(),
  dryRun: z.boolean().optional(),
});

/** Vytvoří týdenní dávku pro účetní (složky na Disku). dryRun = jen co by šlo. */
export async function POST(req: Request) {
  const { actor, response } = await requireAgentOrApprover(req);
  if (response) return response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Očekávám { since?, dryRun? }." }, { status: 400 });
  }
  const since = parsed.data.since ? new Date(parsed.data.since) : null;
  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "Neplatné since." }, { status: 400 });
  }
  try {
    if (parsed.data.dryRun) {
      return NextResponse.json({ dryRun: true, ...summarizeCandidates(await collectBatchCandidates(since)) });
    }
    const batch = await createAccountingBatch({ since, userId: actor!.userId });
    return NextResponse.json({ ok: true, ...batch });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
