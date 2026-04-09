/**
 * Port výpočtu provizí z vividbooks_ops/tools/commission/logic.py
 */

import {
  CATEGORIES_SHARED_INTERACTIVE_PIPELINES,
  COMMISSION_RULES,
  INTERACTIVE_PIPELINE_FALLBACK_KIND,
  PIPELINE_ID_TO_INTERACTIVE_KIND,
  type CommissionRule,
} from "@/lib/commission/rules";

export type DealDict = Record<string, unknown>;

export interface DealCommissionRow {
  deal_id: number;
  title: string;
  org_name: string;
  owner_id: number | null;
  owner_name: string;
  category_label: string;
  category_display: string;
  pipeline_name: string;
  pipeline_id: number | null;
  currency: string;
  value: number;
  rate: number;
  commission: number;
  won_date: string | null;
  won_time_raw: string;
}

export function parseWonDate(wonTime: unknown): string | null {
  if (wonTime == null || wonTime === "") {
    return null;
  }
  const s = String(wonTime).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return null;
  }
  return s;
}

export function dealWonTimeRaw(deal: DealDict): string {
  const wt = deal.won_time;
  if (wt == null) {
    return "";
  }
  return String(wt).trim();
}

export function dealMonthDate(deal: DealDict): string | null {
  return parseWonDate(deal.won_time);
}

