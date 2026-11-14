# black-sun

A [Herdr](https://herdr.dev) layout for running Claude Code agents, with a **Skills** button that shows exactly which skills each agent has loaded — grouped by where they come from — and weekly usage bars for Claude, Fable and Codex.

## Install

Ask any coding agent:

```
Read ~/.config/herdr-app/AGENTS.md, then add this layout: herdr.dev/layouts/jorgeper/black-sun
```

It reads every file first, adds the layout and its mods next to yours (yours stay as they are), and switches to it. `Ctrl+Shift+L` switches back.

## What's in it

| Mod | What it does |
|---|---|
| `skill-tree` | A "Skills · N" row above the usage bars. Click it for a dialog: pick any running Claude agent from a dropdown (or Global) and see its skills grouped into This project, Yours, claude.ai account, each Plugin, and Built into Claude Code. A skill's **ⓘ** shows what kind it is, where it came from (plugin and marketplace, `npx skills`, git repo), where it is on disk, its own description, and how to update or remove it. Each plugin has an **ⓘ** too. |
| `spaces-tree` | Herdr's spaces list with each space's agents folded under it. |
| `weekly-usage` | Three bars: weekly limits used for Claude, Fable and Codex, with time to reset. |

The rest is Herdr's own: tab bar, panes as cards, Files and Changes panels, status bar.

## What it reads and runs

- `weekly-usage` reads your Claude Code login from the macOS keychain to call Anthropic's usage endpoint (the token never leaves the shell command), and reads your newest Codex session log.
- `skill-tree` reads Claude Code's session files and skill folders under `~/.claude`, and runs `ps` to match each session to its Herdr terminal. It never writes anything and never runs the update or remove commands it shows; Reveal just runs `open -R`.

macOS, Claude Code. Details for agents (and for rebuilding it) are in [RECIPE.md](RECIPE.md).

## Updating

Replace `layouts/black-sun.json` and the three folders under `mods/` with the latest from this repo.

## License

MIT ([LICENSE](LICENSE)). `spaces-tree` and the layout are modified copies of Herdr's `spaces` mod and `main` layout, used under the Apache License 2.0 ([LICENSE-herdr](LICENSE-herdr)).
