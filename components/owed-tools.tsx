'use client';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, PencilLine, Undo2, Wallet as WalletIcon } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Field, Input, Money } from './fields';
import { subscribeRelatedTransactions, undoManualPayment, updateOwedBalance } from '@/lib/firestore';
import { rupiah } from '@/lib/accounting';
import { formatDate, todayInTimeZone } from '@/lib/period';
import type { Debt, LedgerTx, Receivable } from '@/lib/types';

/** Shared by Utang and Piutang: "Perbarui saldo", the full history of a record, the compact view and finished records. */
export type OwedKind = 'receivables' | 'debts';
export const owedLeft = (row: Debt | Receivable) => 'outstandingAmount' in row ? row.outstandingAmount : row.remainingAmount;
export const owedDone = (row: Debt | Receivable) => owedLeft(row) <= 0;
const stamp = (value: unknown) => { const at = value as { toDate?: () => Date } | undefined; return typeof at?.toDate === 'function' ? at.toDate().toLocaleDateString('en-CA') : ''; };
/** When a record started: a receivable has its own date, a debt the day it was recorded. */
export const startDate = (row: Debt | Receivable) => ('date' in row && row.date) || stamp(row.createdAt);
/** When a finished record was settled: its last payment or balance update, otherwise when it last changed. */
export function settledDate(row: Debt | Receivable, ledger: LedgerTx[] = []) {
  const key = 'outstandingAmount' in row ? 'debtId' : 'receivableId';
  const dates = [...(row.manualPayments || []).map(p => p.date), ...(row.balanceUpdates || []).map(u => u.date), ...ledger.filter(tx => tx[key] === row.id).map(tx => tx.date)].filter(Boolean).sort();
  return dates.pop() || stamp(row.updatedAt) || startDate(row);
}

/** Ringkas: one line per record, tap to open the full card. Remembered on this device. */
const COMPACT_KEY = 'dompet-ajaib:owed-compact';
export function useCompactOwed() {
  const [compact, setCompact] = useState(false);
  useEffect(() => { try { setCompact(localStorage.getItem(COMPACT_KEY) === '1'); } catch { /* default view */ } }, []);
  const toggle = () => setCompact(current => { const next = !current; try { localStorage.setItem(COMPACT_KEY, next ? '1' : '0'); } catch { /* this visit only */ } return next; });
  return [compact, toggle] as const;
}
export function CompactSwitch({ compact, onToggle }: { compact: boolean; onToggle: () => void }) {
  return <div className="ip-seg owed-view-switch" role="radiogroup" aria-label="Tampilan daftar"><button type="button" role="radio" aria-checked={!compact} className={!compact ? 'active' : ''} onClick={() => { if (compact) onToggle(); }}>Lengkap</button><button type="button" role="radio" aria-checked={compact} className={compact ? 'active' : ''} onClick={() => { if (!compact) onToggle(); }}>Ringkas</button></div>;
}
/** In Ringkas mode a record is a single row; the full card opens under it. */
export function CompactRow({ compact, avatar, title, sub, amount, pill, children }: { compact: boolean; avatar: ReactNode; title: ReactNode; sub?: ReactNode; amount: string; pill: ReactNode; children: ReactNode }) {
  if (!compact) return <>{children}</>;
  return <details className="owed-compact"><summary><span className="owed-compact-avatar">{avatar}</span><span className="owed-compact-main"><strong>{title}</strong>{sub && <small>{sub}</small>}</span><span className="owed-compact-side"><strong>{amount}</strong>{pill}</span><ChevronDown size={16} className="owed-compact-chev" aria-hidden="true"/></summary><div className="owed-compact-body">{children}</div></details>;
}

