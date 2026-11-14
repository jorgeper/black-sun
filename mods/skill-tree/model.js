// skill-tree's pure logic: no Herdr imports, so `node --test tests/*.test.js` runs it.
// Turns Claude Code's session files and skill listings into a tree grouped by where each
// skill comes from.

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
// `available`; the rest (Codex and other programs) are listed but can't show skills.
export function pickerEntries(sessions, agents) {
  const byTerminal = new Map();
  for (const s of sessions) {
    if (!s.terminal) continue;
    const prev = byTerminal.get(s.terminal);
    if (!prev || (s.startedAt ?? 0) > (prev.startedAt ?? 0)) byTerminal.set(s.terminal, s);
  }
  const out = [];
  for (const a of agents) {
    const s = byTerminal.get(a.address);
    out.push({
      address: a.address, label: `${a.space_name} / ${a.tab_name}`,
      sessionId: s?.sessionId ?? null, cwd: s?.cwd ?? null, focused: !!a.focused,
      available: !!s, program: a.program ?? null,
    });
  }
  return out;
}

function parseContent(content) {
  const descriptions = {};
  for (const l of String(content ?? "").split("\n")) {
    const m = /^- (\S+?): (.*)$/.exec(l);
    if (m) descriptions[m[1]] = m[2].trim();
  }
  return descriptions;
}

// The skills a session currently has. Claude Code logs a full listing (isInitial) at start and
// later partial ones when skills change; the current list is the last full listing plus every
// partial one after it. Removals are never logged.
export function lastListing(jsonlText) {
  let names = null;
  let descriptions = {};
  for (const line of (jsonlText ?? "").split("\n")) {
    if (!line.includes("skill_listing")) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const a = o?.attachment;
    if (a?.type !== "skill_listing") continue;
    const desc = parseContent(a.content);
    const these = Array.isArray(a.names) ? a.names : Object.keys(desc);
    if (a.isInitial !== false || names === null) { names = []; descriptions = {}; }
    for (const n of these) if (!names.includes(n)) names.push(n);
    Object.assign(descriptions, desc);
  }
  return names === null ? null : { names, descriptions };
}

const MAX = 120;
export function summary(desc) {
  const d = String(desc ?? "").trim();
  const i = d.indexOf(". ");
  const first = i >= 0 ? d.slice(0, i + 1) : d;
  return first.length > MAX ? first.slice(0, MAX) + "…" : first;
}

export function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? "");
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(name|description):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return out.name || out.description ? { name: out.name ?? null, description: out.description ?? "" } : null;
}

