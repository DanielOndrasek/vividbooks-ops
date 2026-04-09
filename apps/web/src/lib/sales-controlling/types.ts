/** Jedna měna — výnos (won), náklady na provize, fixní náklady, čistý zisk, podíl nákladů na výnosech. */
export type CurrencyControllingRow = {
  revenue: number;
  commissionCost: number;
  fixedCost: number;
  net: number;
  costRatio: number | null;
};

export type OwnerMonthRow = {
  ownerLabel: string;
  byCurrency: Record<string, CurrencyControllingRow>;
};

export type MonthControllingBlock = {
  month: number;
  missingSnapshot: boolean;
  teamByCurrency: Record<string, CurrencyControllingRow>;
  owners: OwnerMonthRow[];
};

export type SalesControllingYearBundle = {
  year: number;
  source: "database" | "static";
  months: MonthControllingBlock[];
};

export type YearTotalsByCurrency = Record<
  string,
  {
    revenue: number;
    commissionCost: number;
    fixedCost: number;
    net: number;
  }
>;
