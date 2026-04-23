"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  invoiceId: string;
  documentId: string;
  documentStatus: string;
  canAct: boolean;
  /** Schválit / zamítnout — jen PENDING_APPROVAL nebo NEEDS_REVIEW */
  showApproveReject: boolean;
  /** Faktura (ne schválená) lze převést na doklad o platbě — stejně jako v přehledu */
  canConvertToPayment?: boolean;
  /** Kam přesměrovat po úspěšném smazání dokladu (včetně faktury v DB) */
  afterDeleteHref?: string;
};

type Busy = false | "approve" | "reject" | "delete" | "convert";

export function InvoiceActions({
  invoiceId,
  documentId,
  documentStatus,
  canAct,
  showApproveReject,
  canConvertToPayment = false,
  afterDeleteHref = "/invoices",
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(false);
  const [message, setMessage] = useState<string | null>(null);
  const canDelete = documentStatus !== "APPROVED";

  async function approve() {
    setBusy("approve");
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/approve`, {
        method: "POST",
        cache: "no-store",
      });
      const data = (await res.json()) as { error?: string; driveUrl?: string | null };
      if (!res.ok) {
        setMessage(data.error || "Schválení selhalo.");
        return;
      }
      setMessage(
        data.driveUrl
          ? `Schváleno. Odkaz na Drive byl uložen.`
          : "Schváleno.",
      );
      await router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    const reason = window.prompt("Důvod zamítnutí (volitelné):") ?? "";
    setBusy("reject");
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
        cache: "no-store",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error || "Zamítnutí selhalo.");
        return;
      }
      setMessage("Zamítnuto.");
      await router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function convertToPaymentProof() {
    const ok = window.confirm(
      "Převést tuto fakturu na doklad o platbě? Záznam faktury se smaže, dokument bude v sekci Platby (a případně se nahraje na Drive do složky plateb).",
    );
    if (!ok) {
      return;
    }
    setBusy("convert");
    setMessage(null);
    try {
      const res = await fetch(
        `/api/invoices/${invoiceId}/convert-to-payment-proof`,
        { method: "POST", cache: "no-store" },
      );
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) {
        setMessage(data.error || "Převod selhal.");
        return;
      }
      setMessage("Doklad převeden na platbu.");
      router.push("/payment-proofs");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument() {
    if (
      !window.confirm(
        "Trvale smazat tento doklad včetně faktury v databázi? Tuto akci nelze vrátit. Soubory na Google Drive se tím nesmažou.",
      )
    ) {
      return;
    }
    setBusy("delete");
    setMessage(null);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error || "Smazání selhalo.");
        return;
      }
      router.push(afterDeleteHref);
    } finally {
      setBusy(false);
    }
  }

  if (!canAct) {
    return null;
  }

  const disabled = busy !== false;

  return (
    <div className="space-y-4">
      {(showApproveReject || canConvertToPayment) && (
        <div
          className="flex flex-wrap gap-2"
          aria-busy={disabled}
          aria-live="polite"
        >
          {showApproveReject && (
            <>
              <Button
                type="button"
                disabled={disabled}
                onClick={() => void approve()}
                className="min-w-[8.5rem]"
              >
                {busy === "approve" ? (
                  <>
                    <Loader2
                      className="size-4 shrink-0 animate-spin"
                      aria-hidden
                    />
                    Schvaluji…
                  </>
                ) : (
                  "Schválit"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => void reject()}
                className="min-w-[8.5rem]"
              >
                {busy === "reject" ? (
                  <>
                    <Loader2
                      className="size-4 shrink-0 animate-spin"
                      aria-hidden
                    />
                    Odesílám…
                  </>
                ) : (
                  "Zamítnout"
                )}
              </Button>
            </>
          )}
          {canConvertToPayment && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => void convertToPaymentProof()}
              className="min-w-[8.5rem]"
            >
              {busy === "convert" ? (
                <>
                  <Loader2
                    className="size-4 shrink-0 animate-spin"
                    aria-hidden
                  />
                  Převádím…
                </>
              ) : (
                "Převést na doklad o platbě"
              )}
            </Button>
          )}
        </div>
      )}

      {canDelete && (
        <div
          className={
            showApproveReject || canConvertToPayment
              ? "border-border space-y-2 border-t pt-4"
              : "space-y-2"
          }
        >
          {(showApproveReject || canConvertToPayment) && (
            <p className="text-muted-foreground text-xs leading-relaxed">
              Smazání odstraní doklad i vazbu na fakturu (kromě stavu schváleno, kde je mazání zakázáno).
            </p>
          )}
          <Button
            type="button"
            variant="destructive"
            disabled={disabled}
            onClick={() => void deleteDocument()}
            className="min-w-[8.5rem]"
          >
            {busy === "delete" ? (
              <>
                <Loader2
                  className="size-4 shrink-0 animate-spin"
                  aria-hidden
                />
                Mažu…
              </>
            ) : (
              "Smazat doklad"
            )}
          </Button>
        </div>
      )}

      {message && (
        <p className="text-muted-foreground text-sm leading-relaxed">{message}</p>
      )}
    </div>
  );
}
