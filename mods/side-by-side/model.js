// side-by-side's pure logic (no Herdr imports; `node --test mods/side-by-side/tests/*.test.js`).
//
// Shared state "black-sun.sbs": { on, arrange, carry, root }.
//   on       the work area shows the grid in place of the shown space's tab.
//   root     the grid, a tree of splits (null when empty). A node is a terminal's address (a leaf)
//            or a split { id, dir, items }: dir "row" lays its items out left to right, "col" top to
//            bottom, and an item is again a leaf or a split. So one terminal can take a whole
//            column while others stack beside it. Terminals come from any space (agents and plain
//            terminals alike), each at most once. The tree is kept simple: no empty split, none
//            with one item, none inside a split of the same direction.
//   arrange  false, "edit" (the arrange view, opened with its button) or "drag" (opened by
//            dragging something, closed again by the drop).
//   carry    the terminal being dragged (in the grid already or not), or null.
// sidebar-menu and spaces-tree read and write the same state.

export const KEY = "black-sun.sbs";

const isSplit = (n) => !!n && typeof n === "object";

// Every terminal under a node, in reading order.
export function leaves(node) {
  if (!node) return [];
  return isSplit(node) ? node.items.flatMap(leaves) : [node];
}

const splitIds = (node) => (isSplit(node) ? [node.id, ...node.items.flatMap(splitIds)] : []);
const newId = (root) => `n${splitIds(root).reduce((m, id) => Math.max(m, Number(/^n(\d+)$/.exec(id)?.[1] ?? 0)), 0) + 1}`;

// The tree kept simple: empty splits go, a split with one item becomes that item, and a split
// inside one of the same direction gives its items to it.
export function simplify(node) {
  if (!isSplit(node)) return node || null;
  const items = [];
  for (const child of node.items.map(simplify)) {
    if (!child) continue;
    if (isSplit(child) && child.dir === node.dir) items.push(...child.items);
    else items.push(child);
  }
  if (!items.length) return null;
  if (items.length === 1) return items[0];
  return { id: node.id, dir: node.dir, items };
}

// The tree with only the leaves `keep` says yes to.
export function prune(node, keep) {
  if (!node) return null;
  if (!isSplit(node)) return keep(node) ? node : null;
  return simplify({ ...node, items: node.items.map((c) => prune(c, keep)).filter(Boolean) });
}

export function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const seen = new Set();
  const ids = new Set();
  let auto = 0;
  const clean = (n) => {
    if (typeof n === "string") return n && !seen.has(n) && seen.add(n) ? n : null;
    if (!n || typeof n !== "object" || !Array.isArray(n.items)) return null;
    let id = typeof n.id === "string" && n.id && !ids.has(n.id) ? n.id : null;
    while (!id || ids.has(id)) id = `x${++auto}`;
    ids.add(id);
    return { id, dir: n.dir === "col" ? "col" : "row", items: n.items.map(clean).filter(Boolean) };
  };
  // Earlier shapes: rows of terminals ({ rows: [{ id, items }] }), and before that one flat list ({ items }).
  const given = "root" in r ? r.root
    : Array.isArray(r.rows) ? { id: "n1", dir: "col", items: r.rows.map((row, i) => ({ id: `n${i + 2}`, dir: "row", items: Array.isArray(row?.items) ? row.items : [] })) }
    : Array.isArray(r.items) ? { id: "n1", dir: "row", items: r.items }
    : null;
  return {
    on: r.on === true,
    arrange: r.arrange === "edit" || r.arrange === "drag" ? r.arrange : false,
    carry: typeof r.carry === "string" && r.carry ? r.carry : null,
    root: simplify(clean(given)),
  };
}

// Every terminal in the grid, in reading order.
export const flat = (state) => leaves(state.root);
export const has = (state, terminal) => flat(state).includes(terminal);

// At the right edge: the last of a grid that is one row, else a column of its own beside the rest.
export function add(state, terminal) {
  if (has(state, terminal)) return state;
  const root = state.root;
  if (!root) return { ...state, root: terminal };
  if (isSplit(root) && root.dir === "row") return { ...state, root: { ...root, items: [...root.items, terminal] } };
  return { ...state, root: { id: newId(root), dir: "row", items: [root, terminal] } };
}

