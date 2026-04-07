import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/** Pouze během `next build` (Vercel bez DATABASE_URL v build kroku). */
const BUILD_PLACEHOLDER_DATABASE_URL =
  "postgresql://build:build@127.0.0.1:5432/build?schema=public";

function resolveDatabaseUrl(): string {
  const trimmed = process.env.DATABASE_URL?.trim();
  if (trimmed) {
    return trimmed;
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

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
