'use client';
import { useMemo, type ReactNode } from 'react';
import { ArrowRight, CalendarClock, CalendarDays, Copy, Edit3, Gauge, History, Layers3, Pause, Play, Receipt, Store, Target, Trash2, TrendingUp, Wallet as WalletIcon } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from './app-provider';
import { Dialog, DialogContent } from './ui/dialog';
import { Confirm } from './ui/alert-dialog';
import { Summary } from './summary';
import { TxList } from './dashboard';
import { AppIcon, IdentityBadge, categoryColor, emojiOrFallback } from './visual-identity';
import { usePeriodTransactions } from './period-selector';
import { budgetCurrent, budgetSpent, budgetWindow, rupiah } from '@/lib/accounting';
import { budgetCommitted, commitments } from '@/lib/finance-control';
import { budgetDetail, previousWindows } from '@/lib/budget-detail';
import { dateInTimeZone, formatDate, periodLabel, todayInTimeZone } from '@/lib/period';
import type { Budget, LedgerTx } from '@/lib/types';

const shortMoney = (value: number) => { const abs = Math.abs(value); return abs >= 1e6 ? `${(value / 1e6).toFixed(1).replace('.', ',')}jt` : abs >= 1e3 ? `${Math.round(value / 1e3)}rb` : `${value}`; };
const pct = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 100) : 0;

