import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/lib/api-session";
import { toInventoryMovementDto } from "@/lib/inventory/serialize";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  void session;

  const itemId = req.nextUrl.searchParams.get("itemId")?.trim() || undefined;
  const rawLimit = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : DEFAULT_LIMIT;

  const rows = await prisma.inventoryMovement.findMany({
    where: itemId ? { itemId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      item: { select: { name: true, sku: true, unit: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({ movements: rows.map(toInventoryMovementDto) });
}
