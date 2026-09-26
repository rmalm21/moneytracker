'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { ArrowLeft, Check, CircleCheck, CircleX, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, Mail, MailCheck, Send } from 'lucide-react';
import { Field, Input } from './fields';
import { Button } from './ui/button';
import { changePassword, checkResetLink, finishReset, forgotPassword, friendlyError, normalizeLoginIdentifier } from '@/lib/auth';
import { maskEmail, passwordChecks, passwordReady, passwordScore, strengthLabels } from '@/lib/password';

/** Firebase errors carry a code; our own checks only a message. */
export const errorText = (error: unknown) => (error as { code?: string })?.code ? friendlyError(error) : (error as Error)?.message || 'Proses belum berhasil. Coba lagi.';
const codeOf = (error: unknown) => (error as { code?: string })?.code || '';

export function PasswordInput({ value, onChange, autoComplete, placeholder, autoFocus }: { value: string; onChange: (value: string) => void; autoComplete: string; placeholder?: string; autoFocus?: boolean }) {
  const [show, setShow] = useState(false);
  return <div className="password-wrap"><Input type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}/><button type="button" className="password-toggle" aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'} aria-pressed={show} onClick={() => setShow(!show)}>{show ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div>;
}

/** Four-step bar, a label, and the checklist under a new password. */
export function PasswordStrength({ value, previous }: { value: string; previous?: string }) {
  const score = passwordScore(value);
  return <div className={`pw-meter s${score}`}>
    <div className="pw-meter-top"><div className="pw-bars" aria-hidden="true">{[1, 2, 3, 4].map(n => <i key={n} className={n <= score ? 'on' : ''}/>)}</div><b aria-live="polite">{value ? strengthLabels[score] : 'Kekuatan'}</b></div>
    <ul className="pw-checks">{passwordChecks(value, previous).map(check => <li key={check.label} className={check.ok ? 'ok' : ''}>{check.ok ? <Check size={13}/> : <i aria-hidden="true"/>}{check.label}</li>)}</ul>
  </div>;
}

export function RepeatHint({ value, repeat }: { value: string; repeat: string }) {
  if (!repeat) return null;
  return value === repeat ? <small className="pw-match ok"><Check size={13}/> Password sama</small> : <small className="pw-match">Belum sama dengan password baru</small>;
}

/** Login → "Lupa password?": ask for the account, then say where the link went and what to do next. */
export function ForgotPassword({ initial, onClose }: { initial: string; onClose: () => void }) {
  const [identifier, setIdentifier] = useState(initial), [sentTo, setSentTo] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return; const timer = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(timer); }, [wait]);
  const target = normalizeLoginIdentifier(identifier);
  async function send(event?: FormEvent) {
    event?.preventDefault(); if (!target) { setError('Masukkan username atau email.'); return; }
    setBusy(true); setError('');
    try { setSentTo(await forgotPassword(identifier)); setWait(60); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  if (sentTo) return <div className="auth-flow">
    <span className="auth-badge tone-green is-pulse" aria-hidden="true"><MailCheck size={26}/></span>
    <div className="auth-copy"><h3>Cek emailmu</h3><p>Kalau akunnya terdaftar, link untuk membuat password baru sudah dikirim ke <b>{maskEmail(sentTo)}</b>.</p></div>
    <ol className="auth-steps"><li><b>Buka emailnya</b><small>Pengirimnya noreply, subjeknya tentang reset password.</small></li><li><b>Ketuk link di dalamnya</b><small>Berlaku sekitar 1 jam dan hanya sekali pakai.</small></li><li><b>Buat password baru</b><small>Lalu masuk dengan password itu.</small></li></ol>
    <p className="auth-note">Tidak ada di kotak masuk? Cek folder <b>Spam</b> atau <b>Promosi</b>.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="auth-actions"><Button type="button" className="full" onClick={onClose}>Kembali ke halaman masuk</Button><Button type="button" variant="secondary" className="full" disabled={busy || wait > 0} onClick={() => void send()}>{busy ? 'Mengirim…' : wait > 0 ? `Kirim ulang dalam ${wait} detik` : <><Send size={16}/> Kirim ulang link</>}</Button></div>
    <button type="button" className="link-button auth-back" onClick={() => { setSentTo(''); setError(''); }}><ArrowLeft size={15}/> Ganti username atau email</button>
  </div>;
  return <form className="auth-flow" onSubmit={send} noValidate>
    <span className="auth-badge" aria-hidden="true"><KeyRound size={26}/></span>
    <div className="auth-copy"><h3>Lupa password?</h3><p>Tenang, masukkan username atau email akunmu. Kami kirim link untuk membuat password baru.</p></div>
    <Field label="Username atau email"><Input value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="contoh: rama" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus/></Field>
    {target && <div className="auth-dest"><Mail size={16} aria-hidden="true"/><span>Link akan dikirim ke <b>{target}</b></span></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <Button className="full" disabled={busy}>{busy ? 'Mengirim…' : <><Send size={16}/> Kirim link reset</>}</Button>
  </form>;
}

/** The page a reset link opens (login page with ?mode=resetPassword&oobCode=…): check the link, then set the new password. */
export function ResetPasswordPanel({ code, onDone, onRequestNew }: { code: string; onDone: (email: string) => void; onRequestNew: () => void }) {
  const [state, setState] = useState<'checking' | 'ready' | 'invalid' | 'done'>('checking'), [email, setEmail] = useState(''), [problem, setProblem] = useState('');
  const [password, setPassword] = useState(''), [repeat, setRepeat] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    checkResetLink(code).then(address => { if (live) { setEmail(address); setState('ready'); } }).catch(e => { if (live) { setProblem(errorText(e)); setState('invalid'); } });
    return () => { live = false; };
  }, [code]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!passwordReady(password, repeat)) return;
    setBusy(true); setError('');
    try { await finishReset(code, password); setState('done'); }
    catch (e) { if (/action-code/.test(codeOf(e))) { setProblem(errorText(e)); setState('invalid'); } else setError(errorText(e)); }
    finally { setBusy(false); }
  }
  if (state === 'checking') return <div className="auth-flow is-center" role="status"><span className="auth-badge is-busy" aria-hidden="true"><LoaderCircle size={26}/></span><div className="auth-copy"><h2>Memeriksa link…</h2><p>Sebentar, ya.</p></div></div>;
  if (state === 'invalid') return <div className="auth-flow is-center"><span className="auth-badge tone-rose" aria-hidden="true"><CircleX size={26}/></span><div className="auth-copy"><h2>Link tidak bisa dipakai</h2><p>{problem}</p></div><div className="auth-actions"><Button type="button" className="full" onClick={onRequestNew}><Send size={16}/> Minta link baru</Button><Button type="button" variant="secondary" className="full" onClick={() => onDone('')}>Kembali ke halaman masuk</Button></div></div>;
  if (state === 'done') return <div className="auth-flow is-center"><span className="auth-badge tone-green is-pulse" aria-hidden="true"><CircleCheck size={26}/></span><div className="auth-copy"><h2>Password sudah diganti</h2><p>Sekarang masuk dengan password barumu{email ? <> untuk <b>{email}</b></> : null}.</p></div><Button type="button" className="full" onClick={() => onDone(email)}>Masuk sekarang</Button></div>;
  return <form className="auth-flow" onSubmit={submit}>
    <span className="auth-badge" aria-hidden="true"><LockKeyhole size={26}/></span>
    <div className="auth-copy"><p className="eyebrow ink">ATUR ULANG PASSWORD</p><h2>Buat password baru</h2><p>Untuk akun <b>{email}</b>.</p></div>
    <input type="text" name="username" autoComplete="username" value={email} readOnly hidden/>
    <Field label="Password baru"><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" placeholder="Minimal 8 karakter" autoFocus/></Field>
    <PasswordStrength value={password}/>
    <Field label="Ulangi password baru"><PasswordInput value={repeat} onChange={setRepeat} autoComplete="new-password" placeholder="Ketik sekali lagi"/></Field>
    <RepeatHint value={password} repeat={repeat}/>
    {error && <p className="form-error" role="alert">{error}</p>}
    <Button className="full" disabled={busy || !passwordReady(password, repeat)}>{busy ? 'Menyimpan…' : <><Check size={16}/> Simpan password baru</>}</Button>
    <button type="button" className="link-button auth-back" onClick={() => onDone('')}><ArrowLeft size={15}/> Batal, kembali ke halaman masuk</button>
  </form>;
}

