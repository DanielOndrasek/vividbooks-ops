import type { Prisma } from "@prisma/client";

import type {
  CurrencyControllingRow,
  MonthControllingBlock,
  OwnerMonthRow,
  SalesControllingYearBundle,
  YearTotalsByCurrency,
} from "@/lib/sales-controlling/types";

/** Shoda jmen obchodníků (Pipedrive vs ruční zadání): mezery, velikost písmen, Unicode. */
export function normalizeOwnerLabel(s: string): string {
  return s
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ");
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

function aggregateWonByNorm(
  wonOwners: WonOwnerPayload[],
): Map<string, Record<string, number>> {
  const m = new Map<string, Record<string, number>>();
  for (const o of wonOwners) {
    const n = normalizeOwnerLabel(o.ownerLabel);
    if (!m.has(n)) {
      m.set(n, {});
    }
    const acc = m.get(n)!;
    for (const [ccy, v] of Object.entries(o.byCurrency)) {
      acc[ccy] = (acc[ccy] ?? 0) + v;
    }
  }
  return m;
}

function aggregateCommByNorm(
  commOwners: CommOwnerPayload[],
): Map<string, Record<string, { commission: number; value: number }>> {
  const m = new Map<string, Record<string, { commission: number; value: number }>>();
  for (const o of commOwners) {
    const n = normalizeOwnerLabel(o.ownerLabel);
    if (!m.has(n)) {
      m.set(n, {});
    }
    const acc = m.get(n)!;
    for (const [ccy, bucket] of Object.entries(o.byCurrency)) {
      if (!acc[ccy]) {
        acc[ccy] = { commission: 0, value: 0 };
      }
      acc[ccy].commission += bucket.commission;
      acc[ccy].value += bucket.value;
    }
  }
  return m;
}

/** Jen fixní náklady (měsíc bez výpočtu provizí / doplnění šablony). */
export function buildMonthFromFixedCostsOnly(
  month: number,
  fixedRows: FixedRow[],
): MonthControllingBlock {
  const teamFixed = sumFixedByCurrency(fixedRows);
  const teamByCurrency = combineCurrencyMaps({}, {}, teamFixed);

  const normKeys = new Set<string>();
  for (const f of fixedRows) {
    if (f.active) {
      normKeys.add(normalizeOwnerLabel(f.ownerLabel));
    }
  }

  const displayByNorm = new Map<string, string>();
  for (const f of fixedRows) {
    if (!f.active) {
      continue;
    }
    const n = normalizeOwnerLabel(f.ownerLabel);
    if (!displayByNorm.has(n)) {
      displayByNorm.set(n, f.ownerLabel.trim().replace(/\s+/g, " "));
    }
  }

  const owners: OwnerMonthRow[] = Array.from(normKeys)
    .sort((a, b) => {
      const da = displayByNorm.get(a) ?? a;
      const db = displayByNorm.get(b) ?? b;
      return da.localeCompare(db, "cs");
    })
    .map((norm) => {
      const display = displayByNorm.get(norm) ?? norm;
      const fx = fixedForOwner(display, fixedRows);
      return {
        ownerLabel: display,
        byCurrency: combineCurrencyMaps({}, {}, fx),
      };
    });

  return {
    month,
    missingSnapshot: true,
    teamByCurrency,
    owners,
  };
}

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

  const wonByNorm = aggregateWonByNorm(wonOwners);
  const commByNorm = aggregateCommByNorm(commOwners);

  const displayByNorm = new Map<string, string>();
  for (const o of wonOwners) {
    const n = normalizeOwnerLabel(o.ownerLabel);
    if (!displayByNorm.has(n)) {
      displayByNorm.set(n, o.ownerLabel.trim().replace(/\s+/g, " "));
    }
  }
  for (const o of commOwners) {
    const n = normalizeOwnerLabel(o.ownerLabel);
    if (!displayByNorm.has(n)) {
      displayByNorm.set(n, o.ownerLabel.trim().replace(/\s+/g, " "));
    }
  }
  for (const f of fixedRows) {
    if (!f.active) {
      continue;
    }
    const n = normalizeOwnerLabel(f.ownerLabel);
    if (!displayByNorm.has(n)) {
      displayByNorm.set(n, f.ownerLabel.trim().replace(/\s+/g, " "));
    }
  }

  const normKeys = new Set<string>([
    ...displayByNorm.keys(),
  ]);

  const owners: OwnerMonthRow[] = Array.from(normKeys)
    .sort((a, b) => {
      const da = displayByNorm.get(a) ?? a;
      const db = displayByNorm.get(b) ?? b;
      return da.localeCompare(db, "cs");
    })
    .map((norm) => {
      const display = displayByNorm.get(norm) ?? norm;
      const rev = wonByNorm.get(norm) ?? {};
      const comm = commByNorm.get(norm) ?? {};
      const fx = fixedForOwner(display, fixedRows);
      return {
        ownerLabel: display,
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

/**
 * Sales controlling pro libovolný kalendářní rok: měsíce z DB snapshotů (nástroj Provize), jinak volitelně
 * ruční řádky ze `staticTemplate` (historie v `historical.ts`), jinak jen fixní náklady.
 */
export function buildSalesControllingYearBundle(
  year: number,
  snapshots: { month: number; payload: unknown }[],
  fixedRows: FixedRow[],
  staticTemplate: SalesControllingYearBundle | null,
): SalesControllingYearBundle {
  const byMonth = new Map<number, Record<string, unknown>>();
  for (const s of snapshots) {
    byMonth.set(s.month, s.payload as Record<string, unknown>);
  }
  const staticMonths = staticTemplate?.months ?? null;

  const months: MonthControllingBlock[] = [];
  for (let m = 1; m <= 12; m++) {
    const payload = byMonth.get(m);
    if (payload) {
      const built = buildMonthFromSnapshotPayload(payload, fixedRows);
      months.push({
        month: m,
        missingSnapshot: false,
        ...built,
      });
      continue;
    }

    const sm = staticMonths?.[m - 1];
    const hasStatic =
      sm != null &&
      (Object.keys(sm.teamByCurrency).length > 0 || sm.owners.length > 0);
    if (hasStatic) {
      months.push(mergeFixedIntoHistoricalMonth(sm, fixedRows));
      continue;
    }

    months.push(buildMonthFromFixedCostsOnly(m, fixedRows));
  }

  const source =
    snapshots.length > 0 || year >= 2026 ? ("database" as const) : ("static" as const);

  return { year, source, months };
}

/** Rok jen z DB snapshotů (bez ruční historie) — např. 2026+ nebo testy. */
export function buildYearBundleFromSnapshots(
  year: number,
  snapshots: { month: number; payload: unknown }[],
  fixedRows: FixedRow[],
): SalesControllingYearBundle {
  return buildSalesControllingYearBundle(year, snapshots, fixedRows, null);
}

/** Roční součty jen z měsíců s načtenými provizemi (`missingSnapshot === false`). Měsíce jen s fixy bez snapshotu se do souhrnu nepočítají. */
export function sumYearTotals(months: MonthControllingBlock[]): YearTotalsByCurrency {
  const acc: YearTotalsByCurrency = {};
  for (const mo of months) {
    if (mo.missingSnapshot) {
      continue;
    }
    if (Object.keys(mo.teamByCurrency).length === 0) {
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

/** Přičte týmové fixní náklady k ručně vyplněným řádkům v historical.ts. */
function mergeFixedIntoHistoricalMonth(
  m: MonthControllingBlock,
  fixedRows: FixedRow[],
): MonthControllingBlock {
  const teamFixed = sumFixedByCurrency(fixedRows);
  const mergedTeam: Record<string, CurrencyControllingRow> = {
    ...m.teamByCurrency,
  };
  for (const [ccy, addF] of Object.entries(teamFixed)) {
    const cur = mergedTeam[ccy] ?? {
      revenue: 0,
      commissionCost: 0,
      fixedCost: 0,
      net: 0,
      costRatio: null,
    };
    const fixedCost = cur.fixedCost + addF;
    const totalCost = cur.commissionCost + fixedCost;
    const net = cur.revenue - totalCost;
    const costRatio = cur.revenue > 0 ? totalCost / cur.revenue : null;
    mergedTeam[ccy] = {
      revenue: cur.revenue,
      commissionCost: cur.commissionCost,
      fixedCost,
      net,
      costRatio,
    };
  }

  const ownerRows: OwnerMonthRow[] = m.owners.map((o) => {
    const fx = fixedForOwner(o.ownerLabel, fixedRows);
    const allCcy = new Set([
      ...Object.keys(o.byCurrency),
      ...Object.keys(fx),
    ]);
    const merged: Record<string, CurrencyControllingRow> = {};
    for (const ccy of allCcy) {
      const cur = o.byCurrency[ccy];
      const addFix = fx[ccy] ?? 0;
      if (cur) {
        const fixedCost = cur.fixedCost + addFix;
        const totalCost = cur.commissionCost + fixedCost;
        const net = cur.revenue - totalCost;
        const costRatio = cur.revenue > 0 ? totalCost / cur.revenue : null;
        merged[ccy] = {
          revenue: cur.revenue,
          commissionCost: cur.commissionCost,
          fixedCost,
          net,
          costRatio,
        };
      } else {
        Object.assign(
          merged,
          combineCurrencyMaps({}, {}, { [ccy]: addFix }),
        );
      }
    }
    return { ownerLabel: o.ownerLabel, byCurrency: merged };
  });

  const existingNorm = new Set(
    ownerRows.map((o) => normalizeOwnerLabel(o.ownerLabel)),
  );
  for (const f of fixedRows) {
    if (!f.active) {
      continue;
    }
    const n = normalizeOwnerLabel(f.ownerLabel);
    if (existingNorm.has(n)) {
      continue;
    }
    existingNorm.add(n);
    const fx = fixedForOwner(f.ownerLabel.trim(), [f]);
    ownerRows.push({
      ownerLabel: f.ownerLabel.trim().replace(/\s+/g, " "),
      byCurrency: combineCurrencyMaps({}, {}, fx),
    });
  }
  ownerRows.sort((a, b) => a.ownerLabel.localeCompare(b.ownerLabel, "cs"));

  return { ...m, teamByCurrency: mergedTeam, owners: ownerRows };
}

/** Statické roky: prázdné měsíce doplní fixní náklady; vyplněné měsíce z historie sloučí fixy. */
export function enrichStaticBundleWithFixedCosts(
  bundle: SalesControllingYearBundle,
  fixedRows: FixedRow[],
): SalesControllingYearBundle {
  if (bundle.source !== "static") {
    return bundle;
  }
  return {
    ...bundle,
    months: bundle.months.map((m) => {
      const empty =
        Object.keys(m.teamByCurrency).length === 0 && m.owners.length === 0;
      if (empty) {
        return buildMonthFromFixedCostsOnly(m.month, fixedRows);
      }
      return mergeFixedIntoHistoricalMonth(m, fixedRows);
    }),
  };
}
