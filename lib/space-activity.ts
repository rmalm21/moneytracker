/**
 * 9.0 Riwayat ruang: who added, changed or deleted which transaction in a Ruang Bersama (kept 30 days). A deleted
 * transaction keeps its content here, so any member can put it back.
 */
import { addDoc, collection, deleteDoc, limit, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc, doc, where, getDocs, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { currentActor, isSpaceKey, spaceIdOf } from './space-key';
import type { LedgerTx } from './types';

export const ACTIVITY_DAYS = 30;
export type ActivityKind = 'add' | 'edit' | 'delete' | 'restore';
export type Activity = { id: string; kind: ActivityKind; by: string; byName: string; at?: Timestamp; txId: string; title: string; categoryId?: string; amount: number; type: string; date: string; before?: Partial<LedgerTx>; restoredBy?: string; restoredAt?: Timestamp };

function database() { if (!db) throw Error('Konfigurasi Firebase belum tersedia.'); return db; }
const titleOf = (tx: Partial<LedgerTx>) => (tx.description || tx.merchant || '').slice(0, 80);
/** Firestore keeps no undefined values; timestamps are not needed to put a transaction back. */
function plain(tx: Partial<LedgerTx>) { const { createdAt: _c, updatedAt: _u, ...rest } = tx as Partial<LedgerTx> & { createdAt?: unknown; updatedAt?: unknown }; return JSON.parse(JSON.stringify(rest)) as Partial<LedgerTx>; }

/** Notes a change to a shared transaction (nothing for someone's own records). Never blocks the change itself. */
export function logActivity(key: string, kind: ActivityKind, tx: Partial<LedgerTx> & { id?: string }, before?: Partial<LedgerTx>) {
  const actor = currentActor();
  if (!isSpaceKey(key) || !actor || !db) return;
  void addDoc(collection(database(), 'spaces', spaceIdOf(key), 'activity'), {
    kind, by: actor.uid, byName: actor.name, at: serverTimestamp(), txId: tx.id || '', title: titleOf(tx), categoryId: tx.categoryId || '', amount: Number(tx.amount) || 0, type: tx.type || '', date: tx.date || '',
    ...(before ? { before: plain(before) } : {}),
  }).catch(() => { /* the history is a help, not the record */ });
}

export function subscribeActivity(spaceId: string, onValue: (list: Activity[]) => void): Unsubscribe {
  const since = Timestamp.fromMillis(Date.now() - ACTIVITY_DAYS * 864e5);
  return onSnapshot(query(collection(database(), 'spaces', spaceId, 'activity'), where('at', '>=', since), orderBy('at', 'desc'), limit(150)), snap => onValue(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Activity)), () => onValue([]));
}
/** 9.1 The latest few entries, for the bell (what other members did). */
export function subscribeLatestActivity(spaceId: string, onValue: (list: Activity[]) => void): Unsubscribe {
  return onSnapshot(query(collection(database(), 'spaces', spaceId, 'activity'), orderBy('at', 'desc'), limit(15)), snap => onValue(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Activity)), () => {});
}
export async function markRestored(spaceId: string, id: string, uid: string) { await updateDoc(doc(database(), 'spaces', spaceId, 'activity', id), { restoredBy: uid, restoredAt: serverTimestamp() }); }
/** Entries older than 30 days are removed (by whichever member opens the history). */
export async function tidyActivity(spaceId: string) {
  const old = await getDocs(query(collection(database(), 'spaces', spaceId, 'activity'), where('at', '<', Timestamp.fromMillis(Date.now() - ACTIVITY_DAYS * 864e5)), limit(100))).catch(() => null);
  for (const d of old?.docs || []) await deleteDoc(d.ref).catch(() => {});
}
export { restorable } from './space-math';
