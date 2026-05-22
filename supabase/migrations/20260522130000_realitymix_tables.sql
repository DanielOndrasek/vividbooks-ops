-- Tabulky pro statistiky a poptávky stahované z RealityMIX XML-RPC API.
-- Zápis provádí Supabase Edge Function `realitymix-sync` přes service role,
-- která RLS bypassuje. Pro anon / authenticated klienty (Data API, postgrest)
-- je přístup explicitně blokován – stejně jako pro Prisma-vlastněné tabulky
-- ve [supabase/migrations/20260420120000_all_public_tables_rls.sql].
--
-- Pojmenování snake_case (mimo Prisma schema) je záměrné: tyto tabulky
-- nejsou součástí Next.js / Auth.js datového modelu, nemají Prisma model
-- a vlastní je výhradně sync Edge Function.

-- ---------------------------------------------------------------------------
-- realitymix_listing_stats: denní snapshoty statistik z `listStats`
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."realitymix_listing_stats" (
    "advert_id"     text        NOT NULL,
    "stat_date"     date        NOT NULL,
    "list_views"    integer     NOT NULL DEFAULT 0,
    "detail_views"  integer     NOT NULL DEFAULT 0,
    "contact_views" integer     NOT NULL DEFAULT 0,
    "inquiries"     integer     NOT NULL DEFAULT 0,
    "raw"           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    "fetched_at"    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "realitymix_listing_stats_pkey" PRIMARY KEY ("advert_id", "stat_date")
);

CREATE INDEX IF NOT EXISTS "realitymix_listing_stats_stat_date_idx"
    ON "public"."realitymix_listing_stats" ("stat_date" DESC);

COMMENT ON TABLE "public"."realitymix_listing_stats" IS
    'Denní statistiky inzerátů z RealityMIX (XML-RPC listStats). Plní Edge Function realitymix-sync.';

ALTER TABLE "public"."realitymix_listing_stats" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "realitymix_listing_stats_block_anon"          ON "public"."realitymix_listing_stats";
DROP POLICY IF EXISTS "realitymix_listing_stats_block_authenticated" ON "public"."realitymix_listing_stats";
CREATE POLICY "realitymix_listing_stats_block_anon"
    ON "public"."realitymix_listing_stats" AS PERMISSIVE FOR ALL TO anon
    USING (false) WITH CHECK (false);
CREATE POLICY "realitymix_listing_stats_block_authenticated"
    ON "public"."realitymix_listing_stats" AS PERMISSIVE FOR ALL TO authenticated
    USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- realitymix_inquiries: poptávky / reakce z `listInquiry` / `listFullInquiry`
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."realitymix_inquiries" (
    "inquiry_id"   text        PRIMARY KEY,
    "advert_id"    text,
    "created_at"   timestamptz,
    "email"        text,
    "phone"        text,
    "name"         text,
    "message"      text,
    "has_detail"   boolean     NOT NULL DEFAULT false,
    "raw"          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    "fetched_at"   timestamptz NOT NULL DEFAULT now(),
    "updated_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "realitymix_inquiries_advert_id_idx"
    ON "public"."realitymix_inquiries" ("advert_id");
CREATE INDEX IF NOT EXISTS "realitymix_inquiries_created_at_idx"
    ON "public"."realitymix_inquiries" ("created_at" DESC);

COMMENT ON TABLE "public"."realitymix_inquiries" IS
    'Poptávky / reakce z RealityMIX (XML-RPC listInquiry / listFullInquiry). Plní Edge Function realitymix-sync, idempotentní upsert dle inquiry_id.';
COMMENT ON COLUMN "public"."realitymix_inquiries"."has_detail" IS
    'TRUE pokud byl řádek aktualizovaný z listFullInquiry / getInquiry a obsahuje vlastní zprávu.';

ALTER TABLE "public"."realitymix_inquiries" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "realitymix_inquiries_block_anon"          ON "public"."realitymix_inquiries";
DROP POLICY IF EXISTS "realitymix_inquiries_block_authenticated" ON "public"."realitymix_inquiries";
CREATE POLICY "realitymix_inquiries_block_anon"
    ON "public"."realitymix_inquiries" AS PERMISSIVE FOR ALL TO anon
    USING (false) WITH CHECK (false);
CREATE POLICY "realitymix_inquiries_block_authenticated"
    ON "public"."realitymix_inquiries" AS PERMISSIVE FOR ALL TO authenticated
    USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Trigger pro `updated_at` u realitymix_inquiries
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."realitymix_inquiries_set_updated_at"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW."updated_at" := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "realitymix_inquiries_set_updated_at" ON "public"."realitymix_inquiries";
CREATE TRIGGER "realitymix_inquiries_set_updated_at"
    BEFORE UPDATE ON "public"."realitymix_inquiries"
    FOR EACH ROW EXECUTE FUNCTION "public"."realitymix_inquiries_set_updated_at"();