export function remove(state, terminal) {
  return { ...state, root: prune(state.root, (a) => a !== terminal) };
}

// Everything in one row, left to right in reading order: plain side by side.
export function inRow(state) {
  const all = flat(state);
  return { ...state, root: all.length > 1 ? { id: newId(state.root), dir: "row", items: all } : all[0] ?? null };
}
export const isRow = (state) => !state.root || typeof state.root === "string" || (state.root.dir === "row" && state.root.items.every((x) => typeof x === "string"));

export const setOn = (state, on) => ({ ...state, on: !!on, ...(on ? {} : { arrange: false, carry: null }) });

// A node by reference: { leaf: <terminal> } or { node: <split id> }.
const matches = (n, ref) => (isSplit(n) ? n.id === ref.node : n === ref.leaf);

// Puts a terminal (in the grid already or not) where a drop says:
//   { kind: "side", at: { leaf } | { node }, side: "left" | "right" | "top" | "bottom" }
//       beside that terminal or that whole split, on that side, as tall (or wide) as it is
//   { kind: "swap", at: <terminal> }   the two change places (one not in the grid goes to its left)
//   { kind: "new" }                    into an empty grid, or at its right edge
// A target that isn't there leaves the state as it is.
export function place(state, terminal, target) {
  if (!target) return state;
  if (target.kind === "new") return add(remove(state, terminal), terminal);
  if (target.kind === "swap") {
    if (target.at === terminal || !has(state, target.at)) return state;
    if (!has(state, terminal)) return place(state, terminal, { kind: "side", at: { leaf: target.at }, side: "left" });
    const swap = (n) => (isSplit(n) ? { ...n, items: n.items.map(swap) } : n === terminal ? target.at : n === target.at ? terminal : n);
    return { ...state, root: swap(state.root) };
  }
  if (target.kind !== "side" || target.at?.leaf === terminal) return state;
  const dir = target.side === "left" || target.side === "right" ? "row" : "col";
  const before = target.side === "left" || target.side === "top";
  // Without the terminal, but not tidied yet: the target split keeps its id even with one item left.
  const strip = (n) => (isSplit(n) ? { ...n, items: n.items.map(strip).filter((c) => c !== null) } : n === terminal ? null : n);
  const bare = strip(state.root);
  if (bare === null) return state;
  const id = newId(state.root);
  let found = false;
  const put = (n, parent) => {
    if (matches(n, target.at)) {
      if (isSplit(n) && !leaves(n).length) return n;
      found = true;
      // In a split that already runs this way it joins the line; else the two get a split of their own.
      if (parent?.dir === dir) return before ? [terminal, n] : [n, terminal];
      return { id, dir, items: before ? [terminal, n] : [n, terminal] };
    }
    if (!isSplit(n)) return n;
    return { ...n, items: n.items.flatMap((c) => put(c, n)) };
  };
  const next = put(bare, null);
  if (!found) return state;
  return { ...state, root: simplify(Array.isArray(next) ? { id, dir, items: next } : next) };
}

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Layout node ids: a terminal's card ("vps/t7" has a slash), a split, or either.
export const nodeId = (terminal) => `sbs-${terminal.replace(/[^A-Za-z0-9]+/g, "-")}`;
export const splitNodeId = (id) => `sbs-split-${id}`;
export const layoutId = (n) => (isSplit(n) ? splitNodeId(n.id) : nodeId(n));

// A card's border, all the way around: in `color` for the one with the keyboard, else the theme's
// border color. As thick either way, so a terminal isn't resized when the keyboard moves.
const edge = (color) => ({ width: 2, color: color ?? "border" });

// One terminal: a card with a header (this mod, part "head") over the terminal itself.
// color: its border's, when it is the one with the keyboard.
export function card(terminal, color = null) {
  const id = nodeId(terminal);
  return {
    id, type: "column", background: "background", border: edge(color), resizable: false,
    children: [
      { id: `${id}-head`, type: "block", size: { px: 30 }, content: { mod: "side-by-side", props: { part: "head", terminal } } },
      { id: `${id}-term`, type: "block", content: { terminal } },
    ],
  };
}

