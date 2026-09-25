'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, BrainCircuit, CalendarClock, Check, CircleCheck, EyeOff, Gauge, Info, Landmark, Lightbulb, Repeat, Scissors, TrendingDown, Wallet, type LucideIcon } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { usePeriodTransactions } from './period-selector';
import { Button } from './ui/button';
import { AppIcon, identityStyle } from './visual-identity';
import { analyzeFinances, pastCycles, type Advice, type Apply, type Finding, type Tone } from '@/lib/advisor';
import { budgetWindow, metrics, rupiah } from '@/lib/accounting';
import { commitments } from '@/lib/finance-control';
import { saveRecord } from '@/lib/firestore';
import { dateInTimeZone, todayInTimeZone } from '@/lib/period';
import type { Budget } from '@/lib/types';

/**
 * Insight: a personal financial check-up built from several salary cycles of history.
 * All analysis runs on the device (lib/advisor.ts); nothing is sent anywhere.
 */
const short = (value: number) => { const n = Math.abs(value), sign = value < 0 ? '-' : ''; return n >= 1e9 ? `${sign}Rp${(n / 1e9).toFixed(1).replace('.', ',')} M` : n >= 1e6 ? `${sign}Rp${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} jt` : n >= 1e3 ? `${sign}Rp${Math.round(n / 1e3)} rb` : rupiah(value); };
const pct = (value: number) => `${Math.round(value * 100)}%`;
const toneIcon: Record<Tone, LucideIcon> = { good: CircleCheck, warn: AlertTriangle, bad: AlertTriangle, info: Info };
const hiddenKey = (uid: string) => `dompet-ajaib:insight-hidden:${uid}`;
const readHidden = (uid?: string): string[] => { if (!uid) return []; try { return JSON.parse(localStorage.getItem(hiddenKey(uid)) || '[]'); } catch { return []; } };

function Spark({ values, labels, percent }: { values: number[]; labels?: string[]; percent?: boolean }) {
  if (values.length < 2) return null;
  const w = 132, h = 38, pad = 4, max = Math.max(...values, percent ? 100 : 0, 1);
  const x = (i: number) => pad + i * (w - pad * 2) / (values.length - 1), y = (v: number) => h - pad - v / max * (h - pad * 2);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = values.length - 1;
  return <figure className="ins-spark" aria-label={`Riwayat: ${values.map((v, i) => `${labels?.[i] || i + 1} ${percent ? `${v}%` : short(v)}`).join(', ')}`}>
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      {percent && <line x1={pad} x2={w - pad} y1={y(100)} y2={y(100)} className="ins-spark-limit"/>}
      <polyline points={`${x(0)},${h - pad} ${points} ${x(last)},${h - pad}`} className="ins-spark-fill"/>
      <polyline points={points} className="ins-spark-line"/>
      <circle cx={x(last)} cy={y(values[last])} r="3.2" className="ins-spark-dot"/>
    </svg>
    {labels && <figcaption><span>{labels[0]}</span><span>{labels[last]}</span></figcaption>}
  </figure>;
}

function Ring({ score, tone }: { score: number; tone: Tone }) {
  const r = 46, c = 2 * Math.PI * r;
  return <div className={`ins-ring tone-${tone}`} role="img" aria-label={`Skor kesehatan keuangan ${score} dari 100`}>
    <svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r={r} className="ins-ring-track"/><circle cx="55" cy="55" r={r} className="ins-ring-bar" strokeDasharray={`${c * score / 100} ${c}`}/></svg>
    <div><strong>{score}</strong><small>dari 100</small></div>
  </div>;
}

