import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { requireRoles, requireSession } from "@/lib/api-session";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["ADMIN", "APPROVER"] as const;

/** Aktuální veřejný sdílený odkaz na dostupnou zásobu (token, nebo null). */
export async function GET() {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  void session;

  const link = await prisma.inventoryShareLink.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ token: link?.token ?? null });
}

/** Vytvoří (nebo zrotuje) veřejný odkaz. Aktivní je vždy nejvýše jeden. */
export async function POST() {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  const denied = requireRoles(session!, [...WRITE_ROLES]);
  if (denied) {
    return denied;
  }

  const token = randomBytes(24).toString("base64url");
  const link = await prisma.$transaction(async (tx) => {
    await tx.inventoryShareLink.updateMany({
      where: { active: true },
      data: { active: false },
    });
    return tx.inventoryShareLink.create({
      data: { token, active: true, createdByUserId: session!.user.id },
    });
  });

  await writeAuditLog({
    entityType: "InventoryShareLink",
    entityId: link.id,
    action: "created",
    userId: session!.user.id,
  });

  return NextResponse.json({ token: link.token });
}

/** Zruší (deaktivuje) veřejný odkaz. */
export async function DELETE() {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  const denied = requireRoles(session!, [...WRITE_ROLES]);
  if (denied) {
    return denied;
  }

  await prisma.inventoryShareLink.updateMany({
    where: { active: true },
    data: { active: false },
  });

  await writeAuditLog({
    entityType: "InventoryShareLink",
    entityId: "all",
    action: "revoked",
    userId: session!.user.id,
  });

  return NextResponse.json({ token: null });
}
