'use client';
import { categoryEmoji } from './visual-identity';
import { Emoji } from './emoji';
import { Summary } from './summary';
import { CheckCheck, FileSpreadsheet, Inbox as SumInbox, MoreHorizontal, Pencil, SquareCheck, Trash2, TrendingDown as SumTrendingDown, TrendingUp as SumTrendingUp, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { Empty } from './fields';
import { ConfirmDialog } from './ui/alert-dialog';
import { Dialog, DialogContent } from './ui/dialog';
import { RowCheck, RowMenu, useLongPress, type RowAction } from './row-actions';
import { StatementImport, rememberSkippedImports } from './statement-import';
import { dismissDrafts, newTx, updateImportedDraft, upsertTransaction } from '@/lib/firestore';
import { PURPOSES, missing, purposeLabel, suggestFor, txTypeOf, type Purpose } from '@/lib/import/edit';
import { fromDraft, recordRow } from '@/lib/import/record';
import { rupiah } from '@/lib/accounting';
import { formatDate } from '@/lib/period';
import type { Draft, LedgerTx } from '@/lib/types';

/** The form preset for a waiting draft: a schedule's, or an imported statement row's (with its subcategory and the bank's text). */
const presetOf = (item: Draft): Partial<LedgerTx> => ({ type: item.type, ...(item.debtId ? { debtId: item.debtId } : {}), ...(item.receivableId ? { receivableId: item.receivableId } : {}), amount: item.amount, date: item.plannedDate, walletId: item.walletId, destinationWalletId: item.destinationWalletId, categoryId: item.categoryId, ...(item.subcategoryId ? { subcategoryId: item.subcategoryId } : {}), description: item.name, ...(item.note ? { notes: `Mutasi: ${item.note}` } : {}), draftId: item.id, recurringTransactionId: item.recurringId || null });
const isLoan = (item: Draft) => item.purpose === 'receivable_issue' || item.purpose === 'borrowing';
const moneyIn = (item: Draft) => item.type === 'income' || item.type === 'receivable_payment' || item.purpose === 'borrowing';
type Filter = 'all' | 'ready' | 'check';

/**
 * Perlu dikonfirmasi: schedules and imported statement rows waiting before they change a balance.
 * 8.8 Grouped by day; rows can be ticked (or all at once) to record or delete together; "Catat semua yang siap" and
 * "Hapus semua" act on the whole list (or the filter shown); a long press or the ⋯ button opens a row's menu.
 */
export function TransactionInbox({ openTx, notify }: { openTx: (preset?: Partial<LedgerTx>) => void; notify: (message: string) => void }) {
  const { data, user } = useApp();
  const [error, setError] = useState(''), [importing, setImporting] = useState(false), [busy, setBusy] = useState('');
  const [filter, setFilter] = useState<Filter>('all'), [picked, setPicked] = useState<string[]>([]), [menu, setMenu] = useState<Draft | null>(null);
  const [ask, setAsk] = useState<{ title: string; description: string; label: string; danger?: boolean; run: () => Promise<void> } | null>(null);
  const pending = useMemo(() => data.drafts.filter(row => row.status === 'pending').sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.name.localeCompare(b.name)), [data.drafts]);
  // Ready: nothing missing (a category, both wallets of a move, the debt or receivable paid, the person of a new loan),
  // not a possible double, not a transfer with a person still to decide.
  const problemOf = (item: Draft) => missing(fromDraft(item));
  const ready = pending.filter(item => !problemOf(item)), check = pending.filter(item => problemOf(item));
  const shown = filter === 'ready' ? ready : filter === 'check' ? check : pending;
  const pickedRows = pending.filter(item => picked.includes(item.id)), pickedReady = pickedRows.filter(item => !problemOf(item));
  const allShownPicked = shown.length > 0 && shown.every(item => picked.includes(item.id));
  const days = useMemo(() => { const map = new Map<string, Draft[]>(); for (const item of shown) map.set(item.plannedDate, [...(map.get(item.plannedDate) || []), item]); return [...map]; }, [shown]);
  const hold = useLongPress(id => setMenu(pending.find(item => item.id === id) || null));
  // While rows are ticked the bar for them sits at the bottom; the floating chat button steps aside.
  useEffect(() => { document.body.classList.toggle('ix-picking', picked.length > 0); return () => document.body.classList.remove('ix-picking'); }, [picked.length]);
  const walletName = (id: string | null) => data.wallets.find(w => w.id === id)?.name || '';
  const catOf = (item: Draft) => data.categories.find(c => c.id === (item.subcategoryId || item.categoryId));
  const emojiOf = (item: Draft) => { const c = catOf(item); return c ? categoryEmoji(c, data.categories.find(p => p.id === c.parentId)) : item.type === 'transfer' ? '🔁' : moneyIn(item) ? '💰' : '📥'; };
  /** What the row will be, in a few words: the category, the move, or the loan. */
  function what(item: Draft) {
    if (item.person && !item.purpose) return `Transfer ${moneyIn(item) ? 'dari' : 'ke'} ${item.person}: pilih untuk apa`;
    if (item.type === 'transfer') return `${walletName(item.walletId) || 'Dompet asal belum dipilih'} → ${walletName(item.destinationWalletId) || 'dompet tujuan belum dipilih'}`;
    if (item.purpose && item.purpose !== 'expense' && item.purpose !== 'income') return `${purposeLabel(item.purpose, moneyIn(item) ? 'in' : 'out')}${item.person ? ` · ${item.person}` : ''} · ${walletName(item.walletId)}`;
    const c = catOf(item);
    return `${c ? c.name : 'Kategori belum dipilih'} · ${walletName(item.walletId) || 'Dompet'}`;
  }
  const togglePick = (id: string, on?: boolean) => setPicked(list => (on ?? !list.includes(id)) ? [...new Set([...list, id])] : list.filter(x => x !== id));

  /** One waiting row recorded now: an imported row as it was read and chosen, a schedule as the form would save it. */
  async function recordOne(uid: string, item: Draft) {
    if (item.source === 'import') return recordRow(uid, fromDraft(item), item.id);
    return upsertTransaction(uid, newTx({ ...presetOf(item), type: item.type, amount: item.amount, walletId: item.walletId }));
  }
  async function recordMany(items: Draft[]) {
    if (!user || !items.length) return;
    setError(''); setBusy('post');
    let done = 0; const failed: string[] = [];
    for (const item of items) { try { await recordOne(user.uid, item); done++; } catch (e) { failed.push(`${item.name}: ${(e as Error).message}`); } }
    setBusy(''); setPicked(list => list.filter(id => !items.some(item => item.id === id)));
    notify(`${done} transaksi dicatat. Saldo dompetnya ikut berubah.${failed.length ? ` ${failed.length} perlu dicek satu per satu.` : ''}`);
    if (failed.length) setError(failed.slice(0, 3).join(' · '));
  }
  async function deleteMany(items: Draft[]) {
    if (!user || !items.length) return;
    setError(''); setBusy('delete');
    try {
      const ids = items.map(item => item.id);
      await dismissDrafts(user.uid, ids);
      rememberSkippedImports(user.uid, items.filter(item => item.source === 'import').map(item => item.id));
      setPicked(list => list.filter(id => !ids.includes(id)));
      notify(`${ids.length} dihapus dari Perlu dikonfirmasi. Saldo tidak berubah.`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function choose(item: Draft, purpose: Purpose) {
    if (!user) return;
    const r = fromDraft(item), hint = suggestFor(item.person, r.direction, data.debts, data.receivables);
    try { setError(''); await updateImportedDraft(user.uid, item.id, { purpose, type: txTypeOf({ ...r, purpose }), ...(purpose === 'debt_payment' && hint.debtId ? { debtId: hint.debtId } : {}), ...(purpose === 'receivable_payment' && hint.receivableId ? { receivableId: hint.receivableId } : {}) }); } catch (e) { setError((e as Error).message); }
  }
  /** Opening a row: a new loan is recorded after a confirm (the form has no place for it); anything else opens the form. */
  function open(item: Draft) {
    if (isLoan(item) && item.person) { setAsk({ title: item.purpose === 'receivable_issue' ? `Catat piutang ke ${item.person}?` : `Catat utang dari ${item.person}?`, description: item.purpose === 'receivable_issue' ? `${rupiah(item.amount)} keluar dari ${walletName(item.walletId) || 'dompet'} dan dicatat sebagai piutang yang menunggu dibayar.` : `${rupiah(item.amount)} masuk ke ${walletName(item.walletId) || 'dompet'} dan dicatat sebagai utang.`, label: 'Catat', danger: false, run: () => recordMany([item]) }); return; }
    openTx(presetOf(item));
  }
  const askDelete = (items: Draft[]) => setAsk({ title: items.length === 1 ? `Hapus “${items[0].name}”?` : `Hapus ${items.length} transaksi?`, description: `${items.length === 1 ? 'Transaksi ini' : 'Semuanya'} dihapus dari Perlu dikonfirmasi dan tidak dicatat ke saldo. Baris dari mutasi tidak dimasukkan lagi kalau file yang sama diimpor ulang di perangkat ini; jadwal rutin berikutnya tetap ada.`, label: 'Hapus', run: () => deleteMany(items) });
  const askRecord = (items: Draft[], skipped = 0) => setAsk({ title: `Catat ${items.length} transaksi sekarang?`, description: `Saldo dompetnya langsung berubah.${skipped ? ` ${skipped} lainnya belum lengkap atau mungkin dobel, jadi tetap di sini untuk kamu cek.` : ''}`, label: 'Catat semua', danger: false, run: () => recordMany(items) });
  const menuActions = (item: Draft): RowAction[] => {
    const problem = problemOf(item);
    return [
      { label: isLoan(item) ? 'Catat sekarang' : 'Periksa & ubah', icon: <Pencil size={18} />, hint: isLoan(item) ? undefined : 'Buka formulirnya untuk dicek sebelum dicatat', onSelect: () => open(item) },
      ...(!isLoan(item) ? [{ label: 'Catat sekarang', icon: <Zap size={18} />, disabled: Boolean(problem), hint: problem ? `Belum bisa: ${problem.toLowerCase()}` : 'Langsung dicatat seperti yang tertulis', onSelect: () => void recordMany([item]) }] : []),
      { label: picked.includes(item.id) ? 'Batal pilih' : 'Pilih', icon: <SquareCheck size={18} />, hint: 'Centang untuk dicatat atau dihapus bersama yang lain', onSelect: () => togglePick(item.id) },
      { label: item.source === 'import' ? 'Hapus' : 'Lewati', icon: <Trash2 size={18} />, danger: true, onSelect: () => askDelete([item]) },
    ];
  };

  return <>
    <div className="page-heading"><div><h1>Perlu dikonfirmasi</h1><p>Jadwal rutin dan mutasi yang diimpor di sini belum mengubah saldo. Tinjau sebelum mencatatnya.</p></div><div className="heading-actions"><Button variant="secondary" onClick={() => setImporting(true)}><FileSpreadsheet size={16} /> Impor mutasi</Button></div></div>
    <Summary items={[{ label: 'Menunggu konfirmasi', value: `${pending.length} transaksi`, icon: SumInbox, tone: 'warn' }, { label: 'Total keluar', value: rupiah(pending.filter(i => !moneyIn(i) && i.type !== 'transfer').reduce((n, i) => n + i.amount, 0)), icon: SumTrendingDown, tone: 'out' }, { label: 'Total masuk', value: rupiah(pending.filter(i => moneyIn(i)).reduce((n, i) => n + i.amount, 0)), icon: SumTrendingUp, tone: 'in' }]} />
    {pending.length > 0 && <div className="ix-bar">
      <div className="ix-filters" role="tablist" aria-label="Tampilkan">
        {([['all', 'Semua', pending.length], ['ready', 'Siap dicatat', ready.length], ['check', 'Perlu dicek', check.length]] as const).map(([key, label, n]) => <button key={key} type="button" role="tab" aria-selected={filter === key} className={`ix-filter ${filter === key ? 'is-on' : ''}`} onClick={() => setFilter(key)}>{label}<b>{n}</b></button>)}
      </div>
      <div className="ix-bulk">
        <label className="ix-all"><input type="checkbox" checked={allShownPicked} onChange={e => setPicked(list => e.target.checked ? [...new Set([...list, ...shown.map(i => i.id)])] : list.filter(id => !shown.some(i => i.id === id)))} /><span>Pilih semua{filter !== 'all' ? ' yang tampil' : ''}</span></label>
        <button type="button" className="link-button danger-link" disabled={Boolean(busy)} onClick={() => askDelete(shown)}><Trash2 size={14} /> Hapus semua{filter !== 'all' ? ' yang tampil' : ''} ({shown.length})</button>
      </div>
      {ready.length > 0 && <Button className="ix-record-all" disabled={Boolean(busy)} onClick={() => askRecord(ready, check.length)}><CheckCheck size={16} /> {busy === 'post' ? 'Mencatat…' : `Catat semua yang siap (${ready.length})`}</Button>}
    </div>}
    {pending.length > 0 && <p className="muted page-note">Ketuk untuk memeriksa, tekan lama atau ⋯ untuk pilihan lain. Saldo baru berubah setelah dicatat.</p>}
    {pending.length ? <div className="ix-days">{days.length ? days.map(([day, items]) => <section key={day} className="ix-day">
      <header className="ix-day-head"><span>{formatDate(day)}</span><small>{items.length} transaksi</small></header>
      <ul className="ix-list">{items.map(item => {
        const problem = problemOf(item), selected = picked.includes(item.id), dir = moneyIn(item) ? 'in' : 'out';
        return <li key={item.id} className={`ix-row ${selected ? 'is-picked' : ''} ${problem ? 'needs' : ''}`} {...hold(item.id)}>
          <RowCheck checked={selected} onChange={on => togglePick(item.id, on)} label={`Pilih ${item.name}`} />
          <button type="button" className="ix-row-main" onClick={() => picked.length ? togglePick(item.id) : open(item)}>
            <span className="ix-emoji" aria-hidden="true"><Emoji e={emojiOf(item)} /></span>
            <span className="ix-text"><strong>{item.name}</strong><small>{what(item)}</small>
              <span className="ix-tags">{item.source === 'import' ? <span className="tag">Dari mutasi</span> : <span className="tag">Jadwal rutin</span>}{item.maybeDuplicate && <span className="tag warn">Mungkin dobel</span>}{problem && problem !== 'Mungkin dobel' && <span className="tag warn">{problem}</span>}{isLoan(item) && <span className="tag">{item.purpose === 'receivable_issue' ? 'Piutang baru' : 'Utang baru'}</span>}</span>
            </span>
            <b className={`ix-amount ${dir === 'in' ? 'amount-positive' : ''}`}>{dir === 'in' ? '+' : ''}{rupiah(item.amount)}</b>
          </button>
          <button type="button" className="icon-button ix-more" aria-label={`Pilihan untuk ${item.name}`} data-no-hold onClick={() => setMenu(item)}><MoreHorizontal size={18} /></button>
          {item.maybeDuplicate && <small className="inbox-double">Mirip catatan lama: {item.maybeDuplicate}. Kalau memang sama, hapus yang ini.</small>}
          {item.person && !item.purpose && <div className="si-ask inbox-ask" data-no-hold><small>{dir === 'out' ? `Transfer ke ${item.person}` : `Transfer dari ${item.person}`}, untuk apa?</small><div className="si-chips">{PURPOSES[dir].map(p => <button type="button" key={p.key} className="si-chip" onClick={() => void choose(item, p.key)}>{p.label}</button>)}</div></div>}
        </li>;
      })}</ul>
    </section>) : <Empty message={filter === 'ready' ? 'Belum ada yang siap dicatat. Lengkapi dulu yang perlu dicek.' : 'Semua sudah lengkap.'} />}</div>
      : <Empty message="Tidak ada transaksi yang menunggu konfirmasi." action={<Button variant="secondary" onClick={() => setImporting(true)}><FileSpreadsheet size={16} /> Impor mutasi bank/e-wallet</Button>} />}
    {picked.length > 0 && <div className="ix-picked" role="region" aria-label="Yang dipilih">
      <span><b>{pickedRows.length}</b> dipilih</span>
      <span className="ix-picked-actions">
        <Button className="small" disabled={!pickedReady.length || Boolean(busy)} onClick={() => askRecord(pickedReady, pickedRows.length - pickedReady.length)}><Zap size={15} /> Catat{pickedReady.length ? ` (${pickedReady.length})` : ''}</Button>
        <Button variant="danger" className="small" disabled={Boolean(busy)} onClick={() => askDelete(pickedRows)}><Trash2 size={15} /> Hapus</Button>
        <button type="button" className="icon-button" aria-label="Batal pilih" onClick={() => setPicked([])}><X size={18} /></button>
      </span>
    </div>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {menu && <RowMenu open={Boolean(menu)} onOpenChange={o => { if (!o) setMenu(null); }} title={menu.name} subtitle={<>{formatDate(menu.plannedDate)} · <b className={moneyIn(menu) ? 'amount-positive' : ''}>{moneyIn(menu) ? '+' : ''}{rupiah(menu.amount)}</b> · {what(menu)}</>} actions={menuActions(menu)}>
      {menu.person && !menu.purpose && <div className="si-ask"><small>Transfer {moneyIn(menu) ? 'dari' : 'ke'} {menu.person}, untuk apa?</small><div className="si-chips">{PURPOSES[moneyIn(menu) ? 'in' : 'out'].map(p => <button type="button" key={p.key} className="si-chip" onClick={() => { void choose(menu, p.key); setMenu(null); }}>{p.label}</button>)}</div></div>}
    </RowMenu>}
    {ask && <ConfirmDialog open onOpenChange={o => { if (!o) setAsk(null); }} title={ask.title} description={ask.description} confirmLabel={ask.label} danger={ask.danger !== false} onConfirm={async () => { const run = ask.run; setAsk(null); await run(); }} />}
    <Dialog open={importing} onOpenChange={setImporting}><DialogContent title="Impor mutasi"><StatementImport openTx={preset => { setImporting(false); openTx(preset); }} onDone={message => { setImporting(false); notify(message); }} /></DialogContent></Dialog>
  </>;
}
