// black-sun's right-click menus in the sidebar, drawn like Herdr's own menu (a shipped mod that
// only knows panes, tabs and spaces). spaces-tree opens it as a popup with props
// { kind: "agent", target: { terminal, tab, pane } } or { kind: "space", target: { id, git } }.
// A space's menu starts an agent in that space (as Herdr's + menu does: knownAgents(), tab.new),
// a terminal, then Herdr's own space items (see model.js). Number keys 1–9 start its agents.
// An agent's menu: Rename asks for the agent's tab's name; Auto-name asks
// spaces-tree to name it from what its session is doing (shared "agent-names.request"), and
// Auto-name all every agent it can. Open in Finder asks spaces-tree to show the folder the agent
// is in (shared "black-sun.finder"; agents on this computer only). Close closes the agent (its tab, or its pane when it shares one).
// "Add to grid view" puts the agent's terminal in black-sun's grid view (shared
// "black-sun.sbs" = { on, root, ... }, see the side-by-side mod), at its right
// edge; "Remove from grid view" takes it out. A space's menu has the same item for all of
// that space's terminals (a space with only a plain terminal has no agent row to right-click).
// The grid view bar opens the agent menu for its tabs too (plain terminals included).
// A space's menu also tags it: one item per space tag (shared "black-sun.tags", see tags.js), and
// "Edit tags…" opens black-sun's settings, where tags are made.
// ↑/↓ move, Enter runs, Esc closes. Hints show the keys bound in keys.json.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, openOverlay, theme, keys, agents, panes, spaces, shared, setShared, knownAgents } from "herdr";
import { spaceItems, besideItems, besideWith } from "./model.js";
import { KEY as TAGS, normalize as tagState, assign } from "./tags.js";

// The agents Herdr's + menu last found on each machine (that mod keeps them in shared state).
const KNOWN = "new-menu.agents";

// black-sun's grid view (the side-by-side mod owns the state's shape; see besideWith in model.js).
const SBS = "black-sun.sbs";
const besideNow = () => besideItems(shared(SBS));
// Adds the terminals when any of them is missing from the grid, else takes them all out.
const besideToggle = (terminals) => setShared(SBS, besideWith(shared(SBS), terminals, !terminals.every((x) => besideNow().includes(x))));

// The key bound to a command, in keys.json's global section or this layout's.
function shortcut(action) {
  const layout = shared("layout");
  const k = keys().find((b) => (b.section === "global" || b.section === `layout:${layout}`) && b.action === action);
  return k ? k.keys : "";
}

function agentItems(target) {
  const a = agents().find((x) => x.address === target?.terminal);
  const nameable = !!a && !a.address.includes("/") && ["claude", "codex"].includes(a.program?.key);
  const local = !!a && !a.address.includes("/");
  const beside = besideNow().includes(target?.terminal);
  return [
    { label: "Rename", icon: "mods/workspace-chrome/square-pen.svg", key: shortcut("tab.rename"), on: true,
      go: () => run("tab.rename", { id: target.tab }) },
    { label: "Auto-name", icon: "mods/sidebar-menu/sparkles.svg", key: shortcut("spaces-tree.auto-name"), on: nameable,
      tip: nameable ? "Name it after what its session is doing now" : "Claude Code and Codex agents on this computer only",
      go: () => setShared("agent-names.request", { terminal: target.terminal, at: Date.now() }) },
    { label: "Auto-name all", icon: "mods/sidebar-menu/sparkles.svg", key: shortcut("spaces-tree.auto-name-all"), on: true,
      tip: "Name every Claude Code and Codex agent after what it's doing now",
      go: () => setShared("agent-names.request", { all: true, at: Date.now() }) },
    { label: "Open in Finder", icon: "mods/workspace-chrome/folder.svg", key: shortcut("spaces-tree.open-finder"), on: local,
      tip: local ? "Show the folder this agent is in" : "Agents on this computer only",
      go: () => setShared("black-sun.finder", { terminal: target.terminal, at: Date.now() }) },
    { label: beside ? "Remove from grid view" : "Add to grid view", icon: "mods/side-by-side/grid.svg", key: "", on: !!target?.terminal,
      tip: beside ? "Take it out of the grid view; it keeps running" : "Show it next to the others in the grid view (the switch at the top right)",
      go: () => besideToggle([target.terminal]) },
    // Close the agent: its whole tab when it's alone there (as the tab menu's Close), else only its
    // pane, so the tab's other panes keep running. Herdr confirms when something is running.
    closeItem(target),
  ];
}

function closeItem(target) {
  const alone = panes().filter((p) => p.tab === target?.tab).length <= 1;
  return alone
    ? { label: "Close", icon: "mods/workspace-chrome/x.svg", key: shortcut("tab.close"), on: true, gap: true,
        go: () => run("tab.close", { id: target.tab }) }
    : { label: "Close pane", icon: "mods/workspace-chrome/x.svg", key: shortcut("pane.close"), on: !!target?.pane, gap: true,
        tip: "Closes this agent's pane; the tab's other panes stay", go: () => run("pane.close", { pane: target.pane }) };
}

