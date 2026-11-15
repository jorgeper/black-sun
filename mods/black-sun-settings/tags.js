// black-sun's space tags: pure logic (no Herdr imports). The same file sits in black-sun-settings
// (which edits tags; its tests: `node --test mods/black-sun-settings/tests/*.test.js`), sidebar-menu
// (which tags a space) and spaces-tree (which draws them): a mod can only import from its own
// folder, so change all three together.
//
// Shared state "black-sun.tags": { style, default, tags: [{ id, name, color, slot }], spaces: { <space id>: <tag id> } }.
// A tag's color is one of the selected palette's ("black-sun.palettes", black-sun-settings'
// palettes.js): `slot` is its place there, `color` what that is now, so a mod that only draws
// reads `color`. A tag from before there were palettes has no slot until recolor() gives it one.
// A space has one tag or none. style "square": a colored square before the name; "row": the
// whole row in the tag's color. default: the tag a new space starts with (a tag id), or null.

export const KEY = "black-sun.tags";
export const STYLES = ["square", "row"];
// The colors a tag has when no palette is given: the first palette's first eight.
export const COLORS = ["#5b8def", "#22a99a", "#3fae6a", "#d4a72c", "#e3814f", "#e5534b", "#d9649a", "#8b7cf6"];
const HEX = /^#[0-9a-f]{6}$/i;
const slotOf = (v) => (Number.isInteger(v) && v >= 0 && v < 64 ? v : null);

// Anything unreadable becomes no tags; tags without an id go, a bad color becomes the first one,
// and a space tagged with a tag that no longer exists is untagged.
export function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const seen = new Set();
  const tags = [];
  for (const t of Array.isArray(r.tags) ? r.tags : []) {
    if (!t || typeof t.id !== "string" || !t.id || seen.has(t.id)) continue;
    seen.add(t.id);
    const slot = slotOf(t.slot);
    tags.push({ id: t.id, name: typeof t.name === "string" ? t.name : "", color: HEX.test(t.color) ? t.color.toLowerCase() : COLORS[0], ...(slot === null ? {} : { slot }) });
  }
  const spaces = {};
  const given = r.spaces && typeof r.spaces === "object" ? r.spaces : {};
  for (const [space, tag] of Object.entries(given)) if (seen.has(tag)) spaces[space] = tag;
  return { style: STYLES.includes(r.style) ? r.style : "square", default: seen.has(r.default) ? r.default : null, tags, spaces };
}

// What a tag is called where it is listed.
export const tagName = (tag) => tag?.name.trim() || "Untitled tag";

// A space's tag, or null.
export function tagOf(state, space) {
  const id = state.spaces[space];
  return state.tags.find((t) => t.id === id) ?? null;
}

// A new tag at the end, in the color of the palette (`colors`) the fewest tags use. Returns { state, id }.
export function addTag(state, name = "", colors = COLORS) {
  const n = state.tags.reduce((m, t) => Math.max(m, Number(/^t(\d+)$/.exec(t.id)?.[1] ?? 0)), 0) + 1;
  const uses = (c) => state.tags.filter((t) => t.color === c).length;
  const slot = colors.reduce((best, c, i) => (uses(c) < uses(colors[best]) ? i : best), 0);
  const id = `t${n}`;
  return { state: { ...state, tags: [...state.tags, { id, name, color: colors[slot], slot }] }, id };
}

// A tag's name or color changed. A color given without its slot leaves the tag with none.
export function updateTag(state, id, patch) {
  const loose = "color" in patch && !("slot" in patch) ? { slot: null } : {};
  return normalize({ ...state, tags: state.tags.map((t) => (t.id === id ? { ...t, ...loose, ...patch, id } : t)) });
}

// Every tag in the palette's colors (`colors`): each takes the color at its slot; one with no slot
// yet takes the place of the color closest to its own.
export function recolor(state, colors) {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const far = (a, b) => rgb(a).reduce((sum, v, i) => sum + (v - rgb(b)[i]) ** 2, 0);
  return { ...state, tags: state.tags.map((t) => {
    const slot = (t.slot ?? colors.reduce((best, c, i) => (far(c, t.color) < far(colors[best], t.color) ? i : best), 0)) % colors.length;
    return { ...t, color: colors[slot], slot };
  }) };
}

// The tag gone, and every space that had it untagged.
export function removeTag(state, id) {
  return normalize({ ...state, tags: state.tags.filter((t) => t.id !== id) });
}

// A space given a tag; null (or a tag that doesn't exist) untags it.
export function assign(state, space, tag) {
  const spaces = { ...state.spaces };
  if (tag && state.tags.some((t) => t.id === tag)) spaces[space] = tag;
  else delete spaces[space];
  return { ...state, spaces };
}

// The tag new spaces start with; null (or a tag that doesn't exist) for none.
export function setDefault(state, tag) {
  return { ...state, default: tag && state.tags.some((t) => t.id === tag) ? tag : null };
}

// Gives the default tag to spaces not seen before. seen: the space ids already known (an array),
// or null the first time, when every space there is counts as known and none is tagged. A space
// seen once is never tagged again, so one you untagged stays untagged. Returns
// { state, seen, tagged (state changed), grew (seen changed) }.
export function tagNew(state, seen, ids) {
  if (!seen) return ids.length ? { state, seen: [...ids], tagged: false, grew: true } : { state, seen: null, tagged: false, grew: false };
  const known = new Set(seen);
  const fresh = ids.filter((id) => !known.has(id));
  if (!fresh.length) return { state, seen, tagged: false, grew: false };
  const mine = fresh.filter((id) => state.default && !state.spaces[id]);
  const next = mine.reduce((s, id) => assign(s, id, state.default), state);
  return { state: next, seen: [...seen, ...fresh], tagged: mine.length > 0, grew: true };
}

export function setStyle(state, style) {
  return { ...state, style: STYLES.includes(style) ? style : state.style };
}

// Text on a colored row: whichever of dark and white reads better on that color (WCAG contrast).
const DARK = "#14161a";
const LIGHT = "#ffffff";

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function ink(color) {
  return contrast(color, DARK) >= contrast(color, LIGHT) ? DARK : LIGHT;
}
