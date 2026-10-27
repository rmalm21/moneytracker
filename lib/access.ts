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
export type AccessRequest = { uid: string; email: string; name: string; at?: Date; tries: number; /** When the account was made: before 6.1 = someone who already used the app. */ since?: Date };
/** Accounts made before this were using Dompet Ajaib before Kode akses: for them it is a one-time security step. */
export const ACCESS_SINCE = Date.parse('2026-10-27T00:00:00+07:00');
export const madeBeforeAccess = (user: Pick<User, 'metadata'> | null) => Boolean(user?.metadata.creationTime) && Date.parse(user!.metadata.creationTime!) < ACCESS_SINCE;

const okKey = (uid: string) => `dompet-ajaib:access:${uid}`;
const revokedKey = (uid: string) => `dompet-ajaib:revoked:${uid}`;
/** "May open" (offline too) and, separately, "the owner took access back" (until access is given again). */
const remember = (uid: string, ok: boolean, revoked = false) => { try { if (ok) { localStorage.setItem(okKey(uid), '1'); localStorage.removeItem(revokedKey(uid)); sessionStorage.removeItem(`dompet-ajaib:asked:${uid}`); } else { localStorage.removeItem(okKey(uid)); if (revoked) localStorage.setItem(revokedKey(uid), '1'); } } catch { /* optional */ } };
const wasRevoked = (uid: string) => { try { return localStorage.getItem(revokedKey(uid)) === '1'; } catch { return false; } };
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
export async function checkAccess(user: User): Promise<{ state: AccessState; admin: boolean; revoked: boolean }> {
  const store = need(), grant = doc(store, 'accessGrants', user.uid);
  let admin = false, before = false;
  // This device opened the app for this account before: no grant now means the owner took access back.
  try { before = localStorage.getItem(okKey(user.uid)) === '1'; } catch { /* unknown */ }
  try {
    const config = await getDoc(doc(store, 'appConfig', 'access')).catch(() => null);
    admin = Boolean(config?.exists() && (config.data().admins || []).includes(user.uid));
    const own = await getDoc(grant).catch(async error => { const cached = await getDocFromCache(grant).catch(() => null); if (cached) return cached; throw error; });
    if (own.exists()) { remember(user.uid, true); return { state: 'granted', admin, revoked: false }; }
    if (admin) { await setDoc(grant, { code: 'owner', email: user.email || '', at: serverTimestamp() }); remember(user.uid, true); return { state: 'granted', admin, revoked: false }; }
    const revoked = before || wasRevoked(user.uid);
    remember(user.uid, false, revoked);
    return { state: 'needs-code', admin, revoked };
  } catch {
    // Offline or a hiccup: an account already let in on this device opens as before.
    try { if (localStorage.getItem(okKey(user.uid)) === '1') return { state: 'granted', admin, revoked: false }; } catch { /* no memory */ }
    return { state: 'error', admin, revoked: false };
  }
}

/** Redeems a code: the code records who used it and the grant is made, in one batch the rules check together. */
export async function redeemCode(user: User, typed: string) {
  const store = need(), code = cleanCode(typed);
  if (code.length < 6) throw Error('Kodenya kurang lengkap. Cek lagi, ya.');
  const batch = writeBatch(store);
  batch.update(doc(store, 'accessCodes', code), { usedBy: user.uid, usedAt: serverTimestamp(), usedEmail: user.email || '' });
  batch.set(doc(store, 'accessGrants', user.uid), { code, email: user.email || '', at: serverTimestamp() });
  try { await batch.commit(); }
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
  // At most once a minute from this device (the rules hold the same limit); a request is sent again after access was
  // taken back, because approving one deletes it.
  const key = `dompet-ajaib:asked:${user.uid}`;
  try { const last = Number(sessionStorage.getItem(key)) || 0; if (Date.now() - last < 65_000) return; sessionStorage.setItem(key, String(Date.now())); } catch { /* ask anyway */ }
  await sendRequest(user).catch(() => undefined);
}
/** Sends (or sends again) this account's request to the owner. */
export function sendRequest(user: User) {
  return setDoc(doc(need(), 'accessRequests', user.uid), { email: user.email || '', name: (user.displayName || '').slice(0, 80), at: serverTimestamp(), tries: increment(1), since: user.metadata.creationTime ? new Date(user.metadata.creationTime).toISOString() : '' }, { merge: true });
}
/** Whether this account's request is still on the owner's list (false once the owner dismissed it). */
export function watchOwnRequest(uid: string, onValue: (waiting: boolean) => void): Unsubscribe {
  return onSnapshot(doc(need(), 'accessRequests', uid), snap => { if (!snap.metadata.fromCache) onValue(snap.exists()); }, () => undefined);
}
/** Waiting time before asking again, growing with each try: 5 s, 10 s, 30 s, then 1 minute. */
export const RESEND_WAIT = [5, 10, 30, 60];
/** Opens the app the moment the owner lets this account in (approved, or a code redeemed elsewhere). */
export function watchGrant(uid: string, onGranted: () => void): Unsubscribe {
  return onSnapshot(doc(need(), 'accessGrants', uid), snap => { if (snap.exists()) { remember(uid, true); onGranted(); } }, () => undefined);
}

/** While the app is open: tells at once when the owner takes this account's access back (its grant is deleted). */
export function watchOwnGrant(uid: string, onGone: () => void): Unsubscribe {
  return onSnapshot(doc(need(), 'accessGrants', uid), snap => { if (!snap.exists() && !snap.metadata.fromCache) { remember(uid, false, true); onGone(); } }, () => undefined);
}

// ——— Owner ———
/** Who asked for access, newest first, live (the owner's screen updates while someone is waiting). */
export function watchRequests(onValue: (list: AccessRequest[]) => void): Unsubscribe {
  return onSnapshot(collection(need(), 'accessRequests'), snap => onValue(snap.docs.map(d => { const x = d.data(); return { uid: d.id, email: x.email || '', name: x.name || '', at: toDate(x.at), tries: Number(x.tries) || 1, since: x.since ? new Date(x.since) : undefined }; }).sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0))), () => onValue([]));
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
/** Who has access, live (so the request list never hides someone whose access was just taken back). */
export function watchGrants(onValue: (list: AccessGrant[]) => void): Unsubscribe {
  return onSnapshot(collection(need(), 'accessGrants'), snap => onValue(snap.docs.map(d => { const x = d.data(); return { uid: d.id, code: x.code || '', email: x.email || '', at: toDate(x.at) }; }).sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0))), () => undefined);
}
export async function listGrants(): Promise<AccessGrant[]> {
  const snap = await getDocs(collection(need(), 'accessGrants'));
  return snap.docs.map(d => { const x = d.data(); return { uid: d.id, code: x.code || '', email: x.email || '', at: toDate(x.at) }; }).sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0));
}
export const deleteCode = (code: string) => deleteDoc(doc(need(), 'accessCodes', code));
/** Takes access away: that account cannot open its data any more (its data stays until it is deleted). */
export const revokeGrant = (uid: string) => deleteDoc(doc(need(), 'accessGrants', uid));
