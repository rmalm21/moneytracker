'use client';
import { useState, type FormEvent } from 'react';
import { ChevronRight, CircleCheck, Download, LoaderCircle, RotateCcw, UserX } from 'lucide-react';
import { useApp } from './app-provider';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Field, Input } from './fields';
import { PasswordInput, errorText } from './password-ui';
import { deleteAccount, downloadBackup, resetAllData, wipeOrder, type DeleteProgress, type WipeProgress } from '@/lib/account';

/** Pengaturan, above "Keluar dari akun": start over with an empty account, or delete the account for good. */
type Kind = 'reset' | 'delete';

/** What is on the account right now, for the "Yang dihapus" list. */
function useRecordList() {
  const { data } = useApp();
  const rows: [number, string][] = [[data.wallets.length, 'dompet'], [data.categories.length, 'kategori'], [data.budgets.length, 'anggaran'], [data.debts.length, 'utang'], [data.receivables.length, 'piutang'], [data.claims.length, 'klaim kantor'], [data.funds.length, 'tujuan dana'], [data.recurring.length, 'jadwal rutin'], [data.wishlist.length, 'wish list'], [data.financialNotes.length, 'catatan'], [data.cycleSnapshots.length, 'riwayat siklus']];
  return ['Semua transaksi', ...rows.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`)];
}

function BackupFirst({ uid }: { uid: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  return <div className={`danger-backup ${state === 'done' ? 'is-done' : ''}`}>
    <span className="danger-backup-icon" aria-hidden="true">{state === 'done' ? <CircleCheck size={18}/> : <Download size={18}/>}</span>
    <span className="danger-backup-text"><strong>{state === 'done' ? 'Cadangan sudah diunduh' : 'Simpan cadangan dulu'}</strong><small>{state === 'error' ? 'Belum berhasil diunduh. Coba lagi.' : 'File .json ini bisa dipulihkan lewat Data & cadangan.'}</small></span>
    <Button type="button" variant="secondary" className="small" disabled={state === 'busy'} onClick={async () => { setState('busy'); try { await downloadBackup(uid); setState('done'); } catch { setState('error'); } }}>{state === 'busy' ? 'Menyiapkan…' : state === 'done' ? 'Unduh lagi' : 'Unduh'}</Button>
  </div>;
}

function Working({ tone, title, step, total, note }: { tone: 'amber' | 'rose'; title: string; step: number; total: number; note: string }) {
  return <div className="danger-progress" role="status" aria-live="polite">
    <span className={`auth-badge tone-${tone} is-busy`} aria-hidden="true"><LoaderCircle size={26}/></span>
    <strong>{title}</strong>
    <div className="danger-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={step}><i style={{ width: `${Math.max(6, Math.round(step / Math.max(1, total) * 100))}%` }}/></div>
    <small>{note}</small>
  </div>;
}

function ResetBody({ onClose, onBusy, notify }: { onClose: () => void; onBusy: (busy: boolean) => void; notify: (message: string) => void }) {
  const { user } = useApp(), records = useRecordList();
  const [preferences, setPreferences] = useState(false), [typed, setTyped] = useState(''), [progress, setProgress] = useState<WipeProgress | null>(null), [error, setError] = useState('');
  const ready = typed.trim().toUpperCase() === 'RESET';
  async function run(event: FormEvent) {
    event.preventDefault(); if (!user || !ready) return;
    setError(''); onBusy(true); setProgress({ step: 0, total: wipeOrder.length, label: '' });
    try { await resetAllData(user.uid, { preferences }, setProgress); onBusy(false); notify('Semua data sudah dihapus. Yuk, mulai lagi dari awal.'); onClose(); }
    catch (e) { onBusy(false); setProgress(null); setError(errorText(e)); }
  }
  if (progress) return <Working tone="amber" title={progress.label ? `Menghapus ${progress.label}…` : 'Menyiapkan…'} step={progress.step} total={progress.total} note={`${progress.step} dari ${progress.total} jenis data · jangan tutup aplikasi dulu`}/>;
  return <form className="danger-flow" onSubmit={run}>
    <div className="danger-hero tone-amber"><span className="auth-badge tone-amber" aria-hidden="true"><RotateCcw size={24}/></span><div><strong>Mulai lagi dari awal</strong><small>Semua catatan keuangan dihapus, lalu panduan awal muncul lagi. Akun, password, nama, dan PIN tetap.</small></div></div>
    <section className="danger-list"><h4>Yang dihapus</h4><ul>{records.map(item => <li key={item}>{item}</li>)}</ul></section>
    <label className="danger-check"><input type="checkbox" checked={preferences} onChange={e => setPreferences(e.target.checked)}/><span><strong>Kembalikan juga pengaturan ke bawaan</strong><small>Tampilan, pengingat, susunan Beranda, Insight, dan kontrol keuangan.</small></span></label>
    {user && <BackupFirst uid={user.uid}/>}
    <Field label="Ketik RESET untuk melanjutkan"><Input value={typed} onChange={e => setTyped(e.target.value)} placeholder="RESET" autoCapitalize="characters" autoComplete="off" spellCheck={false}/></Field>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Batal</Button><Button type="submit" variant="danger" disabled={!ready}><RotateCcw size={16}/> Reset semua data</Button></div>
  </form>;
}

function DeleteBody({ onClose, onBusy }: { onClose: () => void; onBusy: (busy: boolean) => void }) {
  const { user } = useApp(), records = useRecordList();
  const [password, setPassword] = useState(''), [sure, setSure] = useState(false), [progress, setProgress] = useState<DeleteProgress | null>(null), [error, setError] = useState('');
  async function run(event: FormEvent) {
    event.preventDefault(); if (!user || !password || !sure) return;
    setError(''); onBusy(true); setProgress({ stage: 'verify', step: 0, total: wipeOrder.length, label: 'password' });
    try { await deleteAccount(user, password, setProgress); }
    catch (e) { onBusy(false); setProgress(null); setError(/invalid-credential|wrong-password/.test((e as { code?: string })?.code || '') ? 'Password salah. Coba lagi.' : errorText(e)); }
  }
  if (progress) return <Working tone="rose" title={progress.stage === 'verify' ? 'Memeriksa password…' : progress.stage === 'account' ? 'Menghapus akun…' : `Menghapus ${progress.label}…`} step={progress.stage === 'verify' ? 0 : progress.step} total={progress.total} note={progress.stage === 'data' ? `${progress.step} dari ${progress.total} jenis data · jangan tutup aplikasi dulu` : 'Jangan tutup aplikasi dulu'}/>;
  return <form className="danger-flow" onSubmit={run}>
    <div className="danger-hero tone-rose"><span className="auth-badge tone-rose" aria-hidden="true"><UserX size={24}/></span><div><strong>Hapus akun permanen</strong><small><b>{user?.email}</b> dan semua datanya akan hilang. Setelah itu akun ini tidak bisa dipakai untuk masuk lagi.</small></div></div>
    <section className="danger-list"><h4>Ikut terhapus</h4><ul>{[...records, 'Pengaturan & PIN', 'Login akun ini'].map(item => <li key={item}>{item}</li>)}</ul></section>
    {user && <BackupFirst uid={user.uid}/>}
    <input type="text" name="username" autoComplete="username" value={user?.email || ''} readOnly hidden/>
    <Field label="Password akun"><PasswordInput value={password} onChange={setPassword} autoComplete="current-password" placeholder="Untuk memastikan ini kamu"/></Field>
    <label className="danger-check"><input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)}/><span><strong>Saya paham akun ini tidak bisa dipulihkan</strong><small>Data yang sudah dihapus tidak bisa dikembalikan, kecuali dari file cadangan.</small></span></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Batal</Button><Button type="submit" variant="danger" disabled={!password || !sure}><UserX size={16}/> Hapus akun permanen</Button></div>
  </form>;
}

export function AccountDangerZone({ notify }: { notify: (message: string) => void }) {
  const [kind, setKind] = useState<Kind | null>(null), [busy, setBusy] = useState(false);
  const close = () => { if (!busy) setKind(null); };
  return <>
    <section className="set-group set-danger"><h2>Reset & hapus akun</h2><div className="set-list">
      <button type="button" className="set-row" onClick={() => setKind('reset')}><span className="set-row-icon tone-orange" aria-hidden="true"><RotateCcw size={18}/></span><span className="set-row-text"><strong>Reset semua data</strong><small>Mulai dari awal, akun tetap ada</small></span><ChevronRight size={18} className="set-row-arrow" aria-hidden="true"/></button>
      <button type="button" className="set-row is-danger" onClick={() => setKind('delete')}><span className="set-row-icon tone-red" aria-hidden="true"><UserX size={18}/></span><span className="set-row-text"><strong>Hapus akun</strong><small>Permanen, beserta semua datanya</small></span><ChevronRight size={18} className="set-row-arrow" aria-hidden="true"/></button>
    </div></section>
    <Dialog open={kind === 'reset'} onOpenChange={open => { if (!open) close(); }}><DialogContent title="Reset semua data" className={`danger-dialog ${busy?'is-busy':''}`}>{kind === 'reset' && <ResetBody onClose={() => setKind(null)} onBusy={setBusy} notify={notify}/>}</DialogContent></Dialog>
    <Dialog open={kind === 'delete'} onOpenChange={open => { if (!open) close(); }}><DialogContent title="Hapus akun" className={`danger-dialog ${busy?'is-busy':''}`}>{kind === 'delete' && <DeleteBody onClose={() => setKind(null)} onBusy={setBusy}/>}</DialogContent></Dialog>
  </>;
}
