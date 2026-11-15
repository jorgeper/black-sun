// Pure-logic tests for skill-tree. Run: node --test mods/skill-tree/tests/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectDirName, terminalIdFromPs, pickerEntries, lastListing,
  summary, parseFrontMatter, buildTree, countSkills, toggleId, skillInfo, pluginInfo, pluginSkillPaths,
} from "../model.js";

test("projectDirName turns / and . into -", () => {
  assert.equal(projectDirName("/Users/me/src/brain"), "-Users-me-src-brain");
  assert.equal(projectDirName("/a/b.c"), "-a-b-c");
});

test("terminalIdFromPs finds HC_TERMINAL_ID", () => {
  assert.equal(terminalIdFromPs("claude HC_SCOPE=x HC_TERMINAL_ID=t17 PATH=/bin"), "t17");
});

test("terminalIdFromPs is null without the variable or output (dead pid)", () => {
  assert.equal(terminalIdFromPs("claude PATH=/bin"), null);
  assert.equal(terminalIdFromPs(""), null);
});

const agent = (address, extra = {}) => ({ address, space_name: "brain", tab_name: "Claude Code", focused: false, ...extra });

test("pickerEntries matches each agent to its own session even in the same folder", () => {
  const sessions = [
    { pid: 1, sessionId: "s1", cwd: "/w", startedAt: 1, terminal: "t1" },
    { pid: 2, sessionId: "s2", cwd: "/w", startedAt: 1, terminal: "t2" },
  ];
  const out = pickerEntries(sessions, [agent("t2", { focused: true }), agent("t1"), agent("t9")]);
  assert.deepEqual(out.map((e) => [e.address, e.sessionId]), [["t2", "s2"], ["t1", "s1"], ["t9", null]]);
  assert.equal(out[0].label, "brain / Claude Code");
  assert.equal(out[0].focused, true);
  assert.equal(out[0].cwd, "/w");
});

test("pickerEntries prefers the newest session when two claim one terminal", () => {
  const sessions = [
    { pid: 1, sessionId: "old", cwd: "/w", startedAt: 1, terminal: "t1" },
    { pid: 2, sessionId: "new", cwd: "/w", startedAt: 2, terminal: "t1" },
  ];
  assert.equal(pickerEntries(sessions, [agent("t1")])[0].sessionId, "new");
});

test("pickerEntries keeps agents with no Claude session (e.g. Codex) as unavailable, with their program", () => {
  const codex = { key: "codex", name: "Codex", icon: "icons/codex.svg", tint: true };
  const out = pickerEntries([], [agent("t5", { program: codex })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].sessionId, null);
  assert.equal(out[0].available, false);
  assert.equal(out[0].browsable, false);
  assert.deepEqual(out[0].program, codex);
});

test("pickerEntries makes a non-Claude agent browsable when its folder is known", () => {
  const sessions = [{ pid: 1, sessionId: "s1", cwd: "/claude", startedAt: 1, terminal: "t1" }];
  const out = pickerEntries(sessions, [agent("t1"), agent("t5")], { t1: "/pane", t5: "/w" });
  assert.deepEqual(out.map((e) => [e.available, e.browsable, e.cwd]), [[true, true, "/claude"], [false, true, "/w"]]);
});

test("pickerEntries marks matched agents available and passes their program through", () => {
  const claude = { key: "claude", name: "Claude Code", icon: "icons/claude.svg", tint: false };
  const out = pickerEntries([{ pid: 1, sessionId: "s1", cwd: "/w", startedAt: 1, terminal: "t1" }], [agent("t1", { program: claude })]);
  assert.equal(out[0].available, true);
  assert.deepEqual(out[0].program, claude);
});

const listingLine = (names, content, isInitial = true) =>
  JSON.stringify({ type: "attachment", attachment: { type: "skill_listing", isInitial, names, content } });

test("lastListing starts over at each full listing and skips broken lines", () => {
  const text = [
    listingLine(["a", "z"], "- a: Old.\n- z: Gone"),
    "{not json",
    JSON.stringify({ type: "user", message: { content: "hi" } }),
    listingLine(["a", "b"], "- a: Does A. More.\n- b: Does B"),
  ].join("\n");
  const r = lastListing(text);
  assert.deepEqual(r.names, ["a", "b"]);
  assert.deepEqual(r.descriptions, { a: "Does A. More.", b: "Does B" });
});

