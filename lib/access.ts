/**
 * 6.1 Kode akses: Dompet Ajaib is for the people its owner lets in. Signing in (password or Google) is step one; an
 * account that is not the owner and has no grant yet redeems a code from the owner (step two). Firestore's rules
 * enforce it (firestore.rules: own() needs accessGrants/{uid}), so an account without access cannot read or write any
 * data, which also keeps strangers from using the database quota. This file is the app's side of it.
 *
 *   appConfig/access   { admins: [uid] }                      set once in the Firebase Console
 *   accessCodes/{code} { createdAt, createdBy, expiresAt, note, usedBy, usedAt, usedEmail }   one use, made by the owner
 *   accessGrants/{uid} { code, email, at }                      "this account may use the app"
 *   accessRequests/{uid} { email, name, at, tries }              someone signed in without access (the owner's list)
 */
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocFromCache, getDocs, increment, onSnapshot, serverTimestamp, setDoc, writeBatch, type Unsubscribe } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from './firebase.ts';

export type AccessState = 'checking' | 'granted' | 'needs-code' | 'error';
export type AccessCode = { code: string; createdAt?: Date; expiresAt?: Date; note: string; usedBy: string | null; usedAt?: Date; usedEmail: string };
export type AccessGrant = { uid: string; code: string; email: string; at?: Date };
export type AccessRequest = { uid: string; email: string; name: string; at?: Date; tries: number };

const okKey = (uid: string) => `dompet-ajaib:access:${uid}`;
const remember = (uid: string, ok: boolean) => { try { if (ok) localStorage.setItem(okKey(uid), '1'); else localStorage.removeItem(okKey(uid)); } catch { /* optional */ } };
const need = () => { if (!db) throw Error('Konfigurasi cloud belum tersedia.'); return db; };
const toDate = (v: unknown) => v instanceof Timestamp ? v.toDate() : undefined;

/** Letters and digits that cannot be mistaken for each other when read aloud or typed (no 0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** "7KQ M4X 29P" typed any way ("7kq-m4x-29p", spaces) → "7KQM4X29P". */
export const cleanCode = (typed: string) => typed.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const showCode = (code: string) => code.replace(/(.{3})(?=.)/g, '$1-');
function randomCode(length = 9) {
  const bytes = new Uint32Array(length); crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}

/** Whether this account may use the app: a grant, or the owner (who gets a grant on the way). Works offline once known. */
export async function checkAccess(user: User): Promise<{ state: AccessState; admin: boolean }> {
  const store = need(), grant = doc(store, 'accessGrants', user.uid);
  let admin = false;
  try {
    const config = await getDoc(doc(store, 'appConfig', 'access')).catch(() => null);
    admin = Boolean(config?.exists() && (config.data().admins || []).includes(user.uid));
    const own = await getDoc(grant).catch(async error => { const cached = await getDocFromCache(grant).catch(() => null); if (cached) return cached; throw error; });
    if (own.exists()) { remember(user.uid, true); return { state: 'granted', admin }; }
    if (admin) { await setDoc(grant, { code: 'owner', email: user.email || '', at: serverTimestamp() }); remember(user.uid, true); return { state: 'granted', admin }; }
    remember(user.uid, false);
    return { state: 'needs-code', admin };
  } catch {
    // Offline or a hiccup: an account already let in on this device opens as before.
    try { if (localStorage.getItem(okKey(user.uid)) === '1') return { state: 'granted', admin }; } catch { /* no memory */ }
    return { state: 'error', admin };
  }
}

/** Redeems a code: the code records who used it and the grant is made, in one batch the rules check together. */
export async function redeemCode(user: User, typed: string) {
  const store = need(), code = cleanCode(typed);
  if (code.length < 6) throw Error('Kodenya kurang lengkap. Cek lagi, ya.');
  const batch = writeBatch(store);
  batch.update(doc(store, 'accessCodes', code), { usedBy: user.uid, usedAt: serverTimestamp(), usedEmail: user.email || '' });
  batch.set(doc(store, 'accessGrants', user.uid), { code, email: user.email || '', at: serverTimestamp() });
  try { await batch.commit(); void deleteDoc(doc(store, 'accessRequests', user.uid)).catch(() => undefined); }
  catch (error) {
    const c = (error as { code?: string })?.code || '';
    if (/permission-denied|not-found/.test(c)) throw Error('Kodenya tidak cocok, sudah dipakai, atau sudah kedaluwarsa. Minta kode baru ke pemilik aplikasi.');
    if (/unavailable|network/.test(c)) throw Error('Koneksi bermasalah. Periksa internet lalu coba lagi.');
    throw error;
  }
  remember(user.uid, true);
}

