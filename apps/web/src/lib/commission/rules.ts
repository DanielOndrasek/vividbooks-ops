/** Stejná pravidla jako vividbooks_ops/tools/commission/rules.ts (Python). */

export const PIPELINE_INTERACTIVE_UPSELL = "CZ Sales - Upsell [CZ1]";
export const PIPELINE_INTERACTIVE_AKVIZICE = "CZ Sales - Akvizice [CZ1]";

export const CATEGORIES_SHARED_INTERACTIVE_PIPELINES = ["interactive", "vividboard"] as const;

export const PIPELINE_ID_TO_INTERACTIVE_KIND: Record<number, string> = {
  6: "akvizice",
  7: "upsell",
  13: "akvizice",
  14: "upsell",
};

export const INTERACTIVE_PIPELINE_FALLBACK_KIND: string | null = "upsell";

export type CommissionRule = {
  categories: string[];
  pipeline: string | null;
  interactive_kind?: string;
  rate: number;
};

export const COMMISSION_RULES: CommissionRule[] = [
  { categories: ["print", "posters"], pipeline: null, rate: 0.1 },
  {
    categories: ["interactive", "vividboard"],
    pipeline: null,
    interactive_kind: "upsell",
    rate: 0.1,
  },
  {
    categories: ["interactive", "vividboard"],
    pipeline: null,
    interactive_kind: "akvizice",
    rate: 0.15,
  },
];

/** Pipedrive pipeline_id SK pipelines: 13 = SK Sales - Akvizície [SK1], 14 = SK Sales - Upsell [SK2]. */
export const SK_PIPELINE_IDS: readonly number[] = [13, 14];

/**
 * Výjimka ze sazby pro konkrétního obchodníka: přepíše `rate` z COMMISSION_RULES,
 * pokud deal patří obchodníkovi (shoda owner_id NEBO jména) a je v jedné z pipelines.
 */
export type CommissionOwnerOverride = {
  /** Pipedrive user id — primární shoda (jméno se může přejmenovat). */
  ownerIds: number[];
  /** Jména z Pipedrive jako záloha (porovnání bez ohledu na velikost písmen a mezery). */
  ownerNames: string[];
  /** Deal se musí nacházet v jedné z těchto pipeline (Pipedrive pipeline_id). */
  pipelineIds: number[];
  rate: number;
};

export const COMMISSION_OWNER_OVERRIDES: CommissionOwnerOverride[] = [
  // Eduard Malachovský: 50 % ze všech SK obchodů (všechny kategorie na SK pipelines).
  {
    ownerIds: [12797715],
    ownerNames: ["Eduard Malachovský", "Eduard Malachovsky"],
    pipelineIds: [...SK_PIPELINE_IDS],
    rate: 0.5,
  },
];

/** Shoda jmen: mezery, velikost písmen, Unicode (stejně jako normalizeOwnerLabel v sales controllingu). */
function normalizeOwnerName(s: string): string {
  return s.trim().normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
}

export function findCommissionOwnerOverride(
  ownerId: number | null,
  ownerName: string,
  pipelineId: number | null,
): CommissionOwnerOverride | null {
  if (pipelineId == null) {
    return null;
  }
  const nameNorm = normalizeOwnerName(ownerName || "");
  for (const o of COMMISSION_OWNER_OVERRIDES) {
    if (!o.pipelineIds.includes(pipelineId)) {
      continue;
    }
    const idMatch = ownerId != null && o.ownerIds.includes(ownerId);
    const nameMatch =
      nameNorm !== "" && o.ownerNames.some((n) => normalizeOwnerName(n) === nameNorm);
    if (idMatch || nameMatch) {
      return o;
    }
  }
  return null;
}
