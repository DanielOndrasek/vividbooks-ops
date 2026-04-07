import Link from "next/link";

import { auth } from "@/auth";
import { SignOutButton } from "@/components/sign-out-button";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/invoices", label: "Faktury" },
  { href: "/payment-proofs", label: "Platby" },
  { href: "/needs-review", label: "Ke kontrole" },
  { href: "/documents", label: "Všechny doklady" },
  { href: "/commission", label: "Provize" },
  { href: "/audit-log", label: "Audit" },
  { href: "/settings", label: "Nastavení" },
] as const;

export async function AppNav() {
  const session = await auth();

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold tracking-tight">
            Vividbooks Ops
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="hover:text-foreground transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {session?.user?.email && (
            <span className="text-muted-foreground max-w-[200px] truncate">
              {session.user.email}
            </span>
          )}
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
