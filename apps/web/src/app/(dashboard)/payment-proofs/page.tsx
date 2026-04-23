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
      document: { include: { email: true, invoice: { select: { id: true } } } },
    },
  });

  const dtos: PaymentProofRowDto[] = rows.map((p) => ({
    id: p.id,
    documentId: p.documentId,
    proofType: p.proofType,
    note: p.note,
    amount: p.amount?.toString() ?? null,
    currency: p.currency,
    variableSymbol: p.variableSymbol,
    pohodaExportStatus: p.pohodaExportStatus,
    pohodaExportLastError: p.pohodaExportLastError,
    driveUrl: p.driveUrl,
    canDeleteProof: p.document.invoice == null,
    receivedAtMs: p.document.email.receivedAt.getTime(),
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
          Doklad o platbě se po rozpoznání (AI), po převodu z faktury nebo po potvrzení „Platba v
          pořádku“ nahraje na Google Shared Drive do kořenové složky pro platby (env{" "}
          <code className="bg-muted rounded px-1 text-xs">GOOGLE_DRIVE_RECEIPTS_FOLDER_ID</code>), ne
          do složky faktur. Uvnitř jsou podsložky podle roku a měsíce nahrání. Po úspěchu uvidíte ve
          sloupci „Uloženo“ datum a odkaz na Drive.
        </p>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
          Prázdné „Uloženo“ a v sloupci Drive pomlčka znamená, že se na disk ještě nedostalo nebo první
          pokus selhal (Drive nebyl nastaven, Gmail token, chybějící soubor na serveru). U řádku lze
          zkusit tlačítko Nahrát na Drive (role administrátor / schvalovatel). Sloupec Přijato lze
          kliknutím přepínat řazení od nejnovějších / od nejstarších.
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
