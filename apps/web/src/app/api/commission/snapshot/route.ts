import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  void session;

  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json(
      { error: "Parametry year a month (1–12) jsou povinné." },
      { status: 400 },
    );
  }

  const row = await prisma.commissionMonthSnapshot.findUnique({
    where: {
      year_month: { year, month },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Pro tento měsíc není uložený výpočet." }, { status: 404 });
  }

  const payload = row.payload as Record<string, unknown>;
  const merged = {
    ...payload,
    persisted: {
      ...(typeof payload.persisted === "object" && payload.persisted !== null
        ? (payload.persisted as Record<string, unknown>)
        : {}),
      computedAt: row.computedAt.toISOString(),
      snapshotId: row.id,
      computedByUserId: row.computedByUserId,
    },
  };

  return NextResponse.json(merged);
}