// A card kept from the layout, with square corners.
const square = (node) => { if (!node) return null; const { radius: _r, focus: _f, ...rest } = node; return rest; };

// What the grid shows while it has nothing.
const EMPTY = { id: "sbs-empty", type: "block", content: { mod: "side-by-side", props: { part: "empty" } } };

// The layout nodes this works with: the shown tab and its tab bar; the grid, its bar, the arrange view.
const NODES = ["main", "tabs", "sbs", "sbs-tabs", "sbs-arrange"];
const kind = (dir) => (dir === "col" ? "column" : "row");
// A layout node of the grid as [id, type, children] (a card: its id, its border's color and
// width; one from when cards had rounded corners is marked, so it is drawn again without them).
const cardSign = (id, color) => `${id}|${color ?? ""}`;
const outline = (n) => (/^sbs-split-/.test(n.id) ? [n.id, n.type, (n.children ?? []).map(outline)]
  : n.id === EMPTY.id ? n.id : cardSign(n.id, n.border?.width === 2 && !n.focus ? n.border.color : null) + (n.radius ? ":round" : ""));

// How wide the buttons at the end of the top bar are ("sbs-switch", when the layout has it): the
// switch alone, or with Arrange and Side by side beside it while the mode is on.
export const SWITCH = { off: 96, on: 318 };

// The shown tab's panes (layout node "main", when it has a pane look): their borders are as thick
// as a card's, and the one with the keyboard has its border in the highlight color, as a card has.
const paneLook = (tree) => find(tree, "main")?.content?.pane ?? null;
const paneSign = (pane) => (pane ? [pane.focus?.color ?? null, pane.focus?.width ?? null, pane.border?.width ?? null] : null);

// What of a layout this decides: which view shows, the grid's splits and cards, the buttons'
// width, the panes' borders.
export function signature(tree) {
  const nodes = NODES.map((id) => find(tree, id));
  if (nodes.some((n) => !n)) return null;
  return JSON.stringify([...nodes.map((n) => !!n.hidden), nodes[2].type, (nodes[2].children ?? []).map(outline), find(tree, "sbs-switch")?.size?.px ?? null, paneSign(paneLook(tree))]);
}

// The layout for this state: null when the layout already shows it, or isn't one with these nodes.
// On: the tab and its bar hide; the grid's rows and columns follow the tree, with a card per
// terminal that is running (`live`, a Set of addresses). Splits and cards already there are
// kept, and so the sizes dragged; the card of the terminal with the keyboard (`focused`) has its
// border in `highlight` (a color), and so has the focused pane of the shown tab.
// Arranging: the arrange view shows in the grid's place. Off: the
// tab is back and the grid holds no terminals.
export function arrange(tree, state, live, highlight = "accent", focused = null) {
  const color = (terminal) => (terminal === focused ? highlight : "border");
  const now = signature(tree);
  if (now === null) return null;
  const root = state.on ? prune(state.root, (a) => live.has(a)) : null;
  // The grid node itself is the top split (one terminal alone: a row of one).
  const top = isSplit(root) ? root : { dir: "row", items: root ? [root] : [] };
  const want = (n) => (isSplit(n) ? [splitNodeId(n.id), kind(n.dir), n.items.map(want)] : cardSign(nodeId(n), color(n)));
  const arranging = state.on && !!state.arrange;
  const grid = top.items.length ? top.items.map(want) : [EMPTY.id];
  if (now === JSON.stringify([state.on, state.on, !state.on || arranging, !state.on, !arranging, kind(top.dir), grid, find(tree, "sbs-switch") ? SWITCH[state.on ? "on" : "off"] : null, paneLook(tree) ? [highlight, 2, 2] : null])) return null;
  const next = JSON.parse(JSON.stringify(tree)); // (no structuredClone in Herdr mods)
  const hide = (id, hidden) => { const n = find(next, id); if (hidden) n.hidden = true; else delete n.hidden; };
  hide("main", state.on); hide("tabs", state.on); hide("sbs", !state.on || arranging); hide("sbs-tabs", !state.on); hide("sbs-arrange", !arranging);
  const pane = paneLook(next);
  if (pane) { pane.focus = { ...pane.focus, width: 2, color: highlight }; pane.border = { ...pane.border, width: 2 }; }
  const buttons = find(next, "sbs-switch");
  if (buttons) buttons.size = { px: SWITCH[state.on ? "on" : "off"] };
  const node = find(next, "sbs");
  const old = new Map();
  const collect = (n) => { old.set(n.id, n); if (/^sbs-split-/.test(n.id)) (n.children ?? []).forEach(collect); };
  (node.children ?? []).forEach(collect);
  const build = (n) => (isSplit(n)
    ? { ...(old.get(splitNodeId(n.id)) ?? { id: splitNodeId(n.id), gap: 8 }), type: kind(n.dir), children: n.items.map(build) }
    : old.has(nodeId(n)) ? { ...square(old.get(nodeId(n))), border: edge(color(n)) } : card(n, color(n)));
  node.type = kind(top.dir);
  node.gap = 8;
  node.children = top.items.length ? top.items.map(build) : [old.get(EMPTY.id) ?? EMPTY];
  return next;
}

