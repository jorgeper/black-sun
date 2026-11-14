// Also shortens an agent's own title to a tab name for spaces-tree's sync (shortenTitle).
// Auto-name: a short title for what an agent's session is doing now, from the end of its own
// log, by Claude Haiku (`claude -p`, the person's own login), set as its tab's name.
// Reads: ~/.claude/sessions/<pid>.json (never the .key files beside them) and `ps eww` of those
// pids, keeping only HC_TERMINAL_ID; the tail of that session's log; for Codex, the newest
// ~/.codex/sessions rollout whose folder is the agent's. Sends at most 4,000 characters of what
// was said (no tool output) to Anthropic. Writes nothing but the tab's name.
import { exec, readTextFile, home, agents, panes, run } from "herdr";
import { readdir } from "fs/promises";
import { claudeExcerpt, codexExcerpt, cleanTitle, shortTitle, namePair, namePrompt, shortenPrompt, TAB_WORDS } from "./names.js";

// The prompts (with black-sun's word limits) are names.js's namePrompt and shortenPrompt.

// Claude Haiku through the person's own Claude Code login: `input` on stdin, nothing saved.
async function haiku(input, prompt) {
  const r = await exec("sh", ["-c", 'printf %s "$1" | claude -p --model haiku --no-session-persistence --tools "" --setting-sources "" "$2"', "agent-names", input, prompt],
    { cwd: home(), timeout: 60000 }).catch((e) => ({ code: 1, stdout: "", stderr: String(e?.message ?? e) }));
  if (r.code !== 0) throw new Error(`claude -p failed: ${(r.stderr || r.stdout).trim().split("\n").pop() || `exit ${r.code}`}`);
  return r.stdout;
}

// A tab-sized version of an agent's own title (only the title is sent); trimmed to 3 words
// when Haiku can't help.
export async function shortenTitle(title, tabWords = TAB_WORDS) {
  try { return cleanTitle(await haiku(title, shortenPrompt(tabWords)), tabWords) ?? shortTitle(title, tabWords); }
  catch { return shortTitle(title, tabWords); }
}

const projectDirName = (cwd) => cwd.replace(/[/.]/g, "-");
const terminalIdFromPs = (out) => /(?:^|\s)HC_TERMINAL_ID=(\S+)/.exec(out ?? "")?.[1] ?? null;

async function json(path) {
  try { return JSON.parse((await readTextFile(path)) ?? "null"); } catch { return null; }
}

async function tail(path) {
  const r = await exec("tail", ["-c", "3000000", path], { timeout: 15000 }).catch(() => null);
  if (!r || r.code !== 0) return null;
  return r.stdout;
}

// The Claude Code session running in this terminal: its log's path, or null.
async function claudeLog(terminal) {
  const dir = `${home()}/.claude/sessions`;
  let files = [];
  try { files = (await readdir(dir)).filter((n) => /^\d+\.json$/.test(n)); } catch {}
  let best = null;
  for (const f of files) {
    const s = await json(`${dir}/${f}`);
    if (!s?.pid || !s.sessionId || !s.cwd) continue;
    const ps = await exec("ps", ["eww", "-o", "command=", "-p", String(s.pid)], { timeout: 5000 }).catch(() => null);
    if (terminalIdFromPs(ps?.stdout) !== terminal) continue;
    if (!best || (s.startedAt ?? 0) > (best.startedAt ?? 0)) best = s;
  }
  return best ? `${home()}/.claude/projects/${projectDirName(best.cwd)}/${best.sessionId}.jsonl` : null;
}

// The newest Codex rollout started in `cwd`, among the 40 newest.
async function codexLog(cwd) {
  const script = 'for f in $(ls -t "$HOME"/.codex/sessions/*/*/*/rollout-*.jsonl 2>/dev/null | head -40); do printf "%s\\t" "$f"; grep -m1 -o "\\"cwd\\":\\"[^\\"]*\\"" "$f" | head -1; done';
  const r = await exec("sh", ["-c", script], { timeout: 15000 }).catch(() => null);
  for (const line of (r?.stdout ?? "").split("\n")) {
    const [path, field] = line.split("\t");
    const m = /"cwd":"(.*)"/.exec(field ?? "");
    if (m && m[1] === cwd) return path;
  }
  return null;
}

const cwdOf = (a) => panes().find((p) => p.terminal === a.address)?.cwd ?? null;

// Names `a` after what its session is doing now: resolves { row, tab } (a sidebar name of at
// most words.rowWords words, a tab name of at most words.tabWords) after renaming its tab; throws an Error whose message
// a person can read.
export async function autoName(a, words = {}) {
  if (a.address.includes("/")) throw new Error("Auto-name works for agents on this computer only.");
  const kind = a.program?.key;
  let text;
  let read;
  if (kind === "claude") {
    const log = await claudeLog(a.address);
    if (!log) throw new Error("Couldn't find this agent's Claude Code session.");
    text = await tail(log);
    read = claudeExcerpt;
  } else if (kind === "codex") {
    const cwd = cwdOf(a);
    if (!cwd) throw new Error("Couldn't tell which folder this Codex agent is in.");
    const twins = agents().filter((x) => x.address !== a.address && x.program?.key === "codex" && cwdOf(x) === cwd);
    if (twins.length) throw new Error("Another Codex agent runs in the same folder, so there's no telling which session is this one.");
    const log = await codexLog(cwd);
    if (!log) throw new Error("Couldn't find this agent's Codex session.");
    text = await tail(log);
    read = codexExcerpt;
  } else {
    throw new Error(`Auto-name works for Claude Code and Codex agents, not ${a.program?.name ?? "this program"}.`);
  }
  if (text == null) throw new Error("Couldn't read this agent's session log.");
  const excerpt = read(text);
  if (!excerpt) throw new Error("Nothing said in this session yet to name it from.");
  const said = await haiku(excerpt, namePrompt(words));
  const pair = namePair(said, words);
  if (!pair) throw new Error(`Haiku's answer wasn't a title: ${said.trim().slice(0, 80)}`);
  run("tab.rename", { id: a.tab, name: pair.tab });
  return pair;
}