function FindingCard({ finding, index, onApply, onGo, onHide, busy }: { finding: Finding; index?: number; onApply: (apply: Apply, finding: Finding) => void; onGo: (view: string, focus?: string) => void; onHide?: (id: string) => void; busy: boolean }) {
  const Icon = toneIcon[finding.tone];
  const percent = finding.id.startsWith('shrink-') || finding.id.startsWith('tight-');
  return <article className={`ins-card tone-${finding.tone}`}>
    <div className="ins-card-head">
      {index !== undefined ? <span className="ins-step" aria-hidden="true">{index + 1}</span> : <span className="ins-card-icon" aria-hidden="true"><Icon size={17}/></span>}
      <h3>{finding.title}</h3>
      {onHide && <button type="button" className="ins-hide" aria-label={`Abaikan saran ${finding.title}`} title="Abaikan saran ini" onClick={() => onHide(finding.id)}><EyeOff size={15}/></button>}
    </div>
    <p>{finding.detail}</p>
    {(finding.series || finding.saving || finding.apply || finding.target) && <div className="ins-card-foot">
      {finding.series && <Spark values={finding.series} labels={finding.seriesLabels} percent={percent}/>}
      <div className="ins-card-actions">
        {finding.saving ? <span className="ins-saving">Hemat ±{short(finding.saving)}/bln</span> : null}
        {finding.apply && <Button className="small" disabled={busy} onClick={() => onApply(finding.apply!, finding)}><Check size={15}/> {finding.apply.kind === 'create-budget' ? `Buat ${short(finding.apply.amount)}` : `Ubah ke ${short(finding.apply.amount)}`}</Button>}
        {finding.target && <button type="button" className="link-button" onClick={() => onGo(finding.target!.view, finding.target!.focus)}>Lihat <ArrowRight size={14}/></button>}
      </div>
    </div>}
  </article>;
}

function Section({ icon: Icon, title, hint, items, empty, render, planned = 0 }: { icon: LucideIcon; title: string; hint?: string; items: Finding[]; empty?: string; render: (f: Finding) => React.ReactNode; planned?: number }) {
  if (!items.length && !empty && !planned) return null;
  if (!items.length && planned) empty = planned === 1 ? '1 saran di bagian ini sudah ada di Rencana aksi di atas.' : `${planned} saran di bagian ini sudah ada di Rencana aksi di atas.`;
  return <section className="ins-section">
    <header><span className="ins-section-icon" aria-hidden="true"><Icon size={17}/></span><div><h2>{title}</h2>{hint && <small>{hint}</small>}</div></header>
    {items.length ? <div className="ins-grid">{items.map(render)}</div> : <p className="ins-empty">{empty}</p>}
  </section>;
}

