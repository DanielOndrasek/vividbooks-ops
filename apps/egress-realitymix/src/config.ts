import { z } from 'zod';

const cidrSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F.:]+\/\d{1,3}$/, 'CIDR musí být ve tvaru "IP/prefix"');

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  MOCK_MODE: z
    .union([z.string(), z.boolean()])
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    })
    .default(false),
  ALLOWED_CALLER_CIDRS: z
    .string()
    .default('')
    .transform((raw) =>
      raw
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    )
    .pipe(z.array(cidrSchema)),
  INTERNAL_EGRESS_TOKEN: z.string().min(16, 'INTERNAL_EGRESS_TOKEN musí mít alespoň 16 znaků'),
  REALITYMIX_RK_ID: z.string().min(1).optional(),
  REALITYMIX_RK_PASSWORD: z.string().min(1).optional(),
  REALITYMIX_SW_KEY: z.string().min(1).optional(),
  REALITYMIX_RPC_URL: z.string().url().default('https://realitymix.cz/import/rpc/'),
  REALITYMIX_RPC_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'} – ${issue.message}`)
      .join('\n  ');
    throw new Error(`Neplatná konfigurace egress workera:\n  ${message}`);
  }
  const config = parsed.data;
  if (!config.MOCK_MODE) {
    const missing: string[] = [];
    if (!config.REALITYMIX_RK_ID) missing.push('REALITYMIX_RK_ID');
    if (!config.REALITYMIX_RK_PASSWORD) missing.push('REALITYMIX_RK_PASSWORD');
    if (!config.REALITYMIX_SW_KEY) missing.push('REALITYMIX_SW_KEY');
    if (missing.length > 0) {
      throw new Error(
        `Chybí povinné RealityMIX proměnné (MOCK_MODE=false): ${missing.join(', ')}`,
      );
    }
  }
  return config;
}
