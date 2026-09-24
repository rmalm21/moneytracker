'use client';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from './app-provider';
import { Empty, Field, Select } from './fields';
import { PeriodSelector, usePeriodTransactions } from './period-selector';
import { expenseAllocations, metrics, rupiah } from '@/lib/accounting';
import { dateInTimeZone, daysInRange, groupTransactions, periodLabel, resolvePeriodRange, summarizeTransactions, type DateRange, type Granularity, type PeriodPreset } from '@/lib/period';
import { saveProfile } from '@/lib/firestore';
import type { LedgerTx } from '@/lib/types';

const palette = Array.from({ length: 6 }, (_, index) => `var(--chart-${index + 1})`);
const tooltip = { formatter: (value: unknown) => rupiah(Number(value)), contentStyle: { backgroundColor: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 10 } };

function useAnalysisPeriod() {
  const { user, profile } = useApp();
  const preset = profile?.analyticsPeriod || 'salary_cycle';
  const custom = profile?.analyticsCustom;
  const range = resolvePeriodRange(preset, profile?.salaryCycleStartDay || 24, dateInTimeZone(new Date(), profile?.timeZone), custom);
  const history = usePeriodTransactions(range);
  const [saveError, setSaveError] = useState('');
  async function update(changes: { analyticsPeriod?: PeriodPreset; analyticsCustom?: DateRange; analyticsGranularity?: Granularity }) {
    if (!user) return;
    try { setSaveError(''); await saveProfile(user.uid, changes); }
    catch (error) { setSaveError((error as Error).message || 'Pilihan belum tersimpan.'); }
  }
  return { profile, preset, custom, range, history, saveError, update };
}

