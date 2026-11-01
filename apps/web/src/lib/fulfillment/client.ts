/** Typ jedné varianty ze skladu (GET /fulfillment/warehouse-variants). */
export type WarehouseVariant = {
  variant_id?: number;
  code?: string | null;
  ext_code?: string | null;
  quantity?: number;
  available_quantity?: number;
  damaged_quantity?: number;
  reserved_quantity?: number;
  requested_quantity?: number;
};

type WarehouseVariantsResponse = {
  code?: number;
  message?: string;
  totalCount?: number;
  data?: WarehouseVariant[];
};

/**
 * Klient pro API Fulfillment.cz (V2). Autorizace přes hlavičku `Authorization` (token přímo).
 * Dokumentace: https://client.api.fulfillment.cz/
 */
export class FulfillmentClient {
  private readonly base: string;
  private readonly apiToken: string;

  constructor(apiToken: string, apiBase: string) {
    this.apiToken = apiToken;
    this.base = apiBase.trim().replace(/\/+$/, "");
  }

  private async get(path: string): Promise<unknown> {
    const p = path.startsWith("/") ? path : `/${path}`;
    const resp = await fetch(`${this.base}${p}`, {
      headers: {
        Authorization: this.apiToken,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      const err = new Error(
        `Fulfillment HTTP ${resp.status}${t ? `: ${t.slice(0, 400)}` : ""}`,
      ) as Error & { status?: number };
      err.status = resp.status;
      throw err;
    }
    return resp.json();
  }

  /** Načte všechny varianty na skladě (stránkovaně, limit 1000). */
  async getAllWarehouseVariants(): Promise<WarehouseVariant[]> {
    const all: WarehouseVariant[] = [];
    const limit = 1000;
    let offset = 0;
    let totalCount = Infinity;

    while (offset < totalCount) {
      const body = (await this.get(
        `/warehouse-variants?limit=${limit}&offset=${offset}`,
      )) as WarehouseVariantsResponse;
      const data = Array.isArray(body.data) ? body.data : [];
      all.push(...data);
      totalCount = Number.isFinite(body.totalCount)
        ? Number(body.totalCount)
        : all.length;
      if (data.length === 0) {
        break;
      }
      offset += data.length;
    }

    return all;
  }
}
