import { NextResponse } from "next/server";

import { requireRoles, requireSession } from "@/lib/api-session";
import type { DealDict } from "@/lib/commission/logic";
import { getPipedriveEnv } from "@/lib/integrations/env";
import { PipedriveClient } from "@/lib/pipedrive/client";

export const dynamic = "force-dynamic";

type FieldRow = {
  id: unknown;
  key: unknown;
  name: unknown;
  field_type: unknown;
  edit_flag: unknown;
  /** Všechny volby (enum/set …); může být dlouhé — v UI je scrollovatelný výpis. */
  options: { id: unknown; label: unknown }[];
};

function mapEntityField(f: DealDict): FieldRow {
  const opts = Array.isArray(f.options) ? f.options : [];
  return {
    id: f.id,
    key: f.key,
    name: f.name,
    field_type: f.field_type,
    edit_flag: f.edit_flag,
    options: (opts as { id?: unknown; label?: unknown }[]).map((o) => ({
      id: o.id,
      label: o.label,
    })),
  };
}

function sortFields(a: FieldRow, b: FieldRow): number {
  const c = `${a.name}`.localeCompare(`${b.name}`);
  return c !== 0 ? c : `${a.key}`.localeCompare(`${b.key}`);
}

export async function GET() {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  const forbidden = requireRoles(session!, ["ADMIN"]);
  if (forbidden) {
    return forbidden;
  }

  const pd = getPipedriveEnv();
  if (!pd.configured) {
    return NextResponse.json(
      { error: "Pipedrive není nakonfigurován.", missing: pd.missing },
      { status: 400 },
    );
  }

  try {
    const client = new PipedriveClient(pd.domain, pd.apiToken);

    const dealFieldsRaw = await client.getDealFields();
    const personFieldsRaw = await client.getPersonFields();
    const organizationFieldsRaw = await client.getOrganizationFields();
    const productFieldsRaw = await client.getProductFields();
    const productsRaw = await client.getAllProducts();
    const pipelinesRaw = await client.getPipelines();
    const stagesRaw = await client.getAllStages();
    const usersRaw = await client.getUsers();

    const dealFields = dealFieldsRaw.map(mapEntityField).sort(sortFields);
    const personFields = personFieldsRaw.map(mapEntityField).sort(sortFields);
    const organizationFields = organizationFieldsRaw.map(mapEntityField).sort(sortFields);
    const productFields = productFieldsRaw.map(mapEntityField).sort(sortFields);

    const pipelines = [...pipelinesRaw].sort((a, b) =>
      `${a.name ?? ""}`.localeCompare(`${b.name ?? ""}`),
    );

    const stagesByPipeline = new Map<number, DealDict[]>();
    for (const s of stagesRaw) {
      const pid = Number(s.pipeline_id);
      if (!Number.isFinite(pid)) {
        continue;
      }
      const list = stagesByPipeline.get(pid) ?? [];
      list.push(s);
      stagesByPipeline.set(pid, list);
    }
    for (const [, list] of stagesByPipeline) {
      list.sort((a, b) => {
        const oa = Number(a.order_nr);
        const ob = Number(b.order_nr);
        if (Number.isFinite(oa) && Number.isFinite(ob) && oa !== ob) {
          return oa - ob;
        }
        return `${a.name ?? ""}`.localeCompare(`${b.name ?? ""}`);
      });
    }

    const pipelinesWithStages = pipelines.map((p) => {
      const pid = Number(p.id);
      const stages = (Number.isFinite(pid) ? stagesByPipeline.get(pid) : undefined) ?? [];
      return {
        id: p.id,
        name: p.name,
        active: p.active,
        url_title: p.url_title,
        stages: stages.map((s) => ({
          id: s.id,
          name: s.name,
          order_nr: s.order_nr,
          pipeline_id: s.pipeline_id,
        })),
      };
    });

    const users = usersRaw
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        active_flag: u.active_flag,
      }))
      .sort((a, b) => `${a.name ?? ""}`.localeCompare(`${b.name ?? ""}`));

    const products = productsRaw
      .map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        unit: p.unit,
        tax: p.tax,
        active_flag: p.active_flag,
      }))
      .sort((a, b) => `${a.name ?? ""}`.localeCompare(`${b.name ?? ""}`));

    return NextResponse.json({
      dealFields,
      personFields,
      organizationFields,
      productFields,
      products,
      pipelines: pipelinesWithStages,
      users,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
