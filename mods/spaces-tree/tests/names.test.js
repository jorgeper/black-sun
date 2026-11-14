// Run: node --test mods/spaces-tree/tests/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { telling, syncTargets, shortTitle, claudeExcerpt, codexExcerpt, cleanTitle, namePair, rowLabel, nameable, NEW } from "../names.js";

const claude = { key: "claude", name: "Claude Code" };
const ag = (o) => ({ address: "t1", tab: "tab1", title: "", program: claude, ...o });

test("telling keeps a real title and refuses program names, paths and user@host", () => {
  assert.equal(telling(ag({ title: "✳ Photo tags cleanup" })), "Photo tags cleanup");
  assert.equal(telling(ag({ title: "Claude Code" })), null);
  assert.equal(telling(ag({ title: "claude" })), null);
  assert.equal(telling(ag({ title: "~/src/notes" })), null);
  assert.equal(telling(ag({ title: "me@host: ~" })), null);
  assert.equal(telling(ag({ title: "" })), null);
});

test("syncTargets: one-agent tabs nobody named, or named by sync itself and unchanged since", () => {
  const tabs = [
    { id: "a", named: false }, { id: "b", named: true, name: "Mine" }, { id: "c", named: false },
    { id: "d", named: false }, { id: "e", named: false }, { id: "f", named: true, name: "Old sync name" },
  ];
  const agents = [
    ag({ address: "1", tab: "a", title: "Resize and rename images | notes" }),
    ag({ address: "2", tab: "b", title: "Named by a person" }),
    ag({ address: "3", tab: "c", title: "One" }), ag({ address: "4", tab: "c", title: "Two" }),
    ag({ address: "5", tab: "d", title: "Reset by a person" }),
    ag({ address: "6", tab: "e", title: "Claude Code" }),
    ag({ address: "7", tab: "f", title: "Copying backup files to disk" }),
  ];
  // d was named by sync before and is unnamed now: a person reset it, so leave it.
  const given = { d: { tab: "Something", by: "sync" }, f: { tab: "Old sync name", by: "sync" }, b: { tab: "Not mine anymore", by: "sync" } };
  assert.deepEqual(syncTargets(agents, tabs, given), [
    { tab: "a", title: "Resize and rename images" },
    { tab: "e", title: null },
    { tab: "f", title: "Copying backup files to disk" },
  ]);
});

test("shortTitle keeps 3 words at most, dropping little words first when it must cut", () => {
  assert.equal(shortTitle("Photo tags cleanup"), "Photo tags cleanup");
  assert.equal(shortTitle("Copying backup files to disk"), "Copying backup files");
  assert.equal(shortTitle("Fix the bug in parser"), "Fix bug parser");
  assert.equal(shortTitle("Notes for the team"), "Notes team");
  assert.equal(shortTitle("Resize and rename images"), "Resize rename images");
  assert.equal(shortTitle("Edit and rename"), "Edit and rename");
  assert.equal(shortTitle("  "), null);
});

const line = (o) => JSON.stringify(o);
const user = (content, extra = {}) => line({ type: "user", message: { role: "user", content }, ...extra });
const asst = (content, extra = {}) => line({ type: "assistant", message: { role: "assistant", content }, ...extra });

test("claudeExcerpt keeps only what was said, not tools, thinking, meta or tags", () => {
  const text = [
    user("first ask"),
    asst([{ type: "thinking", thinking: "hmm" }, { type: "text", text: "On it." }, { type: "tool_use", name: "Bash" }]),
    user([{ type: "tool_result", content: "lots" }], { toolUseResult: {} }),
    user([{ type: "text", text: "Base directory for this skill" }], { isMeta: true }),
    user("This session is being continued", { isCompactSummary: true }),
    user("<task-notification>x</task-notification>"),
    user([{ type: "text", text: "[Request interrupted by user]" }]),
    asst([{ type: "text", text: "side" }], { isSidechain: true }),
    user([{ type: "text", text: "second ask" }, { type: "image" }]),
    "{broken",
  ].join("\n");
  assert.equal(claudeExcerpt(text), "User: first ask\nAssistant: On it.\nUser: second ask");
});