/** Pengaturan → Keamanan: change the password, or get a reset link when the current one is forgotten. */
export function PasswordCard({ user, notify }: { user: User | null; notify: (message: string) => void }) {
  const [current, setCurrent] = useState(''), [next, setNext] = useState(''), [repeat, setRepeat] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [sent, setSent] = useState(''), [sending, setSending] = useState(false);
  const email = user?.email || '', ready = Boolean(current) && passwordReady(next, repeat, current);
  const edit = (set: (value: string) => void) => (value: string) => { set(value); setError(''); };
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!user || !ready) return;
    setBusy(true); setError('');
    try { await changePassword(user, current, next); setCurrent(''); setNext(''); setRepeat(''); notify('Password berhasil diganti.'); }
    catch (e) { setError(/invalid-credential|wrong-password/.test(codeOf(e)) ? 'Password saat ini salah.' : errorText(e)); }
    finally { setBusy(false); }
  }
  async function sendLink() {
    if (!email) return; setSending(true); setError('');
    try { setSent(await forgotPassword(email)); } catch (e) { setError(errorText(e)); } finally { setSending(false); }
  }
  return <form className="set-card pw-card" onSubmit={submit}>
    <div className="pw-card-head"><span className="auth-badge is-small" aria-hidden="true"><KeyRound size={20}/></span><div><h3>Password</h3><p>Ganti password untuk masuk ke <b>{email}</b>.</p></div></div>
    <input type="text" name="username" autoComplete="username" value={email} readOnly hidden/>
    <Field label="Password saat ini"><PasswordInput value={current} onChange={edit(setCurrent)} autoComplete="current-password"/></Field>
    <Field label="Password baru"><PasswordInput value={next} onChange={edit(setNext)} autoComplete="new-password" placeholder="Minimal 8 karakter"/></Field>
    {next && <PasswordStrength value={next} previous={current || undefined}/>}
    <Field label="Ulangi password baru"><PasswordInput value={repeat} onChange={edit(setRepeat)} autoComplete="new-password"/></Field>
    <RepeatHint value={next} repeat={repeat}/>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="settings-actions"><Button type="submit" disabled={busy || !ready}><LockKeyhole size={16}/> {busy ? 'Menyimpan…' : 'Ganti password'}</Button></div>
    <div className={`pw-forgot ${sent ? 'is-sent' : ''}`}>{sent
      ? <p><MailCheck size={16} aria-hidden="true"/><span>Link reset sudah dikirim ke <b>{maskEmail(sent)}</b>. Cek email, termasuk folder Spam.</span></p>
      : <p><span>Lupa password saat ini?</span><button type="button" className="link-button" disabled={sending || !email} onClick={() => void sendLink()}>{sending ? 'Mengirim…' : 'Kirim link reset ke email'}</button></p>}</div>
  </form>;
}
