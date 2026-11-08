'use client';
/**
 * 9.4 Arena Catat: where the game lives on this device (a tiny store the Beranda cards read) and in Firestore
 * (users/{uid}/game/state for the person, spaces/{id}/streak/{uid} for "api bareng"). Rules: lib/game.ts.
 */
import { useSyncExternalStore } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { GameEvent, GameState } from '@/lib/game';

export type Celebration = GameEvent | { kind: 'shared-badge'; days: number; name: string; space: string } | { kind: 'note'; title: string; text: string };
type Store = {
  state: GameState | null; ready: boolean;
  /** Each space's members' lit days (space id → uid → days). */ shared: Record<string, Record<string, string[]>>;
  queue: Celebration[];
  /** What the Beranda card shows next to the time (refreshed every minute). */ today: string; hour: number;
  /** This week's challenge, how far it is (worked out by the keeper from the records). */ challengeView: { value: number; won: boolean; lost: boolean } | null;
};
let store: Store = { state: null, ready: false, shared: {}, queue: [], today: '', hour: 12, challengeView: null };
const listeners = new Set<() => void>();
export function setGame(patch: Partial<Store> | ((s: Store) => Partial<Store>)) {
  store = { ...store, ...(typeof patch === 'function' ? patch(store) : patch) };
  listeners.forEach(l => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const useGame = () => useSyncExternalStore(subscribe, () => store, () => store);
export const gameNow = () => store;

/** Actions the cards ask of the keeper (it owns the data it needs to answer them). */
/** checkin: "Hari ini aman" for the person's own flame (Beranda Pribadi). checkinSpace: for a space's api bareng only. */
type Actions = { checkin: () => void; checkinSpace: (spaceId: string) => void };
let actions: Actions = { checkin: () => {}, checkinSpace: () => {} };
export const setGameActions = (a: Actions) => { actions = a; };
export const gameActions = () => actions;
export function celebrate(items: Celebration[]) { if (items.length) setGame(s => ({ queue: [...s.queue, ...items] })); }
export function nextCelebration() { setGame(s => ({ queue: s.queue.slice(1) })); }

// ——— Per device ———
const HIDE = (uid: string) => `dompet-ajaib:arena-hidden:${uid}`;
export function arenaHidden(uid: string) { try { return localStorage.getItem(HIDE(uid)) === '1'; } catch { return false; } }
export function setArenaHidden(uid: string, hidden: boolean) { try { localStorage.setItem(HIDE(uid), hidden ? '1' : '0'); } catch { /* preference */ } setGame({}); }
/** 9.4 A card shown small (one row): Arena ('me') or a space's api bareng (its id). Per device. */
const MINI = (uid: string, card: string) => `dompet-ajaib:arena-mini:${uid}:${card}`;
export function arenaMini(uid: string, card: string) { try { return localStorage.getItem(MINI(uid, card)) === '1'; } catch { return false; } }
export function setArenaMini(uid: string, card: string, mini: boolean) { try { localStorage.setItem(MINI(uid, card), mini ? '1' : '0'); } catch { /* preference */ } setGame({}); }
const VISITED = (uid: string, day: string) => `dompet-ajaib:arena-visited:${uid}:${day}`;
export function visitedToday(uid: string, day: string): string[] { try { return JSON.parse(localStorage.getItem(VISITED(uid, day)) || '[]'); } catch { return []; } }
export function markVisited(uid: string, day: string, view: string) {
  const list = visitedToday(uid, day); if (list.includes(view)) return false;
  try { localStorage.setItem(VISITED(uid, day), JSON.stringify([...list, view])); } catch { /* preference */ }
  return true;
}
export function onceToday(key: string, day: string) { try { if (localStorage.getItem(key) === day) return false; localStorage.setItem(key, day); return true; } catch { return false; } }

// ——— Firestore ———
function database() { if (!db) throw Error('Konfigurasi Firebase belum tersedia.'); return db; }
const stateRef = (uid: string) => doc(database(), 'users', uid, 'game', 'state');
/** The person's game. A device that has never seen it waits for the server, so it never starts over by mistake. */
export function subscribeGameState(uid: string, onValue: (state: GameState | null) => void): Unsubscribe {
  return onSnapshot(stateRef(uid), { includeMetadataChanges: true }, snap => {
    if (!snap.exists() && snap.metadata.fromCache) return;
    onValue(snap.exists() ? snap.data() as GameState : null);
  }, () => {});
}
export async function saveGameState(uid: string, state: GameState) { await setDoc(stateRef(uid), state); }
/** 9.5 Each member's days in this space. Only days written by 9.5 (v 2) count: up to 9.4 the days were the person's own
 * flame (Pribadi too), which is not what api bareng means now. A member's days start again from what they record there. */
export function subscribeSharedFire(spaceId: string, onValue: (members: Record<string, string[]>) => void): Unsubscribe {
  return onSnapshot(collection(database(), 'spaces', spaceId, 'streak'), snap => onValue(Object.fromEntries(snap.docs.map(d => [d.id, d.data().v === 2 ? (d.data().days as string[]) || [] : []]))), () => {});
}
export async function shareFire(spaceId: string, uid: string, name: string, days: string[]) {
  await setDoc(doc(database(), 'spaces', spaceId, 'streak', uid), { days, name: name.slice(0, 60), at: serverTimestamp(), v: 2 });
}
