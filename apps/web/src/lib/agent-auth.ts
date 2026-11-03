import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Přístup pro agenta (Hermes): hlavička `Authorization: Bearer <AGENT_API_TOKEN>`.
 * Agent jedná za uživatele AGENT_ACTS_AS_EMAIL (role ADMIN/APPROVER) — kvůli auditu a „schválil“.
 * Bez tokenu lze stejné endpointy volat i z přihlášené session ADMIN/APPROVER.
 */
function bearerMatches(header: string | null): boolean {
  const token = process.env.AGENT_API_TOKEN?.trim();
  if (!token || token.length < 24 || !header?.startsWith("Bearer ")) {
    return false;
  }
  const given = Buffer.from(header.slice(7).trim());
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

export type AgentActor = { userId: string; via: "agent_token" | "session" };

export async function requireAgentOrApprover(
  req: Request,
): Promise<{ actor: AgentActor; response: null } | { actor: null; response: NextResponse }> {
  if (bearerMatches(req.headers.get("authorization"))) {
    const email = process.env.AGENT_ACTS_AS_EMAIL?.trim().toLowerCase();
    if (!email) {
      return {
        actor: null,
        response: NextResponse.json({ error: "Chybí AGENT_ACTS_AS_EMAIL." }, { status: 500 }),
      };
    }
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
    if (!user || (user.role !== "ADMIN" && user.role !== "APPROVER")) {
      return {
        actor: null,
        response: NextResponse.json(
          { error: "Uživatel z AGENT_ACTS_AS_EMAIL neexistuje nebo nemá roli ADMIN/APPROVER." },
          { status: 500 },
        ),
      };
    }
    return { actor: { userId: user.id, via: "agent_token" }, response: null };
  }
  const session = await auth();
  const role = session?.user?.role;
  if (session?.user?.id && (role === "ADMIN" || role === "APPROVER")) {
    return { actor: { userId: session.user.id, via: "session" }, response: null };
  }
  return {
    actor: null,
    response: NextResponse.json({ error: "Nepřihlášen / neplatný token." }, { status: 401 }),
  };
}
