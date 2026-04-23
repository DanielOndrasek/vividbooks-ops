import { parsePohodaResponsePack } from "@/services/pohoda/parse-response-pack";
import type { PohodaMserverConfig } from "@/services/pohoda/env";

export type MserverSendResult =
  | {
      ok: true;
      rawXml: string;
      stateText: string | null;
      documentIds: string[];
    }
  | { ok: false; error: string; rawXml?: string };

export async function postDataPackToMserver(
  cfg: PohodaMserverConfig,
  xmlBody: string,
): Promise<MserverSendResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/xml; charset=utf-8",
    Accept: "application/xml, text/xml, */*",
  };

  let auth: string | undefined;
  if (cfg.httpUser && cfg.httpPassword) {
    auth = Buffer.from(`${cfg.httpUser}:${cfg.httpPassword}`, "utf8").toString(
      "base64",
    );
    headers.Authorization = `Basic ${auth}`;
  }

  let res: Response;
  try {
    res = await fetch(cfg.mserverUrl, {
      method: "POST",
      headers,
      body: xmlBody,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const rawXml = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      error: `HTTP ${res.status}: ${rawXml.slice(0, 500)}`,
      rawXml,
    };
  }

  const parsed = parsePohodaResponsePack(rawXml);
  if (!parsed.ok) {
    const detail = [
      parsed.stateText && `stav: ${parsed.stateText}`,
      ...parsed.errorMessages,
    ]
      .filter(Boolean)
      .join("; ");
    return {
      ok: false,
      error: detail || "Import do Pohody neproběhl v pořádku.",
      rawXml,
    };
  }

  return {
    ok: true,
    rawXml,
    stateText: parsed.stateText,
    documentIds: parsed.documentIds,
  };
}
