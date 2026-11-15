// skill-tree's reads: Claude Code's session files, skill folders and plugin records on this Mac.
// Read-only. From `ps eww` output only HC_TERMINAL_ID is kept; ~/.claude/sessions/*.key is never read.
import { exec, readTextFile, home, agents, panes } from "herdr";
import { readdir, exists } from "fs/promises";
import { projectDirName, terminalIdFromPs, pickerEntries, lastListing, parseFrontMatter, buildTree, skillInfo, pluginInfo, pluginSkillPaths } from "./model.js";

const claude = () => `${home()}/.claude`;

async function list(dir) {
  try { return (await readdir(dir)).filter((n) => !n.startsWith(".")); } catch { return []; }
}

async function json(path) {
  try { return JSON.parse((await readTextFile(path)) ?? "null"); } catch { return null; }
}

// Folders under `dir` that hold a SKILL.md (links followed), as { name: realPath }.
async function skillDirs(dir, skip = []) {
  const names = [];
  for (const n of await list(dir)) {
    if (skip.includes(n)) continue;
    if (await exists(`${dir}/${n}/SKILL.md`)) names.push(n);
  }
  if (!names.length) return {};
  const r = await exec("realpath", names.map((n) => `${dir}/${n}`), { timeout: 10000 }).catch(() => null);
  const real = (r?.stdout ?? "").split("\n");
  return Object.fromEntries(names.map((n, i) => [n, real[i]?.trim() || `${dir}/${n}`]));
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
  const cwds = Object.fromEntries(panes().filter((p) => p.terminal && p.cwd).map((p) => [p.terminal, p.cwd]));
  return pickerEntries(sessions, local, cwds);
}

// A plugin folder's skills as { name: path } (plugin.json's own list, or skills/*, plus commands).
async function pluginSkillsIn(dir) {
  const manifest = await json(`${dir}/.claude-plugin/plugin.json`);
  const names = [];
  for (const n of await list(`${dir}/skills`)) if (await exists(`${dir}/skills/${n}/SKILL.md`)) names.push(n);
  return pluginSkillPaths(dir, manifest, names, await list(`${dir}/commands`));
}

export async function loadFacts(cwd) {
  const settings = await json(`${claude()}/settings.json`);
  const installed = await json(`${claude()}/plugins/installed_plugins.json`);
  const plugins = {};
  for (const [key, on] of Object.entries(settings?.enabledPlugins ?? {})) {
    const path = on && installed?.plugins?.[key]?.[0]?.installPath;
    if (path) plugins[key.split("@")[0]] = path;
  }
  const accountSkills = {};
  for (const id of await list(`${claude()}/skills/synced`)) {
    Object.assign(accountSkills, await skillDirs(`${claude()}/skills/synced/${id}`));
  }
  const pluginSkills = {};
  for (const [name, dir] of Object.entries(plugins)) pluginSkills[name] = await pluginSkillsIn(dir);
  return {
    pluginSkills,
    projectSkills: cwd ? await skillDirs(`${cwd}/.claude/skills`) : {},
    userSkills: await skillDirs(`${claude()}/skills`, ["synced"]),
    accountSkills,
    plugins,
  };
}

async function listingFor(entry) {
  const log = `${claude()}/projects/${projectDirName(entry.cwd)}/${entry.sessionId}.jsonl`;
  const r = await exec("grep", ["-F", '"skill_listing"', log], { timeout: 15000 }).catch(() => null);
  return lastListing(r?.stdout ?? "");
}

const NO_LIST = "No skill list for this session yet";

// Adds the project's .agents/skills (Codex and others read it; Claude Code doesn't) as a group
// of their own. A name already listed stays where it is.
async function addShared(cwd, names, descriptions, facts) {
  facts.sharedSkills = {};
  for (const [n, p] of Object.entries(cwd ? await skillDirs(`${cwd}/.agents/skills`) : {})) {
    if (names.includes(n)) continue;
    facts.sharedSkills[n] = p;
    names.push(n);
    descriptions[n] = await describe(p);
  }
}

