import type { PaymentProof } from "@prisma/client";
import type { PohodaMserverConfig } from "@/services/pohoda/env";
import { escapeXmlText } from "@/services/pohoda/xml-escape";

export function buildBankMovementInnerXml(
  proof: PaymentProof,
  cfg: PohodaMserverConfig,
): string {
  const dateSrc = proof.paymentDate ?? proof.storedAt ?? new Date();
  const y = dateSrc.getUTCFullYear();
  const m = String(dateSrc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateSrc.getUTCDate()).padStart(2, "0");
  const dateStr = `${y}-${m}-${d}`;

  const amount = proof.amount != null ? proof.amount.toString() : "0";
  const text =
    proof.bankMessage?.trim() ||
    proof.note?.trim() ||
    proof.counterpartyName?.trim() ||
    "Platba";

  const symVar = proof.variableSymbol?.replace(/\D/g, "") ?? "";
  const symConst = proof.constantSymbol?.replace(/\D/g, "") ?? "";
  const symSpec = proof.specificSymbol?.replace(/\D/g, "") ?? "";

  const accountNo = proof.bankAccountNo?.replace(/\D/g, "") ?? "";
  const bankCode = proof.bankCode?.replace(/\D/g, "") ?? "";

  const bankIds = cfg.defaultBankAccountIds;
  if (!bankIds) {
    throw new Error(
      "Pro import do Banky nastavte POHODA_DEFAULT_BANK_ACCOUNT_IDS (typ:ids účtu v Pohodě).",
    );
  }

  return `<bnk:bank version="2.0">
  <bnk:bankHeader>
    <bnk:bankType>receipt</bnk:bankType>
    <bnk:account>
      <typ:ids>${escapeXmlText(bankIds)}</typ:ids>
    </bnk:account>
    ${symVar ? `<bnk:symVar>${escapeXmlText(symVar)}</bnk:symVar>` : ""}
    <bnk:dateStatement>${escapeXmlText(dateStr)}</bnk:dateStatement>
    <bnk:datePayment>${escapeXmlText(dateStr)}</bnk:datePayment>
    <bnk:text>${escapeXmlText(text)}</bnk:text>
    ${
      accountNo && bankCode
        ? `<bnk:paymentAccount>
      <typ:accountNo>${escapeXmlText(accountNo)}</typ:accountNo>
      <typ:bankCode>${escapeXmlText(bankCode)}</typ:bankCode>
    </bnk:paymentAccount>`
        : ""
    }
    ${symConst ? `<bnk:symConst>${escapeXmlText(symConst)}</bnk:symConst>` : ""}
    ${symSpec ? `<bnk:symSpec>${escapeXmlText(symSpec)}</bnk:symSpec>` : ""}
  </bnk:bankHeader>
  <bnk:bankSummary>
    <bnk:roundingDocument>none</bnk:roundingDocument>
    <bnk:roundingVAT>none</bnk:roundingVAT>
    <bnk:homeCurrency>
      <typ:priceNone>${escapeXmlText(amount)}</typ:priceNone>
    </bnk:homeCurrency>
  </bnk:bankSummary>
</bnk:bank>`;
}
