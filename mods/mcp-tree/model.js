// mcp-tree's pure logic: no Herdr imports, so `node --test tests/*.test.js` runs it.
// Turns a Claude Code session's log and its MCP config into a tree of MCP servers grouped by
// where each is configured, with each server's status and tools. Secret values never leave
// here: headers, env and arguments are reduced to names or counts (see safeConfig).

// --- Shared with skill-tree (mods can't import each other, so these are copies) ---

// Claude Code keeps a session's log under ~/.claude/projects/<cwd with / and . as ->/.
export function projectDirName(cwd) {
  return cwd.replace(/[/.]/g, "-");
}

// `ps eww -o command= -p <pid>` prints the command and its environment; keep only the
// terminal id Herdr's core gives every terminal.
export function terminalIdFromPs(psOutput) {
  const m = /(?:^|\s)HC_TERMINAL_ID=(\S+)/.exec(psOutput ?? "");
  return m ? m[1] : null;
}

// One picker entry per agent, in the agents' own order. Agents with a live Claude session are
// `available`; the rest (Codex and other programs) are listed but can't show MCP servers.
export function pickerEntries(sessions, agents) {
  const byTerminal = new Map();
  for (const s of sessions) {
    if (!s.terminal) continue;
    const prev = byTerminal.get(s.terminal);
    if (!prev || (s.startedAt ?? 0) > (prev.startedAt ?? 0)) byTerminal.set(s.terminal, s);
  }
  return agents.map((a) => {
    const s = byTerminal.get(a.address);
    return {
      address: a.address, label: `${a.space_name} / ${a.tab_name}`,
      sessionId: s?.sessionId ?? null, cwd: s?.cwd ?? null, focused: !!a.focused,
      available: !!s, program: a.program ?? null,
    };
  });
}

// Which groups are open: a list of group ids, toggled without mutating the stored one.
export function toggleId(ids, id) {
  const list = Array.isArray(ids) ? ids : [];
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

// --- Session state ---

// Claude Code names an MCP tool mcp__<server>__<tool>.
export function splitTool(name) {
  const m = /^mcp__(.+?)__(.+)$/.exec(name ?? "");
  return m ? { server: m[1], tool: m[2] } : null;
}

// What a session's log says about its MCP servers right now. Claude Code logs
// deferred_tools_delta (tools added/removed, plus the current failed and pending server lists)
// and mcp_instructions_delta (servers' instructions); after a compaction it re-adds everything.
// Returns { tools: {server: [tool]}, failed: [{name, error}], pending: [name], instructions:
// {displayName: text} }, or null if the session logged none of this yet.
export function mcpState(jsonlText) {
  let seen = false;
  let tools = {};
  let instructions = {};
  let failed = [];
  let pending = [];
  for (const line of (jsonlText ?? "").split("\n")) {
    if (!/deferred_tools_delta|mcp_instructions_delta|compact_boundary/.test(line)) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o?.subtype === "compact_boundary") { tools = {}; instructions = {}; continue; }
    const a = o?.attachment;
    if (a?.type === "deferred_tools_delta") {
      seen = true;
      for (const n of a.addedNames ?? []) {
        const t = splitTool(n);
        if (!t) continue;
        const list = (tools[t.server] ??= []);
        if (!list.includes(t.tool)) list.push(t.tool);
      }
      for (const n of a.removedNames ?? []) {
        const t = splitTool(n);
        if (!t || !tools[t.server]) continue;
        tools[t.server] = tools[t.server].filter((x) => x !== t.tool);
        if (!tools[t.server].length) delete tools[t.server];
      }
      if (Array.isArray(a.failedMcpServers)) {
        failed = a.failedMcpServers.map((f) => ({ name: String(f?.name ?? ""), error: String(f?.error ?? "unknown error") }));
      }
      if (Array.isArray(a.pendingMcpServers)) {
        pending = a.pendingMcpServers.map((p) => String(typeof p === "string" ? p : p?.name ?? ""));
      }
    } else if (a?.type === "mcp_instructions_delta") {
      seen = true;
      (a.addedNames ?? []).forEach((n, i) => {
        const block = String(a.addedBlocks?.[i] ?? "");
        instructions[n] = block.replace(/^## [^\n]*\n/, "").trim();
      });
      for (const n of a.removedNames ?? []) delete instructions[n];
    }
  }
  return seen ? { tools, failed, pending, instructions } : null;
}

// --- Config, without secrets ---

function safeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return "(hidden: not a plain URL)";
  }
}

