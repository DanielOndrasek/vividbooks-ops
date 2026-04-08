import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    include: {
      user: { select: { email: true, name: true } },
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      <p className="text-muted-foreground text-sm">
        Posledních 150 událostí v systému.
      </p>
      <div className="table-panel">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-3 font-medium">Čas</th>
              <th className="p-3 font-medium">Akce</th>
              <th className="p-3 font-medium">Entita</th>
              <th className="p-3 font-medium">Uživatel</th>
              <th className="p-3 font-medium">Data</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-muted-foreground whitespace-nowrap p-3 text-xs">
                  {r.createdAt.toLocaleString("cs-CZ")}
                </td>
                <td className="p-3 font-mono text-xs">{r.action}</td>
                <td className="p-3 text-xs">
                  {r.entityType} /{" "}
                  <span className="font-mono break-all">{r.entityId}</span>
                </td>
                <td className="max-w-[140px] truncate p-3 text-xs">
                  {r.user?.email ?? "—"}
                </td>
                <td className="text-muted-foreground max-w-[280px] p-3 text-xs">
                  {r.metadata ? JSON.stringify(r.metadata) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
