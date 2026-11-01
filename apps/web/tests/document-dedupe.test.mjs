// Spuštění: npm test (Node ≥ 22.18 / 23.6 — import .ts bez buildu)
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  amountFromPaymentNote,
  buildDedupKey,
  classificationHintFromFilename,
  decideDuplicate,
  documentNumberFromPaymentNote,
  isNoiseAttachment,
  isOwnCompanySupplier,
  normalizeSupplierName,
  stripeInvoicesSupersededByReceipts,
} from "../src/lib/document-dedupe.ts";

test("jméno dodavatele bez právní formy a závorek", () => {
  assert.equal(normalizeSupplierName("Anysphere, Inc. (Cursor)"), "anysphere");
  assert.equal(normalizeSupplierName("Anysphere, Inc."), "anysphere");
  assert.equal(normalizeSupplierName("Anthropic, PBC"), "anthropic");
  assert.equal(normalizeSupplierName("ECOMAIL.CZ, s.r.o."), "ecomailcz");
  assert.equal(normalizeSupplierName("UNIREC TRADE spol. s r.o."), "unirectrade");
  assert.equal(normalizeSupplierName("Alza.cz a.s."), "alzacz");
});

test("Stripe faktura a účtenka ke stejné platbě mají stejný klíč", () => {
  const inv = buildDedupKey({ supplierName: "Vercel Inc.", documentNumber: "TUWHH68P-0005", amount: 80.26, currency: "USD", originalFilename: "Invoice-TUWHH68P-0005.pdf" });
  const rec = buildDedupKey({ supplierName: "Vercel Inc.", documentNumber: "TUWHH68P-0005", amount: 80.26, currency: "USD", documentKind: "RECEIPT", originalFilename: "1a0b2efa11601e6c-Receipt-2477-3087.pdf" });
  assert.ok(inv);
  assert.equal(inv, rec);
});

test("přeposlaná kopie (jiný soubor) = stejný klíč", () => {
  const a = buildDedupKey({ supplierName: "ECOMAIL.CZ, s.r.o.", documentNumber: "226-55407", amount: 3775.2, currency: "CZK" });
  const b = buildDedupKey({ supplierName: "ECOMAIL.CZ, s.r.o.", documentNumber: "226 55407", amount: 3775.2, currency: "CZK" });
  assert.equal(a, b);
});

test("stejné číslo, jiná částka (zálohová vs. konečné vyúčtování) ≠ duplicita", () => {
  const a = buildDedupKey({ supplierName: "CARDION CARS a.s.", documentNumber: "1143262500", amount: 173332, currency: "CZK" });
  const b = buildDedupKey({ supplierName: "CARDION CARS a.s.", documentNumber: "1143262500", amount: 35082, currency: "CZK" });
  assert.notEqual(a, b);
});

test("refund se neslije s účtenkou stejného čísla", () => {
  const rec = buildDedupKey({ supplierName: "Anthropic, PBC", documentNumber: "FVQ8II9E-0021", amount: 12.83, currency: "EUR", originalFilename: "Receipt-2056-5910-9575.pdf" });
  const ref = buildDedupKey({ supplierName: "Anthropic, PBC", documentNumber: "FVQ8II9E-0021", amount: -2.23, currency: "EUR", originalFilename: "Refund-3954-7248.pdf" });
  assert.notEqual(rec, ref);
});

test("bez čísla dokladu není klíč", () => {
  assert.equal(buildDedupKey({ supplierName: "Zapier Inc.", documentNumber: null, amount: 27.42, currency: "EUR" }), null);
  assert.equal(buildDedupKey({ supplierName: "Zapier Inc.", documentNumber: "INV-123", amount: null, currency: "EUR" }), null);
  assert.equal(buildDedupKey({ supplierName: "Zapier Inc.", documentNumber: "INV-123", amount: 10, currency: null }), null);
});

test("vydané faktury Vividbooks", () => {
  assert.equal(isOwnCompanySupplier("08637351", null), true);
  assert.equal(isOwnCompanySupplier(null, "CZ08637351"), true);
  assert.equal(isOwnCompanySupplier("05923336", "CZ05923336"), false); // symfio — taky „Vydaná faktura“ z iDokladu
  assert.equal(isOwnCompanySupplier("08637351", "CZ08637351"), true);
  // rozpor IČO × DIČ → nemazat (AI mohla vzít DIČ odběratele)
  assert.equal(isOwnCompanySupplier("05923336", "CZ08637351"), false);
});

test("nápověda z názvu souboru", () => {
  assert.equal(classificationHintFromFilename("Receipt-2890-5089-1438.pdf"), "PAYMENT_RECEIPT");
  assert.equal(classificationHintFromFilename("1a0b2efa11601e6c-Receipt-2477-3087.pdf"), "PAYMENT_RECEIPT");
  assert.equal(classificationHintFromFilename("github-vividbooks-receipt-2026-10-14.pdf"), "PAYMENT_RECEIPT");
  assert.equal(classificationHintFromFilename("Refund-3569-2324.pdf"), "PAYMENT_RECEIPT");
  assert.equal(classificationHintFromFilename("CreditNote-FVQ8II9E-0028-CN-01.pdf"), "PAYMENT_RECEIPT");
  assert.equal(classificationHintFromFilename("Invoice-XVGMOKDB-0006.pdf"), null);
  assert.equal(classificationHintFromFilename("Vydaná faktura - 20260779.pdf"), null);
});

