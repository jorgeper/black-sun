// black-sun's settings, a dialog opened from the gear in the Spaces header (spaces-tree).
// Sidebar sections are shown and hidden with Herdr's own layout.toggle (kept in the layout).
// Naming and usage settings go in shared state "black-sun.settings" (see model.js), which
// spaces-tree and weekly-usage read live. "Add missing keys" writes the layout's section of
// keys.json, only when clicked. Yolo mode lives in programs.json (Herdr's start commands for every
// menu and layout): the switch reads it there and writes it only when flipped. The look (theme,
// fonts) is Herdr's: a link opens Settings → Look.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, layout, props, closeOverlay, shared, setShared, run, keys, appHome, readTextFile, writeTextFile } from "herdr";
import { KEY, DEFAULTS, normalize, USAGE_MINUTES, ROW_RANGE, TAB_RANGE, hotkeyState, addHotkeys, applyYolo, yoloState } from "./model.js";

const PROGRAMS = () => `${appHome()}/programs.json`;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The layout's sidebar blocks a person can hide.
const SECTIONS = [
  { id: "agents", label: "Agents list" },
  { id: "skills", label: "Skills" },
  { id: "mcps", label: "MCP" },
  { id: "usage", label: "Weekly usage" },
];

// "cmd-shift-r" -> "⌘⇧R".
const pretty = (k) => k.split("-").map((p) => ({ cmd: "⌘", shift: "⇧", ctrl: "⌃", alt: "⌥" }[p] ?? p.toUpperCase())).join("");

export default class BlackSunSettings extends View {
  init(_props, cx) {
    this.keysNote = null;
    this.yoloNote = null;
    // Yolo: true, false, "some" (one of the two), null (programs.json unreadable), undefined (reading).
    cx.spawn(async (cx) => {
        try { this.yolo = yoloState(await readTextFile(PROGRAMS())); } catch { this.yolo = null; }
        cx.notify();
    });
  }

