'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Plus, Share2, Trash2, UserCheck, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { Confirm } from './ui/alert-dialog';
import { Field, Input } from './fields';
import { ACCESS_SINCE, approveRequest, createCode, deleteCode, dismissRequest, listCodes, listGrants, revokeGrant, showCode, watchRequests, type AccessCode, type AccessGrant, type AccessRequest } from '@/lib/access';

const day = (d?: Date) => d ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }) : '';
const ago = (d?: Date) => { if (!d) return ''; const m = Math.round((Date.now() - d.getTime()) / 60_000); return m < 1 ? 'baru saja' : m < 60 ? `${m} menit lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : day(d); };
const statusOf = (c: AccessCode) => c.usedBy ? 'used' : c.expiresAt && c.expiresAt.getTime() < Date.now() ? 'expired' : 'open';

/** 6.1 Pengaturan › Kode akses (owner only): make a random code, share it, and see or take back who has access. */
export function AccessAdmin({ notify }: { notify: (message: string) => void }) {
  const { user } = useApp();
  const [codes, setCodes] = useState<AccessCode[] | null>(null), [grants, setGrants] = useState<AccessGrant[] | null>(null);
  const [days, setDays] = useState(7), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [fresh, setFresh] = useState(''), [copied, setCopied] = useState(false), [error, setError] = useState('');
  const [requests, setRequests] = useState<AccessRequest[] | null>(null), [working, setWorking] = useState('');
  useEffect(() => watchRequests(setRequests), []);
  useEffect(() => { if (fresh) document.querySelector('.access-fresh')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [fresh]);
  const load = useCallback(() => { void listCodes().then(setCodes).catch(() => setError('Daftar kode belum bisa dibuka.')); void listGrants().then(setGrants).catch(() => undefined); }, []);
  useEffect(load, [load]);
  if (!user) return null;
  async function make(forWho = note) { setBusy(true); setError(''); try { const code = await createCode(user!, days, forWho); setFresh(code); setNote(''); setCopied(false); load(); } catch (e) { setError((e as Error).message || 'Belum berhasil membuat kode.'); } finally { setBusy(false); } }
  async function approve(r: AccessRequest) { setWorking(r.uid); try { await approveRequest(r); notify(`${r.email || 'Akun itu'} sekarang bisa masuk.`); load(); } catch { notify('Belum berhasil mengizinkan. Coba lagi.'); } finally { setWorking(''); } }
  async function dismiss(r: AccessRequest) { setWorking(r.uid); await dismissRequest(r.uid).catch(() => notify('Belum berhasil dihapus.')); setWorking(''); }
  const message = (code: string) => `Kode akses Dompet Ajaib kamu: ${showCode(code)}\nBuka https://${window.location.host}, masuk, lalu ketik kodenya. Kode ini cuma bisa dipakai sekali.`;
  async function copy(code: string) { try { await navigator.clipboard.writeText(showCode(code)); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { notify('Salin manual: ' + showCode(code)); } }
  async function share(code: string) { const text = message(code); if (navigator.share) { await navigator.share({ text }).catch(() => undefined); return; } window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener'); }
  async function removeCode(code: string) { await deleteCode(code).catch(() => notify('Kode belum bisa dihapus.')); if (fresh === code) setFresh(''); load(); }
  async function revoke(g: AccessGrant) { await revokeGrant(g.uid).then(() => notify(`Akses ${g.email || 'akun itu'} sudah dicabut. Di layarnya langsung muncul pemberitahuan.`), () => notify('Akses belum bisa dicabut. Coba lagi.')); load(); }
  const open = (codes || []).filter(c => statusOf(c) === 'open'), others = (codes || []).filter(c => statusOf(c) !== 'open').slice(0, 12);
  const waiting = (requests || []).filter(r => !(grants || []).some(g => g.uid === r.uid));
  return <div className="set-form access-admin">
    <div className={`set-card access-requests ${waiting.length ? 'has-new' : ''}`}>
      <div className="pw-card-head"><span className="auth-badge is-small" aria-hidden="true"><UserPlus size={20}/></span><div><h3>Minta akses{waiting.length ? ` (${waiting.length})` : ''}</h3><p>Orang yang sudah masuk tapi belum punya akses. Izinkan langsung, atau buatkan kode.</p></div></div>
      {requests === null ? <p className="muted">Memuat…</p> : !waiting.length ? <p className="muted">Belum ada yang minta akses.</p> :
        <ul className="access-list">{waiting.map(r => <li key={r.uid} className="access-request"><span><b>{r.email || 'Tanpa email'}</b><small>{r.since && r.since.getTime() < ACCESS_SINCE ? <span className="access-kind is-old">Pengguna lama · sejak {day(r.since)}</span> : <span className="access-kind">Akun baru</span>}{r.name ? `${r.name} · ` : ''}{ago(r.at)}{r.tries > 1 ? ` · ${r.tries}× mencoba` : ''}</small></span>
          <span className="access-request-actions"><Button type="button" onClick={() => void approve(r)} disabled={working === r.uid}><UserCheck size={15}/> Izinkan</Button><Button type="button" variant="secondary" onClick={() => void make(r.email)} disabled={busy}><KeyRound size={15}/> Kode</Button><button type="button" className="icon-button" aria-label={`Abaikan ${r.email}`} onClick={() => void dismiss(r)} disabled={working === r.uid}><X size={16}/></button></span></li>)}</ul>}
    </div>
    <div className="set-card">
      <div className="pw-card-head"><span className="auth-badge is-small" aria-hidden="true"><KeyRound size={20}/></span><div><h3>Buat kode akses</h3><p>Orang yang kamu undang masuk dulu (Google atau password), lalu mengetik kode ini. Kodenya acak dan cuma bisa dipakai sekali.</p></div></div>
      <Field label="Untuk siapa (opsional)"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="Misalnya: Dina" maxLength={60}/></Field>
      <div className="access-days" role="radiogroup" aria-label="Berlaku">{[[1, '1 hari'], [7, '7 hari'], [30, '30 hari'], [0, 'Tanpa batas']].map(([d, label]) => <button type="button" key={d} role="radio" aria-checked={days === d} className={`sb-chip ${days === d ? 'is-on' : ''}`} onClick={() => setDays(d as number)}>{label}</button>)}</div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="settings-actions start"><Button type="button" onClick={() => void make()} disabled={busy}><Plus size={16}/> {busy ? 'Membuat…' : 'Buat kode baru'}</Button></div>
      {fresh && <div className="access-fresh" role="status">
        <small>Kode baru{days ? ` · berlaku ${days} hari` : ''}</small>
        <strong>{showCode(fresh)}</strong>
        <div className="access-fresh-actions"><Button type="button" variant="secondary" onClick={() => void copy(fresh)}>{copied ? <><Check size={15}/> Tersalin</> : <><Copy size={15}/> Salin</>}</Button><Button type="button" onClick={() => void share(fresh)}><Share2 size={15}/> Bagikan</Button></div>
      </div>}
    </div>
    <div className="set-card">
      <h3>Kode yang belum dipakai</h3>
      {codes === null ? <p className="muted">Memuat…</p> : !open.length ? <p className="muted">Belum ada. Buat kode di atas kalau mau mengundang orang.</p> :
        <ul className="access-list">{open.map(c => <li key={c.code}><span><b className="access-mono">{showCode(c.code)}</b><small>{c.note ? `${c.note} · ` : ''}{c.expiresAt ? `berlaku sampai ${day(c.expiresAt)}` : 'tanpa batas waktu'}</small></span><span className="access-row-actions"><button type="button" className="icon-button" aria-label={`Bagikan ${showCode(c.code)}`} onClick={() => void share(c.code)}><Share2 size={16}/></button><button type="button" className="icon-button" aria-label={`Hapus ${showCode(c.code)}`} onClick={() => void removeCode(c.code)}><Trash2 size={16}/></button></span></li>)}</ul>}
      {others.length > 0 && <details className="access-older"><summary>Kode lama ({others.length})</summary><ul className="access-list">{others.map(c => <li key={c.code} className={`is-${statusOf(c)}`}><span><b className="access-mono">{showCode(c.code)}</b><small>{statusOf(c) === 'used' ? `Dipakai ${c.usedEmail || 'seseorang'}${c.usedAt ? ` · ${day(c.usedAt)}` : ''}` : `Kedaluwarsa ${day(c.expiresAt)}`}{c.note ? ` · ${c.note}` : ''}</small></span><button type="button" className="icon-button" aria-label={`Hapus ${showCode(c.code)}`} onClick={() => void removeCode(c.code)}><Trash2 size={16}/></button></li>)}</ul></details>}
    </div>
    <div className="set-card">
      <div className="pw-card-head"><span className="auth-badge is-small" aria-hidden="true"><Users size={20}/></span><div><h3>Yang punya akses</h3><p>Akun yang sudah bisa membuka Dompet Ajaib. Data tiap akun tetap terpisah, kamu tidak bisa melihat isinya.</p></div></div>
      {grants === null ? <p className="muted">Memuat…</p> : <ul className="access-list">{grants.map(g => <li key={g.uid}><span><b>{g.email || 'Tanpa email'}{g.uid === user.uid ? ' (kamu)' : ''}</b><small>{g.code === 'owner' ? 'Pemilik' : g.code === 'approved' ? 'Diizinkan langsung' : `Kode ${showCode(g.code)}`}{g.at ? ` · sejak ${day(g.at)}` : ''}</small></span>{g.uid !== user.uid && <Confirm title={`Cabut akses ${g.email || 'akun ini'}?`} description="Akun itu langsung tidak bisa membuka Dompet Ajaib, dan di layarnya muncul pemberitahuan. Datanya tidak dihapus. Kamu bisa mengizinkannya lagi kapan saja." confirmLabel="Cabut akses" onConfirm={() => revoke(g)}><button type="button" className="link-button access-revoke"><UserMinus size={15}/> Cabut</button></Confirm>}</li>)}</ul>}
    </div>
  </div>;
}
