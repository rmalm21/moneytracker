'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Pin, PinOff, Calculator, LayoutList, UserRound, Layers, HandCoins, Sprout, SlidersHorizontal, Coins, CreditCard, ShieldCheck, Target, TrendingUp, Sparkles, ArrowRight, BrainCircuit, CalendarClock, Check, CircleCheck, EyeOff, Gauge, Info, Lightbulb, Scissors, TrendingDown, type LucideIcon } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { usePeriodTransactions } from './period-selector';
import { Button } from './ui/button';
import { AppIcon, identityStyle } from './visual-identity';
import { pastCycles, type Advice, type Apply, type CalcRow, type Finding, type Tone } from '@/lib/advisor';
import { budgetWindow, metrics, rupiah } from '@/lib/accounting';
import { committedAmount } from '@/lib/finance-control';
import { saveProfile, saveRecord } from '@/lib/firestore';
import { InsightProfileSheet } from './insight-profile-sheet';
import { InsightLayoutSheet, mergeOrder } from './insight-layout-sheet';
import { SignalRow, TimelineSection } from './insight-story';
import { Capped, InsightSection, ModuleBoundary, HelpButton, useCollapsed } from './insight/section';
import { InsightHero } from './insight/hero';
import { AskInsight, ExplainSheet, FinancialBrief } from './insight/brief';
import { ChangeCard, PriorityRow, ProgressList, StorySheet } from './insight/stories';
import { CashflowPanel, CostIndexCard, DataSummary, DecisionTimeline, GoalChoices, ScenarioSandbox } from './insight/deep';
import { briefView, cashflowView, changesView, dataView, explainView, heroView, help, priorityView, progressView, questionsView, type PriorityItem } from '@/lib/insight-v3/view';
import { analyzePrices } from '@/lib/insight-v25';
import { analyzeInsightV3 } from '@/lib/insight-v3';
import { recordDecision } from '@/lib/insight-v3/decisions';
import { Activity, BarChart3, Database, FlaskConical, HeartPulse, History } from 'lucide-react';
import { dismiss as dismissSignal, readMemory, restoreAll, snooze as snoozeSignal, type InsightMemory } from '@/lib/insight-v25/lifecycle';
import type { InsightSignal } from '@/lib/insight-v25/types';
import { priorityLabels, riskLabels, type InsightProfile } from '@/lib/insight-profile';
import { INFLATION, rangeText } from '@/lib/invest-plan';
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

const partIcons: Record<string, LucideIcon> = { savings: Coins, emergency: ShieldCheck, debt: CreditCard, budget: Target, runway: CalendarClock, trend: TrendingUp };
const toneWord: Record<Tone, string> = { bad: 'Mendesak', warn: 'Perhatian', good: 'Peluang', info: 'Info' };

