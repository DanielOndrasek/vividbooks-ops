import { serve } from '@hono/node-server';

import { loadConfig } from './config.js';
import { buildApp } from './server.js';

const config = loadConfig();
const { app } = buildApp(config);

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'egress-realitymix poslouchá',
      port: info.port,
      mock: config.MOCK_MODE,
    }),
  );
});

const shutdown = (signal: NodeJS.Signals) => {
  console.log(JSON.stringify({ level: 'info', message: 'shutting down', signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
