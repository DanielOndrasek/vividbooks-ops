import { auth } from "@/auth";
import { CollapsibleFilters } from "@/components/collapsible-filters";
import {
  InvoicesListTable,
  type InvoiceListRowDto,
} from "@/components/invoices-list-table";
import { Button } from "@/components/ui/button";
import { type DocumentStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isInvoiceConvertibleToPaymentProof } from "@/services/invoice-convert-to-payment";

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
  const session = await auth();
  const role = session?.user?.role;
  const canAct = role === "ADMIN" || role === "APPROVER";

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

  const tableRows: InvoiceListRowDto[] = rows.map((inv) => {
    const st = inv.document.status;
    const canApprove =
      canAct && (st === "PENDING_APPROVAL" || st === "NEEDS_REVIEW");
    const canConvertToPayment =
      canAct &&
      isInvoiceConvertibleToPaymentProof(inv.document.documentType, inv.document.status);
    return {
      id: inv.id,
      documentId: inv.documentId,
      receivedAtLabel: inv.document.email.receivedAt.toLocaleString("cs-CZ"),
      supplierName: inv.supplierName,
      amountWithoutVatLabel:
        inv.amountWithoutVat != null
          ? `${inv.amountWithoutVat.toString()} ${inv.currency}`
          : null,
      amountWithVatLabel:
        inv.amountWithVat != null
          ? `${inv.amountWithVat.toString()} ${inv.currency}`
          : null,
      dueDateLabel: inv.dueDate
        ? inv.dueDate.toLocaleDateString("cs-CZ")
        : null,
      documentType: inv.document.documentType,
      documentStatus: st,
      needsManualReview: inv.document.needsManualReview,
      detailHref: `/invoices/${inv.id}${baseQs ? `?${baseQs}` : ""}`,
      canApprove,
      canConvertToPayment,
      canDeleteDocument: canAct && st !== "APPROVED",
    };
  });

  const filtersActive = Boolean(q || (sp.status && sp.status.length > 0));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Faktury ke schválení</h1>
      </div>

      <CollapsibleFilters
        defaultOpen={filtersActive}
        summary="Vyhledávání a filtry"
      >
        <form
          method="get"
          className="flex flex-wrap items-end gap-3 border-t p-4 text-sm"
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
          <Button type="submit">Použít</Button>
        </form>
      </CollapsibleFilters>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Žádné záznamy.</p>
      ) : (
        <InvoicesListTable rows={tableRows} canAct={canAct} />
      )}
    </div>
  );
}
