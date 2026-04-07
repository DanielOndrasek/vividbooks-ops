import { NextResponse } from "next/server";

import { requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { response } = await requireSession();
  if (response) {
    return response;
  }

  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: { email: true, name: true } },
    },
  });

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
      userEmail: r.user?.email ?? null,
      userName: r.user?.name ?? null,
    })),
  });
}
