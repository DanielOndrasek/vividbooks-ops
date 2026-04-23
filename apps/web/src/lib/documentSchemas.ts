import { z } from "zod";

/** Klasifikace: faktura k úhradě vs. doklad o přijaté platbě vs. neznámé. */
export const ClassificationSchema = z.object({
  type: z.enum(["INVOICE", "PAYMENT_RECEIPT", "UNKNOWN"]),
  confidence: z.number().min(0).max(1),
});

export type ClassificationResult = z.infer<typeof ClassificationSchema>;

export const SupplierAddressSchema = z.object({
  street: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
});

export type SupplierAddressResult = z.infer<typeof SupplierAddressSchema>;

export const InvoiceLineSchema = z.object({
  text: z.string().nullable(),
  quantity: z.number().finite().nullable(),
  unit: z.string().nullable(),
  unitPriceWithoutVat: z.number().finite().nullable(),
  vatRate: z.number().finite().nullable(),
  lineTotalWithoutVat: z.number().finite().nullable(),
  lineTotalWithVat: z.number().finite().nullable(),
});

export type InvoiceLineResult = z.infer<typeof InvoiceLineSchema>;

/** Extrahovaná pole z faktury / podobného dokladu (ČR/EUR). */
export const ExtractionSchema = z.object({
  supplierName: z.string().nullable(),
  supplierICO: z.string().nullable(),
  supplierDIC: z.string().nullable(),
  supplierAddress: z
    .preprocess(
      (v) => (v != null && typeof v === "object" && !Array.isArray(v) ? v : null),
      SupplierAddressSchema.nullable(),
    ),
  invoiceNumber: z.string().nullable(),
  amountWithVat: z.number().finite().nullable(),
  amountWithoutVat: z.number().finite().nullable(),
  vatAmount: z.number().finite().nullable(),
  vatRate: z.number().finite().nullable(),
  currency: z.string().nullable(),
  issueDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  variableSymbol: z.string().nullable(),
  constantSymbol: z.string().nullable(),
  specificSymbol: z.string().nullable(),
  bankAccount: z.string().nullable(),
  iban: z.string().nullable(),
  domesticAccount: z.string().nullable(),
  domesticAccountNumber: z.string().nullable(),
  domesticBankCode: z.string().nullable(),
  bic: z.string().nullable(),
  /** Např. STANDARD_INVOICE, PROFORMA, CREDIT_NOTE, ADVANCE */
  documentKind: z.string().nullable(),
  invoiceLines: z.preprocess(
    (v) => (Array.isArray(v) ? v : null),
    z.array(InvoiceLineSchema).nullable(),
  ),
  /** U dokladu o platbě: datum platby / zaúčtování. */
  paymentDate: z.string().nullable(),
  bankMessage: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type ExtractionResult = z.infer<typeof ExtractionSchema>;
