/** Optional 4-digit app lock. The PIN never leaves the device in plain form: only a salted PBKDF2 hash is stored. */
const enc = new TextEncoder();
const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export const validPin = (pin: string) => /^\d{4}$/.test(pin);
export function newPinSalt() { return hex(crypto.getRandomValues(new Uint8Array(16))); }
export async function hashPin(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 120000 }, key, 256);
  return hex(bits);
}
export async function checkPin(pin: string, salt: string, hash: string) { return validPin(pin) && (await hashPin(pin, salt)) === hash; }

const unlockedKey = (uid: string) => `dompet-ajaib:unlocked:${uid}`;
const hiddenKey = (uid: string) => `dompet-ajaib:hidden-at:${uid}`;
const attemptsKey = (uid: string) => `dompet-ajaib:pin-attempts:${uid}`;
export const FRESH_LOGIN_KEY = 'dompet-ajaib:fresh-login';
const read = (store: Storage, key: string) => { try { return store.getItem(key); } catch { return null; } };
const write = (store: Storage, key: string, value: string | null) => { try { if (value === null) store.removeItem(key); else store.setItem(key, value); } catch { /* Storage can be blocked; the lock then asks every time. */ } };
export function isUnlocked(uid: string) { return read(sessionStorage, unlockedKey(uid)) === '1'; }
export function setUnlocked(uid: string, value: boolean) { write(sessionStorage, unlockedKey(uid), value ? '1' : null); }
export function consumeFreshLogin() { const fresh = read(sessionStorage, FRESH_LOGIN_KEY) === '1'; write(sessionStorage, FRESH_LOGIN_KEY, null); if (fresh) write(sessionStorage, 'dompet-ajaib:password-verified', '1'); return fresh; }
/** True in a tab where the password was just typed, so a forgotten PIN can be replaced without the old one. */
export function passwordVerified() { return read(sessionStorage, 'dompet-ajaib:password-verified') === '1'; }
export function markHidden(uid: string) { write(sessionStorage, hiddenKey(uid), String(Date.now())); }
export function hiddenFor(uid: string) { const at = Number(read(sessionStorage, hiddenKey(uid)) || 0); return at ? Date.now() - at : 0; }
export function clearHidden(uid: string) { write(sessionStorage, hiddenKey(uid), null); }
/** Wrong attempts: after 5 in a row the keypad pauses for 30 seconds. */
export function attempts(uid: string): { count: number; until: number } { try { return JSON.parse(read(localStorage, attemptsKey(uid)) || '') || { count: 0, until: 0 }; } catch { return { count: 0, until: 0 }; } }
export function recordAttempt(uid: string, ok: boolean) { if (ok) { write(localStorage, attemptsKey(uid), null); return { count: 0, until: 0 }; } const prev = attempts(uid); const count = prev.count + 1; const next = { count: count >= 5 ? 0 : count, until: count >= 5 ? Date.now() + 30000 : 0 }; write(localStorage, attemptsKey(uid), JSON.stringify(next)); return next; }
