// Pure-logic tests for mcp-tree. Run: node --test mods/mcp-tree/tests/*.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitTool, mcpState, safeConfig, stripSecrets, serversIn, buildMcpTree, countServers, mcpInfo,
} from "../model.js";

const delta = (o) => JSON.stringify({ type: "attachment", attachment: { type: "deferred_tools_delta", ...o } });
const instr = (o) => JSON.stringify({ type: "attachment", attachment: { type: "mcp_instructions_delta", ...o } });

test("splitTool reads mcp__<server>__<tool> and ignores other tools", () => {
  assert.deepEqual(splitTool("mcp__claude_ai_Gmail__search_threads"), { server: "claude_ai_Gmail", tool: "search_threads" });
  assert.deepEqual(splitTool("mcp__plugin_context7_context7__resolve-library-id"), { server: "plugin_context7_context7", tool: "resolve-library-id" });
  assert.equal(splitTool("WebFetch"), null);
});

test("mcpState adds and removes tools across deltas, keeps the last failure list, and reads instructions", () => {
  const text = [
    delta({ addedNames: ["WebFetch", "mcp__a__one", "mcp__a__two", "mcp__b__x"], removedNames: [],
      failedMcpServers: [{ name: "plugin:github:github", errorCode: "400", error: "bad header" }], pendingMcpServers: [] }),
    instr({ addedNames: ["claude.ai Docs"], addedBlocks: ["## claude.ai Docs\nUse it for docs."], removedNames: [] }),
    "{not json",
    delta({ addedNames: ["mcp__c__y"], removedNames: ["mcp__b__x"] }),
  ].join("\n");
  const s = mcpState(text);
  assert.deepEqual(s.tools, { a: ["one", "two"], c: ["y"] });
  assert.deepEqual(s.failed, [{ name: "plugin:github:github", error: "bad header" }]);
  assert.deepEqual(s.pending, []);
  assert.deepEqual(s.instructions, { "claude.ai Docs": "Use it for docs." });
});

test("mcpState is null when the session logged no MCP state yet", () => {
  assert.equal(mcpState(JSON.stringify({ type: "user" })), null);
});

test("safeConfig never shows header or env values, URL queries, or program arguments", () => {
  const http = safeConfig({ type: "http", url: "https://mcp.example.com/v1?key=SECRET123", headers: { Authorization: "Bearer SECRET456" } });
  assert.deepEqual(http, [["Transport", "http"], ["URL", "https://mcp.example.com/v1"], ["Headers", "Authorization (value hidden)"]]);
  const stdio = safeConfig({ command: "/usr/local/bin/uvx", args: ["modeler-mcp", "--token", "SECRET789"], env: { API_KEY: "SECRET000", DEBUG: "1" } });
  assert.deepEqual(stdio, [["Transport", "stdio (a program on this Mac)"], ["Program", "uvx"], ["Arguments", "3 (hidden)"], ["Environment", "API_KEY, DEBUG (values hidden)"]]);
  assert.ok(!JSON.stringify([http, stdio]).includes("SECRET"));
  assert.deepEqual(safeConfig({ type: "http", url: "not a url" }), [["Transport", "http"], ["URL", "(hidden: not a plain URL)"]]);
});

const facts = {
  project: { shared: { command: "npx" } },
  local: { modeler: { command: "uvx" } },
  user: { "notes": { type: "http", url: "http://localhost:7777/mcp" } },
  plugins: { context7: { context7: { type: "http", url: "https://mcp.context7.com/mcp" } }, github: { github: { type: "http" } } },
};

