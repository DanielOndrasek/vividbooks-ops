import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export default {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  // AUTH_SECRET je standard; NEXTAUTH_SECRET je běžný alias (starší návody / Vercel šablony).
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      const domain = process.env.ALLOWED_EMAIL_DOMAIN;
      if (!domain?.trim()) {
        return true;
      }
      const email = user.email?.toLowerCase();
      if (!email) {
        return false;
      }
      return email.endsWith(`@${domain.toLowerCase()}`);
    },
  },
} satisfies NextAuthConfig;
