// Run: node --test mods/side-by-side/tests/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, leaves, simplify, prune, flat, has, add, remove, setOn, inRow, isRow, SWITCH, place, nodeId, card, signature, arrange, find, depth, weights, geometry, hit, zones, landing, gapAt, resize, STRIP, terminals, entries } from "../model.js";

// A tree written short: R(...) a row, C(...) a column; ids n1, n2, ... outermost first, in reading order.
const R = (...items) => ({ dir: "row", items });
const C = (...items) => ({ dir: "col", items });
const st = (make) => {
  let n = 0;
  const name = (x) => { if (!x || typeof x !== "object") return x; const id = `n${++n}`; return { id, dir: x.dir, items: x.items.map(name) }; };
  return { on: true, arrange: false, carry: null, root: name(make()) };
};
// The same, read back: ["row", "a", ["col", "b", "c"]].
const shape = (x) => (x && typeof x === "object" ? [x.dir, ...x.items.map(shape)] : x);
const of = (s) => shape(s.root);

test("normalize: nothing saved is off and empty; junk and repeats go; the tree is kept simple", () => {
  assert.deepEqual(normalize(undefined), { on: false, arrange: false, carry: null, root: null });
  const s = normalize({ on: true, arrange: "drag", carry: "t9", root: { id: "n1", dir: "row", items: ["t1", 5, "t1", { id: "n1", dir: "col", items: ["t2", { id: "n3", dir: "col", items: ["t3", "t1"] }] }, { dir: "bad", items: [] }] } });
  assert.deepEqual([s.on, s.arrange, s.carry], [true, "drag", "t9"]);
  assert.deepEqual(of(s), ["row", "t1", ["col", "t2", "t3"]]);
  assert.equal(normalize({ arrange: true }).arrange, false);
  assert.equal(normalize({ root: { id: "n1", dir: "row", items: ["only"] } }).root, "only");
});

test("normalize: the earlier shapes become a tree (rows: a column of rows; a flat list: one row)", () => {
  assert.deepEqual(of(normalize({ on: true, rows: [{ id: "r1", items: ["a", "b"] }, { id: "r2", items: ["c"] }] })), ["col", ["row", "a", "b"], "c"]);
  assert.deepEqual(of(normalize({ on: true, items: ["t1", "t2"] })), ["row", "t1", "t2"]);
});

test("simplify and prune: empty splits go, one item stands alone, same-direction splits merge", () => {
  assert.deepEqual(shape(simplify(st(() => R("a", R("b", "c"), C("d"), C())).root)), ["row", "a", "b", "c", "d"]);
  const s = st(() => R("a", C("b", R("c", "d"))));
  assert.deepEqual(shape(prune(s.root, (x) => x !== "c")), ["row", "a", ["col", "b", "d"]]);
  assert.deepEqual(shape(prune(s.root, (x) => x === "c")), "c");
  assert.equal(prune(s.root, () => false), null);
  assert.deepEqual(leaves(s.root), ["a", "b", "c", "d"]);
});

test("add, remove, has, flat, setOn", () => {
  let s = add(add(normalize(null), "t1"), "t2");
  assert.deepEqual(of(s), ["row", "t1", "t2"]);
  assert.equal(add(s, "t1"), s);
  // A grid that isn't one row: the new one is a column of its own at the right.
  s = add(st(() => C("a", "b")), "c");
  assert.deepEqual(of(s), ["row", ["col", "a", "b"], "c"]);
  assert.deepEqual(flat(s), ["a", "b", "c"]);
  assert.ok(has(s, "b") && !has(s, "z"));
  assert.deepEqual(of(remove(s, "b")), ["row", "a", "c"]);
  assert.equal(remove(remove(remove(s, "a"), "b"), "c").root, null);
  assert.deepEqual(setOn({ ...s, arrange: "edit", carry: "a" }, false), { ...s, on: false, arrange: false, carry: null });
});

