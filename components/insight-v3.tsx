'use client';
import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, FlaskConical, Gauge, Link2, MessageCircleQuestion, Minus, Save, Search, Trash2 } from 'lucide-react';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { rupiah } from '@/lib/accounting';
import { ask, suggestedQuestions, type Answer } from '@/lib/insight-v3/ask';
import type { InsightV3Report } from '@/lib/insight-v3';
import type { ScenarioInput, ScenarioResult } from '@/lib/insight-v3/scenario';
import { levelWord, type GraphEdge, type Level } from '@/lib/insight-v3/types';

/** Insight V3 UI: financial state, Ask Insight, Jelaskan siklus ini, liquidity, Scenario Lab, prices, data, decisions. */
const short = (value: number) => { const n = Math.abs(value), sign = value < 0 ? '-' : ''; return n >= 1e9 ? `${sign}Rp${(n / 1e9).toFixed(1).replace('.', ',')} M` : n >= 1e6 ? `${sign}Rp${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} jt` : n >= 1e3 ? `${sign}Rp${Math.round(n / 1e3)} rb` : rupiah(value); };
const dateText = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
const levelTone: Record<Level, string> = { good: 'good', stable: 'info', watch: 'warn', pressure: 'bad' };
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Health · Momentum · main pressure, and the compact radar. */
export function StatePanel({ report }: { report: InsightV3Report }) {
  const m = report.momentum, radar = report.pressures;
  const dq = report.world.dataQuality, dataLevel: Level = dq.category >= .95 && dq.spendingCount ? 'good' : dq.category >= .85 ? 'stable' : dq.category >= .7 ? 'watch' : 'pressure';
  const items: { label: string; level: Level; note: string }[] = [
    ...radar.filter(p => ['liquidity', 'budget', 'debt', 'goal', 'claim', 'receivable'].includes(p.domain)).map(p => ({ label: p.label, level: p.level, note: p.reasons[0] || '' })),
    { label: 'Data', level: dataLevel, note: `${pct(dq.category)} pengeluaran berkategori` },
  ];
  return <section className="ins-section">
    <header className="ins-head"><span className="ins-section-icon" aria-hidden="true"><Gauge size={17}/></span><div><h2>Keadaan & tekanan</h2><small>Tekanan bersifat sementara dan tidak mengubah skor kesehatan.</small></div></header>
    <div className="i3-state">
      <div className={`i3-momentum is-${m.state.toLowerCase()}`}>
        <small>Momentum</small><strong>{m.enough ? m.label : 'Belum cukup riwayat'}</strong>
        <ul>{m.parts.map(p => <li key={p.key} className={p.good === true ? 'good' : p.good === false ? 'bad' : ''}>{p.direction === 'up' ? <ArrowUpRight size={14} aria-hidden="true"/> : p.direction === 'down' ? <ArrowDownRight size={14} aria-hidden="true"/> : <Minus size={14} aria-hidden="true"/>}<span><b>{p.label}</b> {p.detail}</span></li>)}</ul>
      </div>
      <div className="i3-pressure">
        <small>Tekanan utama</small><strong>{report.mainPressure.length ? report.mainPressure.map(p => p.label).join(' & ') : 'Tidak ada tekanan berarti'}</strong>
        <ul className="i3-radar" aria-label="Radar keuangan">{items.map(i => <li key={i.label} className={`tone-${levelTone[i.level]}`}><span className="i3-dot" aria-hidden="true"/><span><b>{i.label}</b><em>{levelWord[i.level]}</em></span><small>{i.note}</small></li>)}</ul>
      </div>
    </div>
    {report.regimes.length > 0 && <p className="i3-regime">Konteks siklus ini: {report.regimes.map(r => `${r.label} (${r.evidence[0]})`).join('; ')}.</p>}
  </section>;
}

