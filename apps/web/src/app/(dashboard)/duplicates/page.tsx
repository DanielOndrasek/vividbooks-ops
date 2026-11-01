import Link from "next/link";

import { auth } from "@/auth";
import { RestoreDuplicateButton } from "@/components/restore-duplicate-button";
import { canRunIntegrationJobs } from "@/lib/api-jobs-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  const session = await auth();
  const canAct = canRunIntegrationJobs(session?.user?.role);

  const rows = await prisma.document.findMany({
    where: { status: "DUPLICATE" },
    orderBy: { updatedAt: "desc" },
    take: 300,
    include: {
      email: { select: { receivedAt: true, senderEmail: true, subject: true } },
      invoice: { select: { id: true, supplierName: true, invoiceNumber: true, amountWithVat: true, currency: true } },
      paymentProof: {
        select: { id: true, counterpartyName: true, documentNumber: true, amount: true, currency: true, note: true },
      },
    },
  });

  const originalIds = Array.from(
    new Set(rows.map((r) => r.duplicateOfDocumentId).filter((x): x is string => Boolean(x))),
  );
  const originals = originalIds.length
    ? await prisma.document.findMany({
        where: { id: { in: originalIds } },
        select: { id: true, originalFilename: true, documentType: true, status: true },
      })
    : [];
  const originalById = new Map(originals.map((o) => [o.id, o]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Duplicity</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          Doklady, které už v evidenci jsou: stejný soubor, stejný dodavatel + číslo + částka, nebo faktura, ke
          které přišla účtenka (účetní stačí účtenka). Ze seznamů faktur a plateb jsou schované, nikam se
          neposílají. Když se pravidlo splete, klikněte na Obnovit.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Žádné duplicity.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2">Přijato</th>
                <th className="p-2">Odesílatel</th>
                <th className="p-2">Typ</th>
                <th className="p-2">Dodavatel</th>
                <th className="p-2">Číslo</th>
                <th className="p-2">Částka</th>
                <th className="p-2">Soubor</th>
                <th className="p-2">Originál</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const supplier = r.invoice?.supplierName ?? r.paymentProof?.counterpartyName ?? "—";
                const number = r.invoice?.invoiceNumber ?? r.paymentProof?.documentNumber ?? "—";
                const amount = r.invoice?.amountWithVat ?? r.paymentProof?.amount ?? null;
                const currency = r.invoice?.currency ?? r.paymentProof?.currency ?? "";
                const orig = r.duplicateOfDocumentId ? originalById.get(r.duplicateOfDocumentId) : null;
                return (
                  <tr key={r.id} className="border-t align-top">
                    <td className="p-2 whitespace-nowrap">{r.email.receivedAt.toLocaleDateString("cs-CZ")}</td>
                    <td className="p-2">{r.email.senderEmail ?? "—"}</td>
                    <td className="p-2">{r.documentType === "PAYMENT_RECEIPT" ? "Platba" : "Faktura"}</td>
                    <td className="p-2">{supplier}</td>
                    <td className="p-2">{number}</td>
                    <td className="p-2 whitespace-nowrap">{amount != null ? `${amount.toString()} ${currency}` : "—"}</td>
                    <td className="p-2">
                      <a className="underline" href={`/api/documents/${r.id}/file`} target="_blank" rel="noreferrer">
                        {r.originalFilename}
                      </a>
                    </td>
                    <td className="p-2">
                      {orig ? (
                        <a className="underline" href={`/api/documents/${orig.id}/file`} target="_blank" rel="noreferrer">
                          {orig.originalFilename}
                        </a>
                      ) : r.duplicateOfDocumentId ? (
                        "(promazáno z DB)"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2">{canAct && <RestoreDuplicateButton documentId={r.id} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        Úklid starších duplicit: <code>POST /api/agent/dedupe-backfill</code> (bez <code>?apply=1</code> jen
        přehled). Více v <Link className="underline" href="/settings">Nastavení</Link>.
      </p>
    </div>
  );
}
