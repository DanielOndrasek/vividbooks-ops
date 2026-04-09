import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRoles, requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  ownerLabel: z.string().min(1).max(500).optional(),
  amount: z.number().finite().optional(),
  currency: z.string().min(1).max(8).optional(),
  note: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  const denied = requireRoles(session!, ["ADMIN"]);
  if (denied) {
    return denied;
  }

  const { id } = await ctx.params;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatné JSON." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatná data." }, { status: 400 });
  }
  const p = parsed.data;
  const data: Record<string, unknown> = {};
  if (p.year != null) {
    data.year = p.year;
  }
  if (p.ownerLabel != null) {
    data.ownerLabel = p.ownerLabel.trim();
  }
  if (p.amount != null) {
    data.amount = p.amount;
  }
  if (p.currency != null) {
    data.currency = p.currency.trim().toUpperCase();
  }
  if (p.note !== undefined) {
    data.note = p.note?.trim() || null;
  }
  if (p.active != null) {
    data.active = p.active;
  }

  try {
    const row = await prisma.salesPersonMonthlyFixed.update({
      where: { id },
      data,
    });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Záznam nenalezen." }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  const denied = requireRoles(session!, ["ADMIN"]);
  if (denied) {
    return denied;
  }

  const { id } = await ctx.params;
  try {
    await prisma.salesPersonMonthlyFixed.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Záznam nenalezen." }, { status: 404 });
  }
}
