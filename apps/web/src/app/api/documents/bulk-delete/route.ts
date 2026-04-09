import { NextResponse } from "next/server";

import { requireRoles, requireSession } from "@/lib/api-session";
import { deleteDocumentById } from "@/services/document-delete";

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

  const raw = body as { documentIds?: unknown };
  if (!Array.isArray(raw.documentIds)) {
    return NextResponse.json({ error: "Chybí pole documentIds." }, { status: 400 });
  }

  const ids = raw.documentIds
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Vyberte alespoň jeden doklad." },
      { status: 400 },
    );
  }

  const userId = session!.user!.id;
  const results: {
    documentId: string;
    ok: boolean;
    error?: string;
    code?: string;
  }[] = [];

  let deleted = 0;
  for (const documentId of ids) {
    const r = await deleteDocumentById(documentId, userId);
    if (r.ok) {
      deleted += 1;
      results.push({ documentId, ok: true });
    } else {
      results.push({
        documentId,
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
