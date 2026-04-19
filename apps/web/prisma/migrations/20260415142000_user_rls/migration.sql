-- Uživatelé (NextAuth): PII a role nesmí být čitelné přes Supabase Data API.
-- Aplikace používá Prisma na serveru; vlastník tabulky RLS obchází.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_block_anon"
ON "User"
AS PERMISSIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "user_block_authenticated"
ON "User"
AS PERMISSIVE
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
