import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { RealitymixApiError } from '../realitymix/client.js';
import type { RealitymixClientLike } from '../realitymix/mockClient.js';

const StatsRequestSchema = z
  .object({
    advertIds: z.array(z.string().min(1)).max(500).optional(),
    dateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom musí být ISO datum YYYY-MM-DD')
      .optional(),
    dateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo musí být ISO datum YYYY-MM-DD')
      .optional(),
  })
  .strict();

const InquiriesRequestSchema = z
  .object({
    since: z.string().datetime({ offset: true }).optional(),
    advertId: z.string().min(1).optional(),
    detail: z.boolean().optional(),
  })
  .strict();

const InquiryIdSchema = z.object({ inquiryId: z.string().min(1).max(64) }).strict();

export function buildRealitymixRouter(client: RealitymixClientLike): Hono {
  const router = new Hono();

  router.post('/stats', async (context) => {
    const body = await safeJson(context.req.raw);
    const parsed = StatsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
    }
    try {
      const stats = await client.listStats(parsed.data);
      return context.json({ data: stats });
    } catch (error) {
      return mapClientError(context, error);
    }
  });

  router.post('/inquiries', async (context) => {
    const body = await safeJson(context.req.raw);
    const parsed = InquiriesRequestSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
    }
    try {
      const inquiries = parsed.data.detail
        ? await client.listFullInquiries(parsed.data)
        : await client.listInquiries(parsed.data);
      return context.json({ data: inquiries });
    } catch (error) {
      return mapClientError(context, error);
    }
  });

  router.post('/inquiries/:inquiryId', async (context) => {
    const parsed = InquiryIdSchema.safeParse({ inquiryId: context.req.param('inquiryId') });
    if (!parsed.success) {
      return context.json({ error: 'invalid_inquiry_id' }, 400);
    }
    try {
      const inquiry = await client.getInquiry(parsed.data.inquiryId);
      return context.json({ data: inquiry });
    } catch (error) {
      return mapClientError(context, error);
    }
  });

  return router;
}

async function safeJson(request: Request): Promise<unknown> {
  const text = await request.clone().text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function mapClientError(context: Context, error: unknown) {
  if (error instanceof RealitymixApiError) {
    return context.json(
      {
        error: 'realitymix_error',
        method: error.method,
        status: error.status,
        statusMessage: error.statusMessage,
      },
      502,
    );
  }
  const message = error instanceof Error ? error.message : 'unknown error';
  console.error('[egress-realitymix] upstream failure', { message });
  return context.json({ error: 'upstream_failure', message }, 502);
}
