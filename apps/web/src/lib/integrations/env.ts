/** Jednotné čtení integračních proměnných (jeden zdroj = prostředí / GitHub Secrets → Vercel). */

export const DEFAULT_PIPEDRIVE_PRODUCT_CATEGORY_FIELD_KEY =
  "3f0c870ac132eec72589da1313e2388977c4a74f";

export function maskSecret(
  value: string | undefined,
  keepStart = 4,
  keepEnd = 2,
): string {
  if (!value?.trim()) {
    return "(prázdné)";
  }
  if (value.length <= keepStart + keepEnd) {
    return "••••••••";
  }
  return `${value.slice(0, keepStart)}…${value.slice(-keepEnd)}`;
}

export type PipedriveEnvStatus = {
  apiToken: string;
  domain: string;
  categoryFieldKey: string;
  configured: boolean;
  missing: string[];
};

export function getPipedriveEnv(): PipedriveEnvStatus {
  const apiToken = process.env.PIPEDRIVE_API_TOKEN?.trim() ?? "";
  const domain = process.env.PIPEDRIVE_DOMAIN?.trim() ?? "";
  let categoryFieldKey =
    process.env.PIPEDRIVE_CATEGORY_FIELD_KEY?.trim() ?? "";
  if (!categoryFieldKey) {
    categoryFieldKey = DEFAULT_PIPEDRIVE_PRODUCT_CATEGORY_FIELD_KEY;
  }
  const missing: string[] = [];
  if (!apiToken) {
    missing.push("PIPEDRIVE_API_TOKEN");
  }
  if (!domain) {
    missing.push("PIPEDRIVE_DOMAIN");
  }
  if (!categoryFieldKey) {
    missing.push("PIPEDRIVE_CATEGORY_FIELD_KEY");
  }
  const configured = Boolean(apiToken && domain && categoryFieldKey);
  return {
    apiToken,
    domain,
    categoryFieldKey,
    configured,
    missing,
  };
}
