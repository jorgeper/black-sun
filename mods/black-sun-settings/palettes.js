// black-sun's color palettes: pure logic (no Herdr imports; `node --test mods/black-sun-settings/tests/*.test.js`).
//
// Shared state "black-sun.palettes": { current, palettes: [{ id, name, colors }] }. Every palette has
// SIZE colors. One is selected (`current`), and every color picked anywhere in black-sun's settings
// (a tag's, the highlight) is one of its colors, remembered by its place in the palette (its slot),
// so selecting another palette, or changing a color, recolors them all (main.js does that, with
// tags.js recolor()). The built-in ones have ids b1, b2, ...; ones a person makes, p1, p2, ...

export const KEY = "black-sun.palettes";
export const SIZE = 12;
const HEX = /^#[0-9a-f]{6}$/i;

const P = (id, name, colors) => ({ id, name, colors: colors.split(" ").map((c) => `#${c}`) });
export const BUILTIN = [
  P("b1", "Black Sun", "5b8def 22a99a 3fae6a d4a72c e3814f e5534b d9649a 8b7cf6 6e7ff3 4fb3d9 a3b34a 8a94a6"),
  P("b2", "Nord", "bf616a d08770 ebcb8b a3be8c 8fbcbb 88c0d0 81a1c1 5e81ac b48ead d8dee9 4c566a e5e9f0"),
  P("b3", "Catppuccin", "f38ba8 fab387 f9e2af a6e3a1 94e2d5 89dceb 74c7ec 89b4fa b4befe cba6f7 f5c2e7 f2cdcd"),
  P("b4", "Dracula", "ff5555 ffb86c f1fa8c 50fa7b 8be9fd 6272a4 bd93f9 ff79c6 ff9580 9aedfe caa9fa f8f8f2"),
  P("b5", "Gruvbox", "fb4934 fe8019 fabd2f b8bb26 8ec07c 83a598 d3869b cc241d d79921 98971a 458588 b16286"),
  P("b6", "Solarized", "dc322f cb4b16 b58900 859900 2aa198 268bd2 6c71c4 d33682 93a1a1 657b83 eee8d5 586e75"),
  P("b7", "Tokyo Night", "f7768e ff9e64 e0af68 9ece6a 73daca 2ac3de 7dcfff 7aa2f7 bb9af7 c0caf5 565f89 b4f9f8"),
  P("b8", "Rosé Pine", "eb6f92 f6c177 ebbcba 31748f 9ccfd8 c4a7e7 ea9a97 3e8fb0 e0def4 908caa 6e6a86 56949f"),
  // One hue and its neighbors, light to dark.
  P("b9", "Violet Hour", "3b2f8f 4c3db3 5f4fd1 7462e0 8b7cf6 a093f8 b5abfa cac3fb 6e7ff3 5b8def 7aa7f5 9cc0f8"),
  P("b10", "Sunset", "ffd166 ffb84d ff9f43 ff8552 f76c5e ef5d73 e05780 c9518f a84a9c 8548a8 6247aa 4a3f9f"),
  P("b11", "Ocean", "0b4f6c 136f8a 1a8fa8 20a4b8 2ec4b6 5fd3bc 8ee3c8 3a86c8 4f6fd0 6b5bd2 9bd1e5 cbe9f2"),
  P("b12", "Forest", "2d6a4f 40916c 52b788 74c69d 95d5b2 b7b84a d4a373 bc6c25 99582a 6f4e37 a3b18a 588157"),
  P("b13", "Pastel", "ffadad ffd6a5 fdffb6 caffbf 9bf6ff a0c4ff bdb2ff ffc6ff f1c0e8 b9fbc0 98f5e1 8eecf5"),
  P("b14", "Neon", "ff006e fb5607 ffbe0b 8338ec 3a86ff 06d6a0 00f5d4 f15bb5 9b5de5 fee440 00bbf9 ef476f"),
  // Opposites on the wheel: blues against oranges, with two greens between.
  P("b15", "Blue & Orange", "1d4e89 2a6fb0 3f8fd2 6aaee0 9bcbee f4a259 f28c28 e76f51 d1495b bc4b51 8cb369 5b8e7d"),
];
const builtin = () => BUILTIN.map((p) => ({ ...p, colors: [...p.colors] }));

