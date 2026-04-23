import type { Invoice } from "@prisma/client";
import type { PohodaMserverConfig } from "@/services/pohoda/env";
import { pohodaRateVatFromPercent } from "@/services/pohoda/vat-map";
import { escapeXmlText } from "@/services/pohoda/xml-escape";

type InvoiceLineJson = {
  text?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPriceWithoutVat?: number | null;
  vatRate?: number | null;
  lineTotalWithoutVat?: number | null;
  lineTotalWithVat?: number | null;
};

function formatAmount(n: unknown): string {
  if (n == null) {
    return "0";
  }
  if (typeof n === "number" && Number.isFinite(n)) {
    return String(n);
  }
  if (typeof n === "object" && n !== null && "toString" in n) {
    return (n as { toString(): string }).toString();
  }
  return "0";
}

function parseInvoiceLines(raw: unknown): InvoiceLineJson[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((x) => x && typeof x === "object") as InvoiceLineJson[];
}

function buildInvoiceDetailXml(inv: Invoice): string {
  const lines = parseInvoiceLines(inv.invoiceLines);
  const vatPercent = inv.vatRate != null ? Number(inv.vatRate) : null;

  if (lines.length === 0) {
    const rate = pohodaRateVatFromPercent(vatPercent);
    const unitPrice = formatAmount(inv.amountWithoutVat);
    return `<inv:invoiceDetail>
      <inv:invoiceItem>
        <inv:text>Shrnutí dokladu (import)</inv:text>
        <inv:quantity>1</inv:quantity>
        <inv:rateVAT>${rate}</inv:rateVAT>
        <inv:homeCurrency>
          <typ:unitPrice>${escapeXmlText(unitPrice)}</typ:unitPrice>
        </inv:homeCurrency>
      </inv:invoiceItem>
    </inv:invoiceDetail>`;
  }

  const parts: string[] = ["<inv:invoiceDetail>"];
  for (const line of lines) {
    const qty = line.quantity != null && Number.isFinite(line.quantity) ? line.quantity : 1;
    const rate = pohodaRateVatFromPercent(
      line.vatRate != null && Number.isFinite(line.vatRate)
        ? line.vatRate
        : vatPercent,
    );
    const text =
      line.text?.trim() || line.unit?.trim() || "Položka";
    let unitPrice =
      line.unitPriceWithoutVat != null && Number.isFinite(line.unitPriceWithoutVat)
        ? String(line.unitPriceWithoutVat)
        : null;
    if (unitPrice == null && line.lineTotalWithoutVat != null && qty !== 0) {
      unitPrice = String(Number(line.lineTotalWithoutVat) / qty);
    }
    if (unitPrice == null) {
      unitPrice = "0";
    }
    parts.push(`<inv:invoiceItem>
        <inv:text>${escapeXmlText(text)}</inv:text>
        <inv:quantity>${escapeXmlText(String(qty))}</inv:quantity>
        <inv:rateVAT>${rate}</inv:rateVAT>
        <inv:homeCurrency>
          <typ:unitPrice>${escapeXmlText(unitPrice)}</typ:unitPrice>
        </inv:homeCurrency>
      </inv:invoiceItem>`);
  }
  parts.push("</inv:invoiceDetail>");
  return parts.join("\n");
}

export function buildReceivedInvoiceInnerXml(
  inv: Invoice,
  cfg: PohodaMserverConfig,
): string {
  const num = inv.invoiceNumber?.trim() || `IMP-${inv.id.slice(0, 8)}`;
  const docDate = inv.issueDate ?? inv.dueDate ?? new Date();
  const y = docDate.getUTCFullYear();
  const m = String(docDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(docDate.getUTCDate()).padStart(2, "0");
  const dateStr = `${y}-${m}-${d}`;

  const company = inv.supplierName?.trim() || "Neznámý dodavatel";
  const ico = inv.supplierICO?.replace(/\D/g, "") ?? "";
  const dic = inv.supplierDIC?.trim() ?? "";

  const symParts: string[] = [];
  if (inv.variableSymbol?.trim()) {
    symParts.push(
      `<inv:symVar>${escapeXmlText(inv.variableSymbol.replace(/\D/g, ""))}</inv:symVar>`,
    );
  }
  if (inv.constantSymbol?.trim()) {
    symParts.push(
      `<inv:symConst>${escapeXmlText(inv.constantSymbol.replace(/\D/g, ""))}</inv:symConst>`,
    );
  }
  if (inv.specificSymbol?.trim()) {
    symParts.push(
      `<inv:symSpec>${escapeXmlText(inv.specificSymbol.replace(/\D/g, ""))}</inv:symSpec>`,
    );
  }

  const addrParts: string[] = [];
  if (inv.supplierStreet?.trim()) {
    addrParts.push(
      `<typ:street>${escapeXmlText(inv.supplierStreet.trim())}</typ:street>`,
    );
  }
  if (inv.supplierCity?.trim()) {
    addrParts.push(
      `<typ:city>${escapeXmlText(inv.supplierCity.trim())}</typ:city>`,
    );
  }
  if (inv.supplierZip?.trim()) {
    addrParts.push(`<typ:zip>${escapeXmlText(inv.supplierZip.trim())}</typ:zip>`);
  }
  if (inv.supplierCountry?.trim()) {
    addrParts.push(
      `<typ:country>${escapeXmlText(inv.supplierCountry.trim())}</typ:country>`,
    );
  }

  const optAccounting: string[] = [];
  if (cfg.invoiceAccountingIds) {
    optAccounting.push(
      `<inv:accounting><typ:ids>${escapeXmlText(cfg.invoiceAccountingIds)}</typ:ids></inv:accounting>`,
    );
  }
  if (cfg.invoiceClassificationVatIds) {
    optAccounting.push(
      `<inv:classificationVAT><typ:ids>${escapeXmlText(cfg.invoiceClassificationVatIds)}</typ:ids></inv:classificationVAT>`,
    );
  }

  const paymentAccount: string[] = [];
  if (cfg.defaultBankAccountIds) {
    paymentAccount.push(
      `<inv:account><typ:ids>${escapeXmlText(cfg.defaultBankAccountIds)}</typ:ids></inv:account>`,
    );
  }

  return `<inv:invoice version="2.0">
  <inv:invoiceHeader>
    <inv:invoiceType>receivedInvoice</inv:invoiceType>
    <inv:number>
      <typ:numberRequested>${escapeXmlText(num)}</typ:numberRequested>
    </inv:number>
    <inv:date>${escapeXmlText(dateStr)}</inv:date>
    <inv:partnerIdentity>
      <typ:address>
        <typ:company>${escapeXmlText(company)}</typ:company>
        ${ico ? `<typ:ico>${escapeXmlText(ico)}</typ:ico>` : ""}
        ${dic ? `<typ:dic>${escapeXmlText(dic)}</typ:dic>` : ""}
        ${addrParts.join("\n        ")}
      </typ:address>
    </inv:partnerIdentity>
    ${optAccounting.join("\n    ")}
    <inv:text>${escapeXmlText(`Přijatá faktura ${num}`)}</inv:text>
    <inv:paymentType>
      <typ:paymentType>draft</typ:paymentType>
    </inv:paymentType>
    ${paymentAccount.join("\n    ")}
    ${symParts.join("\n    ")}
  </inv:invoiceHeader>
  ${buildInvoiceDetailXml(inv)}
</inv:invoice>`;
}
