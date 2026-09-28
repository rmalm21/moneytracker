'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Briefcase, CalendarClock, ChevronRight, CreditCard, HandCoins, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from './app-provider';
import { ChartTooltip } from './chart-tooltip';
import { PeriodSelector, usePeriodTransactions } from './period-selector';
import { TxList } from './dashboard';
import { rupiah } from '@/lib/accounting';
import { dateInTimeZone, formatDate, resolvePeriodRange, todayInTimeZone, type DateRange, type PeriodPreset } from '@/lib/period';
import type { LedgerTx } from '@/lib/types';

/**
 * Laporan utang & piutang: everything about money owed in one place.
 * - where things stand now (owed to you, what you owe, office claims waiting),
 * - what moved in the chosen period and over the last six months,
 * - what is due or late, per person and per debt, and the movements themselves.
 */
const OWED_TYPES = new Set(['borrowing', 'debt_payment', 'receivable_issue', 'receivable_payment', 'claim_advance', 'claim_payment', 'claim_writeoff']);
const short = (value: number) => { const abs = Math.abs(value), sign = value < 0 ? '−' : ''; if (abs >= 1e9) return `${sign}${(abs / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`; if (abs >= 1e6) return `${sign}${(abs / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })}jt`; if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3)}rb`; return `${sign}${abs}`; };
const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 864e5);
const monthKey = (date: string) => date.slice(0, 7);
const monthName = (key: string) => new Date(`${key}-15T12:00:00`).toLocaleDateString('id-ID', { month: 'short' });

export function OwedReport({ navigate }: { navigate: (key: string, target?: string) => void }) {
  const { data, profile } = useApp();
  const today = todayInTimeZone(profile?.timeZone);
  const salaryDay = profile?.salaryCycleStartDay || 24;
  const [period, setPeriod] = useState<PeriodPreset>('salary_cycle'), [custom, setCustom] = useState<DateRange | undefined>();
  const range = resolvePeriodRange(period, salaryDay, dateInTimeZone(new Date(), profile?.timeZone), custom);
  const history = usePeriodTransactions(range);
  // Six months back for the trend (from the first of the month).
  const trendRange = useMemo(() => { const d = new Date(`${today}T12:00:00`); d.setDate(1); d.setMonth(d.getMonth() - 5); const end = new Date(`${today}T12:00:00`); end.setDate(end.getDate() + 1); return { start: d.toLocaleDateString('en-CA'), end: end.toLocaleDateString('en-CA') }; }, [today]);
  const trendHistory = usePeriodTransactions(trendRange);

  // Where things stand now.
  const receivables = data.receivables.filter(r => r.remainingAmount > 0);
  const debts = data.debts.filter(d => d.outstandingAmount > 0 && d.status !== 'paid');
  const claims = data.claims.filter(c => c.remainingAmount > 0 && !['paid', 'rejected'].includes(c.status));
  const owedToMe = receivables.reduce((n, r) => n + r.remainingAmount, 0), iOwe = debts.reduce((n, d) => n + d.outstandingAmount, 0), claimWaiting = claims.reduce((n, c) => n + c.remainingAmount, 0);
  const net = owedToMe + claimWaiting - iOwe;
  const people = new Set(receivables.map(r => r.person.trim().toLocaleLowerCase('id-ID'))).size;

  // What moved in the period.
  const moves = useMemo(() => history.items.filter(t => OWED_TYPES.has(t.type)), [history.items]);
  const sum = (type: string, list: LedgerTx[] = moves) => list.filter(t => t.type === type).reduce((n, t) => n + t.amount, 0);
  const kpis: [string, number, string, 'in' | 'out'][] = [
    ['Uang pinjaman masuk', sum('borrowing'), 'Utang baru yang uangnya masuk dompet', 'in'],
    ['Bayar utang', sum('debt_payment'), 'Cicilan dan pelunasan', 'out'],
    ['Talangan ke teman', sum('receivable_issue'), 'Piutang baru dari dompetmu', 'out'],
    ['Piutang kembali', sum('receivable_payment'), 'Uang teman yang sudah dibayar', 'in'],
    ['Talangan kantor', sum('claim_advance'), 'Dibayar dulu untuk kantor', 'out'],
    ['Klaim cair', sum('claim_payment'), 'Penggantian dari kantor', 'in'],
  ];
  const netFlow = kpis.reduce((n, [, v, , dir]) => n + (dir === 'in' ? v : -v), 0);

  // Six-month trend.
  const trend = useMemo(() => {
    const months: string[] = []; const d = new Date(`${trendRange.start}T12:00:00`);
    for (let i = 0; i < 6; i++) { months.push(d.toLocaleDateString('en-CA').slice(0, 7)); d.setMonth(d.getMonth() + 1); }
    return months.map(key => { const list = trendHistory.items.filter(t => monthKey(t.date) === key); return { month: monthName(key), 'Bayar utang': sum('debt_payment', list), 'Piutang kembali': sum('receivable_payment', list), 'Pinjam baru': sum('borrowing', list), 'Talangan baru': sum('receivable_issue', list) }; });
  }, [trendHistory.items, trendRange.start]); // eslint-disable-line react-hooks/exhaustive-deps
  const trendEmpty = trend.every(row => !row['Bayar utang'] && !row['Piutang kembali'] && !row['Pinjam baru'] && !row['Talangan baru']);

  // Due and late (debts, receivables, office claims).
  const dues = [
    ...debts.filter(d => d.dueDate).map(d => ({ key: `d${d.id}`, kind: 'Utang', title: d.name, sub: d.provider, amount: d.installmentAmount || d.outstandingAmount, date: d.dueDate, go: 'debts' })),
    ...receivables.filter(r => r.dueDate).map(r => ({ key: `r${r.id}`, kind: 'Piutang', title: r.person, sub: r.description, amount: r.remainingAmount, date: r.dueDate, go: 'receivables' })),
    ...claims.filter(c => c.expectedPaymentDate).map(c => ({ key: `c${c.id}`, kind: 'Klaim', title: c.name, sub: 'Klaim kantor', amount: c.remainingAmount, date: c.expectedPaymentDate, go: 'claims' })),
  ].map(item => ({ ...item, days: daysBetween(today, item.date) })).filter(item => item.days <= 30).sort((a, b) => a.days - b.days);

  // Per person (receivables) and per debt.
  const byPerson = useMemo(() => {
    const map = new Map<string, { name: string; remaining: number; original: number; count: number; oldest: string; split: number }>();
    for (const r of receivables) { const k = r.person.trim().toLocaleLowerCase('id-ID'); const row = map.get(k) || { name: r.person.trim(), remaining: 0, original: 0, count: 0, oldest: r.date, split: 0 }; row.remaining += r.remainingAmount; row.original += r.originalAmount; row.count++; if (r.date < row.oldest) row.oldest = r.date; if (r.splitBillId) row.split++; map.set(k, row); }
    return [...map.values()].sort((a, b) => b.remaining - a.remaining);
  }, [receivables]);

  const empty = !receivables.length && !debts.length && !claims.length && !moves.length;
  return <div className="owed-report">
    <div className="page-heading"><div><h1>Laporan utang &amp; piutang</h1><p>Posisi, pergerakan, jatuh tempo, dan rincian per orang di satu tempat.</p></div></div>

    <section className="or-hero" aria-label="Posisi sekarang">
      <small>Posisi bersih sekarang</small>
      <strong className={net < 0 ? 'is-neg' : 'is-pos'}>{net < 0 ? '−' : net > 0 ? '+' : ''}{rupiah(Math.abs(net))}</strong>
      <p>{net >= 0 ? 'Uangmu yang masih di luar lebih besar dari utangmu.' : 'Utangmu lebih besar dari uang yang masih di luar.'}</p>
      <div className="or-hero-split">
        <button type="button" onClick={() => navigate('receivables')}><span><ArrowDownLeft size={15}/> Di orang lain</span><b>{rupiah(owedToMe)}</b><small>{receivables.length ? `${people} orang · ${receivables.length} catatan` : 'Tidak ada'}</small></button>
        <button type="button" onClick={() => navigate('debts')}><span><ArrowUpRight size={15}/> Utangmu</span><b>{rupiah(iOwe)}</b><small>{debts.length ? `${debts.length} utang aktif` : 'Tidak ada'}</small></button>
        <button type="button" onClick={() => navigate('claims')}><span><Briefcase size={15}/> Klaim kantor</span><b>{rupiah(claimWaiting)}</b><small>{claims.length ? `${claims.length} menunggu cair` : 'Tidak ada'}</small></button>
      </div>
    </section>

    {empty ? <div className="panel or-empty"><HandCoins size={28}/><strong>Belum ada utang, piutang, atau klaim.</strong><small>Catat lewat tab Utang, Piutang, atau Klaim kantor; laporannya muncul di sini.</small></div> : <>
      <section className="panel or-sec">
        <div className="or-sec-head"><h3>Pergerakan periode</h3><span className={`or-net ${netFlow < 0 ? 'is-neg' : 'is-pos'}`}>Bersih {netFlow < 0 ? '−' : netFlow > 0 ? '+' : ''}{rupiah(Math.abs(netFlow))}</span></div>
        <PeriodSelector value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} label="Periode"/>
        <div className="or-kpis">{kpis.map(([label, value, hint, dir]) => <div key={label} className={`or-kpi is-${dir}`}><small>{label}</small><strong>{value ? (dir === 'in' ? '+' : '−') : ''}{rupiah(value)}</strong><span>{hint}</span></div>)}</div>
        {history.loading && <small className="muted">Memuat…</small>}
      </section>

      <section className="panel or-sec">
        <div className="or-sec-head"><h3>Tren 6 bulan</h3></div>
        {trendEmpty ? <small className="muted">Belum ada pergerakan utang atau piutang dalam 6 bulan terakhir.</small> :
          <div className="or-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={trend} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeOpacity={.7} strokeDasharray="2 6"/>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false}/>
            <YAxis tickFormatter={short} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={48}/>
            <Tooltip content={<ChartTooltip/>} cursor={{ fill: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}/>
            <Legend wrapperStyle={{ fontSize: 12 }}/>
            <Bar dataKey="Bayar utang" fill="#c2456b" radius={[4, 4, 0, 0]}/>
            <Bar dataKey="Pinjam baru" fill="#e39a6a" radius={[4, 4, 0, 0]}/>
            <Bar dataKey="Talangan baru" fill="#8b7cf6" radius={[4, 4, 0, 0]}/>
            <Bar dataKey="Piutang kembali" fill="#2f9e6e" radius={[4, 4, 0, 0]}/>
          </BarChart></ResponsiveContainer></div>}
      </section>

      <section className="panel or-sec">
        <div className="or-sec-head"><h3><CalendarClock size={17}/> Jatuh tempo 30 hari</h3></div>
        {dues.length ? <ul className="or-list">{dues.map(item => <li key={item.key}><button type="button" onClick={() => navigate(item.go)}>
          <span className={`or-badge ${item.days < 0 ? 'is-late' : item.days <= 3 ? 'is-soon' : ''}`}>{item.days < 0 ? `Lewat ${-item.days} hari` : item.days === 0 ? 'Hari ini' : item.days === 1 ? 'Besok' : `${item.days} hari lagi`}</span>
          <span className="or-list-main"><strong>{item.title}</strong><small>{item.kind}{item.sub ? ` · ${item.sub}` : ''} · {formatDate(item.date)}</small></span>
          <b>{rupiah(item.amount)}</b><ChevronRight size={16}/>
        </button></li>)}</ul> : <small className="muted">Tidak ada yang jatuh tempo dalam 30 hari.</small>}
      </section>

      <section className="panel or-sec">
        <div className="or-sec-head"><h3><Users size={17}/> Piutang per orang</h3><span className="muted">{rupiah(owedToMe)}</span></div>
        {byPerson.length ? <ul className="or-list">{byPerson.map(p => { const paid = p.original ? Math.round((p.original - p.remaining) / p.original * 100) : 0; return <li key={p.name}><button type="button" onClick={() => navigate('receivables')}>
          <span className="or-avatar" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>
          <span className="or-list-main"><strong>{p.name}</strong><small>{p.count} catatan{p.split ? ` · ${p.split} dari Split Bill` : ''} · sejak {formatDate(p.oldest)}</small><i className="or-bar"><i style={{ width: `${paid}%` }}/></i></span>
          <b>{rupiah(p.remaining)}<small>{paid}% kembali</small></b><ChevronRight size={16}/>
        </button></li>; })}</ul> : <small className="muted">Tidak ada piutang aktif.</small>}
      </section>

      <section className="panel or-sec">
        <div className="or-sec-head"><h3><CreditCard size={17}/> Utang aktif</h3><span className="muted">{rupiah(iOwe)}</span></div>
        {debts.length ? <ul className="or-list">{debts.map(d => { const paid = d.originalAmount ? Math.round((d.originalAmount - d.outstandingAmount) / d.originalAmount * 100) : 0; const months = d.installmentAmount ? Math.ceil(d.outstandingAmount / d.installmentAmount) : 0; return <li key={d.id}><button type="button" onClick={() => navigate('debts')}>
          <span className="or-avatar is-debt" aria-hidden="true"><CreditCard size={16}/></span>
          <span className="or-list-main"><strong>{d.name}</strong><small>{[d.provider, d.installmentAmount ? `cicilan ${rupiah(d.installmentAmount)}` : '', months ? `±${months} bulan lagi` : '', d.interestRate ? `bunga ${d.interestRate}%` : ''].filter(Boolean).join(' · ')}</small><i className="or-bar is-debt"><i style={{ width: `${paid}%` }}/></i></span>
          <b>{rupiah(d.outstandingAmount)}<small>{paid}% lunas</small></b><ChevronRight size={16}/>
        </button></li>; })}</ul> : <small className="muted">Tidak ada utang aktif.</small>}
      </section>

      {claims.length > 0 && <section className="panel or-sec">
        <div className="or-sec-head"><h3><Briefcase size={17}/> Klaim kantor menunggu</h3><span className="muted">{rupiah(claimWaiting)}</span></div>
        <ul className="or-list">{claims.map(c => { const age = daysBetween(c.submissionDate || today, today); return <li key={c.id}><button type="button" onClick={() => navigate('claims')}>
          <span className={`or-badge ${age > 30 ? 'is-late' : ''}`}>{age > 0 ? `${age} hari` : 'Baru'}</span>
          <span className="or-list-main"><strong>{c.name}</strong><small>Diajukan {c.submissionDate ? formatDate(c.submissionDate) : '-'}{c.expectedPaymentDate ? ` · perkiraan cair ${formatDate(c.expectedPaymentDate)}` : ''}</small></span>
          <b>{rupiah(c.remainingAmount)}</b><ChevronRight size={16}/>
        </button></li>; })}</ul>
        {claims.some(c => daysBetween(c.submissionDate || today, today) > 30) && <p className="sb-note is-warn"><AlertTriangle size={14}/> Ada klaim yang menunggu lebih dari 30 hari. Coba tanyakan ke kantor.</p>}
      </section>}

      <section className="or-sec or-moves">
        <div className="or-sec-head"><h3>Riwayat pergerakan periode ini</h3><span className="muted">{moves.length} transaksi</span></div>
        {moves.length ? <div className="tx-results"><TxList groupByDate items={moves}/></div> : <small className="muted">Belum ada pergerakan pada periode ini.</small>}
      </section>
    </>}
  </div>;
}
