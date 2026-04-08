/**
 * Produkční migrace: načte DATABASE_URL a spustí `prisma migrate deploy`.
 *
 * 1) Stáhni env z Vercelu (z kořene monorepa):
 *    vercel env pull apps/web/.env.vercel.production --environment production
 * 2) Spusť z apps/web:
 *    npm run db:migrate:prod
 *
 * Volitelně místo souboru použij vlastní connection string (např. Supabase „Session“ pooler):
 *    MIGRATION_DATABASE_URL="postgresql://..." npm run db:migrate:prod
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
Pokud vidíš P1001 (Can't reach database server):
  • Ověř v Supabase, že projekt není „paused“.
  • Zkus v Supabase → Database → Connection string → „Session mode“ pooler (port 6543)
    a nastav: MIGRATION_DATABASE_URL="..." npm run db:migrate:prod
  • Na některých sítích nefunguje IPv6 u „Direct connection“ — v Supabase zapni IPv4 add-on nebo použij pooler.
`);
  process.exit(1);
}
