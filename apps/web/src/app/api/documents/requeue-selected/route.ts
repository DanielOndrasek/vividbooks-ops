import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireJobRunnerSession } from "@/lib/api-jobs-auth";
import {
  DOCUMENT_REQUEUE_AI_DATA,
  prismaWhereDocumentsEligibleForAiRequeue,
} from "@/lib/document-ai-requeue";
import { prisma } from "@/lib/prisma";

const MAX_IDS = 100;

/**
 * Zařadí vybrané doklady zpět do fronty AI (stejná pravidla jako checkboxy na /documents).
 */
export async function POST(req: Request) {
  const session = await requireJobRunnerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Povoleno jen administrátorům nebo schvalovatelům." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatné JSON tělo." }, { status: 400 });
  }

  const raw = body as { documentIds?: unknown };
  if (!Array.isArray(raw.documentIds)) {
    return NextResponse.json({ error: "Chybí pole documentIds." }, { status: 400 });
  }

  const ids = raw.documentIds
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json({ error: "Vyberte alespoň jeden doklad." }, { status: 400 });
  }

  const result = await prisma.document.updateMany({
    where: prismaWhereDocumentsEligibleForAiRequeue({ in: ids }),
    data: DOCUMENT_REQUEUE_AI_DATA,
  });

  await writeAuditLog({
    entityType: "Document",
    entityId: "requeue-selected",
    userId: session.user.id,
    action: "requeue_selected_for_ai",
    metadata: {
      updated: result.count,
      requested: ids.length,
      sampleIds: ids.slice(0, 15),
    },
  });

  return NextResponse.json({
    updated: result.count,
    requested: ids.length,
  });
}
