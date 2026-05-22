// Deno testy pro EgressClient. Spustit:
//   deno test --allow-net=127.0.0.1,localhost supabase/functions/_shared/egress.test.ts

import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { EgressClient, EgressError } from './egress.ts';

interface MockHandlerCall {
  url: string;
  init?: RequestInit;
}

function withMockFetch(
  responses: Array<(call: MockHandlerCall) => Response | Promise<Response>>,
  run: (calls: MockHandlerCall[]) => Promise<void>,
): Promise<void> {
  const calls: MockHandlerCall[] = [];
  const originalFetch = globalThis.fetch;
  let index = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    const handler = responses[index];
    index += 1;
    if (!handler) throw new Error(`Unexpected fetch call #${index} to ${url}`);
    return await handler({ url, init });
  }) as typeof fetch;
  return run(calls).finally(() => {
    globalThis.fetch = originalFetch;
  });
}

Deno.test('vrátí data po prvním úspěšném pokusu', async () => {
  await withMockFetch(
    [
      () =>
        new Response(JSON.stringify({ data: [{ inquiry_id: 'x' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ],
    async (calls) => {
      const client = new EgressClient({
        baseUrl: 'http://localhost:8080',
        token: 'tok',
        baseDelayMs: 1,
      });
      const result = await client.listInquiries({});
      assertEquals(result.data.length, 1);
      assertEquals(calls.length, 1);
      assertEquals(calls[0].init?.headers && (calls[0].init.headers as Record<string, string>)['x-internal-token'], 'tok');
    },
  );
});

Deno.test('zopakuje request na 5xx a vrátí data', async () => {
  await withMockFetch(
    [
      () => new Response('boom', { status: 503 }),
      () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ],
    async (calls) => {
      const client = new EgressClient({
        baseUrl: 'http://localhost:8080',
        token: 'tok',
        baseDelayMs: 1,
        maxAttempts: 3,
      });
      const result = await client.listStats({});
      assertEquals(result.data.length, 0);
      assertEquals(calls.length, 2);
    },
  );
});

Deno.test('neopakuje při 4xx (kromě 408/429)', async () => {
  await withMockFetch(
    [() => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })],
    async (calls) => {
      const client = new EgressClient({
        baseUrl: 'http://localhost:8080',
        token: 'tok',
        baseDelayMs: 1,
      });
      await assertRejects(() => client.listStats({}), EgressError, 'egress 401');
      assertEquals(calls.length, 1);
    },
  );
});

Deno.test('vyčerpá pokusy a vyhodí EgressError', async () => {
  await withMockFetch(
    [
      () => new Response('a', { status: 500 }),
      () => new Response('b', { status: 502 }),
      () => new Response('c', { status: 504 }),
    ],
    async (calls) => {
      const client = new EgressClient({
        baseUrl: 'http://localhost:8080',
        token: 'tok',
        baseDelayMs: 1,
        maxAttempts: 3,
      });
      await assertRejects(() => client.listStats({}), EgressError);
      assertEquals(calls.length, 3);
    },
  );
});
