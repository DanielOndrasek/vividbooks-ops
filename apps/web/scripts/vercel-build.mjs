/**
 * Build na Vercelu: u Production deployment nejdřív `prisma migrate deploy`, poté `next build`.
 * Lokální `npm run build` migraci nevolá (VERCEL_ENV není production).
 */

import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.env.VERCEL_ENV === "production") {
  console.log("[vercel-build] VERCEL_ENV=production → prisma migrate deploy\n");
  execSync("npx prisma migrate deploy", {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
}

console.log("[vercel-build] next build\n");
execSync("npx next build", {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
