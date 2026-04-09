import type { Prisma } from "@prisma/client";

import type {
  CurrencyControllingRow,
  MonthControllingBlock,
  OwnerMonthRow,
  SalesControllingYearBundle,
  YearTotalsByCurrency,
} from "@/lib/sales-controlling/types";

export function normalizeOwnerLabel(s: string): string {
  return s.trim().toLowerCase();
}

type FixedRow = {
  ownerLabel: string;
  amount: Prisma.Decimal | number;
  currency: string;
  active: boolean;
};

function sumFixedByCurrency(rows: FixedRow[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const f of rows) {
    if (!f.active) {
      continue;
    }
    const c = (f.currency || "CZK").trim().toUpperCase() || "CZK";
    acc[c] = (acc[c] ?? 0) + Number(f.amount);
  }
  return acc;
}

function fixedForOwner(ownerLabel: string, rows: FixedRow[]): Record<string, number> {
  const n = normalizeOwnerLabel(ownerLabel);
  const acc: Record<string, number> = {};
  for (const f of rows) {
    if (!f.active) {
      continue;
    }
    if (normalizeOwnerLabel(f.ownerLabel) !== n) {
      continue;
    }
    const c = (f.currency || "CZK").trim().toUpperCase() || "CZK";
    acc[c] = (acc[c] ?? 0) + Number(f.amount);
  }
  return acc;
}

function combineCurrencyMaps(
  revenue: Record<string, number>,
  commissionByCcy: Record<string, { commission: number; value: number }>,
  fixed: Record<string, number>,
): Record<string, CurrencyControllingRow> {
  const keys = new Set<string>([
    ...Object.keys(revenue),
    ...Object.keys(commissionByCcy),
    ...Object.keys(fixed),
  ]);
  const out: Record<string, CurrencyControllingRow> = {};
  for (const ccy of keys) {
    const rev = revenue[ccy] ?? 0;
    const commissionCost = commissionByCcy[ccy]?.commission ?? 0;
    const fixedCost = fixed[ccy] ?? 0;
    const totalCost = commissionCost + fixedCost;
    const net = rev - totalCost;
    const costRatio = rev > 0 ? totalCost / rev : null;
    out[ccy] = { revenue: rev, commissionCost, fixedCost, net, costRatio };
  }
  return out;
}

type WonOwnerPayload = {
  ownerLabel: string;
  dealCount: number;
  byCurrency: Record<string, number>;
};

type CommOwnerPayload = {
  ownerLabel: string;
  dealCount: number;
  byCurrency: Record<string, { commission: number; value: number }>;
};

export function buildMonthFromSnapshotPayload(
  payload: Record<string, unknown>,
  fixedRows: FixedRow[],
): Omit<MonthControllingBlock, "month" | "missingSnapshot"> {
  const wonTeam = (payload.wonRevenueTeamByCurrency ?? {}) as Record<string, number>;
  const commTeam = (payload.commissionTeamByCurrency ?? {}) as Record<
    string,
    { commission: number; value: number }
  >;
  const teamFixed = sumFixedByCurrency(fixedRows);
  const teamByCurrency = combineCurrencyMaps(wonTeam, commTeam, teamFixed);

  const wonOwners = (payload.wonRevenueByOwner ?? []) as WonOwnerPayload[];
  const commOwners = (payload.commissionByOwner ?? []) as CommOwnerPayload[];

  const ownerSet = new Set<string>();
  for (const o of wonOwners) {
    ownerSet.add(o.ownerLabel);
  }
  for (const o of commOwners) {
    ownerSet.add(o.ownerLabel);
  }
  for (const f of fixedRows) {
    if (f.active) {
      ownerSet.add(f.ownerLabel.trim());
    }
  }

  const wonMap = new Map(wonOwners.map((o) => [o.ownerLabel, o]));
  const commMap = new Map(commOwners.map((o) => [o.ownerLabel, o]));

  const owners: OwnerMonthRow[] = Array.from(ownerSet)
    .sort((a, b) => a.localeCompare(b, "cs"))
    .map((ownerLabel) => {
      const wo = wonMap.get(ownerLabel);
      const co = commMap.get(ownerLabel);
      const rev = wo?.byCurrency ?? {};
      const comm = co?.byCurrency ?? {};
      const fx = fixedForOwner(ownerLabel, fixedRows);
      return {
        ownerLabel,
        byCurrency: combineCurrencyMaps(rev, comm, fx),
      };
    });

  return { teamByCurrency, owners };
}

export function emptyMonthBlock(month: number): MonthControllingBlock {
  return {
    month,
    missingSnapshot: true,
    teamByCurrency: {},
    owners: [],
  };
}

export function buildYearBundleFromSnapshots(
  year: number,
  snapshots: { month: number; payload: unknown }[],
  fixedRows: FixedRow[],
): SalesControllingYearBundle {
  const byMonth = new Map<number, Record<string, unknown>>();
  for (const s of snapshots) {
    byMonth.set(s.month, s.payload as Record<string, unknown>);
  }

  const months: MonthControllingBlock[] = [];
  for (let m = 1; m <= 12; m++) {
    const payload = byMonth.get(m);
    if (!payload) {
      months.push(emptyMonthBlock(m));
      continue;
    }
    const built = buildMonthFromSnapshotPayload(payload, fixedRows);
    months.push({
      month: m,
      missingSnapshot: false,
      ...built,
    });
  }

  return { year, source: "database", months };
}

export function sumYearTotals(months: MonthControllingBlock[]): YearTotalsByCurrency {
  const acc: YearTotalsByCurrency = {};
  for (const mo of months) {
    if (mo.missingSnapshot) {
      continue;
    }
    for (const [ccy, row] of Object.entries(mo.teamByCurrency)) {
      if (!acc[ccy]) {
        acc[ccy] = {
          revenue: 0,
          commissionCost: 0,
          fixedCost: 0,
          net: 0,
        };
      }
      acc[ccy].revenue += row.revenue;
      acc[ccy].commissionCost += row.commissionCost;
      acc[ccy].fixedCost += row.fixedCost;
      acc[ccy].net += row.net;
    }
  }
  return acc;
}

export function yearTotalsCostRatio(
  totals: YearTotalsByCurrency,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const [ccy, t] of Object.entries(totals)) {
    const cost = t.commissionCost + t.fixedCost;
    out[ccy] = t.revenue > 0 ? cost / t.revenue : null;
  }
  return out;
}
