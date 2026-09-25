'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { Confirm } from './ui/alert-dialog';
import { Field, Input, Money } from './fields';
import { Emoji } from './emoji';
import { AppIcon, EmojiSearchButton, withCurrent } from './visual-identity';
import { rupiah } from '@/lib/accounting';
import { archiveOrDelete, saveRecord } from '@/lib/firestore';
import { isEmergencyFund, isKantong, kantongAmount, kantongWallets, pocketEmoji, pocketIcons } from '@/lib/pockets';
import type { Fund, Wallet } from '@/lib/types';

const short = (n: number) => n >= 1e6 ? `Rp${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} jt` : n >= 1e3 ? `Rp${Math.round(n / 1e3)} rb` : rupiah(n);
const colors = ['var(--chart-1)', 'var(--chart-3)', 'var(--chart-2)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];
const byPurpose = (a: Fund, b: Fund) => Number(isEmergencyFund(b)) - Number(isEmergencyFund(a)) || a.name.localeCompare(b.name);

export type PocketStart = { mode: 'list' } | { mode: 'form'; fundId?: string; walletId?: string };

/** Active kantong, emergency first. */
export function useKantong() {
  const { data } = useApp();
  return data.funds.filter(f => !f.isArchived && isKantong(f)).sort(byPurpose);
}

/** Row of kantong on the Dompet page: each shows its total and the wallets inside. */
export function KantongStrip({ onOpen }: { onOpen: (start: PocketStart) => void }) {
  const { data } = useApp();
  const list = useKantong();
  if (!list.length) return null;
  return <section className="kantong-strip" aria-label="Kantong">
    {list.map((k, i) => { const members = kantongWallets(k, data.wallets); const pct = k.targetAmount ? Math.min(1, k.currentAmount / k.targetAmount) : 0; return <button type="button" key={k.id} className="kantong-mini" style={{ '--pocket': colors[i % colors.length] } as CSSProperties} onClick={() => onOpen({ mode: 'form', fundId: k.id })}>
      <span className="kantong-mini-top"><Emoji e={pocketEmoji(k)}/><strong>{k.name}</strong></span>
      <b>{short(k.currentAmount)}</b>
      {k.targetAmount > 0 ? <i className="pocket-progress"><b style={{ width: `${Math.max(3, pct * 100)}%` }}/></i> : null}
      <small>{members.map(w => w.name).join(' + ') || 'Belum ada dompet'}</small>
    </button>; })}
    <button type="button" className="kantong-mini is-add" onClick={() => onOpen({ mode: 'form' })}><Plus size={18}/><span>Kantong baru</span></button>
  </section>;
}

/** Sheet to create and edit kantong: pick a name, an icon and the wallets it groups. */
export function PocketSheet({ open, onOpenChange, start = { mode: 'list' } }: { open: boolean; onOpenChange: (open: boolean) => void; start?: PocketStart }) {
  const { data, user } = useApp();
  const { track } = useNotify();
  const kantong = useKantong();
  const wallets = data.wallets.filter(w => !w.isArchived);
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [editing, setEditing] = useState<Fund | null>(null);
  const [name, setName] = useState(''), [icon, setIcon] = useState('🎯'), [kind, setKind] = useState<'emergency' | 'goal'>('goal'), [target, setTarget] = useState(0), [date, setDate] = useState(''), [picked, setPicked] = useState<string[]>([]);

  function openForm(fund?: Fund, walletId?: string) {
    const firstEmergency = !fund && !kantong.some(isEmergencyFund);
    setEditing(fund || null);
    setName(fund?.name || (firstEmergency ? 'Dana darurat' : ''));
    setIcon(fund ? pocketEmoji(fund) : firstEmergency ? '🛟' : '🎯');
    setKind(fund ? (isEmergencyFund(fund) ? 'emergency' : 'goal') : firstEmergency ? 'emergency' : 'goal');
    setTarget(fund?.targetAmount || 0); setDate(fund?.targetDate || '');
    setPicked(fund?.walletIds?.length ? fund.walletIds.filter(id => wallets.some(w => w.id === id)) : walletId ? [walletId] : []);
    setMode('form');
  }
  useEffect(() => {
    if (!open) return;
    if (start.mode === 'form') openForm(start.fundId ? data.funds.find(f => f.id === start.fundId) : undefined, start.walletId);
    else setMode('list');
    // Only when the sheet opens: later data updates must not reset what the user is typing.
  }, [open]);

  const ownerOf = (walletId: string) => kantong.find(k => k.id !== editing?.id && k.walletIds!.includes(walletId));
  const toggle = (id: string) => setPicked(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const total = kantongAmount({ walletIds: picked }, wallets);

  function save() {
    if (!user || !name.trim() || !picked.length) return;
    const fields: Partial<Fund> = { name: name.trim(), icon, kind, walletIds: picked, linkedWalletId: picked[0], targetAmount: target, targetDate: date, monthlyContribution: editing?.monthlyContribution || 0, notes: editing?.notes || '' };
    if (!editing) fields.currentAmount = 0;
    // A wallet sits in one kantong only: picking it here takes it out of the other one.
    const moved = kantong.filter(k => k.id !== editing?.id && k.walletIds!.some(id => picked.includes(id)));
    setMode('list');
    track(Promise.all([saveRecord<Fund>(user.uid, 'funds', fields, editing?.id), ...moved.map(k => { const rest = k.walletIds!.filter(id => !picked.includes(id)); return saveRecord<Fund>(user.uid, 'funds', { walletIds: rest, linkedWalletId: rest[0] || k.linkedWalletId }, k.id); })]), { pending: 'Menyimpan kantong…', success: editing ? 'Kantong diperbarui.' : `Kantong ${name.trim()} dibuat.`, failure: 'Kantong belum tersimpan' });
  }
  function remove() {
    if (!user || !editing) return;
    const fund = editing;
    setMode('list');
    track(archiveOrDelete(user.uid, 'funds', fund.id, data), { pending: 'Menghapus kantong…', success: `Kantong ${fund.name} dihapus. Dompetnya tetap ada.`, failure: 'Kantong belum terhapus' });
  }

  const grand = kantong.reduce((n, k) => n + k.currentAmount, 0);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title={mode === 'form' ? (editing ? `Ubah kantong` : 'Kantong baru') : 'Kantong'} className="pocket-dialog">
    {mode === 'list' && <>
      <div className="pocket-head"><small>Total di kantong</small><strong>{rupiah(grand)}</strong><span>{kantong.length ? `${kantong.length} kantong · saldonya mengikuti dompet di dalamnya` : 'Belum ada kantong'}</span></div>
      <div className="pocket-list">{kantong.map((k, i) => { const members = kantongWallets(k, data.wallets); const pct = k.targetAmount ? Math.min(1, k.currentAmount / k.targetAmount) : 0; return <article key={k.id} className="pocket-card" style={{ '--pocket': colors[i % colors.length] } as CSSProperties}>
        <span className="pocket-icon"><Emoji e={pocketEmoji(k)}/></span>
        <div className="pocket-info"><strong>{k.name}{isEmergencyFund(k) && <em>Dana darurat</em>}</strong><span>{rupiah(k.currentAmount)}{k.targetAmount ? <small> / {rupiah(k.targetAmount)}</small> : null}</span>{k.targetAmount > 0 && <i className="pocket-progress"><b style={{ width: `${Math.max(3, pct * 100)}%` }}/></i>}
          <div className="pocket-members">{members.map(w => <span key={w.id}><span className="pocket-member-icon"><AppIcon icon={w.icon}/></span>{w.name}<b>{short(Math.max(0, w.cachedBalance))}</b></span>)}</div></div>
        <div className="pocket-actions"><button type="button" className="icon-btn" aria-label={`Ubah ${k.name}`} onClick={() => openForm(k)}><Pencil size={15}/></button></div>
      </article>; })}
        {!kantong.length && <div className="pocket-intro"><span className="pocket-intro-icon"><Layers size={22}/></span><strong>Kelompokkan dompet per tujuan</strong><p>Contoh: kantong <b>Dana darurat</b> berisi Mandiri dan BRI. Saldo kedua dompet itu otomatis dijumlah jadi saldo dana daruratmu, dan tidak dihitung sebagai uang harian.</p></div>}
      </div>
      {kantong.length > 0 && <p className="muted pocket-note">Saldo kantong = total saldo dompet di dalamnya. Untuk menambah isi kantong, transfer ke salah satu dompetnya.</p>}
      <div className="modal-actions"><Button variant="secondary" onClick={() => onOpenChange(false)}>Tutup</Button><Button onClick={() => openForm()}><Plus size={16}/> Kantong baru</Button></div>
    </>}
    {mode === 'form' && <form className="form-stack" onSubmit={event => { event.preventDefault(); save(); }}>
      <div className="ip-seg"><button type="button" className={kind === 'emergency' ? 'active' : ''} onClick={() => { setKind('emergency'); if (!name) setName('Dana darurat'); setIcon('🛟'); }}>🛟 Dana darurat</button><button type="button" className={kind === 'goal' ? 'active' : ''} onClick={() => { setKind('goal'); if (icon === '🛟') setIcon('🎯'); }}>🎯 Tabungan / tujuan</button></div>
      <Field label="Nama kantong"><Input required value={name} onChange={e => setName(e.target.value)} placeholder="contoh: Tabungan kuliah"/></Field>
      <div className="wl-field"><span className="emoji-head">Ikon<EmojiSearchButton value={icon} onPick={setIcon}/></span><div className="wl-emoji-grid">{withCurrent(pocketIcons, icon).map(e => <button type="button" key={e} className={icon === e ? 'active' : ''} aria-pressed={icon === e} onClick={() => setIcon(e)}><Emoji e={e}/></button>)}</div></div>
      <div className="wl-field"><span>Dompet di kantong ini</span>
        <div className="pocket-wallet-pick" role="group" aria-label="Dompet di kantong ini">{wallets.map(w => { const on = picked.includes(w.id), owner = ownerOf(w.id); return <button type="button" key={w.id} role="checkbox" aria-checked={on} className={on ? 'active' : ''} onClick={() => toggle(w.id)}>
          <span className="tx-wallet-icon"><AppIcon icon={w.icon}/></span>
          <span className="pocket-pick-text"><strong>{w.name}</strong><small>{rupiah(w.cachedBalance)}{owner ? on ? ` · dipindah dari ${owner.name}` : ` · di kantong ${owner.name}` : ''}</small></span>
          <span className="pocket-check">{on && <Check size={15}/>}</span>
        </button>; })}</div>
        {!wallets.length && <small className="muted">Tambah dompet dulu.</small>}
      </div>
      <div className="pocket-total"><span>Saldo kantong</span><strong>{rupiah(total)}</strong><small>{picked.length ? `dari ${picked.length} dompet, otomatis mengikuti saldonya` : 'Pilih minimal satu dompet'}</small></div>
      <div className="form-grid"><Field label="Target (opsional)"><Money value={target} onChange={setTarget}/></Field><Field label="Tenggat (opsional)"><Input type="date" value={date} onChange={e => setDate(e.target.value)}/></Field></div>
      {kind === 'emergency' && <small className="muted">Insight memakai saldo kantong ini sebagai dana daruratmu, dan dompetnya tidak dihitung sebagai uang yang bisa dipakai sehari-hari.</small>}
      <div className="modal-actions">{editing && <Confirm title={`Hapus kantong ${editing.name}?`} description="Dompet di dalamnya tidak ikut terhapus dan saldonya tetap." confirmLabel="Ya, hapus" onConfirm={remove}><Button type="button" variant="ghost" className="pocket-delete"><Trash2 size={16}/> Hapus</Button></Confirm>}<Button type="button" variant="secondary" onClick={() => editing || start.mode === 'list' ? setMode('list') : onOpenChange(false)}>{editing || start.mode === 'list' ? 'Kembali' : 'Batal'}</Button><Button type="submit" disabled={!name.trim() || !picked.length}><Check size={16}/> Simpan</Button></div>
    </form>}
  </DialogContent></Dialog>;
}

/** Small tag on a wallet card telling which kantong it belongs to. */
export function KantongTag({ wallet, onOpen }: { wallet: Pick<Wallet, 'id'>; onOpen: (start: PocketStart) => void }) {
  const list = useKantong();
  const k = list.find(f => f.walletIds!.includes(wallet.id));
  if (!k) return null;
  return <button type="button" className="kantong-tag" onClick={() => onOpen({ mode: 'form', fundId: k.id })}><Emoji e={pocketEmoji(k)}/>{k.name}</button>;
}
