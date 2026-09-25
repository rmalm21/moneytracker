'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChartTooltip } from './chart-tooltip';
import { ArrowRight, CalendarClock, RotateCcw, ShoppingBag, TrendingDown, TrendingUp } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from './app-provider';
import { Field, Input, Money, Select } from './fields';
import { Button } from './ui/button';
import { usePeriodTransactions } from './period-selector';
import { metrics, rupiah } from '@/lib/accounting';
import { forecast, statusText, type ForecastStatus } from '@/lib/forecast';
import { savingsPlan } from '@/lib/savings';
import { todayInTimeZone } from '@/lib/period';
import { dateInTimeZone, formatDate, parseDate, previousDate, resolvePeriodRange, summarizeTransactions } from '@/lib/period';

/** Counts smoothly from the previous value to the new one. */
export function useCountUp(target: number, duration = 650) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setValue(target); from.current = target; return; }
    const start = performance.now(), origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - progress, 3);
      const next = origin + (target - origin) * eased;
      from.current = next; setValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return Math.round(value);
}
export function AnimatedRupiah({ value, className }: { value: number; className?: string }) { return <span className={className}>{rupiah(useCountUp(value))}</span>; }

const shortMoney = (value: number) => { const abs = Math.abs(value), sign = value < 0 ? '−' : ''; return abs >= 1e9 ? `${sign}${(abs / 1e9).toFixed(1).replace('.', ',')} M` : abs >= 1e6 ? `${sign}${(abs / 1e6).toFixed(1).replace('.', ',')} jt` : abs >= 1e3 ? `${sign}${Math.round(abs / 1e3)} rb` : `${sign}${abs}`; };
const monthLabel = (cycleEnd: string, index: number) => { const day = parseDate(cycleEnd); day.setMonth(day.getMonth() + index); return day.toLocaleDateString('id-ID', { month: 'short' }); };

/** Everything the page and the dashboard card need, from the live data. */
function useForecastData(options: { salary?: number; overtime?: number; extra?: number; claim?: number; debtDue?: number; spendAdjust?: number } = {}) {
  const { data, profile, cycle } = useApp();
  const salaryDay = profile?.salaryCycleStartDay || 24;
  const stat = useMemo(() => metrics(data, cycle.start, cycle.end, salaryDay, dateInTimeZone(new Date(), profile?.timeZone), Boolean(profile?.netWorthIncludesReceivables)), [data, cycle.start, cycle.end, salaryDay, profile?.timeZone]);
  const lastCycle = resolvePeriodRange('salary_cycle', salaryDay, parseDate(previousDate(cycle.start)));
  const last = usePeriodTransactions(lastCycle);
  const lastDays = Math.max(1, Math.round((parseDate(lastCycle.end).getTime() - parseDate(lastCycle.start).getTime()) / 86400000));
  const baselineDaily = useMemo(() => summarizeTransactions(last.items).expense / lastDays, [last.items, lastDays]);
  const daysElapsed = cycle.daysTotal - cycle.daysRemaining + 1;
  const result = forecast({ free: stat.free, spentThisCycle: stat.expenses, daysElapsed, daysRemaining: cycle.daysRemaining, daysTotal: cycle.daysTotal, salary: options.salary ?? profile?.monthlySalary ?? 0, totalBudget: stat.totalBudget, overtime: options.overtime, extra: options.extra, claim: options.claim, debtDue: options.debtDue, baselineDaily, spendAdjust: options.spendAdjust });
  const points = [{ label: 'Kini', full: 'Hari ini', value: stat.free }, { label: 'Jelang', full: 'Jelang gajian', value: result.before }, { label: formatDate(cycle.end, false), full: `Setelah gajian ${formatDate(cycle.end, false)}`, value: result.after }, ...result.months.slice(1).map((value, index) => ({ label: monthLabel(cycle.end, index + 1), full: `Akhir ${monthLabel(cycle.end, index + 1)} (${index + 2} bulan lagi)`, value }))];
  return { stat, cycle, result, points, daysElapsed, loading: last.loading };
}

function StatusChip({ status }: { status: ForecastStatus }) { return <span className={`forecast-chip is-${status}`}><i/>{statusText[status][0]}</span>; }

