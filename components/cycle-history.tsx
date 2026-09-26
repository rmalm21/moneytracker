'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, BarChart3, CalendarDays, CalendarRange, CheckCircle2, Clock, Coins, Landmark, Lock, NotebookPen, RefreshCw, Scale, Sparkles, Target, TrendingDown, TrendingUp, Trophy, Wallet, type LucideIcon } from 'lucide-react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { Confirm } from './ui/alert-dialog';
import { Dialog, DialogContent } from './ui/dialog';
import { Empty } from './fields';
import { Delta } from './delta';
import { AppIcon, identityStyle } from './visual-identity';
import { typeLabels } from './dashboard';
import { budgetIconCategoryId, budgetMonthly, budgetSpent, rupiah, salaryCycle, transactionExpense } from '@/lib/accounting';
import { calculateCycleSnapshot } from '@/lib/finance-control';
import { closeCycle, refreshCycleSnapshots, saveCycleNotes } from '@/lib/finance-store';
import { loadAllTransactions } from '@/lib/firestore';
import { categoryBreakdown } from '@/lib/category-analytics';
import { incomeBreakdown, largestExpenses, walletFlows, weekdaySpending } from '@/lib/insights';
import { previousDate, todayInTimeZone } from '@/lib/period';
import type { CycleSnapshot, LedgerTx } from '@/lib/types';

/**
 * Riwayat siklus: every salary cycle as a chapter — trends across cycles, a strip of the last twelve periods
 * (running, ready to close, closed) and a detailed report per cycle.
 */
