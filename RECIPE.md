# black-sun

A calm Herdr window for running Claude Code agents: your spaces in the sidebar with each space's agents folded under it, the agents list below, a **Skills** button that shows exactly which skills each Claude agent has loaded and where they come from, an **MCP** button that shows its MCP servers and whether each connected, and weekly usage bars for Claude, Fable and Codex. Tabs on top, panes as cards, Files and Changes panels on the right.

## What you see

- **Sidebar** (268px, resizable 44–480, compact rail under 160px), top to bottom:
  - 46px brand bar (Herdr's `workspace-chrome`), drags the window.
  - **Spaces** (`spaces-tree`): Herdr's spaces list (stable colored avatars, worktrees under their checkout, grouped by machine) with each space's agents nested under it; chevrons fold one space's agents or all of them.
  - **Agents** (Herdr's `agents`).
  - **Skills** (`skill-tree`), a 32px row: "◆ Skills · N", N = skills the focused Claude agent has loaded; "◆" only on the rail.
  - **MCP** (`mcp-tree`), a 32px row: "⬡ MCP · N", N = MCP servers the focused Claude agent has; a red dot and "N failed" on the right when any failed; "⬡" (plus the dot) on the rail.
  - **Weekly usage** (`weekly-usage`), 124px: three bars (Claude all models, Fable, Codex) with % used and time to reset; green under 60%, amber to 80%, red above; ↻ refreshes; thin bars on the rail.
  - 69px footer (Herdr's `workspace-chrome`): Settings, Add machine.
- **Work area**: 42px tab bar (Herdr's `tabs`), the shown tab's panes as cards, a hidden 368px right panel stacking Files and Changes, a 28px status bar (Herdr's `workspace-status`).
- No title bar of its own look: `titlebar: none`, macOS traffic lights at [12, 16], `canvas` background, terminal padding [14, 12]. Theme and fonts are yours.

## How it behaves

- **Skills dialog** (560×640): clicking the Skills row opens it on the focused agent.
  - An **Agent** dropdown lists every agent on this computer as "space / tab" with its program icon from Herdr's program table (the focused one marked), then **Global**. Only Claude Code agents can be picked; others (Codex, …) are dimmed and marked "Claude Code only".
  - Agent view: the skills that session actually loaded, from Claude Code's own session log, grouped: **This project** (`<cwd>/.claude/skills`), **Yours** (`~/.claude/skills`), **claude.ai account**, **Plugins** (one group per enabled plugin), **Built into Claude Code**. Each skill: its name in full white (group names are larger but dimmer), the full description on hover, and an **ⓘ**.
  - Global: what any new session gets — your skills, account skills, every enabled plugin's skills, plus built-ins.
  - Every group starts folded; opening one shows its next level folded too (Plugins → one row per plugin). Which groups are open is kept in Herdr's shared state (`skill-tree.open`), so the next dialog — and the next start — opens the same way. ↻ reloads, ✕ or Esc closes. A session with no skill list yet says so and offers Global.
- **Plugin info dialog**: the ⓘ on a plugin's row shows its `plugin.json` (description, version, author name — never the email —, license, homepage), marketplace and repo, installed commit and dates, what it ships (skills, commands, agents, hooks, MCP servers), its folder, and `claude plugin update|disable|enable|uninstall`.
- **Skill info dialog** (520×600): clicking a skill or its ⓘ opens it on top of the Skills dialog; ✕ or Esc closes just it. Everything is read from disk, nothing generated:
  - Kind (Project, Personal, claude.ai account, Plugin, Built into Claude Code) and where it applies.
  - Description: the skill's own, from its `SKILL.md` front matter (or the session's listing when there's no folder).
  - Source: plugin name and version plus marketplace and its GitHub repo (`installed_plugins.json`, `known_marketplaces.json`); for personal skills, `npx skills` and its repo (`~/.agents/.skill-lock.json`), the git repo it lives in, or "made by hand", plus the link it's reached through; the Claude Code version for built-ins (from the `~/.local/bin/claude` link).
  - On disk: the path (links resolved), **Reveal in Finder**, **Copy**.
  - All of its text (description, source, path, steps, commands) can be selected and copied with ⌘C (gpui-base `TextView.html(...).selectable(true)`).
  - Update and Remove: what to do, with commands to copy (`claude plugin update|disable|uninstall <plugin>@<marketplace>`, `npx skills update`, `npx skills remove --global <name>`, `git -C <repo> pull`, `claude update`). Nothing is run.
- **MCP dialog** (560×640): clicking the MCP row opens it on the focused agent, with the same Agent dropdown, Global, folding (kept in `mcp-tree.open`), ↻ and ✕ as the Skills dialog. The header says "N/M connected · K failed".
  - Agent view: every server the session knows, grouped: **This project** (`<cwd>/.mcp.json`), **This project, just you** (`~/.claude.json` → `projects[cwd].mcpServers`), **Yours** (`~/.claude.json` → `mcpServers`), **claude.ai connectors** (seen as `claude_ai_<Name>` tools), **Plugins** (one group per enabled plugin, from its `.mcp.json` or `plugin.json` `mcpServers`), and **Other** for tools of a server found nowhere else. A name in several scopes shows once, where Claude Code takes it from: local, then project, then user.
  - Each server row: a status dot (theme `done` connected, `blocked` failed, `working` connecting, `dim` configured but not loaded), its name, its tool count or "failed", the error on hover, and an ⓘ. A group with a failed server anywhere under it (Plugins → github) gets a red dot after its count, so a failure shows while folded.
  - Status comes from the session log's `deferred_tools_delta` records (tools added and removed, named `mcp__<server>__<tool>`, plus the current `failedMcpServers` and `pendingMcpServers`) and `mcp_instructions_delta` (each server's instructions). After a `compact_boundary` Claude Code re-adds everything, so the state starts over there.
  - Global: your servers and plugins' servers, status "not checked" (there's no session to ask).
- **MCP server info dialog** (520×640): status or error; **Fix it** (when a failed server's config reads `${VAR}`s from the environment it names them, since an unset one empties that part of the config; then `claude mcp login <name>` for HTTP servers, and `/mcp` or a restart to reconnect); its tools; the instructions it gives Claude; its config as Transport, URL (no credentials or query), Program (name only), Arguments (count only), Headers and Environment (names only), Reads variables; its source; and Update/Remove commands to copy (`claude mcp get|remove <name> -s user|local|project`, run in the project folder for local and project; `claude plugin update|disable|uninstall <plugin>@<marketplace>`; claude.ai Settings → Connectors). All text selectable. Nothing is run.
- Agent statuses (working, blocked, done, idle) show as Herdr's `agents` and `spaces` draw them.
- Usage bars refresh every 5 minutes (Claude, Fable) and every minute (Codex); hovering a bar shows the reset time and any refresh error.

## Built from

- `layouts/black-sun.json`: root row → `sidebar` column (`brand`, `sidebar-lists` [`spaces`, `agents`, `skills`, `mcps`, `usage`], `sidebar-footer`) and `work` column (`tabs`, `work-body` [`main` tab block, `panel` stack of `files`/`changes`], `status`). Cloned from Herdr's `main`.
- Mods bundled here: `spaces-tree` (clone of Herdr's `spaces` + nested agents), `skill-tree`, `mcp-tree`, `weekly-usage`. Herdr's own: `workspace-chrome`, `agents`, `tabs`, `files`, `changes`, `workspace-status`.
- `skill-tree`: `model.js` (pure logic incl. `skillInfo`, tests in `tests/`, `node --test mods/skill-tree/tests/*.test.js`), `load.js` (reads), `main.js` (one View, three roles: the row; the Skills dialog when opened with `props().overlay`; the info dialog with `props().info`). Uses `exec`, `readTextFile`, `home`, `agents`, `focused`, `layout`, `theme`, `settings`, `props`, `openOverlay`, `closeOverlay`, `shared`, `setShared`, `fs/promises` `readdir`/`exists`. Runs `ps`, `grep`, `realpath`, `git rev-parse`, `open`, `pbcopy`.
- `mcp-tree`: the same shape as `skill-tree` (`model.js` with `mcpState`, `stripSecrets`, `safeConfig`, `buildMcpTree`, `mcpInfo`, tests in `tests/`; `load.js`; `main.js` with three roles). The picker code is a copy of `skill-tree`'s, since mods can't import each other. Runs `ps`, `grep`, `/usr/bin/python3` (the `~/.claude.json` filter), `pbcopy`.
- `weekly-usage`: `exec` of `security`, `curl` and `grep`.
- Each bundled mod's `mod.json` has `"source"`: where this layout is published.

## Watch out

- **What runs and what is read.** `weekly-usage` reads Claude Code's login from the macOS keychain (`security find-generic-password -s "Claude Code-credentials"`) and calls Anthropic's usage endpoint with it; the token stays inside the shell command. Codex usage comes from the newest `~/.codex/sessions` log. `skill-tree` reads `~/.claude/sessions/<pid>.json` (never the `.key` files beside them), runs `ps eww` on those pids and keeps only `HC_TERMINAL_ID` to match a session to its Herdr terminal, greps the session log for its skill listing, and reads `~/.claude/settings.json`, `~/.claude/plugins/installed_plugins.json`, `known_marketplaces.json`, `~/.agents/.skill-lock.json` and skill folders. Nothing is written; Copy puts text on the clipboard; update and remove commands are only shown.
- **MCP secrets.** MCP configs hold tokens in headers, environment values, arguments and URLs. `mcp-tree` reads `~/.claude.json` only through `/usr/bin/python3 -I` with a filter that prints server entries with those values blanked (argument count kept, `${VAR}` names kept); plugin and project `.mcp.json` go through `stripSecrets` as they're read. No secret value is ever held, shown or copied. Tests check that secret values never come out.
- **Plugin skill folders**: a plugin's `plugin.json` may list its skills at nested paths (`./skills/engineering/tdd`); otherwise they're `skills/<name>`. Its `commands/*.md` show up as skills too. A plugin can ship more skills than a session lists.
- **Claude Code skill listings are incremental**: the session log has one full listing, then partial ones when skills change. The current list is the last full one plus every partial one after it. Removals aren't logged, so a session that lived through a removal still lists the removed skill (under Built-in, having no folder) until it restarts.
- Skills and MCP servers for Claude Code agents only (Codex and other agents are listed, dimmed); this computer only; macOS (`security`, `open -R`).
- Herdr rewrites a layout file on `layout.set` and drops fields it doesn't know, so the `source` pointer lives in the mods' `mod.json`.
- A clicked key in another pane closes an open dialog.

## Install and update

Install: `Read ~/.config/herdr-app/AGENTS.md, then add this layout: herdr.dev/layouts/jorgeper/black-sun`.
Update: replace `layouts/black-sun.json` and the four `mods/` folders with this repo's (keep a copy of yours if you changed them); Herdr's "never overwrite" install rule otherwise adds renamed copies.

## Done when

- `herdr-app check` passes for `skill-tree`, `mcp-tree`, `spaces-tree`, `weekly-usage`; `node --test mods/skill-tree/tests/*.test.js` and `node --test mods/mcp-tree/tests/*.test.js` pass.
- On `black-sun`: the Skills row sits right above Weekly usage and shows a count for a focused Claude agent.
- The dialog opens on the focused agent; its groups' counts add up to the session's skill list; switching to another agent or Global changes the list; Esc closes it.
- A skill's ⓘ opens its info dialog over the Skills dialog with the right kind, source, path and commands; Reveal opens Finder on the folder; Esc closes only the info dialog.
- The MCP row sits under Skills; its dialog lists the focused agent's servers with the right status (a server Claude Code reported as failed shows red with its error); a server's ⓘ shows its tools and config with no secret values.
- Weekly usage shows three bars with percentages after a refresh.
