export type PohodaMserverConfig = {
  mserverUrl: string;
  ico: string;
  application: string;
  httpUser: string | null;
  httpPassword: string | null;
  invoiceAccountingIds: string | null;
  invoiceClassificationVatIds: string | null;
  defaultBankAccountIds: string | null;
};

export function getPohodaMserverConfig(): PohodaMserverConfig | null {
  const mserverUrl = process.env.POHODA_MSERVER_URL?.trim();
  const ico = process.env.POHODA_ICO?.replace(/\D/g, "") ?? "";
  if (!mserverUrl || !ico) {
    return null;
  }
  return {
    mserverUrl: mserverUrl.replace(/\/+$/, ""),
    ico,
    application: process.env.POHODA_APPLICATION?.trim() || "CommissionCalc",
    httpUser: process.env.POHODA_MSERVER_USER?.trim() || null,
    httpPassword: process.env.POHODA_MSERVER_PASSWORD?.trim() || null,
    invoiceAccountingIds: process.env.POHODA_INVOICE_ACCOUNTING_IDS?.trim() || null,
    invoiceClassificationVatIds:
      process.env.POHODA_INVOICE_CLASSIFICATION_VAT_IDS?.trim() || null,
    defaultBankAccountIds: process.env.POHODA_DEFAULT_BANK_ACCOUNT_IDS?.trim() || null,
  };
}
