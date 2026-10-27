import { setPersistence, browserLocalPersistence, browserSessionPersistence, confirmPasswordReset, EmailAuthProvider, getRedirectResult, GoogleAuthProvider, linkWithPopup, linkWithRedirect, reauthenticateWithCredential, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, unlink, updatePassword, verifyPasswordResetCode, type User } from 'firebase/auth';
import { auth } from './firebase';
export function normalizeLoginIdentifier(input: string) { const s=input.trim().toLowerCase(); if (!s) return ''; const domain=(process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN || 'gmail.com').trim().toLowerCase(); return s.includes('@') ? s : `${s}@${domain}`; }
export function friendlyError(error: unknown) { const code=(error as {code?:string})?.code || '';
 // Masuk dengan Google.
 if (code.includes('popup-closed-by-user')||code.includes('cancelled-popup-request')||code.includes('user-cancelled')) return 'Masuk dengan Google dibatalkan.';
 if (code.includes('unauthorized-domain')) return 'Alamat aplikasi ini belum diizinkan untuk masuk dengan Google. Tambahkan domainnya di Firebase Console → Authentication → Settings → Authorized domains.';
 if (code.includes('operation-not-allowed')) return 'Masuk dengan Google belum diaktifkan di Firebase Console → Authentication → Sign-in method.';
 if (code.includes('account-exists-with-different-credential')) return 'Email ini sudah terdaftar dengan password. Masuk dengan password dulu, lalu hubungkan Google di Pengaturan → Keamanan.';
 if (code.includes('credential-already-in-use')) return 'Akun Google ini sudah dipakai oleh akun Dompet Ajaib lain.';
 if (code.includes('provider-already-linked')) return 'Akun Google sudah terhubung.';
 if (code.includes('popup-blocked')) return 'Jendela masuk Google diblokir browser. Izinkan pop-up untuk situs ini, lalu coba lagi.'; if (code.includes('invalid-credential')||code.includes('wrong-password')||code.includes('user-not-found')) return 'Username atau password salah.'; if (code.includes('too-many-requests')) return 'Terlalu banyak percobaan. Coba lagi beberapa saat.'; if (code.includes('network-request-failed')||code.includes('unavailable')) return 'Koneksi bermasalah. Periksa internet lalu coba lagi.'; if (code.includes('requires-recent-login')) return 'Sesi perlu diperbarui. Keluar lalu masuk kembali.'; if (code.includes('expired-action-code')) return 'Link ini sudah kedaluwarsa. Minta link baru, ya.'; if (code.includes('invalid-action-code')) return 'Link ini tidak berlaku atau sudah pernah dipakai. Minta link baru, ya.'; if (code.includes('weak-password')) return 'Password terlalu lemah. Pakai minimal 8 karakter dengan huruf dan angka.'; if (code.includes('password-does-not-meet-requirements')) return 'Password belum memenuhi aturan keamanan akun. Tambahkan huruf besar, angka, atau simbol.'; if (code.includes('invalid-email')) return 'Format email belum benar.'; if (code.includes('user-disabled')) return 'Akun ini sedang dinonaktifkan.'; return code ? `Proses belum berhasil. Coba lagi. (kode: ${code.replace(/^auth\//, '')})` : 'Proses belum berhasil. Coba lagi.'; }
export async function login(identifier: string, password: string, remember=true) { if (!auth) throw Error('Konfigurasi Firebase belum tersedia.'); await setPersistence(auth,remember?browserLocalPersistence:browserSessionPersistence); const result = await signInWithEmailAndPassword(auth, normalizeLoginIdentifier(identifier), password); try { sessionStorage.setItem('dompet-ajaib:fresh-login', '1'); } catch { /* The PIN is then asked once more. */ } return result; }
export async function logout() { if (auth) await signOut(auth); }
/**
 * Masuk dengan Google. The same Gmail as an existing account opens that account (same data). A popup is used; where a
 * browser cannot open one (blocked, or an installed app that does not allow it) the page goes to Google and comes back.
 */
