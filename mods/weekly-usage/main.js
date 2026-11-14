// Weekly usage limits as three bars: Claude (all models), Fable, and Codex.
// Claude's come from the same endpoint Claude Code's /usage reads, using Claude
// Code's own login from the macOS keychain; the token stays inside the shell
// command and is never kept here. Codex's come from its newest session log.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, theme, layout, shared } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// Claude and Fable refresh every black-sun setting "usageMinutes" (1, 5, 15 or 30; default 5).
const claudeEvery = () => ([1, 5, 15, 30].includes(shared("black-sun.settings")?.usageMinutes) ? shared("black-sun.settings").usageMinutes : 5) * 60000;
const CODEX_EVERY = 60000;

const CLAUDE_SH = `
cred=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null) || { echo '{"error":"no Claude Code login in the keychain"}'; exit 0; }
tok=$(printf '%s' "$cred" | /usr/bin/python3 -c 'import sys,json; print(json.load(sys.stdin)["claudeAiOauth"]["accessToken"])' 2>/dev/null)
[ -n "$tok" ] || { echo '{"error":"could not read the Claude Code login"}'; exit 0; }
curl -s --max-time 20 https://api.anthropic.com/api/oauth/usage -H "Authorization: Bearer $tok" -H "anthropic-beta: oauth-2025-04-20"
`;

// The last rate-limit reading in the newest Codex session that has one.
const CODEX_SH = `
for f in $(ls -t $(find "$HOME/.codex/sessions" -name '*.jsonl' -mtime -8 2>/dev/null) 2>/dev/null | head -20); do
  line=$(grep '"rate_limits":{' "$f" | tail -1)
  [ -n "$line" ] && { printf '%s' "$line"; exit 0; }
done
`;

function left(ms) {
  if (!(ms > 0)) return "";
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h >= 1) return `${h}h`;
  return `${Math.max(1, Math.floor(ms / 60000))}m`;
}

export default class UsageBars extends View {
  init(_props, cx) {
    // name -> { percent, resets (ms), error }
    this.bars = { claude: null, fable: null, codex: null };
    this.refreshClaude(cx);
    this.refreshCodex(cx);
    cx.timer.every(30000, (cx) => { if (Date.now() - (this.claudeAt ?? 0) >= claudeEvery()) this.refreshClaude(cx); });
    cx.timer.every(CODEX_EVERY, (cx) => this.refreshCodex(cx));
  }

  refreshClaude(cx) {
    if (this.claudeBusy) return;
    this.claudeBusy = true;
    this.claudeAt = Date.now();
    cx.spawn(async (cx) => {
      try {
        const r = await exec("sh", ["-c", CLAUDE_SH], { timeout: 30000 });
        const j = JSON.parse(r.stdout);
        if (j.error && !j.limits) throw new Error(typeof j.error === "string" ? j.error : j.error.message ?? "Claude usage unavailable");
        const limits = j.limits ?? [];
        const all = limits.find((l) => l.kind === "weekly_all");
        const fable = limits.find((l) => l.group === "weekly" && /fable/i.test(l.scope?.model?.display_name ?? ""));
        const bar = (l, fallback) => l ? { percent: l.percent, resets: Date.parse(l.resets_at) }
          : fallback ? { percent: fallback.utilization, resets: Date.parse(fallback.resets_at) } : { percent: 0, resets: null };
        this.bars.claude = bar(all, j.seven_day);
        this.bars.fable = bar(fable);
      } catch (e) {
        const error = String(e.message ?? e);
        // Keep the last good reading; say it couldn't refresh.
        this.bars.claude = { ...(this.bars.claude ?? {}), error };
        this.bars.fable = { ...(this.bars.fable ?? {}), error };
      }
      this.claudeBusy = false;
      cx.notify();
    });
  }

  refreshCodex(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("sh", ["-c", CODEX_SH], { timeout: 15000 });
        if (!r.stdout.trim()) throw new Error("no Codex session in the last week");
        const rl = JSON.parse(r.stdout).payload?.rate_limits ?? {};
        const w = [rl.primary, rl.secondary].find((x) => x?.window_minutes === 10080) ?? rl.secondary ?? rl.primary;
        if (!w) throw new Error("Codex reported no weekly window");
        const resets = w.resets_at * 1000;
        // A reading from before the reset says nothing about this week.
        this.bars.codex = { percent: resets < Date.now() ? 0 : w.used_percent, resets: resets < Date.now() ? null : resets };
      } catch (e) {
        this.bars.codex = { ...(this.bars.codex ?? {}), error: String(e.message ?? e) };
      }
      cx.notify();
    });
  }

  color(t, p) {
    return p >= 80 ? t.blocked : p >= 60 ? t.ansi3 : t.ansi2;
  }

  bar(t, id, label, b, now) {
    const p = Math.max(0, Math.min(100, Math.round(b?.percent ?? 0)));
    const known = b && b.percent != null;
    const resets = b?.resets ? left(b.resets - now) : "";
    const tip = [
      `${label}: ${known ? `${p}% of the weekly limit used` : "no reading yet"}`,
      b?.resets ? `resets ${new Date(b.resets).toLocaleString()}` : null,
      b?.error ? `last refresh failed: ${b.error}` : null,
    ].filter(Boolean).join("\n");
    return h_flex()
      .id(`usage-${id}`)
      .h(24)
      .px(8)
      .gap(8)
      .flex_none()
      .items_center()
      .rounded(6)
      .hover((s) => s.bg(t.hover))
      .tooltip(tip)
      .child(div().w(42).flex_none().text_size(12).text_color(t.muted).child(label))
      .child(div().flex_1().h(6).rounded(3).bg(t.raised)
        .child(div().h_full().rounded(3).w(`${p}%`).bg(known ? this.color(t, p) : t.dim)))
      .child(div().w(32).flex_none().text_right().text_size(11.5).text_color(b?.error ? t.dim : t.foreground).child(known ? `${p}%` : "–"))
      .child(div().w(44).flex_none().text_right().text_size(11).text_color(t.dim).child(resets));
  }

  // The rail: three thin bars, details in their tooltips.
  thin(t, id, label, b) {
    const p = Math.max(0, Math.min(100, Math.round(b?.percent ?? 0)));
    return div().id(`usage-${id}`).w(28).h(5).rounded(3).bg(t.raised)
      .tooltip(`${label}: ${b?.percent != null ? `${p}%` : "no reading yet"}`)
      .child(div().h_full().rounded(3).w(`${p}%`).bg(this.color(t, p)));
  }

  render() {
    const t = theme();
    const now = Date.now();
    const rows = [["claude", "Claude"], ["fable", "Fable"], ["codex", "Codex"]];
    if (narrow()) {
      return v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).items_center().justify_center().gap(6)
        .children(rows.map(([id, label]) => this.thin(t, id, label, this.bars[id])));
    }
    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .child(h_flex().px(16).h(41).pt(14).pb(5).flex_none().items_center().justify_between()
        .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Weekly usage"))
        .child(div().id("usage-refresh").text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.text_color(t.foreground))
          .tooltip("Refresh")
          .on_click((_e, cx) => { this.refreshClaude(cx); this.refreshCodex(cx); })
          .child("↻")))
      .child(v_flex().px(8).pb(8).children(rows.map(([id, label]) => this.bar(t, id, label, this.bars[id], now))));
  }
}
