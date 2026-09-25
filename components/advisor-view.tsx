'use client';
import { Fragment, useMemo, useState } from 'react';
import { AlertTriangle, Star, Pin, PinOff, Calculator, LayoutList, UserRound, Layers, HandCoins, Sprout, SlidersHorizontal, Coins, CreditCard, ShieldCheck, Target, TrendingUp, Sparkles, ArrowRight, BrainCircuit, CalendarClock, Check, CircleCheck, EyeOff, Gauge, Info, Landmark, Lightbulb, Repeat, Scissors, TrendingDown, Wallet, type LucideIcon } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { usePeriodTransactions } from './period-selector';
import { Button } from './ui/button';
import { AppIcon, identityStyle } from './visual-identity';
import { analyzeFinances, pastCycles, type Advice, type Apply, type CalcRow, type Finding, type Tone } from '@/lib/advisor';
import { budgetWindow, metrics, rupiah } from '@/lib/accounting';
import { commitments } from '@/lib/finance-control';
import { saveProfile, saveRecord } from '@/lib/firestore';
import { InsightProfileSheet } from './insight-profile-sheet';
import { InsightLayoutSheet, defaultSections } from './insight-layout-sheet';
import { priorityLabels, riskLabels, type InsightProfile } from '@/lib/insight-profile';
import { INFLATION } from '@/lib/invest-plan';
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

/** Renders **bold** key facts and ==highlighted== suggested steps from the advisor text. */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*|==[^=]+==)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('==') && part.endsWith('==') && part.length > 4 ? <mark key={i}>{part.slice(2, -2)}</mark> : part)}</>;
}

