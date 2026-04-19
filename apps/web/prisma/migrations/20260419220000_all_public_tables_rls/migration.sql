-- Kompletní RLS pro tabulky v public (Supabase PostgREST).
-- Aplikace používá Prisma na serveru jako vlastník objektů → RLS API role neblokuje.
-- Politiky: žádný přístup pro anon / authenticated přes Data API.

-- _prisma_migrations (historie Prisma; přes API čitelná být nemá)
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prisma_migrations_block_anon" ON "_prisma_migrations";
DROP POLICY IF EXISTS "prisma_migrations_block_authenticated" ON "_prisma_migrations";
CREATE POLICY "prisma_migrations_block_anon" ON "_prisma_migrations" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "prisma_migrations_block_authenticated" ON "_prisma_migrations" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account_block_anon" ON "Account";
DROP POLICY IF EXISTS "account_block_authenticated" ON "Account";
CREATE POLICY "account_block_anon" ON "Account" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "account_block_authenticated" ON "Account" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_log_block_anon" ON "AuditLog";
DROP POLICY IF EXISTS "audit_log_block_authenticated" ON "AuditLog";
CREATE POLICY "audit_log_block_anon" ON "AuditLog" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "audit_log_block_authenticated" ON "AuditLog" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE "CommissionMonthSnapshot" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "commission_month_snapshot_block_anon" ON "CommissionMonthSnapshot";
DROP POLICY IF EXISTS "commission_month_snapshot_block_authenticated" ON "CommissionMonthSnapshot";
CREATE POLICY "commission_month_snapshot_block_anon" ON "CommissionMonthSnapshot" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "commission_month_snapshot_block_authenticated" ON "CommissionMonthSnapshot" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "document_block_anon" ON "Document";
DROP POLICY IF EXISTS "document_block_authenticated" ON "Document";
CREATE POLICY "document_block_anon" ON "Document" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "document_block_authenticated" ON "Document" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE "Email" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_block_anon" ON "Email";
DROP POLICY IF EXISTS "email_block_authenticated" ON "Email";
CREATE POLICY "email_block_anon" ON "Email" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "email_block_authenticated" ON "Email" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoice_block_anon" ON "Invoice";
DROP POLICY IF EXISTS "invoice_block_authenticated" ON "Invoice";
CREATE POLICY "invoice_block_anon" ON "Invoice" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "invoice_block_authenticated" ON "Invoice" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE "PaymentProof" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_proof_block_anon" ON "PaymentProof";
DROP POLICY IF EXISTS "payment_proof_block_authenticated" ON "PaymentProof";
CREATE POLICY "payment_proof_block_anon" ON "PaymentProof" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "payment_proof_block_authenticated" ON "PaymentProof" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE "ProcessingJob" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "processing_job_block_anon" ON "ProcessingJob";
DROP POLICY IF EXISTS "processing_job_block_authenticated" ON "ProcessingJob";
CREATE POLICY "processing_job_block_anon" ON "ProcessingJob" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "processing_job_block_authenticated" ON "ProcessingJob" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE "SalesPersonMonthlyFixed" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales_person_monthly_fixed_block_anon" ON "SalesPersonMonthlyFixed";
DROP POLICY IF EXISTS "sales_person_monthly_fixed_block_authenticated" ON "SalesPersonMonthlyFixed";
CREATE POLICY "sales_person_monthly_fixed_block_anon" ON "SalesPersonMonthlyFixed" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "sales_person_monthly_fixed_block_authenticated" ON "SalesPersonMonthlyFixed" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "session_block_anon" ON "Session";
DROP POLICY IF EXISTS "session_block_authenticated" ON "Session";
CREATE POLICY "session_block_anon" ON "Session" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "session_block_authenticated" ON "Session" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_block_anon" ON "User";
DROP POLICY IF EXISTS "user_block_authenticated" ON "User";
CREATE POLICY "user_block_anon" ON "User" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "user_block_authenticated" ON "User" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "verification_token_block_anon" ON "VerificationToken";
DROP POLICY IF EXISTS "verification_token_block_authenticated" ON "VerificationToken";
CREATE POLICY "verification_token_block_anon" ON "VerificationToken" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "verification_token_block_authenticated" ON "VerificationToken" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
