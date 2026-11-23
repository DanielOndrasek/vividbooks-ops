import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit";
import { requireRoles, requireSession } from "@/lib/api-session";
import { INVENTORY_WRITE_ROLES as WRITE_ROLES } from "@/lib/inventory/permissions";
import { parseSku } from "@/lib/inventory/value";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** SKU položky (i s příponou balení) — uloží se pod základním SKU. */
  sku: z.string().min(1).max(120),
  /** Kč za 1 kus bez DPH; null = cenu smazat (neoceněno). */
  unitCost: z.number().finite().min(0).nullable(),
});

/** PUT — ruční nastavení výrobní ceny za kus (ADMIN/APPROVER). */
export async function PUT(req: NextRequest) {
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
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatná data." }, { status: 400 });
  }
  const { baseSku } = parseSku(parsed.data.sku);
  const { unitCost } = parsed.data;

  if (unitCost == null) {
    await prisma.productionCost.deleteMany({ where: { baseSku } });
  } else {
    await prisma.productionCost.upsert({
      where: { baseSku },
      create: { baseSku, unitCost, method: "manual", updatedByUserId: session!.user.id },
      update: { unitCost, method: "manual", updatedByUserId: session!.user.id },
    });
  }
  await writeAuditLog({
    entityType: "ProductionCost",
    entityId: baseSku,
    action: unitCost == null ? "deleted" : "updated",
    userId: session!.user.id,
    metadata: { baseSku },
  });
  return NextResponse.json({ ok: true, baseSku, unitCost });
}
