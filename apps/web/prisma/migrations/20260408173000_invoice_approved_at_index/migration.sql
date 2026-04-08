-- Index pro denní mazání schválených faktur podle stáří (approvedAt).
CREATE INDEX "Invoice_approvedAt_idx" ON "Invoice"("approvedAt");