test("place: beside a terminal joins its line, or splits it when the line runs the other way", () => {
  const s = st(() => R("a", "b", "c"));
  const side = (t, leaf, where) => of(place(s, t, { kind: "side", at: { leaf }, side: where }));
  assert.deepEqual(side("c", "a", "left"), ["row", "c", "a", "b"]);
  assert.deepEqual(side("a", "c", "right"), ["row", "b", "c", "a"]);
  assert.deepEqual(side("x", "b", "right"), ["row", "a", "b", "x", "c"]);
  // Above or below one terminal in a row: the two share its place, stacked.
  assert.deepEqual(side("c", "a", "bottom"), ["row", ["col", "a", "c"], "b"]);
  assert.deepEqual(side("x", "b", "top"), ["row", "a", ["col", "x", "b"], "c"]);
});

test("place: beside a whole split takes its full height or width", () => {
  // Two rows stacked. A terminal at the left of the whole thing is a column all the way down.
  const s = st(() => C(R("a", "b"), R("c", "d")));
  assert.deepEqual(of(place(s, "x", { kind: "side", at: { node: "n1" }, side: "left" })), ["row", "x", ["col", ["row", "a", "b"], ["row", "c", "d"]]]);
  // One already in the grid moves there; what it leaves behind is tidied.
  assert.deepEqual(of(place(s, "d", { kind: "side", at: { node: "n1" }, side: "left" })), ["row", "d", ["col", ["row", "a", "b"], "c"]]);
  // Under a whole row: a new row; into the column they are already in, it just joins.
  assert.deepEqual(of(place(s, "x", { kind: "side", at: { node: "n2" }, side: "bottom" })), ["col", ["row", "a", "b"], "x", ["row", "c", "d"]]);
  assert.deepEqual(of(place(s, "b", { kind: "side", at: { node: "n3" }, side: "bottom" })), ["col", "a", ["row", "c", "d"], "b"]);
});

test("place: swap, new, and targets that aren't there", () => {
  const s = st(() => R("a", C("b", "c")));
  assert.deepEqual(of(place(s, "a", { kind: "swap", at: "c" })), ["row", "c", ["col", "b", "a"]]);
  assert.deepEqual(of(place(s, "x", { kind: "swap", at: "b" })), ["row", "a", ["col", ["row", "x", "b"], "c"]]);
  assert.deepEqual(of(place(s, "x", { kind: "new" })), ["row", "a", ["col", "b", "c"], "x"]);
  assert.equal(place(normalize(null), "x", { kind: "new" }).root, "x");
  assert.equal(place(s, "a", { kind: "swap", at: "a" }), s);
  assert.equal(place(s, "a", { kind: "side", at: { leaf: "zz" }, side: "left" }), s);
  assert.equal(place(s, "a", { kind: "side", at: { node: "zz" }, side: "left" }), s);
  assert.equal(place(s, "a", { kind: "side", at: { leaf: "a" }, side: "left" }), s);
  assert.equal(place(s, "a", null), s);
  // The only terminal, beside itself: nothing to do.
  const one = { ...s, root: "a" };
  assert.equal(place(one, "a", { kind: "new" }).root, "a");
});

test("nodeId and card: a layout-safe id, a header over the terminal", () => {
  assert.equal(nodeId("vps/t7"), "sbs-vps-t7");
  const c = card("vps/t7");
  assert.deepEqual(c.children.map((x) => x.id), ["sbs-vps-t7-head", "sbs-vps-t7-term"]);
  assert.deepEqual(c.children[0].content, { mod: "side-by-side", props: { part: "head", terminal: "vps/t7" } });
  assert.deepEqual(c.children[1].content, { terminal: "vps/t7" });
});

const tree = () => ({ id: "root", type: "row", children: [
  { id: "top", type: "row", children: [{ id: "tabs", type: "block" }, { id: "sbs-tabs", type: "block", hidden: true }, { id: "sbs-switch", type: "block", size: { px: 96 } }] },
  { id: "work-body", type: "row", children: [
    { id: "main", type: "block" },
    { id: "sbs", type: "row", hidden: true, children: [{ id: "sbs-empty", type: "block" }] },
    { id: "sbs-arrange", type: "block", hidden: true },
    { id: "panel", type: "column", hidden: true },
  ] },
] });
const live = new Set(["t1", "t2", "t3", "t4"]);
const drawn = (x) => (x.children && /^sbs-split-/.test(x.id) ? [x.type, ...x.children.map(drawn)] : x.id);
const grid = (t) => { const g = find(t, "sbs"); return [g.type, ...g.children.map(drawn)]; };
const hidden = (t) => ["main", "tabs", "sbs", "sbs-tabs", "sbs-arrange"].map((id) => !!find(t, id).hidden);

