// black-sun's fades, pure logic (`node --test mods/spaces-tree/tests/*.test.js`). The same file sits
// in spaces-tree (an agent's row in the sidebar), side-by-side (its tab and its card's header in
// grid view) and black-sun-tabs (a tab in the tab bar): a mod can only import from its own folder,
// so change all three together.
//   fade()  the focused agent's background, from its space's color into the highlight color
//           (black-sun-settings, "Gradients on agents and terminals")
//   wash()  a space's row, its tag color coming in from the left edge in place of the tag square
//           (black-sun-settings, "Gradients on spaces")
//   pulse() a working agent's glow, slowly brightening and dimming
//           (black-sun-settings, "Working agents pulse")
//   glow()  what an agent is doing, as a color coming in from the right edge
//           (black-sun-settings, "Show status as a glow on the right")
// An element takes one flat color, so each is drawn as thin slices side by side: a list of
// { color ("#rrggbbaa"), grow } left to right, `grow` being a slice's share of the width. The part
// where the color changes gets many slices, each a step too small to see; the flat parts get one.

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const two = (v) => Math.round(v).toString(16).padStart(2, "0");
const ease = (x) => x * x * (3 - 2 * x);

// Not an even blend: the space's color is strong at the left edge, has given way to the highlight
// color by 70% of the width (in `n` steps, easing in and out so no edge shows), and the rest is
// the highlight's quiet tint.
export function fade(from, to, n = 80) {
  const a = rgb(from), b = rgb(to);
  const steps = Array.from({ length: n }, (_x, i) => {
    const f = ease(n > 1 ? i / (n - 1) : 1);
    return { color: "#" + a.map((v, k) => two(v + (b[k] - v) * f)).join("") + two(255 * (0.6 + (0.22 - 0.6) * f)), grow: 0.7 / n };
  });
  return [...steps, { color: to + "38", grow: 0.3 }];
}

// What an agent is doing, as a color: working yellow, done blue, needs you red, idle a quiet
// blue-gray; anything else (a plain terminal) none. And how strong its glow is at the edge (0-1):
// working, done and needs you are as strong and as wide as one another, so they read as the same
// thing in three colors; idle is most of the list most of the time, so it only hints.
const STATUS = { working: "#e0b23a", done: "#3b9eff", blocked: "#e5534b", idle: "#7f8ea3" };
export const statusColor = (status) => STATUS[status] ?? null;
export const statusStrength = (status) => (status === "idle" ? 0.18 : 0.85);

// The slices for a color coming in from the right edge: clear for the left of the row, then the
// color over the last `share` of the width in `n` steps. Not an even rise: it stays faint for most
// of that width and gathers at the edge, where it is strongest (`strength`, 0-1).
export function glow(color, n = 72, share = 0.2, strength = 0.7) {
  return [{ color: color + "00", grow: 1 - share },
    ...Array.from({ length: n }, (_x, i) => ({ color: color + two(255 * strength * ((i + 1) / n) ** 2.2), grow: share / n }))];
}

// The slices for a color coming in from the left edge: strongest (`strength`, 0-1) at the edge,
// easing out over the first `share` of the width in `n` steps, then clear.
export function wash(color, n = 48, share = 0.45, strength = 0.5) {
  return [...Array.from({ length: n }, (_x, i) => ({ color: color + two(255 * strength * ease(1 - i / n)), grow: share / n })),
    { color: color + "00", grow: 1 - share }];
}

// A working agent's glow, pulsing: the same glow at the right edge as done and needs you have, its
// opacity swinging slowly between dim and full. One layer: { slices, loop } with loop the opacity
// swing ({ from, to, period } ms).
export function pulse(color) {
  return [{ slices: glow(color, 72, 0.2, statusStrength("working")), loop: { from: 0.3, to: 1, period: 1400 } }];
}

// The layers behind an agent's row, tab or card header, back to front: each { slices, loop? }
// (loop: its opacity swings, see pulse()).
// focused: it has the keyboard; tag: its space's tag color or null; highlight: the highlight color;
// status: what it is doing; opts: { fade, glow, pulse } the settings (each on unless false).
export function layers({ focused, tag, highlight, status, opts }) {
  const out = [];
  if (focused && tag && opts?.fade !== false) out.push({ slices: fade(tag, highlight) });
  const color = opts?.glow !== false ? statusColor(status) : null;
  if (color && pulsing(status, opts)) out.push(...pulse(color));
  else if (color) out.push({ slices: glow(color, 72, 0.2, statusStrength(status)) });
  return out;
}

// Whether status shows as the glow: then nothing else marks it (no spinner, dot or badge).
export const glowing = (opts) => opts?.glow !== false;

// Whether an agent in this status has a pulsing glow.
export const pulsing = (status, opts) => status === "working" && opts?.glow !== false && opts?.pulse !== false;
