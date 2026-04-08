import { auth } from "@/auth";
import {
  NeedsReviewTable,
  type NeedsReviewRowDto,
} from "@/components/needs-review-table";
import { canRunIntegrationJobs } from "@/lib/api-jobs-auth";
import { prisma } from "@/lib/prisma";
import { getDocumentReviewCapabilities } from "@/services/document-review-resolve";

export const dynamic = "force-dynamic";

function shortNote(parseError: string | null, needsManualReview: boolean): string {
  const base =
    parseError?.trim() || (needsManualReview ? "Ruční kontrola" : "—");
  return base.length > 500 ? `${base.slice(0, 500)}…` : base;
}

export default async function NeedsReviewPage() {
  const session = await auth();
  const canAct = canRunIntegrationJobs(session?.user?.role);

  const rows = await prisma.document.findMany({
    where: {
      OR: [{ status: "NEEDS_REVIEW" }, { documentType: "UNKNOWN" }],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      email: true,
      invoice: { select: { id: true } },
      paymentProof: { select: { id: true } },
    },
  });

  const dtos: NeedsReviewRowDto[] = rows.map((d) => {
    const caps = getDocumentReviewCapabilities(d);
    return {
      documentId: d.id,
      receivedAtLabel: d.email.receivedAt.toLocaleString("cs-CZ"),
      documentType: d.documentType,
      status: d.status,
      originalFilename: d.originalFilename,
      noteShort: shortNote(d.parseError, d.needsManualReview),
      noteFull: d.parseError,
      invoiceId: d.invoice?.id ?? null,
      fileUrl: `/api/documents/${d.id}/file`,
      canRequeueAi: caps.canRequeueAi,
      canConfirmInvoice: caps.canConfirmInvoice,
      canConfirmPayment: caps.canConfirmPayment,
      canDismiss: caps.canDismiss,
      canRejectInvoice: caps.canRejectInvoice,
      canDeleteDocument: canAct && d.status !== "APPROVED",
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ke kontrole</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Neznámé typy, nízká jistota AI nebo chyby uploadu / parsování.
        </p>
        {!canAct && (
          <p className="text-muted-foreground mt-2 text-xs">
            Akce vyřešení kontroly vidí jen administrátor nebo schvalovatel.
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nic k řešení.</p>
      ) : (
        <NeedsReviewTable rows={dtos} canAct={canAct} />
      )}
    </div>
  );
}