export async function loadAgentTree(entry) {
  const [listing, facts] = await Promise.all([listingFor(entry), loadFacts(entry.cwd)]);
  const names = [...(listing?.names ?? [])];
  const descriptions = { ...listing?.descriptions };
  await addShared(entry.cwd, names, descriptions, facts);
  if (!listing && !names.length) return { groups: [], error: NO_LIST };
  return { groups: buildTree(names, descriptions, facts), error: null };
}

// An agent that isn't Claude Code (Codex, ...): the shared folders it can read, the project's
// .agents/skills first, then the personal ~/.agents/skills. An inventory, not what it loaded.
export async function loadFolderTree(entry) {
  const facts = { pluginSkills: {}, projectSkills: {}, userSkills: {}, accountSkills: {}, plugins: {} };
  const names = [];
  const descriptions = {};
  await addShared(entry.cwd, names, descriptions, facts);
  for (const [n, p] of Object.entries(await skillDirs(`${home()}/.agents/skills`))) {
    if (names.includes(n)) continue;
    facts.userSkills[n] = p;
    names.push(n);
    descriptions[n] = await describe(p);
  }
  return { groups: buildTree(names, descriptions, facts), error: names.length ? null : "No skills in this agent's .agents/skills folders" };
}

// A skill folder's SKILL.md, or a plugin command's own .md file.
async function describe(path) {
  const file = path.endsWith(".md") ? path : `${path}/SKILL.md`;
  try { return parseFrontMatter((await readTextFile(file)) ?? "")?.description ?? ""; } catch { return ""; }
}

// Installed Claude and shared personal skills, plus the built-ins one agent reports.
export async function loadGlobalTree(builtinFrom) {
  const facts = await loadFacts(null);
  // Global is an inventory, not a claim that every agent has loaded these skills.
  // Prefer Claude's copy on name collisions and follow shared-folder symlinks.
  facts.userSkills = { ...await skillDirs(`${home()}/.agents/skills`), ...facts.userSkills };
  const names = [];
  const descriptions = {};
  const add = async (name, path) => { names.push(name); descriptions[name] = await describe(path); };
  for (const [n, p] of Object.entries(facts.userSkills)) await add(n, p);
  for (const [n, p] of Object.entries(facts.accountSkills)) await add(`anthropic-skills:${n}`, p);
  for (const [plugin, skills] of Object.entries(facts.pluginSkills)) {
    for (const [n, p] of Object.entries(skills)) await add(`${plugin}:${n}`, p);
  }
  const listing = builtinFrom ? await listingFor(builtinFrom) : null;
  if (listing) {
    const builtin = buildTree(listing.names, listing.descriptions, { ...facts, projectSkills: {} })
      .find((g) => g.id === "builtin");
    for (const s of builtin?.skills ?? []) {
      if (!names.includes(s.name)) { names.push(s.name); descriptions[s.name] = s.description; }
    }
  }
  return { groups: buildTree(names, descriptions, facts), error: null };
}

async function gitRoot(dir) {
  if (!dir) return null;
  const r = await exec("git", ["-C", dir, "rev-parse", "--show-toplevel"], { timeout: 5000 }).catch(() => null);
  return r?.code === 0 ? r.stdout.trim() || null : null;
}

// Claude Code's installer links ~/.local/bin/claude to versions/<version>.
async function claudeVersion() {
  const r = await exec("realpath", [`${home()}/.local/bin/claude`], { timeout: 5000 }).catch(() => null);
  const v = /\/versions\/([^/\s]+)\s*$/.exec(r?.stdout ?? "");
  return v ? v[1] : null;
}

