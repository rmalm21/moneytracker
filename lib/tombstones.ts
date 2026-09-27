/**
 * Transactions this device deleted ("tombstones"), kept for 30 days.
 *
 * The device copy of the data only follows documents that change, so a copy of a deleted transaction could linger and
 * show up again. Every list and total skips a tombstoned id. When the app opens, the server is asked about each one:
 * gone → its old copy is dropped from the device; still there (a delete that did not go through, or a restore) → the
 * tombstone is removed, so the screen always ends up showing what the server holds.
 */
const KEY = 'dompet-ajaib:deleted-tx';
const KEEP = 30 * 864e5;
let stones: Map<string, number> | null = null;

function load() {
  if (stones) return stones;
  stones = new Map();
  if (typeof window === 'undefined') return stones;
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]') as { id: string; at: number }[];
    for (const s of Array.isArray(list) ? list : []) if (typeof s?.id === 'string' && Date.now() - Number(s.at) < KEEP) stones.set(s.id, Number(s.at));
  } catch { /* nothing kept */ }
  return stones;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify([...load()].slice(-500).map(([id, at]) => ({ id, at })))); } catch { /* optional */ } }

export function markTxDeleted(ids: string[]) { if (!ids.length) return; const m = load(); for (const id of ids) m.set(id, Date.now()); save(); }
export function forgetTxDeleted(ids?: string[]) { const m = load(); if (!ids) m.clear(); else for (const id of ids) m.delete(id); save(); }
export const isTxDeleted = (id: string) => typeof window !== 'undefined' && load().has(id);
export const deletedTxIds = () => [...load().keys()];
/** Lists without the transactions this device deleted. */
export function withoutDeleted<T extends { id: string }>(items: T[]) { const m = load(); return m.size ? items.filter(item => !m.has(item.id)) : items; }
