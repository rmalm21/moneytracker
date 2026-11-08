/**
 * 9.0 Ruang Bersama: records shared by 2–5 people (spaces/{id}), next to everyone's own (users/{uid}).
 *
 * A space works like someone's own records (same collections, same screens, keyed "space:{id}", lib/space-key.ts).
 * Joining takes an invite code (random, one use, about a day) and a member's approval; members are equal; anyone may
 * leave; only the last member deletes the space. The rules in firestore.rules enforce all of it.
 */
import {
  arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc,
  Timestamp, updateDoc, where, writeBatch, type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { settle } from './offline';
import { names, saveProfile, saveWallet, seedCategoryTemplates } from './firestore';
import { spaceKey } from './space-key';
import type { Category, Profile } from './types';

export { MAX_MEMBERS, MAX_SPACES, INVITE_HOURS, SPACE_FIELDS, spaceProfile, formatCode, cleanCode } from './space-profile';
export type { Space, SpaceMember, SpaceRequest, SpaceInvite } from './space-profile';
import { MAX_MEMBERS, INVITE_HOURS, cleanCode, type Space, type SpaceInvite, type SpaceRequest } from './space-profile';

function database() { if (!db) throw Error('Konfigurasi Firebase belum tersedia.'); return db; }
const spaceDoc = (id: string) => doc(database(), 'spaces', id);
const inviteDoc = (code: string) => doc(database(), 'spaceInvites', code);
const hydrate = <T,>(d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as object) }) as T;
export type Account = { uid: string; name: string; email: string };

