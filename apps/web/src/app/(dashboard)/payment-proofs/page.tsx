import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PaymentProofsPage() {
  const rows = await prisma.paymentProof.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      document: { include: { email: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Doklady o platbě</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Okamžitý upload na Drive po zpracování. Evidence zdroje a cesty.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Zatím žádné záznamy.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="p-3 font-medium">Typ / pozn.</th>
                <th className="p-3 font-medium">Přijato</th>
                <th className="p-3 font-medium">Zpracováno e-mailu</th>
                <th className="p-3 font-medium">Soubor</th>
                <th className="p-3 font-medium">Stav</th>
                <th className="p-3 font-medium">Uloženo</th>
                <th className="p-3 font-medium">Odkaz</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="max-w-[200px] p-3">
                    <div className="font-medium">{p.proofType || "—"}</div>
                    {p.note && (
                      <div className="text-muted-foreground truncate text-xs" title={p.note}>
                        {p.note}
                      </div>
                    )}
                  </td>
                  <td className="text-muted-foreground whitespace-nowrap p-3">
                    {p.document.email.receivedAt.toLocaleString("cs-CZ")}
                  </td>
                  <td className="text-muted-foreground whitespace-nowrap p-3">
                    {p.document.email.processedAt?.toLocaleString("cs-CZ") ?? "—"}
                  </td>
                  <td className="max-w-[140px] truncate p-3" title={p.document.originalFilename}>
                    {p.document.originalFilename}
                  </td>
                  <td className="p-3 font-mono text-xs">{p.document.status}</td>
                  <td className="text-muted-foreground whitespace-nowrap p-3">
                    {p.storedAt?.toLocaleString("cs-CZ") ?? "—"}
                  </td>
                  <td className="p-3">
                    {p.driveUrl ? (
                      <a
                        href={p.driveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline"
                      >
                        Drive
                      </a>
                    ) : (
                      <a
                        href={`/api/documents/${p.documentId}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary text-xs underline"
                      >
                        Náhled
                      </a>
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
