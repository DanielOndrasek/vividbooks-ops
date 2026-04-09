import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRoles, requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  ownerLabel: z.string().min(1).max(500),
  amount: z.number().finite(),
  currency: z.string().min(1).max(8).default("CZK"),
  note: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});

export async function GET() {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  void session;

  const rows = await prisma.salesPersonMonthlyFixed.findMany({
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
  const { ownerLabel, amount, currency, note, active } = parsed.data;

  const row = await prisma.salesPersonMonthlyFixed.create({
    data: {
      ownerLabel: ownerLabel.trim(),
      amount,
      currency: currency.trim().toUpperCase() || "CZK",
      note: note?.trim() || null,
      active: active ?? true,
    },
  });

  return NextResponse.json(row);
}