/** Puts this account on the owner's "Minta akses" list (once per opening; the rules allow one write a minute). */
export async function askForAccess(user: User) {
  const key = `dompet-ajaib:asked:${user.uid}`;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* ask anyway */ }
  await setDoc(doc(need(), 'accessRequests', user.uid), { email: user.email || '', name: (user.displayName || '').slice(0, 80), at: serverTimestamp(), tries: increment(1) }, { merge: true }).catch(() => undefined);
}
/** Opens the app the moment the owner lets this account in (approved, or a code redeemed elsewhere). */
export function watchGrant(uid: string, onGranted: () => void): Unsubscribe {
  return onSnapshot(doc(need(), 'accessGrants', uid), snap => { if (snap.exists()) { remember(uid, true); onGranted(); } }, () => undefined);
}

// ——— Owner ———
/** Who asked for access, newest first, live (the owner's screen updates while someone is waiting). */
export function watchRequests(onValue: (list: AccessRequest[]) => void): Unsubscribe {
  return onSnapshot(collection(need(), 'accessRequests'), snap => onValue(snap.docs.map(d => { const x = d.data(); return { uid: d.id, email: x.email || '', name: x.name || '', at: toDate(x.at), tries: Number(x.tries) || 1 }; }).sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0))), () => onValue([]));
}
/** Lets someone in straight away (no code): their grant is made and their request removed. */
export async function approveRequest(request: AccessRequest) {
  const store = need(), batch = writeBatch(store);
  batch.set(doc(store, 'accessGrants', request.uid), { code: 'approved', email: request.email, at: serverTimestamp() });
  batch.delete(doc(store, 'accessRequests', request.uid));
  await batch.commit();
}
export const dismissRequest = (uid: string) => deleteDoc(doc(need(), 'accessRequests', uid));
/** A new random code, valid for `days` days (0 = no expiry), with a note of who it is for. */
export async function createCode(owner: User, days: number, note = '') {
  const store = need();
  for (let tries = 0; tries < 3; tries++) {
    const code = randomCode(), ref = doc(store, 'accessCodes', code);
    if ((await getDoc(ref)).exists()) continue;
    await setDoc(ref, { createdAt: serverTimestamp(), createdBy: owner.uid, note: note.trim().slice(0, 60), usedBy: null, usedAt: null, usedEmail: null, ...(days > 0 ? { expiresAt: Timestamp.fromMillis(Date.now() + days * 86_400_000) } : {}) });
    return code;
  }
  throw Error('Belum berhasil membuat kode. Coba lagi.');
}
export async function listCodes(): Promise<AccessCode[]> {
  const snap = await getDocs(collection(need(), 'accessCodes'));
  return snap.docs.map(d => { const x = d.data(); return { code: d.id, createdAt: toDate(x.createdAt), expiresAt: toDate(x.expiresAt), note: x.note || '', usedBy: x.usedBy || null, usedAt: toDate(x.usedAt), usedEmail: x.usedEmail || '' }; })
    .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
}
export async function listGrants(): Promise<AccessGrant[]> {
  const snap = await getDocs(collection(need(), 'accessGrants'));
  return snap.docs.map(d => { const x = d.data(); return { uid: d.id, code: x.code || '', email: x.email || '', at: toDate(x.at) }; }).sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0));
}
export const deleteCode = (code: string) => deleteDoc(doc(need(), 'accessCodes', code));
/** Takes access away: that account cannot open its data any more (its data stays until it is deleted). */
export const revokeGrant = (uid: string) => deleteDoc(doc(need(), 'accessGrants', uid));
