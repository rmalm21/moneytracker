'use client';
import { useMemo, useState } from 'react';
import { ChevronDown, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import type { InsightV3Report } from '@/lib/insight-v3';
import type { ScenarioInput, ScenarioResult } from '@/lib/insight-v3/scenario';
import type { cashflowView, dataView } from '@/lib/insight-v3/view';
import { help } from '@/lib/insight-v3/view';
import { dayMonth, money, moneySpoken, percent, signedMoney } from '@/lib/insight-v3/format';
import { HelpButton } from './section';

/** Deep-dive panels. Each answers one question first, then offers details. */

function PathChart({ result, compare }: { result: ScenarioResult; compare?: ScenarioResult }) {
  const pts = result.points, all = [...pts.map(p => p.balance), ...(compare?.points.map(p => p.balance) || []), 0];
  const max = Math.max(...all), min = Math.min(...all), w = 320, h = 96, pad = 8;
  const x = (i: number) => pad + i * (w - pad * 2) / Math.max(1, pts.length - 1), y = (v: number) => h - pad - (v - min) / Math.max(1, max - min) * (h - pad * 2);
  const line = (list: { balance: number }[]) => list.map((p, i) => `${x(i)},${y(p.balance)}`).join(' ');
  const low = pts.indexOf(pts.reduce((m, p) => p.balance < m.balance ? p : m, pts[0]));
  const marks = pts.map((p, i) => p.events.some(e => Math.abs(e.amount) >= 50_000) ? i : -1).filter(i => i >= 0);
  return <figure className="ix-path" aria-label={`Uang bebas dari ${dayMonth(pts[0].date)} sampai gajian; titik tersempit ${moneySpoken(result.lowest.balance)} pada ${dayMonth(result.lowest.date)}`}>
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      {min < 0 && <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} className="ix-zero"/>}
      {compare && <polyline points={line(compare.points)} className="ix-line-alt"/>}
      <polyline points={line(pts)} className="ix-line"/>
      {marks.map(i => <circle key={i} cx={x(i)} cy={y(pts[i].balance)} r="2.6" className="ix-mark"/>)}
      <circle cx={x(low)} cy={y(pts[low].balance)} r="4.5" className="ix-low"/>
    </svg>
    <figcaption><span>Hari ini</span><span>Tersempit {dayMonth(result.lowest.date)}</span><span>Gajian</span></figcaption>
  </figure>;
}

/** Cashflow: "Apakah uang gue aman sampai gajian?" answered first. */
export function CashflowPanel({ report, view }: { report: InsightV3Report; view: ReturnType<typeof cashflowView> }) {
  const [chart, setChart] = useState(false), [incomeOpen, setIncomeOpen] = useState(false);
  const w = report.world, income = w.income;
  return <div className="ix-stack">
    <div className={`ix-card ix-cash-hero tone-${view.status.tone}`}>
      <small>Titik tersempit sebelum gajian</small>
      <strong>{money(view.lowest.balance)}</strong>
      <span>{dayMonth(view.lowest.date)} · {view.status.text}</span>
      <p className="ix-note">Perkiraan dari uang bebas sekarang, laju belanja siklus ini, dan jadwal yang tercatat.</p>
    </div>
    <ol className="ix-timeline-events" aria-label="Kejadian penting sampai gajian">{view.events.map((e, i) => <li key={i} className={`kind-${e.kind}`}>
      <time>{dayMonth(e.date)}</time><span>{e.label}<small>{e.kind === 'scheduled' ? 'terjadwal' : e.kind === 'claim' ? 'klaim (bila cair)' : e.kind === 'lowest' ? 'perkiraan' : e.kind === 'salary' ? 'gaji biasanya' : 'uang bebas'}</small></span><em className={e.amount < 0 && e.kind !== 'lowest' ? 'down' : ''}>{e.kind === 'now' || e.kind === 'lowest' ? money(e.amount) : signedMoney(e.amount)}</em>
    </li>)}</ol>
    <button type="button" className="ix-more" aria-expanded={chart} onClick={() => setChart(v => !v)}>{chart ? 'Sembunyikan grafik' : 'Lihat grafik lengkap'}</button>
    {chart && <PathChart result={report.scenarios.base} compare={view.cases?.delayed}/>}
    {view.cases && <div className="ix-cases"><span className="ix-sim">Simulasi</span>
      <div className="ix-case"><small>Jika klaim cair sesuai biasanya</small><strong>{money(view.cases.arrives.lowest.balance)}</strong><span>titik tersempit</span></div>
      <div className="ix-case"><small>Jika klaim tertunda</small><strong>{money(view.cases.delayed.lowest.balance)}</strong><span>titik tersempit</span></div>
    </div>}
    <div className="ix-card">
      <small>Pemasukan</small>
      <strong className="ix-mid">Biasanya sekitar {money(income.typical)} per siklus</strong>
      {income.irregularShare >= .05 && <p>{percent(income.irregularShare)} berasal dari lembur, bonus, atau pendapatan tambahan.</p>}
      <button type="button" className="link-button" aria-expanded={incomeOpen} onClick={() => setIncomeOpen(v => !v)}>Rincian <ChevronDown size={13} className={incomeOpen ? 'open' : ''} aria-hidden="true"/></button>
      {incomeOpen && <dl className="ix-evidence"><div><dt>Gaji tetap biasanya</dt><dd>{money(income.regularTypical)}</dd></div><div><dt>Batas aman untuk rencana</dt><dd>{money(income.floor)}<small>gaji tetap terendah; lembur/bonus tidak dihitung</small></dd></div><div><dt>Siklus yang dipakai</dt><dd>{w.historicalCycles.length}</dd></div></dl>}
    </div>
  </div>;
}