// How deep a value nests: 0 for a plain value, 1 for an object or array of them, and so on.
// Herdr takes only so much nesting in what a mod hands to run() (NEST levels), and a grid with
// splits inside splits makes a layout deeper than that.
export const NEST = 16;
export function depth(v) {
  if (!v || typeof v !== "object") return 0;
  return 1 + Object.values(v).reduce((m, x) => Math.max(m, depth(x)), 0);
}

// How big each split and card is next to its neighbors, from the layout: layout id -> weight (1 unless dragged).
export function weights(tree, state) {
  const out = {};
  const walk = (n) => {
    const s = find(tree, layoutId(n))?.size;
    out[layoutId(n)] = s?.weight > 0 ? s.weight : 1;
    if (isSplit(n)) n.items.forEach(walk);
  };
  if (state.root) walk(state.root);
  return out;
}

// The arrange view's picture of the grid in a box `width` × `height`, in pixels:
//   tiles   [{ terminal, x, y, w, h, path }]   path: the splits it is in, outermost first (their ids)
//   splits  { <id>: { id, dir, x, y, w, h } }
//   gaps    [{ kind: "col" | "row", a, b, px: [a's size, b's size], x, y, w, h }]   a, b: layout ids
// root: the tree (of running terminals); w: weights(); box: { pad, gap, top } (top: room above for a title).
export function geometry(root, w, width, height, box) {
  const { pad, gap, top } = box;
  const out = { tiles: [], splits: {}, gaps: [], x: pad, y: top, w: Math.max(0, width - 2 * pad), h: Math.max(0, height - top - pad), gap };
  const lay = (n, r, path) => {
    if (!isSplit(n)) { out.tiles.push({ terminal: n, ...r, path }); return; }
    out.splits[n.id] = { id: n.id, dir: n.dir, ...r };
    const row = n.dir === "row";
    const sum = n.items.reduce((t, c) => t + (w[layoutId(c)] ?? 1), 0) || 1;
    const room = Math.max(0, (row ? r.w : r.h) - gap * (n.items.length - 1));
    let at = row ? r.x : r.y;
    n.items.forEach((c, i) => {
      const size = room * (w[layoutId(c)] ?? 1) / sum;
      lay(c, row ? { x: at, y: r.y, w: size, h: r.h } : { x: r.x, y: at, w: r.w, h: size }, [...path, n.id]);
      at += size;
      if (i + 1 < n.items.length) {
        const next = room * (w[layoutId(n.items[i + 1])] ?? 1) / sum;
        out.gaps.push({ kind: row ? "col" : "row", a: layoutId(c), b: layoutId(n.items[i + 1]), px: [size, next],
          ...(row ? { x: at, y: r.y, w: gap, h: r.h } : { x: r.x, y: at, w: r.w, h: gap }) });
        at += gap;
      }
    });
  };
  if (root) lay(root, { x: out.x, y: out.y, w: out.w, h: out.h }, []);
  return out;
}

