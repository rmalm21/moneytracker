import { collection, doc, getCountFromServer, getDocFromCache, getDocFromServer, getDocsFromCache, onSnapshot, query, Timestamp, where, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Keeps a full copy of the user's data on the device and only downloads what changed.
 *
 * Every collection is read from the server once per device. After that the app listens only to
 * documents whose `updatedAt` is newer than the newest one it already has, so opening the app
 * costs about one read per collection instead of re-reading everything. Screens read the device
 * copy (source: 'cache'), so reports, history and tab switches cost nothing.
 *
 * Deletions don't show up in "changed since" queries. The device that deletes leaves a small note in
 * `deletions` (which ids, which collection); other devices look up just those ids, one read each,
 * which drops them from their copy. Bigger clean-ups (restore, reset) set `syncMarks` on the profile
 * instead, and once a day the document counts are compared as a safety net: on a mismatch that
 * collection is read in full once, which lets Firestore drop whatever was deleted.
 */
export const syncedCollections = ['wallets', 'categories', 'budgets', 'transactions', 'claims', 'receivables', 'debts', 'funds', 'recurring', 'drafts', 'plannedTransactions', 'financialNotes', 'cycleSnapshots', 'wishlist', 'deletions'] as const;
export type SyncedName = typeof syncedCollections[number];

type Mark = { s: number; n: number };
/** Per collection: the device holds a complete copy, the newest server `updatedAt` it has, when counts were last compared, the newest delete note handled. */
type Entry = { complete?: boolean; mark?: Mark; checkedAt?: number; seen?: number };
type State = Partial<Record<SyncedName, Entry>>;
export type SyncStatus = { current: boolean; failed: string };

const DAY = 864e5;
const storageKey = (uid: string) => `dompet-ajaib:sync:v1:${uid}`;
function readState(uid: string): State { try { return JSON.parse(localStorage.getItem(storageKey(uid)) || '{}') as State; } catch { return {}; } }
const newer = (a: Mark | undefined, b: Mark) => !a || b.s > a.s || (b.s === a.s && b.n > a.n);

type Engine = { uid: string; state: State; stops: Map<SyncedName, Unsubscribe>; current: Set<SyncedName>; recheck: Set<SyncedName>; checking: Set<SyncedName>; failed: string };
let engine: Engine | null = null;
const watchers = new Set<(status: SyncStatus) => void>();

function persist(e: Engine) { try { localStorage.setItem(storageKey(e.uid), JSON.stringify(e.state)); } catch { /* the next visit reads a bit more */ } }
function status(e: Engine): SyncStatus { return { current: syncedCollections.every(name => e.current.has(name)), failed: e.failed }; }
function announce(e: Engine) { const value = status(e); watchers.forEach(watch => watch(value)); }

/** Server listener that fills the device copy: everything (`full`) or only what changed since the last visit. */
function follow(e: Engine, name: SyncedName, full: boolean) {
  if (!db) return;
  e.stops.get(name)?.();
  e.current.delete(name);
  const entry = (e.state[name] ||= {});
  const since = !full && entry.complete ? (entry.mark || { s: 0, n: 0 }) : null;
  const all = collection(db, 'users', e.uid, name);
  const source = since ? query(all, where('updatedAt', '>', new Timestamp(since.s, since.n))) : all;
  const stop = onSnapshot(source, { includeMetadataChanges: true }, snap => {
    if (engine !== e) return;
    if (snap.metadata.fromCache) { if (e.current.delete(name)) announce(e); return; }
    // Only documents the server has confirmed move the mark, so nothing written elsewhere in between is skipped next time.
    let mark = entry.mark;
    for (const row of snap.docs) {
      if (row.metadata.hasPendingWrites) continue;
      const at = row.get('updatedAt');
      if (at instanceof Timestamp && newer(mark, { s: at.seconds, n: at.nanoseconds })) mark = { s: at.seconds, n: at.nanoseconds };
    }
    if (name === 'deletions') for (const change of snap.docChanges()) if (change.type !== 'removed') void dropDeleted(e, change.doc.get('items'));
    entry.mark = mark;
    if (!since) entry.complete = true;
    persist(e);
    if (!e.current.has(name)) { e.current.add(name); announce(e); }
    if (e.recheck.has(name) || !entry.checkedAt || Date.now() - entry.checkedAt > DAY) void compareCounts(e, name);
  }, error => {
    if (engine !== e) return;
    // Deletion notes are a helper: rules that don't allow them only mean the daily count check does that job.
    if (name === 'deletions') { e.current.add(name); announce(e); return; }
    e.failed = (error as { code?: string }).code || 'error';
    e.current.delete(name); announce(e);
  });
  e.stops.set(name, stop);
}

/** Documents another device deleted: if this device still has one, asking the server for it (one read) removes it from the copy. */
async function dropDeleted(e: Engine, items: unknown) {
  if (!db || !items || typeof items !== 'object') return;
  for (const [name, ids] of Object.entries(items as Record<string, unknown>)) {
    if (!(syncedCollections as readonly string[]).includes(name) || !Array.isArray(ids)) continue;
    for (const id of ids.slice(0, 200)) {
      if (typeof id !== 'string' || engine !== e) continue;
      const target = doc(db, 'users', e.uid, name, id);
      try { if (!(await getDocFromCache(target)).exists()) continue; } catch { continue; }
      try { await getDocFromServer(target); } catch { /* the daily count check catches it */ }
    }
  }
}

/** One aggregation read: if the server holds fewer (or more) documents than the device, read the collection in full once. */
async function compareCounts(e: Engine, name: SyncedName) {
  if (!db || e.checking.has(name)) return;
  e.checking.add(name);
  try {
    const all = collection(db, 'users', e.uid, name);
    const local = await getDocsFromCache(all);
    // Unsent changes make the counts differ on purpose; compare once they are through.
    if (local.metadata.hasPendingWrites) { e.recheck.add(name); return; }
    const server = await getCountFromServer(all);
    if (engine !== e) return;
    e.recheck.delete(name);
    const entry = (e.state[name] ||= {});
    entry.checkedAt = Date.now(); persist(e);
    if (server.data().count !== local.size) follow(e, name, true);
  } catch {
    e.recheck.add(name);
  } finally {
    e.checking.delete(name);
  }
}

/** Start keeping the signed-in user's data in sync. Returns the stop function. */
export function startSync(uid: string): Unsubscribe {
  stopSync();
  const e: Engine = { uid, state: readState(uid), stops: new Map(), current: new Set(), recheck: new Set(), checking: new Set(), failed: '' };
  engine = e;
  syncedCollections.forEach(name => follow(e, name, false));
  return () => { if (engine === e) stopSync(); };
}
export function stopSync() {
  if (!engine) return;
  const e = engine; engine = null;
  e.stops.forEach(stop => stop());
  e.current.clear(); announce(e);
}

/** True when the device copy of these collections is known to match the server right now. */
export function isCurrent(uid: string, ...names: SyncedName[]) { return engine?.uid === uid && names.every(name => engine!.current.has(name)); }
/** Resolves true as soon as the device copy of these collections matches the server, or false after `timeout` ms. */
export function whenCurrent(uid: string, names: SyncedName[], timeout = 4000): Promise<boolean> {
  if (isCurrent(uid, ...names)) return Promise.resolve(true);
  if (!engine || engine.uid !== uid) return Promise.resolve(false);
  return new Promise(resolve => {
    const check = () => { if (!isCurrent(uid, ...names)) return; clearTimeout(timer); watchers.delete(check); resolve(true); };
    const timer = setTimeout(() => { watchers.delete(check); resolve(false); }, timeout);
    watchers.add(check);
  });
}

/** Called with the sync status now and whenever it changes. */
export function watchSync(watch: (status: SyncStatus) => void): Unsubscribe {
  watchers.add(watch);
  watch(engine ? status(engine) : { current: false, failed: '' });
  return () => { watchers.delete(watch); };
}

/** Notes on the profile that another device deleted something: compare counts for those collections. */
export function noteDeleteMarks(uid: string, marks: Record<string, unknown> | undefined) {
  const e = engine;
  if (!e || e.uid !== uid || !marks) return;
  for (const name of syncedCollections) {
    const mark = marks[name] as { toMillis?: () => number } | undefined;
    const at = typeof mark?.toMillis === 'function' ? mark.toMillis() : 0;
    const entry = (e.state[name] ||= {});
    if (!at || at <= (entry.seen || 0)) continue;
    entry.seen = at; persist(e);
    if (e.current.has(name)) void compareCounts(e, name); else e.recheck.add(name);
  }
}

/** Throw away what this device knows and read everything again (Pengaturan → Data). */
export function resyncAll(uid: string) {
  try { localStorage.removeItem(storageKey(uid)); } catch { /* ignore */ }
  const e = engine;
  if (!e || e.uid !== uid) return;
  e.state = {};
  syncedCollections.forEach(name => follow(e, name, true));
}
