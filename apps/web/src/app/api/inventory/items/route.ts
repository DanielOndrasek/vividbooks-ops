import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRoles, requireSession } from "@/lib/api-session";
import { writeAuditLog } from "@/lib/audit";
import { isExcludedInventoryItem } from "@/lib/inventory/excluded-codes";
import { toInventoryItemDto } from "@/lib/inventory/serialize";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["ADMIN", "APPROVER"] as const;

const createSchema = z.object({
  sku: z.string().min(1).max(120),
  name: z.string().min(1).max(300),
  category: z.string().max(120).optional().nullable(),
  unit: z.string().min(1).max(20).default("ks"),
  quantity: z.number().finite().min(0).optional(),
  minQuantity: z.number().finite().min(0).optional().nullable(),
  unitPrice: z.number().finite().min(0).optional().nullable(),
  currency: z.string().min(1).max(8).default("CZK"),
  location: z.string().max(200).optional().nullable(),
  supplier: z.string().max(300).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  void session;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "1";

  const where: Prisma.InventoryItemWhereInput = {};
  if (!includeInactive) {
    where.active = true;
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
      { supplier: { contains: q, mode: "insensitive" } },
      { location: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.inventoryItem.findMany({
    where,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  const items = rows
    .filter((row) => !isExcludedInventoryItem(row))
    .map(toInventoryItemDto);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  const denied = requireRoles(session!, [...WRITE_ROLES]);
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
  const p = parsed.data;

  try {
    const row = await prisma.inventoryItem.create({
      data: {
        sku: p.sku.trim(),
        name: p.name.trim(),
        category: p.category?.trim() || null,
        unit: p.unit.trim() || "ks",
        quantity: p.quantity ?? 0,
        minQuantity: p.minQuantity ?? null,
        unitPrice: p.unitPrice ?? null,
        currency: p.currency.trim().toUpperCase() || "CZK",
        location: p.location?.trim() || null,
        supplier: p.supplier?.trim() || null,
        note: p.note?.trim() || null,
        active: p.active ?? true,
      },
    });

    await writeAuditLog({
      entityType: "InventoryItem",
      entityId: row.id,
      action: "created",
      userId: session!.user.id,
      metadata: { sku: row.sku, name: row.name },
    });

    return NextResponse.json(toInventoryItemDto(row));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Položka se stejným SKU už existuje." },
        { status: 409 },
      );
    }
    console.error("[inventory] create failed", e);
    return NextResponse.json({ error: "Položku se nepodařilo vytvořit." }, { status: 500 });
  }
}
