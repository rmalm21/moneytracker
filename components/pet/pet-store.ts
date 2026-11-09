'use client';
/**
 * 9.8 The pet on this device and in the account (users/{uid}/game/pet): a tiny store the dock next to the chat button
 * and the pet's panel share, a copy on the phone so the pet is there from the first moment, and the "hide" choice
 * (per device). Rules: lib/pet.ts.
 */
import { useSyncExternalStore } from 'react';
import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
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
export function subscribePet(uid: string, onValue: (state: PetState | null) => void): Unsubscribe {
  try { return onSnapshot(ref(uid), snap => onValue(snap.exists() ? snap.data() as PetState : null), () => {}); } catch { return () => {}; }
}
export async function savePetState(uid: string, state: PetState) { await setDoc(ref(uid), JSON.parse(JSON.stringify(state))); }

const CACHE = (uid: string) => `dompet-ajaib:pet-cache:${uid}`, HIDE = (uid: string) => `dompet-ajaib:pet-hidden:${uid}`;
export function cachedPet(uid: string): PetState | null { try { const t = localStorage.getItem(CACHE(uid)); return t ? JSON.parse(t) as PetState : null; } catch { return null; } }
export function cachePet(uid: string, state: PetState | null) { if (!state) return; try { localStorage.setItem(CACHE(uid), JSON.stringify(state)); } catch { /* only a head start */ } }
export const PET_HIDE_EVENT = 'dompet-ajaib:pet-hidden';
export function petHidden(uid: string) { try { return localStorage.getItem(HIDE(uid)) === '1'; } catch { return false; } }
export function setPetHidden(uid: string, hidden: boolean) { try { localStorage.setItem(HIDE(uid), hidden ? '1' : '0'); } catch { /* per device */ } window.dispatchEvent(new Event(PET_HIDE_EVENT)); }
