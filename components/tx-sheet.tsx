'use client';
/**
 * 10.3.2 The transactions behind a link ("Lihat transaksi", "Rapikan", an Insight card, a chat answer…), opened in place as
 * a sheet over the page instead of jumping to Transaksi and back. The same reading of the link as the Transaksi page
 * (lib/tx-focus.ts); a tap edits, and the sheet comes back after saving, so a list can be tidied one by one.
 * "Buka di Transaksi" still opens the full page (search, filters, CSV).
 */
import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useApp } from './app-provider';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Empty } from './fields';
import { TxList, typeLabels } from './dashboard';
import { usePeriodTransactions } from './period-selector';
import { moneyIn, moneyOut, newestFirst, rupiah } from '@/lib/accounting';
import { dateInTimeZone, periodLabel, resolvePeriodRange } from '@/lib/period';
import { focusTitle, matchesFocus, readFocus } from '@/lib/tx-focus';
import type { LedgerTx } from '@/lib/types';

const PAGE = 30;

export function TxSheet({ focus, onClose, onEdit, onOpenPage }: { focus: string; onClose: () => void; onEdit: (tx: LedgerTx) => void; onOpenPage: () => void }) {
  const { data, profile } = useApp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const f = useMemo(() => readFocus(focus, data.categories), [focus]);
  // A link without a period shows the current cycle, like the Transaksi page.
  const range = f.range || resolvePeriodRange('salary_cycle', profile?.salaryCycleStartDay || 24, dateInTimeZone(new Date(), profile?.timeZone));
  const history = usePeriodTransactions(range);
  const items = useMemo(() => history.items.filter(t => matchesFocus(t, { ...f, query: f.search.toLocaleLowerCase('id-ID') }, data.categories, data.wallets)).sort(newestFirst), [history.items, f, data.categories, data.wallets]);
  const [limit, setLimit] = useState(PAGE);
  const shown = items.slice(0, limit);
  const totalIn = items.reduce((n, t) => n + moneyIn(t), 0), totalOut = items.reduce((n, t) => n + moneyOut(t), 0);
  const title = focusTitle(f, data.categories, data.wallets, t => typeLabels[t] || t);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent title={title} className="tx-sheet">
      <div className="tx-sheet-head">
        <small>{periodLabel(range)} · <b>{history.loading ? '…' : `${items.length} transaksi`}</b></small>
        {!history.loading && items.length > 0 && <span className="tx-sheet-sum">{totalIn > 0 && <span>Masuk <b className="amount-positive">{rupiah(totalIn)}</b></span>}{totalOut > 0 && <span>Keluar <b>{rupiah(totalOut)}</b></span>}</span>}
        {f.noSub && items.length > 0 && <p className="tx-sheet-tip">Ketuk transaksinya, pilih subkategorinya, simpan. Daftar ini muncul lagi setelahnya.</p>}
      </div>
      {history.loading ? <p className="tx-sheet-loading" role="status">Memuat transaksinya…</p>
        : items.length ? <div className="tx-results tx-sheet-list"><TxList items={shown} groupByDate onEdit={onEdit}/>{items.length > shown.length && <div className="list-more"><Button variant="secondary" onClick={() => setLimit(n => n + PAGE)}>Tampilkan {Math.min(PAGE, items.length - shown.length)} lagi</Button></div>}</div>
        : <Empty message={f.noSub ? 'Beres, semua sudah punya subkategori.' : 'Tidak ada transaksi di sini.'}/>}
      <div className="tx-sheet-foot"><button type="button" className="link-button" onClick={onOpenPage}>Buka di Transaksi <ArrowRight size={14}/></button></div>
    </DialogContent>
  </Dialog>;
}
