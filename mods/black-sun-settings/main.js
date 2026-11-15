// black-sun's settings, a window opened from the gear in the Spaces header (spaces-tree): dragged
// by its title bar, it opens again where it was left, and − / + in the title bar make it smaller
// or bigger (a size that is kept; the window is opened again at the new size, in its place).
// Sidebar sections are shown and hidden with Herdr's own layout.toggle (kept in the layout).
// Naming and usage settings go in shared state "black-sun.settings" (see model.js), which
// spaces-tree and weekly-usage read live. "Add missing keys" writes the layout's section of
// keys.json, only when clicked. Yolo mode lives in programs.json (Herdr's start commands for every
// menu and layout): the switch reads it there and writes it only when flipped. The look (theme,
// fonts) is Herdr's: a link opens Settings → Look.
// Space tags (shared "black-sun.tags", see tags.js) are made here: add, name, color, remove, and
// how spaces-tree shows them (a square, or the whole row), and which one a new space starts with.
// A space gets its tag from its menu.
// Color palettes (shared "black-sun.palettes", see palettes.js): one is selected, and every color
// chosen here (a tag's, the highlight) is one of its colors, kept by its place in the palette, so
// selecting another palette or changing one of its colors recolors them (repaint()). Palettes are
// added (as a copy), renamed, removed, and their colors changed with a picker (hue, saturation,
// brightness, or a hex code).
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, SliderState, Slider, SliderTrack, SliderIndicator, SliderThumb } from "gpui-base";
import { theme, layout, props, openOverlay, closeOverlay, shared, setShared, run, keys, appHome, readTextFile, writeTextFile } from "herdr";
import { KEY as TAGS, normalize as tagState, tagName, addTag, updateTag, removeTag, recolor, setStyle, setDefault, ink } from "./tags.js";
import { KEY as PALETTES, normalize as paletteState, paletteName, current, select, duplicate, remove, rename, setColor, restore, nearest, toHsv, fromHsv } from "./palettes.js";
import { KEY, DEFAULTS, resized, normalize, USAGE_MINUTES, ROW_RANGE, TAB_RANGE, hotkeyState, numberKeyState, NUMBER_KEYS, addHotkeys, applyYolo, yoloState } from "./model.js";

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
const stop = (_e, cx) => cx.stop_propagation();
const pretty = (k) => k.split("-").map((p) => ({ cmd: "⌘", shift: "⇧", ctrl: "⌃", alt: "⌥" }[p] ?? p.toUpperCase())).join("");

