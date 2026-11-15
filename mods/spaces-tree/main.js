// Workspace spaces (cloned from Herdr's `spaces`), with each space's agents listed
// under it. A space's chevron folds its agents; the header's chevron folds or opens
// them all. Folds are kept per space. Otherwise as `spaces`: worktrees under their checkout,
// grouped by machine when more than one is known. Instead of a lettered avatar, a space shows
// its tag (shared "black-sun.tags", see tags.js; made in black-sun's settings, given from the
// space's menu): a square in the tag's color (hollow when untagged; with gradients on, the color
// coming in from the row's left edge instead), or, with the "row" style,
// the whole row in that color with text that reads on it. A space made from now on starts with
// the default tag, when one is set (the spaces already known are kept in localStorage "tags.seen").
// While black-sun's grid view is on (shared "black-sun.sbs", the side-by-side mod), the
// agents shown there are marked, their spaces are the selected ones, and a click on one focuses
// it there. Dragging an agent row picks it up for that mod's arrange view (state `carry`), which
// opens to take the drop.
// A space stays when its last terminal is closed (empty.js; black-sun-settings "Spaces stay when empty").
// Click to switch, right-click for its menu, drag to reorder; click an agent to focus it.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, panes, agents, focused, run, openOverlay, exec, hc, theme, shared, setShared, watchFolder, window, layout, nextCommand, notify, knownAgents } from "herdr";
import { syncTargets, shortTitle, rowLabel, nameable, nameOptions, NEW } from "./names.js";
import { autoName, shortenTitle } from "./autoname.js";
import { duration, track } from "./times.js";
import { layers, glowing, wash } from "./fade.js";
import { mode as numberMode, numbers, go } from "./numbers.js";
import { KEY as EMPTY, step as emptyStep, placeholderTabs } from "./empty.js";
import { KEY as TAGS, normalize as tagState, tagOf, tagName, tagNew, ink } from "./tags.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
// black-sun's highlight color (black-sun-settings, "Highlight color"): what marks the focused one.
function highlight() {
  const c = shared("black-sun.settings")?.highlight;
  return /^#[0-9a-f]{6}$/i.test(c) ? c : "#8b7cf6";
}

// The selected space's background: the theme's "selected", most of the way back to the sidebar's
// own color, so it reads as selected without being the brightest thing in the list.
function quiet(t) {
  const rgb = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : null);
  const a = rgb(t.selected), b = rgb(t.chrome);
  if (!a || !b) return t.selected;
  return "#" + a.map((v, i) => Math.round(v * 0.28 + b[i] * 0.72).toString(16).padStart(2, "0")).join("");
}

const rowHeight = ({ tree }) => (tree ? 28 : 30);
const RAIL_CELL = 32;
const railCell = (el) => h_flex().flex_none().justify_center().child(el);
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

// Agent rows: their icon, a name and their state, as the agents list draws them.
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };

