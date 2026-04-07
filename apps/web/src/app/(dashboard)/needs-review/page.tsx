import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NeedsReviewPage() {
  const rows = await prisma.document.findMany({
    where: {
      OR: [{ status: "NEEDS_REVIEW" }, { documentType: "UNKNOWN" }],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      email: true,
      invoice: true,
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ke kontrole</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Neznámé typy, nízká jistota AI nebo chyby uploadu / parsování.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nic k řešení.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="p-3 font-medium">Přijato</th>
                <th className="p-3 font-medium">Typ</th>
                <th className="p-3 font-medium">Stav</th>
                <th className="p-3 font-medium">Soubor</th>
                <th className="p-3 font-medium">Chyba / pozn.</th>
                <th className="p-3 font-medium">Akce</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="text-muted-foreground whitespace-nowrap p-3">
                    {d.email.receivedAt.toLocaleString("cs-CZ")}
                  </td>
                  <td className="p-3 font-mono text-xs">{d.documentType}</td>
                  <td className="p-3 font-mono text-xs">{d.status}</td>
                  <td className="max-w-[160px] truncate p-3" title={d.originalFilename}>
                    {d.originalFilename}
                  </td>
                  <td className="text-muted-foreground max-w-[240px] truncate p-3 text-xs">
                    {d.parseError || (d.needsManualReview ? "Ruční kontrola" : "—")}
                  </td>
                  <td className="p-3">
                    {d.invoice ? (
                      <Link
                        href={`/invoices/${d.invoice.id}`}
                        className="text-primary underline"
                      >
                        Faktura
                      </Link>
                    ) : (
                      <Link
                        href={`/api/documents/${d.id}/file`}
                        className="text-primary text-xs underline"
                      >
                        Náhled
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
