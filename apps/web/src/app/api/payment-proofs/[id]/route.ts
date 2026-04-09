import { DocumentType } from "@prisma/client";
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireRoles, requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import {
  isDriveConfigured,
  uploadPaymentReceiptIfConfigured,
} from "@/services/drive";
import { deletePaymentProofById } from "@/services/payment-proof-delete";

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

  const { id: proofId } = await ctx.params;

  const r = await deletePaymentProofById(proofId, session!.user!.id);
  if (!r.ok) {
    const status = r.code === "not_found" ? 404 : 400;
    return NextResponse.json({ error: r.error }, { status });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Znovu zkusí nahrát přílohu dokladu platby na Shared Drive (složka z GOOGLE_DRIVE_RECEIPTS_FOLDER_ID).
 * Užitečné po doplnění env, obnově Gmail tokenu nebo když první pokus selhal (dočasný soubor na serveru).
 */
export async function POST(
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

  const { id: proofId } = await ctx.params;

  const proof = await prisma.paymentProof.findUnique({
    where: { id: proofId },
    include: { document: true },
  });

  if (!proof) {
    return NextResponse.json({ error: "Záznam nenalezen." }, { status: 404 });
  }

  if (proof.document.documentType !== DocumentType.PAYMENT_RECEIPT) {
    return NextResponse.json(
      { error: "Doklad není typu platba — nelze nahrát do složky dokladů o platbě." },
      { status: 400 },
    );
  }

  if (!isDriveConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google Drive pro doklady platby není nakonfigurován (GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON, GOOGLE_DRIVE_INVOICES_FOLDER_ID a GOOGLE_DRIVE_RECEIPTS_FOLDER_ID na sdíleném disku).",
      },
      { status: 400 },
    );
  }

  await uploadPaymentReceiptIfConfigured(proof.documentId);

  const after = await prisma.paymentProof.findUnique({
    where: { id: proofId },
    select: { driveFileId: true, driveUrl: true, storedAt: true },
  });
  const docAfter = await prisma.document.findUnique({
    where: { id: proof.documentId },
    select: { status: true, parseError: true },
  });

  if (after?.driveFileId) {
    await writeAuditLog({
      entityType: "PaymentProof",
      entityId: proofId,
      userId: session!.user!.id,
      action: "payment_proof_drive_retry_ok",
      metadata: { documentId: proof.documentId },
    });
    return NextResponse.json({
      ok: true,
      driveUrl: after.driveUrl,
      storedAt: after.storedAt?.toISOString() ?? null,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        docAfter?.parseError?.slice(0, 800) ??
        "Nahrání se nezdařilo. Ověřte přístup service accountu ke sdílenému disku, složku dokladů platby (ne faktury), Gmail token a že příloha v e-mailu stále existuje.",
      documentStatus: docAfter?.status,
    },
    { status: 422 },
  );
}