  setYolo(on, cx) {
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(PROGRAMS());
        const next = applyYolo(text, on);
        if (next) await writeTextFile(PROGRAMS(), next, text);
        this.yolo = yoloState(next ?? text);
        this.yoloNote = null;
        // Menus keep the agents' start commands they last found (new-menu's cache): ask again.
        setShared("new-menu.agents", {});
      } catch (e) {
        this.yoloNote = String(e?.message ?? e);
      }
      cx.notify();
    });
  }

  get s() { return normalize(shared(KEY)); }
  set(patch) { setShared(KEY, normalize({ ...this.s, ...patch })); }

  addKeys(cx) {
    cx.spawn(async (cx) => {
      const path = `${appHome()}/keys.json`;
      try {
        const text = await readTextFile(path);
        const r = addHotkeys(text ?? "{}", shared("layout") ?? "black-sun");
        if (r.text) await writeTextFile(path, r.text, text);
        this.keysNote = [
          r.added.length ? `Added ${r.added.map(pretty).join(", ")}.` : "Nothing to add.",
          r.taken.length ? `${r.taken.map(pretty).join(", ")} already does something else, so it was left alone.` : "",
        ].filter(Boolean).join(" ");
      } catch (e) {
        this.keysNote = String(e?.message ?? e);
      }
      cx.notify();
    });
  }

  render(cx) {
    const t = theme();
    const s = this.s;
    const label = (text, sub) => v_flex().flex_1().min_w(0).gap(1)
      .child(div().text_size(12.8).text_color(t.foreground).child(text))
      .when(!!sub, (el) => el.child(div().text_size(11.5).text_color(t.dim).child(sub)));
    const row = (id, text, sub, control) => h_flex().id(id).min_h(38).px(14).py(5).gap(12).items_center()
      .child(label(text, sub)).child(control);
    const heading = (text) => div().px(14).pt(14).pb(4).text_size(11).font_medium().text_color(t.dim).child(text);

    // A switch: accent when on.
    const toggle = (id, on, flip) => div().id(id).w(32).h(18).flex_none().rounded(9).p(2).cursor_pointer()
      .bg(on ? t.accent : t.border).flex().when(on, (el) => el.justify_end())
      .on_click((_e, cx) => { flip(cx); cx.notify(); })
      .child(div().size(14).rounded(7).bg(t.foreground));
    // − n +
    const stepper = (id, value, [lo, hi], put) => {
      const btn = (dir, text, ok) => div().id(`${id}-${dir}`).w(24).h(22).flex().items_center().justify_center().rounded(5)
        .text_color(ok ? t.muted : t.dim + "66")
        .when(ok, (el) => el.cursor_pointer().hover((st) => st.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => { put(value + (dir === "up" ? 1 : -1)); cx.notify(); }))
        .child(text);
      return h_flex().flex_none().items_center().gap(2).rounded(6).border(1).border_color(t.border).bg(t.raised)
        .child(btn("down", "−", value > lo))
        .child(div().w(18).text_size(12.5).text_center().text_color(t.foreground).child(String(value)))
        .child(btn("up", "+", value < hi));
    };
    // 1m 5m 15m 30m
    const choice = (id, values, current, put) => h_flex().flex_none().rounded(6).border(1).border_color(t.border).bg(t.raised).p(2).gap(2)
      .children(values.map((v) => div().id(`${id}-${v}`).px(8).h(20).flex().items_center().rounded(4).text_size(12).cursor_pointer()
        .text_color(v === current ? t.foreground : t.muted)
        .when(v === current, (el) => el.bg(t.selected))
        .when(v !== current, (el) => el.hover((st) => st.bg(t.hover)))
        .on_click((_e, cx) => { put(v); cx.notify(); })
        .child(`${v}m`)));
    const link = (id, text, go) => div().id(id).flex_none().text_size(12.5).text_color(t.accent).cursor_pointer()
      .hover((st) => st.underline()).on_click(go).child(text);

    const hot = hotkeyState(keys(), shared("layout") ?? "black-sun");
    const missing = hot.filter((h) => !h.bound).length;

    const lay = layout();
    const body = v_flex().id("bss-body").flex_1().min_h(0).overflow_y_scrollbar().pb(14)
      .child(heading("SIDEBAR"))
      .children(SECTIONS.filter((x) => find(lay, x.id)).map((x) => {
        const shown = !find(lay, x.id)?.hidden;
        return row(`sec-${x.id}`, x.label, null, toggle(`sec-t-${x.id}`, shown, () => run("layout.toggle", { id: x.id })));
      }))
      .child(heading("NEW AGENTS"))
      .child(row("yolo", "Start Claude Code and Codex in yolo mode",
        this.yolo === null ? "Couldn't read programs.json"
          : this.yolo === "some" ? "Only one of them is set to start in yolo mode now; switch to set both"
          : "No permission prompts (Codex also skips its sandbox). Every new agent, from any menu or layout; running ones keep their mode",
        toggle("yolo-t", this.yolo === true, (cx) => { if (this.yolo !== undefined && this.yolo !== null) this.setYolo(this.yolo !== true, cx); })))
      .when(!!this.yoloNote, (el) => el.child(div().px(14).pt(2).text_size(11.5).text_color(t.blocked).child(this.yoloNote)))
      .child(heading("AGENT NAMES"))
      .child(row("n-sync", "Name agents after their titles", "Tab and row follow what each agent says it's doing; names you type stay",
        toggle("n-sync-t", s.sync, () => this.set({ sync: !s.sync }))))
      .child(row("n-row", "Words on a sidebar row", null, stepper("n-row-s", s.rowWords, ROW_RANGE, (v) => this.set({ rowWords: v }))))
      .child(row("n-tab", "Words on a tab", null, stepper("n-tab-s", s.tabWords, [TAB_RANGE[0], Math.min(TAB_RANGE[1], s.rowWords)], (v) => this.set({ tabWords: v }))))
      .child(row("n-haiku", "Shorten long tab names with Haiku", "Sends only the title; off cuts words instead",
        toggle("n-haiku-t", s.haiku, () => this.set({ haiku: !s.haiku }))))
      .child(heading("WEEKLY USAGE"))
      .child(row("u-every", "Refresh Claude and Fable every", "Codex reads its own log every minute",
        choice("u-every-c", USAGE_MINUTES, s.usageMinutes, (v) => this.set({ usageMinutes: v }))))
      .child(heading("HOTKEYS"))
      .children(hot.map((h) => row(`k-${h.action}`, h.label, null,
        div().flex_none().text_size(12).text_color(h.bound ? t.muted : t.dim).child(h.bound ? pretty(h.bound) : `not set (${pretty(h.keys)})`))))
      .when(missing > 0, (el) => el.child(row("k-add", `${missing} not set`, "Adds them to keys.json, in this layout's section",
        link("k-add-l", "Add missing keys", (_e, cx) => this.addKeys(cx)))))
      .when(!!this.keysNote, (el) => el.child(div().px(14).pt(2).text_size(11.5).text_color(t.muted).child(this.keysNote)))
      .child(heading("LOOK"))
      .child(row("look", "Theme, fonts and sizes", "Herdr's own settings",
        link("look-l", "Open Settings → Look", () => { closeOverlay(props()?.overlay); run("app.settings", { section: "look" }); })));

    const header = h_flex().h(44).px(14).gap(8).items_center().flex_none().border_b(1).border_color(t.border)
      .child(div().text_size(14).font_semibold().text_color(t.foreground).child("black-sun settings"))
      .child(div().flex_1())
      .child(div().id("bss-reset").px(6).text_size(12).text_color(t.dim).cursor_pointer().tooltip("Agent names and usage back to their defaults")
        .hover((st) => st.text_color(t.foreground)).on_click((_e, cx) => { setShared(KEY, { ...DEFAULTS }); cx.notify(); }).child("Reset"))
      .child(div().id("bss-close").px(6).text_color(t.dim).cursor_pointer().tooltip("Close (Esc)")
        .hover((st) => st.text_color(t.foreground)).on_click(() => closeOverlay(props()?.overlay)).child("✕"));

    return v_flex().size_full().min_h(0).bg(t.popover).text_size(13).child(header).child(body);
  }
}
