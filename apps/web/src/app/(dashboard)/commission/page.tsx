import { CommissionTool } from "@/components/commission-tool";
import { getPipedriveEnv } from "@/lib/integrations/env";

export const dynamic = "force-dynamic";

export default async function CommissionPage() {
  const pd = getPipedriveEnv();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Provize (Pipedrive)</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Won dealy v kalendářním měsíci podle <code>won_time</code>. Pravidla jsou v kódu (
          <code>src/lib/commission/rules.ts</code>) — stejná logika jako dříve ve Streamlitu.
        </p>
      </div>
      <CommissionTool pipedriveConfigured={pd.configured} />
    </div>
  );
}