/** Brief V3 + Ask Insight + Jelaskan siklus ini. */
export function BriefV3({ report, onOpen, known }: { report: InsightV3Report; onOpen: (sig: string) => void; known: Set<string> }) {
  const [q, setQ] = useState(''), [answer, setAnswer] = useState<Answer | null>(null), [explain, setExplain] = useState(false);
  const run = (text: string) => { if (!text.trim()) return; setQ(text); setAnswer(ask(text, report)); };
  return <section className="ins2-brief i3-brief" aria-label="Ringkasan keuangan">
    <h2><BookOpen size={16} aria-hidden="true"/> Ringkasan</h2>
    {report.silent && <p className="i3-silent">Keuangan relatif stabil.</p>}
    <p>{report.brief.map((b, i) => known.has(b.source) ? <button key={i} type="button" className="ins2-brief-link" onClick={() => onOpen(b.source)}>{b.text}</button> : <span key={i}>{b.text}</span>).reduce<React.ReactNode[]>((all, n, i) => i ? [...all, ' ', n] : [n], [])}</p>
    <div className="i3-brief-actions"><Button variant="secondary" className="small" onClick={() => setExplain(true)}><BookOpen size={15}/> Jelaskan siklus ini</Button></div>
    <form className="i3-ask" onSubmit={e => { e.preventDefault(); run(q); }}>
      <label className="search-box"><MessageCircleQuestion size={18} aria-hidden="true"/><input className="search-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Tanya Insight, mis. “kenapa uang tersedia turun?”" aria-label="Tanya Insight"/></label>
      <Button type="submit" className="small"><Search size={15}/> Tanya</Button>
    </form>
    {!answer && <div className="i3-chips">{suggestedQuestions.slice(0, 6).map(s => <button key={s} type="button" onClick={() => run(s)}>{s}</button>)}</div>}
    {answer && <div className={`i3-answer ${answer.intent === 'UNKNOWN' ? 'is-unknown' : ''}`} role="status">
      <strong>{answer.simulation && <span className="i3-sim">SIMULASI</span>} {answer.title}</strong>
      <ul>{answer.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <div className="i3-answer-foot">{answer.evidence.filter(e => known.has(e)).map(e => <button key={e} type="button" className="link-button" onClick={() => onOpen(e)}><Link2 size={13}/> Lihat bukti</button>)}<span>Hanya membaca catatanmu; tidak ada yang diubah.</span><button type="button" className="link-button" onClick={() => { setAnswer(null); setQ(''); }}>Tanya lagi</button></div>
    </div>}
    {explain && <Dialog open onOpenChange={o => { if (!o) setExplain(false); }}><DialogContent title="Siklus ini" className="ins2-drawer">
      {report.explain().map(sec => <section key={sec.title}><h4>{sec.title}</h4><ul className="i3-explain">{sec.lines.map((l, i) => <li key={i}>{l}</li>)}</ul></section>)}
      <p className="ins2-note">Disusun dari catatanmu sendiri dengan aturan tetap, tanpa AI dan tanpa internet.</p>
    </DialogContent></Dialog>}
  </section>;
}

/** "Dampaknya" in the evidence drawer: the chain from a story, direct → estimated → associated. */
export function ImpactChain({ edges, labels }: { edges: GraphEdge[]; labels: Map<string, string> }) {
  if (!edges.length) return null;
  const basis = { direct: 'Langsung', estimated: 'Perkiraan', associated: 'Terjadi bersamaan' } as const;
  return <section><h4>Dampaknya</h4><ul className="i3-chain">{edges.map((e, i) => <li key={i} className={`is-${e.basis}`}><span className="i3-basis">{basis[e.basis]}</span><span><b>{labels.get(e.to) || e.to}</b> {e.kind === 'reduces' ? 'berkurang' : e.kind === 'increases' ? 'bertambah' : e.kind === 'estimated_to_affect' ? 'bisa terdampak' : e.kind === 'funds' ? 'diisi dari sisa siklus' : ''}{e.amount ? ` ±${short(e.amount)}` : ''}<small>{e.note}</small></span></li>)}</ul></section>;
}

function Path({ result, compare }: { result: ScenarioResult; compare?: ScenarioResult }) {
  const pts = result.points, all = [...pts.map(p => p.balance), ...(compare?.points.map(p => p.balance) || []), 0];
  const max = Math.max(...all), min = Math.min(...all), w = 320, h = 90, pad = 6;
  const x = (i: number) => pad + i * (w - pad * 2) / Math.max(1, pts.length - 1), y = (v: number) => h - pad - (v - min) / Math.max(1, max - min) * (h - pad * 2);
  const line = (list: { balance: number }[]) => list.map((p, i) => `${x(i)},${y(p.balance)}`).join(' ');
  const low = pts.indexOf(pts.reduce((m, p) => p.balance < m.balance ? p : m, pts[0]));
  return <figure className="i3-path" aria-label={`Proyeksi uang bebas: terendah ${short(result.lowest.balance)} pada ${dateText(result.lowest.date)}, sebelum gajian ${short(result.beforePayday)}`}>
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      {min < 0 && <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} className="i3-zero"/>}
      {compare && <polyline points={line(compare.points)} className="i3-line-alt"/>}
      <polyline points={line(pts)} className="i3-line"/>
      <circle cx={x(low)} cy={y(pts[low].balance)} r="4" className="i3-low"/>
    </svg>
    <figcaption><span>{dateText(pts[0].date)}</span><span>terendah {dateText(result.lowest.date)}</span><span>{dateText(pts[pts.length - 1].date)}</span></figcaption>
  </figure>;
}

