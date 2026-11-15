// black-sun's grid view: terminals from any spaces in a grid in the work area, in place of
// the shown space's tab. The state is shared "black-sun.sbs" = { on, arrange, carry, root } (see
// model.js). One mod, drawn in several places of the layout, told apart by props().part:
//   "switch"   the buttons at the right end of the top bar: Arrange (while on) and the switch. Its
//              copy is always shown, so it also keeps the layout in step with the state
//              (layout.set): which view shows, and the grid, rows and columns of cards
//              nested as the state's tree says, whose dividers drag to resize. It takes the mod's commands: side-by-side.toggle,
//              .arrange, .row (everything in one row), .add-<terminal>, .remove-<terminal>.
//   "tabs"     the top bar while the mode is on: no tabs (the cards' titles do that), only + to add
//              any terminal.
//   "head"     a card's header: props().terminal's space, name and status; a click focuses it, ✕
//              takes it out, and so does its right-click menu; dragging it picks the card up for
//              the arrange view.
//   "arrange"  the arrange view: the whole grid as small tiles (icon, name, space). Drag a tile onto
//              another tile's edge to put it beside that tile; closer to the edge, beside the
//              bigger group that ends there, up to the whole grid (the strip shows how far it
//              spans). A drop is shown as the tile the terminal would become, where and as big
//              as it would be; the tile under the pointer has thin outlines of its drop zones. A tile's middle swaps; drag the gaps to resize; right-click a tile for its
//              menu. Whatever is carried (from here, a card or the sidebar) follows the pointer.
//   "empty"    what the grid shows with nothing in it.
//   "picker"   the + popup: every terminal not shown yet, by space.
// Terminals are added from the sidebar too: an agent's or a space's right-click menu
// (sidebar-menu), or by dragging an agent row (spaces-tree).
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, shared, setShared, run, exec, theme, layout, panes, spaces, focused, window, settings, openOverlay, closeOverlay, nextCommand } from "herdr";
import { layers, glowing } from "./fade.js";
import { KEY, normalize, has, add, remove, setOn, inRow, isRow, nodeId, flat, place, find, prune, signature, arrange, depth, NEST, weights, geometry, hit, zones, landing, gapAt, resize, terminals, entries } from "./model.js";

// Icons: the grid view itself, arranging it, and everything side by side in one row.
const GRID = "mods/side-by-side/grid.svg";
const ARRANGE = "mods/side-by-side/arrange.svg";
const COLUMNS = "mods/side-by-side/columns.svg";
// The arrange view's picture: space around the grid, between tiles, and above for its title.
const BOX = { pad: 18, gap: 12, top: 52 };
// How far a press must move before it is a drag.
const DRAG = 6;
const state = () => normalize(shared(KEY));
const all = () => terminals(panes(), spaces());

// A space's tag color (black-sun's space tags), or null.
function tagColor(space) {
  const tags = shared("black-sun.tags");
  const id = tags?.spaces?.[space];
  return (Array.isArray(tags?.tags) ? tags.tags : []).find((x) => x.id === id)?.color ?? null;
}

// black-sun's highlight color (black-sun-settings, "Highlight color"): what marks the focused one.
function highlight() {
  const c = shared("black-sun.settings")?.highlight;
  return /^#[0-9a-f]{6}$/i.test(c) ? c : "#8b7cf6";
}