// A menu item's icon: an svg path, or an agent's program icon (a glyph or a picture).
function itemIcon(it, t) {
  const color = it.on === false ? t.dim : t.muted;
  if (it.dot) return div().w(14).flex_none().flex().justify_center().child(div().size(10).rounded(3).bg(it.dot));
  if (it.program?.icon) return it.program.tint ? svg(it.program.icon).size(14).flex_none().text_color(t.foreground) : image(it.program.icon).w(14).h(14).flex_none();
  return it.icon ? svg(it.icon).size(14).flex_none().text_color(color) : div().w(14).flex_none();
}

export default class SidebarMenu extends View {
  init(_props, cx) {
    this.at = 0;
    this.handle = cx.focus_handle();
    this.handle.focus();
    const p = props() ?? {};
    if (p.kind === "space") {
      const machine = spaces().find((s) => s.id === p.target?.id)?.machine ?? null;
      const where = machine ?? "";
      this.known = shared(KNOWN)?.[where] ?? [];
      cx.spawn(async (cx) => {
        try {
          this.known = await knownAgents({ on: machine });
          setShared(KNOWN, { ...shared(KNOWN), [where]: this.known });
        } catch {}
        cx.notify();
      });
    }
  }

  list() {
    const p = props() ?? {};
    if (p.kind !== "space") return agentItems(p.target);
    const tags = tagState(shared(TAGS));
    // The space's terminals, for its grid view item: "all" once every one of them is there.
    const tabs = new Set((spaces().find((s) => s.id === p.target?.id)?.tabs ?? []).map((x) => x.id));
    const mine = panes().filter((x) => x.terminal && tabs.has(x.tab)).map((x) => x.terminal);
    const beside = !mine.length ? null : mine.every((x) => besideNow().includes(x)) ? "all" : "some";
    return spaceItems(this.known, p.target?.git ?? null, p.target?.id, shortcut, tags.tags, tags.spaces[p.target?.id] ?? null, beside).map((it) => it.header ? it : {
      ...it, on: true,
      go: it.beside
        ? () => besideToggle(mine)
        : "tag" in it
        ? () => setShared(TAGS, assign(tagState(shared(TAGS)), p.target?.id, it.tag))
        : it.settings
        ? () => {
            // The settings window, where and as big as it was left (as the Spaces header's gear opens it).
            const size = shared("black-sun.settings")?.windowSize;
            const [width, height] = Array.isArray(size) && size[0] > 0 && size[1] > 0 ? size : [640, 760];
            openOverlay({ mod: "black-sun-settings", kind: "window", key: "black-sun-settings", width, height });
          }
        : it.agent
        // spaces-tree starts it (shared "black-sun.start"), asking Herdr for the agent's current
        // start command (yolo mode can change it).
        ? () => setShared("black-sun.start", { key: it.agent, space: p.target?.id, at: Date.now() })
        : it.worktree
        ? () => openOverlay({ mod: "worktree", kind: "dialog", ...(it.worktree.action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 }), props: it.worktree })
        : () => run(it.cmd, it.args),
    });
  }

  choose(it) {
    if (!it?.on || it.header) return;
    closeOverlay(props()?.overlay);
    it.go();
  }

  render(cx) {
    const t = theme();
    const list = this.list();
    const picks = list.map((it, i) => i).filter((i) => !list[i].header && list[i].on);
    if (!picks.includes(this.at)) this.at = picks[0] ?? 0;
    const step = (d) => { const k = picks.indexOf(this.at); this.at = picks[(k + d + picks.length) % picks.length]; };
    return v_flex()
      .id("sidebar-menu")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") step(1);
        else if (e.key === "up") step(-1);
        else if (e.key === "enter") this.choose(list[this.at]);
        else if (e.key === "escape") closeOverlay(props().overlay);
        else if (/^[1-9]$/.test(e.key) && props()?.kind === "space") this.choose(list.filter((it) => it.program)[Number(e.key) - 1]);
        else return;
        cx.notify();
      })
      .children(list.map((it, i) => it.header
        ? div().px(9).pt(6).pb(4).text_size(11).text_color(t.dim).child(it.header)
        : v_flex()
          .when(!!it.gap, (el) => el.child(div().mx(7).my(4).h(1).bg(t.border)))
          .child(h_flex()
            .id(`smi-${i}`)
            .h(31)
            .px(8)
            .gap(9)
            .rounded(7)
            .items_center()
            .justify_between()
            .text_color(it.on ? t.foreground : t.dim)
            .when(i === this.at && it.on, (el) => el.bg(t.selected))
            .when(it.on, (el) => el.hover((s) => s.bg(t.hover)).cursor_pointer())
            .when(!!it.tip, (el) => el.tooltip(it.tip))
            .on_click(() => this.choose(it))
            .child(itemIcon(it, t))
            .child(div().flex_1().child(it.label))
            .child(div().text_size(11).text_color(t.dim).child(it.key)))));
  }
}