function BalanceChart({ points, height, compact = false }: { points: { label: string; full: string; value: number }[]; height: number; compact?: boolean }) {
  const negative = points.some(point => point.value < 0);
  return <div className="forecast-chart" style={{ height }}>
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 10, right: compact ? 4 : 12, bottom: 0, left: compact ? 4 : 0 }}>
        <defs><linearGradient id={compact ? 'fc-mini' : 'fc-main'} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={.35}/><stop offset="100%" stopColor="var(--accent)" stopOpacity={0}/></linearGradient></defs>
        {!compact && <CartesianGrid vertical={false} stroke="var(--line)" strokeOpacity={.7} strokeDasharray="2 6"/>}
        {!compact && <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} interval={0} height={30} tickMargin={6}/>}
        {!compact && <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={58}/>}
        {negative && <ReferenceLine y={0} stroke="var(--rose)" strokeDasharray="4 4"/>}
        <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.full || ''} formatter={value => [rupiah(Number(value)), 'Perkiraan']} content={<ChartTooltip/>}/>
        <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={compact ? 2.5 : 3} fill={`url(#${compact ? 'fc-mini' : 'fc-main'})`} dot={compact ? false : { r: 4, fill: 'var(--paper)', stroke: 'var(--accent)', strokeWidth: 2 }} activeDot={{ r: 6 }} animationDuration={900}/>
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}

