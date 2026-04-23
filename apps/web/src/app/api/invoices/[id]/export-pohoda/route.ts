import { NextRequest, NextResponse } from "next/server";

import { requireRoles, requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { getPohodaMserverConfig } from "@/services/pohoda/env";
import { runInvoicePohodaExportIfConfigured } from "@/services/pohoda/export-invoice";

/**
 * Ruční opakování exportu do POHODY (např. po opravě env nebo chybě mServeru).
 */
export async function POST(
  _req: NextRequest,
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

  const { id } = await ctx.params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, pohodaExportStatus: true, document: { select: { status: true } } },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Nenalezeno." }, { status: 404 });
  }
  if (invoice.document.status !== "APPROVED") {
    return NextResponse.json(
      { error: "Export zkus až po schválení faktury." },
      { status: 400 },
    );
  }

  if (!getPohodaMserverConfig()) {
    return NextResponse.json(
      {
        error:
          "Chybí POHODA_MSERVER_URL nebo POHODA_ICO v prostředí aplikace.",
      },
      { status: 400 },
    );
  }

  await runInvoicePohodaExportIfConfigured(id);

  const next = await prisma.invoice.findUnique({
    where: { id },
    select: {
      pohodaExportStatus: true,
      pohodaExportedAt: true,
      pohodaExternalId: true,
      pohodaExportLastError: true,
    },
  });

  return NextResponse.json({
    ok: true,
    pohodaExportStatus: next?.pohodaExportStatus,
    pohodaExportedAt: next?.pohodaExportedAt?.toISOString() ?? null,
    pohodaExternalId: next?.pohodaExternalId,
    pohodaExportLastError: next?.pohodaExportLastError,
  });
}
