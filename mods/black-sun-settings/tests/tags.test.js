// Run: node --test mods/black-sun-settings/tests/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COLORS, normalize, tagName, tagOf, addTag, updateTag, removeTag, assign, setStyle, setDefault, tagNew, contrast, ink } from "../tags.js";

test("normalize: nothing saved is no tags, squares", () => {
  assert.deepEqual(normalize(undefined), { style: "square", default: null, tags: [], spaces: {} });
  assert.deepEqual(normalize("junk"), { style: "square", default: null, tags: [], spaces: {} });
});

test("normalize: keeps sane tags, fixes bad colors, drops tags without an id and orphaned spaces", () => {
  const s = normalize({
    style: "row",
    tags: [{ id: "t1", name: "ephemeral", color: "#E5534B" }, { id: "t2", name: 5, color: "red" }, { name: "no id" }, { id: "t1", name: "again" }],
    spaces: { a: "t1", b: "gone", c: "t2" },
  });
  assert.deepEqual(s, {
    style: "row",
    default: null,
    tags: [{ id: "t1", name: "ephemeral", color: "#e5534b" }, { id: "t2", name: "", color: COLORS[0] }],
    spaces: { a: "t1", c: "t2" },
  });
  assert.equal(normalize({ style: "stripes" }).style, "square");
});

test("addTag: a new id each time, in the least used color", () => {
  let { state, id } = addTag(normalize(null), "ephemeral");
  assert.equal(id, "t1");
  assert.deepEqual(state.tags, [{ id: "t1", name: "ephemeral", color: COLORS[0] }]);
  ({ state, id } = addTag(state));
  assert.deepEqual([id, state.tags[1].color, state.tags[1].name], ["t2", COLORS[1], ""]);
  // An id is never reused, even after the tag before it went.
  ({ state, id } = addTag(removeTag(state, "t1")));
  assert.equal(id, "t3");
});

test("assign, tagOf: one tag per space; null untags; an unknown tag untags", () => {
  let s = addTag(addTag(normalize(null), "ephemeral").state, "permanent").state;
  s = assign(s, "sp1", "t1");
  assert.equal(tagOf(s, "sp1").name, "ephemeral");
  s = assign(s, "sp1", "t2");
  assert.equal(tagOf(s, "sp1").name, "permanent");
  assert.equal(tagOf(s, "sp2"), null);
  assert.equal(tagOf(assign(s, "sp1", null), "sp1"), null);
  assert.equal(tagOf(assign(s, "sp1", "nope"), "sp1"), null);
});

test("updateTag changes name or color, never the id; removeTag untags its spaces", () => {
  let s = assign(addTag(normalize(null), "a").state, "sp1", "t1");
  s = updateTag(s, "t1", { name: "b", color: COLORS[3], id: "x" });
  assert.deepEqual(s.tags, [{ id: "t1", name: "b", color: COLORS[3] }]);
  assert.equal(updateTag(s, "t1", { color: "nope" }).tags[0].color, COLORS[0]);
  s = removeTag(s, "t1");
  assert.deepEqual([s.tags, s.spaces], [[], {}]);
});

test("setStyle takes only the known styles; tagName has a fallback", () => {
  const s = normalize(null);
  assert.equal(setStyle(s, "row").style, "row");
  assert.equal(setStyle(s, "blink").style, "square");
  assert.equal(tagName({ name: "  " }), "Untitled tag");
  assert.equal(tagName({ name: "permanent" }), "permanent");
});

test("ink: readable text on every tag color (at least 4.5:1), dark on light and white on dark", () => {
  for (const c of COLORS) assert.ok(contrast(c, ink(c)) >= 4.5, `${c}: ${contrast(c, ink(c)).toFixed(2)}`);
  assert.equal(ink("#ffffff"), "#14161a");
  assert.equal(ink("#000000"), "#ffffff");
});

test("setDefault: a tag new spaces start with; gone when its tag is removed", () => {
  let s = addTag(normalize(null), "ephemeral").state;
  assert.equal(setDefault(s, "t1").default, "t1");
  assert.equal(setDefault(s, "nope").default, null);
  assert.equal(setDefault(setDefault(s, "t1"), null).default, null);
  assert.equal(removeTag(setDefault(s, "t1"), "t1").default, null);
  assert.equal(normalize({ ...s, default: "t1" }).default, "t1");
});

test("tagNew: only spaces never seen before get the default tag", () => {
  const s = setDefault(addTag(addTag(normalize(null), "ephemeral").state, "permanent").state, "t1");
  // The first time: every space there counts as known, none is tagged. Nothing known while none are listed yet.
  assert.deepEqual(tagNew(s, null, []), { state: s, seen: null, tagged: false, grew: false });
  let r = tagNew(s, null, ["a", "b"]);
  assert.deepEqual([r.seen, r.tagged, r.grew, r.state.spaces], [["a", "b"], false, true, {}]);
  // Nothing new: nothing changes.
  assert.deepEqual(tagNew(s, ["a", "b"], ["b", "a"]), { state: s, seen: ["a", "b"], tagged: false, grew: false });
  // A new space gets the default.
  r = tagNew(s, ["a", "b"], ["a", "b", "c"]);
  assert.deepEqual([r.seen, r.tagged, r.grew, r.state.spaces], [["a", "b", "c"], true, true, { c: "t1" }]);
  // Untagged afterwards, it stays untagged; a closed space stays known.
  const untagged = assign(r.state, "c", null);
  assert.deepEqual(tagNew(untagged, r.seen, ["a", "c"]).state.spaces, {});
  // A new space that already has a tag keeps it; with no default, new spaces are only remembered.
  assert.deepEqual(tagNew(assign(s, "d", "t2"), ["a"], ["a", "d"]).state.spaces, { d: "t2" });
  r = tagNew(setDefault(s, null), ["a"], ["a", "e"]);
  assert.deepEqual([r.seen, r.tagged, r.grew, r.state.spaces], [["a", "e"], false, true, {}]);
});

test("the three copies of tags.js are the same", () => {
  const read = (mod) => readFileSync(new URL(`../../${mod}/tags.js`, import.meta.url), "utf8");
  assert.equal(read("sidebar-menu"), read("black-sun-settings"));
  assert.equal(read("spaces-tree"), read("black-sun-settings"));
});
