'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeftRight, BarChart3, CalendarDays, CalendarRange, Clock3, Layers3, Lightbulb, PiggyBank, Printer, Receipt, Scale, ScrollText, Sparkles, Store, Target, TrendingDown, TrendingUp, Wallet as WalletIcon, Wallet2, type LucideIcon } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from './app-provider';
import { Empty, Field, Select, categoryOptions } from './fields';
import { PeriodSelector, usePeriodTransactions } from './period-selector';
import { CategoryDonut } from './category-donut';
import { Delta } from './delta';
import { AnimatedRupiah } from './forecast';
import { AppIcon, IdentityBadge } from './visual-identity';
import { TxList } from './dashboard';
import { budgetCurrent, metrics, rupiah, transactionExpense } from '@/lib/accounting';
import { categoryBreakdown, transactionsForCategory } from '@/lib/category-analytics';
import { cumulativeSpending, monthlyTotals, incomeBreakdown, largestExpenses, sizeBands, timeOfDaySpending, topPlaces, walletFlows, weekdaySpending } from '@/lib/insights';
import { saveProfile } from '@/lib/firestore';
import { dateInTimeZone, daysInRange, formatDate, groupTransactions, percentChange, periodLabel, previousComparableRange, resolvePeriodRange, summarizeTransactions, todayInTimeZone, type DateRange, type Granularity, type PeriodPreset } from '@/lib/period';
import type { LedgerTx } from '@/lib/types';

const shortMoney = (value: number) => { const abs = Math.abs(value), sign = value < 0 ? '−' : ''; return abs >= 1e9 ? `${sign}${(abs / 1e9).toFixed(1).replace('.', ',')}M` : abs >= 1e6 ? `${sign}${(abs / 1e6).toFixed(1).replace('.', ',')}jt` : abs >= 1e3 ? `${sign}${Math.round(abs / 1e3)}rb` : `${sign}${abs}`; };
const tooltipStyle = { borderRadius: 12, border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)' };
const pct = (part: number, whole: number) => whole ? Math.round(part / whole * 100) : 0;

/** The chosen period (saved per account), its transactions, and the previous period to compare with. */
function usePeriodPair() {
  const { user, profile, data } = useApp();
  const preset: PeriodPreset = profile?.analyticsPeriod || 'salary_cycle';
  const salaryDay = profile?.salaryCycleStartDay || 24;
  const range = resolvePeriodRange(preset, salaryDay, dateInTimeZone(new Date(), profile?.timeZone), profile?.analyticsCustom);
  const prevRange = previousComparableRange(preset, salaryDay, range, todayInTimeZone(profile?.timeZone));
  const history = usePeriodTransactions(range), previous = usePeriodTransactions(prevRange);
  const [wallet, setWallet] = useState(''), [category, setCategory] = useState(''), [error, setError] = useState('');
  const filter = (items: LedgerTx[]) => transactionsForCategory(items.filter(t => !wallet || t.walletId === wallet || t.destinationWalletId === wallet), data.categories, category);
  const items = useMemo(() => filter(history.items), [history.items, wallet, category, data.categories]);
  const prevItems = useMemo(() => filter(previous.items), [previous.items, wallet, category, data.categories]);
  async function save(changes: { analyticsPeriod?: PeriodPreset; analyticsCustom?: DateRange; analyticsGranularity?: Granularity }) { if (!user) return; setError(''); try { await saveProfile(user.uid, changes); } catch (e) { setError((e as Error).message || 'Pilihan belum tersimpan.'); } }
  const basis = prevRange.partial ? `Periode lalu, ${prevRange.days} hari pertama` : 'Periode lalu';
  return { preset, range, prevRange, basis, history, previous, items, prevItems, wallet, setWallet, category, setCategory, save, error: error || history.error || previous.error, loading: history.loading, prevReady: !previous.loading };
}
type Pair = ReturnType<typeof usePeriodPair>;