test("buildMcpTree groups servers by where they're configured, with status and tools", () => {
  const state = {
    tools: { "notes": ["open_file"], plugin_context7_context7: ["resolve-library-id", "query-docs"], claude_ai_Google_Drive: ["search"], modeler: ["get_scene"] },
    failed: [{ name: "plugin:github:github", error: "bad header" }],
    pending: [],
    instructions: { "claude.ai Google Drive": "Drive help." },
  };
  const groups = buildMcpTree(state, facts);
  assert.deepEqual(groups.map((g) => g.id), ["project", "local", "user", "connectors", "plugins"]);
  assert.deepEqual(groups.map((g) => g.label), ["This project", "This project, just you", "Yours", "claude.ai connectors", "Plugins"]);
  const [project, local, user, connectors, plugins] = groups;
  assert.deepEqual(project.servers.map((s) => [s.display, s.status]), [["shared", "not loaded"]]);
  assert.deepEqual(local.servers.map((s) => [s.display, s.status, s.tools]), [["modeler", "connected", ["get_scene"]]]);
  assert.deepEqual(user.servers.map((s) => [s.display, s.status]), [["notes", "connected"]]);
  assert.deepEqual(connectors.servers.map((s) => [s.display, s.instructions]), [["Google Drive", "Drive help."]]);
  assert.deepEqual(plugins.children.map((p) => p.label), ["context7", "github"]);
  assert.deepEqual(plugins.children.map((p) => p.children), [[], []]);
  assert.deepEqual(plugins.children[1].servers.map((s) => [s.display, s.status, s.error]), [["github", "failed", "bad header"]]);
  assert.equal(plugins.children[0].servers[0].tools.length, 2);
  assert.deepEqual(countServers(groups), { total: 6, connected: 4, failed: 1 });
});

test("buildMcpTree: local beats project beats user for the same name; unknown servers go to Other", () => {
  const f = { project: { dup: {} }, local: { dup: {} }, user: { dup: {} }, plugins: {} };
  const g = buildMcpTree({ tools: { dup: ["t"], mystery: ["m"] }, failed: [], pending: [], instructions: {} }, f);
  assert.deepEqual(g.map((x) => [x.id, x.servers.map((s) => s.display)]), [["local", ["dup"]], ["other", ["mystery"]]]);
});

test("buildMcpTree without a session (Global) lists configured servers as not checked", () => {
  const g = buildMcpTree(null, { project: {}, local: {}, user: { u: {} }, plugins: { p: { s: {} } } });
  assert.deepEqual(g.map((x) => x.id), ["user", "plugins"]);
  assert.equal(g[0].servers[0].status, "not checked");
});

const cmds = (steps) => steps.map((s) => s.cmd).filter(Boolean);

test("mcpInfo: user server — config without secrets, claude mcp commands with -s user", () => {
  const i = mcpInfo({ name: "notes", display: "notes", group: "user", status: "connected", tools: ["open_file"], config: { type: "http", url: "http://localhost:7777/mcp", headers: { Authorization: "Bearer S" } } }, { cwd: "/p" });
  assert.equal(i.kind, "Yours");
  assert.equal(i.scope, "Every session, in every project");
  assert.deepEqual(i.config.find((r) => r[0] === "Headers"), ["Headers", "Authorization (value hidden)"]);
  assert.deepEqual(cmds(i.update), ["claude mcp get notes"]);
  assert.deepEqual(cmds(i.remove), ["claude mcp remove notes -s user"]);
  assert.ok(!JSON.stringify(i).includes("Bearer S"));
});

test("mcpInfo: local server commands run in its project folder", () => {
  const i = mcpInfo({ name: "modeler", display: "modeler", group: "local", status: "connected", tools: [], config: { command: "uvx" } }, { cwd: "/p/x y" });
  assert.equal(i.scope, "Only sessions started in /p/x y, and only for you");
  assert.deepEqual(cmds(i.remove), ["cd '/p/x y' && claude mcp remove modeler -s local"]);
});

test("mcpInfo: project server is shared through .mcp.json", () => {
  const i = mcpInfo({ name: "shared", display: "shared", group: "project", status: "not loaded", tools: [], config: {} }, { cwd: "/p" });
  assert.match(i.update.map((s) => s.text).join(" "), /\.mcp\.json/);
  assert.match(i.statusText, /approve|not loaded/i);
});