export function extractUserId(deal: DealDict): number | null {
  const u = deal.user_id;
  if (u == null) {
    return null;
  }
  if (typeof u === "object" && u !== null && "id" in u) {
    const uid = (u as { id?: unknown }).id;
    if (uid == null) {
      return null;
    }
    const n = Number(uid);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(u);
  return Number.isFinite(n) ? n : null;
}

export function extractUserNameFromDeal(deal: DealDict): string | null {
  const u = deal.user_id;
  if (typeof u === "object" && u !== null && "name" in u) {
    const n = (u as { name?: unknown }).name;
    if (n != null) {
      return String(n);
    }
  }
  return null;
}

export function dealOwnerDisplay(
  deal: DealDict,
  userIdToName: Record<number, string>,
): string {
  const n = extractUserNameFromDeal(deal);
  if (n) {
    return n;
  }
  const uid = extractUserId(deal);
  if (uid != null && userIdToName[uid]) {
    return userIdToName[uid];
  }
  if (uid != null) {
    return `User #${uid}`;
  }
  return "";
}

export function extractOrgName(deal: DealDict): string {
  const o = deal.org_id;
  if (o == null) {
    return "";
  }
  if (typeof o === "object" && o !== null && "name" in o) {
    return String((o as { name?: unknown }).name ?? "");
  }
  return "";
}

export function dealMonetaryValue(deal: DealDict): number {
  const v = deal.value;
  if (v == null) {
    return 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function dealCurrency(deal: DealDict): string {
  const c = deal.currency;
  if (c == null || c === "") {
    return "";
  }
  return String(c).trim().toUpperCase();
}

export function dealProductCategoryRaw(
  deal: DealDict,
  categoryFieldKey: string,
): unknown {
  const k = (categoryFieldKey || "").trim();
  if (!k) {
    return null;
  }
  const candidates = [k, k.toLowerCase()];
  const seen = new Set<string>();
  for (const cand of candidates) {
    if (seen.has(cand)) {
      continue;
    }
    seen.add(cand);
    if (!(cand in deal)) {
      continue;
    }
    const v = deal[cand];
    if (v == null) {
      continue;
    }
    if (Array.isArray(v) && v.length === 0) {
      continue;
    }
    if (typeof v === "string" && !v.trim()) {
      continue;
    }
    return v;
  }
  return null;
}

export function dealCategoryPresent(
  deal: DealDict,
  categoryFieldKey: string,
): boolean {
  return dealProductCategoryRaw(deal, categoryFieldKey) != null;
}

function registerOptionKeys(
  out: Record<string, string>,
  oid: unknown,
  label: string,
): void {
  if (oid == null) {
    return;
  }
  const s = String(oid).trim();
  if (!s) {
    return;
  }
  out[s] = label;
  const f = Number(s);
  if (Number.isFinite(f) && f === Math.floor(f)) {
    out[String(Math.floor(f))] = label;
  }
}

export function buildCategoryOptionMap(
  dealFields: DealDict[],
  categoryFieldKey: string,
): Record<string, string> {
  const want = (categoryFieldKey || "").trim().toLowerCase();
  if (!want) {
    return {};
  }
  for (const field of dealFields) {
    const fk = field.key;
    if (fk == null) {
      continue;
    }
    if (String(fk).trim().toLowerCase() !== want) {
      continue;
    }
    const out: Record<string, string> = {};
    const options = (field.options as unknown[]) || [];
    for (const opt of options) {
      if (typeof opt !== "object" || opt == null) {
        continue;
      }
      const o = opt as { id?: unknown; label?: unknown };
      if (o.id != null && o.label != null) {
        registerOptionKeys(out, o.id, String(o.label));
      }
    }
    return out;
  }
  return {};
}

function resolveLabelFromOptionMap(
  raw: unknown,
  optionIdToLabel: Record<string, string>,
): string | null {
  if (raw == null || raw === "") {
    return null;
  }
  let key: string;
  if (Array.isArray(raw)) {
    if (!raw.length) {
      return null;
    }
    key = String(raw[0]).trim();
  } else {
    key = String(raw).trim();
  }
  if (!key) {
    return null;
  }
  if (key in optionIdToLabel) {
    return optionIdToLabel[key];
  }
  const f = Number(key);
  if (Number.isFinite(f) && f === Math.floor(f)) {
    const k2 = String(Math.floor(f));
    if (k2 in optionIdToLabel) {
      return optionIdToLabel[k2];
    }
  }
  return null;
}

export function normalizeCategoryLabel(
  raw: unknown,
  optionIdToLabel: Record<string, string>,
): string | null {
  if (raw == null || raw === "") {
    return null;
  }
  let key: string;
  if (Array.isArray(raw)) {
    if (!raw.length) {
      return null;
    }
    key = String(raw[0]).trim();
  } else {
    key = String(raw).trim();
  }
  if (!key) {
    return null;
  }
  const label = resolveLabelFromOptionMap(raw, optionIdToLabel);
  const text = label ?? key;
  const out = text.toLowerCase().trim();
  return out || null;
}

export function categoryLabelMatchesRuleCategories(
  categoryLabel: string,
  ruleCategories: string[],
): boolean {
  const cat = (categoryLabel || "").toLowerCase().trim();
  if (!cat) {
    return false;
  }
  const catsNorm = ruleCategories.map((c) => c.toLowerCase().trim()).filter(Boolean);
  if (catsNorm.includes(cat)) {
    return true;
  }
  const catC = cat.replace(/[\s\-_]/g, "");
  for (const c of catsNorm) {
    const cn = c.replace(/[\s\-_]/g, "");
    if (catC === cn) {
      return true;
    }
    if (cat.startsWith(`${c} `) || cat.startsWith(`${c}-`) || cat.startsWith(`${c}/`)) {
      return true;
    }
  }
  const parts = cat.split(/[\s,/;|+]+/).filter(Boolean);
  if (parts.some((p) => catsNorm.includes(p))) {
    return true;
  }
  return false;
}

export function normalizePipelineName(name: string): string {
  if (!name) {
    return "";
  }
  const n = String(name).normalize("NFKC");
  return n
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .join(" ");
}

export function pipelinesEqual(a: string, b: string): boolean {
  return normalizePipelineName(a) === normalizePipelineName(b);
}

export function extractDealPipelineId(deal: DealDict): number | null {
  let pid: unknown = deal.pipeline_id;
  if (typeof pid === "object" && pid != null) {
    const o = pid as { value?: unknown; id?: unknown };
    pid = o.value ?? o.id;
  }
  if (pid == null) {
    return null;
  }
  const n = Number(pid);
  return Number.isFinite(n) ? n : null;
}

export function interactivePipelineKind(
  pipelineName: string,
  pipelineId: number | null,
): string | null {
  if (pipelineId != null && pipelineId in PIPELINE_ID_TO_INTERACTIVE_KIND) {
    return PIPELINE_ID_TO_INTERACTIVE_KIND[pipelineId];
  }
  const n = normalizePipelineName(pipelineName);
  if (!n) {
    return null;
  }
  if (n.includes("akvizice")) {
    return "akvizice";
  }
  if (n.includes("acquisition")) {
    return "akvizice";
  }
  if (n.includes(" - upsell") || n.endsWith(" upsell")) {
    return "upsell";
  }
  if (n.includes(" upsell")) {
    return "upsell";
  }
  return null;
}

export function pipelineIdToName(
  deal: DealDict,
  pipelinesMap: Record<number, string>,
): string {
  const pid = deal.pipeline_id;
  if (pid == null) {
    return "";
  }
  let i: number;
  try {
    i = Number(pid);
  } catch {
    return "";
  }
  if (!Number.isFinite(i)) {
    return "";
  }
  return pipelinesMap[i] ?? "";
}

export function findCommissionRule(
  categoryLabel: string,
  pipelineName: string,
  pipelineId: number | null,
): CommissionRule | null {
  for (const rule of COMMISSION_RULES) {
    const cats = [...rule.categories];
    if (!categoryLabelMatchesRuleCategories(categoryLabel, cats)) {
      continue;
    }
    const ikind = rule.interactive_kind;
    if (ikind) {
      let kind = interactivePipelineKind(pipelineName, pipelineId);
      if (kind == null) {
        kind = INTERACTIVE_PIPELINE_FALLBACK_KIND;
      }
      if (kind == null) {
        continue;
      }
      if (kind === ikind) {
        return rule;
      }
      continue;
    }
    const p = rule.pipeline;
    if (p == null) {
      return rule;
    }
    if (pipelinesEqual(pipelineName, String(p))) {
      return rule;
    }
  }
  return null;
}

function segmentBaseCategory(label: string): string {
  const cl = (label || "").toLowerCase().trim();
  if (!cl) {
    return "";
  }
  if (cl === "print" || cl.startsWith("print ") || cl.startsWith("print-")) {
    return "print";
  }
  if (cl === "posters" || cl.startsWith("posters ") || cl.startsWith("posters-")) {
    return "posters";
  }
  const parts = cl.split(/[\s,/;|+]+/).filter(Boolean);
  for (const token of parts) {
    if (
      (CATEGORIES_SHARED_INTERACTIVE_PIPELINES as readonly string[]).includes(token)
    ) {
      return token;
    }
  }
  for (const c of CATEGORIES_SHARED_INTERACTIVE_PIPELINES) {
    if (cl.startsWith(`${c} `) || cl.startsWith(`${c}-`) || cl === c) {
      return c;
    }
  }
  return cl;
}

export function rowReportingSegment(r: DealCommissionRow): string {
  const base = segmentBaseCategory(r.category_label);
  if (base === "print") {
    return "print";
  }
  if (base === "posters") {
    return "posters";
  }
  if (
    (CATEGORIES_SHARED_INTERACTIVE_PIPELINES as readonly string[]).includes(base)
  ) {
    const kind = interactivePipelineKind(r.pipeline_name, r.pipeline_id);
    if (kind === "akvizice") {
      return "interactive_akvizice";
    }
    if (kind === "upsell") {
      return "interactive_upsell";
    }
  }
  return "ostatní";
}

export function computeCommissionsForMonth(
  deals: DealDict[],
  pipelinesMap: Record<number, string>,
  userIdToName: Record<number, string>,
  categoryFieldKey: string,
  optionIdToLabel: Record<string, string>,
  year: number,
  month: number,
): DealCommissionRow[] {
  const rows: DealCommissionRow[] = [];
  for (const deal of deals) {
    const wonD = dealMonthDate(deal);
    if (!wonD) {
      continue;
    }
    const [y, m] = wonD.split("-").map(Number);
    if (y !== year || m !== month) {
      continue;
    }
    const anchorRaw = dealWonTimeRaw(deal);
    const rawCat = dealProductCategoryRaw(deal, categoryFieldKey);
    let rawForId: unknown;
    if (Array.isArray(rawCat)) {
      rawForId = rawCat[0] ?? null;
    } else {
      rawForId = rawCat;
    }
    const catNorm = normalizeCategoryLabel(rawCat, optionIdToLabel);
    if (!catNorm) {
      continue;
    }
    const rid =
      rawForId != null ? String(rawForId).trim() : "";
    const catDisplay =
      optionIdToLabel[rid] ??
      (rawForId != null ? String(rawForId).trim() : catNorm);

    const plName = pipelineIdToName(deal, pipelinesMap);
    const plId = extractDealPipelineId(deal);
    const rule = findCommissionRule(catNorm, plName, plId);
    if (!rule) {
      continue;
    }

    const value = dealMonetaryValue(deal);
    const rate = Number(rule.rate);
    const commission = value * rate;
    const ccy = dealCurrency(deal);
    const uid = extractUserId(deal);
    let ownerName =
      extractUserNameFromDeal(deal) ||
      (uid != null ? userIdToName[uid] ?? "" : "");
    if (!ownerName && uid != null) {
      ownerName = `User #${uid}`;
    }

    const did = deal.id;
    let dealId = 0;
    if (did != null) {
      const n = Number(did);
      dealId = Number.isFinite(n) ? n : 0;
    }

    const title = String(deal.title ?? "");
    rows.push({
      deal_id: dealId,
      title,
      org_name: extractOrgName(deal),
      owner_id: uid,
      owner_name: ownerName,
      category_label: catNorm,
      category_display: catDisplay,
      pipeline_name: plName,
      pipeline_id: plId,
      currency: ccy,
      value,
      rate,
      commission,
      won_date: wonD,
      won_time_raw: anchorRaw,
    });
  }
  rows.sort((a, b) => {
    const o = (a.owner_name || "").localeCompare(b.owner_name || "");
    if (o !== 0) {
      return o;
    }
    return a.deal_id - b.deal_id;
  });
  return rows;
}

export function collectWonDealsInMonth(
  deals: DealDict[],
  year: number,
  month: number,
): DealDict[] {
  const out: DealDict[] = [];
  for (const deal of deals) {
    const wonD = dealMonthDate(deal);
    if (!wonD) {
      continue;
    }
    const [y, m] = wonD.split("-").map(Number);
    if (y !== year || m !== month) {
      continue;
    }
    out.push(deal);
  }
  return out;
}

export function sumValuesByCurrency(deals: DealDict[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const deal of deals) {
    const ccy = dealCurrency(deal) || "—";
    acc[ccy] = (acc[ccy] ?? 0) + dealMonetaryValue(deal);
  }
  return acc;
}

/** Výnos = všichni won v měsíci: součet value po obchodníkovi a měně (sales controlling). */
export function aggregateWonRevenueByOwnerAndCurrency(
  wonMonthDeals: DealDict[],
  userMap: Record<number, string>,
): {
  wonRevenueByOwner: Array<{
    ownerLabel: string;
    dealCount: number;
    byCurrency: Record<string, number>;
  }>;
  wonRevenueTeamByCurrency: Record<string, number>;
} {
  const perOwner = new Map<
    string,
    { byCurrency: Record<string, number>; dealCount: number }
  >();
  const team: Record<string, number> = {};
  for (const deal of wonMonthDeals) {
    const owner = dealOwnerDisplay(deal, userMap) || "Neznámý";
    const ccy = dealCurrency(deal) || "—";
    const val = dealMonetaryValue(deal);
    if (!perOwner.has(owner)) {
      perOwner.set(owner, { byCurrency: {}, dealCount: 0 });
    }
    const o = perOwner.get(owner)!;
    o.dealCount += 1;
    o.byCurrency[ccy] = (o.byCurrency[ccy] ?? 0) + val;
    team[ccy] = (team[ccy] ?? 0) + val;
  }
  const wonRevenueByOwner = Array.from(perOwner.entries())
    .map(([ownerLabel, v]) => ({
      ownerLabel,
      dealCount: v.dealCount,
      byCurrency: v.byCurrency,
    }))
    .sort((a, b) => a.ownerLabel.localeCompare(b.ownerLabel, "cs"));
  return { wonRevenueByOwner, wonRevenueTeamByCurrency: team };
}

/** Započtené provize a hodnoty dealů po obchodníkovi a měně. */
export function aggregateCommissionByOwnerAndCurrency(rows: DealCommissionRow[]): {
  commissionByOwner: Array<{
    ownerLabel: string;
    dealCount: number;
    byCurrency: Record<string, { commission: number; value: number }>;
  }>;
  commissionTeamByCurrency: Record<string, { commission: number; value: number }>;
} {
  const perOwner = new Map<
    string,
    {
      byCurrency: Record<string, { commission: number; value: number }>;
      dealCount: number;
    }
  >();
  const team: Record<string, { commission: number; value: number }> = {};
  for (const r of rows) {
    const owner = r.owner_name || "Neznámý";
    const ccy = r.currency || "—";
    if (!perOwner.has(owner)) {
      perOwner.set(owner, { byCurrency: {}, dealCount: 0 });
    }
    const o = perOwner.get(owner)!;
    o.dealCount += 1;
    if (!o.byCurrency[ccy]) {
      o.byCurrency[ccy] = { commission: 0, value: 0 };
    }
    o.byCurrency[ccy].commission += r.commission;
    o.byCurrency[ccy].value += r.value;
    if (!team[ccy]) {
      team[ccy] = { commission: 0, value: 0 };
    }
    team[ccy].commission += r.commission;
    team[ccy].value += r.value;
  }
  const commissionByOwner = Array.from(perOwner.entries())
    .map(([ownerLabel, v]) => ({
      ownerLabel,
      dealCount: v.dealCount,
      byCurrency: v.byCurrency,
    }))
    .sort((a, b) => a.ownerLabel.localeCompare(b.ownerLabel, "cs"));
  return { commissionByOwner, commissionTeamByCurrency: team };
}

function dealCategoryDisplayForExclusion(
  deal: DealDict,
  categoryFieldKey: string,
  optionIdToLabel: Record<string, string>,
): string {
  const rawCat = dealProductCategoryRaw(deal, categoryFieldKey);
  let rawForId: unknown;
  if (Array.isArray(rawCat)) {
    rawForId = rawCat[0] ?? null;
  } else {
    rawForId = rawCat;
  }
  const rid = rawForId != null ? String(rawForId).trim() : "";
  const catNorm = normalizeCategoryLabel(rawCat, optionIdToLabel);
  if (!catNorm) {
    return "";
  }
  return (
    optionIdToLabel[rid] ??
    (rawForId != null ? String(rawForId).trim() : catNorm)
  );
}

export function dealCategoryDisplayRaw(
  deal: DealDict,
  categoryFieldKey: string,
  optionIdToLabel: Record<string, string>,
): string {
  const disp = dealCategoryDisplayForExclusion(
    deal,
    categoryFieldKey,
    optionIdToLabel,
  );
  if (disp) {
    return disp;
  }
  const rawCat = dealProductCategoryRaw(deal, categoryFieldKey);
  if (rawCat == null || rawCat === "") {
    return "";
  }
  if (Array.isArray(rawCat)) {
    return rawCat.map(String).join(", ");
  }
  return String(rawCat).trim();
}

export function exclusionReason(
  deal: DealDict,
  categoryFieldKey: string,
  optionIdToLabel: Record<string, string>,
  pipelinesMap: Record<number, string>,
): string {
  const rawCat = dealProductCategoryRaw(deal, categoryFieldKey);
  const catNorm = normalizeCategoryLabel(rawCat, optionIdToLabel);
  if (!catNorm) {
    return "chybí Product category (prázdné nebo nerozpoznané; zkontroluj klíč pole nebo detail dealu v API)";
  }
  const plName = pipelineIdToName(deal, pipelinesMap);
  const plId = extractDealPipelineId(deal);
  if (!findCommissionRule(catNorm, plName, plId)) {
    const disp = dealCategoryDisplayForExclusion(
      deal,
      categoryFieldKey,
      optionIdToLabel,
    );
    const pl = plName || "(bez pipeline)";
    let hint = "";
    const rawKind = interactivePipelineKind(plName, plId);
    if (
      categoryLabelMatchesRuleCategories(catNorm, [
        ...CATEGORIES_SHARED_INTERACTIVE_PIPELINES,
      ]) &&
      rawKind == null &&
      INTERACTIVE_PIPELINE_FALLBACK_KIND == null
    ) {
      hint =
        " — pipeline není v mapě ID ani v názvu (upsell/akvizice); nastav INTERACTIVE_PIPELINE_FALLBACK_KIND nebo PIPELINE_ID_TO_INTERACTIVE_KIND v rules.ts";
    }
    return `žádné pravidlo pro „${disp || catNorm}“ + pipeline „${pl}“${hint}`;
  }
  return "";
}

export function buildValueDiagnostics(
  deals: DealDict[],
  year: number,
  month: number,
  categoryFieldKey: string,
  optionIdToLabel: Record<string, string>,
  pipelinesMap: Record<number, string>,
  rows: DealCommissionRow[],
  maxExcludedRows = 100,
): Record<string, unknown> {
  const wonMonth = collectWonDealsInMonth(deals, year, month);
  const byCcyWon = sumValuesByCurrency(wonMonth);
  const commissionedIds = new Set(rows.map((r) => r.deal_id).filter(Boolean));
  const excluded: DealDict[] = [];
  for (const d of wonMonth) {
    const did = Number(d.id);
    if (!Number.isFinite(did)) {
      continue;
    }
    if (!commissionedIds.has(did)) {
      excluded.push(d);
    }
  }

  const byCcyCommissioned: Record<string, number> = {};
  for (const r of rows) {
    const ccy = r.currency || "—";
    byCcyCommissioned[ccy] = (byCcyCommissioned[ccy] ?? 0) + r.value;
  }

  const excludedSamples: Record<string, unknown>[] = [];
  for (const d of excluded.slice(0, maxExcludedRows)) {
    const did = Number(d.id);
    excludedSamples.push({
      id_dealu: Number.isFinite(did) ? did : 0,
      název: String(d.title ?? ""),
      product_category:
        dealCategoryDisplayRaw(d, categoryFieldKey, optionIdToLabel) ||
        "(prázdná)",
      hodnota: dealMonetaryValue(d),
      měna: dealCurrency(d) || "—",
      důvod_vyřazení: exclusionReason(
        d,
        categoryFieldKey,
        optionIdToLabel,
        pipelinesMap,
      ),
    });
  }

  const excludedByCategory: Record<string, number> = {};
  const excludedByPipeline: Record<string, number> = {};
  for (const d of excluded) {
    let catLbl = dealCategoryDisplayRaw(
      d,
      categoryFieldKey,
      optionIdToLabel,
    ).trim();
    if (!catLbl) {
      catLbl = "(prázdná / chybí Product category)";
    }
    excludedByCategory[catLbl] = (excludedByCategory[catLbl] ?? 0) + 1;
    const pl =
      pipelineIdToName(d, pipelinesMap).trim() || "(bez názvu pipeline)";
    excludedByPipeline[pl] = (excludedByPipeline[pl] ?? 0) + 1;
  }

  const wonMonthIds = new Set<number>();
  for (const d of wonMonth) {
    const id = Number(d.id);
    if (Number.isFinite(id)) {
      wonMonthIds.add(id);
    }
  }

  const otherWon: DealDict[] = [];
  for (const d of deals) {
    const id = Number(d.id);
    if (!Number.isFinite(id)) {
      continue;
    }
    if (!wonMonthIds.has(id)) {
      otherWon.push(d);
    }
  }

  const otherWonByCategory: Record<string, number> = {};
  for (const d of otherWon) {
    let catLbl = dealCategoryDisplayRaw(
      d,
      categoryFieldKey,
      optionIdToLabel,
    ).trim();
    if (!catLbl) {
      catLbl = "(prázdná / chybí Product category)";
    }
    otherWonByCategory[catLbl] = (otherWonByCategory[catLbl] ?? 0) + 1;
  }

  const sortCountRows = (
    dct: Record<string, number>,
    labelKey: string,
  ): Record<string, unknown>[] =>
    Object.entries(dct)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ [labelKey]: k, počet_dealů: v }));

  return {
    won_deals_in_month: wonMonth.length,
    api_won_deals_loaded: deals.length,
    sum_by_currency_won_month: byCcyWon,
    commissioned_deals: rows.length,
    sum_by_currency_commissioned: byCcyCommissioned,
    excluded_count: excluded.length,
    excluded_samples: excludedSamples,
    distinct_currencies_won: Object.keys(byCcyWon).sort(),
    excluded_by_category: sortCountRows(excludedByCategory, "product_category"),
    excluded_by_pipeline: sortCountRows(excludedByPipeline, "pipeline"),
    other_won_count: otherWon.length,
    other_won_by_category: sortCountRows(otherWonByCategory, "product_category"),
  };
}

