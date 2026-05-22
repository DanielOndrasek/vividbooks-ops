// Sdílený klient pro volání egress-realitymix workera ze Supabase Edge Function.
// Drží retry s exponenciálním backoffem a deduplikací logů.
//
// Worker je deployován na Fly.io (apps/egress-realitymix), tato vrstva pouze
// posílá autentizovaný JSON request s `x-internal-token` a parsuje odpověď.

export interface EgressClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
}

export interface RealitymixStatRow {
  advert_id: string | number;
  date?: string;
  list_views?: number;
  detail_views?: number;
  contact_views?: number;
  inquiries?: number;
  [key: string]: unknown;
}

export interface RealitymixInquiryRow {
  inquiry_id: string | number;
  advert_id?: string | number;
  created_at?: string;
  email?: string;
  phone?: string;
  name?: string;
  message?: string;
  [key: string]: unknown;
}

export class EgressError extends Error {
  readonly status: number;
  readonly detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'EgressError';
    this.status = status;
    this.detail = detail;
  }
}

export class EgressClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;

  constructor(options: EgressClientOptions) {
    if (!options.baseUrl) throw new Error('EgressClient: baseUrl je povinné.');
    if (!options.token) throw new Error('EgressClient: token je povinné.');
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 500;
  }

  listStats(params: { advertIds?: string[]; dateFrom?: string; dateTo?: string } = {}) {
    return this.post<{ data: RealitymixStatRow[] }>('/realitymix/stats', params);
  }

  listInquiries(params: { since?: string; advertId?: string; detail?: boolean } = {}) {
    return this.post<{ data: RealitymixInquiryRow[] }>('/realitymix/inquiries', params);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-token': this.token,
          },
          body: JSON.stringify(body ?? {}),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          return (await response.json()) as T;
        }

        let detail: unknown = null;
        try {
          detail = await response.json();
        } catch {
          detail = await response.text();
        }

        if (response.status >= 500 || response.status === 408 || response.status === 429) {
          lastError = new EgressError(response.status, `egress ${response.status}`, detail);
        } else {
          throw new EgressError(response.status, `egress ${response.status}`, detail);
        }
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof EgressError) {
          if (error.status < 500 && error.status !== 408 && error.status !== 429) {
            throw error;
          }
          lastError = error;
        } else {
          lastError = error;
        }
      }
      if (attempt < this.maxAttempts) {
        const delay = this.baseDelayMs * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('egress: vyčerpány pokusy bez konkrétní chyby');
  }
}
