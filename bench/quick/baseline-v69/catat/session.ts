/**
 * Catat otomatis V3.4 — short session context ("dia", "yang tadi", "sisanya").
 *
 * What was just saved from the Catat otomatis box, kept in memory only (never stored, gone after a reload), for one
 * signed-in user, for 30 minutes. It holds ids, not guesses: the entries saved, the people named, the record a payment
 * went to. After 30 minutes, another account, or a reset, "dia bayar 5k" is asked again instead of resolved.
 */
import type { SessionView } from './personal.ts';

export const SESSION_TTL_MS = 30 * 60_000;
type Saved = { txId?: string; person?: string; relation?: { kind: 'receivable' | 'debt'; id?: string; person: string } };
type State = { uid: string; txIds: { id: string; at: number }[]; people: { name: string; at: number }[]; relation?: Saved['relation'] & { at: number } };
let state: State | null = null;

/** The live session of this user, or undefined (expired entries are dropped; another user sees nothing). */
export function sessionView(uid: string | undefined, nowMs = Date.now()): SessionView | undefined {
  if (!uid || !state || state.uid !== uid) { if (state && state.uid !== uid) state = null; return undefined; }
  const fresh = (at: number) => nowMs - at <= SESSION_TTL_MS && at <= nowMs + 60_000;
  state.txIds = state.txIds.filter(x => fresh(x.at));
  state.people = state.people.filter(x => fresh(x.at));
  if (state.relation && !fresh(state.relation.at)) state.relation = undefined;
  const newest = Math.max(0, ...state.txIds.map(x => x.at), ...state.people.map(x => x.at), state.relation?.at || 0);
  if (!newest) return undefined;
  return { txIds: state.txIds.map(x => x.id), people: [...new Set(state.people.map(x => x.name))], ...(state.relation ? { relation: { kind: state.relation.kind, id: state.relation.id, person: state.relation.person } } : {}), ageMs: nowMs - newest };
}

/** Called after a card is saved from the box: what it created, who it was about. */
export function rememberSaved(uid: string, items: Saved[], nowMs = Date.now()) {
  if (!state || state.uid !== uid) state = { uid, txIds: [], people: [] };
  for (const it of items) {
    if (it.txId) state.txIds = [{ id: it.txId, at: nowMs }, ...state.txIds.filter(x => x.id !== it.txId)].slice(0, 10);
    if (it.person) { const name = it.person.trim(); if (name) state.people = [{ name, at: nowMs }, ...state.people.filter(x => x.name.toLocaleLowerCase('id-ID') !== name.toLocaleLowerCase('id-ID'))].slice(0, 5); }
    if (it.relation) state.relation = { ...it.relation, at: nowMs };
  }
}

/** Logout, account switch, or "mulai baru". */
export function clearSession() { state = null; }
