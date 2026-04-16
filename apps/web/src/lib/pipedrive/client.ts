import type { DealDict } from "@/lib/commission/logic";

export class PipedriveClient {
  private readonly base: string;
  private readonly apiToken: string;
  private lastRequestTs = 0;

  constructor(domain: string, apiToken: string) {
    let d = domain.trim().replace(/\/+$/, "");
    if (d.endsWith(".pipedrive.com")) {
      d = d.replace(/\.pipedrive\.com$/i, "");
    }
    this.base = `https://${d}.pipedrive.com/api/v1`;
    this.apiToken = apiToken;
  }

  private async throttle(): Promise<void> {
    const now = performance.now() / 1000;
    const wait = 0.05 - (now - this.lastRequestTs);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }

  private async get(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<unknown> {
    await this.throttle();
    const q = new URLSearchParams({ api_token: this.apiToken });
    for (const [k, v] of Object.entries(params)) {
      q.set(k, String(v));
    }
    const p = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.base}${p}?${q.toString()}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    this.lastRequestTs = performance.now() / 1000;
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`Pipedrive HTTP ${resp.status}: ${t.slice(0, 400)}`);
    }
    const body = (await resp.json()) as {
      success?: boolean;
      data?: unknown;
      error?: unknown;
      error_info?: unknown;
    };
    if (body.success === false) {
      const err = body.error ?? body.error_info ?? JSON.stringify(body);
      throw new Error(`Pipedrive API error: ${String(err)}`);
    }
    return body;
  }

  async *iterPaginated(
    path: string,
    extra: Record<string, string> = {},
  ): AsyncGenerator<DealDict> {
    let start = 0;
    const limit = 500;
    while (true) {
      const body = (await this.get(path, {
        start,
        limit,
        ...extra,
      })) as {
        data?: DealDict[];
        additional_data?: { pagination?: { more_items_in_collection?: boolean; next_start?: number } };
      };
      const items = body.data;
      if (!items?.length) {
        break;
      }
      for (const item of items) {
        yield item as DealDict;
      }
      const pag = body.additional_data?.pagination;
      if (!pag?.more_items_in_collection) {
        break;
      }
      const ns = pag.next_start;
      start =
        typeof ns === "number" && Number.isFinite(ns)
          ? ns
          : start + items.length;
    }
  }

  async getAllWonDeals(): Promise<DealDict[]> {
    const out: DealDict[] = [];
    for await (const d of this.iterPaginated("/deals", { status: "won" })) {
      out.push(d);
    }
    return out;
  }

  async getDeal(dealId: number): Promise<DealDict | null> {
    const body = (await this.get(`/deals/${dealId}`)) as { data?: DealDict };
    return body.data ?? null;
  }

  async getDealFields(): Promise<DealDict[]> {
    const body = (await this.get("/dealFields")) as { data?: DealDict[] };
    return body.data ?? [];
  }

  async getPersonFields(): Promise<DealDict[]> {
    const body = (await this.get("/personFields")) as { data?: DealDict[] };
    return body.data ?? [];
  }

  async getOrganizationFields(): Promise<DealDict[]> {
    const body = (await this.get("/organizationFields")) as { data?: DealDict[] };
    return body.data ?? [];
  }

  async getProductFields(): Promise<DealDict[]> {
    const body = (await this.get("/productFields")) as { data?: DealDict[] };
    return body.data ?? [];
  }

  async getAllProducts(): Promise<DealDict[]> {
    const out: DealDict[] = [];
    for await (const p of this.iterPaginated("/products")) {
      out.push(p);
    }
    return out;
  }

  async getAllStages(): Promise<DealDict[]> {
    const out: DealDict[] = [];
    for await (const s of this.iterPaginated("/stages")) {
      out.push(s);
    }
    return out;
  }

  async getPipelines(): Promise<DealDict[]> {
    const body = (await this.get("/pipelines")) as { data?: DealDict[] };
    return body.data ?? [];
  }

  async getUsers(): Promise<DealDict[]> {
    const out: DealDict[] = [];
    for await (const u of this.iterPaginated("/users")) {
      out.push(u);
    }
    return out;
  }
}