/** Cashflow deep dive: the path to payday, the tightest point, claim arrives vs delayed. */
export function LiquidityPanel({ report }: { report: InsightV3Report }) {
  const { base, claimArrives, claimDelayed } = report.scenarios;
  const claims = report.world.obligations.claimsOutstanding > 0 && claimArrives.lowest.balance !== claimDelayed.lowest.balance;
  return <div className="panel ins-box i3-liquidity">
    <header><strong>Jalan uang sampai gajian</strong><span className="i3-sim">SIMULASI</span></header>
    <Path result={base} compare={claims ? claimDelayed : undefined}/>
    <dl className="ins2-evidence">
      <div><dt>Titik terendah</dt><dd>{short(base.lowest.balance)}<small>{dateText(base.lowest.date)}</small></dd></div>
      <div><dt>Sebelum gajian</dt><dd>{short(base.beforePayday)}</dd></div>
      <div><dt>Laju belanja harian</dt><dd>{short(report.world.liquidity.dailyPace)}<small>tanpa tagihan & rencana</small></dd></div>
      {claims && <><div><dt>Bila klaim cair sesuai riwayat</dt><dd>{short(claimArrives.lowest.balance)}<small>titik terendah</small></dd></div><div><dt>Bila klaim tertunda</dt><dd>{short(claimDelayed.lowest.balance)}<small>titik terendah (garis tipis)</small></dd></div></>}
    </dl>
    {base.lowest.events.length > 0 && <p className="ins2-note">Menjelang titik terendah: {base.lowest.events.map(e => `${e.label} ${short(-e.amount)}`).join(', ')}.</p>}
    <p className="ins2-note">Dari uang bebas sekarang, laju belanja, dan jadwal yang tercatat. Bukan ramalan.</p>
  </div>;
}

