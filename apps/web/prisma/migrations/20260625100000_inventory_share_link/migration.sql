-- CreateTable
CREATE TABLE "InventoryShareLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryShareLink_token_key" ON "InventoryShareLink"("token");

-- CreateIndex
CREATE INDEX "InventoryShareLink_active_idx" ON "InventoryShareLink"("active");

-- RLS: aplikace používá Prisma jako vlastník objektů; přes Supabase Data API (anon/authenticated) žádný přístup.
ALTER TABLE "InventoryShareLink" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_share_link_block_anon" ON "InventoryShareLink";
DROP POLICY IF EXISTS "inventory_share_link_block_authenticated" ON "InventoryShareLink";
CREATE POLICY "inventory_share_link_block_anon" ON "InventoryShareLink" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "inventory_share_link_block_authenticated" ON "InventoryShareLink" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
