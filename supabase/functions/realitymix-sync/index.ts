// Supabase Edge Function: realitymix-sync
//
// Volá egress-realitymix workera (pevná IPv4) pro stažení statistik
// a poptávek z RealityMIX XML-RPC API a zapisuje je do Supabase tabulek
// `realitymix_listing_stats` a `realitymix_inquiries` přes service role.
//
// Spuštění:
//   - Supabase Scheduler (doporučeno): `* */6 * * *` pro statistiky,
//     `*/15 * * * *` pro poptávky. Konkrétní cron je v supabase/config.toml
//     (sekce `[functions.realitymix-sync]`) nebo v pg_cron jobu.
//   - HTTP POST s headerem `Authorization: Bearer <ANON_KEY>`
//     a body `{ "kind": "stats" | "inquiries" | "all" }`.

// @ts-nocheck — Edge Function se kompiluje v Deno runtime na Supabase,
// lokální `tsc` v repu by se snažil aplikovat Node typy.
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

import { EgressClient } from '../_shared/egress.ts';

interface SyncRequestBody {
  kind?: 'stats' | 'inquiries' | 'all';
  since?: string;
  dateFrom?: string;
  dateTo?: string;
  advertIds?: string[];
  detail?: boolean;
}

interface SyncResult {
  stats?: { fetched: number; upserted: number };
  inquiries?: { fetched: number; upserted: number };
  errors?: string[];
}

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'EGRESS_BASE_URL',
  'INTERNAL_EGRESS_TOKEN',
] as const;

function getEnv(name: (typeof requiredEnv)[number]): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Chybí env proměnná ${name}`);
  return value;
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  let body: SyncRequestBody = {};
  try {
    const raw = await request.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: 'invalid_json_body' }, 400);
  }

  const kind = body.kind ?? 'all';
  const result: SyncResult = {};
  const errors: string[] = [];

  let supabase: ReturnType<typeof createClient>;
  let egress: EgressClient;
  try {
    supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    egress = new EgressClient({
      baseUrl: getEnv('EGRESS_BASE_URL'),
      token: getEnv('INTERNAL_EGRESS_TOKEN'),
    });
  } catch (error) {
    return jsonResponse({ error: 'config_error', message: (error as Error).message }, 500);
  }

  if (kind === 'stats' || kind === 'all') {
    try {
      result.stats = await syncStats(supabase, egress, body);
    } catch (error) {
      errors.push(`stats: ${(error as Error).message}`);
    }
  }
  if (kind === 'inquiries' || kind === 'all') {
    try {
      result.inquiries = await syncInquiries(supabase, egress, body);
    } catch (error) {
      errors.push(`inquiries: ${(error as Error).message}`);
    }
  }

  if (errors.length > 0) result.errors = errors;
  const status = errors.length > 0 && !result.stats && !result.inquiries ? 502 : 200;
  return jsonResponse(result, status);
});

async function syncStats(
  supabase: any,
  egress: EgressClient,
  body: SyncRequestBody,
): Promise<{ fetched: number; upserted: number }> {
  const params: { advertIds?: string[]; dateFrom?: string; dateTo?: string } = {};
  if (body.advertIds && body.advertIds.length > 0) params.advertIds = body.advertIds;
  if (body.dateFrom) params.dateFrom = body.dateFrom;
  if (body.dateTo) params.dateTo = body.dateTo;
  const { data: rows } = await egress.listStats(params);

  const now = new Date().toISOString();
  const records = (rows ?? []).map((row) => ({
    advert_id: String(row.advert_id),
    stat_date: pickDate(row.date) ?? new Date().toISOString().slice(0, 10),
    list_views: toInt(row.list_views),
    detail_views: toInt(row.detail_views),
    contact_views: toInt(row.contact_views),
    inquiries: toInt(row.inquiries),
    raw: row,
    fetched_at: now,
  }));

  if (records.length === 0) {
    return { fetched: 0, upserted: 0 };
  }

  const { error } = await supabase
    .from('realitymix_listing_stats')
    .upsert(records, { onConflict: 'advert_id,stat_date' });
  if (error) throw new Error(`upsert listing stats: ${error.message}`);
  return { fetched: rows.length, upserted: records.length };
}

async function syncInquiries(
  supabase: any,
  egress: EgressClient,
  body: SyncRequestBody,
): Promise<{ fetched: number; upserted: number }> {
  const params: { since?: string; advertId?: string; detail?: boolean } = {};
  if (body.since) params.since = body.since;
  if (body.detail !== undefined) params.detail = body.detail;
  const { data: rows } = await egress.listInquiries(params);

  const now = new Date().toISOString();
  const records = (rows ?? [])
    .map((row) => {
      const inquiryId = row.inquiry_id != null ? String(row.inquiry_id) : null;
      if (!inquiryId) return null;
      return {
        inquiry_id: inquiryId,
        advert_id: row.advert_id != null ? String(row.advert_id) : null,
        created_at: pickTimestamp(row.created_at),
        email: row.email ?? null,
        phone: row.phone ?? null,
        name: row.name ?? null,
        message: row.message ?? null,
        has_detail: typeof row.message === 'string' && row.message.length > 0,
        raw: row,
        fetched_at: now,
      };
    })
    .filter((record): record is NonNullable<typeof record> => record !== null);

  if (records.length === 0) {
    return { fetched: 0, upserted: 0 };
  }

  const { error } = await supabase
    .from('realitymix_inquiries')
    .upsert(records, { onConflict: 'inquiry_id' });
  if (error) throw new Error(`upsert inquiries: ${error.message}`);
  return { fetched: rows.length, upserted: records.length };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function pickDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return match ? match[0] : null;
}

function pickTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
