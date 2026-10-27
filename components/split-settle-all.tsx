'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { CheckCheck } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Field, Input, Money, Select } from './fields';
import { PersonAvatar, personName } from './split-bill-shared';
import { newTx, settleWithoutWallet, upsertTransaction } from '@/lib/firestore';
import { recordBetweenPayment } from '@/lib/split-bill-store';
import { rupiah } from '@/lib/accounting';
import { walletAllows } from '@/lib/wallet-capabilities';
import { todayInTimeZone } from '@/lib/period';
import type { BillProgress, PersonProgress } from '@/lib/split-bill';
import type { SplitBill } from '@/lib/types';

/**
 * Tandai lunas: everyone who still owes on a bill, all ticked, settled in one go with one date (and one wallet for the
 * money that reaches or leaves the user). Each person's amount can be lowered for someone who paid only part. Every
 * payment is still recorded per person, exactly as "Catat pembayaran" would, so each history stays complete.
 */
export function SettleAllSheet({ bill, state, onClose }: { bill: SplitBill; state: BillProgress; onClose: () => void }) {
  const { user, data, profile } = useApp();
  const { track } = useNotify();
  const owing = useMemo(() => state.people.filter(row => row.role !== 'payer' && row.remaining > 0), [state.people]);
  const [picked, setPicked] = useState(() => new Set(owing.map(row => row.id)));
  const [amounts, setAmounts] = useState<Record<string, number>>(() => Object.fromEntries(owing.map(row => [row.id, row.remaining])));
  const [date, setDate] = useState(todayInTimeZone(profile?.timeZone)), [mode, setMode] = useState<'wallet' | 'plain'>('wallet'), [error, setError] = useState('');
  const chosen = owing.filter(row => picked.has(row.id));
  // Money moves through a wallet only for the user's own side: Piutang paid back to them, or their Utang to the payer.
  const receiving = chosen.some(row => row.role === 'receivable'), paying = chosen.some(row => row.role === 'debt');
  const action = receiving ? 'receive' : 'pay';
  const wallets = data.wallets.filter(w => !w.isArchived && walletAllows(w, action));
  const [walletId, setWalletId] = useState(() => (wallets.find(w => w.id === bill.walletId) || wallets[0])?.id || '');
  const total = chosen.reduce((sum, row) => sum + (amounts[row.id] || 0), 0);
  const all = chosen.length === owing.length;
  const name = (row: PersonProgress) => personName(bill.participants.find(p => p.id === row.id));
  const toggle = (id: string) => setPicked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  async function settleAll(uid: string, rows: PersonProgress[]) {
    let done = 0;
    try {
      for (const row of rows) {
        const amount = amounts[row.id], label = name(row);
        if (row.role === 'between') await recordBetweenPayment(uid, bill.id, row.id, amount, date);
        else {
          const kind = row.role === 'receivable' ? 'receivables' : 'debts', id = row.record!.id;
          if (mode === 'plain') await settleWithoutWallet(uid, kind, id, amount, date, 'Ditandai lunas bersama');
          else await upsertTransaction(uid, newTx({ type: kind === 'receivables' ? 'receivable_payment' : 'debt_payment', amount, walletId, date, description: kind === 'receivables' ? `Dibayar ${label} (Split Bill)` : `Bayar ${state.payerName} (Split Bill)`, ...(kind === 'receivables' ? { receivableId: id } : { debtId: id }) }));
        }
        done++;
      }
    } catch (error) {
      throw Error(`${done ? `${done} dari ${rows.length} sudah tercatat. ` : ''}${(error as Error).message}`);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault(); if (!user) return;
    if (!chosen.length) { setError('Centang dulu siapa yang sudah bayar.'); return; }
    const wrong = chosen.find(row => !amounts[row.id] || amounts[row.id] < 1 || amounts[row.id] > row.remaining);
    if (wrong) { setError(`Nominal ${name(wrong)} harus antara Rp1 dan ${rupiah(wrong.remaining)}.`); return; }
    if (!date) { setError('Pilih tanggal.'); return; }
    if (chosen.some(row => (row.role === 'receivable' || row.role === 'debt') && !row.record)) { setError('Catatan piutang/utangnya tidak ditemukan. Buka Periksa Data.'); return; }
    if ((receiving || paying) && mode === 'wallet') {
      if (!walletId) { setError('Pilih dompet.'); return; }
    }
    const rows = [...chosen], count = rows.length;
    onClose();
    track(settleAll(user.uid, rows), { pending: `Menandai ${count} orang lunas…`, success: count === owing.length && rows.every(row => amounts[row.id] === row.remaining) ? `Semua sudah lunas · ${rupiah(total)}` : `${count} pembayaran dicatat · ${rupiah(total)}`, failure: 'Belum semua tercatat' });
  }

  return <Dialog open onOpenChange={next => { if (!next) onClose(); }}><DialogContent title="Tandai lunas" className="sb-settle-all-dialog">
    <form className="form-stack sb-settle-all" onSubmit={submit}>
      <label className="check-row sb-settle-all-head"><input type="checkbox" checked={all} onChange={() => setPicked(all ? new Set() : new Set(owing.map(row => row.id)))}/> <span>Pilih semua <small>{owing.length} orang belum lunas</small></span></label>
      <ul className="sb-settle-list">{owing.map(row => { const on = picked.has(row.id), participant = bill.participants.find(p => p.id === row.id)!; return <li key={row.id} className={on ? 'is-on' : ''}>
        <label className="sb-settle-who"><input type="checkbox" checked={on} onChange={() => toggle(row.id)}/><PersonAvatar person={participant} size="sm"/><span><strong>{name(row)}</strong><small>{row.role === 'debt' ? `Bagianmu ke ${state.payerName}` : row.role === 'between' ? `Bayar ke ${state.payerName}` : 'Bayar ke kamu'} · sisa {rupiah(row.remaining)}</small></span></label>
        {on && <div className="sb-settle-amount"><Money value={amounts[row.id] || 0} onChange={value => setAmounts(current => ({ ...current, [row.id]: value }))}/>{amounts[row.id] !== row.remaining && <button type="button" className="link-button" onClick={() => setAmounts(current => ({ ...current, [row.id]: row.remaining }))}>Lunas</button>}</div>}
      </li>; })}</ul>
      <Field label="Tanggal bayar"><Input type="date" value={date} onChange={e => setDate(e.target.value)} required/></Field>
      {(receiving || paying) && <>
        <div className="choice-cards settle-modes" role="radiogroup" aria-label="Cara mencatat">
          <label className={`choice-card ${mode === 'wallet' ? 'is-selected' : ''}`}><input type="radio" name="settle-all-mode" checked={mode === 'wallet'} onChange={() => setMode('wallet')}/><span><strong>{receiving ? 'Uang masuk ke dompet' : 'Dibayar dari dompet'}</strong><small>Saldo dompet ikut {receiving ? 'bertambah' : 'berkurang'}.</small></span></label>
          <label className={`choice-card ${mode === 'plain' ? 'is-selected' : ''}`}><input type="radio" name="settle-all-mode" checked={mode === 'plain'} onChange={() => setMode('plain')}/><span><strong>Tanpa dompet</strong><small>Hanya menandai lunas, saldo tidak berubah.</small></span></label>
        </div>
        {mode === 'wallet' && <Field label={receiving ? 'Masuk ke dompet' : 'Dari dompet'}><Select value={walletId} onChange={e => setWalletId(e.target.value)}><option value="">Pilih dompet</option>{wallets.map(w => <option key={w.id} value={w.id}>{w.name} · {rupiah(w.cachedBalance)}</option>)}</Select></Field>}
      </>}
      {chosen.some(row => row.role === 'between') && <p className="muted sb-settle-note">Pembayaran antar teman ke {state.payerName} hanya ditandai, tidak mengubah saldo dompetmu.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {chosen.length > 0 && <div className="sb-settle-sum"><span>{chosen.length} orang</span><strong>{rupiah(total)}</strong></div>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Batal</Button><Button type="submit" disabled={!chosen.length}><CheckCheck size={16}/> Tandai lunas{chosen.length ? ` (${chosen.length})` : ''}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
