-- Měsíční snímky hodnoty skladu + oprava role Dana (VIEWER → ADMIN) + backfill z pohybů.

CREATE TABLE "InventoryValueSnapshot" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CZK',
    "valueTotal" DECIMAL(16,2) NOT NULL,
    "itemsCount" INTEGER NOT NULL,
    "quantityTotal" DECIMAL(16,3) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "final" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'job',
    CONSTRAINT "InventoryValueSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryValueSnapshot_month_currency_key" ON "InventoryValueSnapshot"("month", "currency");
CREATE INDEX "InventoryValueSnapshot_month_idx" ON "InventoryValueSnapshot"("month");

-- RLS jako ostatní tabulky: žádný přístup přes Data API (anon / authenticated).
ALTER TABLE "InventoryValueSnapshot" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_value_snapshot_block_anon" ON "InventoryValueSnapshot";
DROP POLICY IF EXISTS "inventory_value_snapshot_block_authenticated" ON "InventoryValueSnapshot";
CREATE POLICY "inventory_value_snapshot_block_anon" ON "InventoryValueSnapshot" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "inventory_value_snapshot_block_authenticated" ON "InventoryValueSnapshot" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Dan (jednatel) měl roli VIEWER → ADMIN (jediný řádek; audit níže).
UPDATE "User" SET "role" = 'ADMIN' WHERE lower("email") = 'dan@vividbooks.com' AND "role" <> 'ADMIN';
INSERT INTO "AuditLog" ("id", "entityType", "entityId", "action", "metadata")
SELECT 'mig_' || md5('role-dan-20261123'), 'User', u."id", 'role_changed',
       '{"from":"VIEWER","to":"ADMIN","reason":"migrace 20261123180000_inventory_value_snapshot"}'::jsonb
FROM "User" u WHERE lower(u."email") = 'dan@vividbooks.com'
ON CONFLICT DO NOTHING;

-- Backfill: stav na konci každého uzavřeného měsíce = quantityAfter posledního pohybu před hranicí
-- měsíce (Europe/Prague) × aktuální unitPrice (historie cen se neukládá → odhad, source='backfill').
INSERT INTO "InventoryValueSnapshot" ("id", "month", "currency", "valueTotal", "itemsCount", "quantityTotal", "computedAt", "final", "source")
WITH months AS (
  SELECT to_char(g, 'YYYY-MM') AS m,
         ((g + interval '1 month') AT TIME ZONE 'Europe/Prague') AT TIME ZONE 'UTC' AS cutoff
  FROM generate_series(
    date_trunc('month', (SELECT min("createdAt") FROM "InventoryMovement")),
    date_trunc('month', now() AT TIME ZONE 'Europe/Prague') - interval '1 month',
    interval '1 month') g
),
last_mov AS (
  SELECT DISTINCT ON (mo.m, mv."itemId") mo.m, mv."itemId", mv."quantityAfter"
  FROM months mo
  JOIN "InventoryMovement" mv ON mv."createdAt" < mo.cutoff
  ORDER BY mo.m, mv."itemId", mv."createdAt" DESC, mv."id" DESC
)
SELECT 'bf_' || md5(l.m || it."currency"), l.m, it."currency",
       round(sum(l."quantityAfter" * it."unitPrice"), 2),
       count(*) FILTER (WHERE l."quantityAfter" > 0)::int,
       coalesce(sum(l."quantityAfter") FILTER (WHERE l."quantityAfter" > 0), 0),
       now(), true, 'backfill'
FROM last_mov l
JOIN "InventoryItem" it ON it."id" = l."itemId" AND it."active" AND it."unitPrice" IS NOT NULL
GROUP BY l.m, it."currency"
ON CONFLICT ("month", "currency") DO NOTHING;
