'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { Pencil, Plus, Split } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { Field, FormActions, Input, Money, Select } from './fields';
import { Confirm } from './ui/alert-dialog';
import { rupiah } from '@/lib/accounting';
import { saveWalletPortions } from '@/lib/firestore';
import { PORTION_KINDS, portionMoved, walletSplit } from '@/lib/wallet-portions';
import type { Wallet, WalletPortion } from '@/lib/types';

const short = (n: number) => { const a = Math.abs(n), s = n < 0 ? '−' : ''; return a >= 1e6 ? `${s}Rp${(a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })}jt` : a >= 1e3 ? `${s}Rp${Math.round(a / 1e3).toLocaleString('id-ID')}rb` : `${s}Rp${a}`; };

/** One line under a wallet's balance on its card: "Uangku Rp1,5jt · Dana bisnis Rp6jt". */
export function PortionLine({ wallet }: { wallet: Wallet }) {
  const { data } = useApp();
  const split = useMemo(() => wallet.portions?.length ? walletSplit(wallet, data.transactions) : null, [wallet, data.transactions]);
  if (!split) return null;
  return <span className="portion-line" title="Isi dompet">
    <b className={split.short ? 'is-short' : ''}>Uangku {short(split.own)}</b>
    {split.parts.map(p => <span key={p.id} className={`is-${p.kind}`}>{p.name} {short(p.amount)}</span>)}
  </span>;
}

/** Wallet detail: the balance told apart, with a bar, each part, and adding / changing a part. */
export function WalletPortionsPanel({ wallet }: { wallet: Wallet }) {
  const { data } = useApp();
  const [editing, setEditing] = useState<WalletPortion | 'new' | null>(null);
  const split = useMemo(() => walletSplit(wallet, data.transactions), [wallet, data.transactions]);
  const total = Math.max(1, Math.max(0, split.own) + split.parts.reduce((n, p) => n + Math.max(0, p.amount), 0));
  const has = split.parts.length > 0;
  return <section className="portions" aria-label="Isi dompet">
    <div className="portions-head"><div><h3>Isi dompet</h3><small>{has ? 'Saldo di bank tetap satu. Bagian ini penanda supaya uangmu tidak tercampur.' : 'Pisahkan uangmu dari titipan atau dana bisnis yang ikut mengendap di rekening ini.'}</small></div>
      <Button type="button" variant="secondary" className="small" onClick={() => setEditing('new')}>{has ? <Plus size={15}/> : <Split size={15}/>}{has ? 'Tambah bagian' : 'Pisahkan isi'}</Button></div>
    {has && <>
      <div className="portions-bar" role="img" aria-label={[`Uangku ${rupiah(split.own)}`, ...split.parts.map(p => `${p.name} ${rupiah(p.amount)}`)].join(', ')}>
        {split.own > 0 && <i className="is-own" style={{ width: `${split.own / total * 100}%` }}/>}
        {split.parts.filter(p => p.amount > 0).map(p => <i key={p.id} className={`is-${p.kind}`} style={{ width: `${p.amount / total * 100}%` }}/>)}
      </div>
      <ul className="portions-list">
        <li className="is-own"><span className="dot"/><span className="name"><strong>Uangku</strong><small>Bebas kamu pakai</small></span><b className={split.short ? 'amount-negative' : ''}>{rupiah(split.own)}</b></li>
        {split.parts.map(p => <li key={p.id} className={`is-${p.kind}`}><span className="dot"/><span className="name"><strong>{p.name}</strong><small>{PORTION_KINDS[p.kind].label}{p.note ? ` · ${p.note}` : ''}</small></span><b>{rupiah(p.amount)}</b>
          <button type="button" className="portion-edit" aria-label={`Ubah ${p.name}`} onClick={() => setEditing(wallet.portions!.find(x => x.id === p.id)!)}><Pencil size={15}/></button></li>)}
      </ul>
      {split.short && <p className="portions-warn">Saldo {wallet.name} lebih kecil dari jumlah bagian. Mungkin ada titipan yang sudah terpakai atau terkirim: ubah jumlahnya, atau catat transaksinya dari bagian itu.</p>}
      <small className="portions-tip">Saat mencatat transaksi dari dompet ini, pilih bagiannya (misalnya “dari {split.parts[0].name}”) supaya jumlah bagian ikut berubah.</small>
    </>}
    <PortionEditor wallet={wallet} portion={editing} onClose={() => setEditing(null)}/>
  </section>;
}

