import assert from "node:assert/strict";
import { test } from "node:test";

import { computeInventoryValue, valueByCurrency } from "../src/lib/inventory/value.ts";
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
