// Run: node --test mods/black-sun-settings/tests/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE, BUILTIN, normalize, paletteName, current, select, duplicate, remove, rename, setColor, restore, nearest, toHsv, fromHsv } from "../palettes.js";

test("the built-in palettes: fifteen, each with SIZE colors, no color twice in one, ids and names all different", () => {
  assert.equal(BUILTIN.length, 15);
  for (const p of BUILTIN) {
    assert.equal(p.colors.length, SIZE, p.name);
    assert.ok(p.colors.every((c) => /^#[0-9a-f]{6}$/.test(c)), p.name);
    assert.equal(new Set(p.colors).size, SIZE, p.name);
  }
  assert.equal(new Set(BUILTIN.map((p) => p.id)).size, 15);
  assert.equal(new Set(BUILTIN.map((p) => p.name)).size, 15);
});

test("normalize: nothing saved is the built-in palettes, the first selected; bad parts are fixed", () => {
  const s = normalize(undefined);
  assert.deepEqual([s.current, s.palettes.length, current(s).name], ["b1", 15, "Black Sun"]);
  s.palettes[0].colors[0] = "#000000"; // a copy: the built-in ones stay as they are
  assert.equal(BUILTIN[0].colors[0], "#5b8def");
  const t = normalize({ current: "gone", palettes: [{ id: "p1", name: 5, colors: ["#ABCDEF", "red"] }, { id: "p1" }, { name: "no id" }, null] });
  assert.deepEqual(t.palettes.map((p) => p.id), ["p1"]);
  assert.deepEqual([t.current, t.palettes[0].name, t.palettes[0].colors.length], ["p1", "", SIZE]);
  assert.deepEqual(t.palettes[0].colors.slice(0, 3), ["#abcdef", BUILTIN[0].colors[1], BUILTIN[0].colors[2]]);
  assert.equal(paletteName(t.palettes[0]), "Untitled palette");
});

test("select, duplicate, rename, setColor, remove", () => {
  let s = select(normalize(null), "b3");
  assert.equal(current(s).name, "Catppuccin");
  assert.equal(select(s, "nope"), s);
  let id;
  ({ state: s, id } = duplicate(s, "b3"));
  assert.deepEqual([id, s.current, s.palettes[3].name, s.palettes[3].colors], ["p1", "p1", "Catppuccin copy", BUILTIN[2].colors]);
  assert.equal(duplicate(s, "p1").id, "p2");
  s = setColor(rename(s, "p1", "Mine"), "p1", 2, "#112233");
  assert.deepEqual([current(s).name, current(s).colors[2], s.palettes[2].colors[2]], ["Mine", "#112233", BUILTIN[2].colors[2]]);
  assert.equal(setColor(s, "p1", 2, "blue"), s);
  assert.equal(setColor(s, "p1", SIZE, "#112233"), s);
  // Removing the selected one selects the one before it; the last one can't go.
  s = remove(s, "p1");
  assert.deepEqual([s.current, s.palettes.length], ["b3", 15]);
  assert.equal(remove(s, "b1").current, "b3");
  const one = { current: "b1", palettes: [normalize(null).palettes[0]] };
  assert.equal(remove(one, "b1"), one);
});

test("restore: the built-in palettes are back as they came; a person's own stay", () => {
  let s = duplicate(normalize(null), "b2").state;
  s = remove(setColor(s, "b1", 0, "#000000"), "b5");
  const r = restore(s);
  assert.deepEqual(r.palettes.map((p) => p.id), [...BUILTIN.map((p) => p.id), "p1"]);
  assert.deepEqual([r.palettes[0].colors[0], r.current], ["#5b8def", "p1"]);
});

test("nearest: the closest color's place", () => {
  const colors = BUILTIN[0].colors;
  assert.equal(nearest(colors, "#8b7cf6"), 7);
  assert.equal(nearest(colors, "#ff0000"), 5);
  assert.equal(nearest(colors, "junk"), 0);
});

test("toHsv, fromHsv: there and back", () => {
  assert.deepEqual(toHsv("#ff0000"), { h: 0, s: 100, v: 100 });
  assert.deepEqual(toHsv("#000000"), { h: 0, s: 0, v: 0 });
  assert.deepEqual(toHsv("#3366cc"), { h: 220, s: 75, v: 80 });
  assert.equal(fromHsv({ h: 220, s: 75, v: 80 }), "#3366cc");
  assert.equal(fromHsv({ h: 360, s: 100, v: 100 }), "#ff0000");
  assert.equal(fromHsv({ h: 120, s: 0, v: 50 }), "#808080");
  // Any palette color survives the trip within a step of rounding.
  for (const c of BUILTIN.flatMap((p) => p.colors)) {
    const back = fromHsv(toHsv(c));
    for (const i of [1, 3, 5]) assert.ok(Math.abs(parseInt(c.slice(i, i + 2), 16) - parseInt(back.slice(i, i + 2), 16)) <= 4, `${c} -> ${back}`);
  }
});
