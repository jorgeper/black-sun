// black-sun-settings' pure logic (no Herdr imports; `node --test mods/black-sun-settings/tests/*.test.js`).
// The settings live in shared state "black-sun.settings"; spaces-tree and weekly-usage read the
// parts they use (spaces-tree's names.js nameOptions() mirrors these defaults and limits).

export const KEY = "black-sun.settings";
export const USAGE_MINUTES = [1, 5, 15, 30];
export const DEFAULTS = { sync: true, rowWords: 5, tabWords: 3, haiku: true, usageMinutes: 5 };
export const ROW_RANGE = [3, 8];
export const TAB_RANGE = [2, 4];

// Defaults for anything unset; numbers clamped; the tab never longer than the row.
export function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const bool = (v, d) => (typeof v === "boolean" ? v : d);
  const num = (v, d, [lo, hi]) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  const rowWords = num(r.rowWords, DEFAULTS.rowWords, ROW_RANGE);
  return {
    sync: bool(r.sync, DEFAULTS.sync),
    rowWords,
    tabWords: Math.min(rowWords, num(r.tabWords, DEFAULTS.tabWords, TAB_RANGE)),
    haiku: bool(r.haiku, DEFAULTS.haiku),
    usageMinutes: USAGE_MINUTES.includes(r.usageMinutes) ? r.usageMinutes : DEFAULTS.usageMinutes,
  };
}

// black-sun's own keys, for the layout's section of keys.json.
export const HOTKEYS = [
  { keys: "cmd-shift-c", action: "spaces-tree.new-claude", label: "New Claude Code agent in this space" },
  { keys: "cmd-shift-x", action: "spaces-tree.new-codex", label: "New Codex agent in this space" },
  { keys: "cmd-shift-r", action: "spaces-tree.auto-name", label: "Auto-name the focused agent" },
  { keys: "cmd-shift-a", action: "spaces-tree.auto-name-all", label: "Auto-name every agent" },
  { keys: "cmd-shift-f", action: "spaces-tree.open-finder", label: "Open the focused agent's folder in Finder" },
];

// Each hotkey with the key its action has now (global or this layout's section), or null.
export function hotkeyState(keys, layout) {
  const mine = (keys ?? []).filter((k) => k.section === "global" || k.section === `layout:${layout}`);
  return HOTKEYS.map((h) => ({ ...h, bound: mine.find((k) => k.action === h.action)?.keys ?? null }));
}

// keys.json's text with the missing hotkeys added to `layout:<layout>`: { text (null when nothing
// changes), added, taken }. A key already doing something else (there or in global) is left alone.
export function addHotkeys(text, layout) {
  let json;
  try { json = JSON.parse(text); } catch { throw new Error("keys.json isn't valid JSON, so it was left as it is."); }
  if (!json || typeof json !== "object") throw new Error("keys.json isn't an object, so it was left as it is.");
  const name = `layout:${layout}`;
  const section = { ...(json[name] ?? {}) };
  const global = json.global ?? {};
  const has = (action) => Object.values(section).includes(action) || Object.values(global).includes(action);
  const added = [];
  const taken = [];
  for (const h of HOTKEYS) {
    if (has(h.action)) continue;
    if (section[h.keys] || global[h.keys]) { taken.push(h.keys); continue; }
    section[h.keys] = h.action;
    added.push(h.keys);
  }
  if (!added.length) return { text: null, added, taken };
  return { text: JSON.stringify({ ...json, [name]: section }, null, 2) + "\n", added, taken };
}

// Yolo mode: Claude Code and Codex start without permission prompts (Codex without its sandbox
// too). Set in programs.json's `run` (how Herdr starts each agent, for every menu and layout),
// so it's read from there too. Herdr's own commands, to tell an override from ours.
export const YOLO = {
  claude: { flag: "--dangerously-skip-permissions", builtin: ["claude"] },
  codex: { flag: "--dangerously-bypass-approvals-and-sandbox", builtin: ["codex", "--no-daemon"] },
};

function parsePrograms(text) {
  if (text == null) return {};
  let json;
  try { json = JSON.parse(text); } catch { throw new Error("programs.json isn't valid JSON, so it was left as it is."); }
  if (!json || typeof json !== "object") throw new Error("programs.json isn't an object, so it was left as it is.");
  return json;
}

// true when both start in yolo mode, false when neither, "some" for one; null if unreadable.
export function yoloState(text) {
  let json;
  try { json = parsePrograms(text); } catch { return null; }
  const on = Object.entries(YOLO).map(([k, { flag }]) => (json.programs?.[k]?.run ?? []).includes(flag));
  return on.every(Boolean) ? true : on.some(Boolean) ? "some" : false;
}

// programs.json's text with the yolo flags added (on) or taken out (off), keeping every other
// entry and field; an entry left with Herdr's own command loses its `run`, and an emptied entry
// goes. null when nothing changes.
export function applyYolo(text, on) {
  const json = parsePrograms(text);
  const programs = { ...(json.programs ?? {}) };
  for (const [key, { flag, builtin }] of Object.entries(YOLO)) {
    const entry = { ...(programs[key] ?? {}) };
    let run = (entry.run ?? builtin).filter((x) => x !== flag);
    if (on) run = [...run, flag];
    if (!on && JSON.stringify(run) === JSON.stringify(builtin)) delete entry.run;
    else entry.run = run;
    if (Object.keys(entry).length) programs[key] = entry;
    else delete programs[key];
  }
  const out = JSON.stringify({ ...json, programs }, null, 2) + "\n";
  return text != null && JSON.stringify(parsePrograms(text)) === JSON.stringify(JSON.parse(out)) ? null : out;
}
