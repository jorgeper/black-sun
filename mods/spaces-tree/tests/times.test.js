// Run: node --test mods/spaces-tree/tests/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { duration, track } from "../times.js";

test("duration reads like the Agents list: <1m, minutes, hours, days", () => {
  assert.equal(duration(30000), "<1m");
  assert.equal(duration(5 * 60000), "5m");
  assert.equal(duration(3 * 3600000), "3h");
  assert.equal(duration(50 * 3600000), "2d");
});

test("track notes when each agent's status last changed (done counts as idle), seeded from its tab", () => {
  const changed = { t1: { s: "working", at: 100 }, gone: { s: "idle", at: 1 } };
  const list = [
    { address: "t1", tab: "a", status: "working" },
    { address: "t2", tab: "b", status: "done" },
    { address: "t3", tab: "c", status: "idle" },
  ];
  const seed = { b: 500 };
  const { changed: out, dirty } = track(changed, list, 1000, (a) => seed[a.tab] ?? null);
  assert.equal(dirty, true);
  assert.deepEqual(out.t1, { s: "working", at: 100 });
  assert.deepEqual(out.t2, { s: "idle", at: 500 });
  assert.deepEqual(out.t3, { s: "idle", at: 1000 });
  const again = track(out, [{ address: "t2", tab: "b", status: "idle" }], 2000, () => null);
  assert.equal(again.dirty, false);
  const moved = track(out, [{ address: "t2", tab: "b", status: "working" }], 3000, () => null);
  assert.deepEqual(moved.changed.t2, { s: "working", at: 3000 });
});

test("track forgets agents gone for 30 days", () => {
  const day = 86400000;
  const { changed } = track({ old: { s: "idle", at: 0 }, recent: { s: "idle", at: 20 * day } }, [{ address: "x", tab: "t", status: "idle" }], 31 * day, () => null);
  assert.deepEqual(Object.keys(changed).sort(), ["recent", "x"]);
});
