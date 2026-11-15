# black-sun

A [Herdr](https://herdr.dev) layout for running many Claude Code and Codex agents at once: every space with its agents under it, names that say what each agent is doing, right-click menus to start, rename and close agents, and buttons that show which skills and MCP servers each agent has loaded.

## Features

**Sidebar**, top to bottom:

- **Spaces with their agents.** Each space lists its agents under it. Each row shows the agent's tab number (what ⌘1–9 goes to), its icon and name, how long it has been in its current state, and that state (working, needs you, done, idle). Chevrons fold one space's agents, or all of them.
- **A foldable Agents list.** Herdr's Agents list, sorted by priority or grouped by space. The chevron in its header folds it down to the header to give Spaces the room.
- **Skills · N.** Click it to see the skills a Claude agent has loaded, grouped by where they come from (this project, yours, your claude.ai account, each plugin, built in), plus the project's `.agents/skills` in a group of its own (Codex reads that folder; Claude Code doesn't). An agent dropdown switches agents; picking a Codex or other agent shows the `.agents/skills` folders it can read (the project's and your personal one), and Global shows installed Claude skills plus shared personal skills from `~/.agents/skills` (under Yours), without duplicates. A skill's or plugin's **ⓘ** shows its kind, source, location on disk, description, and how to update or remove it.
- **MCP · N.** The same for MCP servers: which connected and which failed (a red dot, all the way up the tree), the tools each one gave the agent, its instructions, its config with every secret value hidden, and how to fix a failed server.
- **Weekly usage.** Bars for Claude, Fable and Codex: how much of the weekly limit is used, and when it resets.

**Agent names:**

- An agent's sidebar row and its tab show the same name: up to 5 words on the row, 2–3 on the tab. They come from the agent's own title, and a title too long for the tab is shortened by Claude Haiku.
- A just-started agent reads `<new>` until it says what it's doing.
- **Rename** (F2) lets you type a name. **Auto-name** (⌘⇧R) names an agent after what its session is doing now, read from its last few exchanges. **Auto-name all** (⌘⇧A) does every agent at once. The automatic names never replace a name you typed; only Auto-name, when you ask, does.

**Right-click menus** (drawn like Herdr's own, with their hotkeys):

- **On an agent:** Rename, Auto-name, Auto-name all, and Close (closes the whole tab when the agent is alone in it, otherwise just its pane).
- **On a space:** start Claude Code, Codex, any other installed agent, or a terminal in *that* space, then Rename, worktrees and Close.
- ⌘⇧C and ⌘⇧X start Claude Code or Codex in the space you're in, from anywhere.

| Hotkey | Does |
|---|---|
| ⌘⇧C / ⌘⇧X | New Claude Code / Codex agent in this space |
| F2 | Rename the agent's tab |
| ⌘⇧R | Auto-name the focused agent |
| ⌘⇧A | Auto-name every agent |
| ⌘1–9 | Go to that tab (the number on each agent row) |

The ⌘⇧ keys need four lines in your `keys.json`: Settings adds them for you, or see below.

**Settings** (the gear in the Spaces header):

- Show or hide the Agents list, Skills, MCP and Weekly usage.
- **Yolo mode**: start every new Claude Code and Codex agent without permission prompts (Codex also without its sandbox).
- Agent names: name agents after their titles or not, how many words go on a sidebar row (3–8) and on a tab (2–4), and whether Haiku shortens long tab names or words are simply cut.
- How often Claude and Fable usage refreshes (1, 5, 15 or 30 minutes).
- Which black-sun hotkeys are set, with a button that adds the missing ones to `keys.json`.
- A link to Herdr's own Settings → Look for the theme and fonts.

The rest is Herdr's own: tab bar, panes as cards, Files and Changes panels, status bar.

## Install

Ask any coding agent:

```
Read ~/.config/herdr-app/AGENTS.md, then add this layout: herdr.dev/layouts/jorgeper/black-sun
```

It reads every file first, adds the layout and its mods next to yours (yours stay as they are), and switches to it. `Ctrl+Shift+L` switches back.

## Mods

| Mod | What it does |
|---|---|
| `skill-tree` | A "Skills · N" row above the usage bars. Click it for a dialog: pick any running agent from a dropdown (or Global). A Claude agent shows its skills grouped into This project, This project · .agents/skills, Yours, claude.ai account, each Plugin, and Built into Claude Code; a Codex or other agent shows its project's and your personal `.agents/skills`. A skill's **ⓘ** shows what kind it is, where it came from (plugin and marketplace, `npx skills`, git repo), where it is on disk, its own description, and how to update or remove it. Each plugin has an **ⓘ** too. |
| `mcp-tree` | An "MCP · N" row under Skills (with a red dot and "N failed" when a server failed). Click it for the same kind of dialog: pick a Claude agent (or Global) and see its MCP servers grouped into This project (`.mcp.json`), This project just you, Yours, claude.ai connectors, and each Plugin, each with a status dot and its tool count. A server's **ⓘ** shows its status or error and how to fix it, the tools it gave the agent, the instructions it gives Claude, its config without any secret values, and how to update or remove it. |
| `spaces-tree` | Herdr's spaces list with each space's agents folded under it. Each agent row shows the ⌘-number of its tab, how long it has been in its status (as the Agents list does), and its status. Each agent gets two names from the same title: up to 5 words on its sidebar row, 2–3 on its tab (the Agents list shows the tab's). A just-started agent shows `<new>` in both until it says what it's doing. Right-click an agent for **Rename** (F2), **Auto-name** (⌘⇧R), which names both after what its session is doing now, or **Auto-name all** (⌘⇧A) for every agent at once. A name you type shows in both. |
| `agents-list` | Herdr's Agents list with a chevron in its header that folds it down to the header, giving Spaces the room, and opens it again. |
| `sidebar-menu` | The sidebar's right-click menus, drawn like Herdr's own. An agent's: Rename, Auto-name, Auto-name all, Close. A space's: **start Claude Code (⌘⇧C), Codex (⌘⇧X)** or any other installed agent, or a terminal, in that space; then Rename, worktrees and Close. ⌘⇧C and ⌘⇧X work from anywhere and start the agent in the space you're in. |
| `black-sun-settings` | The settings dialog behind the Spaces header's gear. |
| `weekly-usage` | Three bars: weekly limits used for Claude, Fable and Codex, with time to reset. |

## What it reads and runs

- `weekly-usage` reads your Claude Code login from the macOS keychain to call Anthropic's usage endpoint (the token never leaves the shell command), and reads your newest Codex session log.
- `skill-tree` reads Claude Code's session files and skill folders under `~/.claude`, shared skills under `~/.agents/skills` and each agent's `<folder>/.agents/skills`, and runs `ps` to match each session to its Herdr terminal. It never writes anything and never runs the update or remove commands it shows; Reveal just runs `open -R`.
- `spaces-tree`'s **Auto-name** reads the end of that agent's session log (Claude Code's under `~/.claude/projects`, or the newest Codex log for that folder under `~/.codex/sessions`), takes up to 4,000 characters of what was said (no tool output), and asks Claude Haiku for a title with `claude -p`, using your own Claude Code login, for Codex agents too. It runs only when you ask, and changes nothing but the tab's name. To keep tab names short, a title longer than a tab allows (3 words by default) is also shortened by Haiku when it first appears; only the title is sent (no conversation). Settings can turn that off, or turn off naming after titles altogether.
- `agents-list` and `sidebar-menu` read nothing outside Herdr. `black-sun-settings` keeps its settings in Herdr's shared state, and writes `keys.json` only when you click **Add missing keys** (it adds black-sun's section and changes nothing else). Its yolo switch writes Herdr's `programs.json` when you flip it: it adds `--dangerously-skip-permissions` to how Claude Code starts and `--dangerously-bypass-approvals-and-sandbox` to Codex's (and takes them out again), so it applies to every menu and layout in Herdr, and leaves the rest of the file as it is.
- `mcp-tree` reads the same session files plus MCP configs: `~/.claude.json` (through a small Python filter that passes on only server names, URLs without credentials or query, program names, and header and environment variable *names*, never their values), the project's `.mcp.json`, and enabled plugins' `.mcp.json`. It never shows a secret, never writes anything and never runs the commands it shows.

For the hotkeys (⌘⇧R, ⌘⇧A, ⌘⇧C, ⌘⇧X), add this to `~/.config/herdr-app/keys.json` (installing the layout doesn't touch your keys):

```json
"layout:black-sun": {
  "cmd-shift-r": "spaces-tree.auto-name",
  "cmd-shift-a": "spaces-tree.auto-name-all",
  "cmd-shift-c": "spaces-tree.new-claude",
  "cmd-shift-x": "spaces-tree.new-codex"
}
```

macOS, Claude Code. Details for agents (and for rebuilding it) are in [RECIPE.md](RECIPE.md).

## Updating

Replace `layouts/black-sun.json` and the seven folders under `mods/` with the latest from this repo.

## License

MIT ([LICENSE](LICENSE)). `spaces-tree`, `agents-list` and the layout are modified copies of Herdr's `spaces` and `agents` mods and `main` layout, used under the Apache License 2.0 ([LICENSE-herdr](LICENSE-herdr)).
