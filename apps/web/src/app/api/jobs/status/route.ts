import { NextRequest, NextResponse } from "next/server";

import { authorizeCronOrAdmin } from "@/lib/api-jobs-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const allowed = await authorizeCronOrAdmin(req);
  if (!allowed) {
    return NextResponse.json({ error: "Nepovoleno." }, { status: 403 });
  }

  const jobs = await prisma.processingJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      createdAt: true,
      completedAt: true,
      type: true,
      status: true,
      error: true,
      metadata: true,
    },
  });

  return NextResponse.json({ jobs });
}
