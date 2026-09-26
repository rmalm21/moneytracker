'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Undo2 } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Field, Input, Money, Select, categoryOptions } from './fields';
import { AppDatePicker } from './ui/date-time-picker';
import { newTx, settleWithoutWallet, undoManualPayment, upsertTransaction, validateTx } from '@/lib/firestore';
import { rupiah } from '@/lib/accounting';
import { walletAllows } from '@/lib/wallet-capabilities';
import { formatDate, todayInTimeZone } from '@/lib/period';
import type { ManualPayment } from '@/lib/types';

export type SettleTarget = { kind: 'receivables' | 'debts'; id: string; name: string; remaining: number; suggested?: number };

/** Record a repayment either through a wallet (balance changes) or as a plain settlement (only the remaining amount changes). */
export function SettleDialog({ target, onClose }: { target: SettleTarget | null; onClose: () => void }) {
  const { user, data, profile } = useApp();
  const { track } = useNotify();
  const [amount, setAmount] = useState(0), [date, setDate] = useState(''), [mode, setMode] = useState<'wallet' | 'plain'>('wallet'), [walletId, setWalletId] = useState(''), [note, setNote] = useState(''), [category, setCategory] = useState(''), [error, setError] = useState('');
  const receivable = target?.kind === 'receivables';
  const wallets = data.wallets.filter(w => !w.isArchived && walletAllows(w, receivable ? 'receive' : 'pay'));
  useEffect(() => { if (!target) return; setAmount(target.suggested || target.remaining); setDate(todayInTimeZone(profile?.timeZone)); setMode('wallet'); setWalletId(wallets[0]?.id || ''); setNote(''); setCategory(''); setError(''); }, [target?.id]);
  function submit(event: FormEvent) {
    event.preventDefault(); if (!user || !target) return;
    if (!amount || amount > target.remaining) { setError(`Nominal harus antara Rp1 dan ${rupiah(target.remaining)}.`); return; }
    const uid = user.uid, label = receivable ? 'Pelunasan piutang' : 'Pembayaran utang';
    let task: Promise<unknown>;
    if (mode === 'plain') task = settleWithoutWallet(uid, target.kind, target.id, amount, date, note.trim());
    else {
      if (!walletId) { setError('Pilih dompet.'); return; }
      // Optional category: the payment then shows under it in reports; otherwise it has its own group (Bayar utang / Piutang diterima).
      const picked = data.categories.find(c => c.id === category), parent = picked?.parentId || picked?.id || null;
      const tx = newTx({ type: receivable ? 'receivable_payment' : 'debt_payment', amount, walletId, date, categoryId: parent, subcategoryId: picked?.parentId ? picked.id : null, description: note.trim() || `${receivable ? 'Dibayar' : 'Bayar'} ${target.name}`, ...(receivable ? { receivableId: target.id } : { debtId: target.id }) });
      try { validateTx(tx); } catch (e) { setError((e as Error).message); return; }
      task = upsertTransaction(uid, tx);
    }
    onClose();
    track(task, { pending: `Mencatat ${label.toLowerCase()}…`, success: `${label} dicatat.`, failure: `${label} belum tercatat` });
  }
  return <Dialog open={Boolean(target)} onOpenChange={next => { if (!next) onClose(); }}><DialogContent title={receivable ? 'Catat pelunasan piutang' : 'Bayar utang'}>
    {target && <form className="form-stack" onSubmit={submit}>
      <div className="settle-head"><span>{target.name}</span><strong>Sisa {rupiah(target.remaining)}</strong></div>
      <div className="choice-cards settle-modes" role="radiogroup" aria-label="Cara mencatat">
        <label className={`choice-card ${mode === 'wallet' ? 'is-selected' : ''}`}><input type="radio" name="settle-mode" checked={mode === 'wallet'} onChange={() => setMode('wallet')}/><span><strong>{receivable ? 'Uang masuk ke dompet' : 'Dibayar dari dompet'}</strong><small>Saldo dompet ikut {receivable ? 'bertambah' : 'berkurang'}.</small></span></label>
        <label className={`choice-card ${mode === 'plain' ? 'is-selected' : ''}`}><input type="radio" name="settle-mode" checked={mode === 'plain'} onChange={() => setMode('plain')}/><span><strong>Tanpa dompet</strong><small>Hanya mengurangi sisa {receivable ? 'piutang' : 'utang'}. Cocok jika uangnya tidak sempat dicatat.</small></span></label>
      </div>
      <div className="form-grid">
        <Field label="Nominal"><Money value={amount} onChange={setAmount} required/></Field>
        <Field label="Tanggal"><AppDatePicker value={date} onChange={e => setDate(e.target.value)} required/></Field>
        {mode === 'wallet' && <Field label={receivable ? 'Masuk ke dompet' : 'Dari dompet'}><Select value={walletId} onChange={e => setWalletId(e.target.value)}><option value="">Pilih dompet</option>{wallets.map(w => <option key={w.id} value={w.id}>{w.name} · {rupiah(w.cachedBalance)}</option>)}</Select></Field>}
        {mode === 'wallet' && <Field label="Kategori (opsional)"><Select value={category} onChange={e => setCategory(e.target.value)}><option value="">{receivable ? 'Piutang diterima' : 'Bayar utang'} (tanpa kategori)</option>{categoryOptions(data.categories, [receivable ? 'income' : 'expense'])}</Select></Field>}
        <Field label="Catatan (opsional)"><Input value={note} maxLength={100} onChange={e => setNote(e.target.value)} placeholder="Contoh: dibayar tunai"/></Field>
      </div>
      <div className="toolbar-row">{[target.remaining, Math.round(target.remaining / 2)].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map(v => <button type="button" key={v} className="link-button" onClick={() => setAmount(v)}>{v === target.remaining ? 'Lunasi semua' : 'Separuh'} · {rupiah(v)}</button>)}</div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Batal</Button><Button type="submit">Simpan</Button></div>
    </form>}
  </DialogContent></Dialog>;
}

/** Settlements made without a wallet, with an undo button. */
export function ManualPayments({ kind, id, payments }: { kind: 'receivables' | 'debts'; id: string; payments?: ManualPayment[] }) {
  const { user } = useApp();
  const { track } = useNotify();
  if (!payments?.length) return null;
  return <div className="manual-payments"><h4>Dicatat tanpa dompet</h4>{payments.map(p => <div key={p.id} className="budget-line"><span>{formatDate(p.date)}{p.note ? ` · ${p.note}` : ''}</span><span className="toolbar-row"><strong>{rupiah(p.amount)}</strong><button type="button" className="icon-btn" aria-label="Batalkan pelunasan ini" title="Batalkan" onClick={() => { if (user) track(undoManualPayment(user.uid, kind, id, p.id), { pending: 'Membatalkan pelunasan…', success: 'Pelunasan dibatalkan.', failure: 'Pelunasan belum dibatalkan' }); }}><Undo2 size={15}/></button></span></div>)}</div>;
}
