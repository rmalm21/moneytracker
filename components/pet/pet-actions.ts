'use client';
/** 9.8 Changing the pet: the new state goes to the store at once, to the phone's copy, and to the account a moment later. */
import { cachePet, petNow, savePetState, setPetStore } from './pet-store';
import type { PetState } from '@/lib/pet';
import { play, type GameSound } from '@/lib/game-sound';

let timer = 0, pending: PetState | null = null;
export function commitPet(next: PetState) {
  const { uid } = petNow(); if (!uid) return;
  setPetStore({ state: next }); cachePet(uid, next);
  pending = next; window.clearTimeout(timer);
  timer = window.setTimeout(() => { const s = pending; pending = null; if (s) void savePetState(uid, s).catch(() => {}); }, 900);
}
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