test("arrange: off and already off changes nothing; a layout without the nodes is left alone", () => {
  assert.equal(arrange(tree(), { ...st(() => R("t1", "t2")), on: false }, live), null);
  assert.equal(arrange({ id: "root", children: [{ id: "main" }] }, st(() => R("t1", "t2")), live), null);
  assert.equal(signature({ id: "root" }), null);
});

test("arrange: on draws the tree as rows and columns of cards for the running terminals", () => {
  const t = tree();
  const s = st(() => R("t1", C("t2", "gone", R("t3", "t4"))));
  const next = arrange(t, s, live);
  assert.deepEqual(grid(next), ["row", "sbs-t1", ["column", "sbs-t2", ["row", "sbs-t3", "sbs-t4"]]]);
  assert.deepEqual(hidden(next), [true, true, false, false, true]);
  // The tree given isn't touched, and once shown there is nothing more to do.
  assert.equal(find(t, "main").hidden, undefined);
  assert.equal(arrange(next, s, live), null);
  // A grid that is a column at the top, and one terminal alone.
  assert.deepEqual(grid(arrange(tree(), st(() => C("t1", "t2")), live)), ["column", "sbs-t1", "sbs-t2"]);
  assert.deepEqual(grid(arrange(tree(), { ...s, root: "t1" }, live)), ["row", "sbs-t1"]);
});

test("arrange: splits and cards already there keep their dragged sizes, wherever a card moves", () => {
  const first = arrange(tree(), st(() => R("t1", C("t2", "t3"))), live);
  find(first, "sbs-t1").size = { weight: 3 };
  find(first, "sbs-split-n2").size = { weight: 2 };
  const moved = st(() => R(C("t2", "t3", "t1"), "t4"));
  moved.root.items[0].id = "n2";
  const next = arrange(first, moved, live);
  assert.deepEqual(grid(next), ["row", ["column", "sbs-t2", "sbs-t3", "sbs-t1"], "sbs-t4"]);
  assert.deepEqual([find(next, "sbs-t1").size, find(next, "sbs-split-n2").size, find(next, "sbs-t4").size], [{ weight: 3 }, { weight: 2 }, undefined]);
  assert.deepEqual(weights(next, moved), { "sbs-split-n1": 1, "sbs-split-n2": 2, "sbs-t2": 1, "sbs-t3": 1, "sbs-t1": 3, "sbs-t4": 1 });
});

test("arrange: a card kept from when cards had rounded corners is squared", () => {
  const s = st(() => R("t1", "t2"));
  const first = arrange(tree(), s, live);
  assert.equal("radius" in find(first, "sbs-t1"), false);
  find(first, "sbs-t1").radius = 10;
  find(first, "sbs-t1").size = { weight: 2 };
  const next = arrange(first, s, live);
  assert.deepEqual([find(next, "sbs-t1").radius, find(next, "sbs-t1").size], [undefined, { weight: 2 }]);
  assert.equal(arrange(next, s, live), null);
});

