import { maskSecret } from "@/lib/integrations/env";

export type PohodaEnvStatus = {
  /** Minimální sada pro odeslání XML na mServer (faktury). */
  invoiceExportConfigured: boolean;
  /** Navíc účet v Pohodě pro import pohybů do Banky. */
  bankImportConfigured: boolean;
  missingForInvoice: string[];
  missingForBankImport: string[];
  mserverUrl: string;
  ico: string;
  application: string;
  httpUser: string;
  httpPasswordMasked: string;
  invoiceAccountingIds: string;
  invoiceClassificationVatIds: string;
  defaultBankAccountIds: string;
};

/**
 * Přehled proměnných prostředí pro export do POHODY (stejná logika jako v runtime).
 */
export function getPohodaEnvStatus(): PohodaEnvStatus {
  const mserverUrl = process.env.POHODA_MSERVER_URL?.trim() ?? "";
  const icoRaw = process.env.POHODA_ICO?.trim() ?? "";
  const ico = icoRaw.replace(/\D/g, "");
  const application =
    process.env.POHODA_APPLICATION?.trim() || "CommissionCalc";
  const httpUser = process.env.POHODA_MSERVER_USER?.trim() ?? "";
  const httpPassword = process.env.POHODA_MSERVER_PASSWORD?.trim() ?? "";
  const invoiceAccountingIds =
    process.env.POHODA_INVOICE_ACCOUNTING_IDS?.trim() ?? "";
  const invoiceClassificationVatIds =
    process.env.POHODA_INVOICE_CLASSIFICATION_VAT_IDS?.trim() ?? "";
  const defaultBankAccountIds =
    process.env.POHODA_DEFAULT_BANK_ACCOUNT_IDS?.trim() ?? "";

  const missingForInvoice: string[] = [];
  if (!mserverUrl) {
    missingForInvoice.push("POHODA_MSERVER_URL");
  }
  if (!ico) {
    missingForInvoice.push("POHODA_ICO");
  }

  const invoiceExportConfigured = missingForInvoice.length === 0;

  const missingForBankImport: string[] = [];
  if (!mserverUrl) {
    missingForBankImport.push("POHODA_MSERVER_URL");
  }
  if (!ico) {
    missingForBankImport.push("POHODA_ICO");
  }
  if (!defaultBankAccountIds) {
    missingForBankImport.push("POHODA_DEFAULT_BANK_ACCOUNT_IDS");
  }

  const bankImportConfigured = missingForBankImport.length === 0;

  return {
    invoiceExportConfigured,
    bankImportConfigured,
    missingForInvoice,
    missingForBankImport: bankImportConfigured ? [] : missingForBankImport,
    mserverUrl: mserverUrl || "(prázdné)",
    ico: ico || "(prázdné)",
    application,
    httpUser: httpUser || "(prázdné)",
    httpPasswordMasked: httpPassword ? maskSecret(httpPassword) : "(prázdné)",
    invoiceAccountingIds: invoiceAccountingIds || "(prázdné)",
    invoiceClassificationVatIds:
      invoiceClassificationVatIds || "(prázdné)",
    defaultBankAccountIds: defaultBankAccountIds || "(prázdné)",
  };
}
