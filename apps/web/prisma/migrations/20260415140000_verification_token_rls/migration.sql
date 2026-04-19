-- NextAuth: sloupec "token" nesmí být čitelný přes Supabase Data API (PostgREST).
-- Prisma používá připojení jako vlastník tabulky a RLS tím neblokuje.

ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verification_token_block_anon"
ON "VerificationToken"
AS PERMISSIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "verification_token_block_authenticated"
ON "VerificationToken"
AS PERMISSIVE
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
