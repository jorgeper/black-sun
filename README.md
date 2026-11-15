# black-sun

A [Herdr](https://herdr.dev) layout for running many Claude Code and Codex agents at once: every space with its agents under it, names that say what each agent is doing, a grid view that puts terminals from any spaces next to each other, right-click menus to start, rename and close agents, and buttons that show which skills and MCP servers each agent has loaded.

## Features

**Sidebar**, top to bottom:

- **Spaces with their agents and terminals.** Each space is a box with its agents and plain terminals inside. Each row shows its number (what ⌘1–9 goes to: counted down the whole sidebar, so ⌘3 is the same agent wherever you are, or within each space; a setting), its icon and name, how long it has been in its current state, and that state (working, needs you, done, idle). A space with no agents has an **Add terminal or agent** row. Chevrons fold one space, or all of them.
- **The focused one stands out.** The agent or terminal with the keyboard is tinted in a highlight color you choose, starting in its space's color and fading into the highlight, and its pane, and its space's box in the sidebar, have their border in that color. What an agent is doing glows in from the right edge of its row, in place of the spinner and status icons: yellow while it works (slowly pulsing), blue when it's done, red when it needs you, a faint gray when idle. How long it has been that way sits right after its name.
- **Tabs that match.** The tab bar's tabs look the same in normal and grid view: square, with the space's tag, the shown one fading into the highlight, and the agent's status glowing on the right.
- **Spaces that stay.** Closing a space's last terminal or agent leaves the space, empty, with an **Add terminal or agent** button, until you close the space itself (a setting, on by default).
- **Space tags.** Make your own tags, each a name and a color (say "ephemeral" and "permanent"), and give each space one from its right-click menu. A space shows its tag as its color coming in from the left of its row, as a colored square before its name, or as the whole row in that color with text that stays readable on it. New spaces can start with a tag you choose.
- **A foldable Agents list.** Herdr's Agents list, sorted by priority or grouped by space. The chevron in its header folds it down to the header to give Spaces the room.
- **Skills · N.** Click it to see the skills a Claude agent has loaded, grouped by where they come from (this project, yours, your claude.ai account, each plugin, built in), plus the project's `.agents/skills` in a group of its own (Codex reads that folder; Claude Code doesn't). An agent dropdown switches agents; picking a Codex or other agent shows the `.agents/skills` folders it can read (the project's and your personal one), and Global shows installed Claude skills plus shared personal skills from `~/.agents/skills` (under Yours), without duplicates. A skill's or plugin's **ⓘ** shows its kind, source, location on disk, description, and how to update or remove it.
- **MCP · N.** The same for MCP servers: which connected and which failed (a red dot, all the way up the tree), the tools each one gave the agent, its instructions, its config with every secret value hidden, and how to fix a failed server.
- **Weekly usage.** Bars for Claude, Fable and Codex: how much of the weekly limit is used, and when it resets.

**Grid view** (the **Grid** button at the right end of the tab bar):

- Shows terminals from any spaces next to each other in the work area, in place of the shown space's tabs. Agents and plain terminals alike, each as a card with a title bar; the one with the keyboard has its border in the highlight color. The tab bar gives way to a plain bar with **+** and the grid's buttons, since each card's title is its tab.
- Add a terminal from an agent's or a space's right-click menu (**Add to grid view**), by dragging an agent from the sidebar, or with **+** in the bar above the grid. **✕** on a card, or its right-click menu, takes it out; it keeps running.
- **Arrange** shows the grid as small tiles to drag into rows and columns, nested as deep as you like: one terminal can take a full-height column while others stack beside it. While you drag, a see-through tile shows exactly where the terminal would land and how big it would be. A tile's edge puts it beside that tile; closer to the edge, beside the bigger group that ends there, up to the whole grid. A tile's middle swaps the two. Drag the gaps to resize.
- **Side by side** puts everything back in one row, each the same width.

**Agent names:**

- An agent's sidebar row and its tab show the same name: up to 5 words on the row, 2–3 on the tab. They come from the agent's own title, and a title too long for the tab is shortened by Claude Haiku.
- A just-started agent reads `<new>` until it says what it's doing.
- **Rename** (F2) lets you type a name. **Auto-name** (⌘⇧R) names an agent after what its session is doing now, read from its last few exchanges. **Auto-name all** (⌘⇧A) does every agent at once. The automatic names never replace a name you typed; only Auto-name, when you ask, does.
- **Open in Finder** (⌘⇧F) opens a Finder window on the folder an agent is in now (agents on this computer only).

**Right-click menus** (drawn like Herdr's own, with their hotkeys):

- **On an agent:** Rename, Auto-name, Auto-name all, Open in Finder, Add to (or Remove from) grid view, and Close (closes the whole tab when the agent is alone in it, otherwise just its pane).
- **On a space:** start Claude Code, Codex, any other installed agent, or a terminal in *that* space, then Rename, worktrees, add all of its terminals to grid view, its tag (pick one, or pick the checked one to remove it) and Close.
- ⌘⇧C and ⌘⇧X start Claude Code or Codex in the space you're in, from anywhere.

| Hotkey | Does |
|---|---|
| ⌘⇧C / ⌘⇧X | New Claude Code / Codex agent in this space |
| F2 | Rename the agent's tab |
| ⌘⇧R | Auto-name the focused agent |
| ⌘⇧A | Auto-name every agent |
| ⌘⇧F | Open the focused agent's folder in Finder |
| ⌘1–9 | Go to the agent or terminal with that number, in any space (or, with numbers per space, in the space you're in) |

The ⌘⇧ keys, and ⌘1–9 across spaces, need lines in your `keys.json`: Settings adds them for you, or see below. Without them ⌘1–9 stay Herdr's own: the tabs of the space you're in.

**Settings** (the gear in the Spaces header; a window you can drag, with − and + to make it smaller or bigger, and it opens again where and as big as you left it):

- Show or hide the Agents list, Skills, MCP and Weekly usage; list plain terminals in spaces or only agents; offer **Add terminal or agent** in spaces with no agents; keep spaces when their last terminal is closed; number agents and terminals down the whole sidebar (the default) or per space.
- **Colors**: pick a palette of 12 colors from 15 built-in ones (Black Sun, Nord, Catppuccin, Dracula, Gruvbox, Solarized, Tokyo Night, Rosé Pine and more), or duplicate one and make it yours: rename it, and change any color with a picker (hue, saturation, brightness, or a hex code). Tag colors and the highlight color come from the selected palette, so picking another palette recolors them all. Four switches: gradients on spaces, gradients on agents and terminals, the status glow on the right, and a pulse for working agents.
- **Space tags**: add, name, color and remove tags; show a space's tag as a square or as the whole row; and pick the tag new spaces start with.
- **Yolo mode**: start every new Claude Code and Codex agent without permission prompts (Codex also without its sandbox).
- Agent names: name agents after their titles or not, how many words go on a sidebar row (3–8) and on a tab (2–4), and whether Haiku shortens long tab names or words are simply cut.
- How often Claude and Fable usage refreshes (1, 5, 15 or 30 minutes).
- Which black-sun hotkeys are set, with a button that adds the missing ones to `keys.json`.
- A link to Herdr's own Settings → Look for the theme and fonts.

The rest is Herdr's own: panes as cards (with square corners here), Files and Changes panels, status bar.

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
| `black-sun-brand` | The bar at the top of the sidebar: the layout's name and its black sun icon, with Herdr's search and sidebar buttons. |
| `black-sun-tabs` | The tab bar: Herdr's, with each tab drawn as in grid view (tag, gradient, status glow). |
| `black-sun-empty` | What a space with no terminal shows: a line saying so and **Add terminal or agent**. It is also the hidden placeholder tab that keeps such a space open. |
| `side-by-side` | Grid view: the Grid, Arrange and Side by side buttons at the end of the tab bar, the bar above the grid, each card's title bar, the arrange view and the **+** picker. |
| `spaces-tree` | Herdr's spaces list with each space in a box, its agents and plain terminals inside. The focused one is tinted in the highlight color, and an agent's status glows in from the right. Each agent row shows the ⌘-number of its tab, how long it has been in its status (as the Agents list does), and its status. Each agent gets two names from the same title: up to 5 words on its sidebar row, 2–3 on its tab (the Agents list shows the tab's). A just-started agent shows `<new>` in both until it says what it's doing. Right-click an agent for **Rename** (F2), **Auto-name** (⌘⇧R), which names both after what its session is doing now, or **Auto-name all** (⌘⇧A) for every agent at once. A name you type shows in both. **Open in Finder** (⌘⇧F) shows the folder the agent is in. |
| `agents-list` | Herdr's Agents list with a chevron in its header that folds it down to the header, giving Spaces the room, and opens it again. |
| `sidebar-menu` | The sidebar's right-click menus, drawn like Herdr's own. An agent's: Rename, Auto-name, Auto-name all, Open in Finder, Close. A space's: **start Claude Code (⌘⇧C), Codex (⌘⇧X)** or any other installed agent, or a terminal, in that space; then Rename, worktrees, grid view, tags and Close. An agent's menu also adds it to, or takes it out of, grid view. ⌘⇧C and ⌘⇧X work from anywhere and start the agent in the space you're in. |
| `black-sun-settings` | The settings window behind the Spaces header's gear. Color palettes and space tags are made here. |
| `weekly-usage` | Three bars: weekly limits used for Claude, Fable and Codex, with time to reset. |

## What it reads and runs

- `weekly-usage` reads your Claude Code login from the macOS keychain to call Anthropic's usage endpoint (the token never leaves the shell command), and reads your newest Codex session log.
- `skill-tree` reads Claude Code's session files and skill folders under `~/.claude`, shared skills under `~/.agents/skills` and each agent's `<folder>/.agents/skills`, and runs `ps` to match each session to its Herdr terminal. It never writes anything and never runs the update or remove commands it shows; Reveal just runs `open -R`.
- `spaces-tree`'s **Auto-name** reads the end of that agent's session log (Claude Code's under `~/.claude/projects`, or the newest Codex log for that folder under `~/.codex/sessions`), takes up to 4,000 characters of what was said (no tool output), and asks Claude Haiku for a title with `claude -p`, using your own Claude Code login, for Codex agents too. It runs only when you ask, and changes nothing but the tab's name. To keep tab names short, a title longer than a tab allows (3 words by default) is also shortened by Haiku when it first appears; only the title is sent (no conversation). Settings can turn that off, or turn off naming after titles altogether.
- `spaces-tree`'s **Open in Finder** runs `open <folder>` on the agent's current folder, only when you ask.
- `side-by-side` reads nothing outside Herdr. When the grid has a split inside a split, it runs `herdr-app do layout.set` (Herdr's own command line) to show it, because Herdr takes only so much nesting in a layout handed over by a mod directly.
- `agents-list`, `sidebar-menu`, `black-sun-brand`, `black-sun-tabs` and `black-sun-empty` read nothing outside Herdr. `black-sun-settings` keeps its settings, the color palettes and the space tags in Herdr's shared state, and writes `keys.json` only when you click **Add missing keys** (it adds black-sun's section and changes nothing else). Its yolo switch writes Herdr's `programs.json` when you flip it: it adds `--dangerously-skip-permissions` to how Claude Code starts and `--dangerously-bypass-approvals-and-sandbox` to Codex's (and takes them out again), so it applies to every menu and layout in Herdr, and leaves the rest of the file as it is.
- `mcp-tree` reads the same session files plus MCP configs: `~/.claude.json` (through a small Python filter that passes on only server names, URLs without credentials or query, program names, and header and environment variable *names*, never their values), the project's `.mcp.json`, and enabled plugins' `.mcp.json`. It never shows a secret, never writes anything and never runs the commands it shows.

For the hotkeys (⌘⇧R, ⌘⇧A, ⌘⇧C, ⌘⇧X, ⌘⇧F, and ⌘1–9), add this to `~/.config/herdr-app/keys.json` (installing the layout doesn't touch your keys):

```json
"layout:black-sun": {
  "cmd-shift-r": "spaces-tree.auto-name",
  "cmd-shift-a": "spaces-tree.auto-name-all",
  "cmd-shift-c": "spaces-tree.new-claude",
  "cmd-shift-x": "spaces-tree.new-codex",
  "cmd-shift-f": "spaces-tree.open-finder",
  "cmd-1": "spaces-tree.go-1",
  "cmd-2": "spaces-tree.go-2",
  "cmd-3": "spaces-tree.go-3",
  "cmd-4": "spaces-tree.go-4",
  "cmd-5": "spaces-tree.go-5",
  "cmd-6": "spaces-tree.go-6",
  "cmd-7": "spaces-tree.go-7",
  "cmd-8": "spaces-tree.go-8",
  "cmd-9": "spaces-tree.go-9"
}
```

macOS, Claude Code. Details for agents (and for rebuilding it) are in [RECIPE.md](RECIPE.md).

## Updating

Replace `layouts/black-sun.json` and the eleven folders under `mods/` with the latest from this repo.

## License

MIT ([LICENSE](LICENSE)). `spaces-tree`, `agents-list`, `black-sun-brand`, `black-sun-tabs` and the layout are modified copies of Herdr's `spaces`, `agents`, `workspace-chrome` and `tabs` mods and `main` layout, used under the Apache License 2.0 ([LICENSE-herdr](LICENSE-herdr)).
