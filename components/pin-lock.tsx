'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Delete, KeyRound, Lock, LockKeyhole, Sparkles } from 'lucide-react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { Field, Select } from './fields';
import { logout } from '@/lib/auth';
import { saveProfile } from '@/lib/firestore';
import { passwordVerified, attempts, checkPin, clearHidden, consumeFreshLogin, hashPin, hiddenFor, isUnlocked, markHidden, newPinSalt, recordAttempt, setUnlocked, validPin } from '@/lib/pin';

/** Decides when the app is locked: on open, and after being in the background longer than the chosen time. */
export function useAppLock() {
  const { user, profile } = useApp();
  const uid = user?.uid || '', enabled = Boolean(profile?.pinHash && profile?.pinSalt), after = (profile?.pinLockAfter ?? 1) * 60000;
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!uid) return;
    if (consumeFreshLogin()) setUnlocked(uid, true);
    if (!enabled) { setLocked(false); return; }
    setLocked(!isUnlocked(uid));
    const visibility = () => {
      if (document.visibilityState === 'hidden') { markHidden(uid); return; }
      if (hiddenFor(uid) > after) { setUnlocked(uid, false); setLocked(true); }
      clearHidden(uid);
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [uid, enabled, after]);
  const unlock = useCallback(() => { setUnlocked(uid, true); setLocked(false); }, [uid]);
  const lock = useCallback(() => { setUnlocked(uid, false); setLocked(true); }, [uid]);
  return { enabled, locked: enabled && locked, unlock, lock };
}

/** Four dots and a number pad. `onComplete` receives the 4 digits and returns an error text, or '' when accepted. */
function PinPad({ onComplete, disabledUntil = 0 }: { onComplete: (pin: string) => Promise<string>; disabledUntil?: number }) {
  const [pin, setPin] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [shake, setShake] = useState(false), [now, setNow] = useState(Date.now());
  const waiting = disabledUntil > now;
  useEffect(() => { if (!waiting) return; const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, [waiting]);
  const current = useRef('');
  const press = useCallback((digit: string) => {
    if (busy || waiting || current.current.length >= 4) return;
    setError('');
    const next = current.current + digit;
    current.current = next; setPin(next);
    if (next.length < 4) return;
    setBusy(true);
    // Let the fourth dot fill before checking.
    setTimeout(() => void onComplete(next).then(message => { setBusy(false); if (message) { setError(message); setShake(true); setTimeout(() => setShake(false), 380); } current.current = ''; setPin(''); }), 120);
  }, [busy, waiting, onComplete]);
  const back = () => { current.current = current.current.slice(0, -1); setPin(current.current); };
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (/^\d$/.test(event.key)) press(event.key); else if (event.key === 'Backspace') back(); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [press]);
  return <div className="pin-pad">
    <div className={`pin-dots ${shake ? 'is-shaking' : ''}`} aria-label={`${pin.length} dari 4 angka`}>{[0, 1, 2, 3].map(i => <i key={i} className={i < pin.length ? 'filled' : ''}/>)}</div>
    <p className={`pin-message ${error || waiting ? 'is-error' : ''}`} role="status">{waiting ? `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil((disabledUntil - now) / 1000)} detik.` : error || ' '}</p>
    <div className="pin-keys">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key, i) => key === '' ? <span key="blank"/> : <button type="button" key={key} disabled={busy || waiting} aria-label={key === 'del' ? 'Hapus angka' : key} onClick={() => key === 'del' ? back() : press(key)}>{key === 'del' ? <Delete size={22}/> : key}</button>)}</div>
  </div>;
}

export function PinLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { user, profile } = useApp();
  const uid = user?.uid || '';
  const [until, setUntil] = useState(() => attempts(uid).until);
  const verify = useCallback(async (pin: string) => {
    if (!profile?.pinHash || !profile.pinSalt) { onUnlock(); return ''; }
    const ok = await checkPin(pin, profile.pinSalt, profile.pinHash);
    const state = recordAttempt(uid, ok);
    if (ok) { onUnlock(); return ''; }
    setUntil(state.until);
    return state.until ? '' : `PIN salah. Sisa ${5 - state.count} percobaan sebelum dijeda.`;
  }, [profile?.pinHash, profile?.pinSalt, uid, onUnlock]);
  return <main className="pin-screen">
    <div className="pin-card">
      <span className="brand-mark pin-brand"><Sparkles size={22}/></span>
      <h1>Halo, {profile?.displayName || profile?.username || 'teman'}</h1>
      <p className="muted"><Lock size={14}/> Masukkan PIN untuk membuka Dompet Ajaib</p>
      <PinPad onComplete={verify} disabledUntil={until}/>
      <button type="button" className="link-button pin-forgot" onClick={() => void logout()}>Lupa PIN? Keluar & masuk dengan password</button>
    </div>
  </main>;
}

