'use client';
import { useMemo, useState } from 'react';
import { useApp } from './app-provider';
import { Field, Select } from './fields';
import { PeriodSelector, usePeriodTransactions } from './period-selector';
import { metrics, rupiah } from '@/lib/accounting';
import { transactionsForCategory } from '@/lib/category-analytics';
import { dateInTimeZone, daysInRange, formatDate, periodLabel, resolvePeriodRange, summarizeTransactions, type DateRange, type Granularity, type PeriodPreset } from '@/lib/period';
import { saveProfile } from '@/lib/firestore';
import type { LedgerTx } from '@/lib/types';

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
  // A split payment only contributes its share of the chosen category, the same way Analisis counts it.
  return useMemo(() => transactionsForCategory(items.filter(item => !wallet || item.walletId === wallet || item.destinationWalletId === wallet), data.categories, category), [items, wallet, category, data.categories]);
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
  const notes = data.financialNotes.filter(note => note.date >= period.range.start && note.date < period.range.end).sort((a, b) => a.date.localeCompare(b.date));
  return <><div className="page-heading"><div><h1>Laporan keuangan</h1><p>Rangkuman transaksi periode dan posisi keuangan saat ini.</p></div><div className="heading-actions"><button type="button" className="btn btn-secondary" onClick={()=>navigate?.('cycles')}>Riwayat Siklus →</button></div></div><Filters period={period} wallet={wallet} onWallet={setWallet} category={category} onCategory={setCategory}/><div className="panel"><div className="eyebrow ink">LAPORAN PERIODE</div><h2 style={{ margin: '6px 0 20px' }}>{periodLabel(period.range)}</h2>{period.history.error ? <p className="form-error" role="alert">{period.history.error}</p> : period.history.loading ? <p role="status">Memuat seluruh transaksi periode ini…</p> : <><div className="report-block">{rows.map(([name, value]) => <div className="panel" key={name}><small>{name}</small><strong className={`report-amount ${value < 0 ? 'amount-negative' : ''}`}>{rupiah(value)}</strong></div>)}</div><div className="divider"/><h3>Catatan periode</h3><p className="muted" style={{ marginTop: 8 }}>{items.length} transaksi sesuai filter · Rata-rata pengeluaran {rupiah(summary.expense / daysInRange(period.range))} per hari. Saldo dan anggaran adalah kondisi saat ini, tidak dihitung ulang dari periode historis.</p>{notes.length > 0 && <div className="mini-list" style={{ marginTop: 14 }}>{notes.map(note => <div key={note.id}><span><strong>{note.title}</strong>{note.description && <small>{note.description}</small>}</span><small>{formatDate(note.date)}</small></div>)}</div>}</>}</div></>;
}
