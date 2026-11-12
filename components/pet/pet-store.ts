'use client';
/**
 * 9.8 The pet on this device and in the account (users/{uid}/game/pet): a tiny store the dock next to the chat button
 * and the pet's panel share, a copy on the phone so the pet is there from the first moment, and the "hide" choice
 * (per device). Rules: lib/pet.ts.
 */
import { useSyncExternalStore } from 'react';
import { doc, onSnapshot, runTransaction, setDoc, type Unsubscribe } from 'firebase/firestore';
import { isOffline } from '@/lib/offline';
import { changedFields, mergeChanges, sameData } from '@/lib/same-data';
import { db } from '@/lib/firebase';
import type { PetState } from '@/lib/pet';

type Store = { uid: string; state: PetState | null; ready: boolean; sheet: boolean };
let store: Store = { uid: '', state: null, ready: false, sheet: false };
const listeners = new Set<() => void>();
export function setPetStore(next: Partial<Store>) { store = { ...store, ...next }; listeners.forEach(f => f()); }
export const usePetStore = () => useSyncExternalStore(f => { listeners.add(f); return () => { listeners.delete(f); }; }, () => store, () => store);
export const petNow = () => store;
export const openPetSheet = (open = true) => setPetStore({ sheet: open });

const ref = (uid: string) => { if (!db) throw Error('Konfigurasi Firebase belum tersedia.'); return doc(db, 'users', uid, 'game', 'pet'); };
/** 9.9.2 `fromServer` tells the server's copy apart from this phone's own older copy (shown first). */
export function subscribePet(uid: string, onValue: (state: PetState | null, fromServer: boolean) => void): Unsubscribe {
  try {
    let last = '';
    return onSnapshot(ref(uid), { includeMetadataChanges: true }, snap => {
      const state = snap.exists() ? snap.data() as PetState : null, fromServer = !snap.metadata.fromCache, key = `${fromServer}|${JSON.stringify(state)}`;
      if (key !== last) { last = key; onValue(state, fromServer); }
    }, () => {});
  } catch { return () => {}; }
}
/**
 * 9.9.2 Saves this phone's change to the pet on top of what the account holds: what this phone changed since `base` is
 * written over the newest copy field by field, so a meal, a pat or growth given on another phone meanwhile is kept
 * (it used to overwrite the whole pet). Offline the change waits on the phone, as before.
 */
export async function savePetOnTop(uid: string, base: PetState | null, next: PetState) {
  const target = ref(uid), clean = (s: PetState) => JSON.parse(JSON.stringify(s)) as PetState;
  if (!isOffline()) {
    try {
      await runTransaction(db!, async trx => {
        const snap = await trx.get(target), current = snap.exists() ? snap.data() as PetState : null;
        const out = current && base ? mergeChanges(clean(base), clean(next), current) : clean(next);
        if (!sameData(out, current)) trx.set(target, out);
      });
      return;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code !== 'unavailable' && code !== 'deadline-exceeded') throw error;
    }
  }
  // Offline: only the fields this phone changed, so what another phone did to the rest meanwhile stays.
  void (base ? setDoc(target, changedFields(clean(base), clean(next)), { merge: true }) : setDoc(target, clean(next))).catch(() => undefined);
}

const CACHE = (uid: string) => `dompet-ajaib:pet-cache:${uid}`, HIDE = (uid: string) => `dompet-ajaib:pet-hidden:${uid}`;
export function cachedPet(uid: string): PetState | null { try { const t = localStorage.getItem(CACHE(uid)); return t ? JSON.parse(t) as PetState : null; } catch { return null; } }
export function cachePet(uid: string, state: PetState | null) { if (!state) return; try { localStorage.setItem(CACHE(uid), JSON.stringify(state)); } catch { /* only a head start */ } }
export const PET_HIDE_EVENT = 'dompet-ajaib:pet-hidden';
export function petHidden(uid: string) { try { return localStorage.getItem(HIDE(uid)) === '1'; } catch { return false; } }
export function setPetHidden(uid: string, hidden: boolean) { try { localStorage.setItem(HIDE(uid), hidden ? '1' : '0'); } catch { /* per device */ } window.dispatchEvent(new Event(PET_HIDE_EVENT)); }
