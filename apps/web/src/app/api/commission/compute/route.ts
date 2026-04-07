import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/api-session";
import {
  aggregateByOwner,
  buildCategoryOptionMap,
  buildFullMonthExportRows,
  buildValueDiagnostics,
  collectWonDealsInMonth,
  computeCommissionsForMonth,
  enrichDealsWithFullDetails,
  rowsToExportRows,
  type DealDict,
} from "@/lib/commission/logic";
import { COMMISSION_RULES } from "@/lib/commission/rules";
import { getPipedriveEnv } from "@/lib/integrations/env";
import { PipedriveClient } from "@/lib/pipedrive/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export async function POST(req: NextRequest) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  void session;

  const pd = getPipedriveEnv();
  if (!pd.configured) {
    return NextResponse.json(
      { error: "Pipedrive není nakonfigurován.", missing: pd.missing },
      { status: 400 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatné JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatné tělo." }, { status: 400 });
  }
  const { year, month } = parsed.data;

  try {
    const client = new PipedriveClient(pd.domain, pd.apiToken);
    const catKey = pd.categoryFieldKey;

    const [dealFields, pipelinesRaw, usersRaw, dealsRaw] = await Promise.all([
      client.getDealFields(),
      client.getPipelines(),
      client.getUsers(),
      client.getAllWonDeals(),
    ]);

    const optionMap = buildCategoryOptionMap(dealFields as DealDict[], catKey);

    const pipelinesMap: Record<number, string> = {};
    for (const p of pipelinesRaw) {
      const id = p.id;
      const name = p.name;
      if (id != null && name != null) {
        pipelinesMap[Number(id)] = String(name);
      }
    }

    const userMap: Record<number, string> = {};
    for (const u of usersRaw) {
      const id = u.id;
      const name = u.name;
      if (id != null && name != null) {
        userMap[Number(id)] = String(name);
      }
    }

    let deals = dealsRaw as DealDict[];
    deals = await enrichDealsWithFullDetails(deals, catKey, (id) =>
      client.getDeal(id),
    );

    const rows = computeCommissionsForMonth(
      deals,
      pipelinesMap,
      userMap,
      catKey,
      optionMap,
      year,
      month,
    );

    const diagnostics = buildValueDiagnostics(
      deals,
      year,
      month,
      catKey,
      optionMap,
      pipelinesMap,
      rows,
    );

    const wonMonth = collectWonDealsInMonth(deals, year, month);
    const fullExport = buildFullMonthExportRows(
      wonMonth,
      rows,
      catKey,
      optionMap,
      pipelinesMap,
      userMap,
    );

    return NextResponse.json({
      meta: { year, month },
      rows,
      aggregate: aggregateByOwner(rows),
      diagnostics,
      exportCommissioned: rowsToExportRows(rows),
      exportFullMonth: fullExport,
      commissionRules: COMMISSION_RULES,
      pipedrive: {
        optionMapSize: Object.keys(optionMap).length,
        dealsLoaded: deals.length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[commission/compute]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