/** Set what is still owed to the real amount; the difference is kept in the history. */
export type BalanceTarget = { kind: OwedKind; id: string; name: string; remaining: number };
export function BalanceDialog({ target, onClose }: { target: BalanceTarget | null; onClose: () => void }) {
  const { user, profile } = useApp();
  const { track } = useNotify();
  const [amount, setAmount] = useState(0), [date, setDate] = useState(''), [note, setNote] = useState(''), [error, setError] = useState('');
  useEffect(() => { if (!target) return; setAmount(target.remaining); setDate(todayInTimeZone(profile?.timeZone)); setNote(''); setError(''); }, [target?.id]);
  const debt = target?.kind === 'debts', delta = target ? amount - target.remaining : 0;
  function submit(event: FormEvent) {
    event.preventDefault(); if (!user || !target) return;
    if (!delta) { setError('Sisanya sama dengan sekarang.'); return; }
    const uid = user.uid, t = target;
    onClose();
    track(updateOwedBalance(uid, t.kind, t.id, amount, date, note.trim()), { pending: 'Memperbarui saldo…', success: `Sisa ${debt ? 'utang' : 'piutang'} ${t.name} jadi ${rupiah(amount)}.`, failure: 'Saldo belum diperbarui' });
  }
  return <Dialog open={Boolean(target)} onOpenChange={next => { if (!next) onClose(); }}><DialogContent title={debt ? 'Perbarui saldo utang' : 'Perbarui saldo piutang'}>
    {target && <form className="form-stack" onSubmit={submit}>
      <div className="settle-head"><span>{target.name}</span><strong>Sisa sekarang {rupiah(target.remaining)}</strong></div>
      <p className="muted owed-note">Pakai ini bila sisanya berubah tanpa pembayaran, misalnya ada bunga atau denda, potongan, atau salah catat. Saldo dompet tidak berubah; perubahannya tersimpan di riwayat.</p>
      <div className="form-grid">
        <Field label="Sisa yang benar"><Money value={amount} onChange={setAmount}/></Field>
        <Field label="Tanggal"><Input type="date" value={date} onChange={e => setDate(e.target.value)} required/></Field>
      </div>
      <Field label="Keterangan (opsional)"><Input value={note} maxLength={100} onChange={e => setNote(e.target.value)} placeholder={debt ? 'Misalnya bunga bulan ini' : 'Misalnya diskon, dibulatkan'}/></Field>
      {delta !== 0 && <p className={`owed-delta ${delta > 0 ? 'is-up' : 'is-down'}`}>{delta > 0 ? <ArrowUpRight size={15}/> : <ArrowDownRight size={15}/>} {delta > 0 ? 'Bertambah' : 'Berkurang'} {rupiah(Math.abs(delta))}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Batal</Button><Button type="submit">Simpan</Button></div>
    </form>}
  </DialogContent></Dialog>;
}

/** Everything that happened to a record, newest first: payments through a wallet, payments without one, and balance updates. */
export function OwedHistory({ kind, record }: { kind: OwedKind; record: Debt | Receivable }) {
  const { user, data } = useApp();
  const { track } = useNotify();
  const [ledger, setLedger] = useState<LedgerTx[] | null>(null);
  useEffect(() => { if (!user) return; setLedger(null); return subscribeRelatedTransactions(user.uid, kind === 'receivables' ? 'receivableId' : 'debtId', record.id, items => setLedger(items.filter(tx => tx.type === (kind === 'receivables' ? 'receivable_payment' : 'debt_payment'))), () => setLedger([])); }, [user?.uid, kind, record.id]);
  const wallets = new Map(data.wallets.map(w => [w.id, w.name]));
  const rows = useMemo(() => {
    type Row = { key: string; date: string; label: string; detail?: string; amount: string; tone: 'pay' | 'up' | 'down'; undo?: () => void };
    const list: Row[] = [];
    for (const tx of ledger || []) list.push({ key: `t${tx.id}`, date: tx.date, label: kind === 'receivables' ? `Diterima di ${wallets.get(tx.walletId) || 'dompet'}` : `Dibayar dari ${wallets.get(tx.walletId) || 'dompet'}`, detail: tx.notes || undefined, amount: rupiah(tx.amount), tone: 'pay' });
    for (const p of record.manualPayments || []) list.push({ key: `m${p.id}`, date: p.date, label: 'Dicatat tanpa dompet', detail: p.note, amount: rupiah(p.amount), tone: 'pay', undo: user ? () => track(undoManualPayment(user.uid, kind, record.id, p.id), { pending: 'Membatalkan…', success: 'Pelunasan dibatalkan.', failure: 'Pelunasan belum dibatalkan' }) : undefined });
    for (const u of record.balanceUpdates || []) list.push({ key: `u${u.id}`, date: u.date, label: `Saldo diperbarui ${rupiah(u.from)} → ${rupiah(u.to)}`, detail: u.note, amount: `${u.to > u.from ? '+' : '−'}${rupiah(Math.abs(u.to - u.from))}`, tone: u.to > u.from ? 'up' : 'down' });
    list.push({ key: 'start', date: startDate(record), label: kind === 'receivables' ? 'Piutang dicatat' : 'Utang dicatat', amount: rupiah(record.originalAmount - (record.balanceUpdates || []).reduce((n, u) => n + u.to - u.from, 0)), tone: 'up' });
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.key === 'start' ? 1 : b.key === 'start' ? -1 : 0));
  }, [ledger, record, kind, data.wallets, user?.uid]);
  if (ledger === null) return <p role="status" className="muted">Memuat riwayat…</p>;
  return <ol className="owed-history">{rows.map(row => <li key={row.key} className={`is-${row.tone}`}>
    <span className="owed-history-dot" aria-hidden="true">{row.tone === 'pay' ? <WalletIcon size={13}/> : <PencilLine size={13}/>}</span>
    <span className="owed-history-main"><strong>{row.label}</strong><small>{row.date ? formatDate(row.date) : 'Tanggal tidak tercatat'}{row.detail ? ` · ${row.detail}` : ''}</small></span>
    <span className="owed-history-side"><b>{row.amount}</b>{row.undo && <button type="button" className="icon-btn" aria-label="Batalkan pelunasan ini" title="Batalkan" onClick={row.undo}><Undo2 size={14}/></button>}</span>
  </li>)}</ol>;
}

