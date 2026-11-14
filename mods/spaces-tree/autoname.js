// Also shortens an agent's own title to a tab name for spaces-tree's sync (shortenTitle).
// Auto-name: a short title for what an agent's session is doing now, from the end of its own
// log, by Claude Haiku (`claude -p`, the person's own login), set as its tab's name.
// Reads: ~/.claude/sessions/<pid>.json (never the .key files beside them) and `ps eww` of those
// pids, keeping only HC_TERMINAL_ID; the tail of that session's log; for Codex, the newest
// ~/.codex/sessions rollout whose folder is the agent's. Sends at most 4,000 characters of what
// was said (no tool output) to Anthropic. Writes nothing but the tab's name.
import { exec, readTextFile, home, agents, panes, run } from "herdr";
import { readdir } from "fs/promises";
import { claudeExcerpt, codexExcerpt, cleanTitle, shortTitle, namePair } from "./names.js";

const PROMPT = 'Below is the end of a coding session (on stdin). Name what it is working on now, judging by the most recent messages. Reply with exactly two lines and nothing else:\nRow: <AT MOST 5 words>\nTab: <AT MOST 3 words>\nKeep the subject, drop filler words like "and", "the", "to". Example:\nRow: Herdr agent rename menu\nTab: Agent rename menu';
const SHORTEN = 'Rewrite the title on stdin as a tab name of AT MOST 3 words: keep the subject, drop filler words like "and", "the", "to". Examples: "Copying backup files to disk" -> Backup disk copy; "Fix flaky login tests in CI" -> Flaky login tests. Reply with only the tab name.';

// Claude Haiku through the person's own Claude Code login: `input` on stdin, nothing saved.
async function haiku(input, prompt) {
  const r = await exec("sh", ["-c", 'printf %s "$1" | claude -p --model haiku --no-session-persistence --tools "" --setting-sources "" "$2"', "agent-names", input, prompt],
    { cwd: home(), timeout: 60000 }).catch((e) => ({ code: 1, stdout: "", stderr: String(e?.message ?? e) }));
  if (r.code !== 0) throw new Error(`claude -p failed: ${(r.stderr || r.stdout).trim().split("\n").pop() || `exit ${r.code}`}`);
  return r.stdout;
}

// A tab-sized version of an agent's own title (only the title is sent); trimmed to 3 words
// when Haiku can't help.
export async function shortenTitle(title) {
  try { return cleanTitle(await haiku(title, SHORTEN)) ?? shortTitle(title); }
  catch { return shortTitle(title); }
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
// most 5 words, a tab name of at most 3) after renaming its tab; throws an Error whose message
// a person can read.
export async function autoName(a) {
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
  const said = await haiku(excerpt, PROMPT);
  const pair = namePair(said);
  if (!pair) throw new Error(`Haiku's answer wasn't a title: ${said.trim().slice(0, 80)}`);
  run("tab.rename", { id: a.tab, name: pair.tab });
  return pair;
}
