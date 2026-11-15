// Run: node --test mods/black-sun-settings/tests/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, normalize, resized, HOTKEYS, NUMBER_KEYS, numberKeyState, hotkeyState, addHotkeys, USAGE_MINUTES } from "../model.js";

test("normalize fills defaults and keeps only sane values", () => {
  assert.deepEqual(normalize(undefined), DEFAULTS);
  assert.deepEqual(DEFAULTS, { sync: true, rowWords: 5, tabWords: 3, haiku: true, usageMinutes: 5, highlight: "#8b7cf6", highlightSlot: 7, terminals: true, emptyAdd: true, keepSpaces: true, numbers: "global", wash: true, fade: true, glow: true, pulse: true, windowSize: [640, 760] });
  const set = { sync: false, rowWords: 7, tabWords: 2, haiku: false, usageMinutes: 15, highlight: "#5b8def", highlightSlot: 0, terminals: false, emptyAdd: false, keepSpaces: false, numbers: "local", wash: false, fade: false, glow: false, pulse: false, windowSize: [900, 960] };
  assert.deepEqual(normalize({ ...set, highlight: "#5B8DEF" }), set);
  // Out of range or the wrong type: clamped or the default.
  assert.deepEqual(normalize({ sync: "no", rowWords: 40, tabWords: 0, haiku: 1, usageMinutes: 7, highlight: "purple", highlightSlot: -2, fade: "yes", windowSize: [1, 2] }),
    { ...DEFAULTS, rowWords: 8, tabWords: 2 });
  // The settings window: a step bigger or smaller, stopping at the ends.
  assert.deepEqual([resized([640, 760], 1), resized([640, 760], -1), resized([520, 640], -1), resized([1040, 1040], 1), resized(null, 1)], [[760, 860], [520, 640], [520, 640], [1040, 1040], [640, 760]]);
  // The tab never gets more words than the row.
  assert.deepEqual(normalize({ rowWords: 3, tabWords: 4 }), { ...DEFAULTS, rowWords: 3, tabWords: 3 });
  assert.deepEqual(USAGE_MINUTES, [1, 5, 15, 30]);
});

test("HOTKEYS are black-sun's five ⌘⇧ keys", () => {
  assert.deepEqual(HOTKEYS.map((h) => [h.keys, h.action]), [
    ["cmd-shift-c", "spaces-tree.new-claude"],
    ["cmd-shift-x", "spaces-tree.new-codex"],
    ["cmd-shift-r", "spaces-tree.auto-name"],
    ["cmd-shift-a", "spaces-tree.auto-name-all"],
    ["cmd-shift-f", "spaces-tree.open-finder"],
  ]);
});

test("hotkeyState says which key each action has in global or this layout's section", () => {
  const keys = [
    { section: "layout:black-sun", keys: "cmd-shift-r", action: "spaces-tree.auto-name" },
    { section: "global", keys: "cmd-shift-x", action: "spaces-tree.new-codex" },
    { section: "layout:other", keys: "cmd-shift-c", action: "spaces-tree.new-claude" },
  ];
  assert.deepEqual(hotkeyState(keys, "black-sun").map((h) => h.bound), [null, "cmd-shift-x", "cmd-shift-r", null, null]);
});

