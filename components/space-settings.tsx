'use client';
/**
 * 9.0 Pengaturan → Dompet Bersama: make a Ruang Bersama, join one with a code, and (inside one) its name, colour and
 * period, members, invite code, requests to join, leaving and deleting. Rules for all of it: firestore.rules.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Clock, Copy, History, LogOut, Plus, RotateCcw, Share2, Trash2, UserPlus, X } from 'lucide-react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { Confirm } from './ui/alert-dialog';
import { Field, Input } from './fields';
import { Emoji } from './emoji';
import { SPACE_COLORS, SPACE_EMOJIS } from '@/lib/space-look';
import { ACTIVITY_DAYS, markRestored, restorable, subscribeActivity, tidyActivity, type Activity } from '@/lib/space-activity';
import { upsertTransaction } from '@/lib/firestore';
import { spaceKey } from '@/lib/space-key';
import { rupiah } from '@/lib/accounting';
import { balances } from '@/lib/space-math';
import {
  MAX_MEMBERS, MAX_SPACES, acceptRequest, cancelInvite, cancelRequest, createInvite, createSpace, declineRequest, deleteSpace,
  forgetRequest, formatCode, isMember, leaveSpace, readInvite, requestJoin, requestWaiting, subscribeRequests, updateSpace,
  type Account, type Space, type SpaceInvite, type SpaceRequest,
} from '@/lib/spaces';

const time = (ms: number) => new Date(ms).toLocaleString('id-ID', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

function useAccount(): Account | null {
  const { account, personalProfile } = useApp();
  if (!account) return null;
  const email = account.email || '';
  return { uid: account.uid, email, name: (personalProfile?.displayName || account.displayName || email.split('@')[0] || 'Anggota').slice(0, 60) };
}

function Looks({ emoji, color, onEmoji, onColor }: { emoji: string; color: string; onEmoji: (e: string) => void; onColor: (c: string) => void }) {
  return <>
    <div className="field"><span>Ikon</span><div className="sp-emojis" role="radiogroup" aria-label="Ikon ruang">{SPACE_EMOJIS.map(e => <button type="button" key={e} role="radio" aria-checked={emoji === e} className={emoji === e ? 'on' : ''} onClick={() => onEmoji(e)}><Emoji e={e}/></button>)}</div></div>
    <div className="field"><span>Warna</span><div className="sp-colors" role="radiogroup" aria-label="Warna ruang">{SPACE_COLORS.map(c => <button type="button" key={c.key} role="radio" aria-checked={color === c.key} aria-label={c.label} title={c.label} className={color === c.key ? 'on' : ''} style={{ ['--sw' as string]: c.light, ['--sw-dark' as string]: c.dark }} onClick={() => onColor(c.key)}>{color === c.key && <Check size={14}/>}</button>)}</div><small>Warna ini jadi warna aksen saat ruang dibuka, supaya kelihatan sedang di mode Bersama.</small></div>
  </>;
}

const verbs: Record<string, string> = { add: 'menambah', edit: 'mengubah', delete: 'menghapus', restore: 'mengembalikan' };
const whenText = (a: Activity) => a.at ? a.at.toDate().toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'baru saja';
/** Riwayat ruang: the last 30 days of added, changed and deleted transactions; a deleted one can be put back. */
function SpaceHistory({ space, notify }: { space: Space; notify: (m: string) => void }) {
  const me = useAccount();
  const [list, setList] = useState<Activity[]>([]), [all, setAll] = useState(false), [busy, setBusy] = useState('');
  useEffect(() => subscribeActivity(space.id, setList), [space.id]);
  useEffect(() => { void tidyActivity(space.id); }, [space.id]);
  if (!me) return null;
  async function restore(a: Activity) {
    if (!a.before) return; setBusy(a.id);
    try { await upsertTransaction(spaceKey(space.id), restorable(a.before)); await markRestored(space.id, a.id, me!.uid); notify(`“${a.title || 'Transaksi'}” dikembalikan.`); }
    catch (e) { notify((e as Error).message || 'Belum bisa dikembalikan.'); } finally { setBusy(''); }
  }
  const shown = all ? list : list.slice(0, 8);
  return <div className="set-card sp-history">
    <h3><History size={18}/> Riwayat ruang</h3>
    <p className="muted">Siapa menambah, mengubah, atau menghapus transaksi selama {ACTIVITY_DAYS} hari terakhir. Transaksi yang dihapus bisa dikembalikan.</p>
    {!list.length ? <p className="muted">Belum ada perubahan.</p> : <ul>{shown.map(a => <li key={a.id} className={`sp-act is-${a.kind}`}>
      <span className="sp-act-text"><b>{a.by === me.uid ? 'Kamu' : a.byName}</b> {verbs[a.kind] || a.kind} <span>{a.title || 'transaksi'}</span> · {rupiah(a.amount)}<small>{whenText(a)}{a.date ? ` · tanggal ${a.date.slice(8)}/${a.date.slice(5, 7)}` : ''}{a.restoredBy ? ` · sudah dikembalikan${a.restoredBy === me.uid ? ' olehmu' : ''}` : ''}</small></span>
      {a.kind === 'delete' && a.before?.walletId && !a.before.memberFlow && !a.restoredBy && <Button className="small" variant="secondary" disabled={Boolean(busy)} onClick={() => void restore(a)}><RotateCcw size={14}/> {busy === a.id ? 'Mengembalikan…' : 'Kembalikan'}</Button>}
    </li>)}</ul>}
    {list.length > 8 && <button type="button" className="link-button" onClick={() => setAll(v => !v)}>{all ? 'Tampilkan lebih sedikit' : `Lihat semua (${list.length})`}</button>}
  </div>;
}

