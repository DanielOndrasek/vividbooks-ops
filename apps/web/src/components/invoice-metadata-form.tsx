"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  invoiceId: string;
  canEdit: boolean;
  initial: {
    supplierName: string | null;
    amountWithoutVat: string | null;
    amountWithVat: string | null;
    dueDate: string | null;
    invoiceNumber: string | null;
    currency: string;
  };
};

export function InvoiceMetadataForm({ invoiceId, canEdit, initial }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [supplierName, setSupplierName] = useState(initial.supplierName ?? "");
  const [amountWithoutVat, setAmountWithoutVat] = useState(
    initial.amountWithoutVat ?? "",
  );
  const [amountWithVat, setAmountWithVat] = useState(initial.amountWithVat ?? "");
  const [dueDate, setDueDate] = useState(
    initial.dueDate ? initial.dueDate.slice(0, 10) : "",
  );
  const [invoiceNumber, setInvoiceNumber] = useState(
    initial.invoiceNumber ?? "",
  );
  const [currency, setCurrency] = useState(initial.currency);
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
          amountWithoutVat: amountWithoutVat || null,
          amountWithVat: amountWithVat || null,
          dueDate: dueDate ? `${dueDate}T12:00:00.000Z` : null,
          invoiceNumber: invoiceNumber || null,
          currency: currency || "CZK",
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
          <dt className="text-muted-foreground">Částka bez DPH</dt>
          <dd>{initial.amountWithoutVat || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Částka s DPH</dt>
          <dd>{initial.amountWithVat || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Splatnost</dt>
          <dd>
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
      </dl>
    );
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Dodavatel</span>
          <input
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
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
      </div>
      <Button type="submit" disabled={busy} variant="secondary">
        Uložit metadata
      </Button>
      {msg && <p className="text-muted-foreground text-sm">{msg}</p>}
    </form>
  );
}
