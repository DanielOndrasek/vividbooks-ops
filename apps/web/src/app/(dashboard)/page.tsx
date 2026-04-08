import Link from "next/link";

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Jedna aplikace pro doklady z Gmailu, schvalování faktur, platby na Drive a výpočet provizí
          z Pipedrive. Přihlášen jako <strong>{session?.user?.email}</strong>, role{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">
            {session?.user?.role ?? "—"}
          </code>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/invoices?status=PENDING_APPROVAL"
          className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
        >
          <div className="text-muted-foreground text-sm">Čeká / ke schválení</div>
          <div className="text-2xl font-semibold">{pendingInvoices}</div>
        </Link>
        <Link
          href="/needs-review"
          className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
        >
          <div className="text-muted-foreground text-sm">Ke kontrole</div>
          <div className="text-2xl font-semibold">{needsReview}</div>
        </Link>
        <Link
          href="/payment-proofs"
          className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
        >
          <div className="text-muted-foreground text-sm">Doklady uložené na Drive</div>
          <div className="text-2xl font-semibold">{paymentStored}</div>
        </Link>
      </div>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-medium">Ruční úlohy (Gmail → AI)</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Stáhni nové přílohy ze schránky a spusť extrakci polí (Claude). Stejná tlačítka jsou i v{" "}
          <Link href="/settings" className="text-foreground underline underline-offset-2">
            Nastavení
          </Link>
          . Ve frontě na AI (nové, neklasifikované):{" "}
          <strong>{aiQueue}</strong> — při větším počtu úlohu opakuj, dokud nebude 0.
        </p>
        {canRunJobs ? (
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
            <PollEmailButton />
            <ProcessDocumentsButton />
          </div>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            Tato akce je pro roli <strong>schvalovatel</strong> nebo <strong>administrátor</strong>.
            Tvoje role:{" "}
            <code className="bg-muted rounded px-1 text-xs">{session?.user?.role ?? "—"}</code>.
          </p>
        )}
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-medium">Poslední úlohy</h2>
        <ul className="text-muted-foreground mt-3 space-y-2 text-sm">
          {lastJobs.length === 0 ? (
            <li>Žádné záznamy.</li>
          ) : (
            lastJobs.map((j) => (
              <li key={j.id} className="flex justify-between gap-4 font-mono text-xs">
                <span>{j.type}</span>
                <span>{j.status}</span>
                <span>{j.createdAt.toLocaleString("cs-CZ")}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
