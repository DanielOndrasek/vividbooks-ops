import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeInventoryValue,
  computeProductionCost,
  parseSku,
  productionUnitCostOf,
  valueByCurrency,
} from "../src/lib/inventory/value.ts";
import { pragueMonth, isMonthKey } from "../src/lib/inventory/month.ts";
import { canSyncInventory, canWriteInventory } from "../src/lib/inventory/permissions.ts";

test("hodnota skladu: součet quantity × unitPrice aktivních položek po měnách", () => {
  const items = [
    { active: true, quantity: 10, unitPrice: 12.5, currency: "CZK" },
    { active: true, quantity: 3, unitPrice: 100, currency: "CZK" },
    { active: true, quantity: 2, unitPrice: 5, currency: "EUR" },
    { active: false, quantity: 99, unitPrice: 99, currency: "CZK" },
    { active: true, quantity: 7, unitPrice: null, currency: "CZK" },
    { active: true, quantity: 0, unitPrice: 50, currency: "CZK" },
  ];
  assert.deepEqual(valueByCurrency(items), { CZK: 425, EUR: 10 });
  const czk = computeInventoryValue(items).find((r) => r.currency === "CZK");
  assert.equal(czk.itemsCount, 2);
  assert.equal(czk.quantityTotal, 13);
});

test("hodnota skladu: prázdný vstup a zaokrouhlení", () => {
  assert.deepEqual(computeInventoryValue([]), []);
  const r = computeInventoryValue([{ active: true, quantity: 3, unitPrice: 0.1, currency: "CZK" }]);
  assert.equal(r[0].value, 0.3);
});

test("měsíc se určuje v Europe/Prague", () => {
  assert.equal(pragueMonth(new Date("2026-11-30T23:30:00Z")), "2026-12"); // 00:30 CET
  assert.equal(pragueMonth(new Date("2026-11-30T22:30:00Z")), "2026-11");
  assert.equal(pragueMonth(new Date("2026-06-30T22:30:00Z")), "2026-07"); // CEST
  assert.ok(isMonthKey("2026-10"));
  assert.ok(!isMonthKey("2026-13"));
});

test("role: aktualizovat smí každá známá role, zapisovat jen ADMIN/APPROVER", () => {
  for (const r of ["ADMIN", "APPROVER", "VIEWER"]) assert.ok(canSyncInventory(r), r);
  assert.ok(!canSyncInventory(undefined));
  assert.ok(!canSyncInventory("HOST"));
  assert.ok(canWriteInventory("ADMIN") && canWriteInventory("APPROVER"));
  assert.ok(!canWriteInventory("VIEWER") && !canWriteInventory(undefined));
});

test("SKU: základ, balení -C<N>, [FF …] a kód PMV9100 → PMV910", () => {
  assert.deepEqual(parseSku("PM7100"), { baseSku: "PM7100", packSize: 1 });
  assert.deepEqual(parseSku("PM7100-C10"), { baseSku: "PM7100", packSize: 10 });
  assert.deepEqual(parseSku("UF6000-C5"), { baseSku: "UF6000", packSize: 5 });
  assert.deepEqual(parseSku("PMV9100-C10"), { baseSku: "PMV910", packSize: 10 });
  assert.deepEqual(parseSku("PMV910 [FF 123]"), { baseSku: "PMV910", packSize: 1 });
  assert.deepEqual(parseSku("pmv9200-c10"), { baseSku: "PMV920", packSize: 10 });
});

// Smyšlené ceny — skutečné nákupní ceny do repozitáře nepatří.
const costs = new Map([
  ["PM7100", 10],
  ["SPF800", 4],
]);
const mk = (sku, quantity, active = true) => {
  const { baseSku, packSize } = parseSku(sku);
  return { active, quantity, packSize, productionUnitCost: costs.get(baseSku) ?? null };
};

test("výrobní náklady: kusy + kartony ×N × cena za kus (PM7100 a PM7100-C10)", () => {
  const r = computeProductionCost([mk("PM7100", 5), mk("PM7100-C10", 3)]);
  assert.equal(r.value, 350); // (5 + 30) × 10
  assert.equal(r.pricedQuantity, 35);
  assert.equal(r.unpricedQuantity, 0);
});

test("výrobní náklady: slovenský sešit oceněný stejně jako základ, SKU bez ceny jde do neoceněných kusů", () => {
  const r = computeProductionCost([mk("SPF800-C10", 2), mk("UF8000", 10), mk("UF8000-C5", 2)]);
  assert.equal(r.value, 80); // 20 ks × 4
  assert.equal(r.unpricedQuantity, 20); // 10 + 2×5
  assert.equal(r.pricedQuantity, 20);
});

test("výrobní náklady: neaktivní a nulové položky se nepočítají; cena se hledá přes základní SKU", () => {
  const r = computeProductionCost([mk("PM7100", 4, false), mk("PM7100", 0), mk("UF8000", 0)]);
  assert.deepEqual(r, { value: 0, pricedQuantity: 0, unpricedQuantity: 0 });
  assert.equal(productionUnitCostOf("PM7100-C10", costs), 10);
  assert.equal(productionUnitCostOf("UF8000", costs), null);
});
