import { writeAuditLog } from "@/lib/audit";
import { prismaErrorMessage } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";

export type DeleteDocumentByIdResult =
  | { ok: true }
  | { ok: false; error: string; code: "not_found" | "approved" | "failed" };

/**
 * Stejná logika jako DELETE /api/documents/[id] (kaskáda z Prisma smaže invoice / paymentProof).
 */
export async function deleteDocumentById(
  documentId: string,
  userId: string,
): Promise<DeleteDocumentByIdResult> {
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
    return { ok: false, error: "Doklad nenalezen.", code: "not_found" };
  }

  if (doc.status === "APPROVED") {
    return {
      ok: false,
      error: "Schválený doklad nelze smazat.",
      code: "approved",
    };
  }

  const localPath = doc.localFilePath;

  try {
    await prisma.document.delete({ where: { id: documentId } });
  } catch (err) {
    return {
      ok: false,
      error: prismaErrorMessage(err, "Smazání dokladu selhalo."),
      code: "failed",
    };
  }

  if (localPath) {
    try {
      const fs = await import("node:fs/promises");
      await fs.unlink(localPath);
    } catch {
      /* ignore missing temp file */
    }
  }

  try {
    await writeAuditLog({
      entityType: "Document",
      entityId: documentId,
      userId,
      action: "document_deleted",
      metadata: { originalFilename: doc.originalFilename },
    });
  } catch {
    /* záznam v DB už je smazaný */
  }

  return { ok: true };
}