export function aggregateByOwner(
  rows: DealCommissionRow[],
): Record<string, unknown>[] {
  const by: Record<
    string,
    { obchodník: string; počet_dealů: number; hodnota_dealů: number; provize_celkem: number }
  > = {};
  for (const r of rows) {
    const key = r.owner_name || "Neznámý";
    if (!by[key]) {
      by[key] = {
        obchodník: key,
        počet_dealů: 0,
        hodnota_dealů: 0,
        provize_celkem: 0,
      };
    }
    by[key].počet_dealů += 1;
    by[key].hodnota_dealů += r.value;
    by[key].provize_celkem += r.commission;
  }
  const out = Object.values(by);
  out.sort((a, b) => b.provize_celkem - a.provize_celkem);
  return out;
}

export function chartPipelineBucketLabel(r: DealCommissionRow): string {
  const base = segmentBaseCategory(r.category_label);
  if (base === "print" || base === "posters") {
    return "Libovolný pipeline";
  }
  const kind = interactivePipelineKind(r.pipeline_name, r.pipeline_id);
  if (kind === "upsell") {
    return "Upsell (CZ/SK…)";
  }
  if (kind === "akvizice") {
    return "Akvizice";
  }
  const pl = (r.pipeline_name || "").trim();
  if (!pl) {
    return "(bez pipeline)";
  }
  return pl.length <= 38 ? pl : `${pl.slice(0, 35)}…`;
}