const presets: { label: string; input: ScenarioInput }[] = [
  { label: 'Gaji −20%', input: { label: 'Gaji −20%', incomeFactor: .8 } },
  { label: 'Klaim tertunda', input: { label: 'Klaim tertunda', claimTiming: 'delayed' } },
  { label: 'Tak terduga Rp1 jt', input: { label: 'Tak terduga Rp1 jt', expenseDelta: 1_000_000 } },
  { label: 'Belanja harian −10%', input: { label: 'Belanja harian −10%', dailyAdjust: -10 } },
  { label: 'Tanpa lembur/bonus', input: { label: 'Tanpa lembur/bonus', regularOnly: true } },
];
/** Scenario Lab: compare a few "what if" paths. Read-only; nothing is changed; no scenario is called best. */
export function ScenarioLab({ report, saved, onSave }: { report: InsightV3Report; saved: ScenarioInput[]; onSave: (list: ScenarioInput[]) => void }) {
  const [list, setList] = useState<ScenarioInput[]>(() => saved.length ? saved : [presets[1].input]);
  const [form, setForm] = useState({ expense: '', income: '', daily: '', debt: '' });
  const results = useMemo(() => list.map(i => report.whatIf(i)), [list, report]);
  const base = report.scenarios.base;
  const add = (input: ScenarioInput) => setList(cur => [...cur.filter(c => c.label !== input.label), input].slice(-3));
  const custom = () => { const n = (v: string) => Number(v.replace(/\D/g, '')) || 0; const input: ScenarioInput = { label: 'Skenario sendiri', expenseDelta: n(form.expense) || undefined, incomeDelta: form.income ? (form.income.trim().startsWith('-') ? -n(form.income) : n(form.income)) : undefined, dailyAdjust: form.daily ? Number(form.daily.replace(',', '.')) || undefined : undefined, extraDebtPayment: n(form.debt) || undefined }; add(input); };
  const rows: [string, (r: ScenarioResult) => string, ((r: ScenarioResult) => number)?][] = [['Titik terendah', r => `${short(r.lowest.balance)} · ${dateText(r.lowest.date)}`, r => r.lowest.balance], ['Sebelum gajian', r => short(r.beforePayday), r => r.beforePayday], ['Setelah gajian', r => short(r.afterSalary), r => r.afterSalary], ['Ruang per hari', r => short(r.roomPerDay), r => r.roomPerDay], ['Untuk target/bulan', r => short(r.goalCapacity), r => r.goalCapacity], ['Sisa utang', r => short(r.debtAfter)], ['Perlu dana disimpan', r => r.reservedNeeded ? short(r.reservedNeeded) : '–']];
  return <div className="panel ins-box i3-lab">
    <header><strong><FlaskConical size={16} aria-hidden="true"/> Lab Skenario</strong><span className="i3-sim">SIMULASI</span></header>
    <p className="ins2-note">Bandingkan sampai 3 skenario dengan keadaan sekarang. Data aslimu tidak pernah diubah, dan Insight tidak memilihkan skenario terbaik.</p>
    <div className="i3-chips">{presets.map(p => <button key={p.label} type="button" onClick={() => add(p.input)}>{p.label}</button>)}</div>
    <div className="i3-lab-form">
      <label>Pengeluaran sekali<input inputMode="numeric" value={form.expense} onChange={e => setForm({ ...form, expense: e.target.value })} placeholder="1.500.000"/></label>
      <label>Ubah gaji (±Rp)<input value={form.income} onChange={e => setForm({ ...form, income: e.target.value })} placeholder="-500.000"/></label>
      <label>Belanja harian (±%)<input value={form.daily} onChange={e => setForm({ ...form, daily: e.target.value })} placeholder="-10"/></label>
      <label>Bayar utang lebih<input inputMode="numeric" value={form.debt} onChange={e => setForm({ ...form, debt: e.target.value })} placeholder="500.000"/></label>
      <Button variant="secondary" className="small" onClick={custom}>Tambah</Button>
    </div>
    <div className="i3-cards">
      <article className="i3-card is-base"><h5>Sekarang</h5><dl>{rows.map(([label, f]) => <div key={label}><dt>{label}</dt><dd>{f(base)}</dd></div>)}</dl></article>
      {results.map((r, i) => <article key={i} className="i3-card"><h5>{r.input.label}<button type="button" className="icon-btn" aria-label={`Hapus ${r.input.label}`} onClick={() => setList(l => l.filter((_, k) => k !== i))}><Trash2 size={13}/></button></h5><dl>{rows.map(([label, f, v]) => { const d = v ? v(r) - v(base) : 0; return <div key={label}><dt>{label}</dt><dd>{f(r)}{v && Math.abs(d) >= 1000 && <small className={d > 0 ? 'up' : 'down'}>{d > 0 ? '+' : '−'}{short(Math.abs(d))}</small>}</dd></div>; })}</dl></article>)}
    </div>
    <div className="i3-lab-foot"><Button variant="secondary" className="small" onClick={() => onSave(list)}><Save size={14}/> Simpan skenario</Button><small>Hasil di atas adalah “bagaimana jika”, bukan ramalan.</small></div>
  </div>;
}

