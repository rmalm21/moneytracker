'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Emoji, EmojiText, emojiAvatar } from './emoji';
import { ArrowRight, CalendarClock, CalendarDays, Copy, Edit3, Gauge, History, Layers3, Pause, Play, Store, Target, Trash2, TrendingUp, Wallet as WalletIcon } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from './app-provider';
import { Dialog, DialogContent } from './ui/dialog';
import { Confirm } from './ui/alert-dialog';
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
  return <section className="bd-block"><header className="bd-block-head"><h3><span aria-hidden="true">{icon}</span>{title}</h3>{hint && <small>{hint}</small>}</header>{children}</section>;
}
type BarRow = { key: string; label: ReactNode; amount: number; note?: string; muted?: boolean; current?: boolean };
function Bars({ rows, total }: { rows: BarRow[]; total: number }) {
  const max = Math.max(1, ...rows.map(r => r.amount));
  return <ul className="bd-bars">{rows.map(r => <li key={r.key} className={`${r.muted ? 'is-muted' : ''} ${r.current ? 'is-current' : ''}`}>
    <div className="bd-bar-top"><span className="bd-bar-label">{r.label}</span><strong>{rupiah(r.amount)}</strong></div>
    <div className="bd-bar-bottom"><span className="bd-track">{r.amount > 0 && <i style={{ width: `${Math.max(3, r.amount / max * 100)}%` }}/>}</span><small>{r.muted ? 'belum berjalan' : `${pct(r.amount, total)}%${r.note ? ` · ${r.note}` : ''}`}</small></div>
  </li>)}</ul>;
}
function Stat({ icon, label, value, hint, tone }: { icon: ReactNode; label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  return <div className={`bd-stat ${tone ? `is-${tone}` : ''}`}><span className="bd-stat-label"><span aria-hidden="true">{icon}</span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}

/** Full breakdown of one budget: status, pace, where the money went, commitments, history and transactions. */
export function BudgetDetail({ budget, onClose, onEdit, onToggle, onCopy, onDelete, navigate, openTx }: { budget: Budget | null; onClose: () => void; onEdit: (b: Budget) => void; onToggle: (b: Budget) => void; onCopy: (b: Budget) => void; onDelete: (b: Budget) => void; navigate?: (view: string, focus?: string) => void; openTx?: (preset?: Partial<LedgerTx>, editing?: LedgerTx) => void }) {
  const { data, profile } = useApp();
  const [tab, setTab] = useState<'summary' | 'breakdown' | 'tx'>('summary');
  useEffect(() => setTab('summary'), [budget?.id]);
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

    <div className="bd-stats">
      <Stat icon={<CalendarClock size={14}/>} label="Jatah aman/hari" value={rupiah(Math.max(0, Math.floor(available / Math.max(1, detail.daysLeft))))} hint={`${detail.daysLeft} hari tersisa`}/>
      <Stat icon={<Gauge size={14}/>} label="Rata-rata/hari" value={rupiah(Math.round(detail.dailyAvg))} hint={`Ideal ${rupiah(Math.round(detail.ideal))}`} tone={detail.dailyAvg > detail.ideal ? 'bad' : 'good'}/>
      <Stat icon={<TrendingUp size={14}/>} label="Perkiraan akhir" value={rupiah(projected)} hint={`${projectedOver > 0 ? `Lebih ${rupiah(projectedOver)}` : `Sisa ±${rupiah(-projectedOver)}`}${early ? ' · rata-rata 3 periode' : ''}`} tone={projectedOver > 0 ? 'bad' : 'good'}/>
      <Stat icon={<Target size={14}/>} label="Batas anggaran" value={rupiah(status.available)} hint={budget.rolloverEnabled && budget.rolloverCarry ? `Termasuk sisa lalu ${rupiah(budget.rolloverCarry)}` : budget.amount !== status.available ? `Dasar ${rupiah(budget.amount)}` : 'Per periode'}/>
    </div>

    <div className="analysis-tabs bd-tabs" role="tablist" aria-label="Bagian rincian">{([['summary', 'Ringkasan'], ['breakdown', 'Rincian'], ['tx', `Transaksi (${detail.items.length})`]] as const).map(([key, label]) => <button type="button" role="tab" key={key} aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>

    {tab === 'summary' && <>
      <Block icon={<TrendingUp size={16}/>} title="Laju belanja">
        <div className="bd-chart-legend"><span><i className="spent"/>Terpakai</span><span><i className="ideal"/>Laju ideal</span><span><i className="limit"/>Batas</span></div>
        <div className="report-chart short bd-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={detail.pace} margin={{ top: 10, right: 6, bottom: 0, left: 0 }}>
          <defs><linearGradient id="bd-pace" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={.35}/><stop offset="100%" stopColor="var(--accent)" stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4"/>
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16}/>
          <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={42} domain={[0, (max: number) => Math.max(max, status.available) * 1.05]} allowDecimals={false}/>
          <Tooltip labelFormatter={(_, p) => p?.[0]?.payload?.date ? formatDate(p[0].payload.date) : ''} formatter={(v, name) => [v === null ? '–' : rupiah(Number(v)), name]} contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)' }}/>
          <ReferenceLine y={status.available} stroke="var(--rose)" strokeDasharray="4 4"/>
          <Line type="linear" dataKey="ideal" name="Laju ideal" stroke="var(--muted)" strokeDasharray="5 4" dot={false} strokeWidth={1.5} isAnimationActive={false}/>
          <Area type="monotone" dataKey="spent" name="Terpakai" stroke="var(--accent)" fill="url(#bd-pace)" strokeWidth={3} dot={detail.elapsed <= 3 ? { r: 4, fill: 'var(--accent)', strokeWidth: 0 } : false} connectNulls={false} animationDuration={700}/>
        </AreaChart></ResponsiveContainer></div>
      </Block>
      <div className="bd-grid">
        <Block icon={<CalendarClock size={16}/>} title="Direncanakan, belum dibayar" hint="Mengurangi sisa">
          {pending.length ? <ul className="bd-list">{pending.map(item => <li key={item.id}><span><strong>{item.title}</strong><small>{formatDate(item.date)} · {item.source === 'inbox' ? 'Perlu dikonfirmasi' : item.source === 'planned' ? 'Rencana' : 'Rutin'}</small></span><strong className="amount-negative">−{rupiah(item.amount)}</strong></li>)}</ul> : <p className="bd-empty">Tidak ada komitmen untuk anggaran ini.</p>}
        </Block>
        <Block icon={<History size={16}/>} title="Periode sebelumnya" hint={`Batas ${rupiah(budget.amount)}`}>
          {past.loading ? <p className="bd-empty" role="status">Memuat…</p> : <ul className="bd-bars">{historyRows.map(w => { const used = pct(w.spent, budget.amount); return <li key={w.start} className={used >= 100 ? 'is-over' : used >= warnAt * 100 ? 'is-warn' : ''}><div className="bd-bar-top"><span className="bd-bar-label">{periodLabel(w)}</span><strong>{rupiah(w.spent)}</strong></div><div className="bd-bar-bottom"><span className="bd-track">{w.spent > 0 && <i style={{ width: `${Math.min(100, Math.max(3, used))}%` }}/>}</span><small>{used}%</small></div></li>; })}</ul>}
        </Block>
      </div>
    </>}

    {tab === 'breakdown' && <div className="bd-grid">
      {!budget.subcategoryId && <Block icon={<Layers3 size={16}/>} title="Per subkategori">
        {detail.bySub.length || detail.unassigned ? <Bars total={detail.spent} rows={[...detail.bySub.map(s => ({ key: s.id, label: <><span className="bd-emoji"><Emoji e={emojiOrFallback(s.icon, '•')}/></span>{s.name}</>, amount: s.amount })), ...(detail.unassigned ? [{ key: 'none', label: <span className="muted">Tanpa subkategori</span>, amount: detail.unassigned }] : [])]}/> : <p className="bd-empty">Belum ada pengeluaran.</p>}
      </Block>}
      <Block icon={<WalletIcon size={16}/>} title="Per dompet">
        {detail.byWallet.length ? <Bars total={detail.spent} rows={detail.byWallet.map(w => { const wallet = data.wallets.find(x => x.id === w.walletId); return { key: w.walletId, label: <><span className="bd-emoji"><AppIcon icon={wallet?.icon}/></span>{wallet?.name || 'Dompet'}</>, amount: w.amount }; })}/> : <p className="bd-empty">Belum ada pengeluaran.</p>}
      </Block>
      <Block icon={<CalendarDays size={16}/>} title="Per minggu">
        <Bars total={detail.spent} rows={detail.weeks.map((w, i) => ({ key: `${i}`, label: <>{w.label}{w.current && <span className="bd-now">minggu ini</span>}</>, amount: w.amount, muted: w.future, current: w.current }))}/>
      </Block>
      <Block icon={<Store size={16}/>} title="Tempat teratas">
        {detail.places.length ? <Bars total={detail.spent} rows={detail.places.map(p => ({ key: p.name, label: p.name, amount: p.amount, note: `${p.count}×` }))}/> : <p className="bd-empty">Isi nama tempat atau keterangan saat mencatat agar terlihat di sini.</p>}
      </Block>
    </div>}

    {tab === 'tx' && <section className="bd-block bd-tx-block">
      {detail.items.length ? <div className="bd-tx"><TxList groupByDate items={detail.items.slice(0, 20).map(t => data.transactions.find(x => x.id === t.id) || t)} onEdit={openTx ? t => { onClose(); openTx(undefined, t); } : undefined}/></div> : <p className="bd-empty">Belum ada transaksi di anggaran ini.</p>}
      {navigate && detail.items.length > 0 && <button type="button" className="link-button" onClick={() => { onClose(); navigate('transactions', focus); }}>{detail.items.length > 20 ? `Lihat ${detail.items.length - 20} lainnya` : 'Buka di Transaksi'} <ArrowRight size={14}/></button>}
    </section>}
    {budget.notes && <p className="notice">{budget.notes}</p>}

    <div className="bd-actions">
      <button type="button" onClick={() => onEdit(budget)}><Edit3 size={17}/><span>Ubah</span></button>
      <button type="button" onClick={() => onToggle(budget)}>{budget.active ? <Pause size={17}/> : <Play size={17}/>}<span>{budget.active ? 'Jeda' : 'Aktifkan'}</span></button>
      <button type="button" onClick={() => onCopy(budget)}><Copy size={17}/><span>Salin</span></button>
      <Confirm title="Hapus anggaran?" description="Transaksi tetap ada. Hanya batas anggarannya yang dihapus." onConfirm={() => onDelete(budget)}><button type="button" className="danger"><Trash2 size={17}/><span>Hapus</span></button></Confirm>
    </div>
  </DialogContent></Dialog>;
}