test("lastListing adds later partial listings to the last full one", () => {
  const text = [
    listingLine(["a", "b"], "- a: A\n- b: B"),
    listingLine(["b", "c"], "- b: B2\n- c: C", false),
  ].join("\n");
  const r = lastListing(text);
  assert.deepEqual(r.names, ["a", "b", "c"]);
  assert.deepEqual(r.descriptions, { a: "A", b: "B2", c: "C" });
});

test("lastListing is null when the session has no listing yet", () => {
  assert.equal(lastListing(JSON.stringify({ type: "user" })), null);
  assert.equal(lastListing(""), null);
});

test("summary keeps the first sentence", () => {
  assert.equal(summary("Use when X. Then Y."), "Use when X.");
  assert.equal(summary("No period here"), "No period here");
});

test("summary cuts long sentences to 120 chars plus an ellipsis", () => {
  const s = summary("x".repeat(200));
  assert.equal(s.length, 121);
  assert.ok(s.endsWith("…"));
});

test("parseFrontMatter reads name and description", () => {
  assert.deepEqual(parseFrontMatter("---\nname: brain\ndescription: Use when...\n---\nbody"),
    { name: "brain", description: "Use when..." });
  assert.equal(parseFrontMatter("# no front matter"), null);
});

test("buildTree groups by source in the fixed order", () => {
  const groups = buildTree(
    ["d2-diagrams", "superpowers:brainstorming", "anthropic-skills:pdf", "synced__X__docx", "simplify", "local-one"],
    { "superpowers:brainstorming": "Use before creative work. More." },
    {
      projectSkills: { "local-one": "/p/.claude/skills/local-one" },
      userSkills: { "d2-diagrams": "/h/.agents/skills/d2-diagrams" },
      accountSkills: { pdf: "/h/.claude/skills/synced/X/pdf" },
      plugins: { superpowers: "/h/plug/sp" },
      pluginSkills: { superpowers: { brainstorming: "/h/plug/sp/skills/brainstorming" } },
    },
  );
  assert.deepEqual(groups.map((g) => g.id), ["project", "yours", "account", "plugins", "builtin"]);
  assert.deepEqual(groups.map((g) => g.label), ["This project", "Yours", "claude.ai account", "Plugins", "Built into Claude Code"]);
  const sp = groups[3].children[0];
  assert.equal(sp.id, "plugin:superpowers");
  assert.equal(sp.path, "/h/plug/sp");
  assert.deepEqual(sp.skills[0], {
    name: "superpowers:brainstorming", display: "brainstorming", group: "plugins", plugin: "superpowers",
    description: "Use before creative work. More.", summary: "Use before creative work.",
    path: "/h/plug/sp/skills/brainstorming",
  });
  assert.deepEqual(groups[2].skills.map((s) => [s.display, s.path]), [["docx", null], ["pdf", "/h/.claude/skills/synced/X/pdf"]]);
  assert.deepEqual(groups[4].skills.map((s) => s.display), ["simplify"]);
  assert.equal(groups[0].skills[0].path, "/p/.claude/skills/local-one");
  assert.equal(countSkills(groups), 6);
});

test("buildTree omits empty groups", () => {
  const empty = { projectSkills: {}, userSkills: {}, accountSkills: {}, plugins: {} };
  assert.deepEqual(buildTree([], {}, empty), []);
  assert.deepEqual(buildTree(["simplify"], {}, empty).map((g) => g.id), ["builtin"]);
});

test("buildTree: plugin not installed gives no path", () => {
  const empty = { projectSkills: {}, userSkills: {}, accountSkills: {}, plugins: {} };
  const g = buildTree(["ghost:thing"], {}, empty);
  assert.equal(g[0].children[0].skills[0].path, null);
});

test("toggleId opens a closed group and closes an open one, without mutating", () => {
  const start = ["plugins"];
  assert.deepEqual(toggleId(start, "yours"), ["plugins", "yours"]);
  assert.deepEqual(toggleId(start, "plugins"), []);
  assert.deepEqual(start, ["plugins"]);
  assert.deepEqual(toggleId(undefined, "plugins"), ["plugins"]);
});

const cmds = (steps) => steps.map((s) => s.cmd).filter(Boolean);
const base = { cwd: "/p", claudeVersion: "2.1.325", pluginMeta: null, lock: null, gitRoot: null, linkedFrom: null };

