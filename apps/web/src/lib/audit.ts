import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function writeAuditLog(input: {
  entityType: string;
  entityId: string;
  action: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      userId: input.userId ?? undefined,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