export default class BlackSunSettings extends View {
  init(_props, cx) {
    this.keysNote = null;
    this.yoloNote = null;
    // One name field per tag (a field is made here or in a click, never while drawing).
    this.names = new Map();
    for (const tag of tagState(shared(TAGS)).tags) this.nameField(tag);
    // A window doesn't take the keyboard by itself; with it, Esc closes.
    this.handle = cx.focus_handle();
    this.handle.focus();
    // Palettes: whether the list is open, and the picker: the place (slot) of the color being
    // changed in the selected palette, its sliders and hex field, and the color while a slider
    // is dragged (draft), which is saved when the slider is let go.
    this.palOpen = false;
    this.slot = null;
    this.draft = null;
    this.hue = SliderState.new({ min: 0, max: 360, step: 1, value: 0 });
    this.sat = SliderState.new({ min: 0, max: 100, step: 1, value: 0 });
    this.val = SliderState.new({ min: 0, max: 100, step: 1, value: 0 });
    for (const slider of [this.hue, this.sat, this.val]) {
      slider.on("change", (_v, cx) => {
        if (this.slot === null || this.loading) return;
        this.draft = fromHsv({ h: this.hue.value(), s: this.sat.value(), v: this.val.value() });
        cx.notify();
      });
      slider.on("release", (_v, cx) => {
        if (this.slot === null || !this.draft) return;
        const color = this.draft;
        this.store(color);
        this.hex.set_value(color);
        cx.notify();
      });
    }
    this.hex = InputState.new({ placeholder: "#rrggbb", value: "" });
    this.hex.on("change", (_e, cx) => {
      const typed = this.hex.value().trim();
      if (this.slot === null || !/^#?[0-9a-f]{6}$/i.test(typed)) return;
      const color = (typed[0] === "#" ? typed : `#${typed}`).toLowerCase();
      if (color === current(this.pal).colors[this.slot]) return;
      this.load(color, false);
      this.store(color);
      cx.notify();
    });
    this.paletteField(current(this.pal));
    // From before there were palettes: the highlight gets its place in the palette (the closest
    // color's), and so does every tag.
    const raw = shared(KEY);
    if (!Number.isInteger(raw?.highlightSlot)) this.set({ highlightSlot: nearest(current(this.pal).colors, this.s.highlight) });
    this.repaint();
    // Yolo: true, false, "some" (one of the two), null (programs.json unreadable), undefined (reading).
    cx.spawn(async (cx) => {
        try { this.yolo = yoloState(await readTextFile(PROGRAMS())); } catch { this.yolo = null; }
        cx.notify();
    });
  }

  // A tag's name field: typing renames the tag.
  nameField(tag) {
    const input = InputState.new({ placeholder: "Tag name", value: tag.name });
    input.on("change", (_e, cx) => {
      setShared(TAGS, updateTag(tagState(shared(TAGS)), tag.id, { name: input.value() }));
      cx.notify();
    });
    input.on("focus", (_e, cx) => { this.naming = tag.id; cx.notify(); });
    input.on("blur", (_e, cx) => { if (this.naming === tag.id) this.naming = null; cx.notify(); });
    this.names.set(tag.id, input);
    return input;
  }

  get pal() { return paletteState(shared(PALETTES)); }

  // Every tag and the highlight in the selected palette's colors (written only when one changes).
  repaint() {
    const colors = current(this.pal).colors;
    const tags = tagState(shared(TAGS));
    const next = recolor(tags, colors);
    if (JSON.stringify(next) !== JSON.stringify(tags)) setShared(TAGS, next);
    const s = this.s;
    const highlight = colors[s.highlightSlot % colors.length];
    if (highlight !== s.highlight) this.set({ highlight });
  }

  putPalettes(next) {
    setShared(PALETTES, next);
    this.repaint();
  }

  // The selected palette's name field: typing renames it.
  paletteField(p) {
    const input = InputState.new({ placeholder: "Palette name", value: p.name });
    input.on("change", (_e, cx) => { setShared(PALETTES, rename(this.pal, p.id, input.value())); cx.notify(); });
    this.paletteName = { id: p.id, input };
  }

  // The picker opens on a color of the selected palette (or closes: null).
  pick(slot) {
    this.slot = slot;
    this.draft = null;
    if (slot !== null) this.load(current(this.pal).colors[slot], true);
  }

  // The sliders (and the hex field) showing a color.
  load(color, hexToo) {
    const { h, s, v } = toHsv(color);
    this.loading = true;
    this.hue.set_value(h); this.sat.set_value(s); this.val.set_value(v);
    if (hexToo) this.hex.set_value(color);
    this.loading = false;
  }

  // The picked color saved into the selected palette.
  store(color) {
    this.draft = null;
    if (this.slot !== null) this.putPalettes(setColor(this.pal, this.pal.current, this.slot, color));
  }

  // The COLORS section: the selected palette (open: every palette to choose from, and the selected
  // one's name, colors and picker), and the highlight color.
  paletteRows(t, row, link) {
    const pal = this.pal;
    const cur = current(pal);
    const s = this.s;
    const strip = (p) => h_flex().flex_none().rounded(4).overflow_hidden().children(p.colors.map((c) => div().w(14).h(14).flex_none().bg(c)));
    const choose = (id) => { this.pick(null); this.putPalettes(select(this.pal, id)); this.paletteField(current(this.pal)); };
    const line = (p) => h_flex().id(`pal-${p.id}`).h(30).flex_none().px(14).gap(10).items_center().cursor_pointer()
      .when(p.id === cur.id, (el) => el.bg(t.selected))
      .when(p.id !== cur.id, (el) => el.hover((st) => st.bg(t.hover)))
      .on_click((_e, cx) => { if (p.id !== this.pal.current) choose(p.id); cx.notify(); })
      .child(div().w(10).flex_none().text_size(9).text_color(t.accent).child(p.id === cur.id ? "●" : ""))
      .child(div().flex_1().min_w(0).truncate().text_size(12.8).text_color(p.id === cur.id ? t.foreground : t.muted).child(paletteName(p)))
      .child(strip(p));
    const shown = (i) => (i === this.slot && this.draft ? this.draft : cur.colors[i]);
    const bar = (id, state, colorAt) => v_flex().gap(2)
      .child(h_flex().h(8).rounded(4).overflow_hidden().children(Array.from({ length: 24 }, (_x, i) => div().flex_1().h_full().bg(colorAt(i / 23)))))
      .child(Slider.new(state).child(SliderTrack.new(state).flex().items_center().h(18).w_full().child(
        SliderIndicator.new(state).relative().w_full().h(4).rounded(2).bg(t.border)
          .child(SliderThumb.new(state).id(`${id}-thumb`).size(14).rounded(7).bg(t.foreground).ml(-7)))));
    const picker = () => {
      const hsv = { h: this.hue.value(), s: this.sat.value(), v: this.val.value() };
      const named = (text, el) => h_flex().gap(8).items_center().child(div().w(66).flex_none().text_size(11.5).text_color(t.dim).child(text)).child(el.flex_1().min_w(0));
      return h_flex().gap(14).items_start()
        .child(v_flex().w(96).flex_none().gap(6)
          .child(div().h(52).rounded(8).bg(shown(this.slot)))
          .child(Input.new(this.hex).h(26).px(7).rounded(6).border_1().border_color(t.input).bg(t.popover).text_size(12).text_color(t.foreground)))
        .child(v_flex().flex_1().min_w(0).gap(6)
          .child(named("Hue", bar("pick-hue", this.hue, (f) => fromHsv({ h: f * 360, s: 100, v: 100 }))))
          .child(named("Saturation", bar("pick-sat", this.sat, (f) => fromHsv({ h: hsv.h, s: f * 100, v: Math.max(hsv.v, 35) }))))
          .child(named("Brightness", bar("pick-val", this.val, (f) => fromHsv({ h: hsv.h, s: hsv.s, v: f * 100 })))));
    };
    const editor = () => v_flex().id("pal-edit").mx(14).my(8).p(10).gap(10).rounded(8).border(1).border_color(t.border).bg(t.background)
      .child(h_flex().gap(12).items_center()
        .child(Input.new(this.paletteName.input).flex_1().min_w(0).h(28).px(8).rounded(7).border_1().border_color(t.input)
          .bg(t.popover).text_size(12.5).text_color(t.foreground))
        .child(link("pal-copy", "Duplicate", (_e, cx) => {
          this.pick(null);
          this.putPalettes(duplicate(this.pal, this.pal.current).state);
          this.paletteField(current(this.pal));
          cx.notify();
        }))
        .when(pal.palettes.length > 1, (el) => el.child(div().id("pal-rm").flex_none().text_size(12.5).text_color(t.dim).cursor_pointer()
          .hover((st) => st.text_color(t.blocked)).tooltip("Remove this palette; tags and the highlight take the colors of the one before it")
          .on_click((_e, cx) => {
            this.pick(null);
            this.putPalettes(remove(this.pal, this.pal.current));
            this.paletteField(current(this.pal));
            cx.notify();
          }).child("Remove"))))
      .child(h_flex().gap(5).items_center().children(cur.colors.map((_c, i) => div().id(`pal-color-${i}`).size(24).flex_none().rounded(6).bg(shown(i)).cursor_pointer()
        .border(2).border_color(i === this.slot ? t.foreground : shown(i))
        .hover((st) => st.opacity(0.85))
        .on_click((_e, cx) => { this.pick(i === this.slot ? null : i); cx.notify(); }))))
      .when(this.slot === null, (el) => el.child(div().text_size(11.5).text_color(t.dim).child("Click a color to change it. Tags and the highlight using it change with it.")))
      .when(this.slot !== null, (el) => el.child(picker()));
    return [
      h_flex().id("pal-now").min_h(38).px(14).py(5).gap(12).items_center()
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().text_size(12.8).text_color(t.foreground).child(`Palette: ${paletteName(cur)}`))
          .child(div().text_size(11.5).text_color(t.dim).child("Tags and the highlight take their colors from it; another palette recolors them")))
        .child(strip(cur))
        .child(link("pal-open", this.palOpen ? "Done" : "Change", (_e, cx) => { this.palOpen = !this.palOpen; if (!this.palOpen) this.pick(null); cx.notify(); })),
      ...(this.palOpen ? [
        ...pal.palettes.flatMap((p) => (p.id === cur.id ? [line(p), editor()] : [line(p)])),
        row("pal-restore", `${pal.palettes.length} palettes`, "Duplicate one to make your own",
          link("pal-restore-l", "Restore the built-in palettes", (_e, cx) => {
            this.pick(null);
            this.putPalettes(restore(this.pal));
            this.paletteField(current(this.pal));
            cx.notify();
          })),
      ] : []),
      row("hl", "Highlight color", "The focused agent in the sidebar, and the focused card and tab in grid view",
        h_flex().flex_none().gap(4).children(cur.colors.map((c, i) => div().id(`hl-${i}`).size(16).flex_none().rounded(5).bg(c).cursor_pointer()
          .border(2).border_color(i === s.highlightSlot ? t.foreground : c)
          .hover((st) => st.opacity(0.8))
          .on_click((_e, cx) => { this.set({ highlight: c, highlightSlot: i }); cx.notify(); })))),
      ...[["wash", "Gradients on spaces", "A space's row has its tag color coming in from the left, in place of the square"],
        ["fade", "Gradients on agents and terminals", "The focused one (sidebar row, grid view tab and card) starts in its space's tag color and fades into the highlight"],
        ["glow", "Show status as a glow on the right", "Yellow while an agent works, blue when it's done, red when it needs you, gray when idle, in place of the spinner and status icons: on its sidebar row and its tabs"],
        ["pulse", "Working agents pulse", "A working agent's glow slowly brightens and dims (needs the status glow)"]]
        .map(([key, text, sub]) => row(`hl-${key}`, text, sub,
          div().id(`hl-${key}-t`).w(32).h(18).flex_none().rounded(9).p(2).cursor_pointer()
            .bg(s[key] ? t.accent : t.border).flex().when(s[key], (el) => el.justify_end())
            .on_click((_e, cx) => { this.set({ [key]: !s[key] }); cx.notify(); })
            .child(div().size(14).rounded(7).bg(t.foreground)))),
    ];
  }

  // Bigger (1) or smaller (-1): the size is kept, and the window opened again at it, in its place.
  resize(dir) {
    const size = resized(this.s.windowSize, dir);
    if (size[0] === this.s.windowSize[0] && size[1] === this.s.windowSize[1]) return;
    this.set({ windowSize: size });
    openOverlay({ mod: "black-sun-settings", kind: "window", key: "black-sun-settings", width: size[0], height: size[1] });
  }

  // The SPACE TAGS section: how tags show, the tag new spaces start with, each tag (color, name,
  // colors to pick, remove), Add tag.
  tagRows(t, row, choiceOf, link) {
    const tags = tagState(shared(TAGS));
    const put = (next) => setShared(TAGS, next);
    // A tag's color is one of the selected palette's.
    const colors = current(this.pal).colors;
    const swatch = (tag, c, i) => div().id(`tag-${tag.id}-${i}`).size(16).flex_none().rounded(5).bg(c).cursor_pointer()
      .border(2).border_color(i === tag.slot ? t.foreground : c)
      .hover((st) => st.opacity(0.8))
      .on_click((_e, cx) => { put(updateTag(tagState(shared(TAGS)), tag.id, { color: c, slot: i })); cx.notify(); });
    const tagRow = (tag) => {
      const input = this.names.get(tag.id);
      return h_flex().id(`tag-${tag.id}`).min_h(40).px(14).py(4).gap(10).items_center()
        // What a space with this tag looks like as a row.
        .child(div().w(52).h(22).flex_none().rounded(6).bg(tag.color).flex().items_center().justify_center()
          .text_size(11.5).font_medium().text_color(ink(tag.color)).child("Aa"))
        .child(input
          ? Input.new(input).flex_1().min_w(0).h(28).px(8).rounded(7).border_1().border_color(this.naming === tag.id ? t.accent : t.input)
              .bg(t.background).text_size(12.5).text_color(t.foreground)
          : div().flex_1().min_w(0).truncate().child(tag.name))
        .child(h_flex().flex_none().gap(4).children(colors.map((c, i) => swatch(tag, c, i))))
        .child(div().id(`tag-${tag.id}-rm`).flex_none().px(4).text_color(t.dim).cursor_pointer().tooltip("Remove this tag; its spaces become untagged")
          .hover((st) => st.text_color(t.blocked))
          .on_click((_e, cx) => { this.names.delete(tag.id); put(removeTag(tagState(shared(TAGS)), tag.id)); cx.notify(); })
          .child("✕"));
    };
    return [
      row("tag-style", "Show a space's tag as", "A colored square before its name, or the whole row in the tag's color",
        choiceOf("tag-style-c", [["square", "Square"], ["row", "Row"]], tags.style, (v) => put(setStyle(tagState(shared(TAGS)), v)))),
      ...(tags.tags.length ? [row("tag-default", "New spaces start with", null,
        choiceOf("tag-default-c", [["", "No tag"], ...tags.tags.map((x) => [x.id, [...tagName(x)].slice(0, 14).join("")])], tags.default ?? "",
          (v) => put(setDefault(tagState(shared(TAGS)), v || null))))] : []),
      ...tags.tags.map(tagRow),
      row("tag-add", tags.tags.length ? `${tags.tags.length} tag${tags.tags.length === 1 ? "" : "s"}` : "No tags yet",
        "Give a space its tag from its right-click menu",
        link("tag-add-l", "Add tag", (_e, cx) => {
          const { state, id } = addTag(tagState(shared(TAGS)), "", colors);
          put(state);
          this.nameField(state.tags.find((x) => x.id === id)).focus();
          cx.notify();
        })),
    ];
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
    // One of a few: [value, label] pairs.
    const choiceOf = (id, options, current, put) => h_flex().flex_none().rounded(6).border(1).border_color(t.border).bg(t.raised).p(2).gap(2)
      .children(options.map(([v, text]) => div().id(`${id}-${v}`).px(8).h(20).flex().items_center().rounded(4).text_size(12).cursor_pointer()
        .text_color(v === current ? t.foreground : t.muted)
        .when(v === current, (el) => el.bg(t.selected))
        .when(v !== current, (el) => el.hover((st) => st.bg(t.hover)))
        .on_click((_e, cx) => { put(v); cx.notify(); })
        .child(text)));
    // 1m 5m 15m 30m
    const choice = (id, values, current, put) => choiceOf(id, values.map((v) => [v, `${v}m`]), current, put);
    const link = (id, text, go) => div().id(id).flex_none().text_size(12.5).text_color(t.accent).cursor_pointer()
      .hover((st) => st.underline()).on_click(go).child(text);

    const hot = hotkeyState(keys(), shared("layout") ?? "black-sun");
    const digits = numberKeyState(keys(), shared("layout") ?? "black-sun");
    const missing = hot.filter((h) => !h.bound).length + (NUMBER_KEYS.length - digits);

    const lay = layout();
    // A press in the body isn't a drag of the window; the title bar is what moves it.
    const body = v_flex().id("bss-body").flex_1().min_h(0).overflow_y_scrollbar().pb(14).on_mouse_down("left", stop)
      .child(heading("SIDEBAR"))
      .children(SECTIONS.filter((x) => find(lay, x.id)).map((x) => {
        const shown = !find(lay, x.id)?.hidden;
        return row(`sec-${x.id}`, x.label, null, toggle(`sec-t-${x.id}`, shown, () => run("layout.toggle", { id: x.id })));
      }))
      .child(row("terminals", "List terminals too", "A space shows its plain terminals as well as its agents",
        toggle("terminals-t", s.terminals, () => this.set({ terminals: !s.terminals }))))
      .child(row("empty-add", "Offer to add in empty spaces", "A space with no agents shows an “Add terminal or agent” row: the same menu as + in the tab bar",
        toggle("empty-add-t", s.emptyAdd, () => this.set({ emptyAdd: !s.emptyAdd }))))
      .child(row("keep-spaces", "Spaces stay when empty", "Closing a space's last terminal or agent leaves the space, empty, until you close the space itself",
        toggle("keep-spaces-t", s.keepSpaces, () => this.set({ keepSpaces: !s.keepSpaces }))))
      .child(row("numbers", "Numbers", "The number before each agent and terminal, and where ⌘1–9 go: counted down the whole sidebar, or within each space",
        choiceOf("numbers-c", [["global", "Global"], ["local", "Per space"]], s.numbers, (v) => this.set({ numbers: v }))))
      .child(heading("COLORS"))
      .children(this.paletteRows(t, row, link))
      .child(heading("SPACE TAGS"))
      .children(this.tagRows(t, row, choiceOf, link))
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
      .child(row("k-digits", "Go to an agent or terminal by its number", s.numbers === "global" ? "Its number in the whole sidebar" : "Its number in the space you are in",
        div().flex_none().text_size(12).text_color(digits === 9 ? t.muted : t.dim).child(digits === 9 ? "⌘1–9" : digits ? `${digits} of 9 set (⌘1–9)` : "not set (⌘1–9)")))
      .when(missing > 0, (el) => el.child(row("k-add", `${missing} not set`, "Adds them to keys.json, in this layout's section",
        link("k-add-l", "Add missing keys", (_e, cx) => this.addKeys(cx)))))
      .when(!!this.keysNote, (el) => el.child(div().px(14).pt(2).text_size(11.5).text_color(t.muted).child(this.keysNote)))
      .child(heading("LOOK"))
      .child(row("look", "Theme, fonts and sizes", "Herdr's own settings",
        link("look-l", "Open Settings → Look", () => { closeOverlay(props()?.overlay); run("app.settings", { section: "look" }); })));

    const header = h_flex().h(44).px(14).gap(8).items_center().flex_none().border_b(1).border_color(t.border)
      .child(div().text_size(14).font_semibold().text_color(t.foreground).child("black-sun settings"))
      .child(div().flex_1())
      .child(div().id("bss-reset").px(6).text_size(12).text_color(t.dim).cursor_pointer().tooltip("Agent names, usage and the highlight color back to their defaults")
        .hover((st) => st.text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click((_e, cx) => { setShared(KEY, { ...DEFAULTS, windowSize: s.windowSize }); this.repaint(); cx.notify(); }).child("Reset"))
      .child(h_flex().flex_none().items_center().gap(2).rounded(6).border(1).border_color(t.border).bg(t.raised).on_mouse_down("left", stop)
        .child(div().id("bss-smaller").w(24).h(22).flex().items_center().justify_center().rounded(5).text_color(t.muted).cursor_pointer()
          .hover((st) => st.bg(t.hover).text_color(t.foreground)).tooltip("Smaller window").on_click(() => this.resize(-1)).child("−"))
        .child(div().id("bss-bigger").w(24).h(22).flex().items_center().justify_center().rounded(5).text_color(t.muted).cursor_pointer()
          .hover((st) => st.bg(t.hover).text_color(t.foreground)).tooltip("Bigger window").on_click(() => this.resize(1)).child("+")))
      .child(div().id("bss-close").px(6).text_color(t.dim).cursor_pointer().tooltip("Close (Esc)")
        .hover((st) => st.text_color(t.foreground)).on_mouse_down("left", stop).on_click(() => closeOverlay(props()?.overlay)).child("✕"));

    return v_flex().id("bss").track_focus(this.handle).size_full().min_h(0).bg(t.popover).text_size(13)
      .on_key_down((e) => { if (e.key === "escape") closeOverlay(props()?.overlay); })
      .child(header).child(body);
  }
}