test("addHotkeys adds the missing keys to the layout's section and skips keys used for something else", () => {
  const text = JSON.stringify({
    global: { "cmd-t": "tab.new", "cmd-shift-a": "app.something", "cmd-1": "tab.select:1", "cmd-2": "space.select:2" },
    terminal: { "alt-left": "send:\u001bb" },
    "layout:black-sun": { "cmd-shift-r": "spaces-tree.auto-name" },
  }, null, 2) + "\n";
  const r = addHotkeys(text, "black-sun");
  // ⌘1 is Herdr's own tab.select there: taken over. ⌘2 does something else: left alone.
  const digits = [1, 3, 4, 5, 6, 7, 8, 9];
  assert.deepEqual(r.added, ["cmd-shift-c", "cmd-shift-x", "cmd-shift-f", ...digits.map((n) => `cmd-${n}`)]);
  assert.deepEqual(r.taken, ["cmd-shift-a", "cmd-2"]);
  const out = JSON.parse(r.text);
  assert.deepEqual(out["layout:black-sun"], {
    "cmd-shift-r": "spaces-tree.auto-name",
    "cmd-shift-c": "spaces-tree.new-claude",
    "cmd-shift-x": "spaces-tree.new-codex",
    "cmd-shift-f": "spaces-tree.open-finder",
    ...Object.fromEntries(digits.map((n) => [`cmd-${n}`, `spaces-tree.go-${n}`])),
  });
  assert.equal(out.global["cmd-1"], "tab.select:1");
  assert.equal(out.terminal["alt-left"], "send:\u001bb");
  assert.ok(r.text.endsWith("}\n"));
});

test("addHotkeys creates the section, and changes nothing when all are there", () => {
  const r = addHotkeys('{"global": {}}', "black-sun");
  assert.equal(Object.keys(JSON.parse(r.text)["layout:black-sun"]).length, 14);
  assert.deepEqual(NUMBER_KEYS[8], { keys: "cmd-9", action: "spaces-tree.go-9", over: "tab.select:9" });
  const bound = Object.entries(JSON.parse(r.text)["layout:black-sun"]).map(([keys, action]) => ({ section: "layout:black-sun", keys, action }));
  assert.deepEqual([numberKeyState(bound, "black-sun"), numberKeyState(bound.slice(0, 7), "black-sun"), numberKeyState(null, "black-sun")], [9, 2, 0]);
  const again = addHotkeys(r.text, "black-sun");
  assert.deepEqual(again.added, []);
  assert.equal(again.text, null);
});

test("addHotkeys refuses a keys.json that isn't JSON", () => {
  assert.throws(() => addHotkeys("{ nope", "black-sun"), /keys\.json/);
});

test("applyYolo adds the yolo flags to Claude Code's and Codex's start commands in programs.json", async () => {
  const { applyYolo, yoloState } = await import("../model.js");
  const on = applyYolo(null, true);
  assert.deepEqual(JSON.parse(on).programs, {
    claude: { run: ["claude", "--dangerously-skip-permissions"] },
    codex: { run: ["codex", "--no-daemon", "--dangerously-bypass-approvals-and-sandbox"] },
  });
  assert.equal(yoloState(on), true);
  assert.equal(applyYolo(on, true), null);
  // Off: back to Herdr's own commands, and nothing left behind.
  const off = applyYolo(on, false);
  assert.deepEqual(JSON.parse(off), { programs: {} });
  assert.equal(yoloState(off), false);
  assert.equal(yoloState(null), false);
});

test("applyYolo keeps the person's own entries and commands", async () => {
  const { applyYolo, yoloState } = await import("../model.js");
  const mine = JSON.stringify({
    programs: { claude: { run: ["my-claude"], name: "Mine" }, lazygit: { name: "Git" } },
    shells: ["xonsh"],
  });
  const on = JSON.parse(applyYolo(mine, true));
  assert.deepEqual(on.programs.claude, { run: ["my-claude", "--dangerously-skip-permissions"], name: "Mine" });
  assert.deepEqual(on.programs.lazygit, { name: "Git" });
  assert.deepEqual(on.shells, ["xonsh"]);
  const off = JSON.parse(applyYolo(JSON.stringify(on), false));
  assert.deepEqual(off.programs.claude, { run: ["my-claude"], name: "Mine" });
  assert.equal(off.programs.codex, undefined);
  // Only one of the two in yolo: "some".
  assert.equal(yoloState(JSON.stringify({ programs: { claude: { run: ["claude", "--dangerously-skip-permissions"] } } })), "some");
});

test("applyYolo refuses a programs.json that isn't JSON", async () => {
  const { applyYolo, yoloState } = await import("../model.js");
  assert.throws(() => applyYolo("{ nope", true), /programs\.json/);
  assert.equal(yoloState("{ nope"), null);
});
