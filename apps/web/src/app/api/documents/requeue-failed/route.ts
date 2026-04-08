import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireJobRunnerSession } from "@/lib/api-jobs-auth";
import { DOCUMENT_REQUEUE_AI_DATA } from "@/lib/document-ai-requeue";
import { prisma } from "@/lib/prisma";

/**
 * Vrátí doklady ve stavu ERROR + typ UNCLASSIFIED zpět do fronty pro AI
 * (typicky po zmizení /tmp nebo starší verzi jobu).
 */
export async function POST() {
  const session = await requireJobRunnerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Povoleno jen administrátorům nebo schvalovatelům." },
      { status: 403 },
    );
  }

  const result = await prisma.document.updateMany({
    where: {
      status: "ERROR",
      documentType: "UNCLASSIFIED",
    },
    data: DOCUMENT_REQUEUE_AI_DATA,
  });

  await writeAuditLog({
    entityType: "Document",
    entityId: "requeue-failed",
    userId: session.user.id,
    action: "requeue_error_unclassified",
    metadata: { count: result.count },
  });

  return NextResponse.json({ reset: result.count });
}
