import type { NextRequest } from "next/server";

import { auth } from "@/auth";

export function canRunIntegrationJobs(role: string | undefined): boolean {
  return role === "ADMIN" || role === "APPROVER";
}

/** Session s oprávněním spouštět Gmail poll a AI extrakci (POST z UI). */
export async function requireJobRunnerSession() {
  const session = await auth();
  if (!canRunIntegrationJobs(session?.user?.role)) {
    return null;
  }
  return session;
}

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
