import { getEshopEnv } from "@/lib/integrations/eshop-env";
import {
  buildEshopPriceIndex,
  extractProducts,
  type EshopPriceIndex,
} from "@/lib/inventory/eshop-prices";

const KV_TABLE = "kv_store_33b2092f";
const KV_KEY = "vividbooks_master_products_v1";

/**
 * Načte ceník e-shopu (Kč s DPH). Při chybě nebo nenastavené konfiguraci vrací null
 * a synchronizace pokračuje bez přepisu cen (nikdy nespadne kvůli ceníku).
 */
export async function fetchEshopPriceIndex(): Promise<{
  index: EshopPriceIndex | null;
  warning?: string;
}> {
  const cfg = getEshopEnv();
  if (!cfg.configured) {
    return { index: null, warning: `Ceny e-shopu vypnuty, chybí: ${cfg.missing.join(", ")}` };
  }
  try {
    const url = `${cfg.url}/rest/v1/${KV_TABLE}?key=eq.${KV_KEY}&select=value`;
    const res = await fetch(url, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return { index: null, warning: `Ceník e-shopu: HTTP ${res.status}` };
    }
    const rows = (await res.json()) as Array<{ value?: unknown }>;
    const products = extractProducts(rows?.[0]?.value);
    if (products.length === 0) {
      return { index: null, warning: "Ceník e-shopu je prázdný" };
    }
    return { index: buildEshopPriceIndex(products) };
  } catch (e) {
    return { index: null, warning: `Ceník e-shopu: ${e instanceof Error ? e.message : String(e)}` };
  }
}