function Filters({ period, wallet, onWallet, category, onCategory }: { period: ReturnType<typeof useAnalysisPeriod>; wallet: string; onWallet: (value: string) => void; category: string; onCategory: (value: string) => void }) {
  const { data } = useApp();
  return <div className="panel period-filters"><PeriodSelector value={period.preset} custom={period.custom} onChange={value => void period.update({ analyticsPeriod: value })} onCustomChange={value => void period.update({ analyticsCustom: value })}/><Field label="Dompet"><Select value={wallet} onChange={event => onWallet(event.target.value)}><option value="">Semua dompet</option>{data.wallets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="Kategori / subkategori"><Select value={category} onChange={event => onCategory(event.target.value)}><option value="">Semua kategori</option>{data.categories.map(item => <option key={item.id} value={item.id}>{item.parentId?'↳ ':''}{item.name}</option>)}</Select></Field>{period.history.loading && <small role="status">Memuat seluruh transaksi periode ini…</small>}{(period.history.error || period.saveError) && <small role="alert" className="form-error">{period.history.error || period.saveError}</small>}</div>;
}

function useFilteredTransactions(items: LedgerTx[], wallet: string, category: string) {
  const { data } = useApp();
  return useMemo(() => items.filter(item => {
    if (wallet && item.walletId !== wallet && item.destinationWalletId !== wallet) return false;
    if (category && ![...expenseAllocations(item),{categoryId:item.categoryId,subcategoryId:item.subcategoryId}].some(line=>line.categoryId===category||line.subcategoryId===category||data.categories.some(child=>child.parentId===category&&(line.categoryId===child.id||line.subcategoryId===child.id)))) return false;
    return true;
  }), [items, wallet, category, data.categories]);
}

function CategoriesChart({ items }: { items: LedgerTx[] }) {
  const { data } = useApp();
  const subcategories=useMemo(()=>{const sums=new Map<string,number>();for(const item of items)for(const line of expenseAllocations(item)){const id=line.subcategoryId||data.categories.find(c=>c.id===line.categoryId)?.parentId&&line.categoryId;if(id)sums.set(id,(sums.get(id)||0)+line.amount)}return [...sums].map(([id,amount])=>({id,name:data.categories.find(c=>c.id===id)?.name||id,amount})).sort((a,b)=>b.amount-a.amount)},[items,data.categories]);
  const categories = useMemo(() => {
    const rows = new Map<string, number>();
    for (const item of items) {
      for(const line of expenseAllocations(item)){
        const sub = data.categories.find(category => category.id === line.subcategoryId || category.id === line.categoryId);
        const name = item.type === 'claim_writeoff' ? 'Klaim ditolak' : data.categories.find(category => category.id === sub?.parentId)?.name || sub?.name || 'Tanpa kategori';
        rows.set(name, (rows.get(name) || 0) + line.amount);
      }
    }
    return [...rows].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [items, data.categories]);
  return <div className="panel"><h3>Pengeluaran per kategori</h3>{categories.length ? <><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categories} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={54} outerRadius={90}>{categories.map((_, index) => <Cell key={index} fill={palette[index % palette.length]}/>)}</Pie><Tooltip {...tooltip}/></PieChart></ResponsiveContainer></div><div className="mini-list">{categories.map((row, index) => <div key={row.name}><span><i className="chart-swatch" style={{ background: palette[index % palette.length] }}/>{row.name}</span><strong>{rupiah(row.value)}</strong></div>)}</div>{subcategories.length>0&&<><h4 style={{margin:'18px 0 8px'}}>Subkategori</h4><div className="mini-list">{subcategories.map(row=><div key={row.id}><span>{row.name}</span><strong>{rupiah(row.amount)}</strong></div>)}</div></>}</> : <Empty message="Belum ada pengeluaran pada periode ini."/>}</div>;
}

export function AnalyticsView() {
  const period = useAnalysisPeriod();
  const [wallet, setWallet] = useState('');
  const [category, setCategory] = useState('');
  const items = useFilteredTransactions(period.history.items, wallet, category);
  const summary = useMemo(() => summarizeTransactions(items), [items]);
  const granularity = period.profile?.analyticsGranularity || 'auto';
  const trend = useMemo(() => groupTransactions(items, period.range, granularity), [items, period.range.start, period.range.end, granularity]);
  return <><div className="page-heading"><div><h1>Analisis</h1><p>Lihat semua transaksi pada periode yang dipilih.</p></div></div>
    <Filters period={period} wallet={wallet} onWallet={setWallet} category={category} onCategory={setCategory}/>
    <div className="card-grid analysis-summary"><div className="stat-card"><span className="stat-label">Pemasukan</span><div className="stat-value">{period.history.error ? 'Tidak tersedia' : period.history.loading ? 'Memuat…' : rupiah(summary.income)}</div></div><div className="stat-card"><span className="stat-label">Pengeluaran</span><div className="stat-value">{period.history.error ? 'Tidak tersedia' : period.history.loading ? 'Memuat…' : rupiah(summary.expense)}</div></div><div className="stat-card"><span className="stat-label">Selisih pemasukan − pengeluaran</span><div className="stat-value">{period.history.error ? 'Tidak tersedia' : period.history.loading ? 'Memuat…' : rupiah(summary.cashFlow)}</div></div><div className="stat-card"><span className="stat-label">Rata-rata pengeluaran per hari</span><div className="stat-value">{period.history.error ? 'Tidak tersedia' : period.history.loading ? 'Memuat…' : rupiah(summary.expense / daysInRange(period.range))}</div></div></div>
    <div className="section-heading"><h2>Tren keuangan</h2></div><div className="panel"><div className="toolbar-row"><Field label="Kelompok grafik"><Select value={granularity} onChange={event => void period.update({ analyticsGranularity: event.target.value as Granularity })}><option value="auto">Otomatis</option><option value="daily">Harian</option><option value="weekly">Mingguan</option><option value="monthly">Bulanan</option><option value="yearly">Tahunan</option></Select></Field><small>Total tetap sama saat kelompok grafik diganti.</small></div>{!period.history.loading && !period.history.error ? <div className="chart-box chart-wide"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 12, right: 12, left: 0, bottom: 10 }}><CartesianGrid vertical={false} stroke="var(--line)"/><XAxis dataKey="label" minTickGap={26} tick={{ fill: 'var(--muted)', fontSize: 11 }}/><YAxis width={50} tickFormatter={value => `${Math.round(value / 1000)}k`} tick={{ fill: 'var(--muted)', fontSize: 11 }}/><Tooltip {...tooltip}/><Legend/><Line type="monotone" dataKey="income" name="Pemasukan" stroke="var(--chart-income, #267e73)" strokeWidth={3} dot={trend.length <= 15}/><Line type="monotone" dataKey="expense" name="Pengeluaran" stroke="var(--chart-expense, #d79c59)" strokeWidth={3} dot={trend.length <= 15}/></LineChart></ResponsiveContainer></div> : <Empty message={period.history.error || 'Memuat tren…'}/>}</div>
    <div className="section-heading"><h2>Rincian</h2></div><div className="dashboard-split"><CategoriesChart items={items}/><div className="panel"><h3>Perbandingan per waktu</h3>{!period.history.loading && trend.length ? <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={trend}><CartesianGrid vertical={false} stroke="var(--line)"/><XAxis dataKey="label" minTickGap={26} tick={{ fill: 'var(--muted)', fontSize: 11 }}/><YAxis width={50} tickFormatter={value => `${Math.round(value / 1000)}k`} tick={{ fill: 'var(--muted)', fontSize: 11 }}/><Tooltip {...tooltip}/><Legend/><Bar dataKey="income" name="Pemasukan" fill="var(--chart-income, #267e73)" radius={[4,4,0,0]}/><Bar dataKey="expense" name="Pengeluaran" fill="var(--chart-expense, #d79c59)" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div> : <Empty message="Data periode ini sedang dimuat."/>}</div></div>
  </>;
}

