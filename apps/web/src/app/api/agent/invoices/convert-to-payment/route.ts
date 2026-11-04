import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAgentOrApprover } from "@/lib/agent-auth";
import { prismaErrorMessage } from "@/lib/api-json";
import { convertInvoiceToPaymentProof } from "@/services/invoice-convert-to-payment";

export const maxDuration = 300;

const bodySchema = z.object({ invoiceIds: z.array(z.string().min(1)).min(1).max(100) });

/**
 * „Toto je doklad k platbě, ne faktura“ – převede faktury na doklady k platbě
 * (vedou se zvlášť, do dávky účetní jdou do složky Doklady k platbě, ne k úhradě).
 * Stejná logika jako tlačítko v aplikaci (convert-to-payment-proof), jen pro agenta.
 */
export async function POST(req: Request) {
  const { actor, response } = await requireAgentOrApprover(req);
  if (response) return response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Očekávám { invoiceIds: string[] }." }, { status: 400 });
  }
  const results = [];
  for (const id of parsed.data.invoiceIds) {
    try {
      const r = await convertInvoiceToPaymentProof(id, actor!.userId);
      results.push(r.ok ? { invoiceId: id, ok: true, documentId: r.documentId } : { invoiceId: id, ok: false, error: r.error });
    } catch (err) {
      results.push({ invoiceId: id, ok: false, error: prismaErrorMessage(err, "Převod na doklad k platbě selhal.") });
    }
  }
  return NextResponse.json({
    converted: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
