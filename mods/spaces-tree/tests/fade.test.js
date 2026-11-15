// Run: node --test mods/spaces-tree/tests/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fade, glow, wash, pulse, pulsing, glowing, statusColor, layers } from "../fade.js";

const sum = (slices) => slices.reduce((n, s) => n + s.grow, 0);

test("fade: from the space's color, strong, to the highlight's quiet tint by 70% of the way", () => {
  const f = fade("#ff0000", "#0000ff", 10);
  assert.equal(f.length, 11);
  assert.equal(f[0].color, "#ff000099");
  // The steps share the first 70% evenly; the last 30% is one piece: the highlight color at its tint.
  assert.ok(f.slice(0, 10).every((s) => Math.abs(s.grow - 0.07) < 1e-9));
  assert.deepEqual([f[9].color, f[10].color, f[10].grow], ["#0000ff38", "#0000ff38", 0.3]);
  assert.ok(Math.abs(sum(f) - 1) < 1e-9);
  // Red only falls, blue only rises.
  const red = f.map((s) => parseInt(s.color.slice(1, 3), 16)), blue = f.map((s) => parseInt(s.color.slice(5, 7), 16));
  for (let i = 1; i < 11; i++) assert.ok(red[i] <= red[i - 1] && blue[i] >= blue[i - 1]);
  assert.ok(f.every((s) => /^#[0-9a-f]{8}$/.test(s.color)));
});

test("fade and glow: no step big enough to see (under 4 of 255 a channel, a slice)", () => {
  const ch = (c) => [1, 3, 5, 7].map((i) => parseInt(c.slice(i, i + 2), 16));
  for (const slices of [fade("#e5534b", "#8b7cf6"), glow("#e0b23a")]) {
    for (let i = 1; i < slices.length; i++) {
      const a = ch(slices[i - 1].color), b = ch(slices[i].color);
      assert.ok(a.every((v, k) => Math.abs(v - b[k]) <= (k === 3 ? 6 : 4)), `${slices[i - 1].color} -> ${slices[i].color}`);
    }
  }
});

test("glow: clear on the left, the color easing in over the right part, strongest at the edge", () => {
  const g = glow("#3fae6a", 10, 0.4);
  assert.deepEqual(g[0], { color: "#3fae6a00", grow: 0.6 });
  assert.ok(Math.abs(sum(g) - 1) < 1e-9);
  const alpha = g.map((s) => parseInt(s.color.slice(7), 16));
  for (let i = 1; i < 11; i++) assert.ok(alpha[i] > alpha[i - 1]);
  assert.equal(g[10].color, "#3fae6ab3");
  assert.deepEqual([statusColor("working"), statusColor("done"), statusColor("blocked"), statusColor("idle"), statusColor(null)], ["#e0b23a", "#3b9eff", "#e5534b", "#7f8ea3", null]);
  assert.ok(Math.abs(glow("#3fae6a")[0].grow - 0.8) < 1e-9); // by default the last 20% of the width
  // It gathers at the edge: halfway across its width it is under a quarter of its full strength.
  const full = glow("#3fae6a").map((s) => parseInt(s.color.slice(7), 16));
  assert.ok(full[36] < full[72] / 4 && full[72] === 179);
});

test("glow: working, done and needs you are as strong as one another; an idle agent's is a hint", () => {
  const edge = (status) => { const l = layers({ focused: false, tag: null, highlight: "#8b7cf6", status, opts: { pulse: false } })[0].slices; return parseInt(l[l.length - 1].color.slice(7), 16); };
  assert.deepEqual([edge("idle"), edge("done"), edge("working"), edge("blocked")], [46, 217, 217, 217]);
});

test("wash: the color strongest at the left edge, gone by 45% of the width, in steps too small to see", () => {
  const w = wash("#e5534b");
  assert.equal(w[0].color, "#e5534b80");
  assert.deepEqual([w[w.length - 1].color, Math.round(w[w.length - 1].grow * 100)], ["#e5534b00", 55]);
  assert.ok(Math.abs(sum(w) - 1) < 1e-9);
  const alpha = w.map((s) => parseInt(s.color.slice(7), 16));
  for (let i = 1; i < w.length; i++) assert.ok(alpha[i] <= alpha[i - 1] && alpha[i - 1] - alpha[i] <= 6);
});

test("layers: the fade for the focused one with a tag, the glow for one doing something; each a setting", () => {
  const of = (x) => layers({ focused: false, tag: null, highlight: "#8b7cf6", status: null, opts: {}, ...x }).map((l) => l.slices[l.slices.length - 1].color.slice(0, 7));
  assert.deepEqual(of({}), []);
  assert.deepEqual(of({ focused: true, tag: "#ff0000" }), ["#8b7cf6"]);
  assert.deepEqual(of({ focused: true }), []);
  assert.deepEqual(of({ status: "done" }), ["#3b9eff"]);
  assert.deepEqual(of({ focused: true, tag: "#ff0000", status: "blocked" }), ["#8b7cf6", "#e5534b"]);
  assert.deepEqual(of({ focused: true, tag: "#ff0000", status: "working", opts: { fade: false, pulse: false } }), ["#e0b23a"]);
  assert.deepEqual(of({ focused: true, tag: "#ff0000", status: "working", opts: { glow: false } }), ["#8b7cf6"]);
  assert.deepEqual(of({ status: "idle" }), ["#7f8ea3"]);
  assert.deepEqual(of({ status: "idle", opts: { glow: false } }), []);
});

test("pulse: a working agent's glow is one layer whose opacity swings", () => {
  const s = pulse("#e0b23a");
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].loop, { from: 0.3, to: 1, period: 1400 });
  assert.ok(Math.abs(sum(s[0].slices) - 1) < 1e-9);
  assert.equal(s[0].slices[s[0].slices.length - 1].color, "#e0b23ad9");
  // Only a working agent pulses, and only with both settings on; then layers() gives the pulse.
  assert.deepEqual([pulsing("working", {}), pulsing("done", {}), pulsing("working", { pulse: false }), pulsing("working", { glow: false })], [true, false, false, false]);
  assert.deepEqual([glowing(undefined), glowing({}), glowing({ glow: false })], [true, true, false]);
  const l = layers({ focused: false, tag: null, highlight: "#8b7cf6", status: "working", opts: {} });
  assert.deepEqual([l.length, l.filter((x) => x.loop).length], [1, 1]);
  const done = layers({ focused: false, tag: null, highlight: "#8b7cf6", status: "done", opts: {} })[0];
  assert.equal(done.loop, undefined);
  // The same shape as the steady ones: only the color and the swing differ.
  assert.deepEqual(l[0].slices.map((x) => [x.color.slice(7), x.grow]), done.slices.map((x) => [x.color.slice(7), x.grow]));
});

test("the three copies of fade.js are the same", () => {
  const read = (mod) => readFileSync(new URL(`../../${mod}/fade.js`, import.meta.url), "utf8");
  assert.equal(read("side-by-side"), read("spaces-tree"));
  assert.equal(read("black-sun-tabs"), read("spaces-tree"));
});