function PeriodBar({ pair, extra }: { pair: Pair; extra?: ReactNode }) {
  const { data, profile } = useApp();
  const active = [pair.wallet, pair.category].filter(Boolean).length;
  return <div className="panel report-toolbar">
    <PeriodSelector value={pair.preset} custom={profile?.analyticsCustom} onChange={value => void pair.save({ analyticsPeriod: value })} onCustomChange={value => void pair.save({ analyticsCustom: value })}/>
    <details className="disclosure report-filters"><summary>Filter{active ? ` · ${active} aktif` : ''}</summary><div className="form-grid">
      <Field label="Dompet"><Select value={pair.wallet} onChange={e => pair.setWallet(e.target.value)}><option value="">Semua dompet</option>{data.wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
      <Field label="Kategori"><Select value={pair.category} onChange={e => pair.setCategory(e.target.value)}><option value="">Semua kategori</option>{categoryOptions(data.categories, undefined, true)}</Select></Field>
    </div><small className="muted">Pembayaran yang dibagi ke beberapa kategori hanya dihitung porsinya.</small></details>
    {extra}
    <small className="muted report-compare">Dibanding: {periodLabel(pair.prevRange)}{pair.prevRange.partial ? ` (${pair.prevRange.days} hari pertama)` : ''}</small>
    {pair.error && <p className="form-error" role="alert">{pair.error}</p>}
  </div>;
}

function Kpi({ label, value, previous, good = 'up', basis = 'Periode lalu', suffix, format = 'money', icon: Icon, tone = 'accent' }: { label: string; value: number; previous?: number; good?: 'up' | 'down' | 'none'; basis?: string; suffix?: string; format?: 'money' | 'percent' | 'count'; icon?: LucideIcon; tone?: 'accent' | 'in' | 'out' }) {
  return <div className="stat-card report-kpi">
    <span className="stat-head"><span className="stat-label">{label}</span>{Icon && <span className={`metric-icon is-${tone}`} aria-hidden="true"><Icon size={17}/></span>}</span>
    <strong className={`stat-value ${format === 'money' && value < 0 ? 'amount-negative' : ''}`}>{format === 'money' ? <AnimatedRupiah value={value}/> : format === 'percent' ? `${value}%` : value.toLocaleString('id-ID')}</strong>
    {suffix && <small>{suffix}</small>}
    {previous !== undefined && <Delta current={value} previous={previous} good={good} basis={basis}/>}
  </div>;
}

function Section({ icon, title, hint, children, className = '' }: { icon: ReactNode; title: string; hint?: string; children: ReactNode; className?: string }) {
  return <section className={`panel report-section ${className}`}><div className="report-section-head"><span className="report-section-icon" aria-hidden="true">{icon}</span><div><h3>{title}</h3>{hint && <small>{hint}</small>}</div></div>{children}</section>;
}

function CashFlowChart({ items, range, granularity = 'auto' }: { items: LedgerTx[]; range: DateRange; granularity?: Granularity }) {
  const rows = useMemo(() => groupTransactions(items, range, granularity), [items, range.start, range.end, granularity]);
  return <div className="report-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
    <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4"/>
    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} minTickGap={8}/>
    <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={52}/>
    <Tooltip formatter={(v, name) => [rupiah(Number(v)), name]} contentStyle={tooltipStyle} cursor={{ fill: 'var(--accent-soft)' }}/>
    <Legend wrapperStyle={{ fontSize: 12 }}/>
    <Bar dataKey="income" name="Pemasukan" fill="var(--positive)" radius={[5, 5, 0, 0]} animationDuration={700}/>
    <Bar dataKey="expense" name="Pengeluaran" fill="var(--rose)" radius={[5, 5, 0, 0]} animationDuration={700}/>
  </BarChart></ResponsiveContainer></div>;
}

/* ============================================================== Laporan */
export function ReportView({ navigate }: { navigate?: (key: string, focus?: string) => void } = {}) {
  const [mode, setMode] = useState<'period' | 'year'>('period');
  const toggle = <div className="segmented report-mode" role="tablist" aria-label="Jenis laporan"><button type="button" role="tab" aria-selected={mode === 'period'} className={mode === 'period' ? 'active' : ''} onClick={() => setMode('period')}>Per periode</button><button type="button" role="tab" aria-selected={mode === 'year'} className={mode === 'year' ? 'active' : ''} onClick={() => setMode('year')}>Tahunan</button></div>;
  return mode === 'year' ? <AnnualReport navigate={navigate} toggle={toggle}/> : <PeriodReport navigate={navigate} toggle={toggle}/>;
}