/** Settings panel: turn the PIN on, change it, choose the auto-lock time, or turn it off. */
export function PinSettings({ notify, onLockNow }: { notify: (message: string) => void; onLockNow?: () => void }) {
  const { user, profile } = useApp();
  const enabled = Boolean(profile?.pinHash);
  const [mode, setMode] = useState<null | 'set' | 'change' | 'off'>(null);
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('new');
  const [first, setFirst] = useState('');
  function begin(next: 'set' | 'change' | 'off') { setMode(next); setFirst(''); setStep(next === 'set' || next === 'change' && passwordVerified() ? 'new' : 'current'); }
  const complete = useCallback(async (pin: string) => {
    if (!user || !profile) return 'Sesi belum siap.';
    if (!validPin(pin)) return 'PIN harus 4 angka.';
    if (step === 'current') {
      if (!profile.pinHash || !profile.pinSalt || !(await checkPin(pin, profile.pinSalt, profile.pinHash))) return 'PIN saat ini salah.';
      if (mode === 'off') { await saveProfile(user.uid, { pinHash: null, pinSalt: null }); setMode(null); notify('PIN aplikasi dinonaktifkan.'); return ''; }
      setStep('new'); return '';
    }
    if (step === 'new') { if (/^(\d)\1{3}$/.test(pin) || pin === '1234') return 'Pilih PIN yang tidak mudah ditebak.'; setFirst(pin); setStep('confirm'); return ''; }
    if (pin !== first) { setStep('new'); setFirst(''); return 'PIN tidak cocok. Ulangi dari awal.'; }
    const salt = newPinSalt();
    await saveProfile(user.uid, { pinHash: await hashPin(pin, salt), pinSalt: salt, pinLockAfter: profile.pinLockAfter ?? 1 });
    setUnlockedSafe(user.uid);
    setMode(null); notify(mode === 'change' ? 'PIN aplikasi diganti.' : 'PIN aplikasi aktif.');
    return '';
  }, [user, profile, step, first, mode, notify]);
  const prompt = step === 'current' ? 'Masukkan PIN saat ini' : step === 'new' ? 'Buat PIN 4 angka' : 'Ulangi PIN baru';
  return <div className="panel pin-settings">
    <h3><LockKeyhole size={18}/> PIN aplikasi</h3>
    <p className="muted">{enabled ? 'Aplikasi meminta PIN saat dibuka dan setelah ditinggal beberapa saat.' : 'Opsional. Kunci aplikasi dengan 4 angka agar orang lain tidak bisa melihat keuanganmu di perangkat ini.'}</p>
    {enabled ? <>
      <Field label="Kunci otomatis setelah"><Select value={String(profile?.pinLockAfter ?? 1)} onChange={event => { if (user) void saveProfile(user.uid, { pinLockAfter: Number(event.target.value) }).catch(() => notify('Waktu kunci otomatis belum tersimpan.')); }}><option value="0">Langsung saat aplikasi ditinggal</option><option value="1">1 menit</option><option value="5">5 menit</option><option value="15">15 menit</option></Select></Field>
      <div className="settings-actions start"><Button variant="secondary" onClick={() => begin('change')}><KeyRound size={15}/> Ganti PIN</Button>{onLockNow && <Button variant="secondary" onClick={onLockNow}><Lock size={15}/> Kunci sekarang</Button>}{passwordVerified() ? <Button variant="ghost" onClick={() => { if (user) void saveProfile(user.uid, { pinHash: null, pinSalt: null }).then(() => notify('PIN aplikasi dinonaktifkan.')); }}>Nonaktifkan PIN</Button> : <Button variant="ghost" onClick={() => begin('off')}>Nonaktifkan PIN</Button>}</div>
    </> : <div className="settings-actions start"><Button onClick={() => begin('set')}><LockKeyhole size={16}/> Aktifkan PIN</Button></div>}
    <Dialog open={mode !== null} onOpenChange={next => { if (!next) setMode(null); }}><DialogContent title={mode === 'off' ? 'Nonaktifkan PIN' : mode === 'change' ? 'Ganti PIN' : 'Aktifkan PIN'} className="pin-dialog">
      <p className="pin-prompt">{prompt}</p>
      <PinPad key={`${mode}-${step}`} onComplete={complete}/>
      {mode === 'set' && <small className="muted">Jika lupa PIN, keluar lalu masuk lagi dengan password, kemudian ganti PIN di Pengaturan.</small>}
    </DialogContent></Dialog>
  </div>;
}
const setUnlockedSafe = (uid: string) => setUnlocked(uid, true);
