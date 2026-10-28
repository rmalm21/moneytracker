'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Pencil, Plus, Share2, Trash2, UserCheck, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { Confirm } from './ui/alert-dialog';
import { Field, Input } from './fields';
import { ACCESS_SINCE, ONLINE_WITHIN, watchGrants, approveRequest, createCode, deleteCode, dismissRequest, listCodes, revokeGrant, setGrantNote, showCode, watchRequests, type AccessCode, type AccessGrant, type AccessRequest } from '@/lib/access';

const day = (d?: Date) => d ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }) : '';
const ago = (d?: Date) => { if (!d) return ''; const m = Math.round((Date.now() - d.getTime()) / 60_000); return m < 1 ? 'baru saja' : m < 60 ? `${m} menit lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : day(d); };
const statusOf = (c: AccessCode) => c.usedBy ? 'used' : c.expiresAt && c.expiresAt.getTime() < Date.now() ? 'expired' : 'open';

/** 6.1 Pengaturan › Kode akses (owner only): make a random code, share it, and see or take back who has access. */
export function AccessAdmin({ notify }: { notify: (message: string) => void }) {
  const { user } = useApp();
  const [codes, setCodes] = useState<AccessCode[] | null>(null), [grants, setGrants] = useState<AccessGrant[] | null>(null);
  const [days, setDays] = useState(7), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [fresh, setFresh] = useState(''), [copied, setCopied] = useState(false), [error, setError] = useState('');
  const [requests, setRequests] = useState<AccessRequest[] | null>(null), [working, setWorking] = useState(''), [editing, setEditing] = useState(''), [noteDraft, setNoteDraft] = useState('');
  useEffect(() => watchRequests(setRequests), []);
  useEffect(() => watchGrants(setGrants), []);
  // "Aktif sekarang" / "5 menit lalu" keep up with the clock while the list is open.
  const [, setTick] = useState(0);
  useEffect(() => { const timer = setInterval(() => setTick(n => n + 1), 30_000); return () => clearInterval(timer); }, []);
  // A request from someone who already got in (with a code) is done: tidied away.
  useEffect(() => { for (const r of requests || []) if ((grants || []).some(g => g.uid === r.uid)) void dismissRequest(r.uid).catch(() => undefined); }, [requests, grants]);
  useEffect(() => { if (fresh) document.querySelector('.access-fresh')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [fresh]);
  const load = useCallback(() => { void listCodes().then(setCodes).catch(() => setError('Daftar kode belum bisa dibuka.')); }, []);
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
  const idleDays = (g: AccessGrant) => { const t = (g.seen || g.at)?.getTime(); return t ? Math.floor((Date.now() - t) / 86_400_000) : 0; };
  const online = (g: AccessGrant) => Boolean(g.seen && Date.now() - g.seen.getTime() < ONLINE_WITHIN);
  const lastActive = (g: AccessGrant) => online(g) ? 'Aktif sekarang' : g.seen ? `Aktif ${ago(g.seen)}` : 'Belum tercatat aktif';
  const stale = (grants || []).filter(g => g.uid !== user.uid && g.code !== 'owner' && idleDays(g) >= 60);
  async function revokeStale() { for (const g of stale) await revokeGrant(g.uid).catch(() => undefined); notify(`${stale.length} akun tidak aktif sudah dicabut aksesnya.`); }
  async function saveNote(uid: string) { await setGrantNote(uid, noteDraft).catch(() => notify('Nama belum tersimpan. Coba lagi.')); setEditing(''); }
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
      <div className="pw-card-head"><span className="auth-badge is-small" aria-hidden="true"><Users size={20}/></span><div><h3>Yang punya akses{grants ? ` (${grants.length})` : ''}</h3><p>Akun yang bisa membuka Dompet Ajaib. Kamu cuma melihat email dan kapan terakhir aktif, isi catatan keuangan mereka tidak terlihat dari sini.</p></div></div>
      {stale.length > 0 && <div className="access-stale"><span>{stale.length} akun tidak aktif lebih dari 60 hari.</span><Confirm title={`Cabut akses ${stale.length} akun tidak aktif?`} description="Akun-akun itu tidak bisa membuka Dompet Ajaib lagi sampai kamu izinkan. Datanya tetap tersimpan terkunci dan tidak dibaca siapa pun, jadi tidak memakai kuota." confirmLabel="Cabut semuanya" onConfirm={() => revokeStale()}><button type="button" className="access-switch"><UserMinus size={14}/> Cabut semuanya</button></Confirm></div>}
      {grants === null ? <p className="muted">Memuat…</p> : <ul className="access-people">{grants.map(g => {
        const me = g.uid === user.uid, idle = !me && idleDays(g) >= 30, name = g.note || (g.email || 'Tanpa email').split('@')[0];
        return <li key={g.uid} className={`access-person ${idle ? 'is-idle' : ''}`}>
          <span className="access-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}{online(g) && <i className="access-online"/>}</span>
          {editing === g.uid
            ? <form className="access-note-edit" onSubmit={e => { e.preventDefault(); void saveNote(g.uid); }}><Input value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Nama, misalnya Dina" maxLength={60} autoFocus/><Button type="submit">Simpan</Button><button type="button" className="icon-button" aria-label="Batal" onClick={() => setEditing('')}><X size={16}/></button></form>
            : <div className="access-person-main">
              <div className="access-person-top"><b>{name}</b>{me && <span className="access-kind is-old">Kamu</span>}{idle && <span className="access-kind is-idle">Tidak aktif</span>}</div>
              <small className="access-person-email">{g.email}</small>
              <small className="access-person-meta"><span className={online(g) ? 'access-now' : undefined}>{lastActive(g)}</span> · {g.code === 'owner' ? 'Pemilik' : g.code === 'approved' ? 'Diizinkan langsung' : `Kode ${showCode(g.code)}`}</small>
            </div>}
          {editing !== g.uid && <div className="access-person-actions">
            <button type="button" className="icon-button" aria-label={`Ubah nama ${g.email}`} title="Ubah nama" onClick={() => { setEditing(g.uid); setNoteDraft(g.note || ''); }}><Pencil size={15}/></button>
            {!me && <Confirm title={`Cabut akses ${g.note || g.email || 'akun ini'}?`} description="Akun itu langsung tidak bisa membuka Dompet Ajaib, dan di layarnya muncul pemberitahuan. Datanya tidak dihapus. Kamu bisa mengizinkannya lagi kapan saja." confirmLabel="Cabut akses" onConfirm={() => revoke(g)}><button type="button" className="icon-button access-revoke-icon" aria-label={`Cabut akses ${g.email}`} title="Cabut akses"><UserMinus size={15}/></button></Confirm>}
          </div>}
        </li>; })}</ul>}
    </div>
  </div>;
}
