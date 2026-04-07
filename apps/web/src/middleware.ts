import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import authConfig from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    path.startsWith("/api/jobs/") &&
    req.headers.get("authorization") === `Bearer ${cronSecret}`
  ) {
    return NextResponse.next();
  }
  if (
    path.startsWith("/login") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico"
  ) {
    return NextResponse.next();
  }
  if (!req.auth) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