async function pluginMeta(plugin) {
  if (!plugin) return null;
  const settings = await json(`${claude()}/settings.json`);
  const installed = await json(`${claude()}/plugins/installed_plugins.json`);
  const key = Object.keys(settings?.enabledPlugins ?? {}).find((k) => k.split("@")[0] === plugin && settings.enabledPlugins[k])
    ?? Object.keys(installed?.plugins ?? {}).find((k) => k.split("@")[0] === plugin);
  if (!key) return null;
  const markets = await json(`${claude()}/plugins/known_marketplaces.json`);
  const src = markets?.[key.split("@")[1]]?.source;
  const rec = installed?.plugins?.[key]?.[0] ?? {};
  return {
    key, version: rec.version ?? null, repo: src?.repo ?? null, gitCommitSha: rec.gitCommitSha ?? null,
    installedAt: rec.installedAt ?? null, lastUpdated: rec.lastUpdated ?? null,
    enabled: !!settings?.enabledPlugins?.[key], path: rec.installPath ?? null,
  };
}

async function count(dir, test) {
  let n = 0;
  for (const name of await list(dir)) if (await test(`${dir}/${name}`, name)) n++;
  return n;
}

// The plugin info dialog: its plugin.json, install record, and what its folder ships.
export async function loadPluginInfo(plugin) {
  const meta = await pluginMeta(plugin);
  const dir = meta?.path;
  const manifest = dir ? await json(`${dir}/.claude-plugin/plugin.json`) : null;
  const counts = dir ? {
    skills: Object.values(await pluginSkillsIn(dir)).filter((p) => !p.endsWith(".md")).length,
    commands: await count(`${dir}/commands`, async (_p, n) => n.endsWith(".md")),
    agents: await count(`${dir}/agents`, async (_p, n) => n.endsWith(".md")),
    hooks: !!manifest?.hooks || await exists(`${dir}/hooks/hooks.json`),
    mcp: !!manifest?.mcpServers || await exists(`${dir}/.mcp.json`),
  } : null;
  return pluginInfo(manifest ?? { name: plugin }, meta ?? { key: plugin }, counts);
}

// Everything the info dialog shows for one skill, read from disk; the description is the
// skill's own (SKILL.md front matter), falling back to the text in the session's skill list.
export async function loadInfo(skill, cwd) {
  const ctx = { cwd, claudeVersion: null, pluginMeta: null, lock: null, gitRoot: null, linkedFrom: null };
  if (skill.group === "plugins") ctx.pluginMeta = await pluginMeta(skill.plugin);
  if (skill.group === "builtin") ctx.claudeVersion = await claudeVersion();
  if (skill.group === "project" || skill.group === "shared") ctx.gitRoot = await gitRoot(cwd);
  if (skill.group === "yours") {
    const claudeLink = `${claude()}/skills/${skill.display}`;
    const sharedLink = `${home()}/.agents/skills/${skill.display}`;
    const inClaude = await exists(`${claudeLink}/SKILL.md`);
    const link = inClaude ? claudeLink : await exists(`${sharedLink}/SKILL.md`) ? sharedLink : null;
    ctx.sharedOnly = !inClaude && !!link;
    if (link && skill.path && skill.path !== link) ctx.linkedFrom = link;
    const lock = (await json(`${home()}/.agents/.skill-lock.json`))?.skills?.[skill.display];
    if (lock && skill.path?.endsWith(`/.agents/skills/${skill.display}`)) ctx.lock = lock;
    else ctx.gitRoot = await gitRoot(skill.path);
  }
  const description = (skill.path ? await describe(skill.path) : "") || skill.description || "";
  return { ...skillInfo(skill, ctx), name: skill.display, description };
}

export async function copy(text) {
  await exec("sh", ["-c", 'printf %s "$1" | pbcopy', "copy", text], { timeout: 5000 }).catch(() => null);
}

export async function reveal(path) {
  await exec("open", ["-R", path], { timeout: 5000 }).catch(() => null);
}
