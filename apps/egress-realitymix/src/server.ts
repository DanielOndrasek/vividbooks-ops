import { Hono } from 'hono';

import type { AppConfig } from './config.js';
import { requireInternalAuth } from './middleware/auth.js';
import { RealitymixClient } from './realitymix/client.js';
import { MockRealitymixClient, type RealitymixClientLike } from './realitymix/mockClient.js';
import { buildRealitymixRouter } from './routes/realitymix.js';

interface BuildAppOptions {
  /** Volitelný override klienta (například pro testy). */
  client?: RealitymixClientLike;
}

export interface BuiltApp {
  app: Hono;
  client: RealitymixClientLike;
}

export function buildApp(config: AppConfig, options: BuildAppOptions = {}): BuiltApp {
  const client: RealitymixClientLike =
    options.client ?? (config.MOCK_MODE ? new MockRealitymixClient() : new RealitymixClient(config));
  const app = new Hono();

  app.get('/healthz', (context) => context.json({ status: 'ok', mock: config.MOCK_MODE }));

  const protectedRouter = new Hono();
  protectedRouter.use(
    '*',
    requireInternalAuth({
      expectedToken: config.INTERNAL_EGRESS_TOKEN,
      allowedCidrs: config.ALLOWED_CALLER_CIDRS,
    }),
  );
  protectedRouter.route('/realitymix', buildRealitymixRouter(client));
  app.route('/', protectedRouter);

  app.notFound((context) => context.json({ error: 'not_found' }, 404));
  app.onError((error, context) => {
    console.error('[egress-realitymix] unhandled error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return context.json({ error: 'internal_error' }, 500);
  });

  return { app, client };
}
