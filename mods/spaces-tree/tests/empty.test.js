// Run: node --test mods/spaces-tree/tests/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOD, step, placeholderTabs } from "../empty.js";

const tab = (id, flags = "") => ({ id, active: flags.includes("a"), settled: flags.includes("s") });
const sp = (id, active, ...tabs) => ({ id, active, tabs });

test("the shown space gets a placeholder tab, which is put away behind the tab that was shown", () => {
  let spaces = [sp("s1", true, tab("t1", "a")), sp("s2", false, tab("t2", "a"))];
  let r = step(spaces, null, undefined, 10);
  assert.deepEqual(r.actions, [["tab.new", { name: "Empty", space: "s1", mod: MOD }]]);
  assert.deepEqual(r.pending, { space: "s1", known: ["t1"], back: "t1", at: 10 });
  // Not there yet: nothing more is asked for.
  assert.deepEqual(step(spaces, r.pending, r.placeholders, 20).actions, []);
  // Herdr made it and shows it: back to the terminal, and it is settled.
  spaces = [sp("s1", true, tab("t1"), tab("k1", "a")), sp("s2", false, tab("t2", "a"))];
  r = step(spaces, r.pending, r.placeholders, 30);
  assert.deepEqual([r.actions, r.pending, r.placeholders], [[["tab.select", { id: "t1" }], ["tab.settle", { id: "k1" }]], null, { s1: { tab: "k1" } }]);
  // All in place: nothing to do, and the same object comes back. The other space waits its turn.
  spaces = [sp("s1", true, tab("t1", "a"), tab("k1", "s")), sp("s2", false, tab("t2", "a"))];
  const same = step(spaces, null, r.placeholders, 40);
  assert.deepEqual([same.actions, same.pending], [[], null]);
  assert.equal(same.placeholders, r.placeholders);
  assert.deepEqual([...placeholderTabs(r.placeholders)], ["k1"]);
  assert.deepEqual([...placeholderTabs(undefined)], []);
});

test("closing the last terminal leaves the space, showing its placeholder; adding one puts it away again", () => {
  const held = { s1: { tab: "k1" } };
  // Empty: the placeholder is what the space shows.
  assert.deepEqual(step([sp("s1", true, tab("k1", "a"))], null, held, 0).actions, []);
  // A terminal is added (Herdr shows it; the placeholder was unsettled by being shown).
  assert.deepEqual(step([sp("s1", true, tab("k1"), tab("t5", "a"))], null, held, 0).actions, [["tab.settle", { id: "k1" }]]);
  // A tab closed and Herdr went to the placeholder while others remain: on to the last real one.
  assert.deepEqual(step([sp("s1", true, tab("t1"), tab("t2"), tab("k1", "a"))], null, held, 0).actions,
    [["tab.select", { id: "t2" }], ["tab.settle", { id: "k1" }]]);
});

test("off: placeholders of spaces with something in them are closed; an empty space keeps its own; none are made", () => {
  const held = { s1: { tab: "k1" }, s2: { tab: "k2" }, gone: { tab: "k9" } };
  const r = step([sp("s1", true, tab("t1", "a"), tab("k1", "s")), sp("s2", false, tab("k2", "a")), sp("s3", false, tab("t3", "a"))], null, held, 0, false);
  assert.deepEqual([r.actions, r.placeholders, r.pending], [[["tab.close", { id: "k1", confirmed: true }]], { s2: { tab: "k2" } }, null]);
});

test("a placeholder that never comes is given up on, and asked for again", () => {
  const spaces = [sp("s1", true, tab("t1", "a"))];
  const r = step(spaces, { space: "s1", known: ["t1"], back: "t1", at: 0 }, {}, 6000);
  assert.deepEqual([r.actions.length, r.pending.at], [1, 6000]);
  assert.equal(step(spaces, { space: "closed", known: [], back: null, at: 0 }, {}, 10, false).pending, null);
});
