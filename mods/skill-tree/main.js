// skill-tree: which Claude Code skills an agent has, grouped by where they come from.
// One mod, three roles. In a layout block it draws a "Skills" button (with the focused agent's
// count); clicked, it opens itself as a dialog (props().overlay set) with an agent dropdown plus
// "Global" and a collapsible tree. A skill's or plugin's ⓘ opens it a third way, as an info
// dialog (props().info): kind, source, path, its own description, update and remove.
import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, TextView, Popover } from "gpui-base";
import { theme, layout, focused, props, openOverlay, closeOverlay, shared, setShared, settings } from "herdr";
import { countSkills, toggleId } from "./model.js";
import { loadEntries, loadAgentTree, loadGlobalTree, loadInfo, loadPluginInfo, reveal, copy } from "./load.js";

const GLOBAL = "global";
// Open groups, remembered across dialogs and restarts. Everything starts folded.
const OPEN_KEY = "skill-tree.open";
const openIds = () => (Array.isArray(shared(OPEN_KEY)) ? shared(OPEN_KEY) : []);

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}
// A shade between two theme colors (#rrggbb); falls back to `a` for other formats.
function mix(a, b, w) {
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c ?? "") ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : null);
  const x = hex(a), y = hex(b);
  if (!x || !y) return a;
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * w).toString(16).padStart(2, "0")).join("");
}

// Text you can select and copy (⌘C); styled by the div around it.
const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const selectable = (id, text) => TextView.html(id, `<span>${esc(text)}</span>`).selectable(true);