test("arrange: the card with the keyboard has its whole border in the highlight color; it follows the keyboard and the color", () => {
  const s = st(() => R("t1", "t2"));
  const colors = (t) => ["sbs-t1", "sbs-t2"].map((id) => find(t, id).border);
  const first = arrange(tree(), s, live, "#8b7cf6", "t1");
  assert.deepEqual(colors(first), [{ width: 2, color: "#8b7cf6" }, { width: 2, color: "border" }]);
  assert.equal(arrange(first, s, live, "#8b7cf6", "t1"), null);
  find(first, "sbs-t2").size = { weight: 2 };
  // The keyboard moves: the border moves with it, and nothing else changes.
  const moved = arrange(first, s, live, "#8b7cf6", "t2");
  assert.deepEqual([colors(moved), find(moved, "sbs-t2").size], [[{ width: 2, color: "border" }, { width: 2, color: "#8b7cf6" }], { weight: 2 }]);
  assert.deepEqual(colors(arrange(moved, s, live, "#22a99a", "t2"))[1], { width: 2, color: "#22a99a" });
  // The keyboard somewhere else (the sidebar): no card is marked.
  assert.deepEqual(colors(arrange(moved, s, live, "#22a99a", null)), [{ width: 2, color: "border" }, { width: 2, color: "border" }]);
  // A card from before (a thin border, a focus ring) is redrawn.
  find(first, "sbs-t1").border = { width: 1, color: "border" };
  find(first, "sbs-t1").focus = { border: { width: 2, color: "#8b7cf6" } };
  const fixed = arrange(first, s, live, "#8b7cf6", "t1");
  assert.deepEqual([find(fixed, "sbs-t1").border, "focus" in find(fixed, "sbs-t1")], [{ width: 2, color: "#8b7cf6" }, false]);
});

test("arrange: the shown tab's panes get borders as thick as a card's, the focused one's in the highlight color", () => {
  const t = tree();
  find(t, "main").content = { tab: "active", pane: { gap: 8, border: { width: 1, color: "border" }, focus: { width: 1, color: "accent" } } };
  const off = { ...st(() => R("t1", "t2")), on: false };
  const next = arrange(t, off, live, "#8b7cf6");
  assert.deepEqual(find(next, "main").content.pane, { gap: 8, border: { width: 2, color: "border" }, focus: { width: 2, color: "#8b7cf6" } });
  assert.equal(arrange(next, off, live, "#8b7cf6"), null);
  assert.deepEqual(find(arrange(next, off, live, "#22a99a"), "main").content.pane.focus, { width: 2, color: "#22a99a" });
});

test("arrange: arranging shows the arrange view in the grid's place; done or off puts things back", () => {
  const s = st(() => R("t1", "t2"));
  const on = arrange(tree(), s, live);
  const edit = arrange(on, { ...s, arrange: "edit" }, live);
  assert.deepEqual(hidden(edit), [true, true, true, false, false]);
  assert.deepEqual(grid(edit), ["row", "sbs-t1", "sbs-t2"]);
  assert.deepEqual(hidden(arrange(edit, s, live)), [true, true, false, false, true]);
  const off = arrange(edit, { ...s, on: false }, live);
  assert.deepEqual(hidden(off), [false, false, true, true, true]);
  assert.deepEqual(grid(off), ["row", "sbs-empty"]);
  // On with nothing running: the hint.
  assert.deepEqual(grid(arrange(tree(), st(() => R("gone", "gone2")), live)), ["row", "sbs-empty"]);
});

// In 420 × 254 with pad 10, gap 20, top 24 the grid is 400 × 220 at (10, 24).
const box = { pad: 10, gap: 20, top: 24 };
// "a" down the whole left; to its right "b" over a row of "c" and "d".
const nested = () => st(() => R("a", C("b", R("c", "d"))));
const geo = (s) => geometry(s.root, {}, 420, 254, box);

test("geometry: splits share their room among their items, by weight, to any depth", () => {
  const g = geo(nested());
  assert.deepEqual(g.tiles.map((t) => [t.terminal, t.x, t.y, t.w, t.h, t.path]), [
    ["a", 10, 24, 190, 220, ["n1"]], ["b", 220, 24, 190, 100, ["n1", "n2"]],
    ["c", 220, 144, 85, 100, ["n1", "n2", "n3"]], ["d", 325, 144, 85, 100, ["n1", "n2", "n3"]],
  ]);
  assert.deepEqual(g.splits.n2, { id: "n2", dir: "col", x: 220, y: 24, w: 190, h: 220 });
  assert.deepEqual(g.gaps.map((x) => [x.kind, x.a, x.b, x.px]), [
    ["col", "sbs-a", "sbs-split-n2", [190, 190]], ["row", "sbs-b", "sbs-split-n3", [100, 100]], ["col", "sbs-c", "sbs-d", [85, 85]],
  ]);
  const wide = geometry(st(() => R("a", "b")).root, { "sbs-a": 3 }, 420, 254, box);
  assert.deepEqual(wide.tiles.map((t) => t.w), [285, 95]);
  assert.deepEqual(geometry(null, {}, 420, 254, box).tiles, []);
});

