// Run: node --test mods/black-sun-settings/tests/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, normalize, HOTKEYS, hotkeyState, addHotkeys, USAGE_MINUTES } from "../model.js";

test("normalize fills defaults and keeps only sane values", () => {
  assert.deepEqual(normalize(undefined), DEFAULTS);
  assert.deepEqual(DEFAULTS, { sync: true, rowWords: 5, tabWords: 3, haiku: true, usageMinutes: 5 });
  assert.deepEqual(normalize({ sync: false, rowWords: 7, tabWords: 2, haiku: false, usageMinutes: 15 }),
    { sync: false, rowWords: 7, tabWords: 2, haiku: false, usageMinutes: 15 });
  // Out of range or the wrong type: clamped or the default.
  assert.deepEqual(normalize({ sync: "no", rowWords: 40, tabWords: 0, haiku: 1, usageMinutes: 7 }),
    { sync: true, rowWords: 8, tabWords: 2, haiku: true, usageMinutes: 5 });
  // The tab never gets more words than the row.
  assert.deepEqual(normalize({ rowWords: 3, tabWords: 4 }), { ...DEFAULTS, rowWords: 3, tabWords: 3 });
  assert.deepEqual(USAGE_MINUTES, [1, 5, 15, 30]);
});

test("HOTKEYS are black-sun's four ⌘⇧ keys", () => {
  assert.deepEqual(HOTKEYS.map((h) => [h.keys, h.action]), [
    ["cmd-shift-c", "spaces-tree.new-claude"],
    ["cmd-shift-x", "spaces-tree.new-codex"],
    ["cmd-shift-r", "spaces-tree.auto-name"],
    ["cmd-shift-a", "spaces-tree.auto-name-all"],
  ]);
});

test("hotkeyState says which key each action has in global or this layout's section", () => {
  const keys = [
    { section: "layout:black-sun", keys: "cmd-shift-r", action: "spaces-tree.auto-name" },
    { section: "global", keys: "cmd-shift-x", action: "spaces-tree.new-codex" },
    { section: "layout:other", keys: "cmd-shift-c", action: "spaces-tree.new-claude" },
  ];
  assert.deepEqual(hotkeyState(keys, "black-sun").map((h) => h.bound), [null, "cmd-shift-x", "cmd-shift-r", null]);
});

test("addHotkeys adds the missing keys to the layout's section and skips keys used for something else", () => {
  const text = JSON.stringify({
    global: { "cmd-t": "tab.new", "cmd-shift-a": "app.something" },
    terminal: { "alt-left": "send:\u001bb" },
    "layout:black-sun": { "cmd-shift-r": "spaces-tree.auto-name" },
  }, null, 2) + "\n";
  const r = addHotkeys(text, "black-sun");
  assert.deepEqual(r.added, ["cmd-shift-c", "cmd-shift-x"]);
  assert.deepEqual(r.taken, ["cmd-shift-a"]);
  const out = JSON.parse(r.text);
  assert.deepEqual(out["layout:black-sun"], {
    "cmd-shift-r": "spaces-tree.auto-name",
    "cmd-shift-c": "spaces-tree.new-claude",
    "cmd-shift-x": "spaces-tree.new-codex",
  });
  assert.equal(out.terminal["alt-left"], "send:\u001bb");
  assert.ok(r.text.endsWith("}\n"));
});

test("addHotkeys creates the section, and changes nothing when all are there", () => {
  const r = addHotkeys('{"global": {}}', "black-sun");
  assert.equal(Object.keys(JSON.parse(r.text)["layout:black-sun"]).length, 4);
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
