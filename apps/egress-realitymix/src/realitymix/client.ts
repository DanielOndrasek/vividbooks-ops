import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import xmlrpc from 'xmlrpc';

type XmlRpcClient = ReturnType<typeof xmlrpc.createClient>;

import type { AppConfig } from '../config.js';
import type {
  RmixEnvelope,
  RmixGetHashOutput,
  RmixInquiry,
  RmixListingStat,
  RmixLoginOutput,
} from './types.js';

interface RealitymixCredentials {
  rkId: string;
  rkPassword: string;
  swKey: string;
}

interface MethodCallOptions {
  /** Pokud true, na status indikující neplatnou session se neopakuje login (zabraňuje rekurzi). */
  skipReloginOnAuthError?: boolean;
}

/**
 * RealityMIX vrací při neplatné/expirované session non-zero status.
 * Konkrétní kódy nejsou v dokumentaci taxativně vyjmenovány, ale obvyklé jsou:
 *  - status 11 – session expirovala / neplatná
 *  - status 12 – uživatel nepřihlášen
 * Mimo to detekujeme i klíčová slova ve statusMessage.
 */
const SESSION_INVALID_STATUSES = new Set([10, 11, 12, 13]);

function isSessionInvalidEnvelope(envelope: RmixEnvelope<unknown>): boolean {
  if (envelope.status === 0) return false;
  if (SESSION_INVALID_STATUSES.has(envelope.status)) return true;
  const message = envelope.statusMessage?.toLowerCase() ?? '';
  return /session|login|p\u0159ihl/.test(message);
}

export class RealitymixApiError extends Error {
  readonly status: number;
  readonly statusMessage: string;
  readonly method: string;

  constructor(method: string, envelope: RmixEnvelope<unknown>) {
    super(`RealityMIX ${method} selhalo: status=${envelope.status} (${envelope.statusMessage})`);
    this.name = 'RealitymixApiError';
    this.method = method;
    this.status = envelope.status;
    this.statusMessage = envelope.statusMessage;
  }
}

export class RealitymixClient {
  private readonly rpcClient: XmlRpcClient;
  private readonly credentials: RealitymixCredentials;
  private readonly timeoutMs: number;
  private sessionId: string | null = null;
  private loginPromise: Promise<void> | null = null;

  constructor(config: AppConfig) {
    if (!config.REALITYMIX_RK_ID || !config.REALITYMIX_RK_PASSWORD || !config.REALITYMIX_SW_KEY) {
      throw new Error(
        'RealitymixClient vyžaduje REALITYMIX_RK_ID, REALITYMIX_RK_PASSWORD a REALITYMIX_SW_KEY.',
      );
    }
    this.credentials = {
      rkId: config.REALITYMIX_RK_ID,
      rkPassword: config.REALITYMIX_RK_PASSWORD,
      swKey: config.REALITYMIX_SW_KEY,
    };
    this.timeoutMs = config.REALITYMIX_RPC_TIMEOUT_MS;
    this.rpcClient = createXmlRpcClient(config.REALITYMIX_RPC_URL);
  }

  /** Statistiky inzerátů (hromadná metoda listStats vrací pole). */
  async listStats(params: { advertIds?: string[]; dateFrom?: string; dateTo?: string } = {}) {
    const args = buildListStatsArgs(params);
    return this.callAuthenticated<RmixListingStat[]>('listStats', args);
  }

  /** Poptávky/reakce (listInquiry – základní výpis). */
  async listInquiries(params: { since?: string; advertId?: string } = {}) {
    const args = buildListInquiriesArgs(params);
    return this.callAuthenticated<RmixInquiry[]>('listInquiry', args);
  }

  /** Detailní výpis poptávek včetně textu zprávy. */
  async listFullInquiries(params: { since?: string; advertId?: string } = {}) {
    const args = buildListInquiriesArgs(params);
    return this.callAuthenticated<RmixInquiry[]>('listFullInquiry', args);
  }

  /** Detail jedné poptávky. */
  async getInquiry(inquiryId: string) {
    return this.callAuthenticated<RmixInquiry>('getInquiry', [inquiryId]);
  }

  /** Pro testy / health-check; provede pouze login flow. */
  async ensureLoggedIn(): Promise<void> {
    if (!this.sessionId) {
      await this.login();
    }
  }

