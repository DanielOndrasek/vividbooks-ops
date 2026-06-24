import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRoles, requireSession } from "@/lib/api-session";
import { writeAuditLog } from "@/lib/audit";
import { toInventoryItemDto } from "@/lib/inventory/serialize";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["ADMIN", "APPROVER"] as const;

const movementSchema = z.object({
  type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
  quantity: z.number().finite().min(0),
  note: z.string().max(2000).optional().nullable(),
});

type RouteCtx = { params: Promise<{ id: string }> };

function nextQuantity(
  current: Prisma.Decimal,
  type: "IN" | "OUT" | "ADJUSTMENT",
  qty: Prisma.Decimal,
): Prisma.Decimal {
  if (type === "IN") {
    return current.plus(qty);
  }
  if (type === "OUT") {
    return current.minus(qty);
  }
  return qty;
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
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
  const parsed = movementSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatná data." }, { status: 400 });
  }
  const { type, quantity, note } = parsed.data;

  if ((type === "IN" || type === "OUT") && quantity <= 0) {
    return NextResponse.json(
      { error: "Množství pohybu musí být větší než nula." },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({ where: { id } });
      if (!item) {
        return { notFound: true as const };
      }

      const qty = new Prisma.Decimal(quantity);
      const newQty = nextQuantity(item.quantity, type, qty);

      if (newQty.lessThan(0)) {
        return { insufficient: true as const, available: item.quantity.toString() };
      }

      const updated = await tx.inventoryItem.update({
        where: { id },
        data: { quantity: newQty },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          itemId: id,
          type,
          quantity: qty,
          quantityAfter: newQty,
          note: note?.trim() || null,
          createdByUserId: session!.user.id,
        },
      });

      return { item: updated, movementId: movement.id };
    });

    if ("notFound" in result) {
      return NextResponse.json({ error: "Položka nenalezena." }, { status: 404 });
    }
    if ("insufficient" in result) {
      return NextResponse.json(
        { error: `Nedostatek zásoby — k dispozici je ${result.available}.` },
        { status: 400 },
      );
    }

    await writeAuditLog({
      entityType: "InventoryItem",
      entityId: id,
      action: `movement_${type.toLowerCase()}`,
      userId: session!.user.id,
      metadata: {
        movementId: result.movementId,
        quantity,
        quantityAfter: result.item.quantity.toString(),
      },
    });

    return NextResponse.json(toInventoryItemDto(result.item));
  } catch (e) {
    console.error("[inventory] movement failed", e);
    return NextResponse.json({ error: "Pohyb se nepodařilo zapsat." }, { status: 500 });
  }
}