test("claudeExcerpt keeps the last 6 user turns and at most 4000 characters, from the end", () => {
  const turns = [];
  for (let i = 1; i <= 8; i++) turns.push(user(`ask ${i}`), asst([{ type: "text", text: `reply ${i}` }]));
  const ex = claudeExcerpt(turns.join("\n"));
  assert.ok(ex.startsWith("User: ask 3\n"));
  assert.ok(ex.endsWith("Assistant: reply 8"));
  const long = [user("x".repeat(1000)), asst([{ type: "text", text: "y".repeat(1000) }])];
  const big = claudeExcerpt(Array(6).fill(long).flat().join("\n"));
  assert.ok(big.length <= 4000);
  assert.ok(!big.includes("x".repeat(401)));
});

test("codexExcerpt reads response_item messages, skipping developer text and injected context", () => {
  const msg = (role, type, text) => line({ type: "response_item", payload: { type: "message", role, content: [{ type, text }] } });
  const text = [
    line({ type: "session_meta", payload: { cwd: "/w" } }),
    msg("developer", "input_text", "You are Codex"),
    msg("user", "input_text", "# AGENTS.md instructions\n..."),
    msg("user", "input_text", "<environment_context>x</environment_context>"),
    msg("user", "input_text", "convert the image files"),
    msg("assistant", "output_text", "Converted four photos."),
  ].join("\n");
  assert.equal(codexExcerpt(text), "User: convert the image files\nAssistant: Converted four photos.");
});

test("cleanTitle tidies what Haiku says and refuses what isn't a title", () => {
  assert.equal(cleanTitle('"MCP tree failure dots."\n'), "MCP tree failure");
  assert.equal(cleanTitle("Title: Agent rename menu"), "Agent rename menu");
  assert.equal(cleanTitle("**Agent rename menu**\nBecause..."), "Agent rename menu");
  assert.equal(cleanTitle("   "), null);
  assert.equal(cleanTitle("This is a very long sentence that is clearly not a short title at all"), null);
  assert.equal(cleanTitle("Herdr tab title sync"), "Herdr tab title");
});

test("syncTargets treats a tab named just its program's name as unnamed, and keeps only Codex's thread title", () => {
  const codex = { key: "codex", name: "Codex" };
  const tabs = [{ id: "a", named: true, name: "Claude Code" }, { id: "b", named: true, name: "Codex" }, { id: "c", named: true, name: "Work" }];
  const agents = [
    ag({ address: "1", tab: "a", title: "Copying backup files to disk" }),
    ag({ address: "2", tab: "b", title: "Action Required | Resize and rename images | notes", program: codex }),
    ag({ address: "3", tab: "c", title: "Something else" }),
  ];
  assert.deepEqual(syncTargets(agents, tabs, {}), [
    { tab: "a", title: "Copying backup files to disk" },
    { tab: "b", title: "Resize and rename images" },
  ]);
});

test("syncTargets: a Codex title that's only a status is no title yet (the tab says <new>)", () => {
  const codex = { key: "codex", name: "Codex" };
  const agents = [ag({ tab: "a", title: "Action Required | notes", program: codex })];
  assert.deepEqual(syncTargets(agents, [{ id: "a", named: false }], {}), [{ tab: "a", title: null }]);
});

test("syncTargets leaves tabs Auto-name named", () => {
  const agents = [ag({ tab: "a", title: "Some long agent title here" })];
  const tabs = [{ id: "a", named: true, name: "Auto short" }];
  assert.deepEqual(syncTargets(agents, tabs, { a: { tab: "Auto short", row: "Auto longer name", by: "auto" } }), []);
});

test("shortTitle and cleanTitle take a word limit (row names: 5)", () => {
  assert.equal(shortTitle("Set up Herdr mobile with VPN and more", 5), "Set up Herdr mobile VPN");
  assert.equal(cleanTitle("Herdr agent rename menu and hotkeys", 5), "Herdr agent rename menu hotkeys");
});

