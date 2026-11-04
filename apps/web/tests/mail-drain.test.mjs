// Spuštění: npm test (Node ≥ 22.18 / 23.6 — import .ts bez buildu)
import assert from "node:assert/strict";
import { test } from "node:test";

import { drainMessages } from "../src/lib/mail-drain.ts";

/** Falešná schránka: zpracovaná zpráva zmizí ze seznamu (jako po štítku Zpracováno). */
function fakeInbox(ids, pageSize, { sticky = [] } = {}) {
  const pending = [...ids];
  return {
    listIds: async () => pending.slice(0, pageSize),
    handle: async (id) => {
      if (sticky.includes(id)) return; // štítek se nepřidal → zůstane v seznamu
      pending.splice(pending.indexOf(id), 1);
    },
    pending,
  };
}

test("projde všechny stránky, ne jen první", async () => {
  const ids = Array.from({ length: 60 }, (_, i) => `m${i}`);
  const box = fakeInbox(ids, 25);
  const r = await drainMessages({ ...box, deadline: Infinity });
  assert.equal(r.handled.length, 60);
  assert.equal(r.stoppedEarly, false);
  assert.deepEqual(r.stuck, []);
  assert.equal(box.pending.length, 0);
});

test("prázdná schránka = nic, jeden dotaz", async () => {
  const r = await drainMessages({ ...fakeInbox([], 25), deadline: Infinity });
  assert.deepEqual(r, { handled: [], stoppedEarly: false, stuck: [], passes: 1 });
});

test("zpráva bez štítku se nezpracuje dvakrát a smyčka skončí", async () => {
  const box = fakeInbox(["a", "b", "c"], 25, { sticky: ["b"] });
  let calls = 0;
  const handle = async (id) => {
    calls += 1;
    await box.handle(id);
  };
  const r = await drainMessages({ listIds: box.listIds, handle, deadline: Infinity });
  assert.equal(calls, 3);
  assert.deepEqual(r.stuck, ["b"]);
  assert.equal(r.stoppedEarly, false);
});

test("po termínu nezačne další zprávu a hlásí stoppedEarly", async () => {
  let t = 0;
  const box = fakeInbox(["a", "b", "c", "d"], 25);
  const handle = async (id) => {
    t += 10; // každá zpráva 10 ms
    await box.handle(id);
  };
  const r = await drainMessages({ listIds: box.listIds, handle, deadline: 25, now: () => t });
  // a (0→10), b (10→20, nejpomalejší 10 → 20+10 ≥ 25 stop)
  assert.deepEqual(r.handled, ["a", "b"]);
  assert.equal(r.stoppedEarly, true);
});

test("chyba při zpracování se propaguje", async () => {
  const box = fakeInbox(["a"], 25);
  await assert.rejects(
    drainMessages({
      listIds: box.listIds,
      handle: async () => {
        throw new Error("Gmail 500");
      },
      deadline: Infinity,
    }),
    /Gmail 500/,
  );
});
