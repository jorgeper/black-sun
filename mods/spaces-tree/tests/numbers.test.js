// Run: node --test mods/spaces-tree/tests/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mode, listed, numbers, go } from "../numbers.js";

const tab = (id, index) => ({ id, index });
const spaces = [
  { id: "s1", active: true, tabs: [tab("a", 1), tab("keep", 2), tab("b", 3)] },
  { id: "far", machine: "vps", tabs: [tab("z", 1)] },
  { id: "s2", tabs: [tab("holder", 1), tab("c", 2), tab("d", 3)] },
];
const row = (t, pane = `p-${t}`) => ({ tab: t, pane, address: `t-${t}` });
const rows = new Map([["s1", [row("a"), row("b"), row("b", "p-b2")]], ["s2", [row("c"), row("d")]], ["far", [row("z")]]]);

test("mode: global unless set to local", () => {
  assert.deepEqual([mode(undefined), mode({}), mode({ numbers: "local" }), mode({ numbers: "x" })], ["global", "global", "local", "global"]);
});

test("listed: this computer's spaces first, then other machines' by name", () => {
  assert.deepEqual(listed(spaces).map((s) => s.id), ["s1", "s2", "far"]);
});

test("numbers: local is the tab's place in its space; global counts down the sidebar, only tabs with a row", () => {
  const hidden = new Set(["keep"]);
  assert.deepEqual([...numbers(spaces, rows, "local", hidden)], [["a", 1], ["b", 2], ["z", 1], ["holder", 1], ["c", 2], ["d", 3]]);
  assert.deepEqual([...numbers(spaces, rows, "global")], [["a", 1], ["b", 2], ["c", 3], ["d", 4], ["z", 5]]);
});

test("go: local is the shown space's nth tab; global focuses the numbered tab's first pane, wherever it is", () => {
  assert.deepEqual(go(2, spaces, rows, "local", undefined, new Set(["keep"])), ["tab.select", { id: "b" }]);
  assert.equal(go(3, spaces, rows, "local", undefined, new Set(["keep"])), null);
  assert.deepEqual(go(2, spaces, rows, "global"), ["pane.focus", { pane: "p-b" }]);
  assert.deepEqual(go(3, spaces, rows, "global"), ["pane.focus", { pane: "p-c" }]);
  assert.deepEqual(go(5, spaces, rows, "global", (a) => a === "t-z"), ["pane.focus", { terminal: "t-z" }]);
  assert.equal(go(6, spaces, rows, "global"), null);
  assert.equal(go(0, spaces, rows, "local"), null);
});