/** Inside a space: settings, members, invite, requests, leave or delete. */
function CurrentSpace({ space, notify }: { space: Space; notify: (m: string) => void }) {
  const me = useAccount();
  const { switchTo } = useApp();
  const [name, setName] = useState(space.name), [emoji, setEmoji] = useState(space.emoji || '🏠'), [color, setColor] = useState(space.color || 'rose'), [day, setDay] = useState(space.salaryCycleStartDay || 1);
  const [requests, setRequests] = useState<SpaceRequest[]>([]), [busy, setBusy] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState(0);
  useEffect(() => { setName(space.name); setEmoji(space.emoji || '🏠'); setColor(space.color || 'rose'); setDay(space.salaryCycleStartDay || 1); }, [space.id, space.name, space.emoji, space.color, space.salaryCycleStartDay]);
  useEffect(() => subscribeRequests(space.id, setRequests), [space.id]);
  if (!me) return null;
  const dirty = name.trim() !== space.name || emoji !== (space.emoji || '🏠') || color !== (space.color || 'rose') || day !== (space.salaryCycleStartDay || 1);
  const invite = space.invite && space.invite.expiresAt?.toMillis?.() > Date.now() ? space.invite : null;
  const full = space.memberIds.length >= MAX_MEMBERS, last = space.memberIds.length === 1;
  // Leaving with something still to pay back (either way): said first.
  const nameOf = (uid: string) => uid === me.uid ? 'kamu' : space.members[uid]?.name || 'anggota';
  const open = balances(space).filter(b => b.from === me.uid || b.to === me.uid).map(b => `${nameOf(b.from)} perlu mengganti ${nameOf(b.to)} ${rupiah(b.amount)}`);
  async function run(key: string, task: () => Promise<unknown>, done?: string) {
    setBusy(key); setError('');
    try { await task(); if (done) notify(done); } catch (e) { setError((e as Error).message || 'Belum berhasil. Coba lagi.'); } finally { setBusy(''); }
  }
  const message = invite ? `Gabung ke Dompet Bersama “${space.name}” di Dompet Ajaib, yuk. Buka Pengaturan → Dompet Bersama → Gabung pakai kode, lalu masukkan kode ${formatCode(invite.code)} (berlaku 24 jam, sekali pakai).` : '';
  const members = space.memberIds.map(id => ({ id, ...space.members[id] }));
  const former = Object.entries(space.formerMembers || {});
  return <div className="sp-current">
    <div className="set-card">
      <h3><Emoji e={space.emoji || '🏠'}/> {space.name}</h3>
      <p>Catatan ruang ini terlihat dan bisa diubah oleh semua anggotanya. Catatan Pribadi tiap orang tetap tidak terlihat.</p>
      <form className="form-stack" onSubmit={e => { e.preventDefault(); void run('save', () => updateSpace(space.id, { name: name.trim(), emoji, color, salaryCycleStartDay: Math.min(31, Math.max(1, Math.round(day) || 1)) }), 'Pengaturan ruang disimpan.'); }}>
        <Field label="Nama ruang"><Input value={name} maxLength={40} onChange={e => setName(e.target.value)} required/></Field>
        <Looks emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor}/>
        <Field label="Periode mulai tanggal" hint="Dipakai untuk siklus anggaran dan Beranda ruang ini, misalnya tanggal gajian bersama."><Input type="number" min={1} max={31} value={day} onChange={e => setDay(Number(e.target.value))}/></Field>
        {dirty && <Button type="submit" disabled={busy === 'save'}>{busy === 'save' ? 'Menyimpan…' : 'Simpan'}</Button>}
      </form>
    </div>

    <div className="set-card">
      <h3>Anggota · {space.memberIds.length}/{MAX_MEMBERS}</h3>
      <ul className="sp-members">{members.map(m => <li key={m.id}><span className="sp-avatar" aria-hidden="true">{(m.name || '?')[0].toUpperCase()}</span><span><strong>{m.name}{m.id === me.uid ? ' (kamu)' : ''}</strong>{m.email && <small>{m.email}</small>}</span></li>)}</ul>
      {former.length > 0 && <details className="sp-former"><summary>Pernah jadi anggota ({former.length})</summary><ul>{former.map(([id, f]) => <li key={id}>{f.name} <small>(sudah keluar)</small></li>)}</ul></details>}

      {requests.length > 0 && <div className="sp-requests" role="region" aria-label="Minta bergabung">
        <h4>Minta bergabung</h4>
        {requests.map(r => <div className="sp-request" key={r.uid}>
          <span><strong>{r.name}</strong><small>{r.email}</small></span>
          <div className="sp-request-actions">
            <Button className="small" disabled={Boolean(busy) || full} onClick={() => void run(`ok-${r.uid}`, () => acceptRequest(space, r), `${r.name} sekarang anggota ${space.name}.`)}><Check size={15}/> Terima</Button>
            <Button className="small" variant="secondary" disabled={Boolean(busy)} onClick={() => void run(`no-${r.uid}`, () => declineRequest(space.id, r.uid), `Permintaan ${r.name} ditolak.`)}><X size={15}/> Tolak</Button>
          </div>
        </div>)}
      </div>}

      <div className="sp-invite">
        <h4>Undang anggota</h4>
        {full ? <p className="muted">Ruang ini sudah {MAX_MEMBERS} orang, jumlah paling banyak.</p>
          : invite ? <>
            <p className="sp-code" aria-label={`Kode undangan ${invite.code.split('').join(' ')}`}>{formatCode(invite.code)}</p>
            <p className="muted"><Clock size={13}/> Berlaku sampai {time(invite.expiresAt.toMillis())}, sekali pakai. Setelah kode dipakai, kamu atau anggota lain perlu menekan Terima.</p>
            <div className="toolbar-row">
              <Button className="small" variant="secondary" onClick={() => void navigator.clipboard?.writeText(formatCode(invite.code)).then(() => notify('Kode disalin.'), () => notify('Belum bisa menyalin. Tulis saja kodenya.'))}><Copy size={15}/> Salin</Button>
              {typeof navigator !== 'undefined' && 'share' in navigator && <Button className="small" variant="secondary" onClick={() => void navigator.share({ text: message }).catch(() => {})}><Share2 size={15}/> Bagikan</Button>}
              <Button className="small" variant="secondary" disabled={Boolean(busy)} onClick={() => void run('cancel', () => cancelInvite(space), 'Kode undangan dibatalkan.')}><X size={15}/> Batalkan</Button>
            </div>
          </> : <>
            <p className="muted">Buat kode, lalu kirim ke pasangan atau keluargamu. Mereka masukkan kodenya dari akun Dompet Ajaib mereka sendiri.</p>
            <Button className="small" disabled={Boolean(busy)} onClick={() => void run('invite', () => createInvite(me, space))}><UserPlus size={15}/> {busy === 'invite' ? 'Membuat…' : 'Buat kode undangan'}</Button>
          </>}
      </div>
    </div>

    <SpaceHistory space={space} notify={notify}/>
    <div className="set-card sp-danger">
      {!last ? <Confirm title={`Keluar dari ${space.name}?`} description={`${open.length ? `Masih ada yang belum lunas: ${open.join('; ')}. Sebaiknya lunasi dulu. ` : ''}Catatan yang pernah kamu buat tetap ada di ruang ini dengan namamu. Catatan Pribadi-mu tidak tersentuh. Untuk kembali, kamu perlu kode undangan baru.`} confirmLabel="Ya, keluar" onConfirm={() => run('leave', async () => { await leaveSpace(me, space); switchTo(null); }, `Kamu sudah keluar dari ${space.name}.`)}>
        <button type="button" className="settings-logout"><LogOut size={18}/> Keluar dari ruang ini</button>
      </Confirm>
        : <Confirm title={`Hapus ${space.name}?`} description="Kamu anggota terakhir. Semua catatan di ruang ini (transaksi, dompet, anggaran, kategori) akan dihapus permanen. Catatan Pribadi-mu tidak tersentuh." confirmLabel="Hapus permanen" onConfirm={() => run('delete', async () => { switchTo(null); await deleteSpace(me, space, setProgress); }, `${space.name} sudah dihapus.`)}>
          <button type="button" className="settings-logout"><Trash2 size={18}/> {busy === 'delete' ? `Menghapus… (${progress})` : 'Hapus ruang ini'}</button>
        </Confirm>}
      {!last && <small className="muted">Ruang hanya bisa dihapus oleh anggota terakhir, supaya satu orang tidak menghapus catatan semua orang.</small>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

function JoinWithCode({ notify }: { notify: (m: string) => void }) {
  const me = useAccount();
  const { personalProfile, spaces } = useApp();
  const [code, setCode] = useState(''), [found, setFound] = useState<SpaceInvite | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  if (!me) return null;
  async function check() { setBusy(true); setError(''); setFound(null); const r = await readInvite(code); setBusy(false); if ('error' in r) setError(r.error); else if (spaces.some(s => s.id === r.invite.spaceId)) setError(`Kamu sudah anggota ${r.invite.spaceName}.`); else setFound(r.invite); }
  async function join() { if (!found || !me) return; setBusy(true); setError(''); try { await requestJoin(me, found, personalProfile?.spaceRequests); notify(`Permintaan terkirim. Tunggu ${found.inviterName} atau anggota lain menekan Terima.`); setFound(null); setCode(''); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <div className="set-card">
    <h3>Gabung pakai kode</h3>
    <p>Masukkan kode undangan dari anggota ruang. Setelah itu mereka perlu menekan Terima.</p>
    <form className="sp-join" onSubmit={e => { e.preventDefault(); void check(); }}>
      <Input value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setFound(null); setError(''); }} placeholder="ABCDE-FGH23" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label="Kode undangan" maxLength={14}/>
      <Button type="submit" variant="secondary" disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length < 10}>Cek kode</Button>
    </form>
    {found && <div className="notice sp-found"><p><b>{found.spaceName}</b> · diundang oleh {found.inviterName}</p><p className="muted">Anggota ruang akan melihat nama dan email akunmu. Catatan Pribadi-mu tetap tidak terlihat.</p><Button className="small" disabled={busy} onClick={() => void join()}>{busy ? 'Mengirim…' : 'Minta bergabung'}</Button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

function NewSpace({ notify, onDone }: { notify: (m: string) => void; onDone: () => void }) {
  const me = useAccount();
  const { space, data, personalProfile, switchTo } = useApp();
  const [name, setName] = useState('Rumah'), [emoji, setEmoji] = useState('🏠'), [color, setColor] = useState('rose'), [day, setDay] = useState(personalProfile?.salaryCycleStartDay || 1), [wallet, setWallet] = useState('Kas Bersama'), [cats, setCats] = useState<'mine' | 'starter'>(space ? 'starter' : 'mine'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!me) return null;
  async function create() {
    setBusy(true); setError('');
    try {
      const id = await createSpace(me!, { name, emoji, color, salaryCycleStartDay: day, wallet, categories: cats === 'mine' && !space ? data.categories : 'starter' });
      switchTo(id); notify(`${name.trim()} siap. Undang pasangan atau keluargamu lewat kode undangan.`); onDone();
    } catch (e) { setError((e as Error).message || 'Ruang belum berhasil dibuat.'); } finally { setBusy(false); }
  }
  return <form className="set-card form-stack" onSubmit={e => { e.preventDefault(); void create(); }}>
    <h3>Ruang baru</h3>
    <Field label="Nama ruang"><Input value={name} maxLength={40} onChange={e => setName(e.target.value)} required placeholder="Misalnya Rumah"/></Field>
    <Looks emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor}/>
    <Field label="Periode mulai tanggal" hint="Misalnya tanggal gajian bersama. Bisa diubah nanti."><Input type="number" min={1} max={31} value={day} onChange={e => setDay(Number(e.target.value))}/></Field>
    <Field label="Dompet pertama" hint="Misalnya kas rumah atau rekening bersama. Dompet lain bisa ditambah di menu Dompet."><Input value={wallet} maxLength={40} onChange={e => setWallet(e.target.value)}/></Field>
    <div className="field"><span>Kategori</span><div className="sp-choice">
      {!space && <label><input type="radio" name="sp-cats" checked={cats === 'mine'} onChange={() => setCats('mine')}/> Salin kategoriku</label>}
      <label><input type="radio" name="sp-cats" checked={cats === 'starter' || Boolean(space)} onChange={() => setCats('starter')}/> Pakai kategori bawaan</label>
    </div></div>
    <div className="toolbar-row"><Button type="button" variant="secondary" onClick={onDone}>Batal</Button><Button type="submit" disabled={busy}>{busy ? 'Membuat…' : 'Buat ruang'}</Button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}

export function SpaceSettings({ notify }: { notify: (m: string) => void }) {
  const me = useAccount();
  const { space, spaces, spacesReady, switchTo, personalProfile } = useApp();
  const [creating, setCreating] = useState(false);
  const pending = personalProfile?.spaceRequests || {};
  const checked = useRef('');
  // Requests sent from here: joined (the space shows up) or not accepted (the request is gone).
  useEffect(() => {
    if (!me || !spacesReady) return;
    const key = JSON.stringify([Object.keys(pending), spaces.map(s => s.id)]);
    if (checked.current === key) return; checked.current = key;
    for (const [id, p] of Object.entries(pending)) {
      if (spaces.some(s => s.id === id)) { void forgetRequest(me.uid, id, pending).then(() => notify(`Kamu sudah bergabung ke ${p.name}. Buka lewat tombol Bersama di atas.`)).catch(() => {}); continue; }
      void requestWaiting(me.uid, id).then(async waiting => { if (waiting || await isMember(id)) return; await forgetRequest(me.uid, id, pending); notify(`Permintaan gabung ke ${p.name} tidak diterima atau sudah dibatalkan.`); }).catch(() => {});
    }
  }, [me?.uid, spacesReady, spaces, pending]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return null;
  return <div className="set-form sp-settings">
    <div className="notice">Dompet Bersama adalah catatan terpisah yang kamu isi bersama pasangan atau keluarga, sampai {MAX_MEMBERS} orang per ruang. Pindah lewat tombol <b>Pribadi | Bersama</b> di atas. Catatan Pribadi-mu tidak pernah terlihat oleh anggota ruang.</div>
    {space && <CurrentSpace space={space} notify={notify}/>}
    <div className="set-card">
      <h3>Ruangmu</h3>
      {!spaces.length ? <p className="muted">Belum ada. Buat ruang baru, atau gabung pakai kode dari pasanganmu.</p>
        : <ul className="sp-list">{spaces.map(s => <li key={s.id}><span className="sp-pick-icon"><Emoji e={s.emoji || '🏠'}/></span><span className="sp-pick-text"><strong>{s.name}</strong><small>{s.memberIds.length} anggota</small></span>{space?.id === s.id ? <span className="sp-open">Sedang dibuka</span> : <Button className="small" variant="secondary" onClick={() => switchTo(s.id)}>Buka</Button>}</li>)}
          {space && <li><span className="sp-pick-icon">🔒</span><span className="sp-pick-text"><strong>Pribadi</strong><small>Hanya kamu</small></span><Button className="small" variant="secondary" onClick={() => switchTo(null)}>Buka</Button></li>}</ul>}
      {Object.entries(pending).map(([id, p]) => <div className="sp-pending" key={id}><Clock size={15}/><span>Menunggu diterima di <b>{p.name}</b> (diundang {p.by})</span><button type="button" className="link-button" onClick={() => void cancelRequest(me.uid, id, pending).then(() => notify('Permintaan dibatalkan.'))}>Batalkan</button></div>)}
      {!creating && (spaces.length < MAX_SPACES ? <Button className="small" onClick={() => setCreating(true)}><Plus size={15}/> Buat ruang baru</Button> : <p className="muted">Paling banyak {MAX_SPACES} ruang per akun.</p>)}
    </div>
    {creating && <NewSpace notify={notify} onDone={() => setCreating(false)}/>}
    <JoinWithCode notify={notify}/>
  </div>;
}