export function AdvisorView({ navigate }: { navigate: (view: string, focus?: string) => void }) {
  const { data, profile, cycle, user } = useApp();
  const { track } = useNotify();
  const salaryDay = profile?.salaryCycleStartDay || 24;
  const today = todayInTimeZone(profile?.timeZone), day = dateInTimeZone(new Date(), profile?.timeZone);
  const since = useMemo(() => pastCycles({ start: cycle.start, end: cycle.end }, 6, salaryDay)[0].start, [cycle.start, cycle.end, salaryDay]);
  // A few extra weeks before the oldest cycle so weekly budgets have eight full weeks.
  const range = useMemo(() => { const start = new Date(`${since}T12:00:00`); start.setDate(start.getDate() - 28); return { start: start.toLocaleDateString('en-CA'), end: cycle.end }; }, [since, cycle.end]);
  const history = usePeriodTransactions(range);
  const [hidden, setHidden] = useState<string[]>(() => readHidden(user?.uid));
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState('');

  const advice: Advice | null = useMemo(() => {
    if (history.loading) return null;
    const stat = metrics(data, cycle.start, cycle.end, salaryDay, day, Boolean(profile?.netWorthIncludesReceivables));
    const committed = profile?.excludeCommittedFromAvailable === false ? 0 : commitments(data, { start: today, end: cycle.end }).reduce((n, x) => n + x.amount, 0) + commitments(data).filter(x => x.date < today).reduce((n, x) => n + x.amount, 0);
    return analyzeFinances({ data, history: history.items, today, salaryDay, monthlySalary: profile?.monthlySalary || 0, warnPercent: profile?.budgetWarningPercent || 80, stat, committed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.loading, history.items, data, cycle.start, cycle.end, salaryDay, today, profile?.netWorthIncludesReceivables, profile?.excludeCommittedFromAvailable, profile?.monthlySalary]);

  function hide(id: string) { const next = [...new Set([...hidden, id])]; setHidden(next); if (user) try { localStorage.setItem(hiddenKey(user.uid), JSON.stringify(next)); } catch { /* per-device preference */ } }
  function restore() { setHidden([]); setShowHidden(false); if (user) try { localStorage.removeItem(hiddenKey(user.uid)); } catch { /* per-device preference */ } }
  const visible = (list: Finding[]) => showHidden ? list : list.filter(f => !hidden.includes(f.id));
  // Sections below the action plan skip what the plan already shows.
  const rest = (list: Finding[]) => { const shown = visible(list); const inPlan = new Set(advice?.actions.map(f => f.id)); return { items: shown.filter(f => !inPlan.has(f.id)), planned: shown.filter(f => inPlan.has(f.id)).length }; };

  function apply(action: Apply, finding: Finding) {
    if (!user || busy) return;
    setBusy(finding.id);
    let task: Promise<unknown>;
    if (action.kind === 'set-budget') task = saveRecord<Budget>(user.uid, 'budgets', { amount: action.amount }, action.budgetId);
    else {
      const base: Partial<Budget> = { name: action.name, categoryId: action.categoryId, subcategoryId: null, amount: action.amount, classification: 'living', cycleType: 'salary', cycleStartDay: salaryDay, warningPercent: profile?.budgetWarningPercent || 80, notes: 'Dibuat dari saran Insight', rolloverEnabled: false, active: true, sortOrder: data.budgets.reduce((n, x) => Math.max(n, (x.sortOrder ?? -1) + 1), data.budgets.length), createdDate: today, lastSettledStart: budgetWindow({ cycleType: 'salary' } as Budget, new Date(`${today}T12:00:00`), salaryDay).start, rolloverCarry: 0 };
      task = saveRecord<Budget>(user.uid, 'budgets', base);
    }
    track(task, { pending: 'Menyimpan anggaran…', success: action.kind === 'create-budget' ? `Anggaran ${action.name} dibuat.` : 'Anggaran diperbarui.', failure: 'Anggaran belum tersimpan', after: () => setBusy('') });
  }

  const card = (index?: boolean) => (f: Finding, i?: number) => <FindingCard key={f.id} finding={f} index={index ? i : undefined} onApply={apply} onGo={navigate} onHide={hide} busy={busy === f.id}/>;
  const heading = <div className="page-heading"><div><h1>Insight</h1><p>Pemeriksaan keuangan otomatis dari riwayat transaksimu: apa yang perlu dikurangi, mana yang masih longgar, dan anggaran mana yang bisa ditekan. Dihitung di perangkat ini — datamu tidak dikirim ke mana pun.</p></div></div>;
  if (!advice) return <>{heading}<div className="view-skeleton" aria-busy="true" aria-label="Menganalisis riwayat"><span/><span/><span/></div></>;

  const { summary: s } = advice;
  const actions = visible(advice.actions);
  const potential = advice.actions.reduce((n, f) => n + (f.saving || 0), 0);
  const maxCycle = Math.max(1, ...advice.cycles.flatMap(c => [c.income, c.expense]));
  const hiddenCount = hidden.length;
  const topCats = advice.categories.filter(c => c.avg >= 10_000).slice(0, 8);

  return <div className="insight-page">
    {heading}
    {history.error && <p className="form-error" role="alert">{history.error}</p>}

    <section className={`ins-hero tone-${advice.verdictTone}`}>
      <Ring score={advice.score} tone={advice.verdictTone}/>
      <div className="ins-hero-text">
        <span className="ins-kicker"><BrainCircuit size={15}/> Skor kesehatan keuangan</span>
        <p className="ins-verdict">{advice.verdict}</p>
        <div className="ins-chips">
          <span><small>Rata-rata masuk</small><strong>{short(s.avgIncome)}</strong></span>
          <span><small>Rata-rata keluar</small><strong>{short(s.avgExpense)}</strong></span>
          <span><small>Sisa per siklus</small><strong>{pct(s.savingsRate)}</strong></span>
          {potential > 0 && <span className="ins-chip-save"><small>Potensi hemat</small><strong>{short(potential)}/bln</strong></span>}
        </div>
        <small className="ins-basis">{advice.enoughHistory ? `Berdasarkan ${advice.cyclesUsed} siklus gaji terakhir + siklus berjalan (${s.daysLeft} hari lagi sampai gajian).` : 'Riwayat masih sedikit — saran akan makin tajam setelah 2 siklus gaji tercatat.'}</small>
      </div>
    </section>

    <div className="ins-parts">{advice.parts.map(p => <div key={p.key} className={`ins-part ${p.score >= 75 ? 'good' : p.score >= 50 ? 'ok' : 'low'}`} title={p.hint}>
      <div><span>{p.label}</span><strong>{p.value}</strong></div>
      <i><b style={{ width: `${Math.max(4, p.score)}%` }}/></i>
      <small>{p.hint}</small>
    </div>)}</div>

    {!advice.enoughHistory && <div className="notice">Baru {advice.cyclesUsed} siklus gaji yang punya catatan. Saran tentang anggaran dan kategori yang longgar muncul setelah minimal 2 siklus lengkap. Sementara itu, skor dan peringatan di bawah sudah bisa dipakai.</div>}

    <Section icon={Lightbulb} title="Rencana aksi" hint="Langkah paling berdampak, diurutkan dari yang paling mendesak." items={actions} empty="Tidak ada hal mendesak. Keuanganmu berjalan sesuai pola biasanya." render={card(true) as (f: Finding) => React.ReactNode}/>

    {advice.cycles.length > 1 && <section className="ins-section">
      <header><span className="ins-section-icon" aria-hidden="true"><Gauge size={17}/></span><div><h2>Pola per siklus</h2><small>Pemasukan dan pengeluaran tiap siklus gaji. “Kini” = siklus berjalan.</small></div></header>
      <div className="panel ins-cycles">
        <div className="ins-bars" role="img" aria-label={advice.cycles.map(c => `${c.label}: masuk ${short(c.income)}, keluar ${short(c.expense)}`).join('; ')}>{advice.cycles.map(c => <div key={c.label} className="ins-bar-col">
          <div className="ins-bar-pair"><i className="in" style={{ height: `${c.income / maxCycle * 100}%` }}/><i className="out" style={{ height: `${c.expense / maxCycle * 100}%` }}/></div>
          <small>{c.label}</small>
        </div>)}</div>
        <div className="ins-legend"><span><i className="in"/>Pemasukan</span><span><i className="out"/>Pengeluaran</span></div>
      </div>
    </section>}

    <Section icon={Scissors} title="Perlu dikurangi" hint="Pos keinginan yang besar, naik, atau sedang melaju cepat siklus ini." {...rest(advice.reduce)} empty={advice.enoughHistory ? 'Tidak ada pos keinginan yang membengkak. Bagus!' : undefined} render={card()}/>
    <Section icon={TrendingDown} title="Masih longgar" hint="Dibanding pengeluaran siklus-siklus sebelumnya pada hari yang sama." {...rest(advice.loose)} render={card()}/>
    <Section icon={Wallet} title="Anggaran" hint="Ditekan bila jarang terpakai, dinaikkan bila selalu jebol, dibuat bila belum ada." {...rest(advice.budgetTips)} empty={advice.enoughHistory ? 'Anggaranmu sudah pas dengan kebiasaan belanja.' : undefined} render={card()}/>

    {advice.enoughHistory && topCats.length > 0 && <section className="ins-section">
      <header><span className="ins-section-icon" aria-hidden="true"><Gauge size={17}/></span><div><h2>Kategori utama</h2><small>Rata-rata per siklus, perkiraan siklus ini, dan arah trennya.</small></div></header>
      <div className="panel ins-cats">{topCats.map(c => <button type="button" key={c.id} className="ins-cat" onClick={() => navigate('transactions', `category:${c.id}@${cycle.start}..${cycle.end}`)}>
        <span className="ins-cat-icon" style={identityStyle(c.color)} aria-hidden="true"><AppIcon icon={c.icon} fallback="🗂️"/></span>
        <span className="ins-cat-name"><strong>{c.name}</strong><small>{c.kind === 'need' ? 'Kebutuhan' : 'Keinginan'} · {pct(c.share)} pengeluaran</small></span>
        <Spark values={[...c.history, c.projected]}/>
        <span className="ins-cat-num"><strong>{short(c.avg)}</strong><small className={c.trend > .1 ? 'up' : c.trend < -.1 ? 'down' : ''}>{c.trend > .1 ? `▲ ${pct(c.trend)}` : c.trend < -.1 ? `▼ ${pct(-c.trend)}` : 'stabil'}</small></span>
      </button>)}</div>
    </section>}

    <Section icon={CalendarClock} title="Kebiasaan" hint="Pola waktu belanja dan kebocoran kecil yang menumpuk." {...rest(advice.habits)} render={card()}/>
    <Section icon={Repeat} title="Rutin & langganan" {...rest(advice.recurring)} render={card()}/>
    <Section icon={Landmark} title="Kewajiban & tabungan" {...rest(advice.obligations)} render={card()}/>
    <Section icon={AlertTriangle} title="Peringatan" {...rest(advice.alerts)} render={card()}/>

    {advice.enoughHistory && s.avgIncome > 0 && <section className="ins-section">
      <header><span className="ins-section-icon" aria-hidden="true"><Gauge size={17}/></span><div><h2>Porsi 50/30/20</h2><small>Pedoman: kebutuhan ≤ 50%, keinginan ≤ 30%, sisanya ≥ 20% untuk ditabung. Dikelompokkan dari nama kategori.</small></div></header>
      <div className="panel ins-split">
        <div className="ins-split-bar" role="img" aria-label={`Kebutuhan ${pct(advice.split.needs)}, keinginan ${pct(advice.split.wants)}, sisa ${pct(advice.split.saved)}`}>
          <i className="needs" style={{ flex: advice.split.needs }}/><i className="wants" style={{ flex: advice.split.wants }}/><i className="saved" style={{ flex: advice.split.saved }}/>
        </div>
        <div className="ins-split-legend">
          <span className={advice.split.needs > .5 ? 'over' : ''}><i className="needs"/>Kebutuhan <strong>{pct(advice.split.needs)}</strong><small>ideal ≤ 50%</small></span>
          <span className={advice.split.wants > .3 ? 'over' : ''}><i className="wants"/>Keinginan <strong>{pct(advice.split.wants)}</strong><small>ideal ≤ 30%</small></span>
          <span className={advice.split.saved < .2 ? 'over' : ''}><i className="saved"/>Sisa <strong>{pct(advice.split.saved)}</strong><small>ideal ≥ 20%</small></span>
        </div>
      </div>
    </section>}

    {hiddenCount > 0 && <div className="ins-hidden-note"><span>{hiddenCount} saran diabaikan.</span><button type="button" className="link-button" onClick={() => setShowHidden(v => !v)}>{showHidden ? 'Sembunyikan lagi' : 'Tampilkan'}</button><button type="button" className="link-button" onClick={restore}>Pulihkan semua</button></div>}
    <p className="ins-disclaimer">Insight adalah perhitungan otomatis dari catatanmu sendiri, bukan nasihat keuangan profesional. Semakin rapi pencatatan dan kategorinya, semakin tepat sarannya.</p>
  </div>;
}
