import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { requireSession } from "@/lib/api-session";
import { getGmailEnvStatus } from "@/lib/gmail-config";
import { prisma } from "@/lib/prisma";
import { downloadDriveFileBuffer } from "@/services/drive";
import { downloadAttachment, getGmailClient } from "@/services/gmail";

function inlineFileResponse(buf: Buffer, mimeType: string, filename: string) {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}

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
    include: { invoice: true, paymentProof: true, email: true },
  });

  if (!doc) {
    return NextResponse.json({ error: "Nenalezeno." }, { status: 404 });
  }

  if (doc.localFilePath) {
    try {
      const buf = await readFile(doc.localFilePath);
      return inlineFileResponse(
        buf,
        doc.mimeType || "application/octet-stream",
        doc.originalFilename,
      );
    } catch {
      /* na Vercelu často neexistuje — Gmail / Drive níže */
    }
  }

  const url = doc.invoice?.driveUrl ?? doc.paymentProof?.driveUrl;
  if (url) {
    return NextResponse.redirect(url);
  }

  const driveFileId = doc.invoice?.driveFileId ?? doc.paymentProof?.driveFileId;
  if (driveFileId) {
    try {
      const { buffer, mimeType } = await downloadDriveFileBuffer(driveFileId);
      return inlineFileResponse(buffer, mimeType, doc.originalFilename);
    } catch (e) {
      console.error("[documents/file] Drive:", e);
    }
  }

  if (
    getGmailEnvStatus().configured &&
    doc.email?.gmailMessageId &&
    doc.gmailAttachmentId
  ) {
    try {
      const gmail = getGmailClient();
      const buf = await downloadAttachment(
        gmail,
        doc.email.gmailMessageId,
        doc.gmailAttachmentId,
      );
      return inlineFileResponse(
        buf,
        doc.mimeType || "application/octet-stream",
        doc.originalFilename,
      );
    } catch (e) {
      console.error("[documents/file] Gmail:", e);
    }
  }

  return NextResponse.json(
    {
      error:
        "Soubor není k dispozici (lokální cesta neplatná, Drive ani Gmail nestáhly přílohu).",
    },
    { status: 404 },
  );
}
