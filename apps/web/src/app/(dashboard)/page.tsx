import Link from "next/link";
import { DocumentType } from "@prisma/client";
import {
  AlertCircle,
  BarChart3,
  ClipboardList,
  CloudUpload,
  Inbox,
} from "lucide-react";

import { auth } from "@/auth";
import { PollEmailButton } from "@/components/poll-email-button";
import { ProcessDocumentsButton } from "@/components/process-documents-button";
import { canRunIntegrationJobs } from "@/lib/api-jobs-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type MonthlyDownloadsRow = {
  key: string;
  label: string;
  invoices: number;
  paymentProofs: number;
  invoiceAmountWithoutVat: number;
  invoiceAmountWithVat: number;
  paymentProofAmount: number;
};

type MonthlyDocumentForReport = {
  createdAt: Date;
  documentType: DocumentType;
  invoice: {
    amountWithoutVat: { toString(): string } | null;
    amountWithVat: { toString(): string } | null;
  } | null;
  paymentProof: {
    amount: { toString(): string } | null;
  } | null;
};

function startOfCurrentMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfNextMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function decimalToNumber(value: { toString(): string } | null | undefined): number {
  if (value == null) {
    return 0;
  }
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 2,
  }).format(value);
}

function buildCurrentMonthRows(
  now: Date,
  docs: MonthlyDocumentForReport[],
): MonthlyDownloadsRow[] {
  const start = startOfCurrentMonth(now);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const byDay = new Map<string, MonthlyDownloadsRow>();

  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = dateKey(d);
    byDay.set(key, {
      key,
      label: d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" }),
      invoices: 0,
      paymentProofs: 0,
      invoiceAmountWithoutVat: 0,
      invoiceAmountWithVat: 0,
      paymentProofAmount: 0,
    });
  }

  for (const doc of docs) {
    const key = dateKey(doc.createdAt);
    const row = byDay.get(key);
    if (!row) {
      continue;
    }
    if (doc.documentType === DocumentType.INVOICE) {
      row.invoices += 1;
      row.invoiceAmountWithoutVat += decimalToNumber(doc.invoice?.amountWithoutVat);
      row.invoiceAmountWithVat += decimalToNumber(doc.invoice?.amountWithVat);
    } else if (doc.documentType === DocumentType.PAYMENT_RECEIPT) {
      row.paymentProofs += 1;
      row.paymentProofAmount += decimalToNumber(doc.paymentProof?.amount);
    }
  }

  return [...byDay.values()];
}

function sumMonthlyDownloads(rows: MonthlyDownloadsRow[]) {
  return rows.reduce(
    (acc, row) => ({
      invoices: acc.invoices + row.invoices,
      paymentProofs: acc.paymentProofs + row.paymentProofs,
      invoiceAmountWithoutVat:
        acc.invoiceAmountWithoutVat + row.invoiceAmountWithoutVat,
      invoiceAmountWithVat: acc.invoiceAmountWithVat + row.invoiceAmountWithVat,
      paymentProofAmount: acc.paymentProofAmount + row.paymentProofAmount,
    }),
    {
      invoices: 0,
      paymentProofs: 0,
      invoiceAmountWithoutVat: 0,
      invoiceAmountWithVat: 0,
      paymentProofAmount: 0,
    },
  );
}

/** Krátký text do nástěnky z metadata jobu email_fetch (adresy odesílatelů + počty). */
function emailFetchJobSummary(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const m = metadata as Record<string, unknown>;
  const pm = m.perMessage ?? m.partialPerMessage;
  if (!Array.isArray(pm) || pm.length === 0) {
    return null;
  }
  const parts: string[] = [];
  for (const row of pm.slice(0, 6)) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const r = row as Record<string, unknown>;
    const addr = typeof r.senderEmail === "string" ? r.senderEmail : null;
    const sub =
      typeof r.subject === "string" && r.subject.length > 0
        ? r.subject.length > 44
          ? `${r.subject.slice(0, 44)}…`
          : r.subject
        : null;
    const head = addr ?? sub ?? String(r.gmailMessageId ?? "").slice(0, 12);
    const d = typeof r.documentsCreated === "number" ? r.documentsCreated : 0;
    const s = typeof r.skippedDuplicates === "number" ? r.skippedDuplicates : 0;
    const e = typeof r.eligibleAttachments === "number" ? r.eligibleAttachments : 0;
    parts.push(`${head} — ${d} nových dokl., ${s} přeskočeno, ${e} příloh v mailu`);
  }
  if (pm.length > 6) {
    parts.push(`… +${pm.length - 6} dalších zpráv`);
  }
  return parts.join(" · ");
}

