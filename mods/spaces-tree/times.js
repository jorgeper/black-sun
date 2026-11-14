// How long each agent has been in its status, as Herdr's Agents list shows it ("<1m", "5m",
// "3h", "2d"). Pure: no Herdr imports, so `node --test mods/spaces-tree/tests/*.test.js` runs it.

export function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

const MONTH = 30 * 86400000;

// changed: address -> { s, at } (when its status last changed; "done" counts as "idle", as the
// Agents list does). An agent seen for the first time starts at seedOf(agent) (its tab's last
// change) or now. Agents gone for 30 days are forgotten. Returns { changed, dirty }.
export function track(changed, list, now, seedOf) {
  const out = { ...changed };
  let dirty = false;
  for (const a of list) {
    const s = a.status === "done" ? "idle" : a.status;
    if (out[a.address]?.s === s) continue;
    out[a.address] = { s, at: out[a.address] ? now : seedOf(a) ?? now };
    dirty = true;
  }
  const listed = new Set(list.map((a) => a.address));
  for (const [k, c] of Object.entries(out)) {
    if (!listed.has(k) && now - c.at > MONTH) { delete out[k]; dirty = true; }
  }
  return { changed: out, dirty };
}
