import Link from "next/link";

type Props = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
};

export function DocumentsPagination({ page, totalPages, total, pageSize }: Props) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const prevHref = page > 2 ? `/documents?page=${page - 1}` : "/documents";
  const nextHref = `/documents?page=${page + 1}`;

  return (
    <div className="text-muted-foreground flex flex-col gap-3 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p>
        Celkem <strong className="text-foreground">{total}</strong> dokladů — zobrazeno{" "}
        <strong className="text-foreground">
          {from}–{to}
        </strong>{" "}
        (stránka <strong className="text-foreground">{page}</strong> z{" "}
        <strong className="text-foreground">{totalPages}</strong>).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {page > 1 ? (
          <Link
            href={prevHref}
            className="text-primary font-medium underline underline-offset-2"
          >
            ← Předchozí
          </Link>
        ) : (
          <span className="text-muted-foreground/60">← Předchozí</span>
        )}
        {page < totalPages ? (
          <Link
            href={nextHref}
            className="text-primary font-medium underline underline-offset-2"
          >
            Další →
          </Link>
        ) : (
          <span className="text-muted-foreground/60">Další →</span>
        )}
      </div>
    </div>
  );
}