test("hit: a tile's middle swaps, its edges put the terminal on that side", () => {
  const s = st(() => R("a", "b"));
  const g = geo(s);
  const at = (x, y, carry = "x") => hit(g, { x, y }, carry, s);
  assert.deepEqual(at(105, 134).target, { kind: "swap", at: "a" });
  assert.deepEqual(at(180, 134).target, { kind: "side", at: { leaf: "a" }, side: "right" });
  assert.deepEqual(at(240, 134).target, { kind: "side", at: { leaf: "b" }, side: "left" });
  // The strip sits in the gap, as tall as what it goes beside.
  assert.deepEqual(at(180, 134).mark, { x: 210 - STRIP / 2, y: 24, w: STRIP, h: 220 });
  // In the gap or outside the grid: the nearest tile's edge.
  assert.deepEqual(at(205, 134).target.side, "right");
  assert.deepEqual(at(2, 134).target, { kind: "side", at: { leaf: "a" }, side: "left" });
  // Nothing in the grid: anywhere is the first place.
  assert.deepEqual(hit(geometry(null, {}, 420, 254, box), { x: 5, y: 5 }, "x", normalize(null)).target, { kind: "new" });
});

test("hit: the closer to an edge, the bigger the group it goes beside", () => {
  const s = nested();
  const g = geo(s);
  const at = (x, y, carry = "x") => hit(g, { x, y }, carry, s);
  // d's right edge is also its row's, its column's and the grid's. Beside its row is the same as
  // beside d, and the grid is already a row, so two choices: d alone (inner), the column (outer).
  let h = at(390, 194);
  assert.deepEqual([h.target, h.level, h.levels], [{ kind: "side", at: { leaf: "d" }, side: "right" }, 0, 2]);
  assert.equal(h.mark.h, 100);
  h = at(405, 194);
  assert.deepEqual([h.target, h.level, h.levels], [{ kind: "side", at: { node: "n2" }, side: "right" }, 1, 2]);
  assert.deepEqual([h.mark.y, h.mark.h], [24, 220]);
  // c's bottom edge: under c alone, under its row (as wide as b), or under the whole grid.
  assert.deepEqual(at(260, 215).target, { kind: "side", at: { leaf: "c" }, side: "bottom" });
  assert.deepEqual(at(260, 228).target, { kind: "side", at: { node: "n3" }, side: "bottom" });
  h = at(260, 243);
  assert.deepEqual([h.target, h.level, h.levels], [{ kind: "side", at: { node: "n1" }, side: "bottom" }, 2, 3]);
  assert.deepEqual([h.mark.x, h.mark.w, h.mark.h], [10, 400, STRIP]);
  // An inner edge has one choice: b's left edge is its column's, but a column takes a neighbor on its left.
  assert.deepEqual(at(225, 60).levels, 2);
  assert.deepEqual(at(225, 60).target, { kind: "side", at: { node: "n2" }, side: "left" });
});

test("hit: drops that would change nothing give null", () => {
  const s = st(() => R("a", "b"));
  const g = geo(s);
  const at = (x, y, carry) => hit(g, { x, y }, carry, s);
  assert.equal(at(105, 134, "a"), null); // on itself
  assert.equal(at(240, 134, "a"), null); // left of b: where a already is
  assert.equal(at(180, 134, "b"), null); // right of a: where b already is
  assert.deepEqual(at(105, 134, "b").target, { kind: "swap", at: "a" });
  assert.deepEqual(at(300, 75, "a").target, { kind: "side", at: { leaf: "b" }, side: "top" });
  assert.deepEqual(at(300, 30, "a").target, { kind: "side", at: { node: "n1" }, side: "top" }); // closer: over the whole row
  assert.equal(hit(geo({ ...s, root: "a" }), { x: 20, y: 100 }, "a", { ...s, root: "a" }), null); // alone
});

