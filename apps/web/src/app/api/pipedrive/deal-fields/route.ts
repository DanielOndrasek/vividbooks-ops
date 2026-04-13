import { NextResponse } from "next/server";

import { requireRoles, requireSession } from "@/lib/api-session";
import { getPipedriveEnv } from "@/lib/integrations/env";
import { PipedriveClient } from "@/lib/pipedrive/client";

export const dynamic = "force-dynamic";

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
    const fields = await client.getDealFields();
    const rows = fields
      .map((f) => ({
        id: f.id,
        key: f.key,
        name: f.name,
        field_type: f.field_type,
        optionsCount: Array.isArray(f.options) ? f.options.length : 0,
        /** První pár voleb (select/multiselect) — pro kontrolu id hodnot v dealu */
        optionsSample:
          Array.isArray(f.options) && f.options.length > 0
            ? (f.options as { id?: unknown; label?: unknown }[])
                .slice(0, 8)
                .map((o) => ({ id: o.id, label: o.label }))
            : [],
      }))
      .sort((a, b) => {
        const c = `${a.name}`.localeCompare(`${b.name}`);
        return c !== 0 ? c : `${a.key}`.localeCompare(`${b.key}`);
      });
    return NextResponse.json({ items: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
