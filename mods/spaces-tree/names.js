// Agent names: pure logic for spaces-tree's tab-name sync and Auto-name. No Herdr imports, so
// `node --test mods/spaces-tree/tests/*.test.js` runs it. The tab's name is the one name: the
// sidebar row shows a named tab's name, so naming the tab names both.

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

// The agent's own title when it says something: not the program's name or key, a path, or a
// shell's user@host.
export function telling(a) {
  const live = clean(a?.title);
  if (!live) return null;
  const path = /^[~/]|^[A-Za-z]:\\/.test((a.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  if (path || live.includes("@") || live === a.program?.name || live.toLowerCase() === a.program?.key) return null;
  return live;
}

// Codex titles read "[<status> | ]<thread title> | <folder>": keep the thread title (the tab's
// space already says where, and the status changes).
function threadTitle(s) {
  const parts = s.split(/\s+\|\s+/);
  if (parts.length > 1 && parts[parts.length - 1].length <= 40) parts.pop();
  const t = parts[parts.length - 1].trim();
  return STATUS.test(t) ? null : t;
}
const STATUS = /^(action required|working|thinking|running|waiting|ready|idle|done)$/i;

// Each tab can carry a pair of names (`given`: tab id -> { tab, row, by }): a short one on the
// tab (TAB_WORDS) and a longer one for its sidebar row (ROW_WORDS). `by` is "sync" or "auto"
// (Auto-name). The row shows `row` while the tab still carries `tab`; a person's rename shows the
// same name in both.

// A just-started agent's name on its tab and row, until it says what it's doing.
export const NEW = "<new>";

// Tabs whose name sync should set, with the agent's title (the caller shortens it; null: NEW): tabs holding
// exactly one agent whose title says something, and either nobody named (or only with the
// program's name, as Herdr's launcher does) or still carrying the name sync gave them
// (`given`: tab id -> that name). A tab sync named that is unnamed now was reset by a person,
// and a different name is a person's: both are left alone.
export function syncTargets(agents, tabs, given) {
  const count = new Map();
  for (const a of agents) count.set(a.tab, (count.get(a.tab) ?? 0) + 1);
  const out = [];
  for (const tab of tabs) {
    if (count.get(tab.id) !== 1) continue;
    const a = agents.find((x) => x.tab === tab.id);
    const g = given[tab.id];
    if (g ? g.by !== "sync" || !(tab.named && tab.name === g.tab) : tab.named && tab.name !== a.program?.name && tab.name !== NEW) continue;
    const title = telling(a) && threadTitle(telling(a));
    // No title yet: the tab (and so its row) says NEW, once it isn't already.
    if (title) out.push({ tab: tab.id, title });
    else if (!g && tab.name !== NEW) out.push({ tab: tab.id, title: null });
  }
  return out;
}

export const TAB_WORDS = 3;
export const ROW_WORDS = 5;
const SMALL = new Set(["a", "an", "the", "to", "for", "of", "in", "on", "and", "or", "with", "from", "by", "at", "into", "via"]);

// At most `max` words. A longer title loses its little words first ("and", "the", ...), then
// whatever is past the limit.
export function shortTitle(title, max = TAB_WORDS) {
  let words = String(title ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length > max) {
    const big = words.filter((w) => !SMALL.has(w.toLowerCase()));
    words = (big.length ? big : words).slice(0, max);
  }
  return words.length ? words.join(" ") : null;
}

const TURNS = 6;
const PER_TEXT = 400;
const TOTAL = 4000;
const clip = (s) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > PER_TEXT ? `${t.slice(0, PER_TEXT)}…` : t;
};
// Text a person typed, not something a harness injected.
const said = (s) => !!s && !s.startsWith("<") && !s.startsWith("[Request interrupted") && !s.startsWith("# AGENTS.md");

// "User: …\nAssistant: …" for the last TURNS user messages and everything said after them,
// each text clipped, the whole kept under TOTAL characters (from the end).
function excerpt(said) {
  let starts = 0;
  let from = 0;
  for (let i = said.length - 1; i >= 0; i--) {
    if (said[i][0] === "User" && ++starts === TURNS) { from = i; break; }
  }
  const lines = said.slice(from).map(([who, text]) => `${who}: ${clip(text)}`);
  while (lines.length > 1 && lines.join("\n").length > TOTAL) lines.shift();
  return lines.join("\n").slice(-TOTAL);
}

function parse(line) {
  try { return JSON.parse(line); } catch { return null; }
}

export function claudeExcerpt(jsonlText) {
  const out = [];
  for (const line of (jsonlText ?? "").split("\n")) {
    if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) continue;
    const o = parse(line);
    if (!o || o.isMeta || o.isCompactSummary || o.isSidechain || o.toolUseResult) continue;
    const content = o.message?.content;
    const texts = typeof content === "string" ? [content]
      : Array.isArray(content) ? content.filter((b) => b?.type === "text").map((b) => b.text) : [];
    const who = o.type === "user" ? "User" : o.type === "assistant" ? "Assistant" : null;
    if (!who) continue;
    for (const t of texts) if (said(String(t ?? "").trim())) out.push([who, String(t)]);
  }
  return excerpt(out);
}

export function codexExcerpt(jsonlText) {
  const out = [];
  for (const line of (jsonlText ?? "").split("\n")) {
    if (!line.includes('"response_item"')) continue;
    const p = parse(line)?.payload;
    if (p?.type !== "message" || (p.role !== "user" && p.role !== "assistant")) continue;
    for (const c of p.content ?? []) {
      const t = String(c?.text ?? "").trim();
      if (said(t)) out.push([p.role === "user" ? "User" : "Assistant", t]);
    }
  }
  return excerpt(out);
}

// Haiku's answer as a tab name: its first line, without quotes, markdown, a "Title:" label or a
// trailing period, cut to `max` words; null when nothing is left or it's longer than a
// title (60 characters).
export function cleanTitle(raw, max = TAB_WORDS) {
  const first = String(raw ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const t = first
    .replace(/[*_`#]/g, "")
    .replace(/^(title|row|tab|name)\s*:\s*/i, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[.。]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return t && t.length <= 60 ? shortTitle(t, max) : null;
}

// Auto-name's answer, "Row: …" then "Tab: …", as { row, tab }; a single line serves both.
export function namePair(raw) {
  const lines = String(raw ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const row = cleanTitle(lines[0], ROW_WORDS);
  if (!row) return null;
  return { row, tab: (lines[1] && cleanTitle(lines[1], TAB_WORDS)) || shortTitle(row, TAB_WORDS) };
}

// An agent row's name: the row name while its tab still carries the tab name we gave it; else
// the agent's own title unless a person named the tab (not just with the program's name), then
// that name; else the program. Titles at most ROW_WORDS words.
export function rowLabel(a, tab, given) {
  if (given && tab?.named && tab.name === given.tab && given.row) return given.row;
  const prog = a.program?.name;
  const live = telling(a);
  if (live && !(tab?.named && tab.name !== prog)) return shortTitle(threadTitle(live) ?? live, ROW_WORDS);
  if (tab?.named) return tab.name;
  return prog || clean(a.title) || a.address;
}

// Agents Auto-name can name: Claude Code and Codex, on this computer.
export function nameable(a) {
  return !!a && !a.address.includes("/") && ["claude", "codex"].includes(a.program?.key);
}
