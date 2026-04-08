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

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

function resolveAiConfidenceThreshold(): number {
  const n = Number(process.env.AI_CONFIDENCE_THRESHOLD);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.7;
}

function resolveAiBatchLimit(): number {
  const n = Number(process.env.AI_BATCH_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 10;
}

export type AnthropicEnvStatus = {
  apiKey: string;
  configured: boolean;
  missing: string[];
  effectiveModel: string;
  effectiveConfidenceThreshold: number;
  effectiveBatchLimit: number;
  envModelSet: boolean;
  envConfidenceSet: boolean;
  envBatchSet: boolean;
};

export function getAnthropicEnvStatus(): AnthropicEnvStatus {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  const envModel = process.env.ANTHROPIC_MODEL?.trim();
  const missing: string[] = [];
  if (!apiKey) {
    missing.push("ANTHROPIC_API_KEY");
  }
  return {
    apiKey,
    configured: Boolean(apiKey),
    missing,
    effectiveModel: envModel || DEFAULT_ANTHROPIC_MODEL,
    effectiveConfidenceThreshold: resolveAiConfidenceThreshold(),
    effectiveBatchLimit: resolveAiBatchLimit(),
    envModelSet: Boolean(envModel),
    envConfidenceSet: Boolean(process.env.AI_CONFIDENCE_THRESHOLD?.trim()),
    envBatchSet: Boolean(process.env.AI_BATCH_LIMIT?.trim()),
  };
}
