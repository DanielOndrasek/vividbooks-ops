import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { loadConfig } from '../src/config.ts';
import { MockRealitymixClient } from '../src/realitymix/mockClient.ts';
import { buildApp } from '../src/server.ts';

const baseEnv = {
  PORT: '8080',
  MOCK_MODE: 'true',
  INTERNAL_EGRESS_TOKEN: 'test-token-with-enough-length',
} satisfies NodeJS.ProcessEnv;

function configure(env: Partial<NodeJS.ProcessEnv> = {}) {
  const config = loadConfig({ ...baseEnv, ...env });
  const { app } = buildApp(config, { client: new MockRealitymixClient() });
  return { app, token: baseEnv.INTERNAL_EGRESS_TOKEN };
}

test('healthz odpovídá bez tokenu', async () => {
  const { app } = configure();
  const response = await app.request('/healthz');
  assert.equal(response.status, 200);
  const body = (await response.json()) as { status: string; mock: boolean };
  assert.equal(body.status, 'ok');
  assert.equal(body.mock, true);
});

test('stats vrací 401 bez tokenu', async () => {
  const { app } = configure();
  const response = await app.request('/realitymix/stats', {
    method: 'POST',
    body: '{}',
  });
  assert.equal(response.status, 401);
});

test('stats vrací data pro autorizovaný request', async () => {
  const { app, token } = configure();
  const response = await app.request('/realitymix/stats', {
    method: 'POST',
    headers: { 'x-internal-token': token, 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { advert_id: string }[] };
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.length > 0);
});

test('inquiries detail=true vrací zprávu', async () => {
  const { app, token } = configure();
  const response = await app.request('/realitymix/inquiries', {
    method: 'POST',
    headers: { 'x-internal-token': token, 'content-type': 'application/json' },
    body: JSON.stringify({ detail: true }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { message?: string }[] };
  assert.ok(body.data[0]?.message);
});

test('špatný tvar body je 400', async () => {
  const { app, token } = configure();
  const response = await app.request('/realitymix/stats', {
    method: 'POST',
    headers: { 'x-internal-token': token, 'content-type': 'application/json' },
    body: JSON.stringify({ dateFrom: 'not-a-date' }),
  });
  assert.equal(response.status, 400);
});

test('CIDR allowlist odmítne caller mimo rozsah', async () => {
  const { app, token } = configure({ ALLOWED_CALLER_CIDRS: '10.0.0.0/24' });
  const response = await app.request('/realitymix/stats', {
    method: 'POST',
    headers: {
      'x-internal-token': token,
      'content-type': 'application/json',
      'x-forwarded-for': '8.8.8.8',
    },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 403);
});
