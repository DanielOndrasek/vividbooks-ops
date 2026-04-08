import Link from "next/link";

import { auth } from "@/auth";
import { AppNavLinks } from "@/components/app-nav-links";
import { SignOutButton } from "@/components/sign-out-button";

export async function AppNav() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
          <Link
            href="/"
            className="text-foreground shrink-0 text-lg font-semibold tracking-tight transition-opacity hover:opacity-85"
          >
            <span className="text-primary">Vividbooks</span>{" "}
            <span className="text-muted-foreground font-medium">Ops</span>
          </Link>
          <AppNavLinks />
        </div>
        <div className="flex shrink-0 items-center gap-3 border-t border-border/50 pt-3 text-sm sm:border-t-0 sm:pt-0">
          {session?.user?.email && (
            <span
              className="text-muted-foreground max-w-[min(100%,14rem)] truncate text-xs sm:text-sm"
              title={session.user.email}
            >
              {session.user.email}
            </span>
          )}
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