/** The headline number of a finding: latest value, how it compares with earlier periods, and the trend line. */
function Metric({ finding }: { finding: Finding }) {
  const series = finding.series!, labels = finding.seriesLabels;
  const percent = finding.id.startsWith('shrink-') || finding.id.startsWith('tight-');
  const last = series[series.length - 1], lastLabel = labels?.[labels.length - 1] || '';
  // Budget usage: the average of every period, as the text says; money: the earlier cycles vs this one.
  const earlier = percent ? series : series.slice(0, -1), avg = earlier.reduce((n, v) => n + v, 0) / Math.max(1, earlier.length);
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
  const order = mergeOrder(layout.order);
  const hiddenSections = layout.hidden || [];
  const pinned = layout.pinned || [];
  function saveLayout(next: { order?: string[]; hidden?: string[]; pinned?: string[] }, message = 'Tampilan Insight disimpan.') { if (!user) return; track(saveProfile(user.uid, { insightLayout: { order, hidden: hiddenSections, pinned, ...next } }), { pending: 'Menyimpan…', success: message, failure: 'Belum tersimpan', quiet: true }); }
  function togglePin(id: string) { saveLayout({ pinned: pinned.includes(id) ? pinned.filter(x => x !== id) : [id, ...pinned] }); }
  function saveInsightProfile(next: InsightProfile) {
    if (!user) return;
    setProfileOpen(false);
    track(saveProfile(user.uid, { insightProfile: { ...next, updatedAt: today } }), { pending: 'Menyimpan profil…', success: 'Profil Insight disimpan. Saran sudah disesuaikan.', failure: 'Profil belum tersimpan' });
  }

  const memoryIn = useMemo(() => readMemory(profile?.insightMemory), [profile?.insightMemory]);
  // Insight V2.5: the Advisor (unchanged) plus explainable signals, stories and lifecycle. All on this device.
  const v3 = useMemo(() => {
    if (history.loading) return null;
    const stat = metrics(data, cycle.start, cycle.end, salaryDay, day, Boolean(profile?.netWorthIncludesReceivables));
    const committed = committedAmount(data, today, cycle.end, profile || {});
    return analyzeInsightV3({ data, history: history.items, today, salaryDay, monthlySalary: profile?.monthlySalary || 0, warnPercent: profile?.budgetWarningPercent || 80, stat, committed, safetyBuffer: profile?.freeMoneyBuffer, profile: profile?.insightProfile }, { memory: memoryIn, hiddenFindings: hidden, profile: profile || {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.loading, history.items, data, cycle.start, cycle.end, salaryDay, today, profile?.netWorthIncludesReceivables, profile?.excludeCommittedFromAvailable, profile?.commitmentHorizon, profile?.freeMoneyBuffer, profile?.monthlySalary, profile?.insightProfile, memoryIn, hidden]);
  const report = v3?.v25 || null;
  const advice: Advice | null = report?.advice || null;
  // Insight memory (lifecycle, dismiss/snooze, score snapshots) lives in the user's own profile; written only when
  // it really changed (at most a few small writes a day), never as a copy of the ledger.
  const written = useRef('');
  function saveMemory(next: InsightMemory) { if (!user) return; const json = JSON.stringify(next); if (json === written.current) return; written.current = json; saveProfile(user.uid, { insightMemory: next }).catch(() => { written.current = ''; }); }
  useEffect(() => {
    if (!report || !user) return;
    // The old per-device "abaikan" list moves into the synced memory once.
    const legacy = readHidden(user.uid);
    const mem = v3!.memory;
    const next = legacy.length && !mem.hidden ? { ...mem, hidden: legacy } : mem;
    if (v3!.memoryChanged || next !== mem) saveMemory(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v3, user?.uid]);
  const [openSig, setOpenSig] = useState('');
  function dismissStory(s: InsightSignal) { if (!v3) return; setOpenSig(''); saveMemory(dismissSignal(v3.memory, s, today)); }
  function snoozeStory(s: InsightSignal) { if (!v3) return; setOpenSig(''); const until = new Date(`${today}T12:00:00`); until.setDate(until.getDate() + 7); saveMemory(snoozeSignal(v3.memory, s, until.toLocaleDateString('en-CA'), today)); }
  const [moreOpen, setMoreOpen] = useState(false);

  function hide(id: string) { const next = [...new Set([...hidden, id])]; setHidden(next); if (user) try { localStorage.setItem(hiddenKey(user.uid), JSON.stringify(next)); } catch { /* per-device preference */ } if (v3) saveMemory({ ...v3.memory, hidden: [...new Set([...(v3.memory.hidden || []), id])] }); }
  function restore() { setHidden([]); setShowHidden(false); if (user) try { localStorage.removeItem(hiddenKey(user.uid)); } catch { /* per-device preference */ } if (v3) saveMemory(restoreAll(v3.memory)); }
  const allHidden = [...new Set([...hidden, ...(report?.memory.hidden || [])])];
  const visible = (list: Finding[]) => showHidden ? list : list.filter(f => !allHidden.includes(f.id));
  const [tab, setTab] = useState('');
  // Receipt item prices are read only when the Harga tab is opened.
  const prices = useMemo(() => report && tab === 'prices' ? analyzePrices(report) : [], [report, tab]);

  function apply(action: Apply, finding: Finding) {
    if (!user || busy) return;
    setBusy(finding.id);
    let task: Promise<unknown>;
    if (action.kind === 'set-budget') task = saveRecord<Budget>(user.uid, 'budgets', { amount: action.amount }, action.budgetId);
    else {
      const base: Partial<Budget> = { name: action.name, categoryId: action.categoryId, subcategoryId: null, amount: action.amount, classification: 'living', cycleType: 'salary', cycleStartDay: salaryDay, warningPercent: profile?.budgetWarningPercent || 80, notes: 'Dibuat dari saran Insight', rolloverEnabled: false, active: true, sortOrder: data.budgets.reduce((n, x) => Math.max(n, (x.sortOrder ?? -1) + 1), data.budgets.length), createdDate: today, lastSettledStart: budgetWindow({ cycleType: 'salary' } as Budget, new Date(`${today}T12:00:00`), salaryDay).start, rolloverCarry: 0 };
      task = saveRecord<Budget>(user.uid, 'budgets', base);
    }
    // Decision memory: what was decided from which Insight (the budget itself is saved by the normal flow above).
    if (v3) {
      const sig = report!.signals.find(sg => sg.finding?.id === finding.id)?.signature;
      const old = action.kind === 'set-budget' ? data.budgets.find(b => b.id === action.budgetId) : undefined;
      const cat = action.kind === 'set-budget' ? old?.categoryId : action.categoryId;
      const name = action.kind === 'create-budget' ? action.name : old?.name || report!.context.nameOf(cat || '');
      saveMemory(recordDecision(v3.memory, { d: today, k: action.kind === 'set-budget' ? 'budget_set' : 'budget_create', sig, f: finding.id, cat: cat ? report!.context.parentOf(cat) : undefined, budgetId: action.kind === 'set-budget' ? action.budgetId : undefined, label: action.kind === 'set-budget' ? `Anggaran ${name} diubah` : `Anggaran ${name} dibuat`, before: old?.amount, after: action.amount }));
    }
    track(task, { pending: 'Menyimpan anggaran…', success: action.kind === 'create-budget' ? `Anggaran ${action.name} dibuat.` : 'Anggaran diperbarui.', failure: 'Anggaran belum tersimpan', after: () => setBusy('') });
  }

  const card = (f: Finding, i?: number, tag?: string) => <FindingCard key={f.id} finding={f} index={i} tag={tag} onApply={apply} onGo={navigate} onHide={hide} busy={busy === f.id} pinned={pinned.includes(f.id)} onPin={togglePin}/>;
  const pinFirst = (list: Finding[]) => [...list.filter(f => pinned.includes(f.id)).sort((a, b) => pinned.indexOf(a.id) - pinned.indexOf(b.id)), ...list.filter(f => !pinned.includes(f.id))];
  const collapse = useCollapsed(user?.uid);
  const [explainOpen, setExplainOpen] = useState(false);
  const [sub, setSub] = useState('summary');
  const [changesAll, setChangesAll] = useState(false);
  const hintKey = user ? `dompet-ajaib:insight-hint:${user.uid}` : '';
  const [hintSeen, setHintSeen] = useState(true);
  useEffect(() => { try { setHintSeen(Boolean(hintKey && localStorage.getItem(hintKey))); } catch { /* per-device */ } }, [hintKey]);
  function openStory(sig: string) { setOpenSig(sig); if (!hintSeen && hintKey) { setHintSeen(true); try { localStorage.setItem(hintKey, '1'); } catch { /* per-device */ } } }
  // Navigation memory: coming back from a transaction, budget or claim restores the tab, sub-view and scroll position.
  const navKey = 'dompet-ajaib:insight-nav';
  function go(view: string, focus?: string) { try { sessionStorage.setItem(navKey, JSON.stringify({ tab, sub, y: window.scrollY })); } catch { /* per-tab */ } navigate(view, focus); }
  const ready = Boolean(v3);
  useEffect(() => {
    if (!ready) return;
    try { const saved = JSON.parse(sessionStorage.getItem(navKey) || 'null'); if (saved) { sessionStorage.removeItem(navKey); setTab(saved.tab || ''); setSub(saved.sub || 'summary'); requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, saved.y || 0))); } } catch { /* per-tab */ }
  }, [ready]);
  const heading = <div className="ix-heading"><div><h1>Insight</h1><small>Dihitung di perangkat ini dari catatanmu sendiri</small></div><button type="button" className="ix-icon-btn" onClick={() => setLayoutOpen(true)} aria-label="Atur tampilan Insight" title="Atur tampilan"><LayoutList size={18}/></button></div>;
  if (!advice || !v3 || !report) return <div className="insight-page ix-page">{heading}<div className="ix-skeleton" aria-busy="true" aria-label="Menyiapkan Insight"><span className="sk-hero"/><span className="sk-line"/><span className="sk-line short"/><span className="sk-card"/></div></div>;

  const hero = heroView(v3), brief = briefView(v3), changes = changesView(v3, changesAll ? 99 : 3), questions = questionsView(v3);
  const everything = [...advice.actions, ...advice.wealth, ...advice.reduce, ...advice.loose, ...advice.budgetTips, ...advice.habits, ...advice.recurring, ...advice.obligations, ...advice.alerts];
  const findingById = (id?: string) => everything.find(f => f.id === id);
  const pinnedCards = pinned.map(id => findingById(id)).filter((f): f is Finding => Boolean(f) && !allHidden.includes(f!.id));
  const pv = priorityView(v3, { pinned, hidden: showHidden ? [] : allHidden });
  const pinnedRows: PriorityItem[] = pinnedCards.filter(f => !pv.top.some(p => p.findingId === f.id) && !pv.rest.some(p => p.findingId === f.id)).map(f => ({ signature: `advisor:${f.id}`, title: f.title, why: f.detail.replace(/\*\*|==/g, '').split(/(?<=[.!?])\s/)[0], tone: f.tone === 'good' ? 'good' : f.tone === 'bad' ? 'bad' : f.tone === 'warn' ? 'warn' : 'info', findingId: f.id, pinKey: f.id, action: f.apply ? { label: f.apply.kind === 'create-budget' ? `Buat ${short(f.apply.amount)}` : `Ubah ke ${short(f.apply.amount)}`, apply: f.apply, target: f.target } : f.target ? { label: 'Lihat', target: f.target } : undefined }));
  const priorityTop = [...pinnedRows, ...pv.top].slice(0, Math.max(3, pinnedRows.length));
  const priorityRest = [...[...pinnedRows, ...pv.top].slice(priorityTop.length), ...pv.rest];
  const progress = progressView(v3, today, new Set(changes.top.map(c => c.signature)));
  const knownSigs = new Set([...report.stories.map(st => st.signature), ...report.signals.map(sg => sg.signature)]);
  const dismissedCount = Object.values(report.memory.s).filter(r => r.dd || (r.su && r.su > today)).length;
  const hiddenCount = allHidden.length + dismissedCount;
  const topCats = advice.categories.filter(c => c.avg >= 10_000).slice(0, 8);
  const deep = report.deepDive;
  const told = new Set(Object.values(deep).flat().map(sg => sg.finding?.id).filter(Boolean) as string[]);
  const once = (list: Finding[]) => list.filter(f => !told.has(f.id) || pinned.includes(f.id));
  const goalIds = /^(emergency|fund-|saving-rate)/;
  const shownSigs = new Set([...changes.top, ...changes.rest].map(c => c.signature).concat(priorityTop.map(p => p.signature)));
  // Warnings from the Advisor that no story above covers ("Penting" before): reachable under "Lihat lainnya".
  const otherWarnings = everything.filter((f, i, a) => a.findIndex(x => x.id === f.id) === i && (f.tone === 'bad' || f.tone === 'warn') && !report.signals.some(sg => sg.finding?.id === f.id && shownSigs.has(sg.signature)) && !priorityRest.some(p => p.findingId === f.id) && !priorityTop.some(p => p.findingId === f.id) && (showHidden || !allHidden.includes(f.id)));
  const rowMenu = (item: PriorityItem) => {
    const sg = report.signals.find(x => x.signature === item.signature);
    return [
      { label: pinned.includes(item.pinKey) ? 'Lepas sematan' : 'Sematkan ke atas', onSelect: () => togglePin(item.pinKey) },
      ...(sg && sg.tone !== 'positive' ? [{ label: 'Ingatkan minggu depan', onSelect: () => snoozeStory(sg) }] : []),
      { label: 'Sembunyikan', onSelect: () => item.findingId ? hide(item.findingId) : sg && dismissStory(sg) },
    ];
  };
  const doAction = (item: PriorityItem) => { if (item.action?.apply) { const f = findingById(item.findingId); if (f) apply(item.action.apply, f); } else if (item.action?.target) go(item.action.target.view, item.action.target.focus); };
  const signalRows = (list: InsightSignal[]) => list.length ? <Capped className="ins2-rows" limit={3} label="perubahan">{list.map(sg => <SignalRow key={sg.signature} signal={sg} onOpen={openStory}/>)}</Capped> : null;
  const cards = (list: Finding[]) => list.length ? <Capped className="ins-grid">{list.map(f => card(f))}</Capped> : null;
  const tabs: { key: string; label: string; icon: LucideIcon; question: string }[] = [
    { key: 'spending', label: 'Pengeluaran', icon: Scissors, question: 'Ke mana uangku pergi, dan apa yang berubah?' },
    { key: 'cashflow', label: 'Arus uang', icon: TrendingUp, question: 'Apakah uangku aman sampai gajian?' },
    { key: 'goals', label: 'Target & aset', icon: Target, question: 'Bagaimana target dana, dana darurat, dan uang menganggur?' },
    { key: 'lab', label: 'Skenario', icon: FlaskConical, question: 'Bagaimana jika ada yang berubah? (simulasi)' },
    { key: 'data', label: 'Data', icon: Database, question: 'Seberapa kuat dasar Insight ini?' },
  ];
  const active = tabs.find(t => t.key === tab) || tabs[0];
  const subs = [['summary', 'Ringkas'], ['cats', 'Kategori'], ['habits', 'Kebiasaan'], ['prices', 'Harga']] as const;
  const tabBody = () => {
    switch (active.key) {
      case 'spending': return <>
        <div className="ix-subtabs" role="tablist" aria-label="Bagian pengeluaran">{subs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={sub === k} className={sub === k ? 'active' : ''} onClick={() => setSub(k)}>{l}</button>)}</div>
        {sub === 'summary' && <>{signalRows(deep.spending)}{cards(pinFirst(once(visible([...advice.reduce, ...advice.loose, ...advice.budgetTips]))))}{!deep.spending.length && !advice.reduce.length && !advice.loose.length && !advice.budgetTips.length && <p className="ix-empty-line">Tidak ada pos pengeluaran yang perlu diubah.</p>}</>}
        {sub === 'cats' && (topCats.length ? <div className="panel ins-cats">{topCats.map(c => <button type="button" key={c.id} className="ins-cat" onClick={() => go('transactions', `category:${c.id}@${cycle.start}..${cycle.end}`)}>
          <span className="ins-cat-icon" style={identityStyle(c.color)} aria-hidden="true"><AppIcon icon={c.icon} fallback="🗂️"/></span>
          <span className="ins-cat-name"><strong>{c.name}</strong><small>{c.kind === 'need' ? 'Kebutuhan' : 'Keinginan'} · {pct(c.share)} pengeluaran</small></span>
          <Spark values={[...c.history, c.projected]}/>
          <span className="ins-cat-num"><strong>{short(c.avg)}</strong><small className={c.trend > .1 ? 'up' : c.trend < -.1 ? 'down' : ''}>{c.trend > .1 ? `▲ ${pct(c.trend)}` : c.trend < -.1 ? `▼ ${pct(-c.trend)}` : 'stabil'}</small></span>
        </button>)}</div> : <p className="ix-empty-line">Belum ada pengeluaran.</p>)}
        {sub === 'habits' && <>{signalRows(deep.habits)}{cards(pinFirst(once(visible([...advice.habits, ...advice.recurring]))))}{!deep.habits.length && !advice.habits.length && !advice.recurring.length && <p className="ix-empty-line">Tidak ada pola belanja yang mencolok.</p>}</>}
        {sub === 'prices' && <ModuleBoundary name="Harga"><CostIndexCard report={v3}/>{signalRows([...deep.prices, ...prices])}</ModuleBoundary>}
      </>;
      case 'cashflow': return <ModuleBoundary name="Arus uang"><CashflowPanel report={v3} view={cashflowView(v3)}/>{signalRows([...deep.cashflow, ...deep.duty])}{cards(pinFirst(once(visible([...advice.alerts, ...advice.obligations.filter(f => !goalIds.test(f.id))]))))}</ModuleBoundary>;
      case 'goals': return <ModuleBoundary name="Target & aset"><GoalChoices report={v3}/>{signalRows([...deep.goals, ...deep.wealth])}{cards(pinFirst(once(visible([...advice.obligations.filter(f => goalIds.test(f.id)), ...advice.wealth]))))}{!v3.goalOptions.length && !deep.goals.length && !deep.wealth.length && !advice.wealth.length && !advice.obligations.some(f => goalIds.test(f.id)) && <p className="ix-empty-line">Target dana dan aset berjalan aman.</p>}</ModuleBoundary>;
      case 'lab': return <ModuleBoundary name="Lab Skenario"><ScenarioSandbox report={v3} saved={v3.memory.lab || []} onSave={list => saveMemory({ ...v3.memory, lab: list.slice(0, 3) })}/></ModuleBoundary>;
      default: return <ModuleBoundary name="Data"><DataSummary view={dataView(v3)} onOpenHealth={() => go('health')}/>{signalRows(report.signals.filter(sg => sg.domain === 'data' && sg.lifecycleState !== 'DISMISSED'))}</ModuleBoundary>;
    }
  };
  const sec = (id: string, title: string, subtitle: string, icon: LucideIcon, defaultOpen: boolean, body: React.ReactNode, right?: React.ReactNode) => <InsightSection id={id} title={title} subtitle={subtitle} icon={icon} open={collapse.isOpen(id, defaultOpen)} onToggle={() => collapse.toggle(id, defaultOpen)} right={right}>{body}</InsightSection>;
  const openHealth = () => { if (!collapse.isOpen('health', false)) collapse.toggle('health', false); setTimeout(() => document.getElementById('ix-h-health')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); };

  const maxCycle = Math.max(1, ...advice.cycles.flatMap(c => [c.income, c.expense]));
  const sections: Record<string, React.ReactNode> = {
    brief: sec('brief', 'Ringkasan', 'Keadaan siklus ini dalam beberapa kalimat', Sparkles, true, <><FinancialBrief lines={brief} known={knownSigs} onOpen={openStory} onExplain={() => setExplainOpen(true)}/><AskInsight report={v3} questions={questions} known={knownSigs} onOpen={openStory}/></>),
    changed: sec('changed', 'Yang berubah', report.learning.active ? 'Butuh riwayat untuk membandingkan' : 'Dibanding pola biasamu di hari siklus yang sama', Activity, true, report.learning.active
      ? <div className="ix-learning"><strong>{report.learning.message}</strong><span>{report.learning.detail}.</span><small>Sementara ini Insight menunjukkan keadaan sekarang saja dan tidak menebak dari pola orang lain.</small></div>
      : changes.quiet ? <p className="ix-empty-line">Tidak ada perubahan besar. Pengeluaranmu berjalan sesuai pola biasanya.</p>
      : <>{!hintSeen && <p className="ix-hint">Ketuk kartu untuk melihat kenapa.</p>}<div className="ix-changes">{changes.top.map(c => <ChangeCard key={c.signature} item={c} onOpen={openStory}/>)}</div>{(changes.rest.length > 0 || changesAll) && <button type="button" className="ix-more" onClick={() => setChangesAll(v => !v)}>{changesAll ? 'Ringkas' : `Lihat semua perubahan (${changes.top.length + changes.rest.length})`}</button>}</>),
    actions: sec('actions', 'Prioritas sekarang', 'Hal yang paling perlu kamu perhatikan', Lightbulb, true, priorityTop.length ? <>
      <ol className="ix-rows">{priorityTop.map((p, i) => <PriorityRow key={p.signature} item={p} index={i} onOpen={openStory} onAction={doAction} busy={busy === p.findingId} menu={rowMenu(p)}/>)}</ol>
      {(priorityRest.length > 0 || otherWarnings.length > 0) && <>
        <button type="button" className="ix-more" aria-expanded={moreOpen} onClick={() => setMoreOpen(v => !v)}>{moreOpen ? 'Ringkas' : `Lihat lainnya (${priorityRest.length + otherWarnings.length})`}</button>
        {moreOpen && <><ol className="ix-rows" start={priorityTop.length + 1}>{priorityRest.map((p, i) => <PriorityRow key={p.signature} item={p} index={priorityTop.length + i} onOpen={openStory} onAction={doAction} busy={busy === p.findingId} menu={rowMenu(p)}/>)}</ol>{otherWarnings.length > 0 && <><h4 className="ix-h4">Peringatan lain</h4>{cards(otherWarnings)}</>}</>}
      </>}
    </> : <p className="ix-empty-line">Tidak ada yang mendesak saat ini.</p>),
    progress: progress.top.length ? sec('progress', 'Yang membaik', 'Kemajuan dan hal yang sudah selesai', CircleCheck, true, <ProgressList view={progress} onOpen={openStory}/>) : null,
    pressure: sec('pressure', 'Arah & yang perlu dijaga', 'Arah = membaik atau memburuk · Perlu dijaga = hal sementara yang sedang berat', Gauge, false, <div className="ix-stack">
      <div className="ix-card"><small>Arah keuangan <HelpButton {...help.momentum}/></small><strong className="ix-mid">{hero.momentum.label}</strong><p>{hero.momentum.line}</p>{hero.momentum.parts.length > 0 && <ul className="ix-plain-list">{hero.momentum.parts.map(p => <li key={p.key} className={p.good === true ? 'good' : p.good === false ? 'held' : ''}><b>{p.label}</b><span>{p.detail}</span></li>)}</ul>}</div>
      <div className="ix-card"><small>Yang perlu dijaga <HelpButton {...help.watch}/></small><ul className="ix-plain-list">{hero.allPressures.map(p => <li key={p.domain} className={`lvl-${p.level}`}><b>{p.label} <em>{p.levelText}</em></b><span>{p.reasons[0] || p.explain}</span></li>)}</ul></div>
      {v3.regimes.length > 0 && <p className="ix-note">Konteks siklus ini: {v3.regimes.map(r => `${r.label} (${r.evidence[0]})`).join('; ')}.</p>}
    </div>),
    details: sec('details', 'Rincian', 'Lihat lebih dalam: pengeluaran, arus uang, target, skenario, dan data', BrainCircuit, true, <>
      <div className="ix-tabs" role="tablist" aria-label="Rincian">{tabs.map(t => <button type="button" role="tab" key={t.key} aria-selected={active.key === t.key} className={active.key === t.key ? 'active' : ''} onClick={event => { setTab(t.key); event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }}><t.icon size={15} aria-hidden="true"/>{t.label}</button>)}</div>
      <div className="ix-tab-body" role="tabpanel" aria-label={active.label}><p className="ix-tab-question">{active.question}</p>{tabBody()}</div>
    </>),
    health: sec('health', 'Indikator skor', '6 hal yang membentuk skor kesehatan', HeartPulse, false, <>
      <div className="ins-parts">{advice.parts.map(p => { const level = p.score >= 75 ? 'good' : p.score >= 50 ? 'warn' : 'bad'; const PartIcon = partIcons[p.key] || Gauge; return <div key={p.key} className={`ins-part tone-${level}`}>
        <div className="ins-part-top"><span className="ins-part-icon" aria-hidden="true"><PartIcon size={17}/></span><span className="ins-part-label">{p.label}</span><em>{level === 'good' ? 'Baik' : level === 'warn' ? 'Cukup' : 'Rendah'}</em></div>
        <strong>{p.value}</strong>
        <i role="img" aria-label={`Skor ${Math.round(p.score)} dari 100`}><b style={{ width: `${Math.max(4, p.score)}%` }}/></i>
        <small>{p.hint}</small>
      </div>; })}</div>
      {!advice.enoughHistory && <div className="notice">Baru {advice.cyclesUsed} siklus gaji yang punya catatan. Saran tentang anggaran dan kategori yang longgar muncul setelah minimal 2 siklus lengkap.</div>}
    </>),
    profile: sec('profile', 'Profil Insight', 'Risiko, target, dan prioritas yang menyesuaikan saran', UserRound, false, <ProfileBar personal={advice.personal} emergency={advice.idle.emergencyTargetText} onEdit={() => setProfileOpen(true)}/>),
    wealth: (advice.idle.total >= Math.max(1, advice.personal.idleMinimum) || advice.invest) ? sec('wealth', 'Uang menganggur & investasi', 'Dana yang belum terpakai dan rencana investasi (perkiraan)', Sprout, false, <WealthSection advice={advice} onEdit={() => setProfileOpen(true)} bare/>) : null,
    paycheck: advice.paycheck.length ? sec('paycheck', 'Rencana gajian berikutnya', 'Pembagian gaji per pos dari rata-rata pemasukan', HandCoins, false, <PaycheckPlan advice={advice} bare/>) : null,
    charts: advice.enoughHistory ? sec('charts', 'Grafik siklus & porsi', 'Pemasukan dan pengeluaran tiap siklus', BarChart3, false, <div className="ins-duo">
      <section className="panel ins-box">
        <h3 className="ix-h4">Pola per siklus</h3>
        <div className="ins-bars" role="img" aria-label={advice.cycles.map(c => `${c.label}: masuk ${short(c.income)}, keluar ${short(c.expense)}`).join('; ')}>{advice.cycles.map(c => <div key={c.label} className="ins-bar-col"><div className="ins-bar-pair"><i className="in" style={{ height: `${c.income / maxCycle * 100}%` }}/><i className="out" style={{ height: `${c.expense / maxCycle * 100}%` }}/></div><small>{c.label}</small></div>)}</div>
        <div className="ins-legend"><span><i className="in"/>Pemasukan</span><span><i className="out"/>Pengeluaran</span><span className="ins-legend-note">Kini = siklus berjalan</span></div>
      </section>
      {advice.summary.avgIncome > 0 && <section className="panel ins-box">
        <h3 className="ix-h4">Porsi kebutuhan, keinginan & sisa</h3>
        <div className="ins-split-bar" role="img" aria-label={`Kebutuhan ${pct(advice.split.needs)}, keinginan ${pct(advice.split.wants)}, sisa ${pct(advice.split.saved)}`}><i className="needs" style={{ flex: advice.split.needs }}/><i className="wants" style={{ flex: advice.split.wants }}/><i className="saved" style={{ flex: advice.split.saved }}/></div>
        <div className="ins-split-legend">{([['needs', 'Kebutuhan', advice.split.needs, `maks ${pct(advice.limits.needs)}`, advice.split.needs > advice.limits.needs], ['wants', 'Keinginan', advice.split.wants, `maks ${pct(advice.limits.wants)}`, advice.split.wants > advice.limits.wants], ['saved', 'Sisa', advice.split.saved, `min ${pct(advice.limits.savings)}`, advice.split.saved < advice.limits.savings]] as const).map(([key, label, value, ideal, over]) => <div key={key} className={over ? 'over' : ''}><span><i className={key}/>{label}</span><strong>{pct(value)}</strong><small>{ideal}</small></div>)}</div>
      </section>}
    </div>) : null,
    timeline: sec('timeline', 'Riwayat & keputusan', 'Perubahan penting dan hasil keputusanmu', History, false, <div className="ix-stack"><div><h4 className="ix-h4">Keputusan & hasilnya</h4><DecisionTimeline report={v3}/></div><TimelineSection entries={[...v3.memory.tl].reverse()}/></div>),
  };
  const topOrder = order.filter(key => !hiddenSections.includes(key));
  const firstKey = topOrder[0] === 'brief' ? 'brief' : '';

  return <div className="insight-page ix-page">
    {heading}
    {history.error && <p className="form-error" role="alert">{history.error}</p>}
    <div className={`ix-top ${firstKey ? 'has-side' : ''}`}>
      <InsightHero hero={hero} onFullScore={openHealth}/>
      {firstKey && sections.brief}
    </div>
    {topOrder.filter(k => k !== firstKey).map(key => <Fragment key={key}>{sections[key]}</Fragment>)}
    {openSig && <ModuleBoundary name="Rincian"><StorySheet report={v3} signature={openSig} extraSignals={prices} items={history.items} onClose={() => setOpenSig('')} onGo={go} onApply={apply} busy={busy} onDismiss={dismissStory} onSnooze={snoozeStory}/></ModuleBoundary>}
    {explainOpen && <ExplainSheet sections={explainView(v3)} onClose={() => setExplainOpen(false)}/>}
    <InsightProfileSheet open={profileOpen} onOpenChange={setProfileOpen} saved={profile?.insightProfile} onSave={saveInsightProfile}/>
    <InsightLayoutSheet open={layoutOpen} onOpenChange={setLayoutOpen} order={order} hidden={hiddenSections} pinnedCount={pinned.length} onSave={(nextOrder, nextHidden) => { setLayoutOpen(false); saveLayout({ order: nextOrder, hidden: nextHidden }); }} onClearPins={() => saveLayout({ pinned: [] }, 'Semua sematan dilepas.')}/>
    {hiddenCount > 0 && <div className="ins-hidden-note"><span>{hiddenCount} saran disembunyikan atau ditunda.</span><button type="button" className="link-button" onClick={() => setShowHidden(v => !v)}>{showHidden ? 'Sembunyikan lagi' : 'Tampilkan'}</button><button type="button" className="link-button" onClick={restore}>Pulihkan semua</button></div>}
    <p className="ins-disclaimer">Insight adalah perhitungan otomatis dari catatanmu sendiri, bukan nasihat keuangan profesional.</p>
  </div>;
}