test("skillInfo: plugin skill names the plugin, its marketplace and the plugin commands", () => {
  const i = skillInfo(
    { name: "superpowers:brainstorming", display: "brainstorming", group: "plugins", plugin: "superpowers", path: "/h/plug/sp/skills/brainstorming" },
    { ...base, pluginMeta: { key: "superpowers@claude-plugins-official", version: "7.0.2", repo: "anthropics/claude-plugins-official" } },
  );
  assert.equal(i.kind, "Plugin");
  assert.equal(i.scope, "Every session, while the plugin is enabled");
  assert.deepEqual(i.source, [
    ["Plugin", "superpowers 7.0.2"],
    ["Marketplace", "claude-plugins-official · github.com/anthropics/claude-plugins-official"],
  ]);
  assert.equal(i.path, "/h/plug/sp/skills/brainstorming");
  assert.deepEqual(cmds(i.update), ["claude plugin update superpowers@claude-plugins-official"]);
  assert.deepEqual(cmds(i.remove), [
    "claude plugin disable superpowers@claude-plugins-official",
    "claude plugin uninstall superpowers@claude-plugins-official",
  ]);
  assert.match(i.remove[0].text, /whole plugin/);
});

test("skillInfo: personal skill installed with npx skills", () => {
  const i = skillInfo(
    { name: "find-skills", display: "find-skills", group: "yours", path: "/h/.agents/skills/find-skills" },
    { ...base, lock: { source: "vercel-labs/skills" }, linkedFrom: "/h/.claude/skills/find-skills" },
  );
  assert.equal(i.kind, "Personal");
  assert.equal(i.scope, "Every session, in every project");
  assert.deepEqual(i.source, [
    ["Installed with", "npx skills, from github.com/vercel-labs/skills"],
    ["Linked from", "/h/.claude/skills/find-skills"],
  ]);
  assert.deepEqual(cmds(i.update), ["npx skills update"]);
  assert.deepEqual(cmds(i.remove), ["npx skills remove --global find-skills"]);
});

test("skillInfo: personal skill in a git repo updates with git pull there", () => {
  const i = skillInfo(
    { name: "herdr-share", display: "herdr-share", group: "yours", path: "/h/src/skills/herdr-share" },
    { ...base, gitRoot: "/h/src/skills" },
  );
  assert.deepEqual(i.source, [["Git repo", "/h/src/skills"]]);
  assert.deepEqual(cmds(i.update), ["git -C /h/src/skills pull"]);
  assert.deepEqual(cmds(i.remove), []);
  assert.match(i.remove[0].text, /Delete/);
});

test("skillInfo: hand-made personal skill has no commands, only what to edit or delete", () => {
  const i = skillInfo(
    { name: "d2-diagrams", display: "d2-diagrams", group: "yours", path: "/h/.agents/skills/d2-diagrams" },
    { ...base, linkedFrom: "/h/.claude/skills/d2-diagrams" },
  );
  assert.deepEqual(i.source, [["Made by hand", "no installer or repo found"], ["Linked from", "/h/.claude/skills/d2-diagrams"]]);
  assert.deepEqual(cmds(i.update), []);
  assert.match(i.update[0].text, /SKILL\.md/);
  assert.match(i.remove[0].text, /\/h\/\.claude\/skills\/d2-diagrams/);
});

test("skillInfo: project skill applies only in its folder and mentions committing when in git", () => {
  const i = skillInfo(
    { name: "local-one", display: "local-one", group: "project", path: "/p/.claude/skills/local-one" },
    { ...base, gitRoot: "/p" },
  );
  assert.equal(i.kind, "Project");
  assert.equal(i.scope, "Only sessions started in /p");
  assert.deepEqual(i.source, [["Git repo", "/p"]]);
  assert.match(i.update.map((s) => s.text).join(" "), /commit/i);
});

test("skillInfo: account skill is managed on claude.ai", () => {
  const i = skillInfo(
    { name: "anthropic-skills:pdf", display: "pdf", group: "account", path: "/h/.claude/skills/synced/X/pdf" },
    base,
  );
  assert.equal(i.kind, "claude.ai account");
  assert.deepEqual(i.source, [["Synced from", "your claude.ai account"]]);
  assert.match(i.update[0].text, /claude\.ai/);
  assert.match(i.remove[0].text, /claude\.ai/);
  assert.deepEqual(cmds(i.update), []);
});

test("skillInfo: built-in skill updates with Claude Code and can't be removed", () => {
  const i = skillInfo({ name: "simplify", display: "simplify", group: "builtin", path: null }, base);
  assert.equal(i.kind, "Built into Claude Code");
  assert.deepEqual(i.source, [["Claude Code", "2.1.325"]]);
  assert.deepEqual(cmds(i.update), ["claude update"]);
  assert.deepEqual(cmds(i.remove), []);
  assert.match(i.remove.map((s) => s.text).join(" "), /restart/);
});