type Snap = Omit<CycleSnapshot, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };
type Period = { start: string; end: string; index: number };
const parse = (date: string) => new Date(`${date}T12:00:00`);
const day = (date: string, withYear = true) => parse(date).toLocaleDateString('id-ID', withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
/** A cycle is named after the month most of it falls in (25 Agu – 24 Sep → September). */
const monthOf = (start: string, style: 'long' | 'short' = 'long') => { const d = parse(start); d.setDate(d.getDate() + 15); return d.toLocaleDateString('id-ID', style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' }); };
const rangeText = (start: string, end: string) => `${day(start, false)} – ${day(previousDate(end))}`;
const daysOf = (start: string, end: string) => Math.max(1, Math.round((parse(end).getTime() - parse(start).getTime()) / 86400000));
const short = (value: number) => { const n = Math.abs(value), sign = value < 0 ? '-' : ''; return n >= 1e9 ? `${sign}Rp${(n / 1e9).toFixed(1).replace('.', ',')} M` : n >= 1e6 ? `${sign}Rp${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} jt` : n >= 1e3 ? `${sign}Rp${Math.round(n / 1e3)} rb` : rupiah(value); };
const rateOf = (s: Pick<Snap, 'income' | 'cashFlow'>) => s.income > 0 ? s.cashFlow / s.income : null;
const pct = (value: number) => `${Math.round(value * 100)}%`;

/** Short verdicts for a cycle, shown as badges. */
function badges(s: Snap): { label: string; tone: 'good' | 'warn' | 'bad' | 'info' }[] {
  const list: { label: string; tone: 'good' | 'warn' | 'bad' | 'info' }[] = [];
  const rate = rateOf(s);
  if (s.cashFlow < 0) list.push({ label: 'Defisit', tone: 'bad' });
  else if (rate !== null && rate >= .3) list.push({ label: 'Hemat', tone: 'good' });
  if (s.budgetTotal > 0 && s.budgetSpent > s.budgetTotal) list.push({ label: 'Anggaran terlampaui', tone: 'warn' });
  else if (s.budgetTotal > 0 && s.budgetSpent <= s.budgetTotal * .85) list.push({ label: 'Anggaran aman', tone: 'good' });
  if (s.closingNetWorth > s.openingNetWorth) list.push({ label: 'Aset bersih naik', tone: 'info' });
  if (s.debtPaid > 0) list.push({ label: 'Cicil utang', tone: 'info' });
  return list;
}

export function CycleHistory({ notify }: { notify: (text: string) => void }) {
  const { data, profile, user, cycle } = useApp();
  const salaryDay = profile?.salaryCycleStartDay || 24;
  const today = todayInTimeZone(profile?.timeZone);
  const [ledger, setLedger] = useState<LedgerTx[] | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [openStart, setOpenStart] = useState<string | null>(null);
  useEffect(() => { if (!user) return; let active = true; loadAllTransactions(user.uid).then(items => { if (active) setLedger(items); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [user, data.cycleSnapshots.length]);

  // The running cycle and the twelve before it.
  const periods = useMemo<Period[]>(() => { const list: Period[] = []; let start = cycle.start; for (let i = 0; i <= 12; i++) { const c = salaryCycle(parse(start), salaryDay); list.push({ start: c.start, end: c.end, index: i }); start = salaryCycle(parse(previousDate(c.start)), salaryDay).start; } return list; }, [cycle.start, salaryDay]);
  const closed = useMemo(() => [...data.cycleSnapshots].sort((a, b) => b.startDate.localeCompare(a.startDate)), [data.cycleSnapshots]);
  const snapOf = (start: string) => closed.find(s => s.startDate === start);
  // Cycles that ended before the first recorded transaction have nothing to report.
  const earliest = useMemo(() => (ledger || []).reduce((min, t) => t.date < min ? t.date : min, today), [ledger, today]);
  const stateOf = (p: Period) => snapOf(p.start) ? 'closed' : p.end > today ? 'running' : ledger && p.end <= earliest ? 'empty' : 'ready';
  const ready = periods.filter(p => stateOf(p) === 'ready');

  // Across all closed cycles (oldest first for trends).
  const ascending = [...closed].reverse();
  const overview = closed.length ? (() => {
    const avg = (pick: (s: CycleSnapshot) => number) => closed.reduce((n, s) => n + pick(s), 0) / closed.length;
    const rates = closed.map(rateOf).filter((r): r is number => r !== null);
    const best = closed.reduce((a, b) => b.cashFlow > a.cashFlow ? b : a), worst = closed.reduce((a, b) => b.cashFlow < a.cashFlow ? b : a);
    return { income: avg(s => s.income), expense: avg(s => s.expense), rate: rates.length ? rates.reduce((n, r) => n + r, 0) / rates.length : null, best, worst, growth: ascending[ascending.length - 1].closingNetWorth - ascending[0].openingNetWorth, saved: closed.reduce((n, s) => n + s.savings, 0) };
  })() : null;
  const trend = ascending.slice(-8), trendMax = Math.max(1, ...trend.flatMap(s => [s.income, s.expense]));

  async function refresh() { if (!user) return; setBusy(true); setError(''); try { await refreshCycleSnapshots(user.uid, '0000-01-01'); notify('Laporan siklus dihitung ulang dari seluruh transaksi.'); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  const active = openStart ? periods.find(p => p.start === openStart) || (snapOf(openStart) ? { start: openStart, end: snapOf(openStart)!.endDate, index: -1 } : null) : null;

  return <div className="cy-page">
    <div className="page-heading"><div><h1>Riwayat Siklus</h1><p>Setiap siklus gaji sebagai satu bab: tren, posisi keuangan, anggaran, dan cerita lengkapnya.</p></div><div className="heading-actions"><Button variant="secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15}/> Perbarui laporan</Button></div></div>
    {error && <p role="alert" className="form-error">{error}</p>}

    {overview ? <section className="cy-overview">
      <div className="cy-overview-main"><span className="cy-kicker"><Sparkles size={14}/> {closed.length} siklus tercatat</span><strong>{overview.rate === null ? '–' : pct(overview.rate)}</strong><small>rata-rata pemasukan yang tersisa per siklus</small></div>
      <div className="cy-overview-grid">
        <Tile icon={TrendingUp} label="Rata-rata masuk" value={short(overview.income)} tone="in"/>
        <Tile icon={TrendingDown} label="Rata-rata keluar" value={short(overview.expense)} tone="out"/>
        <Tile icon={Scale} label="Aset bersih" value={`${overview.growth >= 0 ? '+' : ''}${short(overview.growth)}`} note="sejak siklus pertama" tone={overview.growth >= 0 ? 'in' : 'out'}/>
        <Tile icon={Coins} label="Total ditabung" value={short(overview.saved)} note="setoran tujuan dana"/>
        <Tile icon={Trophy} label="Siklus terbaik" value={monthOf(overview.best.startDate)} note={`sisa ${short(overview.best.cashFlow)}`} onClick={() => setOpenStart(overview.best.startDate)}/>
        {overview.worst.startDate !== overview.best.startDate && <Tile icon={Target} label="Siklus terberat" value={monthOf(overview.worst.startDate)} note={`sisa ${short(overview.worst.cashFlow)}`} onClick={() => setOpenStart(overview.worst.startDate)}/>}
      </div>
    </section> : <section className="cy-intro"><span className="cy-intro-icon"><CalendarRange size={22}/></span><div><strong>Belum ada siklus yang ditutup</strong><p>Menutup siklus menyimpan ringkasan satu periode gaji: pemasukan, pengeluaran, anggaran, aset, dan utang saat itu. Dari situ tren antarsiklus bisa dibandingkan.</p></div></section>}

    {trend.length > 1 && <section className="panel cy-trend">
      <div className="cy-head"><h3><BarChart3 size={17}/> Tren per siklus</h3><small>{trend.length} siklus terakhir yang ditutup</small></div>
      <div className="cy-bars" role="img" aria-label={trend.map(s => `${monthOf(s.startDate)}: masuk ${short(s.income)}, keluar ${short(s.expense)}`).join('; ')}>{trend.map(s => { const rate = rateOf(s); return <button type="button" key={s.startDate} className="cy-bar-col" onClick={() => setOpenStart(s.startDate)} title={`${monthOf(s.startDate)} · sisa ${short(s.cashFlow)}`}>
        <span className={`cy-bar-rate ${s.cashFlow < 0 ? 'is-bad' : ''}`}>{rate === null ? '–' : pct(rate)}</span>
        <span className="cy-bar-pair"><i className="in" style={{ height: `${s.income / trendMax * 100}%` }}/><i className="out" style={{ height: `${s.expense / trendMax * 100}%` }}/></span>
        <small>{monthOf(s.startDate, 'short')}</small>
      </button>; })}</div>
      <div className="cy-legend"><span><i className="in"/>Pemasukan</span><span><i className="out"/>Pengeluaran</span><span className="muted">% = bagian pemasukan yang tersisa</span></div>
    </section>}

    <section className="cy-strip-wrap">
      <div className="cy-head"><h3><CalendarDays size={17}/> 12 siklus terakhir</h3>{ready.length > 0 && <small className="cy-ready-note">{ready.length} siap ditutup</small>}</div>
      <div className="cy-strip">{periods.map(p => { const snap = snapOf(p.start), state = stateOf(p); return <button type="button" key={p.start} className={`cy-chip is-${state}`} disabled={state === 'empty'} onClick={() => setOpenStart(p.start)}>
        <span className="cy-chip-month">{monthOf(p.start, 'short')}<em>{parse(p.start).getFullYear() !== parse(today).getFullYear() ? ` ${String(parse(p.start).getFullYear()).slice(2)}` : ''}</em></span>
        <span className="cy-chip-state">{state === 'closed' ? <><CheckCircle2 size={12}/> Ditutup</> : state === 'ready' ? <><Lock size={12}/> Siap ditutup</> : state === 'empty' ? 'Belum ada data' : <><Clock size={12}/> Berjalan</>}</span>
        {snap && <b className={snap.cashFlow < 0 ? 'is-bad' : ''}>{short(snap.cashFlow)}</b>}
      </button>; })}</div>
    </section>

    <div className="section-heading"><h2>Siklus yang ditutup</h2></div>
    {closed.length ? <div className="cy-list">{closed.map((s, i) => { const previous = closed[i + 1], rate = rateOf(s), usage = s.budgetTotal > 0 ? s.budgetSpent / s.budgetTotal : null; return <button type="button" key={s.id} className="cy-card" onClick={() => setOpenStart(s.startDate)}>
      <div className="cy-card-top"><span className="cy-card-title"><strong>{monthOf(s.startDate)}</strong><small>{rangeText(s.startDate, s.endDate)}</small></span><span className="cy-card-flow"><strong className={s.cashFlow < 0 ? 'amount-negative' : 'amount-positive'}>{s.cashFlow > 0 ? '+' : ''}{rupiah(s.cashFlow)}</strong>{previous && <Delta current={s.cashFlow} previous={previous.cashFlow} good="up" basis="Siklus sebelumnya" compact/>}</span></div>
      <div className="cy-card-flows"><span><small>Masuk</small><b>{short(s.income)}</b></span><span><small>Keluar</small><b>{short(s.expense)}</b></span><span><small>Tersisa</small><b>{rate === null ? '–' : pct(rate)}</b></span><span><small>Aset bersih</small><b className={s.closingNetWorth < s.openingNetWorth ? 'amount-negative' : ''}>{s.closingNetWorth >= s.openingNetWorth ? '+' : ''}{short(s.closingNetWorth - s.openingNetWorth)}</b></span></div>
      {usage !== null && <div className="cy-card-budget"><span>Anggaran {pct(usage)} terpakai</span><i><b className={usage > 1 ? 'is-over' : ''} style={{ width: `${Math.min(100, usage * 100)}%` }}/></i></div>}
      <div className="cy-badges">{badges(s).map(b => <span key={b.label} className={`cy-badge is-${b.tone}`}>{b.label}</span>)}<span className="cy-open">Buka laporan <ArrowRight size={14}/></span></div>
    </button>; })}</div> : <div className="panel"><Empty message="Belum ada siklus yang ditutup. Pilih siklus bertanda “Siap ditutup” di atas untuk memulai."/></div>}

    <Dialog open={Boolean(active)} onOpenChange={value => { if (!value) setOpenStart(null); }}><DialogContent title="Laporan siklus" className="cy-dialog">
      {active && <CycleDetail period={active} ledger={ledger} snap={snapOf(active.start)} previous={closed.find(s => s.endDate === active.start)} today={today} onClosed={message => { notify(message); }} onDone={() => setOpenStart(null)}/>}
    </DialogContent></Dialog>
  </div>;
}

function Tile({ icon: Icon, label, value, note, tone, onClick }: { icon: LucideIcon; label: string; value: string; note?: string; tone?: 'in' | 'out'; onClick?: () => void }) {
  const body = <><span className="cy-tile-icon"><Icon size={15}/></span><small>{label}</small><strong className={tone === 'out' ? 'is-out' : tone === 'in' ? 'is-in' : ''}>{value}</strong>{note && <em>{note}</em>}</>;
  return onClick ? <button type="button" className="cy-tile is-link" onClick={onClick}>{body}</button> : <div className="cy-tile">{body}</div>;
}

function Section({ icon: Icon, title, aside, open, children }: { icon: LucideIcon; title: string; aside?: ReactNode; open?: boolean; children: ReactNode }) {
  return <details className="cy-sec" open={open}><summary><span className="cy-sec-icon"><Icon size={15}/></span><strong>{title}</strong>{aside && <span className="cy-sec-aside">{aside}</span>}</summary><div className="cy-sec-body">{children}</div></details>;
}

/** Everything about one cycle; a cycle that is not closed yet is previewed from the transactions. */
function CycleDetail({ period, ledger, snap, previous, today, onClosed, onDone }: { period: { start: string; end: string }; ledger: LedgerTx[] | null; snap?: CycleSnapshot; previous?: CycleSnapshot; today: string; onClosed: (message: string) => void; onDone: () => void }) {
  const { data, profile, user } = useApp();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState(snap?.notes || '');
  useEffect(() => setNote(snap?.notes || ''), [snap?.id, snap?.notes]);
  const preview = useMemo(() => !snap && ledger ? calculateCycleSnapshot(data, ledger, period, undefined, Boolean(profile?.netWorthIncludesReceivables)) : null, [snap, ledger, data, period.start, period.end, profile?.netWorthIncludesReceivables]);
  const s: Snap | null = snap || preview;
  const tx = useMemo(() => (ledger || []).filter(t => t.date >= period.start && t.date < period.end), [ledger, period.start, period.end]);
  if (!s) return <p role="status" className="muted">Menghitung seluruh transaksi siklus…</p>;
  const running = period.end > today, canClose = !snap && !running;
  const rate = rateOf(s), days = daysOf(period.start, period.end), basis = 'Siklus sebelumnya';
  const categories = categoryBreakdown(tx, data.categories), income = incomeBreakdown(tx, data.categories), wallets = walletFlows(tx, data.wallets);
  const weekdays = weekdaySpending(tx, period), weekMax = Math.max(1, ...weekdays.map(w => w.average));
  const biggest = largestExpenses(tx, 5);
  const perDay = new Map<string, number>(); for (const t of tx) { const e = transactionExpense(t); if (e) perDay.set(t.date, (perDay.get(t.date) || 0) + e); }
  const topDay = [...perDay].sort((a, b) => b[1] - a[1])[0];
  const allEvents = tx.filter(t => t.type === 'income' || ['debt_payment', 'claim_payment', 'receivable_payment', 'fund_contribution', 'borrowing'].includes(t.type)).sort((a, b) => a.date.localeCompare(b.date)), events = allEvents.slice(0, 14);
  const notes = data.financialNotes.filter(n => n.date >= period.start && n.date < period.end || n.cycleStart === period.start);
  const budgets = (s.budgetDefinitions || []).map(b => { const spent = budgetSpent(b, tx, data.categories); const cat = data.categories.find(c => c.id === budgetIconCategoryId(b)); return { id: b.id, name: b.name || cat?.name || 'Anggaran', icon: cat?.icon, color: cat?.color, amount: budgetMonthly(b), spent }; }).sort((a, b) => b.spent / Math.max(1, b.amount) - a.spent / Math.max(1, a.amount));
  const catMax = Math.max(1, ...categories.map(c => c.amount));
  const usage = s.budgetTotal > 0 ? s.budgetSpent / s.budgetTotal : null;

  async function close() { if (!user) return; setBusy(true); setError(''); try { await closeCycle(user.uid, period, today); onClosed(`Siklus ${monthOf(period.start)} ditutup. Ringkasannya tersimpan.`); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function saveNote() { if (!user || !snap) return; setBusy(true); setError(''); try { await saveCycleNotes(user.uid, snap.id, note.trim()); onClosed('Catatan siklus disimpan.'); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }

  return <div className="cy-detail">
    <header className={`cy-hero ${s.cashFlow < 0 ? 'is-bad' : ''}`}>
      <div className="cy-hero-top"><span><strong>{monthOf(period.start)}</strong><small>{rangeText(period.start, period.end)} · {days} hari</small></span><span className={`cy-status is-${snap ? 'closed' : running ? 'running' : 'ready'}`}>{snap ? <><CheckCircle2 size={13}/> Ditutup</> : running ? <><Clock size={13}/> Berjalan</> : <><Lock size={13}/> Belum ditutup</>}</span></div>
      <small className="cy-hero-label">Sisa masuk − keluar</small>
      <strong className="cy-hero-value">{s.cashFlow > 0 ? '+' : ''}{rupiah(s.cashFlow)}</strong>
      <div className="cy-hero-chips"><span>{rate === null ? 'Belum ada pemasukan' : `${pct(rate)} pemasukan tersisa`}</span>{previous && <Delta current={s.cashFlow} previous={previous.cashFlow} good="up" basis={basis}/>}</div>
      {!snap && <p className="cy-hero-note">{running ? 'Siklus masih berjalan; angka ini sementara.' : 'Pratinjau dari transaksi. Tutup siklus untuk menyimpannya sebagai riwayat.'}</p>}
    </header>

    <div className="cy-kpis">
      <Kpi label="Pemasukan" value={s.income} previous={previous?.income} good="up"/>
      <Kpi label="Pengeluaran" value={s.expense} previous={previous?.expense} good="down"/>
      <Kpi label="Ditabung" value={s.savings} previous={previous?.savings} good="up" note="setoran tujuan dana"/>
      <Kpi label="Utang dibayar" value={s.debtPaid} previous={previous?.debtPaid} good="up"/>
      <Kpi label="Klaim cair" value={s.claimReceived} previous={previous?.claimReceived} good="up"/>
      <Kpi label="Belanja per hari" value={Math.round(s.expense / days)} previous={previous ? Math.round(previous.expense / daysOf(previous.startDate, previous.endDate)) : undefined} good="down"/>
    </div>

    <Section icon={Landmark} title="Posisi keuangan" aside={`${s.closingNetWorth >= s.openingNetWorth ? '+' : ''}${short(s.closingNetWorth - s.openingNetWorth)}`} open>
      <div className="cy-rows">
        <Move label="Total aset" from={s.openingAssets} to={s.closingAssets}/>
        <Move label="Aset bersih" from={s.openingNetWorth} to={s.closingNetWorth} strong/>
        <Row label="Disimpan, kantong & tujuan dana" value={s.reservedMoney} note="di akhir siklus"/>
        <Row label="Utang tersisa" value={s.debtOutstanding} note="di akhir siklus" bad={s.debtOutstanding > 0}/>
        <Row label="Klaim kantor belum cair" value={s.claimsOutstanding} note="di akhir siklus"/>
      </div>
    </Section>

    <Section icon={Target} title="Anggaran" aside={usage === null ? 'Tidak ada' : `${pct(usage)} terpakai`} open={budgets.length > 0}>
      {usage !== null ? <>
        <div className="cy-budget-total"><div><small>Terpakai</small><strong>{rupiah(s.budgetSpent)}</strong></div><div><small>dari</small><strong>{rupiah(s.budgetTotal)}</strong></div><div><small>{s.budgetRemaining < 0 ? 'Lewat' : 'Sisa'}</small><strong className={s.budgetRemaining < 0 ? 'amount-negative' : 'amount-positive'}>{rupiah(Math.abs(s.budgetRemaining))}</strong></div></div>
        <i className="cy-meter"><b className={usage > 1 ? 'is-over' : ''} style={{ width: `${Math.min(100, usage * 100)}%` }}/></i>
        <ul className="cy-list-rows">{budgets.map(b => { const u = b.amount ? b.spent / b.amount : 0; return <li key={b.id}><span className="cy-dot" style={identityStyle(b.color)}><AppIcon icon={b.icon} fallback="🎯"/></span><span className="cy-row-main"><span>{b.name}</span><i className="cy-meter small"><b className={u > 1 ? 'is-over' : ''} style={{ width: `${Math.min(100, u * 100)}%` }}/></i></span><span className="cy-row-num"><b>{short(b.spent)}</b><small>dari {short(b.amount)}</small></span></li>; })}</ul>
      </> : <p className="muted">Belum ada anggaran aktif di siklus ini.</p>}
    </Section>

    <Section icon={TrendingDown} title="Pengeluaran per kategori" aside={`${categories.length} kategori`} open>
      {categories.length ? <ul className="cy-list-rows">{categories.slice(0, 10).map(c => <li key={c.id}><span className="cy-dot" style={identityStyle(c.color)}><AppIcon icon={c.icon} fallback="🗂️"/></span><span className="cy-row-main"><span>{c.name}</span><i className="cy-meter small cat"><b style={{ width: `${Math.max(2, c.amount / catMax * 100)}%`, ...identityStyle(c.color) }}/></i></span><span className="cy-row-num"><b>{short(c.amount)}</b><small>{s.expense ? pct(c.amount / s.expense) : '–'}</small></span></li>)}</ul> : <p className="muted">Tidak ada pengeluaran.</p>}
    </Section>

    <Section icon={TrendingUp} title="Sumber pemasukan" aside={short(s.income)}>
      {income.length ? <ul className="cy-list-rows">{income.map(c => <li key={c.id}><span className="cy-dot" style={identityStyle(c.color)}><AppIcon icon={c.icon} fallback="💰"/></span><span className="cy-row-main"><span>{c.name}</span><small>{c.count} transaksi</small></span><span className="cy-row-num"><b>{short(c.amount)}</b><small>{s.income ? pct(c.amount / s.income) : '–'}</small></span></li>)}</ul> : <p className="muted">Tidak ada pemasukan tercatat.</p>}
    </Section>

    <Section icon={Wallet} title="Pergerakan per dompet" aside={`${wallets.length} dompet`}>
      {wallets.length ? <ul className="cy-list-rows">{wallets.map(w => <li key={w.id}><span className="cy-dot" style={identityStyle(w.color)}><AppIcon icon={w.icon}/></span><span className="cy-row-main"><span>{w.name}</span><small>masuk {short(w.in)} · keluar {short(w.out)}</small></span><span className="cy-row-num"><b className={w.net < 0 ? 'amount-negative' : 'amount-positive'}>{w.net > 0 ? '+' : ''}{short(w.net)}</b></span></li>)}</ul> : <p className="muted">Tidak ada pergerakan.</p>}
    </Section>

    <Section icon={CalendarDays} title="Pola belanja" aside={topDay ? `puncak ${day(topDay[0], false)}` : undefined}>
      <div className="cy-week">{weekdays.map(w => <span key={w.label}><i style={{ height: `${Math.max(4, w.average / weekMax * 100)}%` }}/><small>{w.label}</small></span>)}</div>
      <p className="cy-week-note">Rata-rata belanja per hari menurut harinya.{topDay ? <> Hari paling boros: <b>{day(topDay[0])}</b> ({rupiah(topDay[1])}).</> : ''} {tx.filter(t => transactionExpense(t) > 0).length} transaksi pengeluaran.</p>
      {biggest.length > 0 && <><h5 className="cy-sub">Pengeluaran terbesar</h5><ul className="cy-list-rows compact">{biggest.map(t => { const cat = data.categories.find(c => c.id === t.categoryId); return <li key={t.id}><span className="cy-dot" style={identityStyle(cat?.color)}><AppIcon icon={cat?.icon} fallback="🧾"/></span><span className="cy-row-main"><span>{t.description || t.merchant || cat?.name || 'Pengeluaran'}</span><small>{day(t.date, false)}{cat ? ` · ${cat.name}` : ''}</small></span><span className="cy-row-num"><b>{short(transactionExpense(t))}</b></span></li>; })}</ul></>}
    </Section>

    <Section icon={Sparkles} title="Peristiwa penting" aside={`${allEvents.length}`}>
      {events.length ? <ol className="cy-timeline">{events.map(t => <li key={t.id} className={`is-${t.type}`}><span className="cy-time">{day(t.date, false)}</span><span className="cy-row-main"><span>{t.description || t.merchant || typeLabels[t.type] || t.type}</span><small>{typeLabels[t.type] || t.type}</small></span><b>{short(t.amount)}</b></li>)}</ol> : <p className="muted">Tidak ada peristiwa khusus.</p>}
      {allEvents.length > events.length && <p className="muted cy-sub">+{allEvents.length - events.length} peristiwa lain ada di menu Transaksi.</p>}
    </Section>

    <Section icon={NotebookPen} title="Catatan" aside={notes.length ? `${notes.length} catatan` : undefined} open={Boolean(snap?.notes)}>
      {notes.map(n => <p key={n.id} className="cy-note"><b>{n.title}</b>{n.description ? ` — ${n.description}` : ''}</p>)}
      {snap ? <div className="cy-note-edit"><textarea className="input" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Tulis hal penting di siklus ini, mis. bonus, biaya tak terduga, pelajaran…"/><Button variant="secondary" className="small" disabled={busy || note.trim() === (snap.notes || '')} onClick={() => void saveNote()}>Simpan catatan</Button></div> : <p className="muted">Catatan siklus bisa ditulis setelah siklus ditutup.</p>}
    </Section>

    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="modal-actions">
      <Button variant="secondary" onClick={onDone}>Tutup</Button>
      {canClose && <Confirm title={`Tutup siklus ${monthOf(period.start)}?`} description="Ringkasan siklus ini disimpan sebagai riwayat, dengan pengaturan anggaran yang berlaku sekarang. Transaksi lama masih bisa diubah; laporannya akan dihitung ulang otomatis." onConfirm={() => void close()}><Button disabled={busy || !ledger}><Lock size={15}/> Tutup siklus</Button></Confirm>}
    </div>
  </div>;
}

function Kpi({ label, value, previous, good, note }: { label: string; value: number; previous?: number; good: 'up' | 'down'; note?: string }) {
  return <div className="cy-kpi"><small>{label}</small><strong>{short(value)}</strong>{previous !== undefined && (value || previous) ? <Delta current={value} previous={previous} good={good} basis="Siklus sebelumnya" compact/> : note ? <em>{note}</em> : null}</div>;
}
function Move({ label, from, to, strong }: { label: string; from: number; to: number; strong?: boolean }) {
  const change = to - from;
  return <div className={`cy-row ${strong ? 'is-strong' : ''}`}><span>{label}</span><span className="cy-move"><small>{short(from)}</small><ArrowRight size={13}/><b>{short(to)}</b><em className={change < 0 ? 'amount-negative' : 'amount-positive'}>{change >= 0 ? '+' : ''}{short(change)}</em></span></div>;
}
function Row({ label, value, note, bad }: { label: string; value: number; note?: string; bad?: boolean }) {
  return <div className="cy-row"><span>{label}{note && <small>{note}</small>}</span><b className={bad ? 'amount-negative' : ''}>{rupiah(value)}</b></div>;
}
