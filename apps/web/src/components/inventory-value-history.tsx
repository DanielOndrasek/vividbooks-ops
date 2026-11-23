import type { SnapshotDto } from "@/services/inventory/value-snapshot";

function fmtMoney(n: number): string {
  return n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

/** Malý přehled měsíčních hodnot skladu (snímky; aktuální měsíc je průběžný). */
export function InventoryValueHistory({ snapshots }: { snapshots: SnapshotDto[] }) {
  if (snapshots.length === 0) {
    return null;
  }
  const max = Math.max(...snapshots.map((s) => s.value), 1);
  const rows = [...snapshots].reverse();
  return (
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
      <div className="border-b border-border/60 bg-muted/30 px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold tracking-tight">Hodnota skladu po měsících</h2>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          Snímek se ukládá denně; měsíc se uzavře prvním během v dalším měsíci. Starší měsíce označené „dopočteno“
          jsou odhad z pohybů skladu při dnešních cenách.
        </p>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map((s) => (
          <li key={`${s.month}-${s.currency}`} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
            <span className="w-36 shrink-0 capitalize">{monthLabel(s.month)}</span>
            <span className="bg-muted relative hidden h-2 flex-1 overflow-hidden rounded-full sm:block">
              <span className="bg-primary/70 absolute inset-y-0 left-0 rounded-full" style={{ width: `${(s.value / max) * 100}%` }} />
            </span>
            <span className="w-44 shrink-0 text-right tabular-nums">
              {fmtMoney(s.value)} <span className="text-muted-foreground text-xs">{s.currency}</span>
            </span>
            <span className="text-muted-foreground w-24 shrink-0 text-right text-xs">
              {s.final ? "uzavřeno" : "průběžně"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
