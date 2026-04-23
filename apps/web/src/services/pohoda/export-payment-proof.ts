import { PohodaExportStatus } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { buildBankMovementInnerXml } from "@/services/pohoda/bank-xml";
import { wrapDataPackItem, wrapDataPackRoot } from "@/services/pohoda/datapack-wrap";
import { getPohodaMserverConfig } from "@/services/pohoda/env";
import { postDataPackToMserver } from "@/services/pohoda/mserver-client";

/**
 * Import příchozí platby do agendy Banka (POHODA). Vyžaduje POHODA_DEFAULT_BANK_ACCOUNT_IDS.
 */
export async function runPaymentProofPohodaExportIfConfigured(
  paymentProofId: string,
): Promise<void> {
  const cfg = getPohodaMserverConfig();
  if (!cfg || !cfg.defaultBankAccountIds) {
    return;
  }

  const proof = await prisma.paymentProof.findUnique({
    where: { id: paymentProofId },
  });
  if (!proof) {
    return;
  }

  if (proof.pohodaExportStatus === PohodaExportStatus.EXPORTED) {
    return;
  }

  if (proof.amount == null) {
    return;
  }

  const packId = `pay-${proof.id}-${Date.now()}`;
  const itemId = proof.id.slice(0, 32);

  let inner: string;
  try {
    inner = buildBankMovementInnerXml(proof, cfg);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.paymentProof.update({
      where: { id: paymentProofId },
      data: {
        pohodaExportStatus: PohodaExportStatus.FAILED,
        pohodaExportLastError: msg.slice(0, 8000),
      },
    });
    await writeAuditLog({
      entityType: "PaymentProof",
      entityId: paymentProofId,
      action: "pohoda_export_failed",
      metadata: { phase: "build_xml", error: msg },
    });
    return;
  }

  const xml = wrapDataPackRoot({
    packId,
    ico: cfg.ico,
    application: cfg.application,
    note: "Import banky",
    itemsXml: wrapDataPackItem(itemId, inner),
  });

  await prisma.paymentProof.update({
    where: { id: paymentProofId },
    data: {
      pohodaExportStatus: PohodaExportStatus.PENDING,
      pohodaExportLastError: null,
    },
  });

  const sent = await postDataPackToMserver(cfg, xml);
  if (!sent.ok) {
    await prisma.paymentProof.update({
      where: { id: paymentProofId },
      data: {
        pohodaExportStatus: PohodaExportStatus.FAILED,
        pohodaExportLastError: sent.error.slice(0, 8000),
      },
    });
    await writeAuditLog({
      entityType: "PaymentProof",
      entityId: paymentProofId,
      action: "pohoda_export_failed",
      metadata: { error: sent.error, rawPreview: sent.rawXml?.slice(0, 2000) },
    });
    return;
  }

  const extId = sent.documentIds[0] ?? packId;

  await prisma.paymentProof.update({
    where: { id: paymentProofId },
    data: {
      pohodaExportStatus: PohodaExportStatus.EXPORTED,
      pohodaExportedAt: new Date(),
      pohodaExternalId: extId.slice(0, 255),
      pohodaExportLastError: null,
    },
  });

  await writeAuditLog({
    entityType: "PaymentProof",
    entityId: paymentProofId,
    action: "pohoda_exported",
    metadata: {
      stateText: sent.stateText,
      documentIds: sent.documentIds,
    },
  });
}
