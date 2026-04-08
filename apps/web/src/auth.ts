import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";

import authConfig from "@/auth.config";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  debug: process.env.AUTH_DEBUG === "1",
  logger: {
    error(error) {
      console.error("[auth]", error);
      const c = error instanceof Error ? error.cause : undefined;
      if (c) {
        console.error("[auth cause]", c);
      }
    },
  },
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      const userId = user?.id ?? token.sub;
      if (userId) {
        try {
          const row = await prisma.user.findUnique({ where: { id: userId } });
          token.role = row?.role ?? "VIEWER";
        } catch (e) {
          console.error("[auth] jwt: databáze nedostupná, role VIEWER", e);
          token.role = "VIEWER";
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = (token.role as string) ?? "VIEWER";
      }
      return session;
    },
  },
});