/** Spaces this person is a member of (live). */
export function subscribeMySpaces(uid: string, onValue: (spaces: Space[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(query(collection(database(), 'spaces'), where('memberIds', 'array-contains', uid)), snap => onValue(snap.docs.map(d => hydrate<Space>(d)).sort((a, b) => a.name.localeCompare(b.name, 'id'))), onError);
}

/** A new space with this person as its only member, its first wallet, and categories (theirs copied, or the starter set). */
export async function createSpace(account: Account, input: { name: string; emoji: string; color: string; salaryCycleStartDay: number; wallet: string; categories: 'starter' | Category[] }) {
  const name = input.name.trim().slice(0, 40);
  if (!name) throw Error('Beri nama ruangnya dulu, misalnya Rumah.');
  const ref = doc(collection(database(), 'spaces'));
  await settle(setDoc(ref, {
    name, emoji: input.emoji, color: input.color, createdBy: account.uid, memberIds: [account.uid],
    members: { [account.uid]: { name: account.name, email: account.email, joinedAt: serverTimestamp() } },
    salaryCycleStartDay: Math.min(31, Math.max(1, Math.round(input.salaryCycleStartDay) || 1)), monthlySalary: 0, hideReserved: true, dashboardWidgets: [],
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  const key = spaceKey(ref.id);
  if (input.categories === 'starter') {
    const { categoryTemplates, planTemplateSeed } = await import('./category-templates');
    const records = planTemplateSeed([], categoryTemplates.map(t => t.key));
    if (records.length) await seedCategoryTemplates(key, records);
  } else {
    const keep = input.categories.filter(c => !c.isArchived);
    for (let i = 0; i < keep.length; i += 400) {
      const b = writeBatch(database());
      for (const c of keep.slice(i, i + 400)) { const { id, createdAt: _c, updatedAt: _u, ...rest } = c as Category & { createdAt?: unknown; updatedAt?: unknown }; b.set(doc(database(), 'spaces', ref.id, 'categories', id), { ...rest, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); }
      await settle(b.commit());
    }
  }
  if (input.wallet.trim()) await saveWallet(key, { name: input.wallet.trim().slice(0, 40), type: 'cash', openingBalance: 0, icon: '🏠', displayOrder: 0 });
  return ref.id;
}

export async function updateSpace(id: string, changes: Partial<Pick<Space, 'name' | 'emoji' | 'color' | 'salaryCycleStartDay'>>) {
  if (changes.name !== undefined && !changes.name.trim()) throw Error('Nama ruang tidak boleh kosong.');
  await settle(updateDoc(spaceDoc(id), { ...changes, ...(changes.name ? { name: changes.name.trim().slice(0, 40) } : {}), updatedAt: serverTimestamp() }));
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() { const bytes = crypto.getRandomValues(new Uint8Array(10)); return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join(''); }
/** A fresh invite (the previous one, if any, stops working). */
export async function createInvite(account: Account, space: Space) {
  if (space.memberIds.length >= MAX_MEMBERS) throw Error(`Ruang ini sudah ${MAX_MEMBERS} orang, jumlah paling banyak.`);
  if (space.invite?.code) await deleteDoc(inviteDoc(space.invite.code)).catch(() => {});
  const code = newCode(), expiresAt = Timestamp.fromMillis(Date.now() + INVITE_HOURS * 36e5);
  await setDoc(inviteDoc(code), { spaceId: space.id, spaceName: space.name, inviterName: account.name, createdBy: account.uid, expiresAt, at: serverTimestamp() });
  await updateDoc(spaceDoc(space.id), { invite: { code, expiresAt, by: account.uid }, updatedAt: serverTimestamp() });
  return code;
}
export async function cancelInvite(space: Space) {
  if (space.invite?.code) await deleteDoc(inviteDoc(space.invite.code)).catch(() => {});
  await updateDoc(spaceDoc(space.id), { invite: deleteField(), updatedAt: serverTimestamp() });
}

/** What a typed code is for, or why it cannot be used. */
export async function readInvite(typed: string): Promise<{ invite: SpaceInvite } | { error: string }> {
  const code = cleanCode(typed);
  if (code.length !== 10) return { error: 'Kodenya 10 huruf/angka, misalnya ABCDE-FGH23.' };
  const snap = await getDoc(inviteDoc(code)).catch(() => null);
  if (!snap?.exists()) return { error: 'Kode tidak ditemukan. Cek lagi atau minta kode baru.' };
  const invite = { code, ...snap.data() } as SpaceInvite;
  if (invite.usedBy) return { error: 'Kode ini sudah dipakai. Minta kode baru ke anggota ruang.' };
  if (invite.expiresAt.toMillis() < Date.now()) return { error: 'Kode ini sudah hangus (lebih dari 24 jam). Minta kode baru.' };
  return { invite };
}

/** Asks to join with an invite (used up in the same write); the space's members then accept or decline. */
export async function requestJoin(account: Account, invite: SpaceInvite, pending: Profile['spaceRequests']) {
  const b = writeBatch(database());
  b.set(doc(database(), 'spaces', invite.spaceId, 'requests', account.uid), { name: account.name.slice(0, 60) || account.email.split('@')[0], email: account.email.slice(0, 120), code: invite.code, at: serverTimestamp() });
  b.update(inviteDoc(invite.code), { usedBy: account.uid, usedAt: serverTimestamp() });
  try { await b.commit(); } catch (e) {
    const code = (e as { code?: string }).code;
    throw Error(code === 'permission-denied' ? 'Belum bisa bergabung: kodenya sudah dipakai atau hangus, ruangnya sudah penuh, atau kamu sudah jadi anggota.' : (e as Error).message);
  }
  await saveProfile(account.uid, { spaceRequests: { ...(pending || {}), [invite.spaceId]: { name: invite.spaceName, by: invite.inviterName, at: new Date().toISOString() } } });
}
/** Whether a request this person sent is still waiting (false: accepted or declined). */
export async function requestWaiting(uid: string, spaceId: string) {
  const snap = await getDoc(doc(database(), 'spaces', spaceId, 'requests', uid)).catch(() => null);
  return Boolean(snap?.exists());
}
export async function cancelRequest(uid: string, spaceId: string, pending: Profile['spaceRequests']) {
  await deleteDoc(doc(database(), 'spaces', spaceId, 'requests', uid)).catch(() => {});
  await forgetRequest(uid, spaceId, pending);
}
export async function forgetRequest(uid: string, spaceId: string, pending: Profile['spaceRequests']) {
  const next = { ...(pending || {}) }; delete next[spaceId];
  await saveProfile(uid, { spaceRequests: next });
}

/** Whether this person is now a member (only members can read the space). */
export async function isMember(spaceId: string) {
  try { return (await getDoc(spaceDoc(spaceId))).exists(); } catch { return false; }
}
export function subscribeRequests(spaceId: string, onValue: (list: SpaceRequest[]) => void): Unsubscribe {
  return onSnapshot(collection(database(), 'spaces', spaceId, 'requests'), snap => onValue(snap.docs.map(d => ({ uid: d.id, ...d.data() }) as SpaceRequest)), () => onValue([]));
}
export async function acceptRequest(space: Space, request: SpaceRequest) {
  if (space.memberIds.length >= MAX_MEMBERS) throw Error(`Ruang ini sudah ${MAX_MEMBERS} orang.`);
  const b = writeBatch(database());
  b.update(spaceDoc(space.id), {
    memberIds: arrayUnion(request.uid), [`members.${request.uid}`]: { name: request.name, email: request.email, joinedAt: serverTimestamp() },
    ...(space.invite?.code === request.code ? { invite: deleteField() } : {}), updatedAt: serverTimestamp(),
  });
  b.delete(doc(database(), 'spaces', space.id, 'requests', request.uid));
  await b.commit();
}
export async function declineRequest(spaceId: string, uid: string) { await deleteDoc(doc(database(), 'spaces', spaceId, 'requests', uid)); }

/** Leaves a space: the records stay, under this person's name ("sudah keluar"); their own records are untouched. */
export async function leaveSpace(account: Account, space: Space) {
  const remaining = space.memberIds.filter(id => id !== account.uid);
  if (!remaining.length) throw Error('Kamu anggota terakhir. Pakai Hapus ruang kalau sudah tidak dipakai.');
  await updateDoc(spaceDoc(space.id), { memberIds: remaining, [`members.${account.uid}`]: deleteField(), [`formerMembers.${account.uid}`]: { name: account.name, leftAt: serverTimestamp() }, updatedAt: serverTimestamp() });
}

/** The last member removes the space and every record in it (the records first, while the space still lets them). */
export async function deleteSpace(account: Account, space: Space, onProgress?: (done: number) => void) {
  if (space.memberIds.length !== 1 || space.memberIds[0] !== account.uid) throw Error('Ruang hanya bisa dihapus oleh anggota terakhir. Anggota lain perlu keluar dulu.');
  let done = 0;
  for (const name of [...names, 'deletions', 'activity', 'requests']) {
    for (;;) {
      const snap = await getDocs(query(collection(database(), 'spaces', space.id, name), limit(400)));
      if (snap.empty) break;
      const b = writeBatch(database()); snap.docs.forEach(d => b.delete(d.ref)); await b.commit();
      done += snap.size; onProgress?.(done);
      if (snap.size < 400) break;
    }
  }
  if (space.invite?.code) await deleteDoc(inviteDoc(space.invite.code)).catch(() => {});
  await deleteDoc(spaceDoc(space.id));
  return done;
}
