'use client';
import { emojiOrFallback } from './visual-identity';
import { emojiAvatar } from './emoji';
import { Summary } from './summary';
import { FileSpreadsheet, Inbox as SumInbox, TrendingDown as SumTrendingDown, TrendingUp as SumTrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { Empty } from './fields';
import { Confirm } from './ui/alert-dialog';
import { Dialog, DialogContent } from './ui/dialog';
import { StatementImport, rememberSkippedImports } from './statement-import';
import { dismissDraft, dismissDrafts, newTx, upsertTransaction } from '@/lib/firestore';
import { rupiah } from '@/lib/accounting';
import { formatDate } from '@/lib/period';
import type { Draft, LedgerTx } from '@/lib/types';

/** The form preset for a waiting draft: a schedule's, or an imported statement row's (with its subcategory and the bank's text). */
const presetOf = (item: Draft): Partial<LedgerTx> => ({ type: item.type, amount: item.amount, date: item.plannedDate, walletId: item.walletId, destinationWalletId: item.destinationWalletId, categoryId: item.categoryId, ...(item.subcategoryId ? { subcategoryId: item.subcategoryId } : {}), description: item.name, ...(item.note ? { notes: `Mutasi: ${item.note}` } : {}), draftId: item.id, recurringTransactionId: item.recurringId || null });

export function TransactionInbox({ openTx, notify }: { openTx: (preset?: Partial<LedgerTx>) => void; notify: (message: string) => void }) {
  const { data, user } = useApp();
  const [error, setError] = useState(''), [importing, setImporting] = useState(false), [busy, setBusy] = useState('');
  const pending = data.drafts.filter(row => row.status === 'pending').sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  const imported = pending.filter(row => row.source === 'import');
  // Ready to record as they are: a category guessed (or a move between own wallets).
  const ready = imported.filter(row => row.type === 'transfer' ? Boolean(row.destinationWalletId) : Boolean(row.categoryId));
  async function skip(item: Draft) {
    if (!user) return;
    try { setError(''); await dismissDraft(user.uid, item.id); if (item.source === 'import') rememberSkippedImports(user.uid, [item.id]); notify('Transaksi dilewati. Saldo tidak berubah.'); } catch (e) { setError((e as Error).message); }
  }
  async function skipImported() {
    if (!user || !imported.length) return;
    try { setError(''); setBusy('skip'); const ids = imported.map(x => x.id); await dismissDrafts(user.uid, ids); rememberSkippedImports(user.uid, ids); notify(`${ids.length} baris mutasi dilewati. Saldo tidak berubah.`); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  /** Every imported row with a category, recorded one by one (each changes its wallet's balance); the rest stay to check. */
  async function recordReady() {
    if (!user || !ready.length) return;
    setError(''); setBusy('post');
    let done = 0; const failed: string[] = [];
    for (const item of ready) {
      try { const p = presetOf(item); await upsertTransaction(user.uid, newTx({ ...p, type: item.type, amount: item.amount, walletId: item.walletId })); done++; } catch (e) { failed.push(`${item.name}: ${(e as Error).message}`); }
    }
    setBusy('');
    notify(`${done} transaksi dari mutasi dicatat.${failed.length ? ` ${failed.length} perlu dicek satu per satu.` : ''}`);
    if (failed.length) setError(failed.slice(0, 3).join(' · '));
  }
  return <>
    <div className="page-heading"><div><h1>Perlu dikonfirmasi</h1><p>Jadwal rutin dan mutasi yang diimpor di sini belum mengubah saldo. Tinjau sebelum mencatatnya.</p></div><div className="heading-actions"><Button variant="secondary" onClick={() => setImporting(true)}><FileSpreadsheet size={16} /> Impor mutasi</Button></div></div>
    <Summary items={[{ label: 'Menunggu konfirmasi', value: `${pending.length} transaksi`, icon: SumInbox, tone: 'warn' }, { label: 'Total keluar', value: rupiah(pending.filter(i => i.type !== 'income').reduce((n, i) => n + i.amount, 0)), icon: SumTrendingDown, tone: 'out' }, { label: 'Total masuk', value: rupiah(pending.filter(i => i.type === 'income').reduce((n, i) => n + i.amount, 0)), icon: SumTrendingUp, tone: 'in' }]} />
    <p className="muted page-note">Setelah dikonfirmasi, transaksi ini dicatat dan saldo ikut berubah.</p>
    {imported.length > 0 && <div className="notice notice-action inbox-import-bar"><span><strong>{imported.length} dari mutasi</strong> · {ready.length} sudah ada kategorinya</span><span className="toolbar-row">
      {ready.length > 0 && <Confirm title={`Catat ${ready.length} transaksi dari mutasi?`} description="Semua baris mutasi yang sudah ada kategorinya dicatat sekaligus dan saldo dompetnya ikut berubah. Baris tanpa kategori tetap di sini untuk kamu periksa." onConfirm={() => void recordReady()}><Button className="small" disabled={Boolean(busy)}>{busy === 'post' ? 'Mencatat…' : `Catat ${ready.length} yang lengkap`}</Button></Confirm>}
      <Confirm title="Lewati semua baris mutasi?" description="Baris mutasi yang menunggu tidak dicatat. Kalau file yang sama diimpor lagi di perangkat ini, baris ini tidak dimasukkan lagi." onConfirm={() => void skipImported()}><button type="button" className="link-button" disabled={Boolean(busy)}>Lewati semua dari mutasi</button></Confirm>
    </span></div>}
    <div className="fin-list" style={{ marginTop: 16 }}>{pending.length ? pending.map(item => <div className="data-row" key={item.id}>
      <div className="data-row-main" {...emojiAvatar(emojiOrFallback(data.categories.find(c => c.id === (item.subcategoryId || item.categoryId))?.icon, item.type === 'income' ? '💰' : item.type === 'transfer' ? '🔁' : '📥'))}><strong>{item.name}</strong><small className="entry-meta"><span className="tag warn">Menunggu konfirmasi</span>{item.source === 'import' && <span className="tag">Dari mutasi</span>}<span>{formatDate(item.plannedDate)}</span><span>· {data.wallets.find(w => w.id === item.walletId)?.name || 'Dompet'}{item.type === 'transfer' && item.destinationWalletId ? ` → ${data.wallets.find(w => w.id === item.destinationWalletId)?.name || 'dompet lain'}` : ''}</span></small></div>
      <div className="data-row-side"><strong className={item.type === 'income' ? 'amount-positive' : ''}>{item.type === 'income' ? '+' : ''}{rupiah(item.amount)}</strong><div className="toolbar-row"><Button className="small" onClick={() => openTx(presetOf(item))}>Periksa & konfirmasi</Button><Confirm title="Lewati transaksi ini?" description={item.source === 'import' ? 'Baris mutasi ini tidak dicatat ke saldo, dan tidak dimasukkan lagi kalau file yang sama diimpor ulang di perangkat ini.' : 'Transaksi ini tidak akan dicatat ke saldo. Jadwal rutin berikutnya tetap ada.'} onConfirm={() => void skip(item)}><button type="button" className="link-button">Lewati</button></Confirm></div></div>
    </div>) : <Empty message="Tidak ada transaksi yang menunggu konfirmasi." action={<Button variant="secondary" onClick={() => setImporting(true)}><FileSpreadsheet size={16} /> Impor mutasi bank/e-wallet</Button>} />}</div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <Dialog open={importing} onOpenChange={setImporting}><DialogContent title="Impor mutasi"><StatementImport openTx={preset => { setImporting(false); openTx(preset); }} onDone={count => { setImporting(false); notify(`${count} baris mutasi masuk ke Perlu dikonfirmasi. Saldo belum berubah.`); }} /></DialogContent></Dialog>
  </>;
}