test("namePair reads Haiku's two lines: a row name (5 words) and a tab name (3)", () => {
  assert.deepEqual(namePair("Row: Agent rename menu with hotkeys\nTab: Agent rename menu\n"), { row: "Agent rename menu with hotkeys", tab: "Agent rename menu" });
  assert.deepEqual(namePair("Building the MCP servers dialog for Herdr"), { row: "Building MCP servers dialog Herdr", tab: "Building MCP servers" });
  assert.equal(namePair(""), null);
});

test("rowLabel: the row name while the tab still carries the tab name we gave it, else as before but at most 5 words", () => {
  const tab = (name, named = true) => ({ id: "a", name, named });
  const a = ag({ tab: "a", title: "Copying backup files to a spare disk now" });
  assert.equal(rowLabel(a, tab("Backup disk copy"), { tab: "Backup disk copy", row: "Copying backup files to disk", by: "sync" }), "Copying backup files to disk");
  assert.equal(rowLabel(a, tab("My own name"), { tab: "Backup disk copy", row: "x", by: "sync" }), "My own name");
  assert.equal(rowLabel(a, tab("1", false), null), "Copying backup files spare disk");
  assert.equal(rowLabel(ag({ tab: "a", title: "Claude Code" }), tab("1", false), null), "Claude Code");
});

test("nameable: Claude Code and Codex agents on this computer", () => {
  assert.equal(nameable(ag({ address: "t1" })), true);
  assert.equal(nameable(ag({ address: "t2", program: { key: "codex", name: "Codex" } })), true);
  assert.equal(nameable(ag({ address: "srv/t1" })), false);
  assert.equal(nameable(ag({ address: "t3", program: { key: "shell", name: "zsh" } })), false);
  assert.equal(nameable(null), false);
});

test("a just-started agent is <new> until it says what it's doing", () => {
  assert.equal(NEW, "<new>");
  const tabs = [{ id: "a", named: true, name: "<new>" }, { id: "b", named: true, name: "<new>" }, { id: "c", named: true, name: "Claude Code" }];
  const agents = [
    ag({ address: "1", tab: "a", title: "Claude Code" }),
    ag({ address: "2", tab: "b", title: "Fix login bug" }),
    ag({ address: "3", tab: "c", title: "✳ Claude Code" }),
  ];
  assert.deepEqual(syncTargets(agents, tabs, {}), [{ tab: "b", title: "Fix login bug" }, { tab: "c", title: null }]);
  assert.equal(rowLabel(agents[0], tabs[0], null), "<new>");
});

test("nameOptions reads black-sun's settings: sync, word limits and Haiku, with defaults", async () => {
  const { nameOptions } = await import("../names.js");
  assert.deepEqual(nameOptions(undefined), { sync: true, rowWords: 5, tabWords: 3, haiku: true });
  assert.deepEqual(nameOptions({ sync: false, rowWords: 7, tabWords: 2, haiku: false, usageMinutes: 1 }), { sync: false, rowWords: 7, tabWords: 2, haiku: false });
  assert.deepEqual(nameOptions({ rowWords: 99, tabWords: 4 }), { sync: true, rowWords: 8, tabWords: 4, haiku: true });
  assert.deepEqual(nameOptions({ rowWords: 3, tabWords: 4 }), { sync: true, rowWords: 3, tabWords: 3, haiku: true });
});

test("namePair and rowLabel take the word limits", () => {
  assert.deepEqual(namePair("Row: Agent rename menu with hotkeys\nTab: Agent rename menu", { rowWords: 3, tabWords: 2 }), { row: "Agent rename menu", tab: "Agent rename" });
  const a = ag({ tab: "a", title: "Copying backup files to a spare disk now" });
  assert.equal(rowLabel(a, { id: "a", name: "1", named: false }, null, 7), "Copying backup files spare disk now");
});

test("the Haiku prompts say the word limits", async () => {
  const { namePrompt, shortenPrompt } = await import("../names.js");
  assert.match(namePrompt({ rowWords: 6, tabWords: 2 }), /Row: <AT MOST 6 words>\nTab: <AT MOST 2 words>/);
  assert.match(shortenPrompt(4), /AT MOST 4 words/);
});
