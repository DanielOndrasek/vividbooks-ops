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
