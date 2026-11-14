// sidebar-menu's pure logic (no Herdr imports; `node --test mods/sidebar-menu/tests/*.test.js`).

// A just-started agent's tab name until it says what it's doing (as spaces-tree's names.js).
const NEW = "<new>";

// A space's menu: start an agent (as Herdr's + menu does, in this space), a terminal, then
// Herdr's own space items (rename, worktrees by the space's checkout, close).
// known: knownAgents(); git: "main" | "linked" | null; keyOf(action) -> the bound key or "".
// Items: { header } or { label, icon? | program? + agent (its key), cmd, args, key, gap? } or { label, icon, worktree, key }.
export function spaceItems(known, git, space, keyOf) {
  const installed = (known ?? []).filter((a) => a.installed);
  return [
    { header: "Start an agent" },
    ...installed.map((a, i) => ({
      label: a.name, agent: a.key, program: { icon: a.icon, tint: a.tint }, cmd: "tab.new",
      args: { name: NEW, space, argv: a.run },
      key: keyOf(`spaces-tree.new-${a.key}`) || (i < 9 ? String(i + 1) : ""),
    })),
    { label: "Terminal", icon: "icons/shell.svg", cmd: "tab.new", args: { space }, key: keyOf("tab.new") },
    { label: "Rename", icon: "mods/workspace-chrome/square-pen.svg", cmd: "space.rename", args: { id: space }, key: keyOf("space.rename"), gap: true },
    ...(git ? [
      { label: "New worktree", icon: "mods/workspace-chrome/git-branch.svg", worktree: { space, action: "new" }, key: "" },
      { label: "Open worktree", icon: "mods/workspace-chrome/git-branch.svg", worktree: { space, action: "open" }, key: "" },
    ] : []),
    ...(git === "linked" ? [{ label: "Remove worktree", icon: "mods/workspace-chrome/git-branch.svg", worktree: { space, action: "remove" }, key: "" }] : []),
    { label: "Close", icon: "mods/workspace-chrome/x.svg", cmd: "space.close", args: { id: space }, key: keyOf("space.close"), gap: true },
  ];
}