/** Prices deep dive: Personal Cost Index (when safe) and what the user paid at different shops. */
export function CostPanel({ report }: { report: InsightV3Report }) {
  const idx = useMemo(() => report.costIndex(), [report]), shops = useMemo(() => report.merchantPrices(), [report]);
  return <div className="panel ins-box i3-cost">
    <header><strong>Indeks Biaya Pribadi</strong><small>dari barang yang kamu beli berulang (struk)</small></header>
    {idx.ok ? <>
      <p className="i3-big">{idx.change! >= 0 ? '+' : '−'}{Math.abs(Math.round(idx.change! * 1000) / 10).toLocaleString('id-ID')}%<small>harga barang yang sama, siklus lalu vs sebelumnya</small></p>
      <dl className="ins2-evidence"><div><dt>Barang yang cocok</dt><dd>{idx.items}</dd></div><div><dt>Cakupan</dt><dd>{pct(idx.coverage)}<small>dari belanja berstruk siklus lalu</small></dd></div><div><dt>Riwayat</dt><dd>{idx.cycles} siklus</dd></div></dl>
      {idx.contributors.length > 0 && <ul className="i3-list">{idx.contributors.map(c => <li key={c.name + c.merchant}><span>{c.name}<small>{c.merchant}</small></span><em>{short(c.from)} → {short(c.to)}</em></li>)}</ul>}
      {idx.decomposition && Math.abs(idx.decomposition.total) >= 1000 && <p className="ins2-note">Belanja berstruk {idx.decomposition.total >= 0 ? 'naik' : 'turun'} {short(Math.abs(idx.decomposition.total))}: dari harga {short(idx.decomposition.price)}, dari jumlah beli {short(idx.decomposition.quantity)}, barang lain/baru {short(idx.decomposition.other)}.</p>}
    </> : <p className="ins2-note">{idx.reason}</p>}
    <p className="ins2-note">Ini bukan angka inflasi Indonesia, hanya harga barang yang kamu beli sendiri.</p>
    {shops.length > 0 && <><h4 className="i3-h4">Harga yang pernah kamu bayar</h4><ul className="i3-list">{shops.slice(0, 5).map(p => <li key={p.name}><span>{p.name}<small>biasanya lebih murah di {p.shops[0].shop} (riwayat, bukan harga hari ini)</small></span><em>{p.shops.map(s => `${s.shop} ${short(s.median)}`).join(' · ')}</em></li>)}</ul></>}
  </div>;
}

export function GoalOptionsPanel({ report }: { report: InsightV3Report }) {
  if (!report.goalOptions.length) return null;
  return <div className="panel ins-box"><header><strong>Pilihan untuk target dana</strong><small>gambaran pertukaran, kamu yang memilih</small></header>
    <ul className="i3-list">{report.goalOptions.map(o => <li key={o.key}><span>{o.label}<small>{o.detail}</small></span><em>{o.delays.map(d => `${d.name}: ${Number.isFinite(d.months) ? d.months ? `+${d.months} bln` : 'tepat waktu' : 'berhenti'}`).join(' · ')}</em></li>)}</ul>
  </div>;
}

export function DataPanel({ report }: { report: InsightV3Report }) {
  const d = report.world.dataQuality;
  const rows: [string, number][] = [['Berkategori', d.category], ['Ada nama tempat', d.merchant], ['Ada jam', d.time], ['Dari struk', d.receipt]];
  return <div className="panel ins-box"><header><strong>Kelengkapan data siklus ini</strong><small>{d.spendingCount} transaksi pengeluaran</small></header>
    <ul className="i3-bars">{rows.map(([l, v]) => <li key={l}><span>{l}</span><i><b style={{ width: `${Math.round(v * 100)}%` }}/></i><em>{pct(v)}</em></li>)}</ul>
    <p className="ins2-note">Kategori dan nama tempat membuat penyebab lebih tajam; jam dipakai untuk pola waktu; struk untuk harga barang. Pemeriksaan saldo dan tautan ada di Kesehatan Data.</p>
  </div>;
}

export function DecisionList({ report }: { report: InsightV3Report }) {
  if (!report.outcomes.length) return null;
  return <section className="ins-section"><header className="ins-head"><span className="ins-section-icon" aria-hidden="true"><ArrowRight size={17}/></span><div><h2>Keputusan & hasilnya</h2><small>Dari aksi yang kamu ambil lewat Insight. “Setelah” bukan berarti “karena”.</small></div></header>
    <ul className="ins2-progress">{report.outcomes.slice().reverse().map(o => <li key={o.decision.id}><span className={`ins2-progress-static is-${o.status}`}><span><strong>{o.status === 'improved' ? 'Membaik' : o.status === 'worse' ? 'Belum membaik' : o.status === 'unchanged' ? 'Relatif sama' : 'Menunggu'}</strong><small>{o.text}</small></span></span></li>)}</ul>
  </section>;
}
