-- Duplicity dokladů + týdenní dávky pro účetní.

ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'DUPLICATE';

ALTER TABLE "Document" ADD COLUMN "dedupKey" TEXT;
ALTER TABLE "Document" ADD COLUMN "duplicateOfDocumentId" TEXT;
CREATE INDEX "Document_dedupKey_idx" ON "Document"("dedupKey");

ALTER TABLE "PaymentProof" ADD COLUMN "documentNumber" TEXT;

CREATE TABLE "AccountingBatch" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "invoicesFolderId" TEXT,
    "invoicesFolderUrl" TEXT,
    "paymentsFolderId" TEXT,
    "paymentsFolderUrl" TEXT,
    "invoiceCount" INTEGER NOT NULL DEFAULT 0,
    "paymentCount" INTEGER NOT NULL DEFAULT 0,
    "sharedWith" TEXT,
    "shareError" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "sentTo" TEXT,
    CONSTRAINT "AccountingBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountingBatch_createdAt_idx" ON "AccountingBatch"("createdAt");
CREATE UNIQUE INDEX "AccountingBatch_label_key" ON "AccountingBatch"("label");

ALTER TABLE "Invoice" ADD COLUMN "accountingBatchId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "accountingFileName" TEXT;
ALTER TABLE "PaymentProof" ADD COLUMN "accountingBatchId" TEXT;
ALTER TABLE "PaymentProof" ADD COLUMN "accountingFileName" TEXT;
CREATE INDEX "Invoice_accountingBatchId_idx" ON "Invoice"("accountingBatchId");
CREATE INDEX "PaymentProof_accountingBatchId_idx" ON "PaymentProof"("accountingBatchId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_accountingBatchId_fkey" FOREIGN KEY ("accountingBatchId") REFERENCES "AccountingBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_accountingBatchId_fkey" FOREIGN KEY ("accountingBatchId") REFERENCES "AccountingBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DocumentFingerprint" (
    "id" TEXT NOT NULL,
    "contentHash" TEXT,
    "dedupKey" TEXT,
    "documentType" "DocumentType" NOT NULL,
    "outcome" TEXT NOT NULL,
    "documentId" TEXT,
    "supplierName" TEXT,
    "documentNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentFingerprint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentFingerprint_contentHash_key" ON "DocumentFingerprint"("contentHash");
CREATE INDEX "DocumentFingerprint_dedupKey_idx" ON "DocumentFingerprint"("dedupKey");
CREATE INDEX "DocumentFingerprint_documentId_idx" ON "DocumentFingerprint"("documentId");

-- Stejná ochrana jako ostatní veřejné tabulky (PostgREST nemá k datům přístup).
ALTER TABLE "AccountingBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentFingerprint" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "accounting_batch_block_anon" ON "AccountingBatch";
DROP POLICY IF EXISTS "accounting_batch_block_authenticated" ON "AccountingBatch";
CREATE POLICY "accounting_batch_block_anon" ON "AccountingBatch" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "accounting_batch_block_authenticated" ON "AccountingBatch" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "document_fingerprint_block_anon" ON "DocumentFingerprint";
DROP POLICY IF EXISTS "document_fingerprint_block_authenticated" ON "DocumentFingerprint";
CREATE POLICY "document_fingerprint_block_anon" ON "DocumentFingerprint" AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "document_fingerprint_block_authenticated" ON "DocumentFingerprint" AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
