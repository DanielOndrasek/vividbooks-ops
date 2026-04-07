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
  return (
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-sonnet-4-20250514"
  );
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

const CLASSIFY_PROMPT = `Analyzuj přiložený dokument (faktura, zálohová faktura, doklad o přijaté platbě, potvrzení platby apod.).

Rozhodni:
- INVOICE = faktura nebo jiný doklad k úhradě dodavateli (má splatnost, částka k zaplacení).
- PAYMENT_RECEIPT = doklad o tom, že nám někdo zaplatil (příchozí platba, potvrzení z banky, uznání závazku přijaté platby).
- UNKNOWN = nelze spolehlivě zařadit (smlouva, obecný sken, jiný typ).

Vrať POUZE platný JSON bez markdownu:
{"type":"INVOICE"|"PAYMENT_RECEIPT"|"UNKNOWN","confidence":0.0-1.0}

confidence = tvoje jistota klasifikace (0–1).`;

const EXTRACT_PROMPT = `Z přiloženého dokumentu extrahuj údaje pro účetní evidenci (Česká republika / EUR).

Vrať POUZE platný JSON bez markdownu s těmito klíči (použij null pokud nelze spolehlivě určit):
{
  "supplierName": string | null,
  "supplierICO": string | null,
  "invoiceNumber": string | null,
  "amountWithVat": number | null,
  "amountWithoutVat": number | null,
  "vatAmount": number | null,
  "vatRate": number | null,
  "currency": string | null,
  "issueDate": string | null,
  "dueDate": string | null,
  "variableSymbol": string | null,
  "bankAccount": string | null,
  "confidence": number
}

Pravidla:
- Částky jako čísla (např. 12345.67), bez mezer a měny v čísle.
- currency: ISO kód (CZK, EUR, …), výchozí CZK pokud je zjevné.
- issueDate, dueDate: ISO 8601 datum (YYYY-MM-DD) pokud jde; jinak null.
- IČO jen číslice, bez mezer.
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
      ? "Jde o doklad o přijaté platbě — extrahuj plátce jako supplierName/supplierICO pokud jde, částku platby do amountWithVat."
      : "Jde o fakturu k úhradě — standardní pole dodavatele a splatnosti.";
  const text = await completeWithVision(
    fileBuffer,
    mediaType,
    `${EXTRACT_PROMPT}\n\n${hint}`,
    4096,
  );
  const json = extractJsonObjectFromText(text);
  return ExtractionSchema.parse(json);
}
