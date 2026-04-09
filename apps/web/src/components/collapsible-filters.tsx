"use client";

import { useEffect, useState } from "react";

type Props = {
  defaultOpen: boolean;
  summary: string;
  children: React.ReactNode;
};

/**
 * Filtry ve <details>; při změně defaultOpen (nová URL) znovu otevře, jinak uživatel může zavřít/otevřít.
 */
export function CollapsibleFilters({ defaultOpen, summary, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <details
      className="rounded-lg border bg-card"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground hover:text-foreground">{summary}</span>
      </summary>
      {children}
    </details>
  );
}
