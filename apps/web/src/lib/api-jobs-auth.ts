import type { NextRequest } from "next/server";

import { auth } from "@/auth";

/** Cron (Bearer CRON_SECRET) nebo přihlášený ADMIN. */
export async function authorizeCronOrAdmin(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (secret && authz === `Bearer ${secret}`) {
    return { kind: "cron" as const };
  }
  const session = await auth();
  if (session?.user?.role === "ADMIN") {
    return { kind: "admin" as const, session };
  }
  return null;
}

export async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return null;
  }
  return session;
}
