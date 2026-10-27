'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { signOut } from 'firebase/auth';
import { Check, KeyRound, LoaderCircle, LogIn, LogOut, Send, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { auth } from '@/lib/firebase';
import { RESEND_WAIT, askForAccess, cleanCode, madeBeforeAccess, redeemCode, sendRequest, showCode, watchGrant, watchOwnRequest } from '@/lib/access';

/**
 * 6.1 Kode akses, step two after signing in: Dompet Ajaib is for people its owner invited. The person types the code
 * the owner gave them (9 letters and numbers, three groups); the rules check it and let the account in.
 */
export function AccessGate() {
  const { user, access, refreshAccess, revoked } = useApp();
  // Three ways to arrive here: access taken back by the owner, someone who used the app before Kode akses (a one-time
  // security step), or a new account.
  const kind: 'revoked' | 'update' | 'new' = revoked ? 'revoked' : madeBeforeAccess(user) ? 'update' : 'new';
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false);
  // The owner sees this account in their list right away, and can let it in without a code: then this screen opens.
  useEffect(() => { if (!user) return; void askForAccess(user); return watchGrant(user.uid, () => { setDone(true); setTimeout(refreshAccess, 1100); }); }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  // Whether the request is still on the owner's list. Dismissed: ask again, waiting longer each time (5 s, 10 s,
  // 30 s, then a minute) so nobody floods the owner.
  const [waiting, setWaiting] = useState<boolean | null>(null), [tries, setTries] = useState(0), [readyAt, setReadyAt] = useState(0), [now, setNow] = useState(Date.now()), [sending, setSending] = useState(false);
  useEffect(() => user ? watchOwnRequest(user.uid, setWaiting) : undefined, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  // Each time the request is found dismissed, the wait starts fresh from that moment.
  useEffect(() => { if (waiting === false) setReadyAt(Date.now() + RESEND_WAIT[Math.min(tries, RESEND_WAIT.length - 1)] * 1000); else setReadyAt(0); setNow(Date.now()); }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (waiting !== false || now >= readyAt) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [waiting, now, readyAt]);
  const left = Math.max(0, Math.ceil((readyAt - now) / 1000));
  async function askAgain() { if (!user || left || sending) return; setSending(true); try { await sendRequest(user); setTries(n => n + 1); } catch { setError('Belum bisa mengirim. Tunggu sebentar, lalu coba lagi.'); } finally { setSending(false); } }
  const input = useRef<HTMLInputElement>(null);
  const clean = cleanCode(code).slice(0, 9), boxes = useMemo(() => Array.from({ length: 9 }, (_, i) => clean[i] || ''), [clean]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!user || clean.length < 9 || busy) return;
    setBusy(true); setError('');
    try { await redeemCode(user, clean); setDone(true); setTimeout(refreshAccess, 1100); }
    catch (e) { setError((e as Error).message || 'Belum berhasil. Coba lagi.'); setBusy(false); }
  }
  async function switchAccount() { if (auth) await signOut(auth).catch(() => undefined); window.location.replace('/login/'); }
  const step = done ? 3 : 2;
  return <main className="login-panel access-gate">
    <div className="access-card">
      <ol className="access-steps" aria-label="Langkah masuk">
        {[['Masuk', LogIn], [kind === 'update' ? 'Izin pemilik' : 'Kode akses', KeyRound], ['Mulai pakai', Sparkles]].map(([label, Icon], i) => { const n = i + 1, I = Icon as typeof LogIn; return <li key={n} className={n < step ? 'is-done' : n === step ? 'is-now' : ''} aria-current={n === step ? 'step' : undefined}><span className="access-dot" aria-hidden="true">{n < step ? <Check size={15}/> : <I size={15}/>}</span><small>{label as string}</small></li>; })}
      </ol>
      {done ? <div className="access-done" role="status"><span className="access-done-ring" aria-hidden="true"><ShieldCheck size={34}/></span><h1>Akses diberikan</h1><p className="muted">Selamat datang! Dompet Ajaib sedang dibuka…</p></div> : <>
        {kind !== 'new' && <span className={`access-tag is-${kind}`}>{kind === 'revoked' ? 'Akses dicabut' : 'Pembaruan keamanan'}</span>}
        <span className={`access-badge is-${kind}`} aria-hidden="true">{kind === 'revoked' ? <ShieldAlert size={26}/> : kind === 'update' ? <ShieldCheck size={26}/> : <KeyRound size={26}/>}</span>
        <h1>{kind === 'revoked' ? 'Aksesmu dicabut' : kind === 'update' ? 'Satu langkah lagi, ya' : 'Masukkan kode akses'}</h1>
        <p className="muted">{kind === 'revoked'
          ? 'Pemilik aplikasi mencabut akses akun ini. Datamu tetap aman dan tidak dihapus. Kalau ini keliru, kabari pemiliknya, atau ketik kode baru di bawah.'
          : kind === 'update'
            ? 'Dompet Ajaib sekarang lebih aman: tiap akun perlu izin dari pemilik. Ini cuma sekali, dan datamu tetap aman seperti biasa. Begitu diizinkan, aplikasi langsung terbuka. Punya kode? Ketik di bawah.'
            : 'Dompet Ajaib cuma untuk yang diundang. Ketik kode dari pemilik aplikasi, atau tunggu sebentar sampai kamu diizinkan.'}</p>
        {waiting === false
          ? <div className="access-resend" role="status"><span>Permintaanmu belum diterima pemilik. Kirim lagi kalau perlu, ya.</span><button type="button" className="access-switch" disabled={left > 0 || sending} onClick={() => void askAgain()}><Send size={14}/> {sending ? 'Mengirim…' : left ? `Kirim lagi (${left} dtk)` : 'Kirim permintaan lagi'}</button></div>
          : <p className="access-waiting" role="status"><i aria-hidden="true"/>{kind === 'revoked' ? 'Permintaan akses ulang sudah terkirim' : 'Permintaan akses sudah terkirim ke pemilik'}</p>}
        <form onSubmit={submit} className="access-form">
          <label className={`access-code ${error ? 'is-error' : ''}`} onClick={() => input.current?.focus()}>
            <span className="sr-only">Kode akses</span>
            <input ref={input} value={code} onChange={e => { setCode(showCode(cleanCode(e.target.value).slice(0, 9))); setError(''); }} inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" spellCheck={false} autoFocus aria-invalid={Boolean(error)} maxLength={14}/>
            <span className="access-boxes" aria-hidden="true">{boxes.map((ch, i) => <i key={i} className={`${ch ? 'has' : ''} ${i === clean.length ? 'is-next' : ''} ${i % 3 === 2 && i < 8 ? 'gap' : ''}`}>{ch}</i>)}</span>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {access === 'error' && !error && <p className="form-error" role="status">Belum bisa memeriksa akses. Periksa internet, lalu coba lagi.</p>}
          <Button className="full" disabled={busy || clean.length < 9}>{busy ? <><LoaderCircle size={16} className="spin"/> Memeriksa…</> : <><ShieldCheck size={16}/> Buka Dompet Ajaib</>}</Button>
        </form>
        <p className="access-safe"><ShieldCheck size={14} aria-hidden="true"/> Catatan keuanganmu aman dan terenkripsi.</p>
        <div className="access-who"><span>Masuk sebagai <b>{user?.email}</b></span><button type="button" className="access-switch" onClick={() => void switchAccount()}><LogOut size={14}/> Ganti akun</button></div>
      </>}
    </div>
  </main>;
}