function baseName(p) {
  return String(p).split("/").filter(Boolean).pop() ?? String(p);
}

// A server's config as [label, value] rows that are safe to show and copy: header and env
// names but never their values, URLs without query or credentials, the program's name but
// only the count of its arguments (arguments often carry tokens).
export function safeConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return [];
  const rows = [];
  const type = cfg.type ?? (cfg.command ? "stdio" : cfg.url ? "http" : null);
  if (type === "stdio") rows.push(["Transport", "stdio (a program on this Mac)"]);
  else if (type) rows.push(["Transport", String(type)]);
  if (typeof cfg.url === "string") rows.push(["URL", safeUrl(cfg.url)]);
  if (typeof cfg.command === "string") rows.push(["Program", baseName(cfg.command)]);
  if (Array.isArray(cfg.args) && cfg.args.length) rows.push(["Arguments", `${cfg.args.length} (hidden)`]);
  const names = (o) => (o && typeof o === "object" ? Object.keys(o) : []);
  if (names(cfg.headers).length) rows.push(["Headers", `${names(cfg.headers).join(", ")} (value${names(cfg.headers).length > 1 ? "s" : ""} hidden)`]);
  if (names(cfg.env).length) rows.push(["Environment", `${names(cfg.env).join(", ")} (value${names(cfg.env).length > 1 ? "s" : ""} hidden)`]);
  if (Array.isArray(cfg.vars) && cfg.vars.length) rows.push(["Reads variables", cfg.vars.join(", ")]);
  return rows;
}

// Claude Code expands ${VAR} and ${VAR:-default} in MCP configs. Only the VAR name is kept.
const VAR_REF = /\$\{([A-Za-z_]\w*)(?::-[^}]*)?\}/g;

// A server config with every secret blanked, done as soon as config is read so values never
// reach the UI: header and env values become "", URLs lose credentials and query, arguments
// keep only their count. Only known, harmless fields are kept.
export function stripSecrets(cfg) {
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return null;
  const out = {};
  if (typeof cfg.type === "string") out.type = cfg.type;
  if (typeof cfg.url === "string") out.url = safeUrl(cfg.url);
  const blank = (o) => Object.fromEntries(Object.keys(o).map((k) => [k, ""]));
  if (cfg.headers && typeof cfg.headers === "object") out.headers = blank(cfg.headers);
  if (cfg.env && typeof cfg.env === "object") out.env = blank(cfg.env);
  if (typeof cfg.command === "string") out.command = cfg.command;
  if (Array.isArray(cfg.args)) out.args = cfg.args.map(() => "");
  const vars = Array.isArray(cfg.vars) ? cfg.vars.filter((v) => /^[A-Za-z_]\w*$/.test(v)) : [];
  const vals = [cfg.url, ...Object.values(cfg.headers ?? {}), ...Object.values(cfg.env ?? {}), ...(Array.isArray(cfg.args) ? cfg.args : [])];
  for (const v of vals) for (const m of String(v ?? "").matchAll(VAR_REF)) if (!vars.includes(m[1])) vars.push(m[1]);
  if (vars.length) out.vars = vars;
  return out;
}

// The servers in a .mcp.json-style object: { mcpServers: {...} } or the servers at top level.
export function serversIn(obj) {
  if (!obj || typeof obj !== "object") return {};
  const src = obj.mcpServers && typeof obj.mcpServers === "object" ? obj.mcpServers : obj;
  const out = {};
  for (const [n, c] of Object.entries(src)) {
    const s = stripSecrets(c);
    if (s && (s.url || s.command || s.type)) out[n] = s;
  }
  return out;
}

// --- Tree ---

// Claude Code turns a server name into a tool prefix by replacing anything outside
// [a-zA-Z0-9_-] with "_".
const norm = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, "_");

const LABELS = {
  project: "This project",
  local: "This project, just you",
  user: "Yours",
  connectors: "claude.ai connectors",
  plugins: "Plugins",
  other: "Other",
};

