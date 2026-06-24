-- CreateEnum
CREATE TYPE "InventorySource" AS ENUM ('MANUAL', 'FULFILLMENT');

-- AlterTable
ALTER TABLE "InventoryItem"
    ADD COLUMN "source" "InventorySource" NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN "externalId" TEXT,
    ADD COLUMN "availableQuantity" DECIMAL(14,3),
    ADD COLUMN "reservedQuantity" DECIMAL(14,3),
    ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_source_externalId_key" ON "InventoryItem"("source", "externalId");

-- CreateIndex
CREATE INDEX "InventoryItem_source_idx" ON "InventoryItem"("source");