function PeriodReport({ navigate, toggle }: { navigate?: (key: string, focus?: string) => void; toggle: ReactNode }) {
  const { data, cycle, profile } = useApp();
  const pair = usePeriodPair();
  const go = (key: string, focus?: string) => navigate?.(key, focus);
  const summary = useMemo(() => summarizeTransactions(pair.items), [pair.items]);
  const prev = useMemo(() => summarizeTransactions(pair.prevItems), [pair.prevItems]);
  const categories = useMemo(() => categoryBreakdown(pair.items, data.categories), [pair.items, data.categories]);
  const prevCategories = useMemo(() => categoryBreakdown(pair.prevItems, data.categories), [pair.prevItems, data.categories]);
  const incomes = useMemo(() => incomeBreakdown(pair.items, data.categories), [pair.items, data.categories]);
  const wallets = useMemo(() => walletFlows(pair.items, data.wallets), [pair.items, data.wallets]);
  const biggest = useMemo(() => largestExpenses(pair.items, 5), [pair.items]);
  const now = metrics(data, cycle.start, cycle.end, profile?.salaryCycleStartDay, dateInTimeZone(new Date(), profile?.timeZone));
  const length = daysInRange(pair.range), prevLength = Math.max(1, pair.prevRange.days || daysInRange(pair.prevRange));
  const savingsRate = summary.income ? Math.round(summary.cashFlow / summary.income * 100) : 0, prevRate = prev.income ? Math.round(prev.cashFlow / prev.income * 100) : 0;
  const count = pair.items.filter(t => transactionExpense(t) > 0).length, prevCount = pair.prevItems.filter(t => transactionExpense(t) > 0).length;
  const day = dateInTimeZone(new Date(), profile?.timeZone);
  const budgets = data.budgets.filter(b => b.active).map(b => ({ b, row: budgetCurrent(b, data.transactions, data.categories, day, profile?.salaryCycleStartDay || 24) }));
  const notes = data.financialNotes.filter(note => note.date >= pair.range.start && note.date < pair.range.end);
  const filtered = Boolean(pair.wallet || pair.category);
  return <div className="report-page">
    <div className="page-heading"><div><h1>Laporan keuangan</h1><p>Rangkuman lengkap satu periode: arus kas, kategori, dompet, anggaran, dan posisi keuanganmu.</p></div><div className="heading-actions"><button type="button" className="btn btn-secondary" onClick={() => window.print()}><Printer size={16}/> Cetak / PDF</button><button type="button" className="btn btn-ghost" onClick={() => go('cycles')}><ScrollText size={16}/> Riwayat siklus</button></div></div>
    {toggle}
    <PeriodBar pair={pair}/>
    <div className="report-title"><span className="eyebrow ink">LAPORAN PERIODE</span><h2>{periodLabel(pair.range)}</h2><small className="muted">{length} hari · {pair.items.length} transaksi{filtered ? ' · dengan filter' : ''}</small></div>
    {pair.loading ? <div className="panel" role="status">Memuat transaksi periode ini…</div> : <>
      <div className="card-grid report-kpis">
        <Kpi label="Pemasukan" icon={TrendingUp} tone="in" value={summary.income} previous={pair.prevReady ? prev.income : undefined} basis={pair.basis} />
        <Kpi label="Pengeluaran" icon={TrendingDown} tone="out" value={summary.expense} previous={pair.prevReady ? prev.expense : undefined} good="down" basis={pair.basis}/>
        <Kpi label="Selisih (arus kas bersih)" icon={ArrowLeftRight} value={summary.cashFlow} previous={pair.prevReady ? prev.cashFlow : undefined} basis={pair.basis}/>
        <Kpi label="Rasio menabung" icon={PiggyBank} value={savingsRate} format="percent" suffix={pair.prevReady && prev.income ? `Periode lalu ${prevRate}% (${savingsRate - prevRate >= 0 ? '+' : ''}${savingsRate - prevRate} poin)` : 'Bagian pemasukan yang tersisa'}/>
        <Kpi label="Rata-rata belanja per hari" icon={CalendarDays} value={Math.round(summary.expense / length)} previous={pair.prevReady ? Math.round(prev.expense / prevLength) : undefined} good="down" basis={pair.basis}/>
        <Kpi label="Transaksi keluar" icon={Receipt} value={count} format="count" suffix={`±${rupiah(Math.round(summary.expense / Math.max(1, count)))} per transaksi`} previous={pair.prevReady ? prevCount : undefined} good="none" basis={pair.basis}/>
      </div>

      <Section icon={<BarChart3 size={18}/>} title="Arus kas" hint="Pemasukan dan pengeluaran sepanjang periode"><CashFlowChart items={pair.items} range={pair.range}/></Section>

      <div className="report-two">
        <Section icon={<Layers3 size={18}/>} title="Pengeluaran per kategori" hint={`Total ${rupiah(summary.expense)}`}>
          {categories.length ? <div className="report-table">{categories.map(c => { const before = prevCategories.find(p => p.id === c.id)?.amount || 0; return <button type="button" key={c.id} className="report-row" onClick={() => go('transactions', `category:${c.id}@${pair.range.start}..${pair.range.end}`)}>
            <IdentityBadge icon={c.icon} color={c.color} label={c.name}/>
            <span className="report-row-bar"><i style={{ width: `${Math.max(2, pct(c.amount, categories[0].amount))}%`, background: c.color || 'var(--accent)' }}/></span>
            <span className="report-row-value"><strong>{rupiah(c.amount)}</strong><small>{pct(c.amount, summary.expense)}% · {c.count}× {pair.prevReady && <Delta current={c.amount} previous={before} good="down" basis={pair.basis} compact/>}</small></span>
          </button>; })}</div> : <Empty message="Belum ada pengeluaran."/>}
        </Section>
        <Section icon={<TrendingUp size={18}/>} title="Pemasukan per sumber" hint={`Total ${rupiah(summary.income)}`}>
          {incomes.length ? <div className="report-table">{incomes.map(c => <div key={c.id} className="report-row">
            <IdentityBadge icon={c.icon} color={c.color} label={c.name}/>
            <span className="report-row-bar"><i style={{ width: `${Math.max(2, pct(c.amount, incomes[0].amount))}%`, background: 'var(--positive)' }}/></span>
            <span className="report-row-value"><strong>{rupiah(c.amount)}</strong><small>{pct(c.amount, summary.income)}% · {c.count}×</small></span>
          </div>)}</div> : <Empty message="Belum ada pemasukan."/>}
        </Section>
      </div>

      <div className="report-two">
        <Section icon={<WalletIcon size={18}/>} title="Per dompet" hint="Uang masuk & keluar, termasuk transfer">
          {wallets.length ? <div className="report-table">{wallets.map(w => <button type="button" key={w.id} className="report-row report-wallet" onClick={() => go('wallets', w.id)}>
            <span className="report-wallet-name"><span className="report-wallet-icon"><AppIcon icon={w.icon}/></span>{w.name}</span>
            <span className="report-flow"><small className="amount-positive">+{rupiah(w.in)}</small><small className="amount-negative">−{rupiah(w.out)}</small></span>
            <strong className={w.net < 0 ? 'amount-negative' : 'amount-positive'}>{w.net < 0 ? '−' : '+'}{rupiah(Math.abs(w.net))}</strong>
          </button>)}</div> : <Empty message="Tidak ada pergerakan dompet."/>}
        </Section>
        <Section icon={<Scale size={18}/>} title="Anggaran" hint="Kondisi anggaran berjalan saat ini">
          {budgets.length ? <div className="report-table">{budgets.map(({ b, row }) => { const used = pct(row.spent, row.available); return <button type="button" key={b.id} className="report-row report-budget" onClick={() => go('budgets')}>
            <span><strong>{b.name}</strong><small className="muted">{rupiah(row.spent)} dari {rupiah(row.available)}</small></span>
            <span className="report-row-bar"><i className={used >= 100 ? 'over' : used >= (profile?.budgetWarningPercent || 80) ? 'warn' : ''} style={{ width: `${Math.min(100, Math.max(2, used))}%` }}/></span>
            <span className="report-row-value"><strong className={row.remaining < 0 ? 'amount-negative' : ''}>{rupiah(row.remaining)}</strong><small>{used}% terpakai</small></span>
          </button>; })}</div> : <Empty message="Belum ada anggaran aktif."/>}
        </Section>
      </div>

      <Section icon={<Sparkles size={18}/>} title="Transaksi terbesar" hint="Lima pengeluaran terbesar periode ini">
        {biggest.length ? <div className="panel flush report-tx"><TxList items={biggest}/></div> : <Empty message="Belum ada pengeluaran."/>}
      </Section>

      {!filtered && <Section icon={<CalendarRange size={18}/>} title="Posisi keuangan saat ini" hint="Bukan dihitung ulang dari periode di atas">
        <div className="report-position">{([['Aset bersih', now.netWorth], ['Uang bebas', now.free], ['Total aset', now.assets], ['Dana dicadangkan', now.reserved], ['Klaim & piutang', now.receivables], ['Sisa utang', -now.liabilities], ['Sisa anggaran', now.budgetRemaining]] as [string, number][]).map(([label, value]) => <div key={label}><small>{label}</small><strong className={value < 0 ? 'amount-negative' : ''}>{rupiah(value)}</strong></div>)}</div>
      </Section>}

      {notes.length > 0 && <Section icon={<ScrollText size={18}/>} title="Catatan periode"><div className="mini-list">{notes.map(note => <div key={note.id}><span><strong>{note.title}</strong>{note.description && <small>{note.description}</small>}</span><small>{formatDate(note.date)}</small></div>)}</div></Section>}
      <p className="muted report-foot">Dibuat {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })} · Dompet Ajaib</p>
    </>}
  </div>;
}

