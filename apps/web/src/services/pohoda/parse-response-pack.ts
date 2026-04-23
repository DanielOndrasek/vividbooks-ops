export type PohodaResponseParse = {
  ok: boolean;
  stateText: string | null;
  errorMessages: string[];
  documentIds: string[];
};

/**
 * Best-effort parsování ResponsePack z mServeru (bez závislosti na XML parseru).
 */
export function parsePohodaResponsePack(xml: string): PohodaResponseParse {
  const errorMessages: string[] = [];
  const documentIds: string[] = [];

  const stateMatch =
    xml.match(/<[^:>\s]*:state\b[^>]*>([^<]*)</i) ||
    xml.match(/<state\b[^>]*>([^<]*)</i);
  const stateText = stateMatch?.[1]?.trim() ?? null;
  const ok = stateText != null && stateText.toLowerCase() === "ok";

  const noteRe = /<[^:>\s]*:note\b[^>]*>([^<]*)</gi;
  let nm: RegExpExecArray | null;
  while ((nm = noteRe.exec(xml)) !== null) {
    const t = nm[1]?.trim();
    if (t) {
      errorMessages.push(t);
    }
  }

  const idRe =
    /<[^:>\s]*:document\b[^>]*\bid="([^"]+)"/gi;
  let im: RegExpExecArray | null;
  while ((im = idRe.exec(xml)) !== null) {
    if (im[1]) {
      documentIds.push(im[1]);
    }
  }

  return { ok, stateText, errorMessages, documentIds };
}
