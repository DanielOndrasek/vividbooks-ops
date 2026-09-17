import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/** Pouze během `next build` (Vercel bez DATABASE_URL v build kroku). */
const BUILD_PLACEHOLDER_DATABASE_URL =
  "postgresql://build:build@127.0.0.1:5432/build?schema=public";

function ensureSslForSupabase(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (!/\.(pooler\.)?supabase\.co$/i.test(host)) {
      return url;
    }
  } catch {
    return url;
  }
  if (/[?&]sslmode=/.test(url)) {
    return url;
  }
  return url + (url.includes("?") ? "&" : "?") + "sslmode=require";
}

function resolveDatabaseUrl(): string {
  const trimmed = process.env.DATABASE_URL?.trim();
  if (trimmed) {
    return ensureSslForSupabase(trimmed);
  }
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return BUILD_PLACEHOLDER_DATABASE_URL;
  }
  throw new Error("DATABASE_URL must be set for Prisma Client.");
}

/**
 * Supabase Session pooler (port 5432) drží jedno připojení na klienta a má strop pool_size (15).
 * Serverless instance ho rychle vyčerpají → EMAXCONNSESSION a nenačtené doklady.
 * Za běhu proto jdeme přes Transaction pooler (6543) na stejném hostu.
 * Migrace (prisma.config.ts) dál používají původní URL — ty transaction mode nesnesou.
 */
function toSupabaseTransactionPooler(url: string): string {
  try {
    const u = new URL(url);
    if (!/\.pooler\.supabase\.com$/i.test(u.hostname) || u.port !== "5432") {
      return url;
    }
    u.port = "6543";
    return u.toString();
  } catch {
    return url;
  }
}

/** Připojení na jednu serverless instanci; souběžné instance se sčítají. */
const POOL_MAX = 3;

function createPrismaClient() {
  const connectionString = toSupabaseTransactionPooler(resolveDatabaseUrl());
  const adapter = new PrismaPg({
    connectionString,
    max: POOL_MAX,
    idleTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

/**
 * Lenivá inicializace: import `@/lib/prisma` nesahá na DB, dokud se nevolá např. `prisma.invoice`.
 * Umožní načíst lehké routy i když je modul v balíčku načten společně s auth (OAuth callback stejně DB potřebuje).
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