/* ============================================================== Analisis */
type Tab = 'trend' | 'category' | 'pattern' | 'compare';
const tabs: [Tab, string][] = [['trend', 'Tren'], ['category', 'Kategori'], ['pattern', 'Pola'], ['compare', 'Perbandingan']];

export function AnalyticsView({ navigate }: { navigate?: (key: string, focus?: string) => void } = {}) {
  const { data, profile } = useApp();
  const pair = usePeriodPair();
  const [tab, setTab] = useState<Tab>('trend'), [allInsights, setAllInsights] = useState(false);
  const go = (key: string, focus?: string) => navigate?.(key, focus);
  const granularity: Granularity = profile?.analyticsGranularity || 'auto';
  const summary = useMemo(() => summarizeTransactions(pair.items), [pair.items]), prev = useMemo(() => summarizeTransactions(pair.prevItems), [pair.prevItems]);
  const categories = useMemo(() => categoryBreakdown(pair.items, data.categories), [pair.items, data.categories]);
  const prevCategories = useMemo(() => categoryBreakdown(pair.prevItems, data.categories), [pair.prevItems, data.categories]);
  const week = useMemo(() => weekdaySpending(pair.items, pair.range), [pair.items, pair.range.start, pair.range.end]);
  const time = useMemo(() => timeOfDaySpending(pair.items), [pair.items]);
  const bands = useMemo(() => sizeBands(pair.items), [pair.items]);
  const places = useMemo(() => topPlaces(pair.items, 8), [pair.items]);
  const today = todayInTimeZone(profile?.timeZone), length = daysInRange(pair.range);
  const elapsed = Math.max(1, Math.min(length, Math.round((Date.parse(`${today}T12:00:00`) - Date.parse(`${pair.range.start}T12:00:00`)) / 86400000) + 1));
  // Rolling periods (last 7/30 days, 3 months) always end today, so there is nothing left to project.
  const running = !['last_7_days', 'last_30_days', 'last_3_months'].includes(pair.preset) && today >= pair.range.start && today < pair.range.end;
  const pace = useMemo(() => {
    const now = cumulativeSpending(pair.items, pair.range), before = cumulativeSpending(pair.prevItems, { start: pair.prevRange.start, end: resolveEnd(pair.prevRange.start, length) });
    return now.map((value, index) => ({ day: `H${index + 1}`, now: running && index >= elapsed ? null : value, before: before[index] ?? null }));
  }, [pair.items, pair.prevItems, pair.range.start, pair.range.end, pair.prevRange.start, running, elapsed, length]);
  const projected = running ? Math.round(summary.expense / elapsed * length) : summary.expense;
  const changes = useMemo(() => {
    const ids = new Set([...categories.map(c => c.id), ...prevCategories.map(c => c.id)]);
    return [...ids].map(id => { const now = categories.find(c => c.id === id), before = prevCategories.find(c => c.id === id); const base = now || before!; return { id, name: base.name, icon: base.icon, color: base.color, now: now?.amount || 0, before: before?.amount || 0, diff: (now?.amount || 0) - (before?.amount || 0) }; }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [categories, prevCategories]);
  const maxDiff = Math.max(1, ...changes.map(c => Math.abs(c.diff)));

  const insights = useMemo(() => {
    const list: { icon: ReactNode; text: ReactNode }[] = [];
    if (categories[0]) list.push({ icon: <Layers3 size={16}/>, text: <><strong>{categories[0].name}</strong> menyerap {pct(categories[0].amount, summary.expense)}% pengeluaranmu ({rupiah(categories[0].amount)}).</> });
    const rise = changes.find(c => c.diff > 0 && c.before > 0);
    if (rise && pair.prevReady) list.push({ icon: <TrendingUp size={16}/>, text: <>Kenaikan terbesar: <strong>{rise.name}</strong> naik {rupiah(rise.diff)} ({percentChange(rise.now, rise.before)}%) dibanding periode lalu.</> });
    const fall = changes.find(c => c.diff < 0);
    if (fall && pair.prevReady) list.push({ icon: <Sparkles size={16}/>, text: <>Paling hemat: <strong>{fall.name}</strong> turun {rupiah(-fall.diff)}.</> });
    const busiest = [...week].sort((a, b) => b.average - a.average)[0];
    if (busiest?.average) list.push({ icon: <CalendarRange size={16}/>, text: <>Hari paling boros: <strong>{({ Sen: 'Senin', Sel: 'Selasa', Rab: 'Rabu', Kam: 'Kamis', Jum: 'Jumat', Sab: 'Sabtu', Min: 'Minggu' } as Record<string, string>)[busiest.label]}</strong>, rata-rata {rupiah(busiest.average)} per hari itu.</> });
    if (places[0]) list.push({ icon: <Store size={16}/>, text: <>Tempat belanja terbesar: <strong>{places[0].name}</strong> — {rupiah(places[0].total)} dari {places[0].count} transaksi.</> });
    if (running && summary.expense) list.push({ icon: <Lightbulb size={16}/>, text: <>Dengan laju sekarang, pengeluaran periode ini diperkirakan <strong>{rupiah(projected)}</strong>.</> });
    if (summary.income && summary.cashFlow >= 0) list.push({ icon: <Scale size={16}/>, text: <>Kamu menyisihkan <strong>{pct(summary.cashFlow, summary.income)}%</strong> dari pemasukan periode ini.</> });
    else if (summary.expense > summary.income) list.push({ icon: <Scale size={16}/>, text: <>Pengeluaran melebihi pemasukan sebesar <strong>{rupiah(summary.expense - summary.income)}</strong> pada periode ini.</> });
    return list;
  }, [categories, changes, week, places, running, projected, summary, prev, pair.prevReady, pair.prevRange.partial]);

  return <div className="report-page">
    <div className="page-heading"><div><h1>Analisis</h1><p>Pahami ke mana uangmu pergi, kapan, dan bagaimana dibanding periode lalu.</p></div></div>
    <PeriodBar pair={pair}/>
    {pair.loading ? <div className="panel" role="status">Memuat transaksi periode ini…</div> : <>
      <div className="card-grid report-kpis analysis-kpis">
        <Kpi label="Pengeluaran" icon={TrendingDown} tone="out" value={summary.expense} previous={pair.prevReady ? prev.expense : undefined} good="down" basis={pair.basis}/>
        <Kpi label="Pemasukan" icon={TrendingUp} tone="in" value={summary.income} previous={pair.prevReady ? prev.income : undefined} basis={pair.basis}/>
        <Kpi label="Rata-rata per hari" icon={CalendarDays} value={Math.round(summary.expense / (running ? elapsed : length))} good="down" basis={pair.basis} suffix={running ? `Hari ke-${elapsed} dari ${length}` : `${length} hari`}/>
        <Kpi label={running ? 'Perkiraan akhir periode' : 'Total periode'} icon={Target} value={projected} good="down" basis={pair.basis} suffix={running ? 'Jika laju belanja sama' : undefined}/>
      </div>
      {insights.length > 0 && <section className="panel insight-panel"><div className="report-section-head"><span className="report-section-icon"><Lightbulb size={18}/></span><div><h3>Wawasan</h3><small>Dirangkum otomatis dari transaksimu</small></div></div><div className="insight-list">{(allInsights ? insights : insights.slice(0, 3)).map((item, index) => <div key={index} className="insight-item" style={{ animationDelay: `${index * 50}ms` }}><span>{item.icon}</span><p>{item.text}</p></div>)}</div>{insights.length > 3 && <button type="button" className="link-button" onClick={() => setAllInsights(x => !x)}>{allInsights ? 'Tampilkan lebih sedikit' : `Lihat semua wawasan (${insights.length})`}</button>}</section>}

      <div className="analysis-tabs" role="tablist" aria-label="Jenis analisis">{tabs.map(([key, label]) => <button type="button" role="tab" key={key} aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>

      <div key={tab} className="analysis-tab-body">
        {tab === 'trend' && <>
          <Section icon={<BarChart3 size={18}/>} title="Arus kas" hint="Pemasukan dan pengeluaran per waktu">
            <div className="segment granularity">{(['auto', 'daily', 'weekly', 'monthly'] as Granularity[]).map(g => <button type="button" key={g} className={granularity === g ? 'active' : ''} onClick={() => void pair.save({ analyticsGranularity: g })}>{({ auto: 'Otomatis', daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan', yearly: 'Tahunan' } as Record<string, string>)[g]}</button>)}</div>
            <CashFlowChart items={pair.items} range={pair.range} granularity={granularity}/>
          </Section>
          <Section icon={<TrendingUp size={18}/>} title="Laju belanja vs periode lalu" hint="Total pengeluaran berjalan dari hari pertama">
            <div className="report-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={pace} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs><linearGradient id="pace-now" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={.35}/><stop offset="100%" stopColor="var(--accent)" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4"/>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} minTickGap={14}/>
              <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={52}/>
              <Tooltip formatter={(v, name) => [v === null ? '–' : rupiah(Number(v)), name]} contentStyle={tooltipStyle}/>
              <Legend wrapperStyle={{ fontSize: 12 }}/>
              <Area type="monotone" dataKey="before" name="Periode lalu" stroke="var(--muted)" strokeDasharray="5 4" fill="transparent" strokeWidth={2} dot={false} connectNulls animationDuration={700}/>
              <Area type="monotone" dataKey="now" name="Periode ini" stroke="var(--accent)" fill="url(#pace-now)" strokeWidth={3} dot={false} animationDuration={900}/>
            </AreaChart></ResponsiveContainer></div>
          </Section>
        </>}
        {tab === 'category' && <Section icon={<Layers3 size={18}/>} title="Pengeluaran per kategori" hint="Ketuk kategori untuk rincian subkategori">
          {categories.length ? <CategoryDonut slices={categories} previous={prevCategories} previousReady={pair.prevReady} navigate={go} basis={pair.basis} rangeFocus={`@${pair.range.start}..${pair.range.end}`}/> : <Empty message="Belum ada pengeluaran pada periode ini."/>}
        </Section>}
        {tab === 'pattern' && <>
          <div className="report-two">
            <Section icon={<CalendarRange size={18}/>} title="Per hari dalam seminggu" hint="Rata-rata belanja untuk satu hari tersebut">
              <div className="report-chart short"><ResponsiveContainer width="100%" height="100%"><BarChart data={week} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4"/>
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted)' }} tickLine={false} axisLine={false}/>
                <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={48}/>
                <Tooltip formatter={v => [rupiah(Number(v)), 'Rata-rata']} contentStyle={tooltipStyle} cursor={{ fill: 'var(--accent-soft)' }}/>
                <Bar dataKey="average" radius={[6, 6, 0, 0]} animationDuration={700}>{week.map(row => <Cell key={row.label} fill={row.average === Math.max(...week.map(w => w.average)) ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 40%, var(--paper))'}/>)}</Bar>
              </BarChart></ResponsiveContainer></div>
            </Section>
            <Section icon={<Clock3 size={18}/>} title="Waktu belanja" hint="Dari transaksi yang punya jam">
              <div className="report-table">{time.rows.map(row => <div key={row.label} className="report-row"><span><strong>{row.label}</strong><small className="muted">{row.range}</small></span><span className="report-row-bar"><i style={{ width: `${Math.max(2, pct(row.total, Math.max(1, ...time.rows.map(r => r.total))))}%` }}/></span><span className="report-row-value"><strong>{rupiah(row.total)}</strong><small>{row.count}×</small></span></div>)}</div>
              {time.untimed > 0 && <small className="muted">{rupiah(time.untimed)} tercatat tanpa jam.</small>}
            </Section>
          </div>
          <div className="report-two">
            <Section icon={<Store size={18}/>} title="Tempat & keterangan teratas" hint="Berdasarkan nama tempat atau keterangan">
              {places.length ? <div className="report-table">{places.map((place, index) => <div key={place.name} className="report-row"><span className="rank">{index + 1}</span><span className="report-place"><strong>{place.name}</strong><small className="muted">{place.count}× · rata-rata {rupiah(Math.round(place.total / place.count))}</small></span><strong>{rupiah(place.total)}</strong></div>)}</div> : <Empty message="Isi nama tempat atau keterangan saat mencatat agar terlihat di sini."/>}
            </Section>
            <Section icon={<Scale size={18}/>} title="Ukuran transaksi" hint="Seberapa sering belanja kecil vs besar">
              <div className="report-table">{bands.map(band => <div key={band.label} className="report-row"><span><strong>{band.label}</strong><small className="muted">{band.count}× transaksi</small></span><span className="report-row-bar"><i style={{ width: `${Math.max(2, pct(band.total, Math.max(1, summary.expense)))}%` }}/></span><span className="report-row-value"><strong>{rupiah(band.total)}</strong><small>{pct(band.total, summary.expense)}%</small></span></div>)}</div>
            </Section>
          </div>
        </>}
        {tab === 'compare' && <>
          <Section icon={<Scale size={18}/>} title="Ringkasan dibanding periode lalu" hint={`${periodLabel(pair.range)} vs ${periodLabel(pair.prevRange)}`}>
            <div className="compare-summary">{([['Pemasukan', summary.income, prev.income, 'up'], ['Pengeluaran', summary.expense, prev.expense, 'down'], ['Selisih', summary.cashFlow, prev.cashFlow, 'up']] as [string, number, number, 'up' | 'down'][]).map(([label, now, before, good]) => <div key={label}><small>{label}</small><strong>{rupiah(now)}</strong><span className="muted">sebelumnya {rupiah(before)}</span>{pair.prevReady && <Delta current={now} previous={before} good={good} basis={pair.basis}/>}</div>)}</div>
          </Section>
          <Section icon={<Layers3 size={18}/>} title="Perubahan per kategori" hint="Diurutkan dari perubahan terbesar">
            {changes.length ? <div className="diverging">{changes.map(row => <button type="button" key={row.id} className="diverging-row" onClick={() => go('transactions', `category:${row.id}@${pair.range.start}..${pair.range.end}`)}>
              <IdentityBadge icon={row.icon} color={row.color} label={row.name}/>
              <span className="diverging-track"><span className="diverging-mid"/>{row.diff !== 0 && <i className={row.diff > 0 ? 'up' : 'down'} style={{ width: `${Math.abs(row.diff) / maxDiff * 50}%` }}/>}</span>
              <span className="report-row-value"><strong className={row.diff > 0 ? 'amount-negative' : row.diff < 0 ? 'amount-positive' : ''}>{row.diff > 0 ? '+' : row.diff < 0 ? '−' : ''}{rupiah(Math.abs(row.diff))}</strong><small>{rupiah(row.before)} → {rupiah(row.now)}</small></span>
            </button>)}</div> : <Empty message="Belum ada data untuk dibandingkan."/>}
          </Section>
        </>}
      </div>
    </>}
  </div>;
}
function resolveEnd(start: string, length: number) { const day = new Date(`${start}T12:00:00`); day.setDate(day.getDate() + length); return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`; }

/* ============================================================== Laporan tahunan */
function AnnualReport({ navigate, toggle }: { navigate?: (key: string, focus?: string) => void; toggle: ReactNode }) {
  const { data, profile } = useApp();
  const thisYear = Number(todayInTimeZone(profile?.timeZone).slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const go = (key: string, focus?: string) => navigate?.(key, focus);
  const current = usePeriodTransactions({ start: `${year}-01-01`, end: `${year + 1}-01-01` });
  const previous = usePeriodTransactions({ start: `${year - 1}-01-01`, end: `${year}-01-01` });
  const months = useMemo(() => monthlyTotals(current.items, year), [current.items, year]);
  const total = useMemo(() => summarizeTransactions(current.items), [current.items]), before = useMemo(() => summarizeTransactions(previous.items), [previous.items]);
  const categories = useMemo(() => categoryBreakdown(current.items, data.categories), [current.items, data.categories]);
  const prevCategories = useMemo(() => categoryBreakdown(previous.items, data.categories), [previous.items, data.categories]);
  const incomes = useMemo(() => incomeBreakdown(current.items, data.categories), [current.items, data.categories]);
  const active = months.filter(m => m.income || m.expense), activeCount = Math.max(1, active.length);
  const best = [...active].sort((a, b) => b.net - a.net)[0], costly = [...active].sort((a, b) => b.expense - a.expense)[0];
  const rate = total.income ? Math.round(total.cashFlow / total.income * 100) : 0, prevRate = before.income ? Math.round(before.cashFlow / before.income * 100) : 0;
  // Without any data last year there is nothing meaningful to compare with.
  const ready = !previous.loading && previous.items.length > 0, basis = `Tahun ${year - 1}`;
  const categoryMonths = (id: string) => months.map(m => ({ ...m, value: categoryBreakdown(current.items.filter(t => t.date >= m.start && t.date < m.end), data.categories).find(c => c.id === id)?.amount || 0 }));
  const [focusCategory, setFocusCategory] = useState('');
  const trend = focusCategory ? categoryMonths(focusCategory) : null;
  return <div className="report-page">
    <div className="page-heading"><div><h1>Laporan tahunan</h1><p>Gambaran satu tahun penuh: bulan demi bulan, kategori, dan perbandingan dengan tahun sebelumnya.</p></div><div className="heading-actions"><button type="button" className="btn btn-secondary" onClick={() => window.print()}><Printer size={16}/> Cetak / PDF</button></div></div>
    {toggle}
    <div className="panel report-toolbar year-bar"><div className="segmented" role="group" aria-label="Pilih tahun">{[thisYear - 3, thisYear - 2, thisYear - 1, thisYear].map(y => <button type="button" key={y} className={y === year ? 'active' : ''} onClick={() => setYear(y)}>{y}</button>)}</div><small className="muted report-compare">{!previous.loading && !previous.items.length ? `Belum ada data tahun ${year - 1} untuk dibandingkan.` : `Dibanding tahun ${year - 1}${year === thisYear ? ' (tahun berjalan dibanding tahun penuh sebelumnya)' : ''}`}</small>{current.error && <p className="form-error" role="alert">{current.error}</p>}</div>
    {current.loading ? <div className="panel" role="status">Memuat transaksi tahun {year}…</div> : !current.items.length ? <div className="panel"><Empty message={`Belum ada transaksi di tahun ${year}.`}/></div> : <>
      <div className="card-grid report-kpis">
        <Kpi label="Pemasukan setahun" icon={TrendingUp} tone="in" value={total.income} previous={ready ? before.income : undefined} basis={basis} />
        <Kpi label="Pengeluaran setahun" icon={TrendingDown} tone="out" value={total.expense} previous={ready ? before.expense : undefined} good="down" basis={basis}/>
        <Kpi label="Selisih setahun" icon={ArrowLeftRight} value={total.cashFlow} previous={ready ? before.cashFlow : undefined} basis={basis}/>
        <Kpi label="Rasio menabung" icon={PiggyBank} value={rate} format="percent" suffix={ready && before.income ? `Tahun lalu ${prevRate}% (${rate - prevRate >= 0 ? '+' : ''}${rate - prevRate} poin)` : 'Bagian pemasukan yang tersisa'}/>
        <Kpi label="Rata-rata pengeluaran per bulan" icon={CalendarRange} value={Math.round(total.expense / activeCount)} good="down" basis={basis} suffix={`${active.length} bulan tercatat`}/>
        <Kpi label="Rata-rata pemasukan per bulan" icon={Wallet2} value={Math.round(total.income / activeCount)} basis={basis} suffix={best ? `Bulan terbaik: ${best.label} (${rupiah(best.net)})` : undefined}/>
      </div>
      <Section icon={<BarChart3 size={18}/>} title="Bulan demi bulan" hint={costly ? `Pengeluaran terbesar di ${costly.label} (${rupiah(costly.expense)})` : undefined}>
        <div className="report-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={months} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4"/>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false}/>
          <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={52}/>
          <Tooltip formatter={(v, name) => [rupiah(Number(v)), name]} contentStyle={tooltipStyle} cursor={{ fill: 'var(--accent-soft)' }}/>
          <Legend wrapperStyle={{ fontSize: 12 }}/>
          <Bar dataKey="income" name="Pemasukan" fill="var(--positive)" radius={[5, 5, 0, 0]} animationDuration={700}/>
          <Bar dataKey="expense" name="Pengeluaran" fill="var(--rose)" radius={[5, 5, 0, 0]} animationDuration={700}/>
          <Line type="monotone" dataKey="net" name="Selisih" stroke="var(--accent)" strokeWidth={3} dot={{ r: 3 }} animationDuration={900}/>
        </ComposedChart></ResponsiveContainer></div>
        <div className="year-table" role="table" aria-label="Ringkasan per bulan">
          <div className="year-row year-head" role="row"><span>Bulan</span><span>Pemasukan</span><span>Pengeluaran</span><span>Selisih</span><span>Menabung</span></div>
          {months.map(m => <button type="button" key={m.month} role="row" className={`year-row ${!m.income && !m.expense ? 'is-empty' : ''}`} onClick={() => go('transactions', `@${m.start}..${m.end}`)}><span>{new Date(year, m.month, 1).toLocaleDateString('id-ID', { month: 'long' })}</span><span className="amount-positive">{m.income ? rupiah(m.income) : '–'}</span><span className="amount-negative">{m.expense ? rupiah(m.expense) : '–'}</span><strong className={m.net < 0 ? 'amount-negative' : ''}>{m.income || m.expense ? rupiah(m.net) : '–'}</strong><span>{m.income ? `${m.rate}%` : '–'}</span></button>)}
          <div className="year-row year-total" role="row"><span>Total</span><span className="amount-positive">{rupiah(total.income)}</span><span className="amount-negative">{rupiah(total.expense)}</span><strong className={total.cashFlow < 0 ? 'amount-negative' : ''}>{rupiah(total.cashFlow)}</strong><span>{rate}%</span></div>
        </div>
      </Section>
      <div className="report-two">
        <Section icon={<Layers3 size={18}/>} title="Kategori setahun" hint="Ketuk untuk melihat tren bulanannya">
          <div className="report-table">{categories.slice(0, 10).map(c => { const last = prevCategories.find(p => p.id === c.id)?.amount || 0; return <button type="button" key={c.id} className={`report-row ${focusCategory === c.id ? 'is-active' : ''}`} onClick={() => setFocusCategory(v => v === c.id ? '' : c.id)}>
            <IdentityBadge icon={c.icon} color={c.color} label={c.name}/>
            <span className="report-row-bar"><i style={{ width: `${Math.max(2, pct(c.amount, categories[0].amount))}%`, background: c.color || 'var(--accent)' }}/></span>
            <span className="report-row-value"><strong>{rupiah(c.amount)}</strong><small>±{rupiah(Math.round(c.amount / activeCount))}/bln {ready && <Delta current={c.amount} previous={last} good="down" basis={basis} compact/>}</small></span>
          </button>; })}</div>
          {trend && <div className="report-chart short"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}><defs><linearGradient id="cat-year" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={.35}/><stop offset="100%" stopColor="var(--accent)" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false}/><YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={48}/><Tooltip formatter={v => [rupiah(Number(v)), categories.find(c => c.id === focusCategory)?.name || '']} contentStyle={tooltipStyle}/><Area type="monotone" dataKey="value" stroke="var(--accent)" fill="url(#cat-year)" strokeWidth={3} animationDuration={700}/></AreaChart></ResponsiveContainer></div>}
        </Section>
        <Section icon={<TrendingUp size={18}/>} title="Sumber pemasukan setahun">
          {incomes.length ? <div className="report-table">{incomes.map(c => <div key={c.id} className="report-row"><IdentityBadge icon={c.icon} color={c.color} label={c.name}/><span className="report-row-bar"><i style={{ width: `${Math.max(2, pct(c.amount, incomes[0].amount))}%`, background: 'var(--positive)' }}/></span><span className="report-row-value"><strong>{rupiah(c.amount)}</strong><small>{pct(c.amount, total.income)}% · {c.count}×</small></span></div>)}</div> : <Empty message="Belum ada pemasukan tahun ini."/>}
        </Section>
      </div>
      <p className="muted report-foot">Dibuat {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })} · Dompet Ajaib</p>
    </>}
  </div>;
}