function programIcon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function statusMark(t, status) {
  if (status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
  if (status === "blocked" || status === "done") return div().size(6).flex_none().rounded(3).bg(t[status]);
  return null;
}

const stop = (_e, cx) => cx.stop_propagation();

// What is drawn behind a terminal's tab or card header (fade.js, as on its sidebar row): the
// focused one fades from its space's tag color into the highlight, and what an agent is doing
// glows in from the right. `on`: it is the focused one. Returns the elements, and whether the fade is there.
function behind(e, on, hl, tag) {
  const opts = shared("black-sun.settings");
  const list = layers({ focused: on, tag, highlight: hl, status: e.status, opts });
  return {
    faded: on && !!tag && opts?.fade !== false,
    // With status shown as the glow, no spinner or dot marks it.
    glowing: glowing(opts),
    els: list.map((l) => {
      const el = h_flex().absolute().left(0).right(0).top(0).bottom(0).children(l.slices.map((x) => div().flex_basis(0).flex_grow(x.grow).min_w(0).h_full().bg(x.color)));
      return l.loop ? el.loop("opacity", l.loop) : el;
    }),
  };
}

// A terminal's right-click menu (sidebar-menu's): rename, close, and take out of grid view.
const menu = (e) => openOverlay({ mod: "sidebar-menu", kind: "popup", width: 230, height: 230, props: { kind: "agent", target: { terminal: e.terminal, tab: e.tab, pane: e.pane } } });

export default class SideBySide extends View {
  init(_props, cx) {
    this.sent = null;
    this.sentAt = 0;
    const part = props()?.part;
    if (part === "picker") { this.handle = cx.focus_handle(); this.handle.focus(); }
    // The layout follows the state; looked at again shortly after a change in case it didn't land.
    if (part === "switch") {
      cx.timer.every(2000, (cx) => { if (this.pending()) cx.notify(); });
      // A drag or the arrange view left open by the last run isn't going on any more.
      // A state in an earlier shape (rows, or a flat list) is rewritten, so every mod reads the tree.
      const s = state();
      const raw = shared(KEY);
      if (s.carry || s.arrange || (raw && typeof raw === "object" && !("root" in raw))) setShared(KEY, { ...s, carry: null, arrange: false });
    }
    // Keys and scripts: side-by-side.toggle, side-by-side.add-<terminal>, side-by-side.remove-<terminal>.
    if (part === "switch") cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "toggle") this.toggle();
        else if (c === "arrange") this.toggleArrange();
        else if (c === "row") this.sideBySide();
        else if (c.startsWith("add-")) setShared(KEY, add(state(), c.slice(4)));
        else if (c.startsWith("remove-")) setShared(KEY, remove(state(), c.slice(7)));
        cx.notify();
      }
    });
  }

  // The layout this state asks for, when the one shown differs.
  pending() {
    const live = new Set(panes().filter((p) => p.terminal).map((p) => p.terminal));
    // The card with the keyboard has its border in the highlight color, so this is looked at
    // again whenever the keyboard moves. The shown tab's focused pane has it too (the layout's own
    // pane look, kept in step with the color).
    return arrange(layout(), state(), live, highlight(), focused()?.terminal ?? null);
  }

  // Brings the layout in step with the state. The same change isn't sent twice within a moment.
  sync() {
    const next = this.pending();
    if (!next) { this.sent = null; return; }
    const sig = signature(next);
    if (this.sent === sig && Date.now() - this.sentAt < 1500) return;
    this.sent = sig;
    this.sentAt = Date.now();
    // A grid with splits inside splits nests deeper than run() takes: that one goes through
    // Herdr's own command line, which has no such limit.
    const args = { layout: next };
    if (depth(args) > NEST) exec("herdr-app", ["do", "layout.set", JSON.stringify(args)]).catch(() => {});
    else run("layout.set", args);
  }

  toggle() {
    const s = state();
    const on = !s.on;
    setShared(KEY, setOn(s, on));
    // The keyboard goes where the eyes go: the first item, or back to the shown tab's pane.
    if (on) {
      const first = entries(s, all())[0];
      if (first) run("pane.focus", { terminal: first.terminal });
    } else {
      const tab = spaces().find((x) => x.active)?.tabs?.find((x) => x.active)?.id;
      const pane = panes().find((p) => p.tab === tab && p.terminal);
      if (pane) run("pane.focus", { pane: pane.pane });
    }
  }

  toggleArrange() {
    const s = state();
    setShared(KEY, { ...s, on: true, arrange: s.arrange ? false : "edit", carry: null });
  }

  // Everything side by side: one row, each as wide as the next.
  sideBySide() {
    const s = state();
    setShared(KEY, inRow(s));
    for (const terminal of flat(s)) run("layout.resize", { id: nodeId(terminal), weight: 1 });
  }

  // Picks a terminal up: the arrange view opens (and the mode turns on) so it can be dropped there.
  carry(terminal) {
    const s = state();
    if (s.carry === terminal) return;
    setShared(KEY, { ...s, on: true, arrange: s.arrange || "drag", carry: terminal });
  }

  // Lets go without a drop; the arrange view closes if the drag opened it.
  letGo() {
    const s = state();
    if (!s.carry) return;
    setShared(KEY, { ...s, carry: null, arrange: s.arrange === "drag" ? false : s.arrange });
  }

  renderSwitch(t) {
    this.sync();
    const s = state();
    const count = entries(s, all()).length;
    const button = (id, icon, text, lit, tip, go) => h_flex().id(id).h(26).px(8).gap(6).flex_none().items_center()
      .text_size(12).bg(lit ? t.selected : t.chrome).text_color(lit ? t.foreground : t.muted)
      .hover((st) => st.bg(t.hover).text_color(t.foreground)).cursor_pointer().tooltip(tip)
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { go(); cx.notify(); })
      .child(svg(icon).size(14).flex_none())
      .child(text);
    return h_flex().size_full().pr(10).gap(3).items_center().justify_end().overflow_hidden().bg(t.chrome).border_b(1).border_color(t.border)
      .when(s.on, (el) => el
        .child(button("sbs-arrange-button", ARRANGE, s.arrange ? "Done" : "Arrange", !!s.arrange,
          s.arrange ? "Done arranging" : "Arrange: drag the terminals into rows and columns", () => this.toggleArrange()))
        .child(button("sbs-row-button", COLUMNS, "Side by side", false,
          isRow(s) ? "Everything is side by side in one row" : "Put everything side by side in one row, each the same width", () => this.sideBySide())))
      .child(button("sbs-switch-button", GRID, count > 0 ? `Grid ${count}` : "Grid", s.on,
        s.on ? "Leave grid view: back to the space's tabs" : "Grid view: terminals from any spaces next to each other", () => this.toggle()));
  }

  // The top bar while the mode is on: no tabs (each card's title says the same, and is what is
  // clicked, dragged and closed), only + to add a terminal. The bar still drags the window.
  renderTabs(t) {
    const count = entries(state(), all()).length;
    // Room for the window buttons when the sidebar is narrow (as Herdr's tab bar leaves).
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    const left = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / (settings().zoom || 1) - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    return h_flex().size_full().min_w(0).pl(left).pr(4).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(div().flex_1().min_w(0).px(4).truncate().text_size(12).text_color(t.dim).child(count ? `Grid view · ${count}` : "Grid view"))
      .child(div().id("sbs-add").size(26).flex_none().flex().items_center().justify_center().text_color(t.dim)
        .hover((st) => st.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .tooltip("Add a terminal or agent")
        .on_mouse_down("left", stop)
        .on_click(() => openOverlay({ mod: "side-by-side", kind: "popup", width: 300, height: 420, props: { part: "picker" } }))
        .child("+"));
  }

  renderHead(t) {
    const terminal = props()?.terminal;
    const e = all().find((x) => x.terminal === terminal);
    if (!e) return div().size_full().bg(t.background);
    const on = focused()?.terminal === terminal;
    const hl = highlight();
    const tag = tagColor(e.space);
    const pic = programIcon(e.program, 14, t.dim);
    const back = behind(e, on, hl, tag);
    const mark = back.glowing ? null : statusMark(t, e.status);
    return h_flex().id(`sbs-head-${terminal}`).relative().size_full().px(10).gap(8).items_center().text_size(12.5)
      // The focused card: its header tinted in the highlight color (or fading into it), over a line of it.
      .bg(on && !back.faded ? hl + "38" : t.background).border_b(on ? 2 : 1).border_color(on ? hl : t.border)
      .children(back.els)
      .on_click(() => run("pane.focus", { terminal }))
      // Dragged: picked up, to drop in the arrange view.
      .on_mouse_down("left", (ev) => { this.pressedAt = ev.position; })
      .on_mouse_move((ev) => {
        const from = this.pressedAt;
        if (from && Math.hypot(ev.position.x - from.x, ev.position.y - from.y) > DRAG) { this.pressedAt = null; this.carry(terminal); }
      })
      .on_mouse_up("left", () => { this.pressedAt = null; })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); menu(e); })
      .child(div().size(9).flex_none().rounded(3).when(!!tag, (el) => el.bg(tag)).when(!tag, (el) => el.border(1).border_color(t.dim + "88")))
      .when(!!pic, (el) => el.child(pic))
      .child(div().flex_shrink(0).max_w(220).truncate().text_color(on ? t.foreground : t.muted).child(e.name))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(e.spaceName))
      .when(!!mark, (el) => el.child(mark))
      .child(div().id(`sbs-head-x-${terminal}`).flex_none().p(3).text_color(t.dim)
        .hover((st) => st.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .tooltip("Take out of the grid view (it keeps running)")
        .on_click((_e, cx) => { cx.stop_propagation(); setShared(KEY, remove(state(), terminal)); cx.notify(); })
        .child(svg("mods/pane/close.svg").size(13)));
  }

  renderEmpty(t) {
    return v_flex().size_full().items_center().justify_center().gap(8).border(1).border_color(t.border).bg(t.background)
      .child(svg(GRID).size(22).text_color(t.dim))
      .child(div().text_size(13).text_color(t.muted).child("Nothing in the grid view yet"))
      .child(div().text_size(12).text_color(t.dim).child("Right-click an agent or a space in the sidebar, drag an agent here, or use + in the bar above."));
  }

  // The arrange view. One element takes every press, move and release and works out from the
  // picture's own geometry what is under the pointer, so a drag that began somewhere else (a card,
  // the sidebar) carries on here.
  renderArrange(t) {
    const s = state();
    const info = new Map(all().map((e) => [e.terminal, e]));
    // The grid as drawn: only what is running.
    const tree = prune(s.root, (a) => info.has(a));
    const shown = { ...s, root: tree };
    // With a zoomed window, the numbers given to .w()/.left() are not the pixels sizes and pointer
    // positions are reported in. A probe 100 wide tells how many reported pixels one of ours is
    // (this.k); the picture is laid out in our units, and the pointer is placed in it by how far
    // across the view's own bounds it is.
    const k = this.k > 0 ? this.k : 1;
    const seen = this.size ?? { width: 900, height: 600 };
    const size = { width: seen.width / k, height: seen.height / k };
    const point = (ev) => {
      const at = ev.local_position, b = ev.bounds;
      if (!at) return null;
      return b?.width > 0 && b?.height > 0 ? { x: at.x / b.width * size.width, y: at.y / b.height * size.height } : { x: at.x / k, y: at.y / k };
    };
    // While a gap is dragged, its two neighbors' sizes are previewed here before the layout has them.
    const w = weights(layout(), shown);
    if (this.sizing?.now) Object.assign(w, { [this.sizing.gap.a]: this.sizing.now[0], [this.sizing.gap.b]: this.sizing.now[1] });
    const geo = geometry(tree, w, size.width, size.height, BOX);
    const p = this.at;
    const carried = s.carry ? info.get(s.carry) : null;
    const drop = carried && p ? hit(geo, p, s.carry, shown) : null;
    // The places the tile under the pointer offers, drawn faintly; the one a drop would take, stronger.
    const offer = carried && p ? zones(geo, p, s.carry, shown) : null;
    const is = (c) => !!drop && JSON.stringify(c.target) === JSON.stringify(drop.target);
    const choices = offer ? [...Object.values(offer.sides).flat(), ...(offer.swap ? [offer.swap] : [])] : [];
    // Where the carried one would be after a drop here: drawn as the tile it would become.
    const land = drop ? landing(shown, s.carry, drop.target, w, size.width, size.height, BOX) : null;
    const under = (at) => geo.tiles.find((x) => at.x >= x.x && at.x < x.x + x.w && at.y >= x.y && at.y < x.y + x.h);

    const down = (ev, cx) => {
      const at = point(ev);
      if (!at || state().carry) return;
      const gap = gapAt(geo, at);
      if (gap) {
        this.sizing = { gap, from: at, px: gap.px, w: [w[gap.a] ?? 1, w[gap.b] ?? 1], now: null };
        return;
      }
      const tile = under(at);
      if (tile) this.press = { terminal: tile.terminal, from: at };
      cx.notify();
    };
    const moved = (ev, cx) => {
      const at = point(ev);
      if (!at) return;
      this.at = at;
      if (this.sizing) {
        const d = this.sizing.gap.kind === "row" ? at.y - this.sizing.from.y : at.x - this.sizing.from.x;
        this.sizing.now = resize(this.sizing.px, this.sizing.w, d);
      } else if (this.press && Math.hypot(at.x - this.press.from.x, at.y - this.press.from.y) > DRAG) {
        this.carry(this.press.terminal);
        this.press = null;
      } else if (!state().carry) return;
      cx.notify();
    };
    const up = (ev, cx) => {
      const at = point(ev) ?? this.at;
      this.press = null;
      if (this.sizing) {
        const { gap, now } = this.sizing;
        this.sizing = null;
        if (now) {
          run("layout.resize", { id: gap.a, weight: now[0] });
          run("layout.resize", { id: gap.b, weight: now[1] });
        }
      } else {
        const st = state();
        if (st.carry) {
          const to = at ? hit(geo, at, st.carry, shown) : null;
          const next = to ? place(st, st.carry, to.target) : st;
          setShared(KEY, { ...next, carry: null, arrange: st.arrange === "drag" ? false : st.arrange });
        }
      }
      cx.notify();
    };
    const context = (ev, cx) => {
      const at = point(ev);
      const e = at && !state().carry ? info.get(under(at)?.terminal) : null;
      if (!e) return;
      cx.stop_propagation();
      menu(e);
    };

    const tile = (x) => {
      const e = info.get(x.terminal);
      const tag = tagColor(e.space);
      const pic = programIcon(e.program, 16, t.muted);
      const mark = statusMark(t, e.status);
      const lifted = s.carry === x.terminal;
      return v_flex().absolute().left(x.x).top(x.y).w(x.w).h(x.h).border(1).border_color(t.border).bg(t.background)
        .items_center().justify_center().gap(6).overflow_hidden()
        .when(lifted, (el) => el.opacity(0.35))
        .child(h_flex().max_w(Math.max(0, x.w - 20)).gap(7).items_center()
          .child(div().size(9).flex_none().rounded(3).when(!!tag, (el) => el.bg(tag)).when(!tag, (el) => el.border(1).border_color(t.dim + "88")))
          .when(!!pic, (el) => el.child(pic))
          .child(div().min_w(0).truncate().text_size(13.5).font_medium().text_color(t.foreground).child(e.name))
          .when(!!mark, (el) => el.child(mark)))
        .child(div().max_w(Math.max(0, x.w - 20)).truncate().text_size(11.5).text_color(t.dim).child(e.spaceName));
    };
    const ghost = () => {
      const pic = programIcon(carried.program, 14, t.muted);
      return h_flex().absolute().left(p.x + 12).top(p.y + 10).h(34).px(11).gap(7).items_center()
        .border(1).border_color(t.accent).bg(t.raised).shadow_lg().text_size(12.8).text_color(t.foreground)
        .when(!!pic, (el) => el.child(pic))
        .child(div().max_w(200).truncate().child(carried.name))
        .child(div().max_w(110).truncate().text_size(11.5).text_color(t.dim).child(carried.spaceName));
    };
    const word = { left: "left of", right: "right of", top: "above", bottom: "below" };
    const what = !drop ? null
      : drop.target.kind === "new" ? "Drop it here"
      : drop.target.kind === "swap" ? `Swap with ${info.get(drop.target.at)?.name ?? "it"}`
      : `Goes ${word[drop.side]} ${drop.target.at.leaf ? info.get(drop.target.at.leaf)?.name ?? "it" : drop.whole ? "everything" : `these ${drop.count}`}`;
    const hint = carried
      ? what ?? `Drop ${carried.name} on a tile's edge to put it beside; closer to the edge spans more; the middle swaps`
      : "Drag a tile to move it, a gap to resize; right-click a tile to remove it";
    return div().id("sbs-arrange").relative().size_full().border(1).border_color(t.border).bg(t.chrome)
      .on_size_change((sz, cx) => { this.size = sz; cx.notify(); })
      .on_mouse_down("left", down).on_mouse_move(moved).on_mouse_up("left", up).on_mouse_down("right", context)
      .child(div().id("sbs-arrange-probe").absolute().left(0).top(0).w(100).h(1)
        .on_size_change((sz, cx) => { const next = sz.width / 100; if (next > 0 && Math.abs(next - (this.k ?? 0)) > 0.001) { this.k = next; cx.notify(); } }))
      .child(h_flex().absolute().left(BOX.pad).right(BOX.pad).top(0).h(BOX.top).gap(10).items_center()
        .child(svg(GRID).size(15).text_color(t.muted))
        .child(div().text_size(13).font_medium().text_color(t.foreground).child("Arrange"))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(hint))
        .when(!!s.carry, (el) => el.child(div().id("sbs-arrange-cancel").h(26).px(10).flex().items_center().text_size(12).text_color(t.muted)
          .hover((st) => st.bg(t.hover).text_color(t.foreground)).cursor_pointer()
          .on_mouse_down("left", stop).on_mouse_up("left", stop)
          .on_click((_e, cx) => { this.letGo(); cx.notify(); }).child("Cancel")))
        .child(div().id("sbs-arrange-done").h(26).px(12).flex().items_center().text_size(12).font_medium()
          .bg(t.solid).text_color(t.solid_foreground).hover((st) => st.opacity(0.88)).cursor_pointer()
          .on_mouse_down("left", stop).on_mouse_up("left", stop)
          .on_click((_e, cx) => { const st = state(); setShared(KEY, { ...st, arrange: false, carry: null }); cx.notify(); })
          .child("Done")))
      .children(geo.tiles.map(tile))
      .when(!geo.tiles.length, (el) => el.child(v_flex().absolute().left(BOX.pad).right(BOX.pad).top(BOX.top).bottom(BOX.pad).items_center().justify_center()
        .border(1).border_color(t.border).text_size(12.5).text_color(t.dim)
        .child(carried ? "Drop it here" : "Nothing to arrange yet: drag an agent in from the sidebar, or use + in the bar above.")))
      // The tile under the pointer: thin outlines of the parts of it that each pick a different drop.
      .children(choices.map((c) => div().absolute().left(c.zone.x).top(c.zone.y).w(c.zone.w).h(c.zone.h)
        .border(1).border_color(t.accent + (is(c) ? "99" : "30"))))
      // The drop itself: the carried terminal, where and as big as it would be.
      .when(!!land, (el) => el.child(v_flex().absolute().left(land.x).top(land.y).w(land.w).h(land.h)
        .border(2).border_color(t.accent).bg(t.accent + "59").items_center().justify_center().overflow_hidden()
        .child(div().max_w(Math.max(0, land.w - 16)).truncate().text_size(13).font_medium().text_color(t.foreground).child(carried.name))))
      .when(!!carried && !!p, (el) => el.child(ghost()));
  }

  renderPicker(t) {
    const s = state();
    const list = all().filter((e) => !has(s, e.terminal));
    const close = () => closeOverlay(props()?.overlay);
    return v_flex().id("sbs-picker").track_focus(this.handle).w_full().min_h(0).p(5).bg(t.popover).text_size(12.8)
      .on_key_down((e) => { if (e.key === "escape") close(); })
      .child(div().px(9).pt(6).pb(4).text_size(11).text_color(t.dim).child(list.length ? "Add to grid view" : "Everything is already in the grid view"))
      .child(v_flex().id("sbs-picker-list").min_h(0).max_h(370).overflow_y_scrollbar()
        .children(list.map((e) => {
          const tag = tagColor(e.space);
          const pic = programIcon(e.program, 14, t.muted);
          return h_flex().id(`sbs-pick-${e.terminal}`).h(31).flex_none().px(8).gap(9).items_center()
            .text_color(t.foreground).hover((st) => st.bg(t.hover)).cursor_pointer()
            .on_click(() => { setShared(KEY, add(state(), e.terminal)); close(); })
            .child(div().size(9).flex_none().rounded(3).when(!!tag, (el) => el.bg(tag)).when(!tag, (el) => el.border(1).border_color(t.dim + "88")))
            .child(pic ?? div().w(14).flex_none())
            .child(div().flex_1().min_w(0).truncate().child(e.name))
            .child(div().flex_none().max_w(110).truncate().text_size(11.5).text_color(t.dim).child(e.spaceName));
        })));
  }

  render() {
    const t = theme();
    const part = props()?.part;
    if (part === "tabs") return this.renderTabs(t);
    if (part === "head") return this.renderHead(t);
    if (part === "empty") return this.renderEmpty(t);
    if (part === "arrange") return this.renderArrange(t);
    if (part === "picker") return this.renderPicker(t);
    return this.renderSwitch(t);
  }
}