export function rowsToExportRows(rows: DealCommissionRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    id_dealu: r.deal_id,
    název_dealu: r.title,
    organizace: r.org_name,
    obchodník: r.owner_name,
    kategorie: r.category_display,
    pipeline: r.pipeline_name,
    měna: r.currency || "—",
    hodnota: r.value,
    sazba: r.rate,
    provize: r.commission,
    datum_won: r.won_date ?? "",
    won_time: r.won_time_raw,
    segment: rowReportingSegment(r),
  }));
}

export function buildFullMonthExportRows(
  wonMonth: DealDict[],
  commissioned: DealCommissionRow[],
  categoryFieldKey: string,
  optionMap: Record<string, string>,
  pipelinesMap: Record<number, string>,
  userMap: Record<number, string>,
): Record<string, unknown>[] {
  const byId = new Map(
    commissioned.filter((r) => r.deal_id).map((r) => [r.deal_id, r]),
  );

  const sortKey = (d: DealDict): [string, number] => {
    const did = Number(d.id);
    return [dealOwnerDisplay(d, userMap), Number.isFinite(did) ? did : 0];
  };

  const sorted = [...wonMonth].sort((a, b) => {
    const [oa, da] = sortKey(a);
    const [ob, db] = sortKey(b);
    const c = oa.localeCompare(ob);
    return c !== 0 ? c : da - db;
  });

  const out: Record<string, unknown>[] = [];
  for (const deal of sorted) {
    const did = Number(deal.id);
    const dealId = Number.isFinite(did) ? did : 0;
    const anchorRaw = dealWonTimeRaw(deal);
    const wonD = dealMonthDate(deal);
    const wonDateStr = wonD ?? "";

    const row: Record<string, unknown> = {
      id_dealu: dealId,
      název_dealu: String(deal.title ?? ""),
      organizace: extractOrgName(deal),
      obchodník: dealOwnerDisplay(deal, userMap),
      kategorie: dealCategoryDisplayRaw(deal, categoryFieldKey, optionMap),
      pipeline: pipelineIdToName(deal, pipelinesMap),
      měna: dealCurrency(deal) || "—",
      hodnota: dealMonetaryValue(deal),
      datum_pro_měsíc: wonDateStr,
      časové_pole_pro_měsíc: anchorRaw,
      won_time_api: String(deal.won_time ?? ""),
      close_time_api: String(deal.close_time ?? ""),
    };

    const r = byId.get(dealId);
    if (r) {
      row.započteno_do_provize = "ano";
      row.sazba = r.rate;
      row.provize = r.commission;
      row.segment = rowReportingSegment(r);
      row.důvod_vyřazení = "";
    } else {
      row.započteno_do_provize = "ne";
      row.sazba = null;
      row.provize = null;
      row.segment = "";
      row.důvod_vyřazení = exclusionReason(
        deal,
        categoryFieldKey,
        optionMap,
        pipelinesMap,
      );
    }
    out.push(row);
  }
  return out;
}

export async function enrichDealsWithFullDetails(
  deals: DealDict[],
  categoryFieldKey: string,
  getDeal: (id: number) => Promise<DealDict | null>,
): Promise<DealDict[]> {
  const out: DealDict[] = [];
  for (const d of deals) {
    if (dealCategoryPresent(d, categoryFieldKey)) {
      out.push(d);
      continue;
    }
    const did = Number(d.id);
    if (!Number.isFinite(did)) {
      out.push(d);
      continue;
    }
    const full = await getDeal(did);
    out.push(full ? { ...d, ...full } : d);
  }
  return out;
}
