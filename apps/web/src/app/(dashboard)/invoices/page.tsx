import Link from "next/link";

import { type DocumentStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUSES: DocumentStatus[] = [
  "PENDING_APPROVAL",
  "NEEDS_REVIEW",
  "APPROVED",
  "REJECTED",
  "UPLOAD_FAILED",
  "NEW",
  "PARSED",
];

type Props = {
  searchParams: Promise<{ status?: string; q?: string; sort?: string }>;
};

export default async function InvoicesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = sp.q?.trim();
  const sort = sp.sort === "dueDate" ? "dueDate" : "receivedAt";
  const statusFilter = sp.status as DocumentStatus | undefined;

  const where: Prisma.InvoiceWhereInput = {
    document: {
      documentType: "INVOICE",
      ...(statusFilter && STATUSES.includes(statusFilter)
        ? { status: statusFilter }
        : {}),
    },
  };
  if (q) {
    where.OR = [
      { supplierName: { contains: q, mode: "insensitive" } },
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      {
        document: {
          originalFilename: { contains: q, mode: "insensitive" },
        },
      },
    ];
  }

  const orderBy: Prisma.InvoiceOrderByWithRelationInput[] =
    sort === "dueDate"
      ? [{ dueDate: "asc" }]
      : [{ document: { email: { receivedAt: "desc" } } }];

  const rows = await prisma.invoice.findMany({
    where,
    orderBy,
    take: 200,
    include: {
      document: { include: { email: true } },
    },
  });

  const qs = new URLSearchParams();
  if (q) {
    qs.set("q", q);
  }
  if (sp.status) {
    qs.set("status", sp.status);
  }
  if (sort !== "receivedAt") {
    qs.set("sort", sort);
  }
  const baseQs = qs.toString();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Faktury ke schválení</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Filtrace, řazení a fulltext přes dodavatele, číslo faktury a název souboru.
        </p>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4 text-sm"
      >
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <label className="text-muted-foreground text-xs">Fulltext</label>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Dodavatel, soubor, č. faktury…"
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs">Stav</label>
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="border-input bg-background rounded-md border px-3 py-2"
          >
            <option value="">Všechny</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs">Řazení</label>
          <select
            name="sort"
            defaultValue={sort}
            className="border-input bg-background rounded-md border px-3 py-2"
          >
            <option value="receivedAt">Datum přijetí ↓</option>
            <option value="dueDate">Splatnost ↑</option>
          </select>
        </div>
        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 font-medium"
        >
          Použít
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Žádné záznamy.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="p-3 font-medium">Přijato</th>
                <th className="p-3 font-medium">Dodavatel</th>
                <th className="p-3 font-medium">Bez DPH</th>
                <th className="p-3 font-medium">S DPH</th>
                <th className="p-3 font-medium">Splatnost</th>
                <th className="p-3 font-medium">Stav</th>
                <th className="p-3 font-medium">Soubor</th>
                <th className="p-3 font-medium">Jistota</th>
                <th className="p-3 font-medium">Akce</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0">
                  <td className="text-muted-foreground whitespace-nowrap p-3">
                    {inv.document.email.receivedAt.toLocaleString("cs-CZ")}
                  </td>
                  <td className="max-w-[140px] truncate p-3">
                    {inv.supplierName || "—"}
                  </td>
                  <td className="whitespace-nowrap p-3">
                    {inv.amountWithoutVat != null
                      ? `${inv.amountWithoutVat.toString()} ${inv.currency}`
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap p-3">
                    {inv.amountWithVat != null
                      ? `${inv.amountWithVat.toString()} ${inv.currency}`
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap p-3">
                    {inv.dueDate
                      ? inv.dueDate.toLocaleDateString("cs-CZ")
                      : "—"}
                  </td>
                  <td className="p-3 font-mono text-xs">{inv.document.status}</td>
                  <td className="max-w-[120px] truncate p-3" title={inv.document.originalFilename}>
                    {inv.document.originalFilename}
                  </td>
                  <td className="text-muted-foreground p-3">
                    {inv.extractionConfidence != null
                      ? inv.extractionConfidence.toFixed(2)
                      : "—"}
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/invoices/${inv.id}${baseQs ? `?${baseQs}` : ""}`}
                      className="text-primary font-medium underline"
                    >
                      Detail
                    </Link>
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
