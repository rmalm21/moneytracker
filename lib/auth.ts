import { setPersistence, browserLocalPersistence, browserSessionPersistence, confirmPasswordReset, EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updatePassword, verifyPasswordResetCode, type User } from 'firebase/auth';
import { auth } from './firebase';
export function normalizeLoginIdentifier(input: string) { const s=input.trim().toLowerCase(); if (!s) return ''; const domain=(process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN || 'gmail.com').trim().toLowerCase(); return s.includes('@') ? s : `${s}@${domain}`; }
export function friendlyError(error: unknown) { const code=(error as {code?:string})?.code || ''; if (code.includes('invalid-credential')||code.includes('wrong-password')||code.includes('user-not-found')) return 'Username atau password salah.'; if (code.includes('too-many-requests')) return 'Terlalu banyak percobaan. Coba lagi beberapa saat.'; if (code.includes('network-request-failed')||code.includes('unavailable')) return 'Koneksi bermasalah. Periksa internet lalu coba lagi.'; if (code.includes('requires-recent-login')) return 'Sesi perlu diperbarui. Keluar lalu masuk kembali.'; if (code.includes('expired-action-code')) return 'Link ini sudah kedaluwarsa. Minta link baru, ya.'; if (code.includes('invalid-action-code')) return 'Link ini tidak berlaku atau sudah pernah dipakai. Minta link baru, ya.'; if (code.includes('weak-password')) return 'Password terlalu lemah. Pakai minimal 8 karakter dengan huruf dan angka.'; if (code.includes('password-does-not-meet-requirements')) return 'Password belum memenuhi aturan keamanan akun. Tambahkan huruf besar, angka, atau simbol.'; if (code.includes('invalid-email')) return 'Format email belum benar.'; if (code.includes('user-disabled')) return 'Akun ini sedang dinonaktifkan.'; return 'Proses belum berhasil. Coba lagi.'; }
export async function login(identifier: string, password: string, remember=true) { if (!auth) throw Error('Konfigurasi Firebase belum tersedia.'); await setPersistence(auth,remember?browserLocalPersistence:browserSessionPersistence); const result = await signInWithEmailAndPassword(auth, normalizeLoginIdentifier(identifier), password); try { sessionStorage.setItem('dompet-ajaib:fresh-login', '1'); } catch { /* The PIN is then asked once more. */ } return result; }
export async function logout() { if (auth) await signOut(auth); }
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