// Nothing saved (or nothing usable) is the built-in palettes with the first selected. A palette
// keeps its good colors, takes the first palette's for the rest, and has SIZE of them.
export function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const seen = new Set();
  const palettes = [];
  for (const p of Array.isArray(r.palettes) ? r.palettes : []) {
    if (!p || typeof p.id !== "string" || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    const given = Array.isArray(p.colors) ? p.colors : [];
    palettes.push({
      id: p.id,
      name: typeof p.name === "string" ? p.name : "",
      colors: BUILTIN[0].colors.map((c, i) => (HEX.test(given[i]) ? given[i].toLowerCase() : c)),
    });
  }
  if (!palettes.length) return { current: BUILTIN[0].id, palettes: builtin() };
  return { current: seen.has(r.current) ? r.current : palettes[0].id, palettes };
}

export const paletteName = (p) => p?.name.trim() || "Untitled palette";
// The selected palette.
export const current = (state) => state.palettes.find((p) => p.id === state.current) ?? state.palettes[0];

export function select(state, id) {
  return state.palettes.some((p) => p.id === id) ? { ...state, current: id } : state;
}

// A copy of a palette, right after it, selected. Returns { state, id }.
export function duplicate(state, id) {
  const at = state.palettes.findIndex((p) => p.id === id);
  if (at < 0) return { state, id: null };
  const n = state.palettes.reduce((m, p) => Math.max(m, Number(/^p(\d+)$/.exec(p.id)?.[1] ?? 0)), 0) + 1;
  const copy = { id: `p${n}`, name: `${paletteName(state.palettes[at])} copy`, colors: [...state.palettes[at].colors] };
  return { state: { current: copy.id, palettes: [...state.palettes.slice(0, at + 1), copy, ...state.palettes.slice(at + 1)] }, id: copy.id };
}

// The palette gone (never the last one). If it was the selected one, the one before it is.
export function remove(state, id) {
  const at = state.palettes.findIndex((p) => p.id === id);
  if (at < 0 || state.palettes.length < 2) return state;
  const palettes = state.palettes.filter((p) => p.id !== id);
  return { current: state.current === id ? palettes[Math.max(0, at - 1)].id : state.current, palettes };
}

export function rename(state, id, name) {
  return { ...state, palettes: state.palettes.map((p) => (p.id === id ? { ...p, name } : p)) };
}

// One color of a palette changed; anything that isn't a color is ignored.
export function setColor(state, id, slot, color) {
  if (!HEX.test(color) || !(slot >= 0 && slot < SIZE)) return state;
  return { ...state, palettes: state.palettes.map((p) => (p.id === id ? { ...p, colors: p.colors.map((c, i) => (i === slot ? color.toLowerCase() : c)) } : p)) };
}

// The built-in palettes as they came (ones removed are back, ones edited are reset), first; the
// ones a person made stay after them.
export function restore(state) {
  const own = state.palettes.filter((p) => !BUILTIN.some((b) => b.id === p.id));
  const palettes = [...builtin(), ...own];
  return { current: palettes.some((p) => p.id === state.current) ? state.current : palettes[0].id, palettes };
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// The place of the color closest to `color` among `colors` (0 when it isn't a color).
export function nearest(colors, color) {
  if (!HEX.test(color ?? "")) return 0;
  const a = rgb(color);
  const far = (c) => rgb(c).reduce((sum, v, i) => sum + (v - a[i]) ** 2, 0);
  return colors.reduce((best, c, i) => (far(c) < far(colors[best]) ? i : best), 0);
}

// A color as hue (0-360), saturation and brightness (0-100), and back: what the picker's sliders move.
export function toHsv(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  const h = !d ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: Math.round(h * 60) % 360, s: Math.round(max ? (d / max) * 100 : 0), v: Math.round(max * 100) };
}

export function fromHsv({ h, s, v }) {
  const S = s / 100, V = v / 100;
  const f = (n) => { const k = (n + h / 60) % 6; return V - V * S * Math.max(0, Math.min(k, 4 - k, 1)); };
  return "#" + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}
