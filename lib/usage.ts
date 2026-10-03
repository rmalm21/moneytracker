/**
 * Dompet Ajaib 5.0 — lightweight usage metadata, per account, on this device.
 *
 * Recently opened features, favorites, how often each page was opened, the Discovery lifecycle, and which one-time
 * notes were seen. No financial facts are stored here (no amounts, no names of records). Browser storage may be blocked
 * or empty (private window): everything works without it, it only gets less personal.
 */
import type { DiscoveryState } from './discovery.ts';

export type Usage = {
  /** Feature ids, newest first. */
  recent: string[];
  /** Feature ids pinned by the user. */
  favorites: string[];
  /** Page key (or "page:sub") → times opened. */
  visited: Record<string, number>;
  discovery: DiscoveryState;
  /** One-time notes seen ("orientation-5.0"). */
  seen: string[];
  /** The last Periksa data run: how many issues it found (a count only), and when. */
  health?: { issues: number; day: string };
};
export const emptyUsage = (): Usage => ({ recent: [], favorites: [], visited: {}, discovery: {}, seen: [] });
const key = (uid: string) => `dompet-ajaib:usage:${uid}`;
const listeners = new Set<() => void>();
const cache = new Map<string, Usage>();

export function readUsage(uid: string | undefined): Usage {
  if (!uid) return emptyUsage();
  const hit = cache.get(uid);
  if (hit) return hit;
  let value = emptyUsage();
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key(uid)) : null;
    if (raw) { const parsed = JSON.parse(raw) as Partial<Usage>; value = { ...value, ...parsed, visited: { ...(parsed.visited || {}) }, discovery: { ...(parsed.discovery || {}) } }; }
  } catch { /* Storage blocked or damaged: start fresh. */ }
  cache.set(uid, value);
  return value;
}
export function writeUsage(uid: string | undefined, change: (u: Usage) => Usage) {
  if (!uid) return;
  const next = change(readUsage(uid));
  cache.set(uid, next);
  try { localStorage.setItem(key(uid), JSON.stringify(next)); } catch { /* Kept for this session only. */ }
  listeners.forEach(l => l());
}
export const subscribeUsage = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** A feature was opened: it moves to the front of "Terakhir dibuka". */
export const touchRecent = (u: Usage, featureId: string): Usage => ({ ...u, recent: [featureId, ...u.recent.filter(id => id !== featureId)].slice(0, 8) });
export const toggleFavorite = (u: Usage, featureId: string): Usage => ({ ...u, favorites: u.favorites.includes(featureId) ? u.favorites.filter(id => id !== featureId) : [...u.favorites, featureId].slice(0, 12) });
export const countVisit = (u: Usage, page: string): Usage => ({ ...u, visited: { ...u.visited, [page]: (u.visited[page] || 0) + 1 } });
export const markSeen = (u: Usage, note: string): Usage => u.seen.includes(note) ? u : { ...u, seen: [...u.seen, note] };
/** "Atur ulang tips": discovery and one-time notes start again; favorites and recents stay. */
export const resetTips = (u: Usage): Usage => ({ ...u, discovery: {}, seen: u.seen.filter(s => !s.startsWith('tip:')) });
