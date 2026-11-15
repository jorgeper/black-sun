// Run: node --test mods/sidebar-menu/tests/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { spaceItems } from "../model.js";

const known = [
  { key: "claude", name: "Claude Code", icon: "icons/claude.svg", tint: false, run: ["claude"], installed: true },
  { key: "codex", name: "Codex", icon: "icons/codex.png", tint: false, run: ["codex"], installed: true },
  { key: "pi", name: "Pi", icon: "icons/pi.svg", tint: true, run: ["pi"], installed: false },
];
const keys = { "spaces-tree.new-claude": "cmd-shift-c", "tab.new": "cmd-t", "space.rename": "shift-f2" };
const keyOf = (a) => keys[a] ?? "";

test("spaceItems: installed agents first (hotkey, else their number), then Terminal, the space's own items, Close", () => {
  const items = spaceItems(known, "main", "s1", keyOf);
  assert.deepEqual(items.map((i) => i.header ?? i.label), ["Start an agent", "Claude Code", "Codex", "Terminal", "Rename", "New worktree", "Open worktree", "Tag", "Add tags…", "Close"]);
  const [, claude, codex, term, rename, , , , , close] = items;
  assert.deepEqual([claude.cmd, claude.args, claude.key], ["tab.new", { name: "<new>", space: "s1", argv: ["claude"] }, "cmd-shift-c"]);
  assert.equal(codex.key, "2");
  assert.deepEqual([claude.agent, codex.agent], ["claude", "codex"]);
  assert.deepEqual([term.cmd, term.args, term.key], ["tab.new", { space: "s1" }, "cmd-t"]);
  assert.equal(rename.gap, true);
  assert.deepEqual([rename.cmd, rename.args, rename.key], ["space.rename", { id: "s1" }, "shift-f2"]);
  assert.deepEqual([close.cmd, close.args, close.gap], ["space.close", { id: "s1" }, true]);
  assert.deepEqual(items[5], { label: "New worktree", icon: "mods/workspace-chrome/git-branch.svg", worktree: { space: "s1", action: "new" }, key: "" });
});

test("spaceItems: worktree items follow the space's checkout", () => {
  const labels = (git) => spaceItems(known, git, "s1", keyOf).map((i) => i.label).filter(Boolean);
  assert.ok(!labels(null).includes("New worktree"));
  assert.ok(labels("linked").includes("Remove worktree"));
  assert.ok(!labels("main").includes("Remove worktree"));
});

test("spaceItems: while agents are unknown, just Terminal under the header", () => {
  assert.deepEqual(spaceItems([], null, "s1", keyOf).slice(0, 2).map((i) => i.header ?? i.label), ["Start an agent", "Terminal"]);
});

test("spaceItems: each tag is an item under Tag; the space's own has ✓ and untags when picked", () => {
  const tags = [{ id: "t1", name: "ephemeral", color: "#e5534b" }, { id: "t2", name: " ", color: "#5b8def" }];
  const items = spaceItems(known, null, "s1", keyOf, tags, "t2");
  const at = items.findIndex((i) => i.header === "Tag");
  assert.deepEqual(items.slice(at + 1, at + 4), [
    { label: "ephemeral", dot: "#e5534b", tag: "t1", key: "" },
    { label: "Untitled tag", dot: "#5b8def", tag: null, key: "✓" },
    { label: "Edit tags…", icon: "mods/workspace-chrome/settings.svg", settings: true, key: "" },
  ]);
  assert.equal(items.at(-1).label, "Close");
});
