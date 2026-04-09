import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRoles, requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  ownerLabel: z.string().min(1).max(500),
  amount: z.number().finite(),
  currency: z.string().min(1).max(8).default("CZK"),
  note: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});

function parseYearParam(req: NextRequest): number | null {
  const raw = req.nextUrl.searchParams.get("year");
  if (raw == null || raw === "") {
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) {
    return null;
  }
  return Math.floor(n);
}

export async function GET(req: NextRequest) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  void session;

  const year = parseYearParam(req);
  if (year == null) {
    return NextResponse.json({ error: "Chybí platný parametr year (2000–2100)." }, { status: 400 });
  }

  const rows = await prisma.salesPersonMonthlyFixed.findMany({
    where: { year },
    orderBy: [{ active: "desc" }, { ownerLabel: "asc" }],
  });
  return NextResponse.json({ items: rows });
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  const denied = requireRoles(session!, ["ADMIN"]);
  if (denied) {
    return denied;
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatné JSON." }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatná data." }, { status: 400 });
  }
  const { year, ownerLabel, amount, currency, note, active } = parsed.data;

  const row = await prisma.salesPersonMonthlyFixed.create({
    data: {
      year,
      ownerLabel: ownerLabel.trim(),
      amount,
      currency: currency.trim().toUpperCase() || "CZK",
      note: note?.trim() || null,
      active: active ?? true,
    },
  });

  return NextResponse.json(row);
}