const presets: { label: string; input: ScenarioInput }[] = [
  { label: 'Gaji −20%', input: { label: 'Gaji −20%', incomeFactor: .8 } },
  { label: 'Klaim tertunda', input: { label: 'Klaim tertunda', claimTiming: 'delayed' } },
  { label: 'Pengeluaran tak terduga Rp1 jt', input: { label: 'Tak terduga Rp1 jt', expenseDelta: 1_000_000 } },
  { label: 'Belanja harian −10%', input: { label: 'Belanja harian −10%', dailyAdjust: -10 } },
  { label: 'Tanpa lembur/bonus', input: { label: 'Tanpa lembur/bonus', regularOnly: true } },
];
const changeRows: [string, (r: ScenarioResult) => number, string][] = [['Uang sebelum gajian', r => r.beforePayday, 'money'], ['Titik tersempit', r => r.lowest.balance, 'money'], ['Ruang belanja per hari', r => r.roomPerDay, 'money'], ['Uang setelah gajian', r => r.afterSalary, 'money'], ['Ruang untuk target/bulan', r => r.goalCapacity, 'money']];

/** What changes first; the numbers that stay the same are named in one quiet line. */
function ScenarioChanges({ r, base }: { r: ScenarioResult; base: ScenarioResult }) {
  const rows = changeRows.map(([label, f]) => ({ label, value: f(r), d: f(r) - f(base) }));
  const moved = rows.filter(x => Math.abs(x.d) >= 1000), same = rows.filter(x => Math.abs(x.d) < 1000);
  return <>
    {moved.length || r.reservedNeeded > 0 ? <dl>{moved.map(x => <div key={x.label}><dt>{x.label}</dt><dd><span>{money(x.value)}</span><small className={x.d > 0 ? 'up' : 'down'}>{signedMoney(x.d)}</small></dd></div>)}{r.reservedNeeded > 0 && <div><dt>Perlu memakai dana disimpan</dt><dd><span>{money(r.reservedNeeded)}</span></dd></div>}</dl>
      : <p className="ix-empty-line">Tidak ada yang berubah sampai gajian berikutnya.</p>}
    {same.length > 0 && moved.length > 0 && <p className="ix-note">Tetap sama: {same.map(x => x.label.toLowerCase()).join(', ')}.</p>}
  </>;
}

