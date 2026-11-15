// The number before each agent or terminal in the sidebar, pure logic
// (`node --test mods/spaces-tree/tests/*.test.js`). It is the tab's number, and ⌘1–9 go to it
// (keys.json `spaces-tree.go-<n>`, see go()). A setting (black-sun-settings, "Numbers"):
//   "local"   a tab's place in its own space: ⌘n is the nth tab of the space you are in.
// Either way a space's placeholder tab (empty.js, `hidden`) isn't counted.
//   "global"  1, 2, 3, … down the whole sidebar, over every space: ⌘n is the same tab wherever
//             you are. Only tabs with something listed count (a tab holding only a mod has no row).

export const MODES = ["global", "local"];
export const mode = (settings) => (settings?.numbers === "local" ? "local" : "global");

// The spaces in the order the sidebar lists them: this computer's first, then each other
// machine's by name; within one, as Herdr has them.
export function listed(spaces) {
  const name = (s) => s.machine ?? "";
  return spaces.map((s, i) => [s, i]).sort(([a, i], [b, j]) => (name(a) === name(b) ? i - j : !name(a) ? -1 : !name(b) ? 1 : name(a) < name(b) ? -1 : 1)).map(([s]) => s);
}

// Each tab's number: Map of tab id -> number.
// spaces: spaces() ([{ id, machine?, tabs: [{ id, index }] }]); rows: Map of space id -> what the
// space lists ([{ tab }]); which: "global" or "local"; hidden: Set of tab ids left out.
export function numbers(spaces, rows, which, hidden = new Set()) {
  const out = new Map();
  if (which === "local") {
    for (const s of spaces) (s.tabs ?? []).filter((t) => !hidden.has(t.id)).forEach((t, i) => out.set(t.id, i + 1));
    return out;
  }
  let n = 0;
  for (const s of listed(spaces)) {
    const has = new Set((rows.get(s.id) ?? []).map((r) => r.tab));
    for (const t of s.tabs ?? []) if (has.has(t.id)) out.set(t.id, ++n);
  }
  return out;
}

// What ⌘n does: [command, args], or null when there is no such tab.
// Local: the nth tab of the shown space. Global: the tab with that number, through the first thing listed in it
// (its pane, which shows its space and tab too; `inGrid` says whether a terminal is shown in grid
// view, where it is focused by its address instead).
export function go(n, spaces, rows, which, inGrid = () => false, hidden = new Set()) {
  if (!(n >= 1)) return null;
  if (which === "local") {
    const tab = (spaces.find((s) => s.active)?.tabs ?? []).filter((t) => !hidden.has(t.id))[n - 1];
    return tab ? ["tab.select", { id: tab.id }] : null;
  }
  const byNumber = numbers(spaces, rows, "global");
  const tab = [...byNumber].find(([, k]) => k === n)?.[0];
  const row = tab && [...rows.values()].flat().find((r) => r.tab === tab);
  if (!row) return null;
  return ["pane.focus", inGrid(row.address) ? { terminal: row.address } : { pane: row.pane }];
}