// facts: { project: {name: cfg}, local: {name: cfg}, user: {name: cfg},
//          plugins: {plugin: {server: cfg}} } — read by load.js with secret values blanked.
// state: mcpState(...) or null (Global view: no session, so no status).
// Groups in order project, local, user, connectors, plugins (with one child per plugin), other;
// empty groups are dropped. A name configured in several scopes shows once, in the scope Claude
// Code uses: local, then project, then user.
export function buildMcpTree(state, facts) {
  const tools = state?.tools ?? {};
  const failedBy = new Map((state?.failed ?? []).map((f) => [f.name, f.error]));
  const pending = new Set(state?.pending ?? []);
  const instr = state?.instructions ?? {};
  const claimed = new Set();
  const server = (name, display, group, config, toolKey, extra = {}) => {
    claimed.add(toolKey);
    const t = tools[toolKey] ?? [];
    let status;
    let error = null;
    if (!state) status = "not checked";
    else if (failedBy.has(name)) { status = "failed"; error = failedBy.get(name); }
    else if (t.length) status = "connected";
    else if (pending.has(name)) status = "connecting";
    else status = "not loaded";
    return { name, display, group, config, status, error, tools: t, instructions: instr[name] ?? instr[display] ?? instr[`claude.ai ${display}`] ?? null, ...extra };
  };
  const f = facts ?? {};
  const taken = new Set();
  const scoped = (id) => Object.entries(f[id] ?? {})
    .filter(([n]) => !taken.has(n))
    .map(([n, cfg]) => server(n, n, id, cfg, norm(n)))
    .sort((a, b) => a.display.localeCompare(b.display));
  const groups = { project: null, local: null, user: null };
  for (const id of ["local", "project", "user"]) {
    groups[id] = scoped(id);
    for (const s of groups[id]) taken.add(s.name);
  }
  const plugins = Object.entries(f.plugins ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([plugin, servers]) => ({
      id: `plugin:${plugin}`, label: plugin, children: [],
      servers: Object.entries(servers ?? {}).map(([s, cfg]) =>
        server(`plugin:${plugin}:${s}`, s, "plugins", cfg, `plugin_${norm(plugin)}_${norm(s)}`, { plugin })),
    }))
    .filter((p) => p.servers.length);
  // claude.ai connectors aren't in any local config; they show up as claude_ai_<Name> tools
  // or by display name in failures.
  const connectorNames = new Set(Object.keys(tools).filter((k) => k.startsWith("claude_ai_") && !claimed.has(k)));
  for (const fl of state?.failed ?? []) if (fl.name.startsWith("claude.ai ")) connectorNames.add(norm(fl.name));
  const connectors = [...connectorNames].sort().map((k) => {
    const display = k.slice("claude_ai_".length).replace(/_/g, " ");
    return server(failedBy.has(`claude.ai ${display}`) ? `claude.ai ${display}` : k, display, "connectors", null, k);
  });
  const other = Object.keys(tools).filter((k) => !claimed.has(k)).sort()
    .map((k) => server(k, k, "other", null, k));
  const all = [
    { id: "project", servers: groups.project },
    { id: "local", servers: groups.local },
    { id: "user", servers: groups.user },
    { id: "connectors", servers: connectors },
    { id: "plugins", servers: [], children: plugins },
    { id: "other", servers: other },
  ];
  return all
    .map((g) => ({ ...g, label: LABELS[g.id], children: g.children ?? [] }))
    .filter((g) => g.servers.length || g.children.length);
}

export function countServers(groups) {
  const out = { total: 0, connected: 0, failed: 0 };
  const walk = (gs) => {
    for (const g of gs) {
      for (const s of g.servers) {
        out.total++;
        if (s.status === "connected") out.connected++;
        if (s.status === "failed") out.failed++;
      }
      walk(g.children ?? []);
    }
  };
  walk(groups);
  return out;
}

// --- Info dialog ---

const q = (s) => (/^[\w./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, "'\\''")}'`);

const STATUS = {
  connected: "Connected",
  connecting: "Still connecting",
  "not checked": "Not checked: pick an agent to see whether it connected",
  "not loaded": "Configured, but this session didn't load it",
};

