// Dragging a space to a new place in the list.

// How far a press must move before it is a drag.
export const DRAG = 6;

// Which half of a box the pointer is in: a drop in the lower half goes after that space.
export function half(y, height) {
  return y > height / 2;
}

// Where `from` would be (0-based, in `order` once it is taken out and put back) after a drop
// before or after `target`. Null when that is where it already is, or either isn't in the list.
export function landing(order, from, target, after) {
  const at = order.indexOf(from);
  const to = order.filter((id) => id !== from).indexOf(target);
  if (at < 0 || to < 0 || from === target) return null;
  const index = to + (after ? 1 : 0);
  return index === at ? null : index;
}
