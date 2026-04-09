-- Fixní odměny jsou vázané na kalendářní rok (zobrazení na /sales-controlling).
ALTER TABLE "SalesPersonMonthlyFixed" ADD COLUMN "year" INTEGER NOT NULL DEFAULT 2026;

CREATE INDEX "SalesPersonMonthlyFixed_year_idx" ON "SalesPersonMonthlyFixed"("year");