export default async function DashboardPage() {
  const session = await auth();
  const canRunJobs = canRunIntegrationJobs(session?.user?.role);
  const now = new Date();
  const monthStart = startOfCurrentMonth(now);
  const nextMonthStart = startOfNextMonth(now);

  const [pendingInvoices, needsReview, paymentStored, aiQueue, lastJobs, monthDocs] =
    await Promise.all([
      prisma.invoice.count({
        where: {
          document: { status: { in: ["PENDING_APPROVAL", "NEEDS_REVIEW"] } },
        },
      }),
      prisma.document.count({
        where: {
          OR: [{ status: "NEEDS_REVIEW" }, { documentType: "UNKNOWN" }],
        },
      }),
      prisma.paymentProof.count({ where: { storedAt: { not: null } } }),
      prisma.document.count({
        where: { status: "NEW", documentType: "UNCLASSIFIED" },
      }),
      prisma.processingJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          type: true,
          status: true,
          createdAt: true,
          metadata: true,
        },
      }),
      prisma.document.findMany({
        where: {
          createdAt: { gte: monthStart, lt: nextMonthStart },
          documentType: {
            in: [DocumentType.INVOICE, DocumentType.PAYMENT_RECEIPT],
          },
        },
        select: {
          createdAt: true,
          documentType: true,
          invoice: {
            select: {
              amountWithoutVat: true,
              amountWithVat: true,
            },
          },
          paymentProof: {
            select: {
              amount: true,
            },
          },
        },
      }),
    ]);
  const monthlyRows = buildCurrentMonthRows(now, monthDocs);
  const monthlyTotals = sumMonthlyDownloads(monthlyRows);
  const monthlyMax = Math.max(
    1,
    ...monthlyRows.map((r) => Math.max(r.invoices, r.paymentProofs)),
  );
  const monthLabel = now.toLocaleDateString("cs-CZ", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="text-primary text-sm font-medium tracking-wide uppercase">
          Nástěnka
        </p>
        <h1 className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
          Co je potřeba vyřídit
        </h1>
        <p className="text-muted-foreground max-w-2xl text-base leading-relaxed">
          Faktury a doklady z e-mailu, schvalování a ukládání na disk — na jednom místě.
        </p>
      </header>

      <section aria-label="Souhrn">
        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/invoices?status=PENDING_APPROVAL"
            className="group border-border/80 from-card to-muted/20 hover:border-primary/25 relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-sm transition-all hover:shadow-md"
          >
            <div className="text-primary mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <ClipboardList className="size-5" aria-hidden />
            </div>
            <div className="text-muted-foreground text-sm font-medium">
              Čeká na schválení
            </div>
            <div className="text-foreground mt-1 text-3xl font-semibold tabular-nums tracking-tight">
              {pendingInvoices}
            </div>
            <span className="text-primary mt-3 inline-block text-sm font-medium opacity-0 transition-opacity group-hover:opacity-100">
              Otevřít faktury →
            </span>
          </Link>
          <Link
            href="/needs-review"
            className="group border-border/80 from-card to-muted/20 hover:border-amber-500/30 relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-sm transition-all hover:shadow-md"
          >
            <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
              <AlertCircle className="size-5" aria-hidden />
            </div>
            <div className="text-muted-foreground text-sm font-medium">Ke kontrole</div>
            <div className="text-foreground mt-1 text-3xl font-semibold tabular-nums tracking-tight">
              {needsReview}
            </div>
            <span className="mt-3 inline-block text-sm font-medium text-amber-700 opacity-0 transition-opacity group-hover:opacity-100 dark:text-amber-400">
              Zkontrolovat →
            </span>
          </Link>
          <Link
            href="/payment-proofs"
            className="group border-border/80 from-card to-muted/20 hover:border-primary/25 relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-sm transition-all hover:shadow-md"
          >
            <div className="text-primary mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <CloudUpload className="size-5" aria-hidden />
            </div>
            <div className="text-muted-foreground text-sm font-medium">
              Uloženo na Drive
            </div>
            <div className="text-foreground mt-1 text-3xl font-semibold tabular-nums tracking-tight">
              {paymentStored}
            </div>
            <span className="text-primary mt-3 inline-block text-sm font-medium opacity-0 transition-opacity group-hover:opacity-100">
              Zobrazit platby →
            </span>
          </Link>
        </div>
      </section>

      <section className="border-border/70 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-5 flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
            <BarChart3 className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Stažené doklady za aktuální měsíc
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Přehled podle data stažení do aplikace ({monthLabel}) — faktury a
              doklady o platbě zvlášť.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="text-muted-foreground text-sm">Faktury</div>
            <div className="text-foreground mt-1 text-3xl font-semibold tabular-nums">
              {monthlyTotals.invoices}
            </div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="text-muted-foreground text-sm">Doklady o platbě</div>
            <div className="text-foreground mt-1 text-3xl font-semibold tabular-nums">
              {monthlyTotals.paymentProofs}
            </div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="text-muted-foreground text-sm">Celkem</div>
            <div className="text-foreground mt-1 text-3xl font-semibold tabular-nums">
              {monthlyTotals.invoices + monthlyTotals.paymentProofs}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="text-muted-foreground text-sm">Faktury bez DPH</div>
            <div className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
              {formatCurrency(monthlyTotals.invoiceAmountWithoutVat)}
            </div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="text-muted-foreground text-sm">Faktury s DPH</div>
            <div className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
              {formatCurrency(monthlyTotals.invoiceAmountWithVat)}
            </div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="text-muted-foreground text-sm">Doklady o platbě (celkem)</div>
            <div className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
              {formatCurrency(monthlyTotals.paymentProofAmount)}
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="flex h-48 items-end gap-2 border-b border-l px-3 pt-4">
              {monthlyRows.map((row) => (
                <div
                  key={row.key}
                  className="flex min-w-0 flex-1 items-end justify-center gap-1"
                >
                  <div
                    className="bg-primary/80 w-3 rounded-t"
                    style={{
                      height:
                        row.invoices === 0
                          ? 0
                          : `${Math.max(3, (row.invoices / monthlyMax) * 100)}%`,
                    }}
                    title={`${row.label}: faktury ${row.invoices}`}
                  />
                  <div
                    className="w-3 rounded-t bg-amber-500/80"
                    style={{
                      height:
                        row.paymentProofs === 0
                          ? 0
                          : `${Math.max(3, (row.paymentProofs / monthlyMax) * 100)}%`,
                    }}
                    title={`${row.label}: doklady o platbě ${row.paymentProofs}`}
                  />
                </div>
              ))}
            </div>
            <div className="text-muted-foreground mt-2 flex gap-2 px-3 text-[10px]">
              {monthlyRows.map((row) => (
                <div key={row.key} className="min-w-0 flex-1 text-center">
                  {row.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-primary/80 inline-block size-2.5 rounded-sm" aria-hidden />
            Faktury
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-amber-500/80" aria-hidden />
            Doklady o platbě
          </span>
          <span>
            Zdroj: dokumenty stažené v tomto měsíci (<code>Document.createdAt</code>) s typem{" "}
            <code>INVOICE</code> / <code>PAYMENT_RECEIPT</code>.
            U dokladů o platbě je v databázi evidovaná jedna celková částka, ne samostatný základ
            bez DPH.
          </span>
        </div>

        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-medium">Denní tabulka</summary>
          <div className="mt-3 max-h-72 overflow-auto rounded-lg border">
            <table className="min-w-[980px] w-full text-left text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-2 font-medium">Den</th>
                  <th className="p-2 text-right font-medium">Faktury</th>
                  <th className="p-2 text-right font-medium">Doklady o platbě</th>
                  <th className="p-2 text-right font-medium">Celkem</th>
                  <th className="p-2 text-right font-medium">Faktury bez DPH</th>
                  <th className="p-2 text-right font-medium">Faktury s DPH</th>
                  <th className="p-2 text-right font-medium">Doklady celkem</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.map((row) => (
                  <tr key={row.key} className="border-t">
                    <td className="p-2">{row.label}</td>
                    <td className="p-2 text-right tabular-nums">{row.invoices}</td>
                    <td className="p-2 text-right tabular-nums">{row.paymentProofs}</td>
                    <td className="p-2 text-right tabular-nums">
                      {row.invoices + row.paymentProofs}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatCurrency(row.invoiceAmountWithoutVat)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatCurrency(row.invoiceAmountWithVat)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatCurrency(row.paymentProofAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="border-border/70 from-card to-muted/10 rounded-2xl border bg-gradient-to-br p-6 shadow-sm sm:p-8">
        <div className="mb-4 flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
            <Inbox className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Stáhnout a zpracovat</h2>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed">
              Nové přílohy ze schránky a extrakce údajů umělou inteligencí. Stejné akce najdete i v{" "}
              <Link
                href="/settings"
                className="text-primary font-medium underline-offset-4 hover:underline"
              >
                Nastavení
              </Link>
              . Ve frontě na zpracování je{" "}
              <strong className="text-foreground">{aiQueue}</strong> dokladů — při větším počtu
              úlohu opakujte, dokud nebude fronta prázdná.
            </p>
          </div>
        </div>
        {canRunJobs ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <PollEmailButton />
            <ProcessDocumentsButton />
          </div>
        ) : (
          <p className="text-muted-foreground mt-4 rounded-xl bg-muted/50 px-4 py-3 text-sm">
            Tyto akce mohou spustit jen <strong className="text-foreground">schvalovatel</strong>{" "}
            nebo <strong className="text-foreground">administrátor</strong>.
          </p>
        )}
      </section>

      <section className="border-border/70 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold tracking-tight">Poslední úlohy</h2>
        <ul className="mt-4 space-y-2">
          {lastJobs.length === 0 ? (
            <li className="text-muted-foreground text-sm">Zatím žádné záznamy.</li>
          ) : (
            lastJobs.map((j) => {
              const fetchHint =
                j.type === "email_fetch" ? emailFetchJobSummary(j.metadata) : null;
              return (
                <li
                  key={j.id}
                  className="text-muted-foreground space-y-1 rounded-lg px-2 py-2 text-sm odd:bg-muted/25"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-xs text-foreground">{j.type}</span>
                    <span className="text-xs">{j.status}</span>
                    <span className="text-xs tabular-nums">
                      {j.createdAt.toLocaleString("cs-CZ")}
                    </span>
                  </div>
                  {fetchHint ? (
                    <p className="text-muted-foreground pl-0.5 text-xs leading-snug">{fetchHint}</p>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </section>
    </div>
  );
}
