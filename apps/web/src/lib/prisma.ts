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

function createPrismaClient() {
  const connectionString = resolveDatabaseUrl();
  const adapter = new PrismaPg(connectionString);
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
