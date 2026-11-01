/**
 * Čistá logika pro třídění a hledání duplicit dokladů (bez Prisma / sítě → testovatelné).
 */

/** Hodnota Document.duplicateOfDocumentId u skrytých vydaných faktur VB (ne duplicita, ale „nepatří sem“). */
export const OWN_ISSUED_MARKER = "__own_issued__";

/** IČO Vividbooks s.r.o. — doklady s tímto dodavatelem jsou vydané faktury, do evidence nepatří. */
export const OWN_COMPANY_ICOS = ["08637351"];

export function ownCompanyIcos(): string[] {
  const extra = (process.env.OWN_COMPANY_ICOS ?? "")
    .split(/[,\s]+/)
    .map((x) => x.replace(/\D/g, ""))
    .filter(Boolean);
  return Array.from(new Set([...OWN_COMPANY_ICOS, ...extra]));
}

/** Dodavatel na dokladu je naše firma = vydaná faktura (přeposlaná z iDokladu apod.). */
export function isOwnCompanySupplier(
  supplierICO: string | null | undefined,
  supplierDIC: string | null | undefined,
  icos: string[] = ownCompanyIcos(),
): boolean {
  const ico = supplierICO?.replace(/\D/g, "") ?? "";
  // DIČ „CZ08637351“ → „08637351“ (předpona státu pryč).
  const dic = supplierDIC?.replace(/\D/g, "") ?? "";
  const icoOwn = ico.length > 0 && icos.includes(ico);
  const dicOwn = dic.length > 0 && icos.includes(dic);
  // Rozpor (IČO cizí, DIČ naše nebo naopak) = spíš chyba čtení (odběratel místo dodavatele) → nemazat.
  if (ico.length > 0 && dic.length > 0) {
    return icoOwn && dicOwn;
  }
  return icoOwn || dicOwn;
}

const LEGAL_SUFFIXES = [
  "spol s r o",
  "s r o",
  "sro",
  "a s",
  "as",
  "inc",
  "ltd",
  "limited",
  "llc",
  "pbc",
  "pte",
  "gmbh",
  "ou",
  "oü",
  "corp",
  "corporation",
  "co",
  "plc",
  "bv",
  "sa",
];

