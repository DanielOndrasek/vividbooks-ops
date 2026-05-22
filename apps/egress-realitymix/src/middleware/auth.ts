import type { MiddlewareHandler } from 'hono';

import { isIpInAnyCidr } from '../utils/cidr.js';

interface AuthOptions {
  expectedToken: string;
  allowedCidrs: string[];
}

/**
 * Vyžaduje hlavičku `x-internal-token` se shodným tajemstvím. Volitelně
 * navíc omezuje vzdálené adresy podle CIDR allowlistu (Supabase egress ranges
 * apod.). `x-forwarded-for` se použije, pokud worker běží za Fly proxy.
 */
export function requireInternalAuth({ expectedToken, allowedCidrs }: AuthOptions): MiddlewareHandler {
  if (!expectedToken) {
    throw new Error('requireInternalAuth: expectedToken nesmí být prázdný.');
  }
  return async (context, next) => {
    const provided = context.req.header('x-internal-token');
    if (!provided || !timingSafeEqual(provided, expectedToken)) {
      return context.json({ error: 'unauthorized' }, 401);
    }
    if (allowedCidrs.length > 0) {
      const callerIp = extractCallerIp(context.req.raw, context.req.header('x-forwarded-for'));
      if (!callerIp || !isIpInAnyCidr(callerIp, allowedCidrs)) {
        return context.json({ error: 'forbidden_caller_ip' }, 403);
      }
    }
    await next();
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

function extractCallerIp(request: Request, forwardedFor: string | undefined): string | null {
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const remoteAddr = (request as Request & { remoteAddr?: { hostname?: string } }).remoteAddr;
  if (remoteAddr?.hostname) return remoteAddr.hostname;
  return null;
}
