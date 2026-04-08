import Link from "next/link";
import { AlertCircle, ClipboardList, CloudUpload, Inbox } from "lucide-react";

import { auth } from "@/auth";
import { PollEmailButton } from "@/components/poll-email-button";
import { ProcessDocumentsButton } from "@/components/process-documents-button";
import { canRunIntegrationJobs } from "@/lib/api-jobs-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const canRunJobs = canRunIntegrationJobs(session?.user?.role);

  const [pendingInvoices, needsReview, paymentStored, aiQueue, lastJobs] =
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
        select: { id: true, type: true, status: true, createdAt: true },
      }),
    ]);

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
            lastJobs.map((j) => (
              <li
                key={j.id}
                className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-2 rounded-lg px-2 py-2 text-sm odd:bg-muted/25"
              >
                <span className="font-mono text-xs text-foreground">{j.type}</span>
                <span className="text-xs">{j.status}</span>
                <span className="text-xs tabular-nums">
                  {j.createdAt.toLocaleString("cs-CZ")}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