/** Scenario Lab as a sandbox: the current baseline, "what if?" chips, then what changes. Never touches real data. */
export function ScenarioSandbox({ report, saved, onSave }: { report: InsightV3Report; saved: ScenarioInput[]; onSave: (list: ScenarioInput[]) => void }) {
  const [list, setList] = useState<ScenarioInput[]>(saved);
  const [custom, setCustom] = useState(false), [form, setForm] = useState({ expense: '', income: '', daily: '', debt: '' });
  const base = report.scenarios.base;
  const results = useMemo(() => list.map(i => report.whatIf(i)), [list, report]);
  const add = (input: ScenarioInput) => setList(cur => [input, ...cur.filter(c => c.label !== input.label)].slice(0, 3));
  const n = (v: string) => Number(v.replace(/[^\d]/g, '')) || 0;
  const addCustom = () => { add({ label: 'Skenario sendiri', expenseDelta: n(form.expense) || undefined, incomeDelta: form.income ? (form.income.trim().startsWith('-') ? -n(form.income) : n(form.income)) : undefined, dailyAdjust: form.daily ? Number(form.daily.replace(',', '.')) || undefined : undefined, extraDebtPayment: n(form.debt) || undefined }); setCustom(false); };
  return <div className="ix-stack ix-lab">
    <div className="ix-card"><small>Keadaan sekarang</small><dl className="ix-numbers"><div><dt>Sebelum gajian</dt><dd>{money(base.beforePayday)}</dd></div><div><dt>Titik tersempit</dt><dd>{money(base.lowest.balance)} · {dayMonth(base.lowest.date)}</dd></div></dl></div>
    <div><h4 className="ix-h4">Bagaimana jika…</h4><div className="ix-chips">{presets.map(p => <button key={p.label} type="button" onClick={() => add(p.input)}>{p.label}</button>)}<button type="button" onClick={() => setCustom(v => !v)} aria-expanded={custom}><Plus size={13} aria-hidden="true"/> Buat sendiri</button></div></div>
    {custom && <div className="ix-card ix-lab-form">
      <label>Pengeluaran sekali<input inputMode="numeric" value={form.expense} onChange={e => setForm({ ...form, expense: e.target.value })} placeholder="1.500.000"/></label>
      <label>Ubah gaji (±Rp)<input value={form.income} onChange={e => setForm({ ...form, income: e.target.value })} placeholder="-500.000"/></label>
      <label>Belanja harian (±%)<input value={form.daily} onChange={e => setForm({ ...form, daily: e.target.value })} placeholder="-10"/></label>
      <label>Bayar utang lebih<input inputMode="numeric" value={form.debt} onChange={e => setForm({ ...form, debt: e.target.value })} placeholder="500.000"/></label>
      <Button className="small" onClick={addCustom}>Hitung</Button>
    </div>}
    {results.map((r, i) => <article key={`${r.input.label}-${i}`} className="ix-scenario">
      <header><span className="ix-sim">Simulasi</span><strong>{r.input.label}</strong><button type="button" className="ix-icon" aria-label={`Hapus skenario ${r.input.label}`} onClick={() => setList(l => l.filter((_, k) => k !== i))}><Trash2 size={15}/></button></header>
      <ScenarioChanges r={r} base={base}/>
    </article>)}
    {!results.length && <p className="ix-empty-line">Pilih salah satu “bagaimana jika” di atas untuk melihat apa yang berubah.</p>}
    {results.length > 0 && <div className="ix-lab-foot"><Button variant="secondary" className="small" onClick={() => onSave(list)}><Save size={14}/> Simpan skenario ({list.length}/3)</Button><small>Ini “bagaimana jika”, bukan ramalan. Data aslimu tidak berubah, dan Insight tidak memilihkan yang terbaik.</small></div>}
  </div>;
}

