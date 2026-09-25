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
  const series = finding.series, labels = finding.seriesLabels;
  const last = series?.[series.length - 1];
  return <article className={`ins-card tone-${finding.tone}`}>
    <div className="ins-card-head">
      {index !== undefined ? <span className="ins-step" aria-hidden="true">{index + 1}</span> : <span className="ins-card-icon" aria-hidden="true"><Icon size={16}/></span>}
      <h3>{finding.title}</h3>
      {onHide && <button type="button" className="ins-hide" aria-label={`Abaikan saran ${finding.title}`} title="Abaikan saran ini" onClick={() => onHide(finding.id)}><EyeOff size={15}/></button>}
    </div>
    <p>{finding.detail}</p>
    {series && series.length > 1 && <div className="ins-evidence">
      <Spark values={series} percent={percent}/>
      <span><small>{labels?.[0]} – {labels?.[labels.length - 1]}</small><strong>{labels?.[labels.length - 1]}: {percent ? `${last}%` : short(last || 0)}</strong></span>
    </div>}
    {(finding.saving || finding.apply || finding.target) && <div className="ins-card-foot">
      {finding.saving ? <span className="ins-saving">Hemat ±{short(finding.saving)}/bln</span> : <span/>}
      <div className="ins-card-actions">
        {finding.target && <button type="button" className="btn btn-secondary small" onClick={() => onGo(finding.target!.view, finding.target!.focus)}>Lihat <ArrowRight size={14}/></button>}
        {finding.apply && <Button className="small" disabled={busy} onClick={() => onApply(finding.apply!, finding)}><Check size={15}/> {finding.apply.kind === 'create-budget' ? `Buat ${short(finding.apply.amount)}` : `Ubah ke ${short(finding.apply.amount)}`}</Button>}
      </div>
    </div>}
  </article>;
}