// The agent's icon from Herdr's program table (as the agents mod draws it): a glyph or a picture.
function programIcon(p, size, color) {
  if (!p?.icon) return div().w(size).h(size).flex_none();
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
const focusedAddress = () => focused()?.terminal ?? focused()?.agent ?? null;

export default class SkillTree extends View {
  init(_props, cx) {
    this.info = props()?.info ?? null;   // info dialog: { skill, cwd } or { plugin }
    this.dialog = !!props()?.overlay;
    this.entries = [];
    this.tree = null;      // { groups, error }
    this.loading = false;
    this.count = null;     // button: skills of the focused agent
    this.watching = undefined;
    if (this.info) {
      this.details = null;
      this.copied = null;
      cx.spawn(async (cx) => {
        try {
          this.details = this.info.plugin ? await loadPluginInfo(this.info.plugin)
            : await loadInfo(this.info.skill, this.info.cwd);
        }
        catch (e) { this.details = { error: String(e?.message ?? e) }; }
        cx.notify();
      });
    } else if (this.dialog) {
      this.sel = null;
      this.pickOpen = false;
      this.reload(cx, props().agent ?? focusedAddress());
    } else {
      this.refreshCount(cx, focusedAddress());
    }
  }

  // Button: the focused agent's count; re-read only when focus moves to another terminal.
  refreshCount(cx, address) {
    this.watching = address;
    cx.spawn(async (cx) => {
      try {
        const entry = (await loadEntries()).find((e) => e.address === address && e.available);
        const t = entry ? await loadAgentTree(entry) : null;
        if (this.watching === address) this.count = t && !t.error ? countSkills(t.groups) : null;
      } catch { this.count = null; }
      cx.notify();
    });
  }

  // Dialog: (re)load the picker, then the selected view. `want` = an address or GLOBAL.
  reload(cx, want) {
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        this.entries = await loadEntries();
        const ok = this.entries.filter((e) => e.available);
        const pick = want === GLOBAL ? null
          : ok.find((e) => e.address === want) ?? ok.find((e) => e.focused) ?? ok[0] ?? null;
        this.sel = pick ? pick.address : GLOBAL;
        this.tree = pick ? await loadAgentTree(pick) : await loadGlobalTree(ok[0] ?? null);
      } catch (e) {
        this.tree = { groups: [], error: String(e?.message ?? e) };
      }
      this.loading = false;
      cx.notify();
    });
  }

  renderButton(t) {
    const label = this.count == null ? "Skills" : `Skills · ${this.count}`;
    const open = () => openOverlay({ mod: "skill-tree", kind: "dialog", props: { agent: focusedAddress() }, width: 560, height: 640 });
    if (narrow()) {
      return div().id("skills-btn").size_full().bg(t.chrome).flex().items_center().justify_center()
        .cursor_pointer().text_color(t.muted).hover((s) => s.text_color(t.foreground))
        .tooltip(label).on_click(open).child("◆");
    }
    return div().size_full().bg(t.chrome).px(8).flex().items_center().child(
      h_flex().id("skills-btn").w_full().h(26).px(8).gap(8).items_center().rounded(6).cursor_pointer()
        .hover((s) => s.bg(t.hover)).on_click(open).tooltip("Skills this agent has loaded")
        .child(div().text_size(12).text_color(t.dim).child("◆"))
        .child(div().text_size(12.5).text_color(t.muted).child(label)));
  }

  // The agent picker: a dropdown of every agent (only Claude Code ones can be picked), then Global.
  picker(t) {
    const selected = this.entries.find((e) => e.address === this.sel);
    const current = this.sel === GLOBAL ? "Global" : selected?.label ?? "…";
    // An option: ✓, program icon (none for Global), label, hint. Unavailable ones are dimmed and inert.
    const option = (id, label, program, hint, available = true) => h_flex().id(`pick-${id}`).h(28).px(8).gap(8)
      .items_center().rounded(5)
      .when(available, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { this.pickOpen = false; this.reload(cx, id); }))
      .when(!available, (el) => el.tooltip(`${program?.name ?? "This agent"}: skills are shown for Claude Code agents only`))
      .child(div().w(12).text_size(11).text_color(t.accent).child(this.sel === id ? "✓" : ""))
      .child(program === undefined ? div().w(14).flex_none().text_size(12).text_color(t.dim).child("◎")
        : programIcon(program, 14, available ? t.foreground : t.dim))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5)
        .text_color(!available ? t.dim : this.sel === id ? t.foreground : t.muted).child(label))
      .when(!!hint, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(hint)));
    const list = v_flex().id("pick-list").w(320).max_h(340).overflow_y_scrollbar().p(4).mt(4).gap(1)
      .rounded(8).border(1).border_color(t.border).bg(t.raised).shadow_lg()
      .children(this.entries.map((e) => option(e.address, e.label, e.program,
        !e.available ? "Claude Code only" : e.focused ? "focused" : "", e.available)))
      .child(div().h(1).my(4).bg(t.border))
      .child(option(GLOBAL, "Global", undefined, "any new session"));
    const trigger = h_flex().id("pick-trigger").w(320).h(28).px(10).gap(8).items_center().rounded(6)
      .cursor_pointer().border(1).border_color(this.pickOpen ? t.accent : t.border).bg(t.raised)
      .hover((s) => s.bg(t.hover))
      .child(this.sel === GLOBAL ? div().w(14).flex_none().text_size(12).text_color(t.dim).child("◎")
        : programIcon(selected?.program, 14, t.foreground))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(current))
      .child(div().text_size(10).text_color(t.dim).child("▾"));
    return Popover.new("agent-pick").anchor("top_left").open(this.pickOpen)
      .on_open_change((open, cx) => { this.pickOpen = open; cx.notify(); })
      .trigger(trigger).content(list);
  }

  smallButton(t, id, label, tip, onClick) {
    return div().id(id).flex_none().px(8).h(22).flex().items_center().rounded(5).text_size(11.5)
      .border(1).border_color(t.border).bg(t.raised).text_color(t.muted).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation?.(); onClick(cx); })
      .child(label);
  }

  copyButton(t, id, text) {
    return this.smallButton(t, `copy-${id}`, this.copied === id ? "Copied" : "Copy", text, (cx) => {
      copy(text);
      this.copied = id;
      cx.notify();
    });
  }

  section(t, title, ...children) {
    return v_flex().gap(6)
      .child(div().text_size(11).font_medium().text_color(t.dim).child(title.toUpperCase()))
      .children(children);
  }

  steps(t, id, list) {
    const mono = settings().font_family ?? "JetBrains Mono";
    return list.map((st, i) => v_flex().gap(4)
      .child(div().text_size(12.5).text_color(t.foreground).child(selectable(`${id}-t${i}`, st.text)))
      .when(!!st.cmd, (el) => el.child(
        h_flex().gap(8).items_center().px(8).py(5).rounded(5).bg(t.raised).border(1).border_color(t.border)
          .child(div().flex_1().min_w(0).font_family(mono).text_size(12).text_color(t.foreground).child(selectable(`${id}-c${i}`, st.cmd)))
          .child(this.copyButton(t, `${id}-${i}`, st.cmd)))));
  }

  renderInfo(t) {
    const d = this.details;
    const name = d?.name ?? this.info.plugin ?? this.info.skill.display;
    const header = h_flex().h(44).px(14).gap(8).items_center().flex_none().border_b(1).border_color(t.border)
      .child(div().text_size(14).font_semibold().text_color(t.foreground).child(name))
      .when(!!d?.kind, (el) => el.child(div().px(8).h(20).flex().items_center().rounded(10).text_size(11)
        .bg(t.raised).border(1).border_color(t.border).text_color(t.muted).child(d.kind)))
      .child(div().flex_1())
      .child(div().id("info-close").px(6).text_color(t.dim).cursor_pointer().tooltip("Close (Esc)")
        .hover((s) => s.text_color(t.foreground)).on_click(() => closeOverlay(props().overlay)).child("✕"));
    if (!d) return v_flex().size_full().child(header).child(div().p(16).text_size(12.5).text_color(t.dim).child("Loading…"));
    if (d.error) return v_flex().size_full().child(header).child(div().p(16).text_size(12.5).text_color(t.muted).child(d.error));
    const mono = settings().font_family ?? "JetBrains Mono";
    const body = v_flex().id("info-body").flex_1().min_h(0).overflow_y_scrollbar().px(16).py(14).gap(18)
      .child(div().text_size(12.5).text_color(t.muted).child(selectable("info-scope", d.scope)))
      .child(this.section(t, "Description",
        div().text_size(12.5).line_height("19px").text_color(t.foreground).child(selectable("info-desc", d.description || "No description."))))
      .child(this.section(t, "Source", ...d.source.map(([k, v], i) => h_flex().gap(10).items_start()
        .child(div().w(96).flex_none().text_size(12).text_color(t.dim).child(k))
        .child(div().flex_1().min_w(0).text_size(12.5).text_color(t.foreground).child(selectable(`info-src-${i}`, v))))))
      .when(!!d.path, (el) => el.child(this.section(t, "On disk",
        div().font_family(mono).text_size(12).text_color(t.foreground).child(selectable("info-path", d.path)),
        h_flex().gap(6)
          .child(this.smallButton(t, "info-reveal", "Reveal in Finder", d.path, () => reveal(d.path)))
          .child(this.copyButton(t, "path", d.path)))))
      .when(!!d.contents?.length, (el) => el.child(this.section(t, "Contains", ...d.contents.map(([k, v], i) => h_flex().gap(10)
        .child(div().w(96).flex_none().text_size(12).text_color(t.dim).child(k))
        .child(div().flex_1().text_size(12.5).text_color(t.foreground).child(selectable(`info-has-${i}`, v)))))))
      .child(this.section(t, "Update", ...this.steps(t, "up", d.update)))
      .child(this.section(t, "Remove", ...this.steps(t, "rm", d.remove)));
    return v_flex().size_full().min_h(0).child(header).child(body);
  }

  groupRow(t, g, depth, cx) {
    const open = openIds().includes(g.id);
    const n = g.skills.length + countSkills(g.children ?? []);
    return h_flex().id(`g-${g.id}`).h(30).pl(8 + depth * 16).pr(8).gap(6).items_center().rounded(5)
      .cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click(() => setShared(OPEN_KEY, toggleId(openIds(), g.id)))
      .child(div().w(10).text_size(10).text_color(t.dim).child(open ? "▾" : "▸"))
      .child(div().text_size(13.5).font_semibold().text_color(mix(t.foreground, t.muted, 0.7)).child(g.label))
      .child(div().text_size(11.5).text_color(t.dim).child(String(n)))
      .child(div().flex_1())
      .when(g.id.startsWith("plugin:"), (el) => el.child(this.infoButton(t, `info-${g.id}`, "About this plugin",
        () => openOverlay({ mod: "skill-tree", kind: "dialog", props: { info: { plugin: g.label } }, width: 520, height: 600 }))));
  }

  // The skill's info dialog, on top of this one.
  openInfo(s) {
    const cwd = this.entries.find((e) => e.address === this.sel)?.cwd ?? null;
    openOverlay({ mod: "skill-tree", kind: "dialog", props: { info: { skill: s, cwd } }, width: 520, height: 600 });
  }

  infoButton(t, id, tip, onOpen) {
    return div().id(id).flex_none().w(18).text_size(13).text_color(t.dim).cursor_pointer()
      .hover((st) => st.text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation?.(); onOpen(); })
      .child("ⓘ");
  }

  skillRow(t, s, depth) {
    return h_flex().id(`s-${s.name}`).h(26).pl(26 + depth * 16).pr(8).gap(8).items_center().rounded(5)
      .cursor_pointer().hover((st) => st.bg(t.hover)).tooltip(s.description || s.name)
      .on_click(() => this.openInfo(s))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(s.display))
      .child(this.infoButton(t, `info-${s.name}`, "About this skill", () => this.openInfo(s)));
  }

  rows(t, groups, depth, cx) {
    const out = [];
    for (const g of groups) {
      out.push(this.groupRow(t, g, depth, cx));
      if (!openIds().includes(g.id)) continue;
      out.push(...this.rows(t, g.children ?? [], depth + 1, cx));
      for (const s of g.skills) out.push(this.skillRow(t, s, depth));
    }
    return out;
  }

  renderDialog(t, cx) {
    const total = this.tree && !this.tree.error ? countSkills(this.tree.groups) : null;
    const header = h_flex().h(44).px(14).gap(8).items_center().flex_none().border_b(1).border_color(t.border)
      .child(div().text_size(14).font_semibold().text_color(t.foreground).child("Skills"))
      .child(div().text_size(12).text_color(t.dim).child(total == null ? "" : String(total)))
      .child(div().flex_1())
      .child(div().id("skills-reload").px(6).text_color(t.dim).cursor_pointer().tooltip("Reload")
        .hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => this.reload(cx, this.sel)).child("↻"))
      .child(div().id("skills-close").px(6).text_color(t.dim).cursor_pointer().tooltip("Close (Esc)")
        .hover((s) => s.text_color(t.foreground)).on_click(() => closeOverlay(props().overlay)).child("✕"));
    const picker = h_flex().px(14).py(8).gap(10).items_center().flex_none().border_b(1).border_color(t.border)
      .child(div().text_size(12).text_color(t.dim).child("Agent"))
      .child(this.picker(t))
      .child(div().flex_1())
      .child(div().text_size(11.5).text_color(t.dim).child(`${this.entries.length} agents`));
    let body;
    if (this.loading && !this.tree) {
      body = div().p(16).text_size(12.5).text_color(t.dim).child("Loading…");
    } else if (this.tree?.error) {
      body = v_flex().p(16).gap(10)
        .child(div().text_size(12.5).text_color(t.muted).child(this.tree.error))
        .child(div().id("show-global").w_auto().text_size(12.5).text_color(t.accent).cursor_pointer()
          .on_click((_e, cx) => this.reload(cx, GLOBAL)).child("Show Global"));
    } else {
      body = v_flex().id("skills-body").flex_1().min_h(0).overflow_y_scrollbar().px(6).py(6)
        .children(this.rows(t, this.tree?.groups ?? [], 0, cx));
    }
    return v_flex().size_full().min_h(0).child(header).child(picker).child(body);
  }

  render(cx) {
    const t = theme();
    if (this.info) return this.renderInfo(t);
    if (this.dialog) return this.renderDialog(t, cx);
    const now = focusedAddress();
    if (now !== this.watching) this.refreshCount(cx, now);
    return this.renderButton(t);
  }
}