const inside = (r, p) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
const near = (a, b) => Math.abs(a - b) < 0.5;
// How wide the strip showing a drop is, and how deep into a tile its edges reach (a share of the
// tile, at most EDGE px).
export const STRIP = 8;
const EDGE = 110;

// The tile a drop at p is about: the one under it, else the nearest.
function tileAt(geo, p) {
  const dist = (t) => Math.max(t.x - p.x, 0, p.x - (t.x + t.w)) + Math.max(t.y - p.y, 0, p.y - (t.y + t.h));
  return geo.tiles.find((t) => inside(t, p)) ?? geo.tiles.reduce((best, t) => (dist(t) < dist(best) ? t : best));
}
const bands = (tile) => ({ x: Math.min(tile.w * 0.33, EDGE), y: Math.min(tile.h * 0.3, EDGE) });
const same = (state, next) => JSON.stringify(next.root) === JSON.stringify(state.root);

// Every drop a tile offers `carry`, and where on the tile each is: what the arrange view draws
// faintly so the places to drop can be seen before the pointer is on them.
//   { tile, swap: { target, zone } | null, sides: { left|right|top|bottom: [choice, ...] } }
//   choice: { target (for place()), zone (the part of the tile that picks it), mark (the strip),
//             scope (the rectangle the terminal goes beside), count (terminals in it), whole (it is the grid) }
// An edge's choices go from the tile alone (first, furthest from the edge) to ever bigger groups
// that end at that same edge (last, right at the edge): the edge's band is shared equally among
// them. Choices that would change nothing are left out.
export function zones(geo, p, carry, state) {
  if (!geo.tiles.length) return null;
  const tile = tileAt(geo, p);
  const band = bands(tile);
  const g = geo.gap;
  const sides = {};
  for (const side of ["left", "right", "top", "bottom"]) {
    const dir = side === "left" || side === "right" ? "row" : "col";
    const edge = (r) => (side === "left" ? r.x : side === "right" ? r.x + r.w : side === "top" ? r.y : r.y + r.h);
    // The tile, then each split around it that ends at this same edge and doesn't already run
    // this way (beside such a one is the same as beside its first or last item).
    const scopes = [{ at: { leaf: tile.terminal }, r: tile, count: 1, whole: geo.tiles.length === 1 }];
    for (const id of [...tile.path].reverse()) {
      const s = geo.splits[id];
      if (!near(edge(s), edge(tile))) break;
      if (s.dir !== dir) scopes.push({ at: { node: id }, r: s, count: geo.tiles.filter((t) => t.path.includes(id)).length, whole: id === tile.path[0] });
    }
    const real = scopes.map((s) => ({ ...s, target: { kind: "side", at: s.at, side } })).filter((s) => !same(state, place(state, carry, s.target)));
    sides[side] = real.map(({ r, target, count, whole }, i) => {
      // Its slice of the band: the first choice furthest in, the last at the edge.
      const from = 1 - (i + 1) / real.length, to = 1 - i / real.length;
      const zone = dir === "row"
        ? { x: side === "left" ? tile.x + band.x * from : tile.x + tile.w - band.x * to, y: tile.y, w: band.x * (to - from), h: tile.h }
        : { x: tile.x + band.x, y: side === "top" ? tile.y + band.y * from : tile.y + tile.h - band.y * to, w: Math.max(0, tile.w - 2 * band.x), h: band.y * (to - from) };
      const mark = dir === "row"
        ? { x: (side === "left" ? r.x - g / 2 : r.x + r.w + g / 2) - STRIP / 2, y: r.y, w: STRIP, h: r.h }
        : { x: r.x, y: (side === "top" ? r.y - g / 2 : r.y + r.h + g / 2) - STRIP / 2, w: r.w, h: STRIP };
      return { target, zone, mark, scope: { x: r.x, y: r.y, w: r.w, h: r.h }, count, whole };
    });
  }
  const target = { kind: "swap", at: tile.terminal };
  const swap = tile.terminal === carry || same(state, place(state, carry, target)) ? null
    : { target, zone: { x: tile.x + band.x, y: tile.y + band.y, w: Math.max(0, tile.w - 2 * band.x), h: Math.max(0, tile.h - 2 * band.y) } };
  return { tile, swap, sides };
}

