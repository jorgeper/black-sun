// sidebar-menu's pure logic (no Herdr imports; `node --test mods/sidebar-menu/tests/*.test.js`).

// A just-started agent's tab name until it says what it's doing (as spaces-tree's names.js).
const NEW = "<new>";

// A space's menu: start an agent (as Herdr's + menu does, in this space), a terminal, then
// Herdr's own space items (rename, worktrees by the space's checkout, close).
// known: knownAgents(); git: "main" | "linked" | null; keyOf(action) -> the bound key or "".
// tags: the space tags ({ id, name, color }) and current, the id of the one this space has: each
// tag is an item (✓ on the space's own; picking that one untags the space), then "Edit tags…".
// Items: { header } or { label, icon? | program? + agent (its key), cmd, args, key, gap? } or { label, icon, worktree, key }
// or { label, dot (a color), tag (the id to give, null to untag), key } or { label, icon, settings: true, key }
// or { label, icon, beside: true, key } (the space's terminals into, or out of, the grid view).
// beside: "all" when every terminal of the space is in the grid, "some" when not, null when it has none.
export function spaceItems(known, git, space, keyOf, tags = [], current = null, beside = null) {
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
    ...(beside ? [{ label: beside === "all" ? "Remove from grid view" : "Add to grid view", icon: "mods/side-by-side/grid.svg", beside: true, key: "" }] : []),
    { header: "Tag" },
    ...tags.map((t) => ({ label: t.name.trim() || "Untitled tag", dot: t.color, tag: t.id === current ? null : t.id, key: t.id === current ? "✓" : "" })),
    { label: tags.length ? "Edit tags…" : "Add tags…", icon: "mods/workspace-chrome/settings.svg", settings: true, key: "" },
    { label: "Close", icon: "mods/workspace-chrome/x.svg", cmd: "space.close", args: { id: space }, key: keyOf("space.close"), gap: true },
  ];
}

// black-sun's grid view, shared "black-sun.sbs" = { root, ... }: a tree of splits whose
// leaves are terminals; a split is { id, dir: "row" | "col", items } (the side-by-side mod's
// model.js has the whole shape). The terminals in it, in reading order.
const isSplit = (n) => !!n && typeof n === "object" && Array.isArray(n.items);
const leaves = (n) => (typeof n === "string" ? [n] : isSplit(n) ? n.items.flatMap(leaves) : []);
const ids = (n) => (isSplit(n) ? [n.id, ...n.items.flatMap(ids)] : []);

export function besideItems(state) {
  return leaves(state?.root);
}

// The state with these terminals added (at the grid's right edge: the end of a grid that is one
// row, else a column of their own beside the rest) or taken out (a split left with one item
// becomes that item). Everything else in it is kept.
export function besideWith(state, terminals, add) {
  const base = state && typeof state === "object" ? state : {};
  let root = typeof base.root === "string" || isSplit(base.root) ? base.root : null;
  if (!add) {
    const drop = (n) => {
      if (!isSplit(n)) return terminals.includes(n) ? null : n;
      const items = n.items.map(drop).filter((x) => x !== null);
      return items.length > 1 ? { ...n, items } : items[0] ?? null;
    };
    return { ...base, root: drop(root) };
  }
  for (const x of terminals) {
    if (leaves(root).includes(x)) continue;
    if (!root) root = x;
    else if (isSplit(root) && root.dir === "row") root = { ...root, items: [...root.items, x] };
    else root = { id: `n${ids(root).reduce((m, id) => Math.max(m, Number(/^n(\d+)$/.exec(id)?.[1] ?? 0)), 0) + 1}`, dir: "row", items: [root, x] };
  }
  return { ...base, root };
}
