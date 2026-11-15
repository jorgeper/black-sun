// Run: node --test mods/spaces-tree/tests/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { half, landing } from "../reorder.js";

const order = ["a", "b", "c", "d"];
const moved = (from, target, after) => {
  const to = landing(order, from, target, after);
  if (to === null) return null;
  const rest = order.filter((id) => id !== from);
  rest.splice(to, 0, from);
  return rest.join("");
};

test("the lower half of a box drops after it, the upper half before", () => {
  assert.equal(half(10, 100), false);
  assert.equal(half(60, 100), true);
});

test("dragging down lands before or after the space under the pointer", () => {
  assert.equal(moved("a", "c", false), "bacd");
  assert.equal(moved("a", "c", true), "bcad");
  assert.equal(moved("a", "d", true), "bcda");
});

test("dragging up lands before or after the space under the pointer", () => {
  assert.equal(moved("d", "b", false), "adbc");
  assert.equal(moved("d", "b", true), "abdc");
  assert.equal(moved("d", "a", false), "dabc");
});

test("a drop that leaves it where it is, is no drop", () => {
  assert.equal(landing(order, "b", "a", true), null);
  assert.equal(landing(order, "b", "c", false), null);
  assert.equal(landing(order, "b", "b", true), null);
});

test("a space that isn't in the list can't be moved or dropped on", () => {
  assert.equal(landing(order, "x", "a", true), null);
  assert.equal(landing(order, "a", "x", true), null);
});