export function ReportView({navigate}:{navigate?:(key:string)=>void}={}) {
  const { data, cycle, profile } = useApp();
  const period = useAnalysisPeriod();
  const [wallet, setWallet] = useState('');
  const [category, setCategory] = useState('');
  const items = useFilteredTransactions(period.history.items, wallet, category);
  const summary = useMemo(() => summarizeTransactions(items), [items]);
  const current = metrics(data, cycle.start, cycle.end, profile?.salaryCycleStartDay, dateInTimeZone(new Date(), profile?.timeZone));
  const rows: [string, number][] = [
    ['Pemasukan periode', summary.income], ['Pengeluaran periode', summary.expense], ['Selisih periode', summary.cashFlow],
    ...(!wallet && !category ? [['Aset bersih saat ini', current.netWorth], ['Uang bebas saat ini', current.free], ['Sisa anggaran saat ini', current.budgetRemaining], ['Sisa utang saat ini', current.liabilities]] as [string, number][] : []),
  ];
  return <><div className="page-heading"><div><h1>Laporan keuangan</h1><p>Rangkuman transaksi periode dan posisi keuangan saat ini.</p></div><button className="btn btn-secondary" onClick={()=>navigate?.("cycles")}>Riwayat Siklus →</button></div><Filters period={period} wallet={wallet} onWallet={setWallet} category={category} onCategory={setCategory}/><div className="panel"><div className="eyebrow ink">LAPORAN PERIODE</div><h2 style={{ margin: '7px 0 22px' }}>{periodLabel(period.range)}</h2>{period.history.error ? <p className="form-error" role="alert">{period.history.error}</p> : period.history.loading ? <p role="status">Memuat seluruh transaksi periode ini…</p> : <><div className="report-block">{rows.map(([name, value]) => <div className="panel" key={name}><small>{name}</small><strong className="report-amount">{rupiah(value)}</strong></div>)}</div><div className="divider"/><h3>Catatan periode</h3><p className="muted" style={{ marginTop: 10 }}>{items.length} transaksi sesuai filter · Rata-rata pengeluaran {rupiah(summary.expense / daysInRange(period.range))} per hari. Saldo dan anggaran adalah kondisi saat ini, tidak dihitung ulang dari periode historis.</p>{data.financialNotes.filter(note=>note.date>=period.range.start&&note.date<period.range.end).map(note=><p key={note.id} className="muted">Catatan: {note.title} · {note.description}</p>)}</>}</div></>;
}
