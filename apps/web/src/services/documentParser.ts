/**
 * Claude Vision: klasifikace dokumentu a extrakce polí (Fáze 2).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";

import {
  ClassificationSchema,
  type ClassificationResult,
  ExtractionSchema,
  type ExtractionResult,
} from "@/lib/documentSchemas";

function getAnthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new Error("Chybí ANTHROPIC_API_KEY.");
  }
  return new Anthropic({ apiKey: key });
}

export function getAnthropicModelId(): string {
  // claude-sonnet-4-20250514 byl 15. 6. 2026 vyřazen z API (404) — doporučená náhrada je claude-sonnet-4-6.
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
}

function guessMediaType(filename: string): string {
  const f = filename.toLowerCase();
  if (f.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (f.endsWith(".png")) {
    return "image/png";
  }
  if (f.endsWith(".jpg") || f.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return "application/octet-stream";
}

export function resolveMediaType(attachmentName: string): string {
  return guessMediaType(attachmentName);
}

function buildFileBlocks(buffer: Buffer, mediaType: string): ContentBlockParam[] {
  const b64 = buffer.toString("base64");
  if (mediaType === "application/pdf") {
    return [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: b64,
        },
      },
    ];
  }
  if (mediaType === "image/png" || mediaType === "image/jpeg") {
    return [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType === "image/jpeg" ? "image/jpeg" : "image/png",
          data: b64,
        },
      },
    ];
  }
  throw new Error(`Nepodporovaný typ souboru pro AI: ${mediaType}`);
}

function extractJsonObjectFromText(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1]!.trim() : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("V odpovědi modelu nebyl nalezen JSON objekt.");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

async function completeWithVision(
  buffer: Buffer,
  mediaType: string,
  userText: string,
  maxTokens: number,
): Promise<string> {
  const client = getAnthropicClient();
  const blocks: ContentBlockParam[] = [
    ...buildFileBlocks(buffer, mediaType),
    { type: "text", text: userText },
  ];

  const res = await client.messages.create({
    model: getAnthropicModelId(),
    max_tokens: maxTokens,
    messages: [{ role: "user", content: blocks }],
  });

  const parts = res.content.filter((b) => b.type === "text") as Array<{
    type: "text";
    text: string;
  }>;
  const text = parts.map((p) => p.text).join("\n");
  if (!text.trim()) {
    throw new Error("Claude nevrátil žádný text.");
  }
  return text;
}

const CLASSIFY_PROMPT = `Analyzuj přiložený doklad. Jsme firma Vividbooks s.r.o. (IČO 08637351) a tyto doklady jsou naše NÁKUPY / VÝDAJE.

Rozhodni, do které evidence doklad patří:
- INVOICE = faktura, kterou teprve musíme ZAPLATIT převodem: má datum splatnosti, číslo účtu / IBAN dodavatele, často variabilní symbol, a NENÍ na ní uvedeno, že je zaplacená. Typicky české faktury od dodavatelů, freelancerů, Fulfillmentu, PPL, O2.
- PAYMENT_RECEIPT = doklad o platbě, kterou jsme UŽ ZAPLATILI (kartou, online, předplatné): receipt, účtenka, „Paid“, „Amount paid“, „Payment method: Visa/Mastercard“, „Uhrazeno kartou“, „Zaplaceno“, nulová částka k úhradě, Stripe receipt, faktura e-shopu zaplacená předem (Alza), měsíční předplatné SaaS (Anthropic, Vercel, GitHub, Supabase, Zapier, Pipedrive, Sentry, Fly.io, Twilio…) s uvedenou platbou kartou. Patří sem i dobropis / refund / credit note k platbě kartou.
- UNKNOWN = nejde o účetní doklad (smlouva, obchodní podmínky, objednávka bez ceny, logo, upomínka bez dokladu, jiný typ).

Když je na dokumentu „Invoice“, ale zároveň je jasně vidět, že je zaplacená (Paid, Amount paid, platba kartou), zvol PAYMENT_RECEIPT.

Vrať POUZE platný JSON bez markdownu:
{"type":"INVOICE"|"PAYMENT_RECEIPT"|"UNKNOWN","confidence":0.0-1.0}

confidence = tvoje jistota klasifikace (0–1).`;

const EXTRACT_PROMPT = `Z přiloženého dokumentu extrahuj údaje pro účetní evidenci (Česká republika / EUR).

Vrať POUZE platný JSON bez markdownu s těmito klíči (použij null pokud nelze spolehlivě určit):
{
  "supplierName": string | null,
  "supplierICO": string | null,
  "supplierDIC": string | null,
  "supplierAddress": { "street": string | null, "city": string | null, "zip": string | null, "country": string | null } | null,
  "invoiceNumber": string | null,
  "amountWithVat": number | null,
  "amountWithoutVat": number | null,
  "vatAmount": number | null,
  "vatRate": number | null,
  "currency": string | null,
  "issueDate": string | null,
  "dueDate": string | null,
  "variableSymbol": string | null,
  "constantSymbol": string | null,
  "specificSymbol": string | null,
  "bankAccount": string | null,
  "iban": string | null,
  "domesticAccount": string | null,
  "domesticAccountNumber": string | null,
  "domesticBankCode": string | null,
  "bic": string | null,
  "documentKind": string | null,
  "invoiceLines": [ { "text": string | null, "quantity": number | null, "unit": string | null, "unitPriceWithoutVat": number | null, "vatRate": number | null, "lineTotalWithoutVat": number | null, "lineTotalWithVat": number | null } ] | null,
  "paymentDate": string | null,
  "bankMessage": string | null,
  "confidence": number
}

Pravidla:
- Částky jako čísla (např. 12345.67), bez mezer a měny v čísle.
- currency: ISO kód (CZK, EUR, …), výchozí CZK pokud je zjevné.
- issueDate, dueDate, paymentDate: ISO 8601 datum (YYYY-MM-DD) pokud jde; jinak null.
- IČO a čísla symbolů jen číslice, bez mezer. DIČ včetně předpony státu (např. CZ12345678).
- documentKind: např. STANDARD_INVOICE, PROFORMA, CREDIT_NOTE, ADVANCE pokud to z dokladu plyne, jinak null.
- invoiceLines: pole řádků faktury; pokud jsou jen souhrnné částky bez řádků, vrať null nebo prázdné pole.
- U platebního příkazu / výpisu: domesticAccountNumber = číslo účtu protistrany (bez kódu banky), domesticBankCode = čtyřmístný kód banky.
- bankMessage = text zprávy pro příjemce / poznámka k platbě.
- confidence: 0–1, celková jistota extrakce.`;

export async function classifyDocument(
  fileBuffer: Buffer,
  mediaType: string,
): Promise<ClassificationResult> {
  const text = await completeWithVision(fileBuffer, mediaType, CLASSIFY_PROMPT, 512);
  const json = extractJsonObjectFromText(text);
  return ClassificationSchema.parse(json);
}

export async function extractInvoiceData(
  fileBuffer: Buffer,
  mediaType: string,
  docKind: "INVOICE" | "PAYMENT_RECEIPT",
): Promise<ExtractionResult> {
  const hint =
    docKind === "PAYMENT_RECEIPT"
      ? "Jde o doklad o platbě, kterou jsme už zaplatili (účtenka / receipt / zaplacená faktura) — supplierName a supplierICO/DIČ = obchodník, kterému jsme platili; invoiceNumber = číslo faktury nebo dokladu, ke kterému se platba vztahuje (u Stripe účtenky číslo faktury „Invoice number“, ne číslo účtenky; když chybí, číslo účtenky); částku platby do amountWithVat (u dobropisu / refundu záporně); paymentDate; documentKind = RECEIPT, nebo CREDIT_NOTE / REFUND; VS/KS/SS pokud jsou; bankMessage z textu platby. invoiceLines nech null."
      : "Jde o fakturu k úhradě — vyplň dodavatele, DIČ, adresu pokud je v tisku, symboly, účet (iban/domesticAccount), řádky faktury pokud jsou uvedeny.";
  const text = await completeWithVision(
    fileBuffer,
    mediaType,
    `${EXTRACT_PROMPT}\n\n${hint}`,
    4096,
  );
  const json = extractJsonObjectFromText(text);
  return ExtractionSchema.parse(json);
}
