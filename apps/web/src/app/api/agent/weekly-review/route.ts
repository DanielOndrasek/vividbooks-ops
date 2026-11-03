import { NextResponse } from "next/server";

import { requireAgentOrApprover } from "@/lib/agent-auth";
import { buildWeeklyReview } from "@/services/weekly-review";

export const dynamic = "force-dynamic";

/** GET ?since=YYYY-MM-DD (jen pro první dávku) — přehled pro středeční schvalování. */
export async function GET(req: Request) {
  const { response } = await requireAgentOrApprover(req);
  if (response) return response;
  const sinceRaw = new URL(req.url).searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "Neplatné since." }, { status: 400 });
  }
  return NextResponse.json(await buildWeeklyReview(since));
}