export function ForecastView() {
  const { data, profile } = useApp();
  const defaults = { salary: profile?.monthlySalary || 0, overtime: 0, extra: 0, claim: 0, debtDue: 0, spendAdjust: 0 };
  const [input, setInput] = useState(defaults);
  const set = (changes: Partial<typeof input>) => setInput(current => ({ ...current, ...changes }));
  const { stat, cycle, result, points, daysElapsed } = useForecastData(input);
  const [purchase, setPurchase] = useState(0), [item, setItem] = useState(''), [walletId, setWalletId] = useState('');
  const wallet = data.wallets.find(w => w.id === walletId);
  const share = stat.free > 0 ? Math.min(100, Math.round(purchase / stat.free * 100)) : purchase ? 100 : 0;
  const verdict = !purchase ? null : wallet?.isReserved ? ['warn', 'Memakai dana tercadangkan'] : purchase > stat.free ? ['bad', 'Melebihi uang bebas'] : result.before - purchase < 0 ? ['warn', 'Bisa, tapi minus sebelum gajian'] : ['good', 'Aman, masih dalam uang bebas'];
  const adjustLabel = input.spendAdjust === 0 ? 'Seperti biasa' : input.spendAdjust < 0 ? `Hemat ${-input.spendAdjust}%` : `Lebih boros ${input.spendAdjust}%`;
  const steps: { label: string; value: number; tone: 'base' | 'in' | 'out' | 'total'; note?: string }[] = [
    { label: 'Uang bebas sekarang', value: stat.free, tone: 'base' },
    { label: `Belanja sampai gajian`, value: -result.untilPayday, tone: 'out', note: `${rupiah(Math.round(result.daily))}/hari × ${cycle.daysRemaining} hari` },
    ...(input.extra ? [{ label: 'Pengeluaran besar lain', value: -input.extra, tone: 'out' as const }] : []),
    ...(input.claim ? [{ label: 'Klaim yang cair', value: input.claim, tone: 'in' as const }] : []),
    ...(input.debtDue ? [{ label: 'Cicilan jatuh tempo', value: -input.debtDue, tone: 'out' as const }] : []),
    { label: 'Perkiraan jelang gajian', value: result.before, tone: 'total' },
    { label: input.overtime ? 'Gaji + lembur' : 'Gaji', value: result.income, tone: 'in' },
    { label: 'Setelah gajian', value: result.after, tone: 'total' },
  ];
  const largest = Math.max(1, ...steps.map(step => Math.abs(step.value)));
  return <>
    <div className="page-heading"><div><h1>Proyeksi</h1><p>Perkiraan uang bebasmu sampai gajian dan 6 bulan ke depan. Ubah skenario di bawah, hasilnya langsung ikut berubah.</p></div></div>

    <section className={`forecast-hero is-${result.status}`}>
      <div className="forecast-hero-main">
        <small>Perkiraan uang bebas jelang gajian</small>
        <AnimatedRupiah value={result.before} className="forecast-hero-value"/>
        <div className="forecast-hero-meta"><StatusChip status={result.status}/><span>{statusText[result.status][1]}</span></div>
        <div className="forecast-cycle"><div><CalendarClock size={15}/> Gajian {formatDate(cycle.end, false)} · {cycle.daysRemaining} hari lagi</div><span className="forecast-cycle-bar"><i style={{ width: `${Math.min(100, daysElapsed / cycle.daysTotal * 100)}%` }}/></span><small>Hari ke-{daysElapsed} dari {cycle.daysTotal} · belanja ±{rupiah(Math.round(result.daily))}/hari {result.dailySource === 'baseline' ? '(pola siklus lalu)' : '(pola siklus ini)'}</small></div>
      </div>
      <div className="forecast-hero-side">
        {[['Setelah gajian', result.after], ['3 bulan lagi', result.months[2]], ['6 bulan lagi', result.months[5]]].map(([label, value]) => <div key={label as string}><small>{label}</small><AnimatedRupiah value={value as number} className={(value as number) < 0 ? 'is-negative' : ''}/></div>)}
      </div>
    </section>

    <div className="forecast-grid">
      <section className="panel forecast-panel">
        <div className="forecast-panel-head"><h3>Perjalanan saldo</h3><small>{result.monthlyNet >= 0 ? <><TrendingUp size={14}/> Naik ±{rupiah(result.monthlyNet)}/bulan</> : <><TrendingDown size={14}/> Turun ±{rupiah(-result.monthlyNet)}/bulan</>}</small></div>
        <BalanceChart points={points} height={260}/>
        <small className="muted">Tiap bulan: pemasukan {rupiah(result.income)} − pengeluaran {rupiah(result.monthlyOut)} ({stat.totalBudget > 0 ? 'total anggaran' : 'pola belanja'}).</small>
      </section>
      <section className="panel forecast-panel">
        <div className="forecast-panel-head"><h3>Atur skenario</h3><button type="button" className="link-button" onClick={() => setInput(defaults)}><RotateCcw size={14}/> Kembalikan</button></div>
        <div className="forecast-slider">
          <div className="forecast-slider-head"><span>Pola belanja</span><strong className={input.spendAdjust < 0 ? 'amount-positive' : input.spendAdjust > 0 ? 'amount-negative' : ''}>{adjustLabel}</strong></div>
          <input type="range" min={-50} max={50} step={5} value={input.spendAdjust} onChange={event => set({ spendAdjust: Number(event.target.value) })} aria-label="Pola belanja" style={{ ['--fill' as string]: `${(input.spendAdjust + 50)}%` }}/>
          <div className="forecast-presets">{[-20, -10, 0, 10, 20].map(value => <button type="button" key={value} className={input.spendAdjust === value ? 'active' : ''} onClick={() => set({ spendAdjust: value })}>{value === 0 ? 'Biasa' : `${value > 0 ? '+' : ''}${value}%`}</button>)}</div>
        </div>
        <div className="form-grid">
          <Field label="Gaji berikutnya"><Money value={input.salary} onChange={salary => set({ salary })}/></Field>
          <Field label="Perkiraan lembur"><Money value={input.overtime} onChange={overtime => set({ overtime })}/></Field>
          <Field label="Pengeluaran besar lain"><Money value={input.extra} onChange={extra => set({ extra })}/></Field>
          <Field label="Klaim yang akan cair"><Money value={input.claim} onChange={claim => set({ claim })}/></Field>
          <Field label="Cicilan jatuh tempo"><Money value={input.debtDue} onChange={debtDue => set({ debtDue })}/></Field>
        </div>
      </section>
    </div>

    <section className="panel forecast-panel">
      <div className="forecast-panel-head"><h3>Dari mana angkanya</h3><small>Perhitungan langkah demi langkah</small></div>
      <div className="forecast-steps">{steps.map((step, index) => <div key={step.label} className={`forecast-step is-${step.tone}`} style={{ animationDelay: `${index * 45}ms` }}>
        <span className="forecast-step-label">{step.tone === 'total' ? '=' : step.value < 0 ? '−' : step.tone === 'base' ? '' : '+'} {step.label}{step.note && <small>{step.note}</small>}</span>
        <span className="forecast-step-bar"><i style={{ width: `${Math.max(2, Math.abs(step.value) / largest * 100)}%` }}/></span>
        <AnimatedRupiah value={Math.abs(step.value) * (step.tone === 'total' && step.value < 0 ? -1 : 1)} className="forecast-step-value"/>
      </div>)}</div>
    </section>

    {data.funds.some(f => !f.isArchived) && (() => { const today = todayInTimeZone(profile?.timeZone); const rows = data.funds.filter(f => !f.isArchived).map(f => ({ f, plan: savingsPlan(f, today) })).filter(r => r.plan.status !== 'reached'); const need = rows.reduce((n, r) => n + (r.plan.status === 'overdue' ? 0 : r.plan.perMonth), 0); const left = result.monthlyNet - need; return rows.length ? <section className="panel forecast-panel">
      <div className="forecast-panel-head"><h3>Target tabungan</h3><small>{left >= 0 ? `Masih tersisa ±${rupiah(left)}/bulan setelah setoran` : `Kurang ±${rupiah(-left)}/bulan untuk semua target`}</small></div>
      <div className="forecast-steps">{rows.map(({ f, plan }) => <div key={f.id} className="forecast-step is-base"><span className="forecast-step-label">{f.name}<small>{f.targetDate ? `Tenggat ${formatDate(f.targetDate)} · ` : ''}terkumpul {Math.round(plan.progress)}%</small></span><span className="forecast-step-bar"><i style={{ width: `${Math.max(2, plan.progress)}%` }}/></span><span className="forecast-step-value">{plan.status === 'overdue' ? 'Lewat tenggat' : `${rupiah(plan.perMonth)}/bln`}</span></div>)}
      <div className={`forecast-step is-total`}><span className="forecast-step-label">Total setoran per bulan</span><span className="forecast-step-bar"><i style={{ width: `${Math.min(100, Math.max(2, need / Math.max(1, result.income) * 100))}%` }}/></span><AnimatedRupiah value={need} className="forecast-step-value"/></div></div>
    </section> : null; })()}

    <div className="section-heading"><h2><ShoppingBag size={19}/> Kalau beli ini?</h2></div>
    <div className="forecast-grid">
      <section className="panel forecast-panel"><div className="form-grid">
        <Field label="Barang"><Input value={item} onChange={e => setItem(e.target.value)} placeholder="Misalnya: sepatu baru"/></Field>
        <Field label="Harga"><Money value={purchase} onChange={setPurchase}/></Field>
        <Field label="Dompet sumber"><Select value={walletId} onChange={e => setWalletId(e.target.value)}><option value="">Pilih dompet</option>{data.wallets.filter(w => !w.isArchived).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
      </div></section>
      <section className={`panel forecast-panel forecast-buy ${verdict ? `is-${verdict[0]}` : ''}`}>
        {verdict ? <>
          <div className="forecast-buy-verdict"><strong>{verdict[1]}</strong><small>{item ? `${item} · ` : ''}{rupiah(purchase)}</small></div>
          <div className="forecast-meter" aria-label={`Memakai ${share}% uang bebas`}><i style={{ width: `${share}%` }}/></div>
          <small className="muted">Memakai {share}% dari uang bebas {rupiah(stat.free)}</small>
          <div className="mini-list">
            <div><span>Uang bebas setelah beli</span><AnimatedRupiah value={stat.free - purchase} className={stat.free - purchase < 0 ? 'amount-negative' : ''}/></div>
            <div><span>Jelang gajian setelah beli</span><AnimatedRupiah value={result.before - purchase} className={result.before - purchase < 0 ? 'amount-negative' : ''}/></div>
            {wallet && <div><span>Saldo {wallet.name} setelah beli</span><AnimatedRupiah value={wallet.cachedBalance - purchase} className={wallet.cachedBalance - purchase < 0 ? 'amount-negative' : ''}/></div>}
          </div>
        </> : <p className="muted forecast-buy-empty">Isi harga barang untuk melihat dampaknya ke uang bebas dan saldo jelang gajian.</p>}
      </section>
    </div>
  </>;
}

/** Dashboard card: status, a small balance line, and the key numbers. */
export function ForecastWidget({ navigate, open }: { navigate: (view: string) => void; open?: boolean }) {
  const { result, points, cycle } = useForecastData();
  return <details className="panel widget-details forecast-widget" open={open || undefined}>
    <summary><span><strong>Proyeksi</strong><small>Jelang gajian {formatDate(cycle.end, false)} · <StatusChip status={result.status}/></small></span><AnimatedRupiah value={result.before} className={result.before < 0 ? 'amount-negative' : ''}/></summary>
    <div className="widget-body">
      <BalanceChart points={points} height={96} compact/>
      <div className="forecast-mini-stats">{[['Jelang gajian', result.before], ['Setelah gajian', result.after], ['6 bulan lagi', result.months[5]]].map(([label, value]) => <div key={label as string}><small>{label}</small><AnimatedRupiah value={value as number} className={(value as number) < 0 ? 'amount-negative' : ''}/></div>)}</div>
      <small className="muted">{statusText[result.status][1]} Belanja ±{rupiah(Math.round(result.daily))}/hari.</small>
      <Button type="button" variant="secondary" className="small" onClick={() => navigate('forecast')}>Atur skenario <ArrowRight size={14}/></Button>
    </div>
  </details>;
}
