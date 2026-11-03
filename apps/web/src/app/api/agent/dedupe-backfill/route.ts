import { NextResponse } from "next/server";

import { requireAgentOrApprover } from "@/lib/agent-auth";
import { runDedupeBackfill } from "@/services/dedupe-backfill";

export const maxDuration = 300;

/** POST ?apply=1 provede; bez parametru jen přehled (nic nemění). */
export async function POST(req: Request) {
  const { actor, response } = await requireAgentOrApprover(req);
  if (response) return response;
  const apply = new URL(req.url).searchParams.get("apply") === "1";
  return NextResponse.json(await runDedupeBackfill({ apply, userId: actor!.userId }));
}