// Where a plugin's skills live, as { name: path }. A plugin.json `skills` list (paths that may be
// nested, e.g. ./skills/engineering/tdd) wins over the default skills/<name>; commands/<name>.md
// are listed too, since Claude Code offers commands as skills. skillDirNames: folders under
// skills/ that hold a SKILL.md; commandFiles: file names under commands/.
export function pluginSkillPaths(dir, manifest, skillDirNames, commandFiles) {
  const out = {};
  const listed = Array.isArray(manifest?.skills) ? manifest.skills : null;
  if (listed) {
    for (const rel of listed) {
      const clean = String(rel).replace(/^\.\//, "").replace(/\/+$/, "");
      out[clean.split("/").pop()] = `${dir}/${clean}`;
    }
  } else {
    for (const n of skillDirNames ?? []) out[n] = `${dir}/skills/${n}`;
  }
  for (const f of commandFiles ?? []) {
    if (f.endsWith(".md") && !(f.slice(0, -3) in out)) out[f.slice(0, -3)] = `${dir}/commands/${f}`;
  }
  return out;
}

const ORDER = [
  ["project", "This project"],
  ["yours", "Yours"],
  ["account", "claude.ai account"],
  ["plugins", "Plugins"],
  ["builtin", "Built into Claude Code"],
];

function classify(name, facts) {
  let m = /^synced__.+?__(.+)$/.exec(name);
  if (m) return { group: "account", display: m[1], path: facts.accountSkills[m[1]] ?? null };
  m = /^anthropic-skills:(.+)$/.exec(name);
  if (m) return { group: "account", display: m[1], path: facts.accountSkills[m[1]] ?? null };
  m = /^([^:]+):(.+)$/.exec(name);
  if (m) {
    return { group: "plugins", plugin: m[1], display: m[2], path: facts.pluginSkills?.[m[1]]?.[m[2]] ?? null };
  }
  if (facts.projectSkills[name]) return { group: "project", display: name, path: facts.projectSkills[name] };
  if (facts.userSkills[name]) return { group: "yours", display: name, path: facts.userSkills[name] };
  return { group: "builtin", display: name, path: null };
}

const byDisplay = (a, b) => a.display.localeCompare(b.display);

export function buildTree(names, descriptions, facts) {
  const groups = Object.fromEntries(ORDER.map(([id, label]) => [id, { id, label, path: null, skills: [], children: [] }]));
  const plugins = new Map();
  for (const name of names) {
    const c = classify(name, facts);
    const description = descriptions[name] ?? "";
    const skill = { name, display: c.display, group: c.group, ...(c.plugin ? { plugin: c.plugin } : {}), description, summary: summary(description), path: c.path };
    if (c.group === "plugins") {
      if (!plugins.has(c.plugin)) {
        plugins.set(c.plugin, { id: `plugin:${c.plugin}`, label: c.plugin, path: facts.plugins[c.plugin] ?? null, skills: [], children: [] });
      }
      plugins.get(c.plugin).skills.push(skill);
    } else {
      groups[c.group].skills.push(skill);
    }
  }
  groups.plugins.children = [...plugins.values()].sort((a, b) => a.label.localeCompare(b.label));
  for (const g of [...Object.values(groups), ...groups.plugins.children]) g.skills.sort(byDisplay);
  return ORDER.map(([id]) => groups[id]).filter((g) => g.skills.length || g.children.length);
}

export function countSkills(groups) {
  return groups.reduce((n, g) => n + g.skills.length + countSkills(g.children ?? []), 0);
}

// Which groups are open: a list of group ids, toggled without mutating the stored one.
export function toggleId(ids, id) {
  const list = Array.isArray(ids) ? ids : [];
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function marketRow(m) {
  const market = m?.key?.split("@")[1];
  return market ? [["Marketplace", m.repo ? `${market} · github.com/${m.repo}` : market]] : [];
}

// What the info dialog says about a whole plugin: its own plugin.json (author's name only, never
// an email), the install record, and what its folder ships. counts: { skills, commands, agents,
// hooks, mcp }. meta: { key, version, repo, gitCommitSha, installedAt, lastUpdated, enabled, path }.
export function pluginInfo(manifest, meta, counts) {
  const step = (text, cmd) => (cmd ? { text, cmd } : { text });
  const m = manifest ?? {};
  const key = meta?.key ?? m.name;
  const author = typeof m.author === "string" ? m.author : m.author?.name;
  const repoUrl = typeof m.repository === "string" ? m.repository : m.repository?.url;
  const day = (iso) => (iso ? String(iso).slice(0, 10) : null);
  const row = (k, v) => (v ? [[k, String(v)]] : []);
  const enabled = meta?.enabled !== false;
  return {
    name: m.name ?? key?.split("@")[0],
    kind: "Plugin",
    scope: enabled ? "Enabled: every session gets its skills" : "Installed but disabled: sessions don't get its skills",
    description: m.description ?? "",
    source: [
      ...row("Version", m.version ?? meta?.version),
      ...row("Author", author),
      ...row("License", m.license),
      ...row("Homepage", m.homepage ?? repoUrl),
      ...marketRow(meta),
      ...row("Commit", meta?.gitCommitSha?.slice(0, 7)),
      ...row("Installed", day(meta?.installedAt)),
      ...row("Updated", day(meta?.lastUpdated)),
    ],
    contents: [
      ...(counts?.skills ? [["Skills", String(counts.skills)]] : []),
      ...(counts?.commands ? [["Commands", String(counts.commands)]] : []),
      ...(counts?.agents ? [["Agents", String(counts.agents)]] : []),
      ...(counts?.hooks ? [["Hooks", "yes"]] : []),
      ...(counts?.mcp ? [["MCP servers", "yes"]] : []),
    ],
    path: meta?.path ?? null,
    update: [
      step("Update it to the marketplace's latest:", `claude plugin update ${key}`),
      ...(enabled ? [] : [step("Turn it back on:", `claude plugin enable ${key}`)]),
    ],
    remove: [
      ...(enabled ? [step("Turn it off but keep it installed:", `claude plugin disable ${key}`)] : []),
      step(enabled ? "Or uninstall it:" : "Uninstall it:", `claude plugin uninstall ${key}`),
      step("Restart Claude Code sessions to see the change."),
    ],
  };
}

// What the info dialog says about one skill: its kind, where it applies, where it came from, and
// how to update or remove it. Steps are { text, cmd? }; commands are shown, never run.
// ctx: { cwd, claudeVersion, pluginMeta: { key, version, repo } | null, lock: { source } | null,
//        gitRoot, linkedFrom } — all read from disk by load.js, nothing generated.
export function skillInfo(skill, ctx) {
  const step = (text, cmd) => (cmd ? { text, cmd } : { text });
  const linked = ctx.linkedFrom ? [["Linked from", ctx.linkedFrom]] : [];
  switch (skill.group) {
    case "plugins": {
      const m = ctx.pluginMeta;
      const key = m?.key ?? skill.plugin;
      return {
        kind: "Plugin",
        scope: "Every session, while the plugin is enabled",
        source: [
          ["Plugin", m?.version ? `${skill.plugin} ${m.version}` : skill.plugin],
          ...marketRow(m),
        ],
        path: skill.path,
        update: [step("Update the plugin (all its skills) to the marketplace's latest:", `claude plugin update ${key}`)],
        remove: [
          step("A plugin skill can't be removed on its own, only with the whole plugin. Turn it off but keep it installed:", `claude plugin disable ${key}`),
          step("Or uninstall it:", `claude plugin uninstall ${key}`),
          step("Restart Claude Code sessions to see the change."),
        ],
      };
    }
    case "yours":
    case "project": {
      const project = skill.group === "project";
      const source = [];
      let update;
      let remove;
      if (!project && ctx.lock) {
        source.push(["Installed with", `npx skills, from github.com/${ctx.lock.source}`]);
        update = [step("Update every skill installed with npx skills:", "npx skills update")];
        remove = [step("Remove it (and its links):", `npx skills remove --global ${skill.display}`)];
      } else if (ctx.gitRoot) {
        source.push(["Git repo", ctx.gitRoot]);
        update = project
          ? [step("Edit its SKILL.md, then commit the change so everyone using this repo gets it.")]
          : [step("Pull the latest from its repo:", `git -C ${ctx.gitRoot} pull`)];
        remove = [step(project
          ? "Delete its folder and commit, which removes it for everyone using this repo."
          : `Delete ${ctx.linkedFrom ?? skill.path}; the repo copy stays until you delete it there.`)];
      } else {
        source.push(["Made by hand", "no installer or repo found"]);
        update = [step("Edit its SKILL.md. Sessions pick up the change when they restart.")];
        remove = [step(ctx.linkedFrom
          ? `Delete the link ${ctx.linkedFrom}, and the folder it points to if nothing else uses it.`
          : `Delete its folder ${skill.path}.`)];
      }
      return {
        kind: project ? "Project" : "Personal",
        scope: project ? `Only sessions started in ${ctx.cwd}`
          : ctx.sharedOnly ? "Installed in the shared skills folder; available to agents that read it"
          : "Every session, in every project",
        source: [...source, ...linked],
        path: skill.path,
        update,
        remove,
      };
    }
    case "account":
      return {
        kind: "claude.ai account",
        scope: "Every session signed in to your account, here and on claude.ai",
        source: [["Synced from", "your claude.ai account"]],
        path: skill.path,
        update: [step("Change it on claude.ai, in your account's skills settings. Claude Code syncs it on the next start; edits to the synced copy here get overwritten.")],
        remove: [step("Turn it off or delete it on claude.ai, in your account's skills settings.")],
      };
    default:
      return {
        kind: "Built into Claude Code",
        scope: "Every session",
        source: [["Claude Code", ctx.claudeVersion ?? "unknown version"]],
        path: null,
        update: [step("It ships with Claude Code and updates with it:", "claude update")],
        remove: [
          step("It can't be removed."),
          step("No folder was found for it. If you removed this skill after the session started, it disappears when the session restarts."),
        ],
      };
  }
}
