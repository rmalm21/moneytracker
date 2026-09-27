/**
 * Transactions this device deleted ("tombstones"), kept for 30 days.
 *
 * The device copy of the data only follows documents that change, so a copy of a deleted transaction could linger and
 * show up again. Every list and total skips a tombstoned id. When the app opens, the server is asked about each one:
 * gone → its old copy is dropped from the device; still there (a delete that did not go through, or a restore) → the
 * tombstone is removed, so the screen always ends up showing what the server holds.
 *
 * Update: a transaction still on the server although this device deleted it is deleted there again once the device's
 * own send queue is through (it may simply not have been sent yet); only a delete the server refuses brings it back.
 */
const KEY = 'dompet-ajaib:deleted-tx';
/** Deletes still inside their "Batalkan" window: carried out on the next opening if the app was closed first. */
const PENDING = 'dompet-ajaib:pending-delete-tx';
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
  // Deletes left in their "Batalkan" window when the app was closed count as done: hidden now, finished on the server
  // by checkDeletedTransactions (lib/firestore.ts). This runs once, when the app starts reading data.
  const left = readPending();
  if (left.length) { for (const id of left) stones.set(id, Date.now()); writePending([]); save(); }
  return stones;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify([...load()].slice(-500).map(([id, at]) => ({ id, at })))); } catch { /* optional */ } }

export function markTxDeleted(ids: string[]) { if (!ids.length) return; const m = load(); for (const id of ids) m.set(id, Date.now()); save(); }
export function forgetTxDeleted(ids?: string[]) { const m = load(); if (!ids) m.clear(); else for (const id of ids) m.delete(id); save(); }
export const isTxDeleted = (id: string) => typeof window !== 'undefined' && load().has(id);
export const deletedTxIds = () => [...load().keys()];
/** Lists without the transactions this device deleted. */
export function withoutDeleted<T extends { id: string }>(items: T[]) { const m = load(); return m.size ? items.filter(item => !m.has(item.id)) : items; }

function readPending(): string[] { try { const v = JSON.parse(localStorage.getItem(PENDING) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; } }
function writePending(ids: string[]) { try { localStorage.setItem(PENDING, JSON.stringify([...new Set(ids)].slice(-200))); } catch { /* optional */ } }
export function markDeletePending(id: string) { writePending([...readPending(), id]); }
export function clearDeletePending(id: string) { writePending(readPending().filter(x => x !== id)); }
export const pendingDeleteIds = () => (typeof window === 'undefined' ? [] : readPending());
