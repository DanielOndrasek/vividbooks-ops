import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { requireSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { response } = await requireSession();
  if (response) {
    return response;
  }

  const { id } = await ctx.params;
  const doc = await prisma.document.findUnique({
    where: { id },
    include: { invoice: true, paymentProof: true },
  });

  if (!doc) {
    return NextResponse.json({ error: "Nenalezeno." }, { status: 404 });
  }

  if (doc.localFilePath) {
    try {
      const buf = await readFile(doc.localFilePath);
      return new NextResponse(buf, {
        headers: {
          "Content-Type": doc.mimeType || "application/octet-stream",
          "Content-Disposition": `inline; filename="${encodeURIComponent(doc.originalFilename)}"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch {
      /* fall through to Drive */
    }
  }

  const url = doc.invoice?.driveUrl ?? doc.paymentProof?.driveUrl;
  if (url) {
    return NextResponse.redirect(url);
  }

  return NextResponse.json(
    { error: "Soubor není k dispozici (žádný lokální soubor ani odkaz na Drive)." },
    { status: 404 },
  );
}
