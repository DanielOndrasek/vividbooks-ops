-- CreateTable
CREATE TABLE "CommissionMonthSnapshot" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "computedByUserId" TEXT,
    "payload" JSONB NOT NULL,

    CONSTRAINT "CommissionMonthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesPersonMonthlyFixed" (
    "id" TEXT NOT NULL,
    "ownerLabel" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CZK',
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesPersonMonthlyFixed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionMonthSnapshot_year_month_key" ON "CommissionMonthSnapshot"("year", "month");

-- CreateIndex
CREATE INDEX "CommissionMonthSnapshot_year_idx" ON "CommissionMonthSnapshot"("year");

-- CreateIndex
CREATE INDEX "SalesPersonMonthlyFixed_active_idx" ON "SalesPersonMonthlyFixed"("active");

-- CreateIndex
CREATE INDEX "SalesPersonMonthlyFixed_ownerLabel_idx" ON "SalesPersonMonthlyFixed"("ownerLabel");

-- AddForeignKey
ALTER TABLE "CommissionMonthSnapshot" ADD CONSTRAINT "CommissionMonthSnapshot_computedByUserId_fkey" FOREIGN KEY ("computedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
