import { z } from "zod";

/** Klasifikace: faktura k úhradě vs. doklad o přijaté platbě vs. neznámé. */
export const ClassificationSchema = z.object({
  type: z.enum(["INVOICE", "PAYMENT_RECEIPT", "UNKNOWN"]),
  confidence: z.number().min(0).max(1),
});

export type ClassificationResult = z.infer<typeof ClassificationSchema>;

/** Extrahovaná pole z faktury / podobného dokladu (ČR/EUR). */
export const ExtractionSchema = z.object({
  supplierName: z.string().nullable(),
  supplierICO: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  amountWithVat: z.number().finite().nullable(),
  amountWithoutVat: z.number().finite().nullable(),
  vatAmount: z.number().finite().nullable(),
  vatRate: z.number().finite().nullable(),
  currency: z.string().nullable(),
  issueDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  variableSymbol: z.string().nullable(),
  bankAccount: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type ExtractionResult = z.infer<typeof ExtractionSchema>;