// Where a drop at point p would put `carry`: { target (for place()), mark (the strip or outline to
// draw), scope (the rectangle it goes beside, null for a swap), side, count, whole, level, levels },
// or null when it would change nothing. The middle of a tile swaps. Near one of its edges, the
// terminal goes on that side — beside the tile alone, or beside a bigger group that ends at that
// same edge, up to the whole grid: the closer to the edge, the bigger the group (`level` of
// `levels`; see zones()). The strip spans what it goes beside.
export function hit(geo, p, carry, state) {
  if (!geo.tiles.length) return { target: { kind: "new" }, mark: { x: geo.x, y: geo.y, w: geo.w, h: geo.h }, scope: null, level: 0, levels: 1 };
  const z = zones(geo, p, carry, state);
  const { tile } = z;
  const band = bands(tile);
  // How far into each edge's band the pointer is: 0 at the edge (or beyond it), 1 at the band's end.
  const depth = {
    left: (p.x - tile.x) / (band.x || 1), right: (tile.x + tile.w - p.x) / (band.x || 1),
    top: (p.y - tile.y) / (band.y || 1), bottom: (tile.y + tile.h - p.y) / (band.y || 1),
  };
  const side = Object.keys(depth).filter((s) => depth[s] < 1).sort((a, b) => depth[a] - depth[b])[0];
  if (!side) return z.swap ? { target: z.swap.target, mark: { x: tile.x, y: tile.y, w: tile.w, h: tile.h }, scope: null, level: 0, levels: 1 } : null;
  const real = z.sides[side];
  if (!real.length) return null;
  const d = Math.min(1, Math.max(0, depth[side]));
  const level = Math.min(real.length - 1, Math.floor((1 - d) * real.length));
  const { target, mark, scope, count, whole } = real[level];
  return { target, mark, scope, side, count, whole, level, levels: real.length };
}

// Where `carry` would be after a drop on `target`, in the same picture as geometry(): { x, y, w, h },
// or null. Sizes dragged before stay (w: weights()); anything new takes an equal share.
export function landing(state, carry, target, w, width, height, box) {
  const t = geometry(place(state, carry, target).root, w, width, height, box).tiles.find((x) => x.terminal === carry);
  return t ? { x: t.x, y: t.y, w: t.w, h: t.h } : null;
}

// The gap under point p, to resize by: one of geometry()'s gaps, or null.
export function gapAt(geo, p) {
  return geo.gaps.find((g) => inside(g, p)) ?? null;
}

// Two neighbors' weights after the gap between them moved by `delta` px: their sum stays, each keeps
// at least `min` px. px: [a's size, b's size] now; w: [a's weight, b's weight] now.
export function resize(px, w, delta, min = 60) {
  const total = px[0] + px[1];
  if (total <= 2 * min) return w;
  const a = Math.min(total - min, Math.max(min, px[0] + delta));
  const sum = w[0] + w[1];
  const round = (n) => Math.round(n * 1000) / 1000;
  return [round(sum * a / total), round(sum * (total - a) / total)];
}

// A tab nobody named is called by its place ("1", or an id): then its program says more.
const unnamed = (name) => !name || /^(tb)?\d+$/.test(name);

// Every terminal with a pane, as { terminal, pane, tab, space, spaceName, name, program, status }.
// panes: panes(); spaces: spaces(). name: its tab's name, else its program's.
export function terminals(panes, spaces) {
  const where = new Map();
  for (const s of spaces) for (const t of s.tabs ?? []) where.set(t.id, { s, t });
  return panes.filter((p) => p.terminal && where.has(p.tab)).map((p) => {
    const { s, t } = where.get(p.tab);
    return {
      terminal: p.terminal, pane: p.pane, tab: p.tab, space: s.id, spaceName: s.name,
      name: unnamed(t.name) ? (p.program?.name ?? "Terminal") : t.name,
      program: p.program ?? null, status: p.status ?? null,
    };
  });
}

// The grid's terminals in order, each with what terminals() knows of it; ones not running are left out.
export function entries(state, all) {
  const by = new Map(all.map((e) => [e.terminal, e]));
  return flat(state).map((a) => by.get(a)).filter(Boolean);
}
