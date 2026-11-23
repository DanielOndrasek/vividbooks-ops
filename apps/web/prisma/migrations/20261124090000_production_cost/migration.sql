-- Výrobní náklady skladu: průměrná nákupní cena za kus po základním SKU.
-- Migrace vytváří JEN schéma; ceny (data) se nahrávají mimo repozitář.

CREATE TABLE "ProductionCost" (
    "id" TEXT NOT NULL,
    "baseSku" TEXT NOT NULL,
    "unitCost" DECIMAL(12,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CZK',
    "qtyPurchased" INTEGER NOT NULL DEFAULT 0,
    "sourceInvoices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "method" TEXT NOT NULL DEFAULT 'manual',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByUserId" TEXT,
    CONSTRAINT "ProductionCost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductionCost_baseSku_key" ON "ProductionCost"("baseSku");

ALTER TABLE "ProductionCost" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "production_cost_block_anon" ON "ProductionCost";
DROP POLICY IF EXISTS "production_cost_block_authenticated" ON "ProductionCost";
CREATE POLICY "production_cost_block_anon" ON "ProductionCost" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "production_cost_block_authenticated" ON "ProductionCost" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Snímky: druhá hodnota (NULL = snímek vznikl před zavedením výrobních nákladů).
ALTER TABLE "InventoryValueSnapshot" ADD COLUMN "valueProductionCost" DECIMAL(16,2);
ALTER TABLE "InventoryValueSnapshot" ADD COLUMN "unpricedQuantity" DECIMAL(16,3);
ALTER TABLE "InventoryValueSnapshot" ADD COLUMN "quantityPieces" DECIMAL(16,3);