test("zones: what a tile offers, each choice with its part of the tile, inner to outer", () => {
  const s = nested();
  const g = geo(s);
  // d is at (325, 144), 85 × 100: its edge bands are 28.05 wide and 30 tall.
  const z = zones(g, { x: 360, y: 190 }, "x", s);
  assert.equal(z.tile.terminal, "d");
  assert.deepEqual(z.sides.right.map((c) => [c.target.at, c.count, c.whole]), [[{ leaf: "d" }, 1, false], [{ node: "n2" }, 3, false]]);
  assert.deepEqual(z.sides.bottom.map((c) => [c.target.at, c.count, c.whole]), [[{ leaf: "d" }, 1, false], [{ node: "n3" }, 2, false], [{ node: "n1" }, 4, true]]);
  assert.deepEqual(z.sides.left.length, 1);
  // The right edge's band, halved: d alone on the inside, the column at the edge.
  const [inner, outer] = z.sides.right.map((c) => c.zone);
  assert.ok(Math.abs(inner.x + inner.w - outer.x) < 1e-9 && Math.abs(outer.x + outer.w - 410) < 1e-9 && inner.h === 100);
  // Every zone's own middle picks that zone's target.
  for (const c of [...Object.values(z.sides).flat(), z.swap]) {
    assert.deepEqual(hit(g, { x: c.zone.x + c.zone.w / 2, y: c.zone.y + c.zone.h / 2 }, "x", s).target, c.target);
  }
  // Nothing to offer the tile itself but its bigger groups; no swap with itself.
  const own = zones(g, { x: 360, y: 190 }, "d", s);
  assert.equal(own.swap, null);
  assert.deepEqual(own.sides.left, []);
  assert.equal(zones(geometry(null, {}, 420, 254, box), { x: 1, y: 1 }, "x", normalize(null)), null);
});

test("landing: the place the carried terminal would take after the drop", () => {
  const s = st(() => R("a", "b"));
  const at = (carry, target) => landing(s, carry, target, {}, 420, 254, box);
  // A new one left of everything: a third of the width (less the gaps), full height.
  assert.deepEqual(at("x", { kind: "side", at: { leaf: "a" }, side: "left" }), { x: 10, y: 24, w: 120, h: 220 });
  // Under b: the lower half of b's column.
  assert.deepEqual(at("x", { kind: "side", at: { leaf: "b" }, side: "bottom" }), { x: 220, y: 144, w: 190, h: 100 });
  // One already there, under the other: the whole width, lower half. A swap: the other's place.
  assert.deepEqual(at("a", { kind: "side", at: { leaf: "b" }, side: "bottom" }), { x: 10, y: 144, w: 400, h: 100 });
  assert.deepEqual(at("a", { kind: "swap", at: "b" }), { x: 220, y: 24, w: 190, h: 220 });
  assert.deepEqual(landing(normalize(null), "x", { kind: "new" }, {}, 420, 254, box), { x: 10, y: 24, w: 400, h: 220 });
});

test("three columns, the outer two split in two: built one drop at a time", () => {
  let s = st(() => R("a", "c", "d"));
  const drop = (terminal, x, y) => { const h = hit(geo(s), { x, y }, terminal, s); s = place(s, terminal, h.target); return h; };
  // Tiles are 120 wide at x 10, 150, 290 and 220 tall from y 24. Under a, not too near the bottom edge.
  assert.deepEqual(drop("b", 70, 200).target, { kind: "side", at: { leaf: "a" }, side: "bottom" });
  assert.deepEqual(drop("e", 350, 200).target, { kind: "side", at: { leaf: "d" }, side: "bottom" });
  assert.deepEqual(of(s), ["row", ["col", "a", "b"], "c", ["col", "d", "e"]]);
  assert.deepEqual(geo(s).tiles.map((t) => [t.terminal, t.x, t.y, t.h]), [["a", 10, 24, 100], ["b", 10, 144, 100], ["c", 150, 24, 220], ["d", 290, 24, 100], ["e", 290, 144, 100]]);
  // And from five in a row: b under a, e under d.
  s = st(() => R("a", "b", "c", "d", "e"));
  drop("b", 30, 200); // a is 64 wide at x 10
  assert.deepEqual(of(s), ["row", ["col", "a", "b"], "c", "d", "e"]);
});

