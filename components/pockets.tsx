'use client';
import { useState, type CSSProperties } from 'react';
import { ArrowRightLeft, Check, Layers, Pencil, Plus } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { Field, Input, Money, Select } from './fields';
import { Emoji } from './emoji';
import { rupiah } from '@/lib/accounting';
import { movePocketMoney, saveRecord } from '@/lib/firestore';
import { isEmergencyFund, pocketEmoji, pocketIcons, walletPockets } from '@/lib/pockets';
import type { Fund, Wallet } from '@/lib/types';

const short = (n: number) => n >= 1e6 ? `Rp${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} jt` : n >= 1e3 ? `Rp${Math.round(n / 1e3)} rb` : rupiah(n);
const colors = ['var(--chart-1)', 'var(--chart-3)', 'var(--chart-2)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];
const UNALLOCATED = '';

/** Compact view on a Tabungan wallet card: one bar split by pocket and the list of pockets. */
export function PocketStrip({ wallet, onManage }: { wallet: Wallet; onManage: () => void }) {
  const { data } = useApp();
  const { pockets, unallocated, balance } = walletPockets(wallet, data.funds);
  if (!pockets.length) return <button type="button" className="pocket-empty" onClick={onManage}><Layers size={15}/> Bagi saldo ke kantong (dana darurat, kuliah, …)</button>;
  return <div className="pocket-strip">
    <div className="pocket-bar" role="img" aria-label={pockets.map(p => `${p.name} ${rupiah(p.currentAmount)}`).join(', ')}>{pockets.map((p, i) => <i key={p.id} style={{ flex: Math.max(0, p.currentAmount), background: colors[i % colors.length] }}/>)}{unallocated > 0 && <i className="free" style={{ flex: unallocated }}/>}</div>
    <ul>{pockets.map((p, i) => <li key={p.id}><span className="pocket-dot" style={{ background: colors[i % colors.length] }}/><Emoji e={pocketEmoji(p)}/><span className="pocket-name">{p.name}{isEmergencyFund(p) && <b>darurat</b>}</span><strong>{short(p.currentAmount || 0)}</strong></li>)}
      {unallocated > 0 && <li className="is-free"><span className="pocket-dot free"/><span className="pocket-name">Belum dialokasikan</span><strong>{short(unallocated)}</strong></li>}</ul>
    <button type="button" className="link-button" onClick={onManage}><Layers size={14}/> Kelola kantong{balance ? '' : ''}</button>
  </div>;
}

/** Sheet to create pockets and move money between them (no wallet transactions: the money stays in the wallet). */
export function PocketSheet({ wallet, open, onOpenChange }: { wallet: Wallet | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, user } = useApp();
  const { track } = useNotify();
  const [mode, setMode] = useState<'list' | 'form' | 'move'>('list');
  const [editing, setEditing] = useState<Fund | null>(null);
  const [name, setName] = useState(''), [icon, setIcon] = useState('🎯'), [kind, setKind] = useState<'emergency' | 'goal'>('goal'), [target, setTarget] = useState(0), [date, setDate] = useState(''), [start, setStart] = useState(0);
  const [from, setFrom] = useState(UNALLOCATED), [to, setTo] = useState(UNALLOCATED), [amount, setAmount] = useState(0);
  if (!wallet) return null;
  const { pockets, unallocated, balance, overAllocated } = walletPockets(wallet, data.funds);
  const available = (id: string) => id === UNALLOCATED ? unallocated : Math.max(0, pockets.find(p => p.id === id)?.currentAmount || 0);
  const label = (id: string) => id === UNALLOCATED ? 'Belum dialokasikan' : pockets.find(p => p.id === id)?.name || '';
  function reset(next: 'list' | 'form' | 'move') { setMode(next); }
  function openForm(p?: Fund) { setEditing(p || null); setName(p?.name || ''); setIcon(p ? pocketEmoji(p) : pockets.some(isEmergencyFund) ? '🎯' : '🛟'); setKind(p ? (isEmergencyFund(p) ? 'emergency' : 'goal') : pockets.some(isEmergencyFund) ? 'goal' : 'emergency'); setTarget(p?.targetAmount || 0); setDate(p?.targetDate || ''); setStart(0); reset('form'); }
  function openMove(toId: string, fromId = UNALLOCATED) { setFrom(fromId); setTo(toId); setAmount(0); reset('move'); }
  function saveForm() {
    if (!user || !wallet || !name.trim()) return;
    const fields: Partial<Fund> = { name: name.trim(), icon, kind, targetAmount: target, targetDate: date, linkedWalletId: wallet.id, monthlyContribution: editing?.monthlyContribution || 0, notes: editing?.notes || '' };
    if (!editing) fields.currentAmount = Math.min(start, unallocated);
    reset('list');
    track(saveRecord<Fund>(user.uid, 'funds', fields, editing?.id), { pending: 'Menyimpan kantong…', success: editing ? 'Kantong diperbarui.' : `Kantong ${name.trim()} dibuat.`, failure: 'Kantong belum tersimpan' });
  }
  function saveMove() {
    if (!user || amount <= 0 || from === to) return;
    const value = Math.min(amount, available(from));
    reset('list');
    track(movePocketMoney(user.uid, from || null, to || null, value), { pending: 'Memindahkan…', success: `${short(value)} dipindah ke ${label(to)}.`, failure: 'Belum dipindahkan' });
  }

  return <Dialog open={open} onOpenChange={value => { if (!value) setMode('list'); onOpenChange(value); }}><DialogContent title={mode === 'form' ? (editing ? 'Ubah kantong' : 'Kantong baru') : mode === 'move' ? 'Pindahkan uang' : `Kantong · ${wallet.name}`} className="pocket-dialog">
    {mode === 'list' && <>
      <div className="pocket-head"><small>Saldo {wallet.name}</small><strong>{rupiah(balance)}</strong><span>Belum dialokasikan <b>{rupiah(unallocated)}</b></span>{overAllocated > 0 && <p className="form-error">Isi kantong melebihi saldo sebesar {rupiah(overAllocated)}. Kurangi salah satu kantong.</p>}</div>
      <div className="pocket-list">{pockets.map((p, i) => { const pct = p.targetAmount ? Math.min(1, (p.currentAmount || 0) / p.targetAmount) : 0; return <article key={p.id} className="pocket-card" style={{ '--pocket': colors[i % colors.length] } as CSSProperties}>
        <span className="pocket-icon"><Emoji e={pocketEmoji(p)}/></span>
        <div className="pocket-info"><strong>{p.name}{isEmergencyFund(p) && <em>Dana darurat</em>}</strong><span>{rupiah(p.currentAmount || 0)}{p.targetAmount ? <small> / {rupiah(p.targetAmount)}</small> : null}</span>{p.targetAmount > 0 && <i className="pocket-progress"><b style={{ width: `${Math.max(3, pct * 100)}%` }}/></i>}</div>
        <div className="pocket-actions"><button type="button" className="icon-btn" aria-label={`Isi ${p.name}`} title="Isi dari belum dialokasikan" onClick={() => openMove(p.id)}><Plus size={17}/></button><button type="button" className="icon-btn" aria-label={`Pindahkan dari ${p.name}`} title="Pindahkan ke kantong lain" onClick={() => openMove(UNALLOCATED, p.id)}><ArrowRightLeft size={16}/></button><button type="button" className="icon-btn" aria-label={`Ubah ${p.name}`} onClick={() => openForm(p)}><Pencil size={15}/></button></div>
      </article>; })}
        {!pockets.length && <p className="ins-empty">Belum ada kantong. Buat kantong <b>Dana darurat</b> dulu supaya tidak tercampur dengan tabungan lain.</p>}
      </div>
      <p className="muted pocket-note">Memindahkan uang antar kantong tidak membuat transaksi — uangnya tetap di {wallet.name}, hanya ditandai untuk keperluan tertentu. Untuk menambah saldo dari dompet lain, catat transfer atau “Isi tujuan dana”.</p>
      <div className="modal-actions"><Button variant="secondary" onClick={() => onOpenChange(false)}>Tutup</Button><Button onClick={() => openForm()}><Plus size={16}/> Kantong baru</Button></div>
    </>}
    {mode === 'form' && <form className="form-stack" onSubmit={event => { event.preventDefault(); saveForm(); }}>
      <div className="ip-seg"><button type="button" className={kind === 'emergency' ? 'active' : ''} onClick={() => { setKind('emergency'); if (!name) setName('Dana darurat'); setIcon('🛟'); }}>🛟 Dana darurat</button><button type="button" className={kind === 'goal' ? 'active' : ''} onClick={() => setKind('goal')}>🎯 Tabungan / tujuan</button></div>
      <Field label="Nama kantong"><Input required value={name} onChange={e => setName(e.target.value)} placeholder="contoh: Tabungan kuliah"/></Field>
      <div className="wl-field"><span>Ikon</span><div className="wl-emoji-grid">{pocketIcons.map(e => <button type="button" key={e} className={icon === e ? 'active' : ''} aria-pressed={icon === e} onClick={() => setIcon(e)}><Emoji e={e}/></button>)}</div></div>
      <div className="form-grid"><Field label="Target (opsional)"><Money value={target} onChange={setTarget}/></Field><Field label="Tenggat (opsional)"><Input type="date" value={date} onChange={e => setDate(e.target.value)}/></Field></div>
      {!editing && unallocated > 0 && <Field label={`Isi awal dari belum dialokasikan (maks ${rupiah(unallocated)})`}><Money value={start} onChange={v => setStart(Math.min(v, unallocated))}/></Field>}
      {kind === 'emergency' && <small className="muted">Kantong dana darurat dipakai Insight untuk menghitung dana daruratmu, terpisah dari tabungan lain.</small>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => reset('list')}>Kembali</Button><Button type="submit" disabled={!name.trim()}><Check size={16}/> Simpan</Button></div>
    </form>}
    {mode === 'move' && <form className="form-stack" onSubmit={event => { event.preventDefault(); saveMove(); }}>
      <div className="form-grid">
        <Field label="Dari"><Select value={from} onChange={e => setFrom(e.target.value)}><option value={UNALLOCATED}>Belum dialokasikan · {short(unallocated)}</option>{pockets.map(p => <option key={p.id} value={p.id}>{p.name} · {short(p.currentAmount || 0)}</option>)}</Select></Field>
        <Field label="Ke"><Select value={to} onChange={e => setTo(e.target.value)}><option value={UNALLOCATED}>Belum dialokasikan</option>{pockets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      </div>
      <Field label={`Jumlah (tersedia ${rupiah(available(from))})`}><Money value={amount} onChange={setAmount} required/></Field>
      <div className="ip-choices">{[100_000, 500_000, 1_000_000].filter(v => v <= available(from)).map(v => <button type="button" key={v} className={amount === v ? 'active' : ''} onClick={() => setAmount(v)}>{short(v)}</button>)}{available(from) > 0 && <button type="button" className={amount === available(from) ? 'active' : ''} onClick={() => setAmount(available(from))}>Semua {short(available(from))}</button>}</div>
      {from === to && <p className="form-error">Pilih kantong tujuan yang berbeda.</p>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => reset('list')}>Kembali</Button><Button type="submit" disabled={amount <= 0 || from === to || !available(from)}><ArrowRightLeft size={16}/> Pindahkan</Button></div>
    </form>}
  </DialogContent></Dialog>;
}