/** Jméno dodavatele bez právní formy, závorek a interpunkce: „Anysphere, Inc. (Cursor)“ → „anysphere“. */
export function normalizeSupplierName(name: string | null | undefined): string {
  let s = (name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  let changed = true;
  while (changed && s) {
    changed = false;
    for (const suf of LEGAL_SUFFIXES) {
      if (s === suf) {
        break;
      }
      if (s.endsWith(` ${suf}`)) {
        s = s.slice(0, -(suf.length + 1)).trim();
        changed = true;
      }
    }
  }
  return s.replace(/\s+/g, "");
}

export function normalizeDocumentNumber(num: string | null | undefined): string {
  return (num ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export type DedupInput = {
  supplierName: string | null | undefined;
  supplierICO?: string | null;
  documentNumber: string | null | undefined;
  amount: number | null | undefined;
  currency?: string | null;
  /** STANDARD_INVOICE, CREDIT_NOTE, REFUND… */
  documentKind?: string | null;
  originalFilename?: string | null;
};

/** Dobropis / refund se nesmí slít s fakturou nebo účtenkou stejného čísla. */
export function isCreditLike(input: Pick<DedupInput, "amount" | "documentKind" | "originalFilename">): boolean {
  const kind = (input.documentKind ?? "").toUpperCase();
  const file = (input.originalFilename ?? "").toLowerCase();
  return (
    (input.amount != null && input.amount < 0) ||
    /CREDIT|REFUND|DOBROPIS|STORNO/.test(kind) ||
    /creditnote|credit-note|refund|dobropis/.test(file)
  );
}

/**
 * Logický klíč dokladu: dodavatel | číslo | druh | částka měna.
 * Bez čísla dokladu, částky nebo měny vrací null (nelze spolehlivě porovnat — zbývá jen shoda souboru).
 * Dodavatele bereme podle jména (IČO u zahraničních chybí a AI ho občas doplní z DIČ),
 * částka v klíči chrání různé doklady se stejným číslem (zálohová vs. konečné vyúčtování).
 */
export function buildDedupKey(input: DedupInput): string | null {
  const num = normalizeDocumentNumber(input.documentNumber);
  if (num.length < 3) {
    return null;
  }
  const ico = input.supplierICO?.replace(/\D/g, "") ?? "";
  const sup = normalizeSupplierName(input.supplierName) || (ico ? `ico${ico}` : "");
  if (!sup) {
    return null;
  }
  // Bez částky a měny duplicitu automaticky neurčujeme (dva neúplně přečtené doklady by splynuly).
  if (input.amount == null || !Number.isFinite(input.amount)) {
    return null;
  }
  const cur = (input.currency ?? "").trim().toUpperCase();
  if (!cur) {
    return null;
  }
  const cls = isCreditLike(input) ? "CN" : "DOC";
  const amt = Math.abs(input.amount).toFixed(2);
  return `${sup}|${num}|${cls}|${amt}${cur}`;
}

/**
 * Silná nápověda z názvu souboru: Stripe účtenky, refundy, GitHub receipt (dobropis rozhodne AI podle obsahu).
 * Vrací PAYMENT_RECEIPT jen tam, kde je to jednoznačné; jinak null (rozhodne AI).
 */
export function classificationHintFromFilename(
  filename: string,
): "PAYMENT_RECEIPT" | null {
  const f = filename.toLowerCase();
  if (
    /(^|[-_\s])receipt[-_\s]/.test(f) ||
    /(^|[-_\s])receipt\.(pdf|png|jpe?g)$/.test(f) ||
    /(^|[-_\s])refund[-_\s]/.test(f) ||
    /uctenka|účtenka|stvrzenka/.test(f)
  ) {
    return "PAYMENT_RECEIPT";
  }
  return null;
}

export type AttachmentLike = {
  filename: string;
  mimeType: string;
  size?: number | null;
};

/** Vložené obrázky z Outlooku/podpisů — šum jen když jsou malé (fotka účtenky bývá stovky kB). */
const INLINE_IMAGE_NAME = [
  /^image\d{3}\.(png|jpe?g|gif)$/i,
  /^outlook-[a-z0-9]+\.(png|jpe?g)$/i,
  /^logo/i,
  /podpis|signature/i,
];
const NOISE_NAME = [
  /obchodn[ií][-_ ]?podm[ií]nky/i,
  /(^|[-_ ])vop([-_ .]|$)/i,
  /terms[-_ ]?(of|and)[-_ ]?(service|conditions)/i,
];

/**
 * Logo z podpisu, obchodní podmínky apod. — nestahovat, nedávat AI.
 * Jen podle názvu: malá fotka účtenky je pořád doklad (a e-mail se po zpracování znovu nenačte).
 */
export function isNoiseAttachment(att: AttachmentLike): boolean {
  if (NOISE_NAME.some((re) => re.test(att.filename))) {
    return true;
  }
  if (INLINE_IMAGE_NAME.some((re) => re.test(att.filename))) {
    return att.size != null && att.size > 0 && att.size < 60_000;
  }
  return false;
}

export type ExistingDocForDedup = {
  documentId: string | null;
  documentType: "INVOICE" | "PAYMENT_RECEIPT" | string;
  /** Stav dokumentu; null = dokument už v DB není (zbyla jen stopa). */
  status: string | null;
};

export type DedupDecision =
  /** Nový doklad je duplicita existujícího. */
  | { action: "new_is_duplicate"; keepDocumentId: string | null }
  /** Nový doklad (účtenka) nahradí dosud neschválenou fakturu. */
  | { action: "replace_existing"; replaceDocumentId: string }
  | { action: "keep_new" };

const REPLACEABLE_INVOICE_STATUSES = new Set(["PENDING_APPROVAL", "NEEDS_REVIEW", "REJECTED", "UPLOAD_FAILED"]);

/**
 * Pravidla:
 * - účtenka má přednost před fakturou, dokud faktura není schválená (pak už odešla účetní);
 * - jinak platí první doklad, další se stejným klíčem jsou duplicity.
 */
export function decideDuplicate(
  newType: "INVOICE" | "PAYMENT_RECEIPT",
  existing: ExistingDocForDedup | null,
): DedupDecision {
  if (!existing) {
    return { action: "keep_new" };
  }
  if (
    newType === "PAYMENT_RECEIPT" &&
    existing.documentType === "INVOICE" &&
    existing.documentId &&
    existing.status != null &&
    REPLACEABLE_INVOICE_STATUSES.has(existing.status)
  ) {
    return { action: "replace_existing", replaceDocumentId: existing.documentId };
  }
  // Nic neskrývat za účtenku, která ještě není bezpečně uložená (STORED) — obě nechat, rozhodne člověk.
  if (
    existing.documentType === "PAYMENT_RECEIPT" &&
    existing.status != null &&
    existing.status !== "STORED"
  ) {
    return { action: "keep_new" };
  }
  return { action: "new_is_duplicate", keepDocumentId: existing.documentId };
}

/** Číslo dokladu z poznámky platby (starší záznamy bez sloupce documentNumber). */
export function documentNumberFromPaymentNote(
  note: string | null | undefined,
  originalFilename?: string | null,
): string | null {
  const n = note ?? "";
  const m = n.match(/č\.\s*(\S+)/);
  if (m) {
    return m[1]!;
  }
  const parts = n.split("|").map((p) => p.trim());
  for (const p of parts.slice(1)) {
    // Starší poznámky: dodavatel | účet | číslo | zpráva — číslo účtu (…/0100, IBAN) přeskočit.
    const isAccount = /\/\d{4}$/.test(p) || /^[A-Z]{2}\d{2}[A-Z0-9]{10,}$/.test(p);
    if (!isAccount && /^[A-Za-z0-9][A-Za-z0-9_\-/]{3,}$/.test(p) && /\d/.test(p)) {
      return p;
    }
  }
  const f = (originalFilename ?? "").match(/(?:invoice|creditnote|doklad)[-_ ]?([A-Z0-9]+(?:-[A-Z0-9]+)*)\.(pdf)$/i);
  return f ? f[1]! : null;
}

/** Částka z poznámky „… · 80.26 USD“. */
export function amountFromPaymentNote(note: string | null | undefined): { amount: number; currency: string } | null {
  const m = (note ?? "").match(/·\s*(-?\d+(?:[.,]\d+)?)\s*([A-Z]{3})\s*$/);
  if (!m) {
    return null;
  }
  return { amount: Number(m[1]!.replace(",", ".")), currency: m[2]! };
}
