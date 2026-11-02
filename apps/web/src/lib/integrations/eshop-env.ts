/** Konfigurace čtení ceníku e-shopu (Supabase REST, jen čtení). Hodnoty doplní Dan do prostředí. */

export type EshopEnvStatus = {
  url: string;
  key: string;
  configured: boolean;
  missing: string[];
};

export function getEshopEnv(): EshopEnvStatus {
  const url = process.env.ESHOP_SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
  const key = process.env.ESHOP_SUPABASE_READ_KEY?.trim() ?? "";
  const missing: string[] = [];
  if (!url) missing.push("ESHOP_SUPABASE_URL");
  if (!key) missing.push("ESHOP_SUPABASE_READ_KEY");
  return { url, key, configured: missing.length === 0, missing };
}
