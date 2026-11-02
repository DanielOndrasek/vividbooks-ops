import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEshopPriceIndex,
  extractProducts,
  lookupEshopPrice,
  parsePriceTextToKc,
  resolveUnitPrice,
} from "./eshop-prices.ts";

test("parsePriceTextToKc čte české formáty", () => {
  assert.equal(parsePriceTextToKc("1 190 Kč"), 1190);
  assert.equal(parsePriceTextToKc("99,50 Kč"), 99.5);
  assert.equal(parsePriceTextToKc("zdarma"), 0);
  assert.equal(parsePriceTextToKc(""), null);
  assert.equal(parsePriceTextToKc("n/a"), null);
});

const products = [
  { basecomSku: "PF6000-C10", isbn: "978-80-7603-001-1", price: "1 190 Kč", priceAmount: 999 },
  { basecomSku: "ZK1000", priceAmount: 249 },
  { basecomSku: "new", shoptetId: "TO61A2", price: "0 Kč" },
  { basecomSku: "XX1", isbn: "9788076030022", price: "" },
];

test("index: price má přednost před priceAmount, nulové ceny a placeholder SKU se ignorují", () => {
  const idx = buildEshopPriceIndex(products);
  assert.equal(lookupEshopPrice(idx, { skus: ["PF6000-C10"] }), 1190);
  assert.equal(lookupEshopPrice(idx, { skus: ["zk1000"] }), 249);
  assert.equal(lookupEshopPrice(idx, { skus: ["TO61A2"] }), null);
  assert.equal(lookupEshopPrice(idx, { skus: ["new"] }), null);
});

test("párování: SKU má přednost, pak ISBN", () => {
  const idx = buildEshopPriceIndex(products);
  assert.equal(lookupEshopPrice(idx, { skus: ["neznámé", "ZK1000"] }), 249);
  assert.equal(
    lookupEshopPrice(idx, { skus: ["neznámé"], isbns: ["9788076030011"] }),
    1190,
  );
  assert.equal(lookupEshopPrice(idx, { skus: ["neznámé"], isbns: ["123"] }), null);
  assert.equal(lookupEshopPrice(null, { skus: ["ZK1000"] }), null);
});

test("extractProducts: value.products i přímo pole", () => {
  assert.equal(extractProducts({ products }).length, 4);
  assert.equal(extractProducts(products).length, 4);
  assert.equal(extractProducts(null).length, 0);
});

test("resolveUnitPrice: e-shop → priceRetail → price_per_unit", () => {
  assert.deepEqual(resolveUnitPrice({ eshop: 249, priceRetail: 300, pricePerUnit: 1.09 }), {
    value: 249,
    source: "eshop",
  });
  assert.deepEqual(resolveUnitPrice({ eshop: null, priceRetail: 300, pricePerUnit: 1.09 }), {
    value: 300,
    source: "priceRetail",
  });
  assert.deepEqual(resolveUnitPrice({ eshop: null, priceRetail: null, pricePerUnit: 1.09 }), {
    value: 1.09,
    source: "pricePerUnit",
  });
  assert.deepEqual(resolveUnitPrice({ eshop: null, priceRetail: null, pricePerUnit: null }), {
    value: null,
    source: null,
  });
});
