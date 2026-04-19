-- NextAuth OAuth: tokeny nesmí být čitelné přes Supabase Data API (PostgREST).
-- Prisma používá připojení jako vlastník tabulky a RLS tím neblokuje.

ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_block_anon"
ON "Account"
AS PERMISSIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "account_block_authenticated"
ON "Account"
AS PERMISSIVE
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