  private async callAuthenticated<T>(
    method: string,
    args: unknown[],
    options: MethodCallOptions = {},
  ): Promise<T> {
    await this.ensureLoggedIn();
    const sessionId = this.sessionId;
    if (!sessionId) {
      throw new Error('Interní chyba: chybí sessionId po loginu.');
    }
    const envelope = await this.methodCall<T>(method, [sessionId, ...args]);
    if (envelope.status === 0) {
      return envelope.output;
    }
    if (!options.skipReloginOnAuthError && isSessionInvalidEnvelope(envelope)) {
      this.sessionId = null;
      await this.login();
      const retrySessionId = this.sessionId;
      if (!retrySessionId) {
        throw new Error('Interní chyba: relogin neobnovil session.');
      }
      const retryEnvelope = await this.methodCall<T>(method, [retrySessionId, ...args]);
      if (retryEnvelope.status === 0) {
        return retryEnvelope.output;
      }
      throw new RealitymixApiError(method, retryEnvelope);
    }
    throw new RealitymixApiError(method, envelope);
  }

  private async login(): Promise<void> {
    if (this.loginPromise) {
      await this.loginPromise;
      return;
    }
    this.loginPromise = (async () => {
      const hashEnvelope = await this.methodCall<RmixGetHashOutput | [string, string]>('getHash', [
        this.credentials.rkId,
      ]);
      if (hashEnvelope.status !== 0) {
        throw new RealitymixApiError('getHash', hashEnvelope);
      }
      const { sessionId, nonce } = normalizeGetHashOutput(hashEnvelope.output);
      const passwordHash = computePasswordHash(this.credentials.rkPassword, nonce);
      const loginEnvelope = await this.methodCall<RmixLoginOutput>('login', [
        sessionId,
        passwordHash,
        this.credentials.swKey,
      ]);
      if (loginEnvelope.status !== 0) {
        throw new RealitymixApiError('login', loginEnvelope);
      }
      this.sessionId = sessionId;
    })().finally(() => {
      this.loginPromise = null;
    });
    await this.loginPromise;
  }

  private methodCall<T>(method: string, params: unknown[]): Promise<RmixEnvelope<T>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`RealityMIX RPC ${method} timeout po ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      const callback = (error: unknown, value: unknown): void => {
        clearTimeout(timer);
        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        if (!value || typeof value !== 'object') {
          reject(new Error(`RealityMIX ${method} vrátilo neočekávanou odpověď`));
          return;
        }
        const envelope = value as RmixEnvelope<T>;
        if (typeof envelope.status !== 'number') {
          reject(new Error(`RealityMIX ${method} vrátilo odpověď bez 'status'`));
          return;
        }
        resolve(envelope);
      };
      // xmlrpc typings deklarují callback s parametry `(error: Object, value: any)` (legacy
      // typy z DefinitelyTyped) – přemostíme přes `as` na náš striktnější tvar.
      this.rpcClient.methodCall(method, params, callback as (error: object, value: unknown) => void);
    });
  }
}

function createXmlRpcClient(rpcUrl: string): XmlRpcClient {
  const parsed = new URL(rpcUrl);
  const isSecure = parsed.protocol === 'https:';
  const port = parsed.port
    ? Number.parseInt(parsed.port, 10)
    : isSecure
      ? 443
      : 80;
  const options = {
    host: parsed.hostname,
    port,
    path: `${parsed.pathname}${parsed.search}`,
    headers: { 'User-Agent': 'vividbooks-egress-realitymix/0.1' },
  };
  return isSecure ? xmlrpc.createSecureClient(options) : xmlrpc.createClient(options);
}

function computePasswordHash(password: string, nonce: string): string {
  const inner = createHash('md5').update(password, 'utf8').digest('hex');
  return createHash('md5').update(`${inner}${nonce}`, 'utf8').digest('hex');
}

function normalizeGetHashOutput(
  output: RmixGetHashOutput | [string, string] | unknown,
): RmixGetHashOutput {
  if (Array.isArray(output) && output.length >= 2) {
    const [sessionId, nonce] = output;
    if (typeof sessionId === 'string' && typeof nonce === 'string') {
      return { sessionId, nonce };
    }
  }
  if (output && typeof output === 'object') {
    const obj = output as RmixGetHashOutput;
    if (typeof obj.sessionId === 'string' && typeof obj.nonce === 'string') {
      return obj;
    }
  }
  throw new Error('Neplatný tvar odpovědi getHash z RealityMIX.');
}

function buildListStatsArgs(params: {
  advertIds?: string[];
  dateFrom?: string;
  dateTo?: string;
}): unknown[] {
  const filter: Record<string, unknown> = {};
  if (params.advertIds && params.advertIds.length > 0) {
    filter.advert_ids = params.advertIds;
  }
  if (params.dateFrom) filter.date_from = params.dateFrom;
  if (params.dateTo) filter.date_to = params.dateTo;
  return Object.keys(filter).length > 0 ? [filter] : [];
}

function buildListInquiriesArgs(params: { since?: string; advertId?: string }): unknown[] {
  const filter: Record<string, unknown> = {};
  if (params.since) filter.since = params.since;
  if (params.advertId) filter.advert_id = params.advertId;
  return Object.keys(filter).length > 0 ? [filter] : [];
}