test("pluginInfo: what the plugin says about itself, where it came from, and what it ships", () => {
  const i = pluginInfo(
    { name: "superpowers", description: "Core skills library.", version: "7.0.2", author: { name: "Jesse Vincent", email: "x@y.z" },
      license: "MIT", homepage: "https://github.com/obra/superpowers" },
    { key: "superpowers@claude-plugins-official", version: "7.0.2", repo: "anthropics/claude-plugins-official",
      gitCommitSha: "22f0b463e7a5e579904dd6211a520321035526f7", installedAt: "2026-07-04T04:00:19.998Z",
      lastUpdated: "2026-11-13T01:42:08.016Z", enabled: true, path: "/h/plug/sp" },
    { skills: 15, commands: 0, agents: 1, hooks: true, mcp: false },
  );
  assert.equal(i.name, "superpowers");
  assert.equal(i.kind, "Plugin");
  assert.equal(i.scope, "Enabled: every session gets its skills");
  assert.equal(i.description, "Core skills library.");
  assert.deepEqual(i.source, [
    ["Version", "7.0.2"],
    ["Author", "Jesse Vincent"],
    ["License", "MIT"],
    ["Homepage", "https://github.com/obra/superpowers"],
    ["Marketplace", "claude-plugins-official · github.com/anthropics/claude-plugins-official"],
    ["Commit", "22f0b46"],
    ["Installed", "2026-07-04"],
    ["Updated", "2026-11-13"],
  ]);
  assert.deepEqual(i.contents, [["Skills", "15"], ["Agents", "1"], ["Hooks", "yes"]]);
  assert.equal(i.path, "/h/plug/sp");
  assert.deepEqual(cmds(i.update), ["claude plugin update superpowers@claude-plugins-official"]);
  assert.deepEqual(cmds(i.remove), [
    "claude plugin disable superpowers@claude-plugins-official",
    "claude plugin uninstall superpowers@claude-plugins-official",
  ]);
  assert.ok(!JSON.stringify(i).includes("x@y.z"), "author email is left out");
});

test("pluginInfo: sparse manifest, string author, repository fallback, disabled", () => {
  const i = pluginInfo(
    { name: "tiny", author: "Someone", repository: { url: "https://github.com/a/tiny" } },
    { key: "tiny@m", version: null, repo: null, enabled: false, path: "/h/tiny" },
    { skills: 1, commands: 0, agents: 0, hooks: false, mcp: true },
  );
  assert.equal(i.scope, "Installed but disabled: sessions don't get its skills");
  assert.equal(i.description, "");
  assert.deepEqual(i.source, [["Author", "Someone"], ["Homepage", "https://github.com/a/tiny"], ["Marketplace", "m"]]);
  assert.deepEqual(i.contents, [["Skills", "1"], ["MCP servers", "yes"]]);
  assert.deepEqual(cmds(i.update), ["claude plugin update tiny@m", "claude plugin enable tiny@m"]);
  assert.deepEqual(cmds(i.remove), ["claude plugin uninstall tiny@m"]);
});

test("buildTree: a plugin skill's path comes from the plugin's own skill list, nested folders included", () => {
  const facts = {
    projectSkills: {}, userSkills: {}, accountSkills: {},
    plugins: { mp: "/h/mp" },
    pluginSkills: { mp: { tdd: "/h/mp/skills/engineering/tdd", review: "/h/mp/commands/review.md" } },
  };
  const g = buildTree(["mp:tdd", "mp:review", "mp:gone"], {}, facts)[0].children[0];
  assert.deepEqual(g.skills.map((s) => [s.display, s.path]),
    [["gone", null], ["review", "/h/mp/commands/review.md"], ["tdd", "/h/mp/skills/engineering/tdd"]]);
});

test("pluginSkillPaths: manifest list wins, else skills/*, plus commands/*.md", () => {
  assert.deepEqual(
    pluginSkillPaths("/h/mp", { skills: ["./skills/engineering/tdd", "skills/productivity/grill-me/"] }, ["ignored"], ["review.md", "notes.txt"]),
    { tdd: "/h/mp/skills/engineering/tdd", "grill-me": "/h/mp/skills/productivity/grill-me", review: "/h/mp/commands/review.md" },
  );
  assert.deepEqual(pluginSkillPaths("/h/sp", {}, ["brainstorming"], []), { brainstorming: "/h/sp/skills/brainstorming" });
  assert.deepEqual(pluginSkillPaths("/h/sp", null, [], []), {});
});
