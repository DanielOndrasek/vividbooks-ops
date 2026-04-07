import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const rows = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      email: true,
      invoice: { select: { id: true, supplierName: true, amountWithVat: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Všechny doklady</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Posledních 50 příloh v systému (přehled).
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Zatím žádné doklady. Spusť stahování z Gmailu v{" "}
          <Link href="/settings" className="text-primary underline">
            Nastavení
          </Link>
          .
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="p-3 font-medium">Přijato</th>
                <th className="p-3 font-medium">Dodavatel</th>
                <th className="p-3 font-medium">Částka</th>
                <th className="p-3 font-medium">Typ</th>
                <th className="p-3 font-medium">Stav</th>
                <th className="p-3 font-medium">Kontrola</th>
                <th className="p-3 font-medium">Odkaz</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={
                    r.needsManualReview
                      ? "border-b border-amber-300/80 bg-amber-50/50 last:border-0 dark:bg-amber-950/20"
                      : "border-b last:border-0"
                  }
                >
                  <td className="text-muted-foreground whitespace-nowrap p-3">
                    {r.email.receivedAt.toLocaleString("cs-CZ")}
                  </td>
                  <td className="max-w-[160px] truncate p-3">
                    {r.invoice?.supplierName || "—"}
                  </td>
                  <td className="whitespace-nowrap p-3">
                    {r.invoice?.amountWithVat != null
                      ? r.invoice.amountWithVat.toString()
                      : "—"}
                  </td>
                  <td className="p-3 font-mono text-xs">{r.documentType}</td>
                  <td className="p-3 font-mono text-xs">{r.status}</td>
                  <td className="p-3">
                    {r.needsManualReview ? (
                      <span className="text-amber-800 dark:text-amber-200 text-xs font-medium">
                        Ano
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {r.invoice ? (
                      <Link href={`/invoices/${r.invoice.id}`} className="text-primary underline">
                        Detail
                      </Link>
                    ) : (
                      <Link
                        href={`/api/documents/${r.id}/file`}
                        className="text-primary text-xs underline"
                      >
                        Soubor
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
