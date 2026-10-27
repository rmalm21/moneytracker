'use client';
import { useState } from 'react';
import { CircleCheck } from 'lucide-react';
import type { User } from 'firebase/auth';
import { friendlyError, hasGoogle, hasPassword, unlinkGoogle } from '@/lib/auth';

/** Google's "G" in its four colours (drawn here so nothing is loaded from Google before the person taps). */
export function GoogleMark({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
  </svg>;
}

/** "Lanjutkan dengan Google" as a frosted-glass button. */
export function GoogleButton({ busy, disabled, onClick, label = 'Lanjutkan dengan Google' }: { busy?: boolean; disabled?: boolean; onClick: () => void; label?: string }) {
  return <button type="button" className={`google-glass ${busy ? 'is-busy' : ''}`} disabled={disabled || busy} onClick={onClick}>
    <span className="google-glass-mark">{busy ? <span className="google-glass-spin" aria-hidden="true"/> : <GoogleMark/>}</span>
    <span className="google-glass-label">{busy ? 'Menghubungkan ke Google…' : label}</span>
  </button>;
}

/** Pengaturan → Keamanan: link Google to this account (password keeps working), or see that it is linked. */
export function GoogleLinkCard({ user, notify }: { user: User | null; notify: (message: string) => void }) {
  const [linked, setLinked] = useState(() => hasGoogle(user)), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const email = user?.providerData.find(p => p.providerId === 'google.com')?.email || '';
  // Google's popup cannot answer this page (it is cross-origin isolated for the receipt reader), so linking happens on
  // the login page, which comes back here when done.
  const link = () => { setBusy(true); window.location.assign('/login/?mode=linkGoogle'); };
  async function unlinkIt() {
    if (!user) return; setBusy(true); setError('');
    try { await unlinkGoogle(user); setLinked(false); notify('Akun Google dilepas. Masuk dengan password seperti biasa.'); }
    catch (e) { setError((e as Error).message && !(e as { code?: string }).code ? (e as Error).message : friendlyError(e)); }
    finally { setBusy(false); }
  }
  return <section className="set-card pw-card google-link-card">
    <div className="pw-card-head"><span className="google-glass-mark" aria-hidden="true"><GoogleMark size={22}/></span><div><h3>Masuk dengan Google</h3><p>{linked ? 'Akun ini bisa dibuka dengan akun Google tanpa mengetik password.' : 'Hubungkan akun Google supaya bisa masuk dengan sekali ketuk. Password tetap bisa dipakai.'}</p></div></div>
    {linked ? <>
      <p className="google-link-state"><CircleCheck size={16} aria-hidden="true"/><span>Terhubung{email ? <> dengan <b>{email}</b></> : ''}</span></p>
      {hasPassword(user) && <button type="button" className="link-button" disabled={busy} onClick={() => void unlinkIt()}>{busy ? 'Melepas…' : 'Lepas akun Google'}</button>}
    </> : <GoogleButton busy={busy} disabled={!user} onClick={() => void link()} label="Hubungkan akun Google"/>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
