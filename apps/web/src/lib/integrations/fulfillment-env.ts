/** Konfigurace integrace Fulfillment.cz (zdroj = prostředí / GitHub Secrets → Vercel). */

export const DEFAULT_FULFILLMENT_API_URL = "https://client.api.fulfillment.cz/v2";

export type FulfillmentEnvStatus = {
  token: string;
  baseUrl: string;
  configured: boolean;
  missing: string[];
};

export function getFulfillmentEnv(): FulfillmentEnvStatus {
  const token = process.env.FULFILLMENT_API_TOKEN?.trim() ?? "";
  const baseUrl =
    process.env.FULFILLMENT_API_URL?.trim().replace(/\/+$/, "") ||
    DEFAULT_FULFILLMENT_API_URL;

  const missing: string[] = [];
  if (!token) {
    missing.push("FULFILLMENT_API_TOKEN");
  }

  return {
    token,
    baseUrl,
    configured: token.length > 0,
    missing,
  };
}
