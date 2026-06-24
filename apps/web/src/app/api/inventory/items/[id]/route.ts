import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRoles, requireSession } from "@/lib/api-session";
import { writeAuditLog } from "@/lib/audit";
import { toInventoryItemDto } from "@/lib/inventory/serialize";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["ADMIN", "APPROVER"] as const;

const patchSchema = z.object({
  sku: z.string().min(1).max(120).optional(),
  name: z.string().min(1).max(300).optional(),
  category: z.string().max(120).optional().nullable(),
  unit: z.string().min(1).max(20).optional(),
  minQuantity: z.number().finite().min(0).optional().nullable(),
  unitPrice: z.number().finite().min(0).optional().nullable(),
  currency: z.string().min(1).max(8).optional(),
  location: z.string().max(200).optional().nullable(),
  supplier: z.string().max(300).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  const denied = requireRoles(session!, [...WRITE_ROLES]);
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

  const data: Prisma.InventoryItemUpdateInput = {};
  if (p.sku != null) {
    data.sku = p.sku.trim();
  }
  if (p.name != null) {
    data.name = p.name.trim();
  }
  if (p.category !== undefined) {
    data.category = p.category?.trim() || null;
  }
  if (p.unit != null) {
    data.unit = p.unit.trim() || "ks";
  }
  if (p.minQuantity !== undefined) {
    data.minQuantity = p.minQuantity;
  }
  if (p.unitPrice !== undefined) {
    data.unitPrice = p.unitPrice;
  }
  if (p.currency != null) {
    data.currency = p.currency.trim().toUpperCase();
  }
  if (p.location !== undefined) {
    data.location = p.location?.trim() || null;
  }
  if (p.supplier !== undefined) {
    data.supplier = p.supplier?.trim() || null;
  }
  if (p.note !== undefined) {
    data.note = p.note?.trim() || null;
  }
  if (p.active != null) {
    data.active = p.active;
  }

  try {
    const row = await prisma.inventoryItem.update({ where: { id }, data });
    await writeAuditLog({
      entityType: "InventoryItem",
      entityId: row.id,
      action: "updated",
      userId: session!.user.id,
      metadata: { fields: Object.keys(data) },
    });
    return NextResponse.json(toInventoryItemDto(row));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Položka se stejným SKU už existuje." },
        { status: 409 },
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Záznam nenalezen." }, { status: 404 });
    }
    console.error("[inventory] update failed", e);
    return NextResponse.json({ error: "Záznam se nepodařilo uložit." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  const denied = requireRoles(session!, [...WRITE_ROLES]);
  if (denied) {
    return denied;
  }

  const { id } = await ctx.params;
  try {
    const row = await prisma.inventoryItem.delete({ where: { id } });
    await writeAuditLog({
      entityType: "InventoryItem",
      entityId: id,
      action: "deleted",
      userId: session!.user.id,
      metadata: { sku: row.sku, name: row.name },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Záznam nenalezen." }, { status: 404 });
  }
}
