import Link from "next/link";

import { auth } from "@/auth";
import {
  DocumentsInteractiveTable,
  type DocumentTableRow,
} from "@/components/documents-interactive-table";
import { DocumentsPagination } from "@/components/documents-pagination";
import { RequeueFailedDocumentsButton } from "@/components/requeue-failed-documents-button";
import { canRunIntegrationJobs } from "@/lib/api-jobs-auth";
import { isDocumentEligibleForAiRequeue } from "@/lib/document-ai-requeue";
import { prisma } from "@/lib/prisma";
import { getDocumentReviewCapabilities } from "@/services/document-review-resolve";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function DocumentsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const session = await auth();
  const canRunJobs = canRunIntegrationJobs(session?.user?.role);

  const total = await prisma.document.count();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const parsedPage = Number.parseInt(sp.page ?? "1", 10);
  const page =
    Number.isFinite(parsedPage) && parsedPage >= 1
      ? Math.min(parsedPage, totalPages)
      : 1;
  const skip = (page - 1) * PAGE_SIZE;

  const [rows, stuckCount] = await Promise.all([
    prisma.document.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      include: {
        email: true,
        invoice: { select: { id: true, supplierName: true, amountWithVat: true } },
        paymentProof: { select: { id: true } },
      },
    }),
    prisma.document.count({
      where: { status: "ERROR", documentType: "UNCLASSIFIED" },
    }),
  ]);

  const tableRows: DocumentTableRow[] = rows.map((r) => {
    const caps = getDocumentReviewCapabilities({
      documentType: r.documentType,
      status: r.status,
      invoice: r.invoice ? { id: r.invoice.id } : null,
      paymentProof: r.paymentProof ? { id: r.paymentProof.id } : null,
    });
    return {
      id: r.id,
      receivedAtLabel: r.email.receivedAt.toLocaleString("cs-CZ"),
      supplierName: r.invoice?.supplierName ?? null,
      amountWithVatLabel:
        r.invoice?.amountWithVat != null ? r.invoice.amountWithVat.toString() : null,
      documentType: r.documentType,
      status: r.status,
      needsManualReview: r.needsManualReview,
      invoiceId: r.invoice?.id ?? null,
      canRequeueAi: isDocumentEligibleForAiRequeue({
        status: r.status,
        documentType: r.documentType,
        invoice: r.invoice,
        paymentProof: r.paymentProof,
      }),
      canDeleteDocument: canRunJobs && r.status !== "APPROVED",
      canConfirmPayment: canRunJobs && caps.canConfirmPayment,
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Všechny doklady</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Kompletní přehled podle data přijetí — po {PAGE_SIZE} záznamech na stránku, nejnovější nahoře.
        </p>
      </div>
      {canRunJobs ? (
        <RequeueFailedDocumentsButton stuckCount={stuckCount} />
      ) : stuckCount > 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
          {stuckCount} dokladů je ve stavu ERROR / UNCLASSIFIED. Opravu fronty (zařazení zpět pro AI) může provést
          administrátor nebo schvalovatel na této stránce.
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Zatím žádné doklady. Spusť stahování z Gmailu v{" "}
          <Link href="/settings" className="text-primary underline">
            Nastavení
          </Link>
          .
        </p>
      ) : (
        <>
          <DocumentsInteractiveTable rows={tableRows} canRunJobs={canRunJobs} />
          <DocumentsPagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
          />
        </>
      )}
    </div>
  );
}