/** Who the advice is tuned for, with a way to change it. */
function ProfileBar({ personal, emergency, onEdit }: { personal: InsightProfile; emergency: string; onEdit: () => void }) {
  if (!personal.personalized) return <section className="ins-personalize">
    <span className="ins-personalize-icon" aria-hidden="true"><UserRound size={22}/></span>
    <div><strong>Buat Insight sesuai dirimu</strong><small>Jawab kuis profil risiko dan isi target tabungan, dana darurat, serta prioritasmu (±1 menit). Saran investasi dan batas anggaran akan menyesuaikan.</small></div>
    <Button onClick={onEdit}><SlidersHorizontal size={16}/> Mulai personalisasi</Button>
  </section>;
  const chips: [string, string][] = [['Profil risiko', riskLabels[personal.risk].label], ['Target tabungan', pct(personal.savingsTarget)], ['Dana darurat', emergency], ['Prioritas', priorityLabels[personal.priority]]];
  return <section className="ins-profile-bar">
    <span className="ins-personalize-icon" aria-hidden="true"><UserRound size={18}/></span>
    <div className="ins-profile-chips">{chips.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
    <button type="button" className="link-button" onClick={onEdit}><SlidersHorizontal size={15}/> Ubah profil</button>
  </section>;
}

const riskDots = (level: number) => <span className="ins-risk" aria-label={`Risiko ${level} dari 4`}>{[1, 2, 3, 4].map(i => <i key={i} className={i <= level ? 'on' : ''}/>)}</span>;
const instrumentColors: Record<string, string> = { rdpu: 'var(--chart-1)', deposito: 'var(--chart-5)', sbn: 'var(--chart-3)', obligasi: 'var(--chart-4)', saham: 'var(--chart-2)', emas: '#c9a227' };

/** Idle money, the order it should go (emergency → expensive debt → investing) and the investment mix. */
function WealthSection({ advice, onEdit, bare }: { advice: Advice; onEdit: () => void; bare?: boolean }) {
  const { idle, invest, personal } = advice;
  if (idle.total < Math.max(1, personal.idleMinimum) && !invest) return null;
  const steps: [string, number, string][] = [
    ['Lengkapi dana darurat', Math.min(idle.total, idle.emergencyShortfall), `target ${idle.emergencyTargetText} · taruh di RDPU/tabungan`],
    ['Lunasi utang berbunga tinggi', idle.debtFirst, 'bunga ≥ 8% per tahun'],
    ['Investasikan', idle.investable, idle.held ? 'ditahan dulu: uang tersedia kurang sampai gajian' : `sesuai profil ${riskLabels[personal.risk].label}`],
  ];
  const body = <div className="ins-wealth">
      <div className="panel ins-box ins-idle">
        <div className="ins-idle-total"><small>Total uang menganggur</small><strong>{short(idle.total)}</strong><span>Nilai riilnya turun ±{short(idle.total * INFLATION)}/tahun kalau didiamkan (inflasi {Math.round(INFLATION * 100)}%).</span></div>
        <div className="ins-idle-tiles">
          <span><small>Di dompet harian</small><strong>{short(idle.operational)}</strong><em>saldo {short(idle.operationalBalance)} − kebutuhan {short(idle.operationalNeed)}</em></span>
          <span><small>{idle.savingsLabel}</small><strong>{short(idle.savingsExcess)}</strong><em>{idle.savingsNote}</em></span>
          <span><small>Sudah diinvestasikan</small><strong>{short(idle.invested)}</strong><em>dompet grup Investasi</em></span>
        </div>
        {idle.needSource === 'salary' && <p className="ins-note-est">Riwayat pengeluaranmu belum cukup, jadi kebutuhan bulanan diperkirakan dari gaji: <b>{short(idle.monthlyNeed)}/bln</b>. Makin lengkap pencatatan, makin tepat angkanya.</p>}
        <div className="ins-calcs"><CalcDetails rows={idle.opCalc} title="Hitungan dompet harian"/><CalcDetails rows={idle.savingsCalc} title={`Hitungan ${idle.savingsLabel.toLowerCase()}`}/></div>
        <ol className="ins-flow">{steps.map(([label, amount, note], i) => <li key={label} className={amount > 0 ? 'on' : ''}><b>{i + 1}</b><span><strong>{label}</strong><small>{note}</small></span><em>{amount > 0 ? short(amount) : i === 2 ? (idle.held ? 'ditahan' : '–') : 'aman'}</em></li>)}</ol>
        <CalcDetails rows={idle.calc} title="Hitungan siap diinvestasikan"/>
      </div>
      {invest && <div className="panel ins-box ins-plan">
        <header className="ins-plan-head"><div><small>Rencana investasi · profil {riskLabels[personal.risk].label}</small><strong>{invest.amount > 0 ? short(invest.amount) : `${short(invest.monthly)}/bln`}</strong><span>{invest.amount > 0 && invest.monthly > 0 ? `+ rutin ${short(invest.monthly)}/bln · ` : ''}perkiraan {rangeText(invest.returnRange)} per tahun</span></div>{!personal.personalized && <button type="button" className="link-button" onClick={onEdit}>Sesuaikan profil</button>}</header>
        <div className="ins-alloc-bar" role="img" aria-label={invest.items.map(i => `${i.name} ${i.share}%`).join(', ')}>{invest.items.map(i => <i key={i.key} style={{ flex: i.share, background: instrumentColors[i.key] }} title={`${i.name} ${i.share}%`}/>)}</div>
        <ul className="ins-alloc">{invest.items.map(i => <li key={i.key}>
          <i style={{ background: instrumentColors[i.key] }} aria-hidden="true"/>
          <div><strong>{i.name} <b>{i.share}%</b></strong><small>{i.why}</small><small className="ins-alloc-meta">{i.examples} · {i.liquidity}</small><small className="ins-alloc-meta">Imbal hasil: {i.retNote}</small></div>
          <span><strong>{invest.amount > 0 ? short(i.amount) : `${short(invest.monthly * i.share / 100)}/bln`}</strong><small>{rangeText(i.range)}/thn</small>{riskDots(i.risk)}</span>
        </li>)}</ul>
        {invest.sectors && <details className="ins-sectors"><summary>Sebar bagian saham ke beberapa sektor</summary>
          <p>Cara paling mudah: satu reksa dana indeks (IDX30/LQ45) yang sudah tersebar. Kalau memilih saham sendiri, sebar kira-kira seperti ini:</p>
          <ul>{invest.sectors.map(sector => <li key={sector.name}><span><strong>{sector.name}</strong><small>{sector.note}</small></span><i><b style={{ width: `${sector.share * 3}%` }}/></i><em>{sector.share}% · {short(sector.amount)}</em></li>)}</ul>
        </details>}
        {invest.amount > 0 && <div className="ins-projection"><small>Perkiraan nilai {invest.monthly > 0 ? `(modal awal + rutin ${short(invest.monthly)}/bln)` : ''}</small>
          <table><thead><tr><th>Waktu</th><th>Diinvestasikan</th><th>Didiamkan*</th></tr></thead><tbody>{invest.projection.map(p => <tr key={p.years}><td>{p.years} tahun</td><td><strong>{short(p.invested)}</strong></td><td>{short(p.idle)}</td></tr>)}</tbody></table>
          <small>Kolom diinvestasikan memakai perkiraan rata-rata ±{Math.round(invest.expectedReturn * 100)}% per tahun; hasil nyata bisa lebih tinggi atau lebih rendah. *Nilai riil setelah inflasi {Math.round(INFLATION * 100)}%.</small>
        </div>}
        <div className="ins-disclaimer" role="note"><Info size={16} aria-hidden="true"/><p><b>Hanya perkiraan dan saran, bukan janji.</b> Angka imbal hasil di sini adalah perkiraan rata-rata jangka panjang (sudah dikurangi pajak dan biaya) untuk gambaran saja. Hasil sebenarnya mengikuti kondisi pasar dan bisa lebih rendah — saham, reksa dana, dan emas bahkan bisa turun nilainya. Sebelum membeli, <b>cek imbal hasil terbaru</b> di aplikasi investasi atau bank resmi yang terdaftar dan diawasi OJK (untuk SBN, di situs Kemenkeu atau mitra distribusinya), lalu baca prospektus/ketentuannya.</p></div>
      </div>}
    </div>;
  if (bare) return body;
  return <section className="ins-section">
    <SectionHead icon={Sprout} title="Uang menganggur & investasi" hint={`Disesuaikan dengan profil ${riskLabels[personal.risk].label}, jangka ${personal.horizon === 'short' ? 'pendek' : personal.horizon === 'mid' ? 'menengah' : 'panjang'}.`}/>
    {body}
  </section>;
}

/** How the next salary could be split, based on averages and the personal targets. */
function PaycheckPlan({ advice, bare }: { advice: Advice; bare?: boolean }) {
  const rows = advice.paycheck;
  const colors: Record<string, string> = { needs: 'var(--chart-3)', debt: 'var(--rose)', emergency: 'var(--chart-1)', goals: 'var(--chart-5)', invest: 'var(--chart-4)', extra: 'var(--positive)', wants: 'var(--chart-2)' };
  const body = <div className="panel ins-box ins-paycheck">
      <div className="ins-alloc-bar" role="img" aria-label={rows.map(r => `${r.label} ${pct(r.share)}`).join(', ')}>{rows.map(r => <i key={r.key} style={{ flex: Math.max(r.share, .01), background: colors[r.key] }} title={`${r.label} ${pct(r.share)}`}/>)}</div>
      <ul className="ins-pay">{rows.map(r => <li key={r.key} className={`tone-${r.tone}`}><i style={{ background: colors[r.key] }} aria-hidden="true"/><span><strong>{r.label}</strong><small>{r.note}</small></span><em><strong>{short(r.amount)}</strong><small>{pct(r.share)}</small></em></li>)}</ul>
      <p className="ins-pay-tip"><Layers size={14} aria-hidden="true"/><span>Tips: pindahkan porsi tabungan &amp; investasi <b>di hari gajian</b>, sisanya baru dipakai belanja.</span></p>
    </div>;
  if (bare) return body;
  return <section className="ins-section">
    <SectionHead icon={HandCoins} title="Rencana gajian berikutnya" hint={`Pembagian dari rata-rata pemasukan ${short(advice.summary.avgIncome)} dengan target tabunganmu ${pct(advice.personal.savingsTarget)}.`}/>
    {body}
  </section>;
}
