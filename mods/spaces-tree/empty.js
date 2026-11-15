// Spaces that stay when empty, pure logic (`node --test mods/spaces-tree/tests/*.test.js`).
//
// Herdr closes a space with its last tab. So, with the setting on (black-sun-settings, "Spaces
// stay when empty"), a space keeps one tab that is never closed with the others: a placeholder,
// whose pane is the black-sun-empty mod. While the space has other tabs it is settled (Herdr's
// word for put away: tab.select by number, next and previous skip it) and black-sun's tab bar
// leaves it out, so nobody sees it. When the last other tab is closed, Herdr shows it, and the
// space is empty: "Nothing in this space yet", until something is added.
// A space gets its placeholder when it is the shown one (a new tab is shown when made, so making
// it there and going back to the tab that was shown moves nothing else).
//
// placeholders (shared "black-sun.empty"): { <space id>: { tab } }.
// pending: null or { space, known: [tab ids], back, at }: a placeholder was asked for in that
// space, which had those tabs and showed `back`.

export const KEY = "black-sun.empty";
export const MOD = "black-sun-empty";
const WAIT = 5000;

// What to do now. spaces: spaces() ([{ id, active, tabs: [{ id, active, settled }] }]); on: the setting.
// Returns { pending, placeholders, actions: [[command, args], ...] }; placeholders is the same
// object when nothing in it changed.
export function step(spaces, pending, placeholders, now, on = true) {
  const actions = [];
  const byId = new Map(spaces.map((s) => [s.id, s]));
  const given = placeholders && typeof placeholders === "object" ? placeholders : {};
  const held = {};
  for (const [space, p] of Object.entries(given)) {
    const tabs = byId.get(space)?.tabs ?? [];
    if (p && typeof p.tab === "string" && tabs.some((t) => t.id === p.tab)) held[space] = { tab: p.tab };
  }
  let next = pending && now - pending.at <= WAIT && byId.has(pending.space) ? pending : null;
  // The placeholder asked for has come: the tab that wasn't there before.
  if (next) {
    const made = byId.get(next.space).tabs?.find((t) => !next.known.includes(t.id));
    if (made) held[next.space] = { tab: made.id };
  }
  const back = next && held[next.space] ? next.back : null;
  if (next && held[next.space]) next = null;
  for (const [space, p] of Object.entries(held)) {
    const tabs = byId.get(space).tabs;
    const others = tabs.filter((t) => t.id !== p.tab);
    if (!others.length) continue; // the space is empty: its placeholder is what it shows
    const mine = tabs.find((t) => t.id === p.tab);
    if (!on) {
      // The setting was turned off: the placeholder goes (an empty space keeps its own).
      actions.push(["tab.close", { id: p.tab, confirmed: true }]);
      delete held[space];
      continue;
    }
    // Shown while there are other tabs (just made, or Herdr went to it when a tab closed): back
    // to a real tab. Then put away again.
    if (mine.active) actions.push(["tab.select", { id: others.some((t) => t.id === back) ? back : others[others.length - 1].id }]);
    if (mine.active || !mine.settled) actions.push(["tab.settle", { id: p.tab }]);
  }
  // The shown space has none yet: one is made there.
  const shown = spaces.find((s) => s.active);
  if (on && !next && shown && (shown.tabs ?? []).length && !held[shown.id]) {
    actions.push(["tab.new", { name: "Empty", space: shown.id, mod: MOD }]);
    next = { space: shown.id, known: shown.tabs.map((t) => t.id), back: shown.tabs.find((t) => t.active)?.id ?? null, at: now };
  }
  return { pending: next, placeholders: JSON.stringify(held) === JSON.stringify(given) ? placeholders : held, actions };
}

// The placeholder tabs' ids: left out of the tab bar and of the numbers.
export const placeholderTabs = (placeholders) => new Set(Object.values(placeholders && typeof placeholders === "object" ? placeholders : {}).map((p) => p?.tab).filter(Boolean));
