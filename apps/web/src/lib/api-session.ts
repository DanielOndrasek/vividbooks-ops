import { NextResponse } from "next/server";
import type { Session } from "next-auth";

import { auth } from "@/auth";

import type { UserRole } from "@prisma/client";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      session: null,
      response: NextResponse.json({ error: "Nepřihlášen." }, { status: 401 }),
    };
  }
  return { session: session as Session, response: null };
}

export function requireRoles(
  session: Session,
  allowed: UserRole[],
): NextResponse | null {
  const role = session.user?.role as UserRole | undefined;
  if (!role || !allowed.includes(role)) {
    return NextResponse.json({ error: "Nedostatečná oprávnění." }, { status: 403 });
  }
  return null;
}
