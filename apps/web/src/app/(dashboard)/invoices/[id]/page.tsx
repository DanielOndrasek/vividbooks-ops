import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { DocumentPreview } from "@/components/document-preview";
import { InvoiceActions } from "@/components/invoice-actions";
import {
  InvoiceMetadataForm,
  type InvoiceMetadataInitial,
} from "@/components/invoice-metadata-form";
import { PohodaExportRetryButton } from "@/components/pohoda-export-retry-button";
import { prisma } from "@/lib/prisma";
import { isInvoiceConvertibleToPaymentProof } from "@/services/invoice-convert-to-payment";

export const dynamic = "force-dynamic";

function formatConfidence(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

const AUDIT_METADATA_MAX = 6000;

function safeStringifyMetadata(metadata: unknown): string {
  try {
    const s = JSON.stringify(metadata, (_key, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    if (s.length > AUDIT_METADATA_MAX) {
      return `${s.slice(0, AUDIT_METADATA_MAX)}… (zkráceno)`;
    }
    return s;
  } catch {
    const fallback = String(metadata);
    return fallback.length > AUDIT_METADATA_MAX
      ? `${fallback.slice(0, AUDIT_METADATA_MAX)}…`
      : fallback;
  }
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function InvoiceDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth();
  const role = session?.user?.role;
  const canAct =
    role === "ADMIN" || role === "APPROVER";
  const canEdit =
    role === "ADMIN" || role === "APPROVER";

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      document: { include: { email: true } },
      approvedBy: { select: { name: true, email: true } },
    },
  });

  if (!invoice) {
    notFound();
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: "Invoice", entityId: invoice.id },
        { entityType: "Document", entityId: invoice.documentId },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { email: true } } },
  });

  const backQs = new URLSearchParams();
  if (sp.q) {
    backQs.set("q", sp.q);
  }
  if (sp.status) {
    backQs.set("status", sp.status);
  }
  if (sp.sort) {
    backQs.set("sort", sp.sort);
  }
  const backHref = `/invoices${backQs.toString() ? `?${backQs}` : ""}`;

  const previewSrc = `/api/documents/${invoice.documentId}/file`;

  const metadataInitial: InvoiceMetadataInitial = {
    supplierName: invoice.supplierName,
    supplierICO: invoice.supplierICO,
    supplierDIC: invoice.supplierDIC,
    supplierStreet: invoice.supplierStreet,
    supplierCity: invoice.supplierCity,
    supplierZip: invoice.supplierZip,
    supplierCountry: invoice.supplierCountry,
    amountWithoutVat: invoice.amountWithoutVat?.toString() ?? null,
    amountWithVat: invoice.amountWithVat?.toString() ?? null,
    vatAmount: invoice.vatAmount?.toString() ?? null,
    vatRate: invoice.vatRate?.toString() ?? null,
    dueDate: invoice.dueDate?.toISOString() ?? null,
    issueDate: invoice.issueDate?.toISOString() ?? null,
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency,
    variableSymbol: invoice.variableSymbol,
    constantSymbol: invoice.constantSymbol,
    specificSymbol: invoice.specificSymbol,
    bankAccount: invoice.bankAccount,
    iban: invoice.iban,
    domesticAccount: invoice.domesticAccount,
    bic: invoice.bic,
    documentKind: invoice.documentKind,
  };

  const linesPreview =
    Array.isArray(invoice.invoiceLines) && invoice.invoiceLines.length > 0
      ? safeStringifyMetadata(invoice.invoiceLines)
      : null;
  const showActions =
    canAct &&
    (invoice.document.status === "PENDING_APPROVAL" ||
      invoice.document.status === "NEEDS_REVIEW");

  const canConvertToPayment =
    canAct &&
    isInvoiceConvertibleToPaymentProof(
      invoice.document.documentType,
      invoice.document.status,
    );

  const showInvoiceActionBlock =
    canAct &&
    (showActions ||
      canConvertToPayment ||
      invoice.document.status !== "APPROVED");

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={backHref}
          className="text-muted-foreground hover:text-foreground text-sm underline"
        >
          ← Zpět na přehled
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Faktura — {invoice.document.originalFilename}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Stav: <code className="bg-muted rounded px-1">{invoice.document.status}</code>
          {" · "}
          Přijato: {invoice.document.email.receivedAt.toLocaleString("cs-CZ")}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="font-medium">Náhled</h2>
          <div className="bg-muted/30 aspect-[3/4] max-h-[720px] overflow-hidden rounded-lg border">
            <DocumentPreview
              fileUrl={previewSrc}
              mimeType={invoice.document.mimeType}
              title="Náhled PDF"
            />
          </div>
        </section>

        <div className="space-y-8">
          <section className="space-y-3 rounded-lg border bg-card p-5">
            <h2 className="font-medium">Metadata</h2>
            <InvoiceMetadataForm
              invoiceId={invoice.id}
              canEdit={canEdit && showActions}
              initial={metadataInitial}
            />
            <p className="text-muted-foreground text-xs">
              Klasifikace: {formatConfidence(invoice.document.classificationConfidence)} ·
              Extrakce: {formatConfidence(invoice.extractionConfidence)}
              {invoice.missingStructuredLines
                ? " · Řádky faktury: pouze souhrn (doporučena kontrola)"
                : ""}
            </p>
            {linesPreview && (
              <details className="text-xs">
                <summary className="cursor-pointer font-medium">
                  Extrahované řádky (JSON)
                </summary>
                <pre className="bg-muted/50 mt-2 max-h-48 overflow-auto rounded p-2">
                  {linesPreview}
                </pre>
              </details>
            )}
          </section>

          <section className="space-y-2 rounded-lg border bg-card p-5">
            <h2 className="font-medium">Export POHODA</h2>
            <dl className="grid gap-1 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Stav</dt>
                <dd className="font-mono text-xs">{invoice.pohodaExportStatus}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Odesláno</dt>
                <dd className="text-xs">
                  {invoice.pohodaExportedAt
                    ? invoice.pohodaExportedAt.toLocaleString("cs-CZ")
                    : "—"}
                </dd>
              </div>
              {invoice.pohodaExternalId && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Externí ID / reference</dt>
                  <dd className="break-all font-mono text-xs">{invoice.pohodaExternalId}</dd>
                </div>
              )}
              {invoice.pohodaExportLastError && (
                <div className="sm:col-span-2">
                  <dt className="text-destructive">Poslední chyba</dt>
                  <dd className="text-destructive text-xs whitespace-pre-wrap">
                    {invoice.pohodaExportLastError}
                  </dd>
                </div>
              )}
            </dl>
            {canAct &&
              invoice.document.status === "APPROVED" &&
              invoice.pohodaExportStatus !== "EXPORTED" && (
                <PohodaExportRetryButton invoiceId={invoice.id} />
              )}
          </section>

          {invoice.driveUrl && (
            <p className="text-sm">
              <a
                href={invoice.driveUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Otevřít na Google Drive
              </a>
            </p>
          )}

          {invoice.rejectionReason && (
            <p className="text-destructive text-sm">
              Zamítnuto: {invoice.rejectionReason}
            </p>
          )}

          {invoice.approvedAt && (
            <p className="text-muted-foreground text-sm">
              Schválení / rozhodnutí:{" "}
              {invoice.approvedAt.toLocaleString("cs-CZ")}
              {invoice.approvedBy?.email
                ? ` · ${invoice.approvedBy.email}`
                : ""}
            </p>
          )}

          {showInvoiceActionBlock && (
            <section className="space-y-2">
              <h2 className="font-medium">Akce</h2>
              <InvoiceActions
                invoiceId={invoice.id}
                documentId={invoice.documentId}
                documentStatus={invoice.document.status}
                canAct={canAct}
                showApproveReject={showActions}
                canConvertToPayment={canConvertToPayment}
                afterDeleteHref={backHref}
              />
            </section>
          )}

          <section className="space-y-2">
            <h2 className="font-medium">Historie (audit)</h2>
            <ul className="text-muted-foreground max-h-64 space-y-2 overflow-y-auto text-xs">
              {logs.length === 0 ? (
                <li>Žádné záznamy.</li>
              ) : (
                logs.map((l) => (
                  <li key={l.id} className="border-b border-dashed pb-2 last:border-0">
                    <span className="text-foreground font-mono">{l.action}</span> ·{" "}
                    {l.createdAt.toLocaleString("cs-CZ")}
                    {l.user?.email ? ` · ${l.user.email}` : ""}
                    {l.metadata ? (
                      <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted/50 p-2">
                        {safeStringifyMetadata(l.metadata)}
                      </pre>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
