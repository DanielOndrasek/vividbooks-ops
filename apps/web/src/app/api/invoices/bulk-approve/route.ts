import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireRoles, requireSession } from "@/lib/api-session";
import { runInvoiceApproval } from "@/services/invoice-approval";

const MAX_BATCH = 50;

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

  const raw = body as { invoiceIds?: unknown };
  if (!Array.isArray(raw.invoiceIds)) {
    return NextResponse.json({ error: "Chybí pole invoiceIds." }, { status: 400 });
  }

  const ids = raw.invoiceIds
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .slice(0, MAX_BATCH);

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Vyberte alespoň jednu fakturu." },
      { status: 400 },
    );
  }

  const userId = session!.user!.id;
  const results: {
    invoiceId: string;
    ok: boolean;
    error?: string;
    driveUrl?: string | null;
  }[] = [];

  for (const invoiceId of ids) {
    const r = await runInvoiceApproval(invoiceId, userId);
    if (r.ok) {
      results.push({
        invoiceId: r.invoiceId,
        ok: true,
        driveUrl: r.driveUrl,
      });
    } else {
      results.push({
        invoiceId: r.invoiceId,
        ok: false,
        error: r.error,
      });
    }
  }

  const approved = results.filter((x) => x.ok).length;
  const failed = results.length - approved;

  await writeAuditLog({
    entityType: "Invoice",
    entityId: "bulk-approve",
    userId,
    action: "bulk_approved",
    metadata: {
      requested: ids.length,
      approved,
      failed,
      failedIds: results.filter((x) => !x.ok).map((x) => x.invoiceId),
    },
  });

  return NextResponse.json({
    results,
    approved,
    failed,
    total: results.length,
  });
}