function SectionHead({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return <header className="ins-head"><span className="ins-section-icon" aria-hidden="true"><Icon size={17}/></span><div><h2>{title}</h2>{hint && <small>{hint}</small>}</div></header>;
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
  const [tab, setTab] = useState('');

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

  const card = (f: Finding, i?: number) => <FindingCard key={f.id} finding={f} index={i} onApply={apply} onGo={navigate} onHide={hide} busy={busy === f.id}/>;
  const heading = <div className="page-heading"><div><h1>Insight</h1><p>Saran otomatis dari riwayat transaksimu. Dihitung di perangkat ini, datamu tidak dikirim ke mana pun.</p></div></div>;
  if (!advice) return <>{heading}<div className="view-skeleton" aria-busy="true" aria-label="Menganalisis riwayat"><span/><span/><span/></div></>;

  const { summary: s } = advice;
  const actions = visible(advice.actions);
  const potential = advice.actions.reduce((n, f) => n + (f.saving || 0), 0);
  const maxCycle = Math.max(1, ...advice.cycles.flatMap(c => [c.income, c.expense]));
  const hiddenCount = hidden.length;
  const topCats = advice.categories.filter(c => c.avg >= 10_000).slice(0, 8);
  const tabs: { key: string; label: string; icon: LucideIcon; hint: string; items?: Finding[]; empty: string }[] = [
    { key: 'reduce', label: 'Perlu dikurangi', icon: Scissors, hint: 'Pos keinginan yang besar, terus naik, atau siklus ini sudah melaju cepat.', items: visible(advice.reduce), empty: 'Tidak ada pos keinginan yang membengkak. Bagus!' },
    { key: 'loose', label: 'Masih longgar', icon: TrendingDown, hint: 'Dibanding siklus-siklus sebelumnya pada hari yang sama.', items: visible(advice.loose), empty: 'Belum ada kategori yang jelas di bawah kebiasaannya.' },
    { key: 'budget', label: 'Anggaran', icon: Wallet, hint: 'Ditekan bila jarang terpakai, dinaikkan bila selalu jebol, dibuat bila belum ada.', items: visible(advice.budgetTips), empty: 'Anggaranmu sudah pas dengan kebiasaan belanja.' },
    { key: 'cats', label: 'Kategori', icon: Gauge, hint: 'Rata-rata per siklus dan arah trennya. Ketuk untuk melihat transaksinya.', empty: 'Belum ada pengeluaran.' },
    { key: 'habits', label: 'Kebiasaan', icon: CalendarClock, hint: 'Pola waktu belanja dan kebocoran kecil yang menumpuk.', items: visible(advice.habits), empty: 'Tidak ada pola belanja yang mencolok.' },
    { key: 'recurring', label: 'Rutin', icon: Repeat, hint: 'Pengeluaran tetap dan transaksi yang berulang tiap siklus.', items: visible(advice.recurring), empty: 'Belum ada pengeluaran rutin yang terdeteksi.' },
    { key: 'duty', label: 'Kewajiban', icon: Landmark, hint: 'Utang, piutang, tujuan dana, dan dana darurat.', items: visible(advice.obligations), empty: 'Semua kewajiban dan tujuan dana aman.' },
    { key: 'alerts', label: 'Peringatan', icon: AlertTriangle, hint: 'Transaksi tidak biasa dan bekal sampai gajian.', items: visible(advice.alerts), empty: 'Tidak ada peringatan.' },
  ];
  const active = tabs.find(t => t.key === tab) || tabs.find(t => t.items?.length) || tabs[0];

  return <div className="insight-page">
    {heading}
    {history.error && <p className="form-error" role="alert">{history.error}</p>}

    <section className={`ins-hero tone-${advice.verdictTone}`}>
      <Ring score={advice.score} tone={advice.verdictTone}/>
      <div className="ins-hero-text">
        <span className="ins-kicker"><BrainCircuit size={15}/> Skor kesehatan keuangan</span>
        <p className="ins-verdict">{advice.verdict}</p>
        <small className="ins-basis">{advice.enoughHistory ? `Dari ${advice.cyclesUsed} siklus gaji terakhir · ${s.daysLeft} hari lagi sampai gajian` : 'Riwayat masih sedikit — saran makin tajam setelah 2 siklus gaji tercatat.'}</small>
      </div>
      <div className="ins-chips">
        <span><small>Rata-rata masuk</small><strong>{short(s.avgIncome)}</strong></span>
        <span><small>Rata-rata keluar</small><strong>{short(s.avgExpense)}</strong></span>
        <span><small>Sisa per siklus</small><strong>{pct(s.savingsRate)}</strong></span>
        <span className="ins-chip-save"><small>Potensi hemat</small><strong>{potential > 0 ? `${short(potential)}/bln` : '–'}</strong></span>
      </div>
    </section>

    <div className="ins-parts">{advice.parts.map(p => <div key={p.key} className={`ins-part ${p.score >= 75 ? 'good' : p.score >= 50 ? 'ok' : 'low'}`}>
      <span>{p.label}</span>
      <strong>{p.value}</strong>
      <i><b style={{ width: `${Math.max(4, p.score)}%` }}/></i>
      <small>{p.hint}</small>
    </div>)}</div>

    {!advice.enoughHistory && <div className="notice">Baru {advice.cyclesUsed} siklus gaji yang punya catatan. Saran tentang anggaran dan kategori yang longgar muncul setelah minimal 2 siklus lengkap.</div>}

    <section className="ins-section">
      <SectionHead icon={Lightbulb} title="Rencana aksi" hint="Langkah paling berdampak, diurutkan dari yang paling mendesak."/>
      {actions.length ? <div className="ins-grid">{actions.map((f, i) => card(f, i))}</div> : <p className="ins-empty">Tidak ada hal mendesak. Keuanganmu berjalan sesuai pola biasanya.</p>}
    </section>

    {advice.enoughHistory && <div className="ins-duo">
      <section className="panel ins-box">
        <SectionHead icon={Gauge} title="Pola per siklus" hint="Pemasukan dan pengeluaran tiap siklus gaji."/>
        <div className="ins-bars" role="img" aria-label={advice.cycles.map(c => `${c.label}: masuk ${short(c.income)}, keluar ${short(c.expense)}`).join('; ')}>{advice.cycles.map(c => <div key={c.label} className="ins-bar-col">
          <div className="ins-bar-pair"><i className="in" style={{ height: `${c.income / maxCycle * 100}%` }}/><i className="out" style={{ height: `${c.expense / maxCycle * 100}%` }}/></div>
          <small>{c.label}</small>
        </div>)}</div>
        <div className="ins-legend"><span><i className="in"/>Pemasukan</span><span><i className="out"/>Pengeluaran</span><span className="ins-legend-note">Kini = siklus berjalan</span></div>
      </section>
      {s.avgIncome > 0 && <section className="panel ins-box">
        <SectionHead icon={Gauge} title="Porsi 50/30/20" hint="Rata-rata per siklus, dibanding pemasukan."/>
        <div className="ins-split-bar" role="img" aria-label={`Kebutuhan ${pct(advice.split.needs)}, keinginan ${pct(advice.split.wants)}, sisa ${pct(advice.split.saved)}`}>
          <i className="needs" style={{ flex: advice.split.needs }}/><i className="wants" style={{ flex: advice.split.wants }}/><i className="saved" style={{ flex: advice.split.saved }}/>
        </div>
        <div className="ins-split-legend">
          {([['needs', 'Kebutuhan', advice.split.needs, 'maks 50%', advice.split.needs > .5], ['wants', 'Keinginan', advice.split.wants, 'maks 30%', advice.split.wants > .3], ['saved', 'Sisa', advice.split.saved, 'min 20%', advice.split.saved < .2]] as const).map(([key, label, value, ideal, over]) => <div key={key} className={over ? 'over' : ''}>
            <span><i className={key}/>{label}</span><strong>{pct(value)}</strong><small>{ideal}</small>
          </div>)}
        </div>
      </section>}
    </div>}

    <section className="ins-section">
      <SectionHead icon={BrainCircuit} title="Rincian analisis"/>
      <div className="ins-tabs" role="tablist" aria-label="Rincian analisis">{tabs.map(t => { const count = t.key === 'cats' ? topCats.length : t.items?.length || 0; return <button type="button" role="tab" key={t.key} aria-selected={active.key === t.key} className={active.key === t.key ? 'active' : ''} onClick={event => { setTab(t.key); event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }}><t.icon size={15} aria-hidden="true"/>{t.label}{count > 0 && <b>{count}</b>}</button>; })}</div>
      <div className="ins-tab-body" role="tabpanel">
        <small className="ins-tab-hint">{active.hint}</small>
        {active.key === 'cats'
          ? topCats.length ? <div className="panel ins-cats">{topCats.map(c => <button type="button" key={c.id} className="ins-cat" onClick={() => navigate('transactions', `category:${c.id}@${cycle.start}..${cycle.end}`)}>
            <span className="ins-cat-icon" style={identityStyle(c.color)} aria-hidden="true"><AppIcon icon={c.icon} fallback="🗂️"/></span>
            <span className="ins-cat-name"><strong>{c.name}</strong><small>{c.kind === 'need' ? 'Kebutuhan' : 'Keinginan'} · {pct(c.share)} pengeluaran</small></span>
            <Spark values={[...c.history, c.projected]}/>
            <span className="ins-cat-num"><strong>{short(c.avg)}</strong><small className={c.trend > .1 ? 'up' : c.trend < -.1 ? 'down' : ''}>{c.trend > .1 ? `▲ ${pct(c.trend)}` : c.trend < -.1 ? `▼ ${pct(-c.trend)}` : 'stabil'}</small></span>
          </button>)}</div> : <p className="ins-empty">{active.empty}</p>
          : active.items?.length ? <div className="ins-grid">{active.items.map(f => card(f))}</div> : <p className="ins-empty">{active.empty}</p>}
      </div>
    </section>

    {hiddenCount > 0 && <div className="ins-hidden-note"><span>{hiddenCount} saran diabaikan.</span><button type="button" className="link-button" onClick={() => setShowHidden(v => !v)}>{showHidden ? 'Sembunyikan lagi' : 'Tampilkan'}</button><button type="button" className="link-button" onClick={restore}>Pulihkan semua</button></div>}
    <p className="ins-disclaimer">Insight adalah perhitungan otomatis dari catatanmu sendiri, bukan nasihat keuangan profesional. Kebutuhan dan keinginan ditebak dari nama kategori.</p>
  </div>;
}
