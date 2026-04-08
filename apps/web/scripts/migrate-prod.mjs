/**
 * Produkční migrace: načte DATABASE_URL a spustí `prisma migrate deploy`.
 *
 * 1) Stáhni env z Vercelu (z kořene monorepa):
 *    vercel env pull apps/web/.env.vercel.production --environment production
 * 2) Spusť z apps/web:
 *    npm run db:migrate:prod
 *
 * Supabase „Direct“ (db.*.supabase.co:5432) často používá jen IPv6 → P1001 z Macu / některých sítí.
 * Přepni na Session pooler (IPv4): nastav region z dashboardu Connect → Session mode
 * (host typu aws-0-eu-central-1.pooler.supabase.com → region = eu-central-1):
 *
 *    SUPABASE_POOLER_REGION=eu-central-1 npm run db:migrate:prod
 *
 * Nebo vlož celý Session URI z Supabase:
 *    MIGRATION_DATABASE_URL="postgresql://postgres.xxx:..." npm run db:migrate:prod
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
 * Session pooler: postgresql://postgres.PROJECT_REF:PASS@aws-0-REGION.pooler.supabase.com:5432/postgres
 */
function directSupabaseToSessionPooler(urlString, region) {
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
  const poolHost = `aws-0-${region}.pooler.supabase.com`;
  const user = `postgres.${projectRef}`;
  const pass = u.password;
  const db = u.pathname && u.pathname !== "/" ? u.pathname : "/postgres";
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`;
  return `postgresql://${auth}@${poolHost}:5432${db}?sslmode=require`;
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

const region = process.env.SUPABASE_POOLER_REGION?.trim();
if (region) {
  const rewritten = directSupabaseToSessionPooler(url, region);
  if (rewritten) {
    console.log(
      `Používám Supabase Session pooler (region ${region}) místo direct hostu — IPv4.\n`,
    );
    url = rewritten;
  } else {
    console.warn(
      "SUPABASE_POOLER_REGION je nastavený, ale DATABASE_URL neodpovídá tvaru db.*.supabase.co:5432 — používám původní URL.\n",
    );
  }
}

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
Pokud vidíš P1001 (Can't reach database server) u Supabase:
  • Direct connection je často IPv6-only. Zkus z kořene monorepa:

    cd apps/web
    SUPABASE_POOLER_REGION=<tvůj-region> npm run db:migrate:prod

    Region zkopíruj z Supabase → Connect → „Session pooler“
    (z hostu aws-0-REGION.pooler.supabase.com, např. eu-central-1).

  • Nebo vlož celý „Session mode“ URI jako MIGRATION_DATABASE_URL.

  • Ověř, že projekt v Supabase není „paused“.
`);
  process.exit(1);
}