function PortionEditor({ wallet, portion, onClose }: { wallet: Wallet; portion: WalletPortion | 'new' | null; onClose: () => void }) {
  const { data, user } = useApp();
  const { track } = useNotify();
  const old = portion && portion !== 'new' ? portion : null;
  const [name, setName] = useState(''), [kind, setKind] = useState<WalletPortion['kind']>('titipan'), [amount, setAmount] = useState(0), [note, setNote] = useState(''), [error, setError] = useState('');
  const [seen, setSeen] = useState<WalletPortion | 'new' | null>(null);
  if (portion !== seen) {
    setSeen(portion); setName(old?.name || ''); setKind(old?.kind || 'titipan'); setNote(old?.note || ''); setError('');
    setAmount(old ? old.base + portionMoved(wallet.id, old.id, data.transactions) : 0);
  }
  const others = (wallet.portions || []).filter(p => p.id !== old?.id);
  const free = wallet.cachedBalance - others.reduce((n, p) => n + Math.max(0, p.base + portionMoved(wallet.id, p.id, data.transactions)), 0);
  function save(list: WalletPortion[], message: string) {
    if (!user) return;
    onClose();
    track(saveWalletPortions(user.uid, wallet.id, list), { pending: 'Menyimpan isi dompet…', success: message, failure: 'Isi dompet belum tersimpan' });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError('Beri nama bagiannya, misalnya Dana bisnis.');
    if (amount < 0) return setError('Jumlahnya tidak boleh minus.');
    if (others.some(p => p.name.trim().toLowerCase() === name.trim().toLowerCase())) return setError('Nama bagian ini sudah ada di dompet ini.');
    const id = old?.id || `p${Date.now().toString(36)}`;
    const base = amount - (old ? portionMoved(wallet.id, old.id, data.transactions) : 0);
    save([...others, { id, name: name.trim(), kind, base, ...(note.trim() ? { note: note.trim() } : {}) }], old ? `${name.trim()} diperbarui.` : `${name.trim()} dipisahkan dari uangmu.`);
  }
  return <Dialog open={Boolean(portion)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent title={old ? `Ubah ${old.name}` : `Pisahkan isi ${wallet.name}`}>
      <form className="form-stack" onSubmit={submit}>
        <p className="muted portion-intro">Saldo {wallet.name} tetap {rupiah(wallet.cachedBalance)}. Bagian ini menandai uang yang bukan untuk kamu pakai.</p>
        <Field label="Nama bagian"><Input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Contoh: Dana bisnis" autoFocus/></Field>
        <div className="choice-cards portion-kinds" role="radiogroup" aria-label="Jenis bagian">
          {(Object.keys(PORTION_KINDS) as WalletPortion['kind'][]).map(k => <label key={k} className={`choice-card ${kind === k ? 'is-selected' : ''}`}><input type="radio" name="portion-kind" checked={kind === k} onChange={() => setKind(k)}/><span><strong>{PORTION_KINDS[k].label}</strong><small>{PORTION_KINDS[k].hint}</small></span></label>)}
        </div>
        <Field label="Jumlah sekarang" hint={`Uangku tersisa ${rupiah(free - amount)} setelah ini.`}><Money value={amount} onChange={setAmount}/></Field>
        <Field label="Catatan (opsional)"><Input value={note} onChange={e => setNote(e.target.value)} maxLength={80} placeholder="Contoh: dari Andi, untuk bayar supplier"/></Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <FormActions saving={false} onCancel={onClose}/>
        {old && <Confirm title={`Hapus bagian ${old.name}?`} description="Uangnya kembali dihitung sebagai Uangku. Saldo dompet dan transaksi tidak berubah." confirmLabel="Hapus bagian" onConfirm={() => save(others, `${old.name} digabung lagi ke Uangku.`)}><button type="button" className="link-button portion-delete">Hapus bagian ini</button></Confirm>}
      </form>
    </DialogContent>
  </Dialog>;
}

/** Transaction form: which part of a wallet the money leaves or enters (shown only for wallets with parts). */
export function PortionPicker({ wallet, value, onChange, label }: { wallet?: Pick<Wallet, 'portions'>; value: string; onChange: (id: string) => void; label: string }) {
  if (!wallet?.portions?.length) return null;
  return <Field label={label}><Select value={value} onChange={e => onChange(e.target.value)}>
    <option value="">Uangku</option>
    {wallet.portions.map(p => <option key={p.id} value={p.id}>{p.name} ({p.kind === 'titipan' ? 'titipan' : 'disisihkan'})</option>)}
  </Select></Field>;
}