const google = () => { const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' }); return provider; };
const PENDING = 'dompet-ajaib:google-pending';
/** Whether Google's sign-in runs on this very address (lib/firebase.ts picks it on Firebase Hosting). */
const sameSite = () => { try { return Boolean(auth) && auth!.config.authDomain === window.location.host; } catch { return false; } };
const installedApp = () => { try { return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true; } catch { return false; } };
const markFresh = () => { try { sessionStorage.setItem('dompet-ajaib:fresh-login', '1'); } catch { /* the welcome is optional */ } };
export async function loginWithGoogle(remember = true) {
  if (!auth) throw Error('Konfigurasi Firebase belum tersedia.');
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  // On the app's own address (Firebase Hosting signs in there) the page goes to Google and comes back: nothing depends on
  // a popup, which browsers may cut off from the page and which an installed app cannot hand back. Elsewhere (a preview
  // link, local testing) the sign-in page is on another address, where only a popup gets its answer back.
  if (sameSite() || installedApp()) { markFresh(); try { sessionStorage.setItem(PENDING, '1'); } catch { /* the hint after coming back is optional */ } await signInWithRedirect(auth, google()); return 'redirect' as const; }
  try { const result = await signInWithPopup(auth, google()); markFresh(); offerPassword(result.user); return 'popup' as const; }
  catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (/popup-blocked|operation-not-supported-in-this-environment|web-storage-unsupported/.test(code)) { markFresh(); await signInWithRedirect(auth, google()); return 'redirect' as const; }
    throw error;
  }
}
/** After coming back from Google's page: an error to show, and whether Google was just linked (Pengaturan). A sign-in is picked up by the auth listener. */
export async function finishGoogleRedirect(): Promise<{ error: string | null; linked: boolean }> {
  if (!auth) return { error: null, linked: false };
  let pending = false; try { pending = sessionStorage.getItem(PENDING) === '1'; sessionStorage.removeItem(PENDING); } catch { /* no hint */ }
  try {
    const result = await getRedirectResult(auth);
    if (result) { if (result.operationType === 'signIn') offerPassword(result.user); return { error: null, linked: result.operationType === 'link' }; }
    // Back from Google with nothing to show: say so instead of leaving the page as it was.
    return { error: pending && !auth.currentUser ? 'Masuk dengan Google belum selesai. Coba sekali lagi, ya. Kalau masih gagal, masuk pakai username dulu.' : null, linked: false };
  } catch (error) { return { error: friendlyError(error), linked: false }; }
}
export const hasGoogle = (user: User | null) => Boolean(user?.providerData.some(p => p.providerId === 'google.com'));
/**
 * An account that signs in with Google only adds a password (then both work: Google, or the Gmail/username with the
 * password). updatePassword adds the password sign-in to the same account (linking a new email credential would be
 * refused: the email is already this account's). Firebase allows it only shortly after a sign-in.
 */
export async function createPassword(user: User, password: string) { if (!user.email) throw Error('Akun ini belum punya email.'); if (password.length < 8) throw Error('Password minimal 8 karakter.'); await updatePassword(user, password); await user.reload(); }
/** Whether the last sign-in is recent enough for sensitive changes (Firebase allows about 5 minutes; a margin is kept). */
export async function signedInRecently(user: User) { try { return Date.now() - Date.parse((await user.getIdTokenResult()).authTime) < 4 * 60_000; } catch { return false; } }
/** Set once a Google sign-in finished for an account without a password: the app offers to make one right away. */
export const GOOGLE_NO_PASSWORD = 'dompet-ajaib:google-no-password';
const offerPassword = (user: User) => { if (!hasPassword(user)) try { sessionStorage.setItem(GOOGLE_NO_PASSWORD, '1'); } catch { /* optional */ } };
export const hasPassword = (user: User | null) => Boolean(user?.providerData.some(p => p.providerId === 'password'));
/** Pengaturan → Keamanan: add Google to an account that signs in with a password (both keep working). */
export async function linkGoogle(user: User) { if (sameSite() || installedApp()) { try { sessionStorage.setItem(PENDING, '1'); } catch { /* optional */ } await linkWithRedirect(user, google()); return ''; } const result = await linkWithPopup(user, google()); return result.user.providerData.find(p => p.providerId === 'google.com')?.email || ''; }
/** Remove Google again (only while a password still signs in). */
export async function unlinkGoogle(user: User) { if (!hasPassword(user)) throw Error('Akun ini hanya bisa masuk lewat Google, jadi Google tidak bisa dilepas.'); await unlink(user, 'google.com'); }
/**
 * Sends the "reset password" email and returns the address it went to. Whether the account exists stays hidden;
 * a broken connection, too many tries or a malformed address are reported. The link returns to the login page.
 */
export async function forgotPassword(identifier: string) {
  if (!auth) throw Error('Firebase belum dikonfigurasi.');
  const email = normalizeLoginIdentifier(identifier);
  if (!email) throw Error('Masukkan username atau email.');
  const back = typeof window !== 'undefined' ? { url: `${window.location.origin}/login/` } : undefined;
  const send = (withBack: boolean) => sendPasswordResetEmail(auth!, email, withBack ? back : undefined);
  const reported = (error: unknown) => { const code = (error as { code?: string })?.code || ''; return /network-request-failed|too-many-requests|invalid-email|unavailable/.test(code); };
  try { await send(Boolean(back)); }
  catch (error) {
    const code = (error as { code?: string })?.code || '';
    // The return address may not be on Firebase's list of allowed domains: send the plain link instead.
    if (back && /continue-uri|unauthorized-domain|argument-error/.test(code)) { try { await send(false); } catch (retry) { if (reported(retry)) throw retry; } }
    else if (reported(error)) throw error;
  }
  return email;
}
/** The email a reset link belongs to (throws when the link expired or was already used). */
export async function checkResetLink(code: string) { if (!auth) throw Error('Firebase belum dikonfigurasi.'); return verifyPasswordResetCode(auth, code); }
export async function finishReset(code: string, password: string) { if (!auth) throw Error('Firebase belum dikonfigurasi.'); if (password.length < 8) throw Error('Password baru minimal 8 karakter.'); await confirmPasswordReset(auth, code, password); }
export async function changePassword(user: User, oldPassword: string, newPassword: string) { if (!user.email) throw Error('Akun belum memiliki email.'); if (newPassword.length < 8) throw Error('Password baru minimal 8 karakter.'); await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,oldPassword)); await updatePassword(user,newPassword); }
