/**
 * Produkční migrace: načte DATABASE_URL a spustí `prisma migrate deploy`.
 *
 * 1) Stáhni env z Vercelu (z kořene monorepa):
 *    vercel env pull apps/web/.env.vercel.production --environment production
 * 2) Spusť z apps/web:
 *    npm run db:migrate:prod
 *
 * Supabase „Direct“ (db.*.supabase.co:5432) často používá jen IPv6 → P1001 z Macu / některých sítí.
 * Přepni na Session pooler (IPv4). Host kopíruj z Supabase → Connect (může být aws-0-… i aws-1-…):
 *
 *    SUPABASE_POOLER_HOST=aws-1-eu-west-1.pooler.supabase.com npm run db:migrate:prod
 *
 * Nebo jen region (sestaví se aws-0-REGION…, starší projekty):
 *
 *    SUPABASE_POOLER_REGION=eu-central-1 npm run db:migrate:prod
 *
 * Nebo vlož celý Session URI z Supabase:
 *    MIGRATION_DATABASE_URL="postgresql://postgres.xxx:..." npm run db:migrate:prod
 *
 * Session pooler vyžaduje uživatele postgres.PROJECT_REF. Když máš v URL jen „postgres“:
 *    SUPABASE_PROJECT_REF=uwfzzooitqatotbxrnzw npm run db:migrate:prod
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "..");
const pulled = resolve(root, ".env.vercel.production");

function ensureSslMode(url) {
  if (!url?.trim()) {
    return url;
  }
  if (/[?&]sslmode=/.test(url)) {
    return url;
  }
  return url + (url.includes("?") ? "&" : "?") + "sslmode=require";
}

/**
 * Direct: postgresql://postgres:PASS@db.PROJECT_REF.supabase.co:5432/postgres
 * Session pooler: …@HOST:5432/postgres — HOST z UI (např. aws-1-eu-west-1.pooler.supabase.com).
 */
function directSupabaseToSessionPooler(urlString, poolHost) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    return null;
  }
  const m = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (!m) {
    return null;
  }
  if (u.port && u.port !== "5432") {
    return null;
  }
  const projectRef = m[1];
  const user = `postgres.${projectRef}`;
  const pass = u.password;
  const db = u.pathname && u.pathname !== "/" ? u.pathname : "/postgres";
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`;
  return `postgresql://${auth}@${poolHost}:5432${db}?sslmode=require`;
}

/** Supabase pooler: user musí být postgres.ref, ne jen postgres (jinak P1000). */
function fixSupabasePoolerUsername(urlString) {
  const ref = process.env.SUPABASE_PROJECT_REF?.trim();
  if (!ref) {
    return urlString;
  }
  let u;
  try {
    u = new URL(urlString);
  } catch {
    return urlString;
  }
  if (!/\.pooler\.supabase\.com$/i.test(u.hostname)) {
    return urlString;
  }
  const user = decodeURIComponent(u.username || "");
  if (user !== "postgres") {
    return urlString;
  }
  u.username = `postgres.${ref}`;
  console.log(
    `Upraven uživatel na postgres.${ref} (Supabase Session pooler).\n`,
  );
  return u.toString();
}

let url = process.env.MIGRATION_DATABASE_URL?.trim();
if (!url && existsSync(pulled)) {
  config({ path: pulled });
  url = process.env.DATABASE_URL?.trim();
}
if (!url) {
  console.error(
    "Chybí DATABASE_URL. Buď vytvoř apps/web/.env.vercel.production (vercel env pull), nebo nastav MIGRATION_DATABASE_URL.",
  );
  process.exit(1);
}

const poolHostEnv = process.env.SUPABASE_POOLER_HOST?.trim();
const region = process.env.SUPABASE_POOLER_REGION?.trim();
const poolHost =
  poolHostEnv ||
  (region ? `aws-0-${region}.pooler.supabase.com` : "");

if (poolHost) {
  const rewritten = directSupabaseToSessionPooler(url, poolHost);
  if (rewritten) {
    console.log(
      `Používám Supabase Session pooler (${poolHost}) místo direct hostu — IPv4.\n`,
    );
    url = rewritten;
  } else {
    console.warn(
      "SUPABASE_POOLER_HOST / REGION je nastavený, ale DATABASE_URL neodpovídá tvaru db.*.supabase.co:5432 — používám původní URL.\n",
    );
  }
}

url = fixSupabasePoolerUsername(url);

process.env.DATABASE_URL = ensureSslMode(url);

console.log("Spouštím: prisma migrate deploy\n");

try {
  execSync("npx prisma migrate deploy", {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
} catch {
  console.error(`
Supabase časté chyby:
  • P1001 — IPv6 direct: použij Session pooler host + SUPABASE_POOLER_HOST=aws-0-REGION... nebo celé URI z Connect.
  • P1000 — špatné heslo NEBO uživatel jen „postgres“ u pooleru → musí být postgres.TVOJ_PROJECT_REF
    (stejné jako v Supabase Connect), nebo:
    SUPABASE_PROJECT_REF=tvuj_ref npm run db:migrate:prod
  • Ověř heslo v Settings → Database a že projekt není paused.
`);
  process.exit(1);
}