function Spark({ values, labels, percent, width = 132, height = 38 }: { values: number[]; labels?: string[]; percent?: boolean; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const w = width, h = height, pad = 4, max = Math.max(...values, percent ? 100 : 0, 1);
  const x = (i: number) => pad + i * (w - pad * 2) / (values.length - 1), y = (v: number) => h - pad - v / max * (h - pad * 2);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = values.length - 1;
  return <figure className="ins-spark" aria-label={`Riwayat: ${values.map((v, i) => `${labels?.[i] || i + 1} ${percent ? `${v}%` : short(v)}`).join(', ')}`}>
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      {percent && <line x1={pad} x2={w - pad} y1={y(100)} y2={y(100)} className="ins-spark-limit"/>}
      <polyline points={`${x(0)},${h - pad} ${points} ${x(last)},${h - pad}`} className="ins-spark-fill"/>
      <polyline points={points} className="ins-spark-line"/>
      <circle cx={x(last)} cy={y(values[last])} r="3.4" className="ins-spark-dot"/>
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

const partIcons: Record<string, LucideIcon> = { savings: Coins, emergency: ShieldCheck, debt: CreditCard, budget: Target, runway: CalendarClock, trend: TrendingUp };
const toneWord: Record<Tone, string> = { bad: 'Mendesak', warn: 'Perhatian', good: 'Peluang', info: 'Info' };

/** The headline number of a finding: latest value, how it compares with earlier periods, and the trend line. */
function Metric({ finding }: { finding: Finding }) {
  const series = finding.series!, labels = finding.seriesLabels;
  const percent = finding.id.startsWith('shrink-') || finding.id.startsWith('tight-');
  const last = series[series.length - 1], lastLabel = labels?.[labels.length - 1] || '';
  const earlier = series.slice(0, -1), avg = earlier.reduce((n, v) => n + v, 0) / Math.max(1, earlier.length);
  const change = avg > 0 ? last / avg - 1 : 0;
  const caption = percent ? `Terpakai · ${lastLabel === 'Kini' ? 'periode ini' : `periode ${lastLabel}`}` : lastLabel === 'Kini' ? 'Siklus ini' : `Siklus ${lastLabel}`;
  const compare = percent ? `rata-rata ${Math.round(avg)}%` : Math.abs(change) < .05 ? 'setara rata-rata' : `${change > 0 ? '▲' : '▼'} ${pct(Math.abs(change))} vs rata-rata`;
  return <div className="ins-metric">
    <div className="ins-metric-text">
      <small>{caption}</small>
      <strong>{percent ? `${last}%` : short(last)}</strong>
      <span className={!percent && change >= .05 ? 'up' : !percent && change <= -.05 ? 'down' : ''}>{compare}</span>
    </div>
    <Spark values={series} labels={labels} percent={percent} width={124} height={46}/>
  </div>;
}

const opSign: Record<string, string> = { '+': '+', '-': '−', '×': '×', '=': '=' };
/** "Where does this number come from?": the calculation, one line per step. */
function CalcDetails({ rows, open, title = 'Dari mana angka ini?' }: { rows: CalcRow[]; open?: boolean; title?: string }) {
  return <details className="ins-calc" open={open}>
    <summary><Calculator size={14} aria-hidden="true"/> {title}</summary>
    <ol>{rows.map((r, i) => <li key={i} className={r.op === '=' ? 'is-total' : ''}><b aria-hidden="true">{r.op ? opSign[r.op] : ''}</b><span><strong>{r.label}</strong>{r.note && <small>{r.note}</small>}</span><em>{r.text || rupiah(r.amount)}</em></li>)}</ol>
  </details>;
}

/** Headline figure for findings without a history line (debts, goals, habits…). */
function Stat({ stat }: { stat: NonNullable<Finding['stat']> }) {
  return <div className="ins-metric">
    <div className="ins-metric-text">
      <small>{stat.label}</small>
      <strong>{stat.value}</strong>
      {stat.note && <span>{stat.note}</span>}
    </div>
    {stat.progress !== undefined && <div className="ins-metric-meter" role="img" aria-label={stat.progressLabel || `${Math.round(stat.progress * 100)}%`}>
      <i><b style={{ width: `${Math.max(3, Math.round(stat.progress * 100))}%` }}/></i>
      {stat.progressLabel && <small>{stat.progressLabel}</small>}
    </div>}
  </div>;
}

function FindingCard({ finding, index, tag, onApply, onGo, onHide, busy, pinned, onPin }: { finding: Finding; index?: number; tag?: string; pinned?: boolean; onPin?: (id: string) => void; onApply: (apply: Apply, finding: Finding) => void; onGo: (view: string, focus?: string) => void; onHide?: (id: string) => void; busy: boolean }) {
  const Icon = toneIcon[finding.tone];
  const hasFoot = Boolean(finding.saving || finding.apply || finding.target);
  return <article className={`ins-card tone-${finding.tone}`}>
    <header className="ins-card-head">
      <span className={index !== undefined ? 'ins-step' : 'ins-card-icon'} aria-hidden="true">{index !== undefined ? index + 1 : <Icon size={18}/>}</span>
      <div className="ins-card-title">
        <span className="ins-kicker-line">{pinned && <span className="ins-pinned"><Pin size={11}/> Disematkan · </span>}<b>{toneWord[finding.tone]}</b>{tag && <> · {tag}</>}</span>
        <h3>{finding.title}</h3>
      </div>
      {onPin && <button type="button" className={`ins-hide ins-pin ${pinned ? 'is-on' : ''}`} aria-pressed={pinned} aria-label={pinned ? `Lepas sematan ${finding.title}` : `Sematkan ${finding.title} ke atas`} title={pinned ? 'Lepas sematan' : 'Sematkan ke atas'} onClick={() => onPin(finding.id)}>{pinned ? <PinOff size={15}/> : <Pin size={15}/>}</button>}
      {onHide && <button type="button" className="ins-hide" aria-label={`Abaikan saran ${finding.title}`} title="Abaikan saran ini" onClick={() => onHide(finding.id)}><EyeOff size={16}/></button>}
    </header>
    {finding.series && finding.series.length > 1 ? <Metric finding={finding}/> : finding.stat ? <Stat stat={finding.stat}/> : null}
    <p><Rich text={finding.detail}/></p>
    {finding.calc && <CalcDetails rows={finding.calc}/>}
    {hasFoot && <footer className="ins-card-foot">
      {finding.saving ? <span className="ins-saving"><TrendingDown size={14} aria-hidden="true"/> Hemat ±{short(finding.saving)}/bln</span> : <span/>}
      <div className="ins-card-actions">
        {finding.target && <button type="button" className="ins-link" onClick={() => onGo(finding.target!.view, finding.target!.focus)}>Lihat <ArrowRight size={15}/></button>}
        {finding.apply && <Button className="small ins-apply" disabled={busy} onClick={() => onApply(finding.apply!, finding)}><Check size={15}/> {finding.apply.kind === 'create-budget' ? `Buat ${short(finding.apply.amount)}` : `Ubah ke ${short(finding.apply.amount)}`}</Button>}
      </div>
    </footer>}
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const layout = profile?.insightLayout || {};
  const order = [...(layout.order || []).filter(k => defaultSections.some(d => d.key === k)), ...defaultSections.map(d => d.key).filter(k => !(layout.order || []).includes(k))];
  const hiddenSections = layout.hidden || [];
  const pinned = layout.pinned || [];
  function saveLayout(next: { order?: string[]; hidden?: string[]; pinned?: string[] }, message = 'Tampilan Insight disimpan.') { if (!user) return; track(saveProfile(user.uid, { insightLayout: { order, hidden: hiddenSections, pinned, ...next } }), { pending: 'Menyimpan…', success: message, failure: 'Belum tersimpan', quiet: true }); }
  function togglePin(id: string) { saveLayout({ pinned: pinned.includes(id) ? pinned.filter(x => x !== id) : [id, ...pinned] }); }
  function saveInsightProfile(next: InsightProfile) {
    if (!user) return;
    setProfileOpen(false);
    track(saveProfile(user.uid, { insightProfile: { ...next, updatedAt: today } }), { pending: 'Menyimpan profil…', success: 'Profil Insight disimpan. Saran sudah disesuaikan.', failure: 'Profil belum tersimpan' });
  }

  const advice: Advice | null = useMemo(() => {
    if (history.loading) return null;
    const stat = metrics(data, cycle.start, cycle.end, salaryDay, day, Boolean(profile?.netWorthIncludesReceivables));
    const committed = profile?.excludeCommittedFromAvailable === false ? 0 : commitments(data, { start: today, end: cycle.end }).reduce((n, x) => n + x.amount, 0) + commitments(data).filter(x => x.date < today).reduce((n, x) => n + x.amount, 0);
    return analyzeFinances({ data, history: history.items, today, salaryDay, monthlySalary: profile?.monthlySalary || 0, warnPercent: profile?.budgetWarningPercent || 80, stat, committed, profile: profile?.insightProfile });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.loading, history.items, data, cycle.start, cycle.end, salaryDay, today, profile?.netWorthIncludesReceivables, profile?.excludeCommittedFromAvailable, profile?.monthlySalary, profile?.insightProfile]);

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

  const card = (f: Finding, i?: number, tag?: string) => <FindingCard key={f.id} finding={f} index={i} tag={tag} onApply={apply} onGo={navigate} onHide={hide} busy={busy === f.id} pinned={pinned.includes(f.id)} onPin={togglePin}/>;
  const pinFirst = (list: Finding[]) => [...list.filter(f => pinned.includes(f.id)).sort((a, b) => pinned.indexOf(a.id) - pinned.indexOf(b.id)), ...list.filter(f => !pinned.includes(f.id))];
  const heading = <div className="page-heading"><div><h1>Insight</h1><p>Saran otomatis dari riwayat transaksimu. Dihitung di perangkat ini, datamu tidak dikirim ke mana pun.</p></div><div className="heading-actions"><button type="button" className="btn btn-secondary small" onClick={() => setLayoutOpen(true)}><LayoutList size={15}/> Atur tampilan</button></div></div>;
  if (!advice) return <>{heading}<div className="view-skeleton" aria-busy="true" aria-label="Menganalisis riwayat"><span/><span/><span/></div></>;

  const { summary: s } = advice;
  const everything = [...advice.actions, ...advice.wealth, ...advice.reduce, ...advice.loose, ...advice.budgetTips, ...advice.habits, ...advice.recurring, ...advice.obligations, ...advice.alerts];
  const pinnedCards = pinned.map(id => everything.find(f => f.id === id)).filter((f): f is Finding => Boolean(f));
  const actions = visible([...pinnedCards, ...advice.actions.filter(f => !pinned.includes(f.id))]);
  const potential = advice.actions.reduce((n, f) => n + (f.saving || 0), 0);
  const maxCycle = Math.max(1, ...advice.cycles.flatMap(c => [c.income, c.expense]));
  const hiddenCount = hidden.length;
  const topCats = advice.categories.filter(c => c.avg >= 10_000).slice(0, 8);
  const tabs: { key: string; label: string; icon: LucideIcon; hint: string; items?: Finding[]; empty: string }[] = [
    { key: 'wealth', label: 'Investasi', icon: Sprout, hint: 'Uang menganggur, dana darurat yang bisa lebih produktif, dan investasi sesuai profil risikomu.', items: pinFirst(visible(advice.wealth)), empty: 'Belum ada uang menganggur — semua saldo sedang terpakai sesuai kebutuhan.' },
    { key: 'reduce', label: 'Perlu dikurangi', icon: Scissors, hint: 'Pos keinginan yang besar, terus naik, atau siklus ini sudah melaju cepat.', items: pinFirst(visible(advice.reduce)), empty: 'Tidak ada pos keinginan yang membengkak. Bagus!' },
    { key: 'loose', label: 'Masih longgar', icon: TrendingDown, hint: 'Dibanding siklus-siklus sebelumnya pada hari yang sama.', items: pinFirst(visible(advice.loose)), empty: 'Belum ada kategori yang jelas di bawah kebiasaannya.' },
    { key: 'budget', label: 'Anggaran', icon: Wallet, hint: 'Ditekan bila jarang terpakai, dinaikkan bila selalu jebol, dibuat bila belum ada.', items: pinFirst(visible(advice.budgetTips)), empty: 'Anggaranmu sudah pas dengan kebiasaan belanja.' },
    { key: 'cats', label: 'Kategori', icon: Gauge, hint: 'Rata-rata per siklus dan arah trennya. Ketuk untuk melihat transaksinya.', empty: 'Belum ada pengeluaran.' },
    { key: 'habits', label: 'Kebiasaan', icon: CalendarClock, hint: 'Pola waktu belanja dan kebocoran kecil yang menumpuk.', items: pinFirst(visible(advice.habits)), empty: 'Tidak ada pola belanja yang mencolok.' },
    { key: 'recurring', label: 'Rutin', icon: Repeat, hint: 'Pengeluaran tetap dan transaksi yang berulang tiap siklus.', items: pinFirst(visible(advice.recurring)), empty: 'Belum ada pengeluaran rutin yang terdeteksi.' },
    { key: 'duty', label: 'Kewajiban', icon: Landmark, hint: 'Utang, piutang, tujuan dana, dan dana darurat.', items: pinFirst(visible(advice.obligations)), empty: 'Semua kewajiban dan tujuan dana aman.' },
    { key: 'alerts', label: 'Peringatan', icon: AlertTriangle, hint: 'Transaksi tidak biasa dan bekal sampai gajian.', items: pinFirst(visible(advice.alerts)), empty: 'Tidak ada peringatan.' },
  ];
  // "Penting": every warning or urgent finding from all tabs in one list, most urgent first, so nothing needs hunting.
  const source = new Map<string, string>();
  tabs.forEach(t => t.items?.forEach(f => { if (!source.has(f.id)) source.set(f.id, t.label); }));
  const urgency = (f: Finding) => (f.tone === 'bad' ? 2e12 : 1e12) + (f.saving || 0);
  const important = [...source.keys()].map(id => tabs.flatMap(t => t.items || []).find(f => f.id === id)!).filter(f => f.tone === 'bad' || f.tone === 'warn').sort((a, b) => urgency(b) - urgency(a));
  tabs.unshift({ key: 'important', label: 'Penting', icon: Star, hint: 'Semua peringatan dan hal mendesak dari setiap bagian di bawah, dikumpulkan jadi satu. Yang paling mendesak di atas.', items: pinFirst(important), empty: 'Tidak ada hal penting — semua bagian dalam kondisi aman.' });
  const active = tabs.find(t => t.key === tab) || tabs[0];

  const sections: Record<string, React.ReactNode> = {
    profile: <>
    <ProfileBar personal={advice.personal} onEdit={() => setProfileOpen(true)}/>

    </>,
    health: <>
    <div className="ins-parts">{advice.parts.map(p => { const level = p.score >= 75 ? 'good' : p.score >= 50 ? 'warn' : 'bad'; const PartIcon = partIcons[p.key] || Gauge; return <div key={p.key} className={`ins-part tone-${level}`}>
      <div className="ins-part-top"><span className="ins-part-icon" aria-hidden="true"><PartIcon size={17}/></span><span className="ins-part-label">{p.label}</span><em>{level === 'good' ? 'Baik' : level === 'warn' ? 'Cukup' : 'Rendah'}</em></div>
      <strong>{p.value}</strong>
      <i role="img" aria-label={`Skor ${Math.round(p.score)} dari 100`}><b style={{ width: `${Math.max(4, p.score)}%` }}/></i>
      <small>{p.hint}</small>
    </div>; })}</div>

    {!advice.enoughHistory && <div className="notice">Baru {advice.cyclesUsed} siklus gaji yang punya catatan. Saran tentang anggaran dan kategori yang longgar muncul setelah minimal 2 siklus lengkap.</div>}

    </>,
    actions: <>
    <section className="ins-section">
      <SectionHead icon={Lightbulb} title="Rencana aksi" hint="Langkah paling berdampak, diurutkan dari yang paling mendesak."/>
      {actions.length ? <div className="ins-grid">{actions.map((f, i) => card(f, i))}</div> : <p className="ins-empty"><Sparkles size={18} aria-hidden="true"/>Tidak ada hal mendesak. Keuanganmu berjalan sesuai pola biasanya.</p>}
    </section>

    </>,
    wealth: <>
    <WealthSection advice={advice} onEdit={() => setProfileOpen(true)}/>
    </>,
    paycheck: <>
    {advice.paycheck.length > 0 && <PaycheckPlan advice={advice}/>}

    </>,
    charts: <>
    {advice.enoughHistory && <div className="ins-duo">
      <section className="panel ins-box">
        <SectionHead icon={Gauge} title="Pola per siklus" hint="Pemasukan dan pengeluaran tiap siklus gaji."/>
        <div className="ins-bars" role="img" aria-label={advice.cycles.map(c => `${c.label}: masuk ${short(c.income)}, keluar ${short(c.expense)}`).join('; ')}>{advice.cycles.map(c => <div key={c.label} className="ins-bar-col" title={`${c.label}: masuk ${short(c.income)}, keluar ${short(c.expense)}`}>
          <div className="ins-bar-pair"><i className="in" style={{ height: `${c.income / maxCycle * 100}%` }}/><i className="out" style={{ height: `${c.expense / maxCycle * 100}%` }}/></div>
          <small>{c.label}</small>
        </div>)}</div>
        <div className="ins-legend"><span><i className="in"/>Pemasukan</span><span><i className="out"/>Pengeluaran</span><span className="ins-legend-note">Kini = siklus berjalan</span></div>
      </section>
      {s.avgIncome > 0 && <section className="panel ins-box">
        <SectionHead icon={Gauge} title="Porsi kebutuhan, keinginan & sisa" hint={`Rata-rata per siklus dibanding pemasukan, dengan batas sesuai profilmu.`}/>
        <div className="ins-split-bar" role="img" aria-label={`Kebutuhan ${pct(advice.split.needs)}, keinginan ${pct(advice.split.wants)}, sisa ${pct(advice.split.saved)}`}>
          <i className="needs" style={{ flex: advice.split.needs }}/><i className="wants" style={{ flex: advice.split.wants }}/><i className="saved" style={{ flex: advice.split.saved }}/>
        </div>
        <div className="ins-split-legend">
          {([['needs', 'Kebutuhan', advice.split.needs, `maks ${pct(advice.limits.needs)}`, advice.split.needs > advice.limits.needs], ['wants', 'Keinginan', advice.split.wants, `maks ${pct(advice.limits.wants)}`, advice.split.wants > advice.limits.wants], ['saved', 'Sisa', advice.split.saved, `min ${pct(advice.limits.savings)}`, advice.split.saved < advice.limits.savings]] as const).map(([key, label, value, ideal, over]) => <div key={key} className={over ? 'over' : ''}>
            <span><i className={key}/>{label}</span><strong>{pct(value)}</strong><small>{ideal}</small>
          </div>)}
        </div>
      </section>}
    </div>}

    </>,
    details: <>
    <section className="ins-section">
      <SectionHead icon={BrainCircuit} title="Rincian analisis"/>
      <div className="ins-tabs" role="tablist" aria-label="Rincian analisis">{tabs.map(t => { const count = t.key === 'cats' ? topCats.length : t.items?.length || 0; return <button type="button" role="tab" key={t.key} aria-selected={active.key === t.key} className={active.key === t.key ? 'active' : ''} onClick={event => { setTab(t.key); event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }}><t.icon size={15} aria-hidden="true"/>{t.label}{count > 0 && <b>{count}</b>}</button>; })}</div>
      <div className="ins-tab-body" role="tabpanel">
        <small className="ins-tab-hint">{active.hint}</small>
        {active.key === 'cats'
          ? topCats.length ? <div className="panel ins-cats">{topCats.map(c => <button type="button" key={c.id} className="ins-cat" onClick={() => navigate('transactions', `category:${c.id}@${cycle.start}..${cycle.end}`)}>
            <span className="ins-cat-icon" style={identityStyle(c.color)} aria-hidden="true"><AppIcon icon={c.icon} fallback="🗂️"/></span>
            <span className="ins-cat-name"><strong>{c.name}</strong><small>{c.kind === 'need' ? 'Kebutuhan' : 'Keinginan'} · {pct(c.share)} pengeluaran</small><i className="ins-cat-share" style={identityStyle(c.color)}><b style={{ width: `${Math.max(3, Math.round(c.share / Math.max(...topCats.map(x => x.share), .01) * 100))}%` }}/></i></span>
            <Spark values={[...c.history, c.projected]}/>
            <span className="ins-cat-num"><strong>{short(c.avg)}</strong><small className={c.trend > .1 ? 'up' : c.trend < -.1 ? 'down' : ''}>{c.trend > .1 ? `▲ ${pct(c.trend)}` : c.trend < -.1 ? `▼ ${pct(-c.trend)}` : 'stabil'}</small></span>
          </button>)}</div> : <p className="ins-empty"><Sparkles size={18} aria-hidden="true"/>{active.empty}</p>
          : active.items?.length ? <div className="ins-grid">{active.items.map(f => card(f, undefined, active.key === 'important' ? source.get(f.id) : undefined))}</div> : <p className="ins-empty"><Sparkles size={18} aria-hidden="true"/>{active.empty}</p>}
      </div>
    </section>

    </>,
  };

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

    {order.filter(key => !hiddenSections.includes(key)).map(key => <Fragment key={key}>{sections[key]}</Fragment>)}
    <InsightProfileSheet open={profileOpen} onOpenChange={setProfileOpen} saved={profile?.insightProfile} onSave={saveInsightProfile}/>
    <InsightLayoutSheet open={layoutOpen} onOpenChange={setLayoutOpen} order={order} hidden={hiddenSections} pinnedCount={pinned.length} onSave={(nextOrder, nextHidden) => { setLayoutOpen(false); saveLayout({ order: nextOrder, hidden: nextHidden }); }} onClearPins={() => saveLayout({ pinned: [] }, 'Semua sematan dilepas.')}/>
    {hiddenCount > 0 && <div className="ins-hidden-note"><span>{hiddenCount} saran diabaikan.</span><button type="button" className="link-button" onClick={() => setShowHidden(v => !v)}>{showHidden ? 'Sembunyikan lagi' : 'Tampilkan'}</button><button type="button" className="link-button" onClick={restore}>Pulihkan semua</button></div>}
    <p className="ins-disclaimer">Insight adalah perhitungan otomatis dari catatanmu sendiri, bukan nasihat keuangan profesional. Kebutuhan dan keinginan ditebak dari nama kategori.</p>
  </div>;
}

/** Who the advice is tuned for, with a way to change it. */
function ProfileBar({ personal, onEdit }: { personal: InsightProfile; onEdit: () => void }) {
  if (!personal.personalized) return <section className="ins-personalize">
    <span className="ins-personalize-icon" aria-hidden="true"><UserRound size={22}/></span>
    <div><strong>Buat Insight sesuai dirimu</strong><small>Jawab kuis profil risiko dan isi target tabungan, dana darurat, serta prioritasmu (±1 menit). Saran investasi dan batas anggaran akan menyesuaikan.</small></div>
    <Button onClick={onEdit}><SlidersHorizontal size={16}/> Mulai personalisasi</Button>
  </section>;
  const chips: [string, string][] = [['Profil risiko', riskLabels[personal.risk].label], ['Target tabungan', pct(personal.savingsTarget)], ['Dana darurat', `${personal.emergencyMonths} bulan`], ['Prioritas', priorityLabels[personal.priority]]];
  return <section className="ins-profile-bar">
    <span className="ins-personalize-icon" aria-hidden="true"><UserRound size={18}/></span>
    <div className="ins-profile-chips">{chips.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
    <button type="button" className="link-button" onClick={onEdit}><SlidersHorizontal size={15}/> Ubah profil</button>
  </section>;
}

const riskDots = (level: number) => <span className="ins-risk" aria-label={`Risiko ${level} dari 4`}>{[1, 2, 3, 4].map(i => <i key={i} className={i <= level ? 'on' : ''}/>)}</span>;
const instrumentColors: Record<string, string> = { rdpu: 'var(--chart-1)', deposito: 'var(--chart-5)', sbn: 'var(--chart-3)', obligasi: 'var(--chart-4)', saham: 'var(--chart-2)', emas: '#c9a227' };

/** Idle money, the order it should go (emergency → expensive debt → investing) and the investment mix. */
function WealthSection({ advice, onEdit }: { advice: Advice; onEdit: () => void }) {
  const { idle, invest, personal } = advice;
  if (idle.total < 500_000 && !invest) return null;
  const steps: [string, number, string][] = [
    ['Lengkapi dana darurat', Math.min(idle.total, idle.emergencyShortfall), `target ${personal.emergencyMonths} bulan · taruh di RDPU/tabungan`],
    ['Lunasi utang berbunga tinggi', idle.debtFirst, 'bunga ≥ 8% per tahun'],
    ['Investasikan', idle.investable, `sesuai profil ${riskLabels[personal.risk].label}`],
  ];
  return <section className="ins-section">
    <SectionHead icon={Sprout} title="Uang menganggur & investasi" hint={`Disesuaikan dengan profil ${riskLabels[personal.risk].label}, jangka ${personal.horizon === 'short' ? 'pendek' : personal.horizon === 'mid' ? 'menengah' : 'panjang'}.`}/>
    <div className="ins-wealth">
      <div className="panel ins-box ins-idle">
        <div className="ins-idle-total"><small>Total uang menganggur</small><strong>{short(idle.total)}</strong><span>Nilai riilnya turun ±{short(idle.total * INFLATION)}/tahun kalau didiamkan (inflasi {Math.round(INFLATION * 100)}%).</span></div>
        <div className="ins-idle-tiles">
          <span><small>Di dompet harian</small><strong>{short(idle.operational)}</strong><em>saldo {short(idle.operationalBalance)} − kebutuhan {short(idle.operationalNeed)}</em></span>
          <span><small>Tabungan di atas dana darurat</small><strong>{short(idle.savingsExcess)}</strong><em>tabungan {short(idle.liquidReserve)} · target {short(idle.emergencyTarget)}</em></span>
          <span><small>Sudah diinvestasikan</small><strong>{short(idle.invested)}</strong><em>dompet grup Investasi</em></span>
        </div>
        {idle.needSource === 'salary' && <p className="ins-note-est">Riwayat pengeluaranmu belum cukup, jadi kebutuhan bulanan diperkirakan dari gaji: <b>{short(idle.monthlyNeed)}/bln</b>. Makin lengkap pencatatan, makin tepat angkanya.</p>}
        <div className="ins-calcs"><CalcDetails rows={idle.opCalc} title="Hitungan dompet harian"/><CalcDetails rows={idle.savingsCalc} title="Hitungan kelebihan tabungan"/></div>
        <ol className="ins-flow">{steps.map(([label, amount, note], i) => <li key={label} className={amount > 0 ? 'on' : ''}><b>{i + 1}</b><span><strong>{label}</strong><small>{note}</small></span><em>{amount > 0 ? short(amount) : 'aman'}</em></li>)}</ol>
        <CalcDetails rows={idle.calc} title="Hitungan siap diinvestasikan"/>
      </div>
      {invest && <div className="panel ins-box ins-plan">
        <header className="ins-plan-head"><div><small>Rencana investasi · profil {riskLabels[personal.risk].label}</small><strong>{invest.amount > 0 ? short(invest.amount) : `${short(invest.monthly)}/bln`}</strong><span>{invest.amount > 0 && invest.monthly > 0 ? `+ rutin ${short(invest.monthly)}/bln · ` : ''}perkiraan ±{(invest.expectedReturn * 100).toFixed(1).replace('.', ',')}% per tahun</span></div>{!personal.personalized && <button type="button" className="link-button" onClick={onEdit}>Sesuaikan profil</button>}</header>
        <div className="ins-alloc-bar" role="img" aria-label={invest.items.map(i => `${i.name} ${i.share}%`).join(', ')}>{invest.items.map(i => <i key={i.key} style={{ flex: i.share, background: instrumentColors[i.key] }} title={`${i.name} ${i.share}%`}/>)}</div>
        <ul className="ins-alloc">{invest.items.map(i => <li key={i.key}>
          <i style={{ background: instrumentColors[i.key] }} aria-hidden="true"/>
          <div><strong>{i.name} <b>{i.share}%</b></strong><small>{i.why}</small><small className="ins-alloc-meta">{i.examples} · {i.liquidity}</small></div>
          <span><strong>{invest.amount > 0 ? short(i.amount) : `${short(invest.monthly * i.share / 100)}/bln`}</strong><small>±{(i.ret * 100).toFixed(1).replace('.', ',')}%/thn</small>{riskDots(i.risk)}</span>
        </li>)}</ul>
        {invest.sectors && <details className="ins-sectors"><summary>Sebar bagian saham ke beberapa sektor</summary>
          <p>Cara paling mudah: satu reksa dana indeks (IDX30/LQ45) yang sudah tersebar. Kalau memilih saham sendiri, sebar kira-kira seperti ini:</p>
          <ul>{invest.sectors.map(sector => <li key={sector.name}><span><strong>{sector.name}</strong><small>{sector.note}</small></span><i><b style={{ width: `${sector.share * 3}%` }}/></i><em>{sector.share}% · {short(sector.amount)}</em></li>)}</ul>
        </details>}
        {invest.amount > 0 && <div className="ins-projection"><small>Perkiraan nilai {invest.monthly > 0 ? `(modal awal + rutin ${short(invest.monthly)}/bln)` : ''}</small>
          <table><thead><tr><th>Waktu</th><th>Diinvestasikan</th><th>Didiamkan*</th></tr></thead><tbody>{invest.projection.map(p => <tr key={p.years}><td>{p.years} tahun</td><td><strong>{short(p.invested)}</strong></td><td>{short(p.idle)}</td></tr>)}</tbody></table>
          <small>*nilai riil setelah inflasi {Math.round(INFLATION * 100)}%. Imbal hasil hanya perkiraan jangka panjang dan tidak dijamin.</small>
        </div>}
        <p className="ins-plan-note">Ini gambaran pembagian, bukan rekomendasi produk. Pilih produk yang terdaftar dan diawasi OJK, dan baca prospektusnya.</p>
      </div>}
    </div>
  </section>;
}

/** How the next salary could be split, based on averages and the personal targets. */
function PaycheckPlan({ advice }: { advice: Advice }) {
  const rows = advice.paycheck;
  const colors: Record<string, string> = { needs: 'var(--chart-3)', debt: 'var(--rose)', emergency: 'var(--chart-1)', goals: 'var(--chart-5)', invest: 'var(--chart-4)', extra: 'var(--positive)', wants: 'var(--chart-2)' };
  return <section className="ins-section">
    <SectionHead icon={HandCoins} title="Rencana gajian berikutnya" hint={`Pembagian dari rata-rata pemasukan ${short(advice.summary.avgIncome)} dengan target tabunganmu ${pct(advice.personal.savingsTarget)}.`}/>
    <div className="panel ins-box ins-paycheck">
      <div className="ins-alloc-bar" role="img" aria-label={rows.map(r => `${r.label} ${pct(r.share)}`).join(', ')}>{rows.map(r => <i key={r.key} style={{ flex: Math.max(r.share, .01), background: colors[r.key] }} title={`${r.label} ${pct(r.share)}`}/>)}</div>
      <ul className="ins-pay">{rows.map(r => <li key={r.key} className={`tone-${r.tone}`}><i style={{ background: colors[r.key] }} aria-hidden="true"/><span><strong>{r.label}</strong><small>{r.note}</small></span><em><strong>{short(r.amount)}</strong><small>{pct(r.share)}</small></em></li>)}</ul>
      <p className="ins-pay-tip"><Layers size={14} aria-hidden="true"/><span>Tips: pindahkan porsi tabungan &amp; investasi <b>di hari gajian</b>, sisanya baru dipakai belanja.</span></p>
    </div>
  </section>;
}