test("mcpInfo: failed plugin server explains the error and points at the plugin", () => {
  const i = mcpInfo({ name: "plugin:github:github", display: "github", group: "plugins", plugin: "github", status: "failed", error: "bad header", tools: [], config: { type: "http" } }, { cwd: "/p", pluginKey: "github@claude-plugins-official" });
  assert.equal(i.kind, "Plugin");
  assert.equal(i.statusText, "Failed: bad header");
  assert.deepEqual(cmds(i.fix), ["claude mcp login plugin:github:github"]);
  assert.deepEqual(cmds(i.remove), ["claude plugin disable github@claude-plugins-official", "claude plugin uninstall github@claude-plugins-official"]);
});

test("mcpInfo: claude.ai connector is managed on claude.ai", () => {
  const i = mcpInfo({ name: "claude_ai_Gmail", display: "Gmail", group: "connectors", status: "connected", tools: ["a"], config: null }, { cwd: "/p" });
  assert.equal(i.kind, "claude.ai connector");
  assert.match(i.remove[0].text, /claude\.ai/);
  assert.deepEqual(i.config, []);
});

test("mcpState starts over at a compaction boundary, since Claude Code re-adds every tool after it", () => {
  const text = [
    delta({ addedNames: ["mcp__old__t"], removedNames: [], failedMcpServers: [] }),
    instr({ addedNames: ["Old"], addedBlocks: ["## Old\nx"], removedNames: [] }),
    JSON.stringify({ type: "system", subtype: "compact_boundary" }),
    delta({ addedNames: ["mcp__new__t"], removedNames: [] }),
  ].join("\n");
  const s = mcpState(text);
  assert.deepEqual(s.tools, { new: ["t"] });
  assert.deepEqual(s.instructions, {});
  assert.deepEqual(s.failed, []);
});

test("stripSecrets blanks header and env values, drops URL queries and keeps only argument count", () => {
  const out = stripSecrets({ type: "http", url: "https://u:SECRETpw@x.com/y?k=SECRET1", headers: { A: "SECRET2" },
    env: { B: "SECRET3" }, command: "/bin/x", args: ["SECRET4", "b"], oauth: { clientSecret: "SECRET5" } });
  assert.ok(!JSON.stringify(out).includes("SECRET"));
  assert.deepEqual(out, { type: "http", url: "https://x.com/y", headers: { A: "" }, env: { B: "" }, command: "/bin/x", args: ["", ""] });
  assert.equal(stripSecrets("x"), null);
});

test("serversIn reads both .mcp.json shapes: wrapped in mcpServers, or flat", () => {
  assert.deepEqual(Object.keys(serversIn({ mcpServers: { a: { url: "https://a" } } })), ["a"]);
  assert.deepEqual(Object.keys(serversIn({ b: { command: "x" }, junk: 3 })), ["b"]);
  assert.deepEqual(serversIn(null), {});
});

test("stripSecrets keeps the names of ${VAR} references (names aren't secrets) and nothing else", () => {
  const out = stripSecrets({ type: "http", url: "https://x/${HOST_PATH}", headers: { Authorization: "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}" },
    args: ["--k", "${API_KEY:-SECRETdefault}"], env: { A: "SECRETlit" } });
  assert.deepEqual(out.vars, ["HOST_PATH", "GITHUB_PERSONAL_ACCESS_TOKEN", "API_KEY"]);
  assert.ok(!JSON.stringify(out).includes("SECRET"));
  assert.deepEqual(safeConfig(out).find((r) => r[0] === "Reads variables"), ["Reads variables", "HOST_PATH, GITHUB_PERSONAL_ACCESS_TOKEN, API_KEY"]);
});

test("mcpInfo: a failed server that reads variables says to set them before suggesting login", () => {
  const i = mcpInfo({ name: "plugin:github:github", display: "github", group: "plugins", plugin: "github", status: "failed", error: "Authorization header is badly formatted", tools: [],
    config: { type: "http", headers: { Authorization: "" }, vars: ["GITHUB_PERSONAL_ACCESS_TOKEN"] } }, { cwd: "/p", pluginKey: "github@m" });
  assert.match(i.fix[0].text, /GITHUB_PERSONAL_ACCESS_TOKEN/);
  assert.match(i.fix[0].text, /environment/);
});
