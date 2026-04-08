import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireRoles, requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  const forbidden = requireRoles(session!, ["ADMIN", "APPROVER"]);
  if (forbidden) {
    return forbidden;
  }

  const { id: documentId } = await ctx.params;

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      status: true,
      localFilePath: true,
      originalFilename: true,
    },
  });

  if (!doc) {
    return NextResponse.json({ error: "Doklad nenalezen." }, { status: 404 });
  }

  if (doc.status === "APPROVED") {
    return NextResponse.json(
      { error: "Schválený doklad nelze smazat." },
      { status: 400 },
    );
  }

  const localPath = doc.localFilePath;

  await prisma.document.delete({ where: { id: documentId } });

  if (localPath) {
    try {
      const fs = await import("node:fs/promises");
      await fs.unlink(localPath);
    } catch {
      /* ignore missing temp file */
    }
  }

  await writeAuditLog({
    entityType: "Document",
    entityId: documentId,
    userId: session!.user!.id,
    action: "document_deleted",
    metadata: { originalFilename: doc.originalFilename },
  });

  return NextResponse.json({ ok: true });
}