// What the info dialog says about one server. Steps are { text, cmd? }; commands are shown,
// never run. ctx: { cwd, pluginKey } (pluginKey like "github@claude-plugins-official").
export function mcpInfo(srv, ctx) {
  const step = (text, cmd) => (cmd ? { text, cmd } : { text });
  const cwd = ctx?.cwd ?? "";
  let statusText = srv.status === "failed" ? `Failed: ${srv.error ?? "unknown error"}` : STATUS[srv.status] ?? srv.status;
  if (srv.group === "project" && srv.status === "not loaded") {
    statusText = "Configured, but not loaded: project servers need your approval the first time (Claude Code asks on start, or run /mcp)";
  }
  const http = srv.config && (srv.config.url || /http|sse/.test(String(srv.config.type ?? "")));
  const fix = [];
  if (srv.status === "failed") {
    const vars = srv.config?.vars ?? [];
    if (vars.length) {
      fix.push(step(`Its config reads ${vars.map((v) => "$" + v).join(", ")} from the environment Claude Code starts in. If ${vars.length > 1 ? "one is" : "it's"} unset, that part of the config is empty, a common cause of this error. Set ${vars.length > 1 ? "them" : "it"} (for example in your shell profile) and restart the session.`));
    }
    if (http || srv.group === "plugins") fix.push(step("If it needs a sign-in, log in to it:", `claude mcp login ${srv.name}`));
    fix.push(step("Then reconnect from inside the session with /mcp, or restart the session."));
  } else if (srv.status === "not loaded") {
    fix.push(step("Restart the session, or run /mcp in it, to load it."));
  }
  const base = {
    name: srv.name,
    display: srv.display,
    statusText,
    error: srv.error ?? null,
    tools: srv.tools ?? [],
    instructions: srv.instructions ?? null,
    config: safeConfig(srv.config),
    fix,
  };
  const inDir = (cmd) => `cd ${q(cwd)} && ${cmd}`;
  switch (srv.group) {
    case "user":
      return { ...base, kind: "Yours", scope: "Every session, in every project",
        source: [["Configured in", "~/.claude.json (your user settings)"]],
        update: [step("See its full config:", `claude mcp get ${srv.name}`), step("To change it, remove it and add it again with claude mcp add -s user.")],
        remove: [step("Remove it:", `claude mcp remove ${srv.name} -s user`), step("Restart Claude Code sessions to see the change.")] };
    case "local":
      return { ...base, kind: "Local", scope: `Only sessions started in ${cwd}, and only for you`,
        source: [["Configured in", `~/.claude.json, under this project`]],
        update: [step("See its full config:", inDir(`claude mcp get ${srv.name}`)), step("To change it, remove it and add it again with claude mcp add -s local, in that folder.")],
        remove: [step("Remove it:", inDir(`claude mcp remove ${srv.name} -s local`)), step("Restart Claude Code sessions to see the change.")] };
    case "project":
      return { ...base, kind: "Project", scope: `Sessions started in ${cwd}, for everyone using it`,
        source: [["Configured in", `${cwd}/.mcp.json`]],
        update: [step("Edit .mcp.json in the project and commit it, so everyone using the repo gets the change.")],
        remove: [step("Remove it (edits .mcp.json):", inDir(`claude mcp remove ${srv.name} -s project`)), step("Commit the change to remove it for everyone.")] };
    case "plugins": {
      const key = ctx?.pluginKey ?? srv.plugin;
      return { ...base, kind: "Plugin", scope: "Every session, while the plugin is enabled",
        source: [["Plugin", key]],
        update: [step("It comes with the plugin; update the plugin to the marketplace's latest:", `claude plugin update ${key}`)],
        remove: [
          step("A plugin's server can't be removed on its own. Turn the plugin off but keep it installed:", `claude plugin disable ${key}`),
          step("Or uninstall it:", `claude plugin uninstall ${key}`),
        ] };
    }
    case "connectors":
      return { ...base, kind: "claude.ai connector", scope: "Every session signed in to your claude.ai account",
        source: [["Comes from", "your claude.ai account's connectors"]],
        update: [step("Manage it on claude.ai, in Settings → Connectors.")],
        remove: [step("Disconnect it on claude.ai, in Settings → Connectors. Restart sessions to see the change.")] };
    default:
      return { ...base, kind: "Unknown source", scope: "This session",
        source: [["Configured in", "not found in ~/.claude.json, .mcp.json or a plugin"]],
        update: [step("Ask the session: run /mcp to see where it comes from.")],
        remove: [step("Run /mcp in the session to see and manage it.")] };
  }
}
