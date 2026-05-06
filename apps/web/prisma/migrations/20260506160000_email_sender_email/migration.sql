-- AlterTable
ALTER TABLE "Email" ADD COLUMN "senderEmail" TEXT;

-- CreateIndex
CREATE INDEX "Email_senderEmail_idx" ON "Email"("senderEmail");
