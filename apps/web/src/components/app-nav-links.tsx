"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Přehled" },
  { href: "/invoices", label: "Faktury" },
  { href: "/payment-proofs", label: "Platby" },
  { href: "/needs-review", label: "Ke kontrole" },
  { href: "/documents", label: "Doklady" },
  { href: "/commission", label: "Provize" },
  { href: "/audit-log", label: "Audit" },
  { href: "/settings", label: "Nastavení" },
] as const;

function linkActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNavLinks() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-wrap items-center gap-0.5"
      aria-label="Hlavní menu"
    >
      {links.map(({ href, label }) => {
        const active = linkActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/12 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-muted/90 hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