function Block({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return <section className="bd-block"><div className="report-section-head"><span className="report-section-icon" aria-hidden="true">{icon}</span><div><h3>{title}</h3>{hint && <small>{hint}</small>}</div></div>{children}</section>;
}
function Bars({ rows, total, color }: { rows: { key: string; label: ReactNode; amount: number; note?: string }[]; total: number; color?: string }) {
  const max = Math.max(1, ...rows.map(r => r.amount));
  return <div className="report-table">{rows.map(r => <div key={r.key} className="report-row"><span className="bd-row-label">{r.label}</span><span className="report-row-bar"><i style={{ width: `${Math.max(2, r.amount / max * 100)}%`, background: color }}/></span><span className="report-row-value"><strong>{rupiah(r.amount)}</strong><small>{pct(r.amount, total)}%{r.note ? ` · ${r.note}` : ''}</small></span></div>)}</div>;
}

/** Full breakdown of one budget: status, pace, where the money went, commitments, history and transactions. */
export function BudgetDetail({ budget, onClose, onEdit, onToggle, onCopy, onDelete, navigate, openTx }: { budget: Budget | null; onClose: () => void; onEdit: (b: Budget) => void; onToggle: (b: Budget) => void; onCopy: (b: Budget) => void; onDelete: (b: Budget) => void; navigate?: (view: string, focus?: string) => void; openTx?: (preset?: Partial<LedgerTx>, editing?: LedgerTx) => void }) {
  const { data, profile } = useApp();
  const salaryDay = profile?.salaryCycleStartDay || 24, now = dateInTimeZone(new Date(), profile?.timeZone), today = todayInTimeZone(profile?.timeZone);
  const window = budget ? budgetWindow(budget, now, salaryDay) : { start: today, end: today };
  const history = budget ? previousWindows(window, 3, date => budgetWindow(budget, date, salaryDay)) : [];
  const past = usePeriodTransactions({ start: history[0]?.start || window.start, end: window.start });
  const status = budget ? budgetCurrent(budget, data.transactions, data.categories, now, salaryDay) : null;
  const committed = budget ? budgetCommitted(budget, data, now, salaryDay) : 0;
  const detail = useMemo(() => budget && status ? budgetDetail(budget, data.transactions, data.categories, window, today, status.available) : null, [budget, data.transactions, data.categories, window.start, window.end, today, status?.available]);
  if (!budget || !status || !detail) return null;
  const cat = data.categories.find(c => c.id === (budget.subcategoryId || budget.categoryId));
  const available = status.remaining - committed, limit = Math.max(1, status.available);
  const usedPct = Math.min(100, status.spent / limit * 100), commitPct = Math.min(100 - usedPct, committed / limit * 100);
  const warnAt = (budget.warningPercent || profile?.budgetWarningPercent || 80) / 100;
  const tone = available < 0 || status.spent > status.available ? 'over' : (status.spent + committed) / limit >= warnAt ? 'warn' : 'ok';
  const statusText = tone === 'over' ? 'Terlampaui' : tone === 'warn' ? 'Hampir habis' : 'Aman';
  const historyRows = history.map(w => ({ ...w, spent: budgetSpent(budget, past.items.filter(t => t.date >= w.start && t.date < w.end), data.categories) }));
  const pastWithData = historyRows.filter(w => w.spent > 0), pastAverage = pastWithData.length ? Math.round(pastWithData.reduce((n, w) => n + w.spent, 0) / pastWithData.length) : 0;
  // A few days in, the pace says little; lean on the average of earlier periods instead.
  const early = detail.elapsed < 7 && pastAverage > 0 && !past.loading;
  const projected = early ? Math.max(detail.spent, pastAverage) : detail.projected;
  const projectedOver = projected - status.available;
  const children = new Set(data.categories.filter(c => c.parentId === budget.categoryId).map(c => c.id));
  const matches = (categoryId: string | null, subcategoryId: string | null) => budget.subcategoryId ? subcategoryId === budget.subcategoryId : categoryId === budget.categoryId || children.has(categoryId || '') || children.has(subcategoryId || '');
  const pending = [...commitments(data, window), ...commitments(data).filter(item => item.date < window.start)].filter(item => matches(item.categoryId, item.subcategoryId));
  const focus = `category:${budget.subcategoryId || budget.categoryId}@${window.start}..${window.end}`;
  return <Dialog open onOpenChange={next => { if (!next) onClose(); }}><DialogContent title="Rincian anggaran" className="budget-detail-dialog">
    <div className={`bd-hero is-${tone}`}>
      <div className="bd-hero-top"><IdentityBadge icon={cat?.icon} color={categoryColor(data.categories, cat)} label={budget.name}/><span className={`tag ${tone === 'over' ? 'danger' : tone === 'warn' ? 'warn' : ''}`}>{budget.active ? statusText : 'Jeda'}</span></div>
      <small>{available < 0 ? 'Melebihi anggaran' : 'Masih bisa dipakai'}</small>
      <strong className={available < 0 ? 'amount-negative' : ''}>{rupiah(available)}</strong>
      <div className="bd-stack" aria-label={`Terpakai ${Math.round(usedPct)}%, direncanakan ${Math.round(commitPct)}%`}><i className="used" style={{ width: `${usedPct}%` }}/><i className="planned" style={{ width: `${commitPct}%` }}/></div>
      <div className="bd-legend"><span><i className="used"/>Terpakai {rupiah(status.spent)} ({pct(status.spent, limit)}%)</span><span><i className="planned"/>Direncanakan {rupiah(committed)}</span><span><i/>Batas {rupiah(status.available)}</span></div>
      <small className="muted">{periodLabel(window)} · hari ke-{detail.elapsed} dari {detail.totalDays} · {detail.daysLeft} hari lagi</small>
    </div>

    <Summary className="bd-summary" items={[
      { label: 'Anggaran', value: rupiah(status.available), icon: Target, hint: budget.rolloverEnabled && budget.rolloverCarry ? `Termasuk sisa lalu ${rupiah(budget.rolloverCarry)}` : undefined },
      { label: 'Jatah aman per hari', value: rupiah(Math.max(0, Math.floor(available / Math.max(1, detail.daysLeft)))), icon: CalendarClock, tone: 'in', hint: `Untuk ${detail.daysLeft} hari tersisa` },
      { label: 'Rata-rata per hari', value: rupiah(Math.round(detail.dailyAvg)), icon: Gauge, tone: detail.dailyAvg > detail.ideal ? 'out' : 'accent', hint: `Ideal ${rupiah(Math.round(detail.ideal))}/hari` },
      { label: 'Perkiraan akhir periode', value: rupiah(projected), icon: TrendingUp, tone: projectedOver > 0 ? 'out' : 'in', hint: `${projectedOver > 0 ? `Lebih ${rupiah(projectedOver)}` : `Sisa ±${rupiah(-projectedOver)}`} · ${early ? 'dari rata-rata 3 periode lalu' : 'jika laju sama'}` },
    ]}/>

    <Block icon={<TrendingUp size={18}/>} title="Laju belanja" hint="Garis putus-putus = laju ideal agar pas di batas">
      <div className="report-chart short"><ResponsiveContainer width="100%" height="100%"><AreaChart data={detail.pace} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs><linearGradient id="bd-pace" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={.35}/><stop offset="100%" stopColor="var(--accent)" stopOpacity={0}/></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4"/>
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} minTickGap={10}/>
        <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={46}/>
        <Tooltip labelFormatter={(_, p) => p?.[0]?.payload?.date ? formatDate(p[0].payload.date) : ''} formatter={(v, name) => [v === null ? '–' : rupiah(Number(v)), name]} contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)' }}/>
        <ReferenceLine y={status.available} stroke="var(--rose)" strokeDasharray="4 4" label={{ value: 'Batas', position: 'insideTopRight', fill: 'var(--rose)', fontSize: 11 }}/>
        <Line type="linear" dataKey="ideal" name="Laju ideal" stroke="var(--muted)" strokeDasharray="5 4" dot={false} strokeWidth={1.5}/>
        <Area type="monotone" dataKey="spent" name="Terpakai" stroke="var(--accent)" fill="url(#bd-pace)" strokeWidth={3} dot={false} connectNulls={false} animationDuration={700}/>
      </AreaChart></ResponsiveContainer></div>
    </Block>

    <div className="bd-grid">
      {!budget.subcategoryId && <Block icon={<Layers3 size={18}/>} title="Per subkategori" hint={`Dari ${rupiah(detail.spent)} terpakai`}>
        {detail.bySub.length || detail.unassigned ? <Bars total={detail.spent} rows={[...detail.bySub.map(s => ({ key: s.id, label: <>{emojiOrFallback(s.icon, '•')} {s.name}</>, amount: s.amount, note: `${pct(s.amount, limit)}% batas` })), ...(detail.unassigned ? [{ key: 'none', label: <>• Tanpa subkategori</>, amount: detail.unassigned }] : [])]} color={categoryColor(data.categories, cat)}/> : <p className="muted">Belum ada pengeluaran.</p>}
      </Block>}
      <Block icon={<WalletIcon size={18}/>} title="Per dompet">
        {detail.byWallet.length ? <Bars total={detail.spent} rows={detail.byWallet.map(w => { const wallet = data.wallets.find(x => x.id === w.walletId); return { key: w.walletId, label: <span className="bd-wallet"><span className="report-wallet-icon"><AppIcon icon={wallet?.icon}/></span>{wallet?.name || 'Dompet'}</span>, amount: w.amount }; })}/> : <p className="muted">Belum ada pengeluaran.</p>}
      </Block>
      <Block icon={<CalendarDays size={18}/>} title="Per minggu">
        <Bars total={detail.spent} rows={detail.weeks.map((w, i) => ({ key: `${i}`, label: w.label, amount: w.amount }))}/>
      </Block>
      <Block icon={<Store size={18}/>} title="Tempat teratas">
        {detail.places.length ? <Bars total={detail.spent} rows={detail.places.map(p => ({ key: p.name, label: p.name, amount: p.amount, note: `${p.count}×` }))}/> : <p className="muted">Isi nama tempat atau keterangan saat mencatat agar terlihat di sini.</p>}
      </Block>
    </div>

    <div className="bd-grid">
      <Block icon={<CalendarClock size={18}/>} title="Direncanakan, belum dibayar" hint="Mengurangi sisa anggaran">
        {pending.length ? <div className="report-table">{pending.map(item => <div key={item.id} className="report-row bd-plain"><span><strong>{item.title}</strong><small className="muted">{formatDate(item.date)} · {item.source === 'inbox' ? 'Perlu dikonfirmasi' : item.source === 'planned' ? 'Rencana' : 'Rutin'}</small></span><strong className="amount-negative">−{rupiah(item.amount)}</strong></div>)}</div> : <p className="muted">Tidak ada komitmen untuk anggaran ini.</p>}
      </Block>
      <Block icon={<History size={18}/>} title="Periode sebelumnya" hint="Terpakai dibanding batas saat ini">
        {past.loading ? <p className="muted" role="status">Memuat…</p> : <div className="report-table">{historyRows.map(w => { const used = pct(w.spent, budget.amount); return <div key={w.start} className="report-row"><span><strong>{periodLabel(w)}</strong></span><span className="report-row-bar"><i className={used >= 100 ? 'over' : used >= warnAt * 100 ? 'warn' : ''} style={{ width: `${Math.min(100, Math.max(2, used))}%` }}/></span><span className="report-row-value"><strong>{rupiah(w.spent)}</strong><small>{used}% dari {rupiah(budget.amount)}</small></span></div>; })}</div>}
      </Block>
    </div>

    <Block icon={<Receipt size={18}/>} title="Transaksi periode ini" hint={`${detail.items.length} transaksi`}>
      {detail.items.length ? <div className="panel flush bd-tx"><TxList items={detail.items.slice(0, 8).map(t => data.transactions.find(x => x.id === t.id) || t)} onEdit={openTx ? t => { onClose(); openTx(undefined, t); } : undefined}/></div> : <p className="muted">Belum ada transaksi di anggaran ini.</p>}
      {navigate && detail.items.length > 0 && <button type="button" className="link-button" onClick={() => { onClose(); navigate('transactions', focus); }}>Lihat semua di Transaksi <ArrowRight size={14}/></button>}
    </Block>
    {budget.notes && <p className="notice">{budget.notes}</p>}

    <div className="bd-actions">
      <button type="button" onClick={() => onEdit(budget)}><Edit3 size={17}/><span>Ubah</span></button>
      <button type="button" onClick={() => onToggle(budget)}>{budget.active ? <Pause size={17}/> : <Play size={17}/>}<span>{budget.active ? 'Jeda' : 'Aktifkan'}</span></button>
      <button type="button" onClick={() => onCopy(budget)}><Copy size={17}/><span>Salin</span></button>
      <Confirm title="Hapus anggaran?" description="Transaksi tetap ada. Hanya batas anggarannya yang dihapus." onConfirm={() => onDelete(budget)}><button type="button" className="danger"><Trash2 size={17}/><span>Hapus</span></button></Confirm>
    </div>
  </DialogContent></Dialog>;
}