test("gapAt and resize: the gap under the pointer, and two neighbors' weights after it moves", () => {
  const g = geo(nested());
  assert.deepEqual([gapAt(g, { x: 205, y: 74 }).a, gapAt(g, { x: 205, y: 74 }).b], ["sbs-a", "sbs-split-n2"]);
  assert.deepEqual([gapAt(g, { x: 300, y: 130 }).kind, gapAt(g, { x: 300, y: 130 }).b], ["row", "sbs-split-n3"]);
  assert.deepEqual(gapAt(g, { x: 315, y: 200 }).px, [85, 85]);
  assert.equal(gapAt(g, { x: 100, y: 74 }), null);
  assert.deepEqual(resize([190, 190], [1, 1], 95), [1.5, 0.5]);
  assert.deepEqual(resize([190, 190], [1, 1], -500), [0.316, 1.684]); // never under 60px
  assert.deepEqual(resize([50, 50], [1, 1], 30), [1, 1]); // too small to move
});

const spaces = [
  { id: "s1", name: "alpha", tabs: [{ id: "tb1", name: "1" }, { id: "tb2", name: "fix login" }] },
  { id: "s2", name: "beta", tabs: [{ id: "tb3", name: "tb3" }] },
];
const panes = [
  { pane: "p1", terminal: "t1", tab: "tb1", program: { name: "zsh" }, status: null },
  { pane: "p2", terminal: "t2", tab: "tb2", program: { name: "Claude Code" }, status: "working" },
  { pane: "p3", terminal: null, tab: "tb2", mod: "files" },
  { pane: "p4", terminal: "t4", tab: "tb3" },
  { pane: "p5", terminal: "t5", tab: "elsewhere" },
];

test("terminals: each terminal pane with its space and a name (the tab's, else the program's)", () => {
  const all = terminals(panes, spaces);
  assert.deepEqual(all.map((e) => [e.terminal, e.spaceName, e.name, e.status]), [
    ["t1", "alpha", "zsh", null], ["t2", "alpha", "fix login", "working"], ["t4", "beta", "Terminal", null],
  ]);
  assert.deepEqual(entries(st(() => C("t4", "nope", R("t1"))), all).map((e) => e.terminal), ["t4", "t1"]);
});

test("inRow: everything side by side in one row; the buttons widen while the mode is on", () => {
  const s = st(() => R("a", C("b", R("c", "d"))));
  assert.ok(!isRow(s));
  const flatRow = inRow(s);
  assert.deepEqual(of(flatRow), ["row", "a", "b", "c", "d"]);
  assert.ok(isRow(flatRow) && isRow({ ...s, root: "a" }) && isRow({ ...s, root: null }));
  assert.equal(inRow({ ...s, root: "a" }).root, "a");
  assert.equal(inRow({ ...s, root: null }).root, null);
  const on = arrange(tree(), st(() => R("t1", "t2")), live);
  assert.deepEqual(find(on, "sbs-switch").size, { px: SWITCH.on });
  assert.deepEqual(find(arrange(on, { ...st(() => R("t1", "t2")), on: false }, live), "sbs-switch").size, { px: SWITCH.off });
});

test("depth: how deep a value nests", () => {
  assert.deepEqual([depth(1), depth(null), depth({}), depth([1]), depth({ a: [{ b: 1 }] })], [0, 0, 1, 1, 3]);
  // The live layout puts the grid three nodes down; cards alone, and one level of splits, fit run().
  const at = (grid) => ({ layout: { children: [{ children: [{ children: [grid] }] }] } });
  const flat = { children: [card("t1"), card("t2")] };
  assert.equal(depth(at(flat)), 14);
  assert.equal(depth(at({ children: [{ children: [{ children: [card("t1")] }] }] })), 18);
});
