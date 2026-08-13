import { NextResponse } from "next/server";

import { requireRoles, requireSession } from "@/lib/api-session";
import { prismaErrorMessage } from "@/lib/api-json";
import { convertInvoiceToPaymentProof } from "@/services/invoice-convert-to-payment";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { session, response } = await requireSession();
  if (response) {
    return response;
  }
  const forbidden = requireRoles(session!, ["ADMIN", "APPROVER"]);
  if (forbidden) {
    return forbidden;
  }

  const { id: invoiceId } = await ctx.params;
  try {
    const r = await convertInvoiceToPaymentProof(invoiceId, session!.user!.id);

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: r.error, invoiceId: r.invoiceId },
        { status: r.httpStatus },
      );
    }

    return NextResponse.json({
      ok: true,
      documentId: r.documentId,
      formerInvoiceId: r.formerInvoiceId,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: prismaErrorMessage(err, "Převod na doklad o platbě selhal."),
        invoiceId,
      },
      { status: 500 },
    );
  }
}