function agentIcon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function agentStatus(t, status, compact = false) {
  if (status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
  if (status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
  if (status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
  if (status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
  return div().size(7).mx(3).flex_none().rounded(4).bg(status === "done" ? (t.done ?? t.dim) : t.dim + "00");
}

export default class Spaces extends View {
  init(_props, cx) {
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Set(); // local repos' git folders
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.machines = [];
    this.reconnecting = JSON.parse(localStorage.getItem("machines.reconnecting") ?? "{}");
    for (const state of Object.values(this.reconnecting)) state.busy = false;
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    // Spaces whose agents are folded away (open by default).
    this.closed = new Set(JSON.parse(localStorage.getItem("spaces.closed") ?? "[]"));
    // The spaces known so far, so only a new one gets the default tag (null: not looked yet).
    try { this.seenSpaces = JSON.parse(localStorage.getItem("tags.seen") ?? "null"); } catch { this.seenSpaces = null; }
    if (!Array.isArray(this.seenSpaces)) this.seenSpaces = null;
    // Auto-name: agents being named now; the menu's last request already handled.
    this.naming = new Set();
    this.request = shared("agent-names.request")?.at ?? 0;
    // The space menu's "start this agent here" (sidebar-menu), last one handled.
    this.started = shared("black-sun.start")?.at ?? 0;
    // The agent menu's "Open in Finder" (sidebar-menu), last one handled.
    this.revealed = shared("black-sun.finder")?.at ?? 0;
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "auto-name-all") { this.startAutoNameAll(cx); continue; }
        if (c.startsWith("new-")) { this.startAgent(c.slice(4)); continue; }
        // ⌘1–9 (keys.json): the tab with that number in the sidebar (numbers.js).
        if (/^go-\d$/.test(c)) {
          const to = go(Number(c.slice(3)), spaces(), this.agentsBySpace(), numberMode(shared("black-sun.settings")), (a) => !!this.sbs?.on && this.sbs.items.has(a), placeholderTabs(shared(EMPTY)));
          if (to) run(to[0], to[1]);
          continue;
        }
        if (c === "open-finder") { this.openFinder(agents().find((x) => x.focused)); continue; }
        const a = c === "auto-name" && agents().find((x) => x.focused);
        if (a) this.startAutoName(a, cx);
      }
    });
    // When each agent's status last changed (as Herdr's Agents list shows it), kept across starts.
    try { this.changed = JSON.parse(localStorage.getItem("agents.changed") ?? "{}"); } catch { this.changed = {}; }
    cx.timer.every(30000, (cx) => cx.notify());
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // Refresh only when the refs could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
  }

  // The names we gave tabs: tab id -> { tab, row, by } (see names.js), kept in localStorage.
  namesGiven() {
    if (this.given) return this.given;
    const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) ?? "null") ?? d; } catch { return d; } };
    const given = load("agent-names.given", {});
    // Earlier versions kept the tab name alone, or only a list of ids.
    for (const [id, v] of Object.entries(given)) if (typeof v === "string") given[id] = { tab: v, row: null, by: "sync" };
    this.given = given;
    return given;
  }

  saveNames() {
    try { localStorage.setItem("agent-names.given", JSON.stringify(this.given)); } catch {}
  }

  // Keeps a one-agent tab named after its agent's title: the tab at most 3 words (a longer title
  // is shortened by Haiku once, the title only, and remembered), its sidebar row at most 5.
  // Names a person gives (Rename) or Auto-name gives are left alone; a reset always wins.
  syncTabs(sp, cx) {
    // black-sun settings: sync can be off; word limits; Haiku or plain cutting for long titles.
    const opts = nameOptions(shared("black-sun.settings"));
    const tabs = sp.filter((s) => !s.machine).flatMap((s) => s.tabs ?? []);
    if (!opts.sync) {
      // Off: nothing waits for a title, so "<new>" tabs go back to Herdr's automatic name.
      for (const tab of tabs) if (tab.named && tab.name === NEW) run("tab.rename", { id: tab.id, name: "" });
      return;
    }
    const byId = new Map(tabs.map((t) => [t.id, t]));
    const given = this.namesGiven();
    let changed = false;
    for (const id of Object.keys(given)) if (!byId.has(id)) { delete given[id]; changed = true; }
    if (!this.short) {
      try { this.short = JSON.parse(localStorage.getItem("agent-names.short.v3") ?? "null"); } catch { this.short = null; }
      // v2 kept shortenings by title alone, all for 3-word tabs: keep them as "3|<title>".
      if (!this.short) {
        let v2 = {};
        try { v2 = JSON.parse(localStorage.getItem("agent-names.short.v2") ?? "{}"); } catch {}
        this.short = Object.fromEntries(Object.entries(v2).map(([k, v]) => [`3|${k}`, v]));
        try { localStorage.setItem("agent-names.short.v3", JSON.stringify(this.short)); } catch {}
      }
      try { for (const k of ["agent-names.short", "agent-names.short.v2", "agent-names.synced"]) localStorage.removeItem(k); } catch {}
    }
    this.shortening ??= new Set();
    for (const { tab, title } of syncTargets(agents().filter((a) => !a.address.includes("/")), tabs, given)) {
      if (!title) { run("tab.rename", { id: tab, name: NEW }); continue; }
      const fits = title.split(/\s+/).length <= opts.tabWords;
      const cached = `${opts.tabWords}|${title}`;
      const name = fits ? title : opts.haiku ? this.short[cached] : shortTitle(title, opts.tabWords);
      if (!name) {
        if (!this.shortening.has(cached)) {
          this.shortening.add(cached);
          cx.spawn(async (cx) => {
            this.short[cached] = await shortenTitle(title, opts.tabWords);
            this.shortening.delete(cached);
            try { localStorage.setItem("agent-names.short.v3", JSON.stringify(this.short)); } catch {}
            cx.notify();
          });
        }
        continue;
      }
      const row = shortTitle(title, opts.rowWords);
      if (byId.get(tab)?.name !== name) run("tab.rename", { id: tab, name });
      if (given[tab]?.tab !== name || given[tab]?.row !== row) { given[tab] = { tab: name, row, by: "sync" }; changed = true; }
    }
    if (changed) this.saveNames();
  }

  // Names one agent: null when done, else the reason it couldn't. The row spins meanwhile.
  async nameOne(a, cx) {
    this.naming.add(a.address);
    cx.notify();
    let failed = null;
    try {
      const pair = await autoName(a, nameOptions(shared("black-sun.settings")));
      this.namesGiven()[a.tab] = { ...pair, by: "auto" };
      this.saveNames();
    } catch (e) { failed = String(e?.message ?? e); }
    this.naming.delete(a.address);
    cx.notify();
    return failed;
  }

  // One run per agent; a failure says why in a toast.
  startAutoName(a, cx) {
    if (this.naming.has(a.address)) return;
    const label = this.labels?.get(a.address) ?? a.program?.name ?? "this agent";
    cx.spawn(async (cx) => {
      const failed = await this.nameOne(a, cx);
      if (failed) notify({ level: "error", title: `Couldn't name ${label}`, body: failed });
    });
  }

  // Every agent Auto-name can name, three at a time; one toast for whatever failed.
  startAutoNameAll(cx) {
    const todo = agents().filter((a) => nameable(a) && !this.naming.has(a.address));
    if (!todo.length) return;
    const labels = new Map(todo.map((a) => [a.address, this.labels?.get(a.address) ?? a.program?.name ?? a.address]));
    cx.spawn(async (cx) => {
      const failures = [];
      const queue = [...todo];
      const worker = async () => {
        for (let a = queue.shift(); a; a = queue.shift()) {
          const failed = await this.nameOne(a, cx);
          if (failed) failures.push(`${labels.get(a.address)}: ${failed}`);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (failures.length) {
        notify({ level: "error", title: `Named ${todo.length - failures.length} of ${todo.length} agents`, body: failures.join("\n") });
      }
    });
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    this.syncTabs(sp, cx);
    // A space not seen before starts with the default tag (black-sun's settings), if one is set.
    const fresh = tagNew(tagState(shared(TAGS)), this.seenSpaces, sp.map((s) => s.id));
    if (fresh.grew) {
      this.seenSpaces = fresh.seen;
      try { localStorage.setItem("tags.seen", JSON.stringify(fresh.seen)); } catch {}
    }
    if (fresh.tagged) setShared(TAGS, fresh.state);
    // The agent menu's Auto-name (sidebar-menu) asks through shared state.
    const req = shared("agent-names.request");
    if (req?.at > this.request) {
      this.request = req.at;
      const a = !req.all && agents().find((x) => x.address === req.terminal);
      if (req.all) this.startAutoNameAll(cx);
      else if (a) this.startAutoName(a, cx);
    }
    const finder = shared("black-sun.finder");
    if (finder?.at > this.revealed) {
      this.revealed = finder.at;
      this.openFinder(agents().find((x) => x.address === finder.terminal));
    }
    const start = shared("black-sun.start");
    if (start?.at > this.started) {
      this.started = start.at;
      this.startAgent(start.key, start.space);
    }
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id)) || this.orderingDue(now)) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  rebuilt(machine) {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async cx => {
      try {
        const ask = async args => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String(e.message ?? e);
        state.busy = false;
      }
      localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        await Promise.all(keys.map((key) => this.check(key, cx)));
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // Ref-only reads avoid scanning the worktree or waking its index watch.
      // Two reads: a folder name may itself contain a newline.
      const [r, common] = await Promise.all([
        exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd, on }),
        exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on }),
      ]);
      if (r.code !== 0 || common.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.code !== 0 ? r.stderr : common.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = r.stdout.replace(/\n$/, ""), repo = common.stdout.replace(/\n$/, "");
      const [branch, counts] = await Promise.all([
        exec("git", ["symbolic-ref", "-q", "HEAD"], { cwd, on }),
        exec("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], { cwd, on }),
      ]);
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const [ahead, behind] = counts.code === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [0, 0];
      const info = { name, branch: branch.code === 0 ? branch.stdout.trim().replace(/^refs\/heads\//, "") : "(detached)", ahead, behind, repo: JSON.stringify([on, repo]), linked: repo !== `${top}/.git` };
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  saveClosed() {
    localStorage.setItem("spaces.closed", JSON.stringify([...this.closed]));
  }

  // What a space lists, by space, read once per render: its agents, and (a setting, on unless
  // turned off) its plain terminals too, marked `plain`, with no status. In tab order.
  agentsBySpace() {
    const by = new Map();
    const add = (a) => {
      if (!by.has(a.space)) by.set(a.space, []);
      by.get(a.space).push(a);
    };
    const mine = agents();
    for (const a of mine) add(a);
    if (shared("black-sun.settings")?.terminals === false) return by;
    const have = new Set(mine.map((a) => a.address));
    const tabs = new Map(spaces().flatMap((s) => (s.tabs ?? []).map((tab, i) => [tab.id, { space: s.id, at: i }])));
    let any = false;
    for (const p of panes()) {
      const space = tabs.get(p.tab)?.space;
      if (!p.terminal || have.has(p.terminal) || !space) continue;
      add({ address: p.terminal, pane: p.pane, tab: p.tab, space, status: null, program: p.program, title: p.title, focused: p.focused, plain: true });
      any = true;
    }
    // (sort is stable: panes of one tab stay in the order they came)
    if (any) for (const list of by.values()) list.sort((a, b) => (tabs.get(a.tab)?.at ?? 0) - (tabs.get(b.tab)?.at ?? 0));
    return by;
  }

  // An agent: the number ⌘ goes to its tab with (its tab's place in its space), its icon and name,
  // how long it has been in its status, and the status.
  agentRow(a, tree, t) {
    const pic = agentIcon(a.program, 14, t.foreground);
    // Grid view: shown there now; then a click focuses it there, and it is the focused one
    // when its terminal has the keyboard.
    const beside = this.sbs?.on && this.sbs.items.has(a.address);
    const here = beside ? focused()?.terminal === a.address : a.focused;
    const idle = a.status === "idle" && !here;
    const hl = highlight();
    // Behind the row (fade.js): the focused one fades from its space's tag color into the
    // highlight, and what the agent is doing glows in from the right. Each is a setting.
    const tag = tagOf(this.tags ?? tagState(shared(TAGS)), a.space)?.color ?? null;
    const opts = shared("black-sun.settings");
    const from = here && opts?.fade !== false ? tag : null;
    const behind = layers({ focused: here, tag, highlight: hl, status: a.status, opts });
    const index = this.numbers?.get(a.tab);
    const since = this.changed?.[a.address]?.at;
    return h_flex()
      .id(`space-agent-${a.address}`)
      .pl(tree ? 30 : 10)
      .pr(8)
      .h(30)
      .flex_none()
      .gap(8)
      .items_center()
      .text_size(12.5)
      // The focused one: tinted in the highlight color, with a bar of it down the left.
      .relative()
      .border_l(3).border_color(from ?? (here ? hl : hl + "00"))
      .when(here && !from, (el) => el.bg(hl + "38"))
      .children(behind.map((l) => {
        const el = h_flex().absolute().left(0).right(0).top(0).bottom(0)
          .children(l.slices.map((x) => div().flex_basis(0).flex_grow(x.grow).min_w(0).h_full().bg(x.color)));
        return l.loop ? el.loop("opacity", l.loop) : el;
      }))
      .when(!here, (el) => el.hover((s) => s.bg(t.hover)))
      .cursor_pointer()
      .on_click(() => run("pane.focus", beside ? { terminal: a.address } : { pane: a.pane }))
      // Dragged: picked up for grid view, whose arrange view opens to take the drop.
      .on_mouse_down("left", (ev) => { this.grabbed = { address: a.address, from: ev.position }; })
      .on_mouse_move((ev) => {
        const g = this.grabbed;
        if (g?.address !== a.address || Math.hypot(ev.position.x - g.from.x, ev.position.y - g.from.y) <= 8) return;
        this.grabbed = null;
        const s = shared("black-sun.sbs");
        setShared("black-sun.sbs", { ...(s && typeof s === "object" ? s : {}), on: true, arrange: s?.arrange || "drag", carry: a.address });
      })
      .on_mouse_down("right", () => openOverlay({ mod: "sidebar-menu", kind: "popup", width: 230, height: 230,
        props: { kind: "agent", target: { terminal: a.address, tab: a.tab, pane: a.pane } } }))
      .child(div().w(10).flex_none().text_size(11.5).text_right().text_color(t.muted).child(index && index <= 9 ? String(index) : ""))
      .when(Boolean(pic), (el) => el.child(pic))
      // The name, then right after it how long it has been in its status: a long name is cut
      // short, the time always shows. The rest of the row is left for the glow (or the status).
      .child(div().flex_shrink(1).min_w(0).truncate().text_color(idle ? t.muted : t.foreground).child(this.labels.get(a.address)))
      .when(Boolean(since), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(Date.now() - since))))
      .child(div().flex_1().min_w(0))
      .when(a.address.includes("/"), (el) => el.child(div().flex_none().text_size(10).text_color(t.dim).child(a.address.split("/")[0])))
      .when(beside, (el) => el.child(svg("mods/side-by-side/grid.svg").size(11).flex_none().text_color(t.accent)))
      .child(this.naming?.has(a.address)
        ? svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.accent).spin(900)
        // With status shown as the glow there is no spinner, dot or badge; their place is kept.
        : glowing(opts) ? div().w(14).flex_none() : agentStatus(t, a.status));
  }

  // A space's fold: its chevron; folded, how many agents, and the most urgent one's state.
  // pen: the text color on a row drawn in its tag's color, else null.
  spaceFold(w, list, t, pen = null) {
    const open = !this.closed.has(w.id);
    const top = list.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
    return h_flex()
      .id(`space-fold-${w.id}`)
      .flex_none()
      .h(18)
      .px(3)
      .gap(4)
      .items_center()
      .rounded(4)
      .text_size(11)
      .text_color(pen ? pen + "b3" : t.dim)
      .cursor_pointer()
      .hover((s) => (pen ? s.bg(pen + "22").text_color(pen) : s.bg(t.hover).text_color(t.foreground)))
      .tooltip(open ? "Hide agents" : "Show agents")
      // Not a press on the row: no select, no drag.
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_mouse_up("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        cx.stop_propagation();
        open ? this.closed.add(w.id) : this.closed.delete(w.id);
        this.saveClosed();
        cx.notify();
      })
      .when(!open && top && top !== "idle", (el) => el.child(agentStatus(t, top, true)))
      .when(!open && list.length > 0, (el) => el.child(String(list.length)))
      .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none());
  }

  // black-sun's space menu (sidebar-menu): start an agent here, then Herdr's own space items.
  menu(w) {
    // A popup is as tall as its items; height is only the most.
    const g = this.git[where(w, panes())];
    const tags = tagState(shared(TAGS)).tags.length;
    openOverlay({ mod: "sidebar-menu", kind: "popup", width: 240, height: 500 + 31 * tags,
      props: { kind: "space", target: { id: w.id, git: g ? (g.linked ? "linked" : "main") : null } } });
  }

  // A Finder window on the folder an agent is in now (keys.json "spaces-tree.open-finder", or the
  // agent menu): its pane's live folder, else its space's. Agents on this computer only.
  async openFinder(a) {
    if (!a) { notify({ level: "error", title: "No agent to open in Finder", body: "Focus an agent first." }); return; }
    if (a.address.includes("/")) { notify({ level: "error", title: "Can't open in Finder", body: "That agent is on another machine." }); return; }
    const folder = panes().find((p) => p.pane === a.pane)?.cwd || spaces().find((s) => s.id === a.space)?.folder;
    if (!folder) { notify({ level: "error", title: "Can't open in Finder", body: "Herdr doesn't know that agent's folder." }); return; }
    try {
      const r = await exec("open", [folder]);
      if (r?.code) throw new Error(r.stderr || `open exited ${r.code}`);
    } catch (e) {
      notify({ level: "error", title: "Couldn't open Finder", body: String(e?.message ?? e) });
    }
  }

  // A new tab running an agent (keys.json "spaces-tree.new-<program key>", e.g. new-claude, or the
  // space menu) in that space, else the one you're in, as Herdr's + menu starts one.
  async startAgent(key, spaceId = null) {
    const space = spaces().find((s) => (spaceId ? s.id === spaceId : s.active));
    const where = space?.machine ?? "";
    // Ask Herdr each time: the start command may have changed (yolo mode is set in programs.json).
    // The menus' cached list is the fallback when the check fails.
    let known = shared("new-menu.agents")?.[where] ?? [];
    try {
      known = await knownAgents({ on: space?.machine ?? null });
      setShared("new-menu.agents", { ...shared("new-menu.agents"), [where]: known });
    } catch {}
    const a = known.find((x) => x.key === key);
    if (!a?.installed) {
      notify({ level: "error", title: `Couldn't start ${a?.name ?? key}`, body: a ? "It isn't installed on this machine." : "Herdr doesn't know this agent." });
      return;
    }
    run("tab.new", { name: NEW, space: space?.id, argv: a.run });
  }

  orderingDue(now) {
    return this.ordering && now - this.ordering.at >= 1000
      && this.ordering.machines.every(name => machines().some(m => m.name === name && m.layout === "ready"));
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  ordered() {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null }));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└─" : "├─" }));
    }
    // Simulate the batch so later indexes include earlier moves. An attempted
    // write can lose a sync conflict: allow the echo to settle before retrying.
    const order = sp.map(w => w.id);
    const target = out.map(r => r.w.id);
    const key = JSON.stringify([order, target, machines()]);
    if (order.every((id, i) => id === target[i])) {
      this.ordering = null;
    } else if (this.ordering?.key !== key || this.orderingDue(Date.now())) {
      const moved = new Set();
      this.ordering = { key, at: Date.now(), machines: [] };
      for (let i = 0; i < out.length; i++) {
        const from = order.indexOf(out[i].w.id);
        if (from === i) continue;
        run("space.move", { id: out[i].w.id, index: i + 1 });
        moved.add(out[i].w.machine ?? null);
        order.splice(i, 0, order.splice(from, 1)[0]);
      }
      this.ordering.machines = [...moved];
    }
    return out.filter(r => this.shown.has(r.w.id));
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed) {
    const rows = this.ordered();
    const draw = (r) => {
      if (collapsed) return [this.compact(r, t)];
      const list = this.byspace.get(r.w.id) ?? [];
      const open = !this.closed.has(r.w.id);
      // A space and its agents in a box of their own, like a card, so spaces read apart.
      // The space's own row runs edge to edge; its agents sit inset below it, with room around
      // and between them, so they read as inside the box.
      // The space of the agent or terminal with the keyboard has its box's border in the highlight
      // color, as that one's row and card have: in grid view the space of the focused terminal,
      // else the shown space.
      const at = this.sbs?.on ? focused()?.terminal : null;
      const mine = this.sbs?.on ? !!at && list.some((a) => a.address === at) : r.w.active;
      return [v_flex().id(`space-box-${r.w.id}`).flex_none().mb(10).bg(t.background)
        // As thick as a card's border when it is the one; else thin, with the same room around.
        .when(mine, (el) => el.border(2).border_color(highlight()))
        .when(!mine, (el) => el.border(1).border_color(t.border).p(1))
        .child(this.row(r, t, list))
        .when(open && list.length > 0, (el) => el.child(v_flex().p(6).gap(5).children(list.map((a) => this.agentRow(a, r.tree, t)))))
        // A space with no agents: a row to add one (a setting, on unless turned off). It shows the
        // space and opens the menu + in the tab bar opens, which adds to the shown space.
        // Folded (its own chevron, or fold all), the space is only its row.
        .when(open && !list.some((a) => !a.plain) && shared("black-sun.settings")?.emptyAdd !== false, (el) => el.child(v_flex().p(6).child(
          h_flex().id(`space-add-${r.w.id}`).h(30).pl(10).pr(8).gap(8).items_center().text_size(12.5).text_color(t.dim).cursor_pointer()
            .border(1).border_color(t.border).hover((s) => s.bg(t.hover).text_color(t.foreground))
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click(() => {
              run("space.select", { id: r.w.id });
              openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 });
            })
            .child(svg("mods/workspace-chrome/plus.svg").size(13).flex_none())
            .child(div().min_w(0).truncate().child("Add terminal or agent")))))];
    };
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name), ...Object.keys(this.reconnecting)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => h_flex().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).items_center().when(collapsed, el => el.justify_center()).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) return loading(null) && !rows.length ? [loadingRow(null)] : rows.flatMap(draw);
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find(k => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected";
      const rebuilt = this.rebuilt(machine) || !!repair;
      const login = machine?.state === "needs_login" ? `hc machine login ${m}` : null;
      const folded = this.folded.has(m);
      const icon = svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none();
      const badge = div().absolute().right(-3).bottom(-2).size(6).rounded(3).border_1().border_color(t.chrome).bg(connected ? t.ansi2 : t.dim);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 0 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
        // Room above every computer after the first, and a little under its name.
        .when(!collapsed, el => el.mb(4).when(Boolean(m), (x) => x.mt(16)))
        .when(collapsed, el => el.mt(4).w(RAIL_CELL).justify_center().rounded(6).tooltip(login ? `${m} needs a login: run ${login}. Click for Copy.` : m ? `${m} · ${connected ? "connected" : (machine?.state ?? "asleep").replace(/_/g, " ")}` : "This computer"))
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          if (collapsed && login) { run("app.settings", { section: "machines" }); return; }
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .when(!collapsed, el => el.child(icon))
        .when(collapsed, el => el.child(div().relative().flex_none().child(icon).when(Boolean(m), el => el.child(badge))))
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(m ?? "This computer"))
          .when(!connected && !rebuilt && !login, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(rebuilt, el => el.child(h_flex().flex_none().gap(3).items_center()
            .child(div().max_w(140).truncate().child(repair?.error || "rebuilt ·"))
            .child(div().id(`machine-connect-${m}`).text_color(repair?.error ? t.blocked : t.muted)
              .hover(s => s.text_color(t.foreground))
              .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
              .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
              .child(repair?.busy ? "Connecting…" : "Connect"))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m ?? "" }); }).child("+")))
          .child(div().size(6).rounded(3).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).gap(7).items_center().rounded(7)
        .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new", { machine: m ?? "" }))
        .when(collapsed, el => el.w(RAIL_CELL).rounded(6).justify_center().tooltip(`New space on ${m ?? "this computer"}`)
          .child(h_flex().size(18).rounded(5).border_1().border_color(t.dim).items_center().justify_center()
            .child(svg("mods/workspace-chrome/plus.svg").size(10))))
        .when(!collapsed, el => el.child(svg("mods/workspace-chrome/plus.svg").size(12)).child("New space there"));
      if (!collapsed && rebuilt) return [head];
      const cell = collapsed ? railCell : (el) => el;
      const guidance = !collapsed && login ? [v_flex().px(8).pb(6).gap(3).flex_none()
        .child(div().text_size(11).text_color(t.blocked).child("needs a login: run"))
        .child(h_flex().gap(5).items_center()
          .child(div().flex_1().min_w(0).truncate().tooltip(login).text_size(11).text_color(t.muted).child(login))
          .child(div().id(`machine-login-copy-${m}`).flex_none().px(5).py(2).rounded(4)
            .text_size(11).text_color(t.foreground).bg(t.raised).cursor_pointer().hover(s => s.bg(t.hover))
            .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(login); this.copiedLogin = login; cx.notify(); })
            .child(this.copiedLogin === login ? "Copied" : "Copy")))] : [];
      return [cell(head), ...guidance, ...(folded ? [] : mine.length ? mine.flatMap(draw) : [loading(m) ? loadingRow(m) : cell(empty)])];
    });
  }

  // Only what's unusual, after the name: "herdr \u00b7 spike \u21912 \u21931". The repo or
  // branch goes when the name already says it (a worktree is named after its branch),
  // and master/main go: nearly every space is on one.
  gitTail(g, tree, name, t, pen = null) {
    const raw = g.branch ?? "detached";
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
    const repo = tree || same(g.name) ? "" : g.name;
    const where = [repo, branch].filter(Boolean).join(" \u00b7 ");
    return h_flex()
      .flex_1()
      .min_w(0)
      .gap(5)
      .justify_end()
      .items_center()
      .text_size(11.5)
      .text_color(pen ? pen + "b3" : t.dim)
      .when(Boolean(where), (el) => el.child(div().min_w(0).truncate().child(where)))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(pen ?? t.ansi2).child(`\u2191${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(pen ?? t.ansi1).child(`\u2193${g.behind}`)));
  }

  row({ w, i, g, tree }, t, list = []) {
    // Grid view on: the spaces with something shown there are the selected ones.
    const on = this.sbs?.on ? this.sbs.spaces.has(w.id) : w.active;
    const fromIndex = this.pressed === null ? -1 : spaces().findIndex(s => s.id === this.pressed);
    // The space's tag: a square before the name, or (style "row") the row itself in its color,
    // with `pen` the text color that reads on it; the active row then has an outline.
    const tags = this.tags ?? tagState(shared(TAGS));
    const tag = tagOf(tags, w.id);
    const rows = tags.style === "row";
    const paint = rows && tag ? tag.color : null;
    const pen = paint ? ink(paint) : null;
    const square = div().id(`space-tag-${w.id}`).size(18).flex_none().rounded(5)
      .when(Boolean(tag), (el) => el.bg(tag.color).tooltip(tagName(tag)))
      .when(!tag, (el) => el.border(1.5).border_color(t.dim + "88"));
    // With gradients on spaces (black-sun-settings), a tagged space has its color coming in from
    // the left edge in place of the square.
    const washed = !rows && !tree && !!tag && shared("black-sun.settings")?.wash !== false;
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .when(washed, (el) => el.child(h_flex().absolute().left(0).right(0).top(0).bottom(0)
        .children(wash(tag.color).map((x) => div().flex_basis(0).flex_grow(x.grow).min_w(0).h_full().bg(x.color)))))
      .px(paint ? 6 : 8)
      .h(rowHeight({ tree }))
      .flex_none()
      .justify_center()
      .when(Boolean(paint), (el) => el.bg(paint).border(2).border_color(on ? t.foreground : paint))
      .when(Boolean(paint) && !on, (el) => el.hover((s) => s.opacity(0.88)))
      .when(!paint && on, (el) => el.bg(quiet(t)))
      .when(!paint && !on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(this.pressed === w.id && this.over !== w.id, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === w.id && this.pressed !== w.id, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(fromIndex < i, line => line.bottom(0))
          .when(fromIndex > i, line => line.top(0)),
      ))
      .on_mouse_down("left", () => {
        this.pressed = w.id;
        this.over = w.id;
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces().find(s => s.id === this.pressed);
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? w.id : null;
        if (this.pressed !== null && this.over !== over) {
          this.over = over;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        if (from !== null && over === w.id && from !== w.id) {
          const index = spaces().findIndex(s => s.id === w.id);
          if (index !== -1) run("space.move", { id: from, index: index + 1 });
        } else if (from === w.id) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .child(
        h_flex()
          .gap(9)
          .items_center()
          .when(Boolean(tree), el => el.pl(22).child(svg("mods/workspace-chrome/branch.svg").size(13).text_color(pen ? pen + "b3" : t.dim)))
          .when(!tree && !rows && !washed, el => el.child(square))
          .child(div().flex_shrink(0).max_w(150).truncate().text_color(pen ?? t.foreground).child(w.name))
          .child(g ? this.gitTail(g, tree, w.name, t, pen) : div().flex_1())
          // A space folds when it has something under its row: agents, terminals, or the row to add one.
          .when(list.length > 0 || shared("black-sun.settings")?.emptyAdd !== false, (el) => el.child(this.spaceFold(w, list, t, pen))),
      );
  }

  compact({ w, i }, t) {
    return railCell(h_flex()
      .id(`space-${w.id}`)
      .relative()
      .w(RAIL_CELL)
      .h(26)
      .justify_center()
      .items_center()
      .when(w.active, (el) => el.bg(quiet(t)))
      .when(!w.active, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => run("space.select", { id: w.id }))
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(div().absolute().right(5).text_color(tone(t, w.status)).child(glyph(w.status))));
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = spaces();
    const ids = new Set(sp.map(p => p.id));
    // Spaces that stay when empty (empty.js): the shown space gets its placeholder tab, and
    // placeholders are kept put away while their space has something else.
    const held = shared(EMPTY);
    const made = emptyStep(sp, this.emptying ?? null, held, Date.now(), shared("black-sun.settings")?.keepSpaces !== false);
    this.emptying = made.pending;
    if (made.placeholders !== held) setShared(EMPTY, made.placeholders);
    for (const [command, args] of made.actions) run(command, args);
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = c => Object.values(kept).filter(v => v === c).length;
      kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    this.tags = tagState(shared(TAGS));
    // Grid view: whether it is on, the terminals shown there, and the spaces they are in.
    const beside = shared("black-sun.sbs");
    // Its grid is a tree of splits ({ items }) whose leaves are terminals.
    const leaves = (n) => (typeof n === "string" ? [n] : Array.isArray(n?.items) ? n.items.flatMap(leaves) : []);
    const besideItems = new Set(leaves(beside?.root));
    const besideTabs = new Set(panes().filter((p) => besideItems.has(p.terminal)).map((p) => p.tab));
    this.sbs = { on: beside?.on === true, items: besideItems,
      spaces: new Set(sp.filter((s) => (s.tabs ?? []).some((tab) => besideTabs.has(tab.id))).map((s) => s.id)) };
    this.byspace = this.agentsBySpace();
    const tabs = new Map(sp.flatMap((s) => s.tabs ?? []).map((tab) => [tab.id, tab]));
    this.tabsById = tabs;
    // The number before each row: its tab's, down the whole sidebar or within its space (a setting).
    this.numbers = numbers(sp, this.byspace, numberMode(shared("black-sun.settings")), placeholderTabs(made.placeholders));
    const seen = track(this.changed ?? {}, [...this.byspace.values()].flat(), Date.now(), (a) => tabs.get(a.tab)?.changed_at ?? null);
    this.changed = seen.changed;
    if (seen.dirty) { try { localStorage.setItem("agents.changed", JSON.stringify(this.changed)); } catch {} }
    const given = this.namesGiven();
    const { rowWords } = nameOptions(shared("black-sun.settings"));
    this.labels = new Map([...this.byspace.values()].flat().map((a) => [a.address,
      // A plain terminal is called what its tab is called in the tab bar: the tab's name, or
      // for one nobody named, its program ("zsh").
      a.plain ? (/^tb\d+$/.test(tabs.get(a.tab)?.name ?? "tb0") ? a.program?.name || "Terminal" : tabs.get(a.tab).name)
        : rowLabel(a, tabs.get(a.tab), given[a.tab], rowWords)]));
    // Fold all: every space with something under its row (with the add row on, that is every space).
    const withAgents = sp.filter((s) => this.byspace.has(s.id) || shared("black-sun.settings")?.emptyAdd !== false).map((s) => s.id);
    const anyOpen = withAgents.some((id) => !this.closed.has(id));
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(collapsed, el => el.pl(0).pr(0).justify_center())
        .when(!collapsed, el => el.child("Spaces"))
        .when(!collapsed, el => el.child(div().flex_1()))
        .when(!collapsed && withAgents.length > 0, el => el.child(div().id("space-fold-all").size(26).flex_none().flex().items_center().justify_center().rounded(6)
          .hover(s => s.bg(t.hover).text_color(t.foreground))
          .tooltip(anyOpen ? "Fold every space: only the spaces show" : "Unfold every space")
          .on_click((_e, cx) => {
            for (const id of withAgents) anyOpen ? this.closed.add(id) : this.closed.delete(id);
            this.saveClosed();
            cx.notify();
          })
          .child(svg(`mods/workspace-chrome/chevron-${anyOpen ? "down" : "right"}.svg`).size(13))))
        // black-sun's settings dialog (black-sun-settings).
        .when(!collapsed, el => el.child(div().id("bs-settings").size(26).flex_none().flex().items_center().justify_center().rounded(6)
          .hover(s => s.bg(t.hover).text_color(t.foreground))
          .tooltip("black-sun settings")
          .on_click(() => {
            // A window: it can be dragged, and opens where and as big as it was left (its size is a setting).
            const size = shared("black-sun.settings")?.windowSize;
            const [width, height] = Array.isArray(size) && size[0] > 0 && size[1] > 0 ? size : [640, 760];
            openOverlay({ mod: "black-sun-settings", kind: "window", key: "black-sun-settings", width, height });
          })
          .child(svg("mods/workspace-chrome/settings.svg").size(13))))
        .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("space.new")).child(svg("mods/workspace-chrome/plus.svg").size(14))))
      .child(v_flex().flex_1().min_h(0).px(collapsed ? 0 : 8).pb(14).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => {
          this.pressed = null;
          this.grabbed = null;
          // An agent picked up for grid view and let go back here: not dropped.
          const s = shared("black-sun.sbs");
          if (s?.carry) setShared("black-sun.sbs", { ...s, carry: null, arrange: s.arrange === "drag" ? false : s.arrange });
          cx.notify();
        })
        .children(this.grouped(t, collapsed)));
  }
}
