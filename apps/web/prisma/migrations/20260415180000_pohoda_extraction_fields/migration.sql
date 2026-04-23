-- CreateEnum
CREATE TYPE "PohodaExportStatus" AS ENUM ('NONE', 'PENDING', 'EXPORTED', 'FAILED');

-- AlterTable Invoice
ALTER TABLE "Invoice" ADD COLUMN "supplierDIC" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "supplierStreet" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "supplierCity" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "supplierZip" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "supplierCountry" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "variableSymbol" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "constantSymbol" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "specificSymbol" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "vatAmount" DECIMAL(12, 2);
ALTER TABLE "Invoice" ADD COLUMN "vatRate" DECIMAL(5, 2);
ALTER TABLE "Invoice" ADD COLUMN "bankAccount" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "iban" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "domesticAccount" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "bic" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "documentKind" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "invoiceLines" JSONB;
ALTER TABLE "Invoice" ADD COLUMN "missingStructuredLines" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN "pohodaExportStatus" "PohodaExportStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Invoice" ADD COLUMN "pohodaExportedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "pohodaExternalId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "pohodaExportLastError" TEXT;

CREATE INDEX "Invoice_pohodaExportStatus_idx" ON "Invoice"("pohodaExportStatus");

-- AlterTable PaymentProof
ALTER TABLE "PaymentProof" ADD COLUMN "paymentDate" TIMESTAMP(3);
ALTER TABLE "PaymentProof" ADD COLUMN "amount" DECIMAL(12, 2);
ALTER TABLE "PaymentProof" ADD COLUMN "currency" TEXT DEFAULT 'CZK';
ALTER TABLE "PaymentProof" ADD COLUMN "counterpartyName" TEXT;
ALTER TABLE "PaymentProof" ADD COLUMN "counterpartyICO" TEXT;
ALTER TABLE "PaymentProof" ADD COLUMN "variableSymbol" TEXT;
ALTER TABLE "PaymentProof" ADD COLUMN "constantSymbol" TEXT;
ALTER TABLE "PaymentProof" ADD COLUMN "specificSymbol" TEXT;
ALTER TABLE "PaymentProof" ADD COLUMN "bankMessage" TEXT;
ALTER TABLE "PaymentProof" ADD COLUMN "bankAccountNo" TEXT;
ALTER TABLE "PaymentProof" ADD COLUMN "bankCode" TEXT;
ALTER TABLE "PaymentProof" ADD COLUMN "pohodaExportStatus" "PohodaExportStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "PaymentProof" ADD COLUMN "pohodaExportedAt" TIMESTAMP(3);
ALTER TABLE "PaymentProof" ADD COLUMN "pohodaExternalId" TEXT;
ALTER TABLE "PaymentProof" ADD COLUMN "pohodaExportLastError" TEXT;

CREATE INDEX "PaymentProof_pohodaExportStatus_idx" ON "PaymentProof"("pohodaExportStatus");