/**
 * Arsip: debts and receivables that are fully paid, grouped by month and by day of settlement. Months and days fold;
 * each record opens to its full history.
 */
export function OwedArchive({ focus, navigate }: { focus?: string; navigate?: (key: string, target?: string) => void }) {
  const { data } = useApp();
  const [kind, setKind] = useState<'all' | OwedKind>(focus === 'debts' || focus === 'receivables' ? focus : 'all'), [query, setQuery] = useState('');
  type Item = { kind: OwedKind; record: Debt | Receivable; name: string; sub: string; date: string; amount: number };
  const items = useMemo(() => {
    const list: Item[] = [];
    if (kind !== 'receivables') for (const d of data.debts.filter(owedDone)) list.push({ kind: 'debts', record: d, name: d.sourceType === 'split_bill' ? `Utang ke ${d.name}` : d.name, sub: d.provider || 'Utang', date: settledDate(d, data.transactions), amount: d.originalAmount });
    if (kind !== 'debts') for (const r of data.receivables.filter(owedDone)) list.push({ kind: 'receivables', record: r, name: r.person, sub: r.description || 'Piutang', date: settledDate(r, data.transactions), amount: r.originalAmount });
    const q = query.trim().toLocaleLowerCase('id-ID');
    return list.filter(item => !q || `${item.name} ${item.sub}`.toLocaleLowerCase('id-ID').includes(q)).sort((a, b) => b.date.localeCompare(a.date));
  }, [data.debts, data.receivables, data.transactions, kind, query]);
  const months = useMemo(() => {
    const out: { key: string; label: string; days: { key: string; label: string; items: Item[] }[]; total: number; count: number }[] = [];
    for (const item of items) {
      const monthKey = item.date.slice(0, 7) || 'tanpa';
      let month = out.find(m => m.key === monthKey);
      if (!month) { month = { key: monthKey, label: /^\d{4}-\d{2}$/.test(monthKey) ? new Date(`${monthKey}-15T12:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : 'Tanpa tanggal', days: [], total: 0, count: 0 }; out.push(month); }
      let day = month.days.find(d => d.key === item.date);
      if (!day) { day = { key: item.date, label: /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? new Date(`${item.date}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' }) : 'Tanpa tanggal', items: [] }; month.days.push(day); }
      day.items.push(item); month.total += item.amount; month.count++;
    }
    return out;
  }, [items]);
  const counts = { debts: data.debts.filter(owedDone).length, receivables: data.receivables.filter(owedDone).length };
  return <>
    <div className="page-heading"><div><h1>Arsip</h1><p>Utang dan piutang yang sudah lunas, dikelompokkan per bulan dan hari pelunasannya.</p></div></div>
    <div className="owed-toolbar archive-toolbar">
      <div className="ip-seg" role="radiogroup" aria-label="Jenis">{([['all', `Semua (${counts.debts + counts.receivables})`], ['debts', `Utang (${counts.debts})`], ['receivables', `Piutang (${counts.receivables})`]] as ['all' | OwedKind, string][]).map(([key, label]) => <button type="button" role="radio" aria-checked={kind === key} key={key} className={kind === key ? 'active' : ''} onClick={() => setKind(key)}>{label}</button>)}</div>
      <input className="input archive-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari nama…" aria-label="Cari di arsip"/>
    </div>
    {!months.length ? <div className="panel"><p className="empty">{query ? 'Tidak ada yang cocok.' : 'Belum ada utang atau piutang yang lunas.'}</p></div>
      : <div className="archive-months">{months.map((month, index) => <details className="archive-month" key={month.key} open={index === 0 || undefined}>
        <summary><span><strong>{month.label}</strong><small>{month.count} catatan</small></span><b>{rupiah(month.total)}</b><ChevronDown size={17} className="archive-chev" aria-hidden="true"/></summary>
        {month.days.map(day => <details className="archive-day" key={day.key} open>
          <summary><span>{day.label}</span><small>{day.items.length}</small><ChevronDown size={15} className="archive-chev" aria-hidden="true"/></summary>
          {day.items.map(item => <details className="archive-item" key={`${item.kind}:${item.record.id}`}>
            <summary><span className={`archive-kind is-${item.kind}`}>{item.kind === 'debts' ? 'Utang' : 'Piutang'}</span><span className="archive-main"><strong>{item.name}</strong><small>{item.sub}</small></span><b>{rupiah(item.amount)}</b></summary>
            <div className="archive-body"><OwedHistory kind={item.kind} record={item.record}/>{item.record.sourceType === 'split_bill' && item.record.splitBillId && navigate && <button type="button" className="link-button" onClick={() => navigate('splitbill', `bill:${item.record.splitBillId}`)}>Buka Split Bill</button>}</div>
          </details>)}
        </details>)}
      </details>)}</div>}
  </>;
}
