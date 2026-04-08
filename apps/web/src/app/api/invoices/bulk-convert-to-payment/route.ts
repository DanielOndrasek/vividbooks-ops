import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireRoles, requireSession } from "@/lib/api-session";
import { convertInvoiceToPaymentProof } from "@/services/invoice-convert-to-payment";

const MAX_BATCH = 30;

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
    documentId?: string;
  }[] = [];

  for (const invoiceId of ids) {
    const r = await convertInvoiceToPaymentProof(invoiceId, userId);
    if (r.ok) {
      results.push({
        invoiceId: r.formerInvoiceId,
        ok: true,
        documentId: r.documentId,
      });
    } else {
      results.push({
        invoiceId: r.invoiceId,
        ok: false,
        error: r.error,
      });
    }
  }

  const converted = results.filter((x) => x.ok).length;
  const failed = results.length - converted;

  await writeAuditLog({
    entityType: "Invoice",
    entityId: "bulk-convert-to-payment",
    userId,
    action: "bulk_converted_to_payment_proof",
    metadata: {
      requested: ids.length,
      converted,
      failed,
      failedIds: results.filter((x) => !x.ok).map((x) => x.invoiceId),
    },
  });

  return NextResponse.json({
    results,
    converted,
    failed,
    total: results.length,
  });
}