/** Personal cost index: shown only when there is enough data. */
export function CostIndexCard({ report }: { report: InsightV3Report }) {
  const idx = useMemo(() => report.costIndex(), [report]), shops = useMemo(() => report.merchantPrices(), [report]);
  const [more, setMore] = useState(false);
  if (!idx.ok) return <p className="ix-empty-line">Indeks harga muncul setelah cukup struk dari barang yang sama ({idx.reason?.toLowerCase()})</p>;
  return <div className="ix-card">
    <small>Harga barang yang kamu beli berulang <HelpButton {...help.cost}/></small>
    <strong className={`ix-mid ${(idx.change || 0) > 0 ? 'up' : 'down'}`}>{(idx.change || 0) >= 0 ? '+' : '−'}{percent(Math.abs(idx.change || 0), 1)}</strong>
    <p>Berdasarkan {idx.items} barang yang dibeli berulang ({percent(idx.coverage)} belanja berstruk). Bukan angka inflasi Indonesia.</p>
    {idx.contributors.length > 0 && <ul className="ix-plain-list">{idx.contributors.map(c => <li key={c.name + c.merchant}><b>{c.name}</b><span>{c.merchant}: {money(c.from)} → {money(c.to)}</span></li>)}</ul>}
    <button type="button" className="link-button" aria-expanded={more} onClick={() => setMore(v => !v)}>Rincian <ChevronDown size={13} className={more ? 'open' : ''} aria-hidden="true"/></button>
    {more && <>
      {idx.decomposition && <p className="ix-note">Belanja berstruk {idx.decomposition.total >= 0 ? 'naik' : 'turun'} {money(Math.abs(idx.decomposition.total))}: dari harga {signedMoney(idx.decomposition.price)}, dari jumlah beli {signedMoney(idx.decomposition.quantity)}, barang lain {signedMoney(idx.decomposition.other)}.</p>}
      {shops.length > 0 && <ul className="ix-plain-list">{shops.slice(0, 8).map(p => <li key={p.name}><b>{p.name}</b><span>Dulu biasanya lebih murah di {p.shops[0].shop} ({p.shops.map(s => `${s.shop} ${money(s.median)}`).join(' · ')})</span></li>)}</ul>}
    </>}
  </div>;
}

export function DataSummary({ view, onOpenHealth }: { view: ReturnType<typeof dataView>; onOpenHealth: () => void }) {
  return <div className="ix-card">
    <strong className="ix-mid">{view.headline}</strong>
    <ul className="ix-bars">{view.rows.map(([l, v]) => <li key={l}><span>{l}</span><i aria-hidden="true"><b style={{ width: `${Math.round(v * 100)}%` }}/></i><em>{percent(v)}</em></li>)}</ul>
    <p className="ix-note">Dari {view.count} transaksi pengeluaran siklus ini.{view.receiptLine ? ` ${view.receiptLine}` : ''}</p>
    <Button variant="secondary" className="small" onClick={onOpenHealth}>Buka Kesehatan Data</Button>
  </div>;
}

export function GoalChoices({ report }: { report: InsightV3Report }) {
  if (!report.goalOptions.length) return null;
  return <div className="ix-card"><small>Jika kamu memilih…</small>
    <ul className="ix-plain-list">{report.goalOptions.map(o => <li key={o.key}><b>{o.label}</b><span>{o.detail} {o.delays.filter(d => d.months).map(d => `${d.name} ${Number.isFinite(d.months) ? `mundur ±${d.months} bln` : 'berhenti dulu'}`).join(', ')}</span></li>)}</ul>
    <p className="ix-note">Ini gambaran pilihan, bukan saran. Kamu yang memutuskan.</p>
  </div>;
}

/** Insight → decision → what happened after, as a small vertical timeline. */
export function DecisionTimeline({ report }: { report: InsightV3Report }) {
  if (!report.outcomes.length) return <p className="ix-empty-line">Keputusan yang kamu ambil dari Insight (misalnya mengubah anggaran) akan muncul di sini setelah cukup waktu untuk dibandingkan.</p>;
  return <ol className="ix-decisions">{report.outcomes.slice().reverse().map(o => <li key={o.decision.id} className={`is-${o.status}`}>
    <time>{dayMonth(o.decision.d)}</time>
    <div><strong>{o.decision.label}</strong><span>{o.status === 'pending' ? 'Hasilnya terlihat setelah siklus berikutnya.' : o.text.replace(/^.*?\. /, '')}</span></div>
  </li>)}</ol>;
}
