'use client';
/** 9.8 Changing the pet: the new state goes to the store at once, to the phone's copy, and to the account a moment later. */
import { cachePet, petNow, savePetOnTop, setPetStore } from './pet-store';
import type { PetEvent, PetState } from '@/lib/pet';
import { mergeChanges } from '@/lib/same-data';
import { play, type GameSound } from '@/lib/game-sound';

let timer = 0, pending: PetState | null = null, pendingBase: PetState | null = null;
/** 10.5 A change being written to the account right now (the copy it was made from, and the change). */
let inflight: { base: PetState | null; next: PetState } | null = null;
export function commitPet(next: PetState) {
  const { uid, state: before } = petNow(); if (!uid) return;
  // 9.9.2 The copy the first unsaved change was made from, so only this phone's changes go on top of the account's pet.
  if (!pending) pendingBase = before;
  setPetStore({ state: next }); cachePet(uid, next);
  pending = next; window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const s = pending, base = pendingBase; pending = null; pendingBase = null; if (!s) return;
    const mine = { base, next: s }; inflight = mine;
    void savePetOnTop(uid, base, s).catch(() => {}).finally(() => { if (inflight === mine) inflight = null; });
  }, 900);
}
/**
 * 10.5 The account's pet as this phone should show it: with this phone's changes that are not saved yet laid on top.
 * Before, a copy arriving from the account (another phone's change, or the account answering a moment after the app
 * opened) replaced the pet on screen; a meal given just before was shown undone, and the next pat or meal was made from
 * that copy, so the meal was never saved.
 */
export function withLocalChanges(server: PetState): PetState {
  let out = server;
  if (inflight) out = inflight.base ? mergeChanges(inflight.base, inflight.next, out) : inflight.next;
  if (pending) out = pendingBase ? mergeChanges(pendingBase, pending, out) : pending;
  return out;
}

/** 10.5 What happened in the pet's panel (a level reached by a meal, a pat, a tip, an egg): the pet next to the chat button
 * announces it, the same as for what happens next to it. */
const eventListeners = new Set<(events: PetEvent[]) => void>();
export function onPetEvents(listener: (events: PetEvent[]) => void) { eventListeners.add(listener); return () => { eventListeners.delete(listener); }; }
export function emitPetEvents(events: PetEvent[]) { if (events.length) eventListeners.forEach(f => f(events)); }

/** Hour of the day in a time zone (0–23). */
const formats = new Map<string, Intl.DateTimeFormat>();
export function hourIn(tz: string) {
  let f = formats.get(tz); if (!f) { f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }); formats.set(tz, f); }
  const fmt = f; return (ms: number) => Number(fmt.format(new Date(ms))) % 24;
}
export const hourKey = (tz: string) => { const d = new Date(); return `${d.toISOString().slice(0, 10)}T${hourIn(tz)(d.getTime())}`; };
export function petSound(voice: string) { play(voice as GameSound); }
/** How long until something can be done again, in words. */
export const waitText = (ms: number) => (ms >= 3_600_000 ? `±${Math.ceil(ms / 3_600_000)} jam lagi` : `±${Math.max(1, Math.ceil(ms / 60_000))} menit lagi`);