test("šum v přílohách", () => {
  assert.equal(isNoiseAttachment({ filename: "image001.png", mimeType: "image/png", size: 4000 }), true);
  // velká vložená fotka (účtenka) není šum, ani když se jmenuje image001
  assert.equal(isNoiseAttachment({ filename: "image001.jpg", mimeType: "image/jpeg", size: 350000 }), false);
  assert.equal(isNoiseAttachment({ filename: "CZ - Obchodní podmínky.pdf", mimeType: "application/pdf", size: 90000 }), true);
  assert.equal(isNoiseAttachment({ filename: "VOP_RR_06082026.pdf", mimeType: "application/pdf", size: 90000 }), true);
  assert.equal(isNoiseAttachment({ filename: "uctenka.jpg", mimeType: "image/jpeg", size: 400000 }), false);
  assert.equal(isNoiseAttachment({ filename: "FA.PDF", mimeType: "application/pdf", size: 50000 }), false);
  // malá fotka účtenky není šum
  assert.equal(isNoiseAttachment({ filename: "IMG_2041.jpg", mimeType: "image/jpeg", size: 18000 }), false);
});

test("Stripe pár v jednom e-mailu → přeskočit fakturu", () => {
  const skip = stripeInvoicesSupersededByReceipts([
    { filename: "1a0b2efa11601e6c-Invoice-TUWHH68P-0005.pdf", mimeType: "application/pdf" },
    { filename: "1a0b2efa11601e6c-Receipt-2477-3087.pdf", mimeType: "application/pdf" },
    { filename: "1a05cfe8a52872c6-Invoice-DT4ODG3R-0001.pdf", mimeType: "application/pdf" },
    { filename: "Cursor-RH8JHNNL-0113.pdf", mimeType: "application/pdf" },
  ]);
  assert.deepEqual([...skip], ["1a0b2efa11601e6c-Invoice-TUWHH68P-0005.pdf"]);
  const skip2 = stripeInvoicesSupersededByReceipts([
    { filename: "Invoice-XVGMOKDB-0006.pdf", mimeType: "application/pdf" },
    { filename: "Receipt-2890-5089-1438.pdf", mimeType: "application/pdf" },
  ]);
  // bez prefixu pár ověřit nejde → nic nepřeskočit (nahrazení řeší deduplikace po extrakci)
  assert.equal(skip2.size, 0);
  // víc nespárovaných souborů bez prefixu → nic nepřeskočit
  const skip3 = stripeInvoicesSupersededByReceipts([
    { filename: "Invoice-A1.pdf", mimeType: "application/pdf" },
    { filename: "Invoice-C3.pdf", mimeType: "application/pdf" },
    { filename: "Receipt-B2.pdf", mimeType: "application/pdf" },
  ]);
  assert.equal(skip3.size, 0);
  // stejný prefix, dvě faktury + jedna účtenka → nic nepřeskočit
  const skip4 = stripeInvoicesSupersededByReceipts([
    { filename: "abc-Invoice-1.pdf", mimeType: "application/pdf" },
    { filename: "abc-Invoice-2.pdf", mimeType: "application/pdf" },
    { filename: "abc-Receipt-9.pdf", mimeType: "application/pdf" },
  ]);
  assert.equal(skip4.size, 0);
});

test("rozhodnutí o duplicitě", () => {
  assert.deepEqual(decideDuplicate("INVOICE", null), { action: "keep_new" });
  assert.deepEqual(
    decideDuplicate("PAYMENT_RECEIPT", { documentId: "d1", documentType: "INVOICE", status: "PENDING_APPROVAL" }),
    { action: "replace_existing", replaceDocumentId: "d1" },
  );
  assert.deepEqual(
    decideDuplicate("PAYMENT_RECEIPT", { documentId: "d1", documentType: "INVOICE", status: "APPROVED" }),
    { action: "new_is_duplicate", keepDocumentId: "d1" },
  );
  assert.deepEqual(
    decideDuplicate("INVOICE", { documentId: "d2", documentType: "PAYMENT_RECEIPT", status: "STORED" }),
    { action: "new_is_duplicate", keepDocumentId: "d2" },
  );
  assert.deepEqual(
    decideDuplicate("INVOICE", { documentId: null, documentType: "INVOICE", status: null }),
    { action: "new_is_duplicate", keepDocumentId: null },
  );
});

test("číslo a částka ze starých poznámek plateb", () => {
  assert.equal(documentNumberFromPaymentNote("Vercel Inc. · č. TUWHH68P-0005 · 80.26 USD"), "TUWHH68P-0005");
  assert.equal(
    documentNumberFromPaymentNote("Anthropic, PBC | FVQ8II9E-0028-CN-01 | Refund issued - Visa"),
    "FVQ8II9E-0028-CN-01",
  );
  assert.equal(
    documentNumberFromPaymentNote("UNIQA pojišťovna, a.s. | 43-2770480257/0100 | 5405175926 | Sdělení"),
    "5405175926",
  );
  assert.deepEqual(amountFromPaymentNote("Vercel Inc. · č. TUWHH68P-0005 · 80.26 USD"), { amount: 80.26, currency: "USD" });
});
