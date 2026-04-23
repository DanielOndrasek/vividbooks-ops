import { PohodaExportStatus } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { wrapDataPackItem, wrapDataPackRoot } from "@/services/pohoda/datapack-wrap";
import { getPohodaMserverConfig } from "@/services/pohoda/env";
import { postDataPackToMserver } from "@/services/pohoda/mserver-client";
import { buildReceivedInvoiceInnerXml } from "@/services/pohoda/received-invoice-xml";

/**
 * Po schválení faktury: odeslání přijaté faktury do POHODY přes mServer (pokud je env nastavený).
 */
export async function runInvoicePohodaExportIfConfigured(
  invoiceId: string,
): Promise<void> {
  const cfg = getPohodaMserverConfig();
  if (!cfg) {
    return;
  }

  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });
  if (!inv) {
    return;
  }

  if (inv.pohodaExportStatus === PohodaExportStatus.EXPORTED) {
    return;
  }

  const packId = `inv-${inv.id}-${Date.now()}`;
  const itemId = inv.id.slice(0, 32);

  let inner: string;
  try {
    inner = buildReceivedInvoiceInnerXml(inv, cfg);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        pohodaExportStatus: PohodaExportStatus.FAILED,
        pohodaExportLastError: msg.slice(0, 8000),
      },
    });
    await writeAuditLog({
      entityType: "Invoice",
      entityId: invoiceId,
      action: "pohoda_export_failed",
      metadata: { phase: "build_xml", error: msg },
    });
    return;
  }

  const xml = wrapDataPackRoot({
    packId,
    ico: cfg.ico,
    application: cfg.application,
    note: "Import faktury",
    itemsXml: wrapDataPackItem(itemId, inner),
  });

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      pohodaExportStatus: PohodaExportStatus.PENDING,
      pohodaExportLastError: null,
    },
  });

  const sent = await postDataPackToMserver(cfg, xml);
  if (!sent.ok) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        pohodaExportStatus: PohodaExportStatus.FAILED,
        pohodaExportLastError: sent.error.slice(0, 8000),
      },
    });
    await writeAuditLog({
      entityType: "Invoice",
      entityId: invoiceId,
      action: "pohoda_export_failed",
      metadata: { error: sent.error, rawPreview: sent.rawXml?.slice(0, 2000) },
    });
    return;
  }

  const extId =
    sent.documentIds[0] ?? packId;

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      pohodaExportStatus: PohodaExportStatus.EXPORTED,
      pohodaExportedAt: new Date(),
      pohodaExternalId: extId.slice(0, 255),
      pohodaExportLastError: null,
    },
  });

  await writeAuditLog({
    entityType: "Invoice",
    entityId: invoiceId,
    action: "pohoda_exported",
    metadata: {
      stateText: sent.stateText,
      documentIds: sent.documentIds,
    },
  });
}
