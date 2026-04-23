"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export type InvoiceMetadataInitial = {
  supplierName: string | null;
  supplierICO: string | null;
  supplierDIC: string | null;
  supplierStreet: string | null;
  supplierCity: string | null;
  supplierZip: string | null;
  supplierCountry: string | null;
  amountWithoutVat: string | null;
  amountWithVat: string | null;
  vatAmount: string | null;
  vatRate: string | null;
  dueDate: string | null;
  issueDate: string | null;
  invoiceNumber: string | null;
  currency: string;
  variableSymbol: string | null;
  constantSymbol: string | null;
  specificSymbol: string | null;
  bankAccount: string | null;
  iban: string | null;
  domesticAccount: string | null;
  bic: string | null;
  documentKind: string | null;
};

type Props = {
  invoiceId: string;
  canEdit: boolean;
  initial: InvoiceMetadataInitial;
};

export function InvoiceMetadataForm({ invoiceId, canEdit, initial }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [supplierName, setSupplierName] = useState(initial.supplierName ?? "");
  const [supplierICO, setSupplierICO] = useState(initial.supplierICO ?? "");
  const [supplierDIC, setSupplierDIC] = useState(initial.supplierDIC ?? "");
  const [supplierStreet, setSupplierStreet] = useState(
    initial.supplierStreet ?? "",
  );
  const [supplierCity, setSupplierCity] = useState(initial.supplierCity ?? "");
  const [supplierZip, setSupplierZip] = useState(initial.supplierZip ?? "");
  const [supplierCountry, setSupplierCountry] = useState(
    initial.supplierCountry ?? "",
  );
  const [amountWithoutVat, setAmountWithoutVat] = useState(
    initial.amountWithoutVat ?? "",
  );
  const [amountWithVat, setAmountWithVat] = useState(initial.amountWithVat ?? "");
  const [vatAmount, setVatAmount] = useState(initial.vatAmount ?? "");
  const [vatRate, setVatRate] = useState(initial.vatRate ?? "");
  const [dueDate, setDueDate] = useState(
    initial.dueDate ? initial.dueDate.slice(0, 10) : "",
  );
  const [issueDate, setIssueDate] = useState(
    initial.issueDate ? initial.issueDate.slice(0, 10) : "",
  );
  const [invoiceNumber, setInvoiceNumber] = useState(
    initial.invoiceNumber ?? "",
  );
  const [currency, setCurrency] = useState(initial.currency);
  const [variableSymbol, setVariableSymbol] = useState(
    initial.variableSymbol ?? "",
  );
  const [constantSymbol, setConstantSymbol] = useState(
    initial.constantSymbol ?? "",
  );
  const [specificSymbol, setSpecificSymbol] = useState(
    initial.specificSymbol ?? "",
  );
  const [bankAccount, setBankAccount] = useState(initial.bankAccount ?? "");
  const [iban, setIban] = useState(initial.iban ?? "");
  const [domesticAccount, setDomesticAccount] = useState(
    initial.domesticAccount ?? "",
  );
  const [bic, setBic] = useState(initial.bic ?? "");
  const [documentKind, setDocumentKind] = useState(initial.documentKind ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          supplierName: supplierName || null,
          supplierICO: supplierICO || null,
          supplierDIC: supplierDIC || null,
          supplierStreet: supplierStreet || null,
          supplierCity: supplierCity || null,
          supplierZip: supplierZip || null,
          supplierCountry: supplierCountry || null,
          amountWithoutVat: amountWithoutVat || null,
          amountWithVat: amountWithVat || null,
          vatAmount: vatAmount || null,
          vatRate: vatRate || null,
          dueDate: dueDate ? `${dueDate}T12:00:00.000Z` : null,
          issueDate: issueDate ? `${issueDate}T12:00:00.000Z` : null,
          invoiceNumber: invoiceNumber || null,
          currency: currency || "CZK",
          variableSymbol: variableSymbol || null,
          constantSymbol: constantSymbol || null,
          specificSymbol: specificSymbol || null,
          bankAccount: bankAccount || null,
          iban: iban || null,
          domesticAccount: domesticAccount || null,
          bic: bic || null,
          documentKind: documentKind || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(data.error || "Uložení selhalo.");
        return;
      }
      setMsg("Uloženo.");
      await router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) {
    return (
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Dodavatel</dt>
          <dd>{initial.supplierName || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">IČO / DIČ</dt>
          <dd>
            {[initial.supplierICO, initial.supplierDIC].filter(Boolean).join(" · ") ||
              "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Částka bez DPH</dt>
          <dd>{initial.amountWithoutVat || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Částka s DPH</dt>
          <dd>{initial.amountWithVat || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">DPH / sazba</dt>
          <dd>
            {[initial.vatAmount, initial.vatRate].filter(Boolean).join(" / ") || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Vystaveno / splatnost</dt>
          <dd>
            {initial.issueDate
              ? new Date(initial.issueDate).toLocaleDateString("cs-CZ")
              : "—"}
            {" · "}
            {initial.dueDate
              ? new Date(initial.dueDate).toLocaleDateString("cs-CZ")
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Číslo faktury</dt>
          <dd>{initial.invoiceNumber || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Měna</dt>
          <dd>{initial.currency}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">VS / KS / SS</dt>
          <dd>
            {[initial.variableSymbol, initial.constantSymbol, initial.specificSymbol]
              .filter(Boolean)
              .join(" / ") || "—"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Účet / IBAN</dt>
          <dd>
            {[initial.domesticAccount, initial.iban, initial.bankAccount, initial.bic]
              .filter(Boolean)
              .join(" · ") || "—"}
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-muted-foreground">Dodavatel</span>
          <input
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">IČO</span>
          <input
            value={supplierICO}
            onChange={(e) => setSupplierICO(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">DIČ</span>
          <input
            value={supplierDIC}
            onChange={(e) => setSupplierDIC(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-muted-foreground">Ulice</span>
          <input
            value={supplierStreet}
            onChange={(e) => setSupplierStreet(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Město</span>
          <input
            value={supplierCity}
            onChange={(e) => setSupplierCity(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">PSČ</span>
          <input
            value={supplierZip}
            onChange={(e) => setSupplierZip(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-muted-foreground">Stát</span>
          <input
            value={supplierCountry}
            onChange={(e) => setSupplierCountry(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Číslo faktury</span>
          <input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Typ dokladu (volitelně)</span>
          <input
            value={documentKind}
            onChange={(e) => setDocumentKind(e.target.value)}
            placeholder="STANDARD_INVOICE…"
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Bez DPH</span>
          <input
            value={amountWithoutVat}
            onChange={(e) => setAmountWithoutVat(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">S DPH</span>
          <input
            value={amountWithVat}
            onChange={(e) => setAmountWithVat(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Částka DPH</span>
          <input
            value={vatAmount}
            onChange={(e) => setVatAmount(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Sazba DPH (%)</span>
          <input
            value={vatRate}
            onChange={(e) => setVatRate(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Datum vystavení</span>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Splatnost</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Měna</span>
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
            maxLength={8}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Variabilní symbol</span>
          <input
            value={variableSymbol}
            onChange={(e) => setVariableSymbol(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Konstantní symbol</span>
          <input
            value={constantSymbol}
            onChange={(e) => setConstantSymbol(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Specifický symbol</span>
          <input
            value={specificSymbol}
            onChange={(e) => setSpecificSymbol(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-muted-foreground">Účet (text z faktury)</span>
          <input
            value={bankAccount}
            onChange={(e) => setBankAccount(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">IBAN</span>
          <input
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Domácí účet</span>
          <input
            value={domesticAccount}
            onChange={(e) => setDomesticAccount(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">BIC</span>
          <input
            value={bic}
            onChange={(e) => setBic(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>
      </div>
      <Button type="submit" disabled={busy} variant="secondary">
        Uložit metadata
      </Button>
      {msg && <p className="text-muted-foreground text-sm">{msg}</p>}
    </form>
  );
}
