-- RLS pro nové skladové tabulky (Supabase PostgREST / Data API).
-- Aplikace používá Prisma na serveru jako vlastník objektů → RLS API role neblokuje.
-- Politiky: žádný přístup pro anon / authenticated přes Data API.

ALTER TABLE "InventoryItem" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_item_block_anon" ON "InventoryItem";
DROP POLICY IF EXISTS "inventory_item_block_authenticated" ON "InventoryItem";
CREATE POLICY "inventory_item_block_anon" ON "InventoryItem" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "inventory_item_block_authenticated" ON "InventoryItem" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE "InventoryMovement" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_movement_block_anon" ON "InventoryMovement";
DROP POLICY IF EXISTS "inventory_movement_block_authenticated" ON "InventoryMovement";
CREATE POLICY "inventory_movement_block_anon" ON "InventoryMovement" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "inventory_movement_block_authenticated" ON "InventoryMovement" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
