import { Prisma } from "@prisma/client";

import { getFulfillmentEnv } from "@/lib/integrations/fulfillment-env";
import { prisma } from "@/lib/prisma";
import {
  fetchAllProducts,
  fetchAllWarehouseVariants,
  FulfillmentApiError,
  type FulfillmentProduct,
} from "@/services/fulfillment/client";

export type FulfillmentSyncResult = {
  ok: boolean;
  error?: string;
  fetchedVariants: number;
  created: number;
  updated: number;
  unchanged: number;
  movementsRecorded: number;
  skipped: number;
};

type VariantMeta = {
  productName: string;
  variantName: string | null;
  priceRetail: number | null;
  pricePurchase: number | null;
};

const JOB_TYPE = "fulfillment_inventory_sync";

function buildVariantMetaByCode(
  products: FulfillmentProduct[],
): Map<string, VariantMeta> {
  const map = new Map<string, VariantMeta>();
  for (const product of products) {
    const productName = (product.name ?? "").trim();
    for (const variant of product.variants ?? []) {
      const code = variant.code?.trim();
      if (!code) {
        continue;
      }
      map.set(code, {
        productName,
        variantName: variant.name?.trim() || null,
        priceRetail: variant.price_retail ?? null,
        pricePurchase: variant.price_purchase ?? null,
      });
    }
  }
  return map;
}

function displayName(
  meta: VariantMeta | undefined,
  code: string,
  extCode: string,
): string {
  if (meta?.productName) {
    return meta.variantName
      ? `${meta.productName} – ${meta.variantName}`
      : meta.productName;
  }
  return extCode || code || "Bez názvu";
}

/** Najde volné SKU: preferuje `base`, při kolizi přidá značku s externím ID. */
async function resolveUniqueSku(base: string, externalId: string): Promise<string> {
  const candidate = base.trim() || `FF-${externalId}`;
  const clash = await prisma.inventoryItem.findUnique({ where: { sku: candidate } });
  if (!clash) {
    return candidate;
  }
  return `${candidate} [FF ${externalId}]`;
}

async function recordJob(
  status: "completed" | "error",
  metadata: Record<string, unknown>,
  error?: string,
): Promise<void> {
  try {
    await prisma.processingJob.create({
      data: {
        type: JOB_TYPE,
        status,
        completedAt: new Date(),
        error: error ?? null,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    console.error("[fulfillment-sync] nelze zapsat ProcessingJob", e);
  }
}

/**
 * Stáhne aktuální skladové zásoby z Fulfillment.cz a promítne je do `InventoryItem`
 * (zdroj FULFILLMENT). Stav řídí Fulfillment.cz; změny stavu se evidují jako korekce.
 */
export async function runFulfillmentInventorySync(opts?: {
  userId?: string | null;
}): Promise<FulfillmentSyncResult> {
  const result: FulfillmentSyncResult = {
    ok: false,
    fetchedVariants: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    movementsRecorded: 0,
    skipped: 0,
  };

  const cfg = getFulfillmentEnv();
  if (!cfg.configured) {
    const error = "Chybí FULFILLMENT_API_TOKEN — nastav ho v prostředí.";
    return { ...result, error };
  }

  let products: FulfillmentProduct[];
  let warehouseVariants: Awaited<ReturnType<typeof fetchAllWarehouseVariants>>;
  try {
    [products, warehouseVariants] = await Promise.all([
      fetchAllProducts(cfg),
      fetchAllWarehouseVariants(cfg),
    ]);
  } catch (e) {
    const msg =
      e instanceof FulfillmentApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e);
    await recordJob("error", {}, msg);
    return { ...result, error: msg };
  }

  const metaByCode = buildVariantMetaByCode(products);
  result.ok = true;
  result.fetchedVariants = warehouseVariants.length;

  const userId = opts?.userId ?? null;

  for (const wv of warehouseVariants) {
    const externalId = String(wv.variant_id);
    const code = (wv.code ?? "").trim();
    const extCode = (wv.ext_code ?? "").trim();
    const meta = code ? metaByCode.get(code) : undefined;
    const name = displayName(meta, code, extCode);

    const quantity = new Prisma.Decimal(wv.quantity ?? 0);
    const availableQuantity =
      wv.available_quantity != null ? new Prisma.Decimal(wv.available_quantity) : null;
    const reservedQuantity =
      wv.reserved_quantity != null ? new Prisma.Decimal(wv.reserved_quantity) : null;
    const unitPrice =
      wv.price_per_unit != null
        ? new Prisma.Decimal(wv.price_per_unit)
        : meta?.priceRetail != null
          ? new Prisma.Decimal(meta.priceRetail)
          : meta?.pricePurchase != null
            ? new Prisma.Decimal(meta.pricePurchase)
            : null;

    try {
      const existing = await prisma.inventoryItem.findUnique({
        where: { source_externalId: { source: "FULFILLMENT", externalId } },
      });

      if (!existing) {
        // Preferujeme ext_code (kód e-shopu, např. PF6000-C10) — nese logiku balení a je čitelný.
        const preferredSku = extCode || code || `FF-${externalId}`;
        const sku = await resolveUniqueSku(preferredSku, externalId);
        const created = await prisma.inventoryItem.create({
          data: {
            sku,
            name,
            unit: "ks",
            quantity,
            availableQuantity,
            reservedQuantity,
            unitPrice,
            currency: "CZK",
            source: "FULFILLMENT",
            externalId,
            lastSyncedAt: new Date(),
            note: code && code !== sku ? `Fulfillment kód: ${code}` : null,
          },
        });
        result.created += 1;
        if (!quantity.isZero()) {
          await prisma.inventoryMovement.create({
            data: {
              itemId: created.id,
              type: "ADJUSTMENT",
              quantity,
              quantityAfter: quantity,
              note: "Synchronizace Fulfillment.cz (počáteční stav)",
              createdByUserId: userId,
            },
          });
          result.movementsRecorded += 1;
        }
      } else {
        const qtyChanged = !existing.quantity.equals(quantity);
        await prisma.inventoryItem.update({
          where: { id: existing.id },
          data: {
            name,
            quantity,
            availableQuantity,
            reservedQuantity,
            unitPrice,
            lastSyncedAt: new Date(),
            active: true,
          },
        });
        if (qtyChanged) {
          await prisma.inventoryMovement.create({
            data: {
              itemId: existing.id,
              type: "ADJUSTMENT",
              quantity,
              quantityAfter: quantity,
              note: "Synchronizace Fulfillment.cz",
              createdByUserId: userId,
            },
          });
          result.movementsRecorded += 1;
          result.updated += 1;
        } else {
          result.unchanged += 1;
        }
      }
    } catch (e) {
      console.error("[fulfillment-sync] položka selhala", externalId, e);
      result.skipped += 1;
    }
  }

  await recordJob("completed", {
    fetchedVariants: result.fetchedVariants,
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    movementsRecorded: result.movementsRecorded,
    skipped: result.skipped,
  });

  return result;
}
