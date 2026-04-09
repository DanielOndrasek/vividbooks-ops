import { NextResponse } from "next/server";

import { requireRoles, requireSession } from "@/lib/api-session";
import { deletePaymentProofById } from "@/services/payment-proof-delete";

const MAX_IDS = 100;

export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  const forbidden = requireRoles(session!, ["ADMIN", "APPROVER"]);
  if (forbidden) {
    return forbidden;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatné JSON tělo." }, { status: 400 });
  }

  const raw = body as { proofIds?: unknown };
  if (!Array.isArray(raw.proofIds)) {
    return NextResponse.json({ error: "Chybí pole proofIds." }, { status: 400 });
  }

  const ids = raw.proofIds
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Vyberte alespoň jednu evidenci platby." },
      { status: 400 },
    );
  }

  const userId = session!.user!.id;
  const results: {
    proofId: string;
    ok: boolean;
    error?: string;
    code?: string;
  }[] = [];

  let deleted = 0;
  for (const proofId of ids) {
    const r = await deletePaymentProofById(proofId, userId);
    if (r.ok) {
      deleted += 1;
      results.push({ proofId, ok: true });
    } else {
      results.push({
        proofId,
        ok: false,
        error: r.error,
        code: r.code,
      });
    }
  }

  const failed = results.filter((x) => !x.ok).length;

  return NextResponse.json({
    deleted,
    failed,
    requested: ids.length,
    results,
  });
}
