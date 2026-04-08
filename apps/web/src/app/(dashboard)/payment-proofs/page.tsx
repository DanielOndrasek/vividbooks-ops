import { auth } from "@/auth";
import {
  PaymentProofsTable,
  type PaymentProofRowDto,
} from "@/components/payment-proofs-table";
import { canRunIntegrationJobs } from "@/lib/api-jobs-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PaymentProofsPage() {
  const session = await auth();
  const canAct = canRunIntegrationJobs(session?.user?.role);

  const rows = await prisma.paymentProof.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      document: { include: { email: true } },
    },
  });

  const dtos: PaymentProofRowDto[] = rows.map((p) => ({
    id: p.id,
    documentId: p.documentId,
    proofType: p.proofType,
    note: p.note,
    driveUrl: p.driveUrl,
    receivedAtLabel: p.document.email.receivedAt.toLocaleString("cs-CZ"),
    processedAtLabel: p.document.email.processedAt?.toLocaleString("cs-CZ") ?? null,
    originalFilename: p.document.originalFilename,
    documentStatus: p.document.status,
    storedAtLabel: p.storedAt?.toLocaleString("cs-CZ") ?? null,
    previewUrl: `/api/documents/${p.documentId}/file`,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Doklady o platbě</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed">
          Doklad o platbě se po rozpoznání (AI) nebo po potvrzení „Platba v pořádku“ sám nahraje na
          Google Drive — není potřeba nic spouštět ručně. Po úspěšném nahrání se z databáze odstraní
          objemná data (text z PDF, odpověď AI, dočasný soubor); v aplikaci zůstane jen evidence a
          odkaz na Drive.
        </p>
        {canAct && (
          <p className="text-muted-foreground mt-2 text-xs">
            „Smazat platbu“ odstraní jen záznam evidence u dokladu; příloha v databázi zůstane jako
            zamítnutý doklad.
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Zatím žádné záznamy.</p>
      ) : (
        <PaymentProofsTable rows={dtos} canAct={canAct} />
      )}
    </div>
  );
}
