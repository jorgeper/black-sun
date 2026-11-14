// mcp-tree's reads: Claude Code's session files and MCP configs on this Mac. Read-only.
// Secret values never enter this mod: ~/.claude.json goes through a Python filter that keeps
// only MCP server entries with header/env values blanked, URLs without credentials or query,
// and arguments reduced to a count; other configs go through stripSecrets on read.
// From `ps eww` output only HC_TERMINAL_ID is kept; ~/.claude/sessions/*.key is never read.
import { exec, readTextFile, home, agents } from "herdr";
import { readdir } from "fs/promises";
import { projectDirName, terminalIdFromPs, pickerEntries, mcpState, buildMcpTree, mcpInfo, serversIn } from "./model.js";

const claude = () => `${home()}/.claude`;

async function list(dir) {
  try { return (await readdir(dir)).filter((n) => !n.startsWith(".")); } catch { return []; }
}

async function json(path) {
  try { return JSON.parse((await readTextFile(path)) ?? "null"); } catch { return null; }
}

// Running Claude sessions matched to Herdr's agents on this computer.
export async function loadEntries() {
  const dir = `${claude()}/sessions`;
  const files = (await list(dir)).filter((n) => /^\d+\.json$/.test(n));
  const sessions = (await Promise.all(files.map(async (f) => {
    const s = await json(`${dir}/${f}`);
    if (!s?.pid || !s.sessionId || !s.cwd) return null;
    const ps = await exec("ps", ["eww", "-o", "command=", "-p", String(s.pid)], { timeout: 5000 }).catch(() => null);
    const terminal = terminalIdFromPs(ps?.stdout ?? "");
    return terminal ? { pid: s.pid, sessionId: s.sessionId, cwd: s.cwd, startedAt: s.startedAt ?? 0, terminal } : null;
  }))).filter(Boolean);
  const local = agents().filter((a) => !a.address.includes("/"));
  return pickerEntries(sessions, local);
}

// Prints {"user": {...}, "local": {...}} from ~/.claude.json: the top-level mcpServers and the
// given project's, each value reduced as described above.
export const FILTER = String.raw`
import json, re, sys
from urllib.parse import urlsplit
def url(u):
    try:
        p = urlsplit(u)
        return f"{p.scheme}://{p.hostname or ''}{':' + str(p.port) if p.port else ''}{p.path}"
    except Exception:
        return ""
def server(c):
    if not isinstance(c, dict): return None
    o = {}
    if isinstance(c.get("type"), str): o["type"] = c["type"]
    if isinstance(c.get("url"), str): o["url"] = url(c["url"])
    if isinstance(c.get("command"), str): o["command"] = c["command"]
    if isinstance(c.get("args"), list): o["args"] = [""] * len(c["args"])
    for k in ("headers", "env"):
        if isinstance(c.get(k), dict): o[k] = {n: "" for n in c[k]}
    vals = [c.get("url")] + list((c.get("headers") or {}).values()) + list((c.get("env") or {}).values()) + list(c.get("args") or [])
    refs = []
    for v in vals:
        for n in re.findall(r"\$\{([A-Za-z_]\w*)(?::-[^}]*)?\}", str(v or "")):
            if n not in refs: refs.append(n)
    if refs: o["vars"] = refs
    return o
def servers(d):
    d = d if isinstance(d, dict) else {}
    return {n: s for n, s in ((n, server(c)) for n, c in d.items()) if s is not None}
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    d = {}
proj = (d.get("projects") or {}).get(sys.argv[2]) or {} if len(sys.argv) > 2 else {}
print(json.dumps({"user": servers(d.get("mcpServers")), "local": servers(proj.get("mcpServers"))}))
`;

async function claudeJson(cwd) {
  const args = ["-I", "-c", FILTER, `${home()}/.claude.json`, ...(cwd ? [cwd] : [])];
  const r = await exec("/usr/bin/python3", args, { timeout: 10000 }).catch(() => null);
  try {
    const d = JSON.parse(r?.stdout ?? "{}");
    return { user: serversIn({ mcpServers: d.user ?? {} }), local: serversIn({ mcpServers: d.local ?? {} }) };
  } catch {
    return { user: {}, local: {} };
  }
}

// Enabled plugins: { name: { key, path } }.
async function enabledPlugins() {
  const settings = await json(`${claude()}/settings.json`);
  const installed = await json(`${claude()}/plugins/installed_plugins.json`);
  const out = {};
  for (const [key, on] of Object.entries(settings?.enabledPlugins ?? {})) {
    const path = on && installed?.plugins?.[key]?.[0]?.installPath;
    if (path) out[key.split("@")[0]] = { key, path };
  }
  return out;
}

// A plugin's MCP servers: its .mcp.json, or mcpServers inside its plugin.json.
async function pluginServers(dir) {
  const fromFile = serversIn(await json(`${dir}/.mcp.json`));
  if (Object.keys(fromFile).length) return fromFile;
  const inline = (await json(`${dir}/.claude-plugin/plugin.json`))?.mcpServers;
  return inline && typeof inline === "object" ? serversIn({ mcpServers: inline }) : {};
}

export async function loadFacts(cwd) {
  const [cj, plugs, project] = await Promise.all([
    claudeJson(cwd),
    enabledPlugins(),
    cwd ? json(`${cwd}/.mcp.json`) : null,
  ]);
  const plugins = {};
  const pluginKeys = {};
  for (const [name, p] of Object.entries(plugs)) {
    plugins[name] = await pluginServers(p.path);
    pluginKeys[name] = p.key;
  }
  return { project: serversIn(project), local: cj.local, user: cj.user, plugins, pluginKeys };
}

// Only the MCP lines of the session log (a few small records), via grep.
async function stateFor(entry) {
  const log = `${claude()}/projects/${projectDirName(entry.cwd)}/${entry.sessionId}.jsonl`;
  const r = await exec("grep", ["-E", '"(deferred_tools_delta|mcp_instructions_delta|compact_boundary)"', log], { timeout: 15000 }).catch(() => null);
  return mcpState(r?.stdout ?? "");
}

const NO_STATE = "This session hasn't reported its MCP servers yet";

export async function loadAgentTree(entry) {
  const [state, facts] = await Promise.all([stateFor(entry), loadFacts(entry.cwd)]);
  return { groups: buildMcpTree(state, facts), pluginKeys: facts.pluginKeys, error: state ? null : NO_STATE };
}

// Servers every new session gets outside a project: yours and plugins'. No session, so no status.
export async function loadGlobalTree() {
  const facts = await loadFacts(null);
  return { groups: buildMcpTree(null, facts), pluginKeys: facts.pluginKeys, error: null };
}

export function info(server, cwd, pluginKeys) {
  return mcpInfo(server, { cwd, pluginKey: server.plugin ? pluginKeys?.[server.plugin] : null });
}

export async function copy(text) {
  await exec("sh", ["-c", 'printf %s "$1" | pbcopy', "copy", text], { timeout: 5000 }).catch(() => null);
}

