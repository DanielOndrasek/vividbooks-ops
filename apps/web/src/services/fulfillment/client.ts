import type { FulfillmentEnvStatus } from "@/lib/integrations/fulfillment-env";

export class FulfillmentApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FulfillmentApiError";
  }
}

type FulfillmentListResponse<T> = {
  code?: number;
  message?: string;
  totalCount?: number;
  data?: T[];
};

/** Varianta produktu z `GET /fulfillment/products` (kvůli názvům a cenám). */
export type FulfillmentProductVariant = {
  id: number;
  name?: string | null;
  code?: string | null;
  ext_code?: string | null;
  ean?: string | null;
  price_purchase?: number | null;
  price_wholesale?: number | null;
  price_retail?: number | null;
};

export type FulfillmentProduct = {
  id: number;
  category_id?: number | null;
  name?: string | null;
  variants?: FulfillmentProductVariant[];
};

/** Skladová varianta z `GET /fulfillment/warehouse-variants` (aktuální stav zásob). */
export type FulfillmentWarehouseVariant = {
  variant_id: number;
  code?: string | null;
  ext_code?: string | null;
  quantity?: number | null;
  available_quantity?: number | null;
  damaged_quantity?: number | null;
  reserved_quantity?: number | null;
  requested_quantity?: number | null;
  price_per_unit?: number | null;
};

async function getPage<T>(
  cfg: FulfillmentEnvStatus,
  path: string,
  params: Record<string, string | number>,
): Promise<{ data: T[]; totalCount: number }> {
  const url = new URL(`${cfg.baseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: cfg.token, Accept: "application/json" },
      cache: "no-store",
    });
  } catch (e) {
    throw new FulfillmentApiError(
      `Spojení s Fulfillment.cz selhalo: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const text = await res.text();
  if (!res.ok) {
    throw new FulfillmentApiError(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new FulfillmentApiError("Neplatná JSON odpověď z Fulfillment.cz.");
  }

  const body = json as FulfillmentListResponse<T>;
  if (body.code != null && body.code !== 200) {
    throw new FulfillmentApiError(
      `Fulfillment.cz vrátilo chybu ${body.code}: ${body.message || "neznámá chyba"}`,
    );
  }

  const data = body.data ?? [];
  return { data, totalCount: body.totalCount ?? data.length };
}

/** Stáhne všechny stránky daného endpointu (limit/offset). */
export async function fetchAllPages<T>(
  cfg: FulfillmentEnvStatus,
  path: string,
  pageSize: number,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  // Bezpečnostní strop, ať se cyklus nezacyklí při neočekávané odpovědi.
  const MAX_PAGES = 2000;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data } = await getPage<T>(cfg, path, { limit: pageSize, offset });
    all.push(...data);
    if (data.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return all;
}

export async function fetchAllProducts(
  cfg: FulfillmentEnvStatus,
): Promise<FulfillmentProduct[]> {
  // limit u /products je max 100
  return fetchAllPages<FulfillmentProduct>(cfg, "/fulfillment/products", 100);
}

export async function fetchAllWarehouseVariants(
  cfg: FulfillmentEnvStatus,
): Promise<FulfillmentWarehouseVariant[]> {
  // limit u /warehouse-variants je max 1000
  return fetchAllPages<FulfillmentWarehouseVariant>(
    cfg,
    "/fulfillment/warehouse-variants",
    1000,
  );
}
