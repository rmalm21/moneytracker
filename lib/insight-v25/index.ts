/**
 * Insight V2.5 — Explainable Financial Intelligence (entry point).
 *
 * Runs the current Advisor (lib/advisor.ts, unchanged: score, cards, wealth, paycheck plan) and on top of it reads
 * explainable signals from one shared context (context.ts): spending with drivers, merchants, budgets, pace, income,
 * claims, receivables, debt trajectory, goals, recurring price drift, unusual transactions, data quality — and, only
 * when asked, receipt item prices. Signals are linked to the Advisor cards they talk about, grouped into one story
 * per root cause, given a lifecycle from the user's Insight memory, ranked, and told as a short brief.
 * Everything runs on the device; nothing moves money or changes a record (apply buttons go through the normal
 * save flow with the user's tap).
 */
import { analyzeFinances, type Advice, type AdvisorInput } from '../advisor.ts';
import { buildStories } from './cluster.ts';
import { buildContext, type InsightContext } from './context.ts';
import { recordScore, scoreDelta, type ScoreDelta } from './health.ts';
import { applyLifecycle, emptyMemory, type InsightMemory, type ResolvedItem, type TimelineEntry } from './lifecycle.ts';
import { financialBrief, heroStatement, type BriefSentence } from './narrative.ts';
import { rankStories } from './rank.ts';
import { bridgeAdvisor } from './bridge.ts';
import { anomalySignals } from './signals/behavior.ts';
import { budgetSignals } from './signals/budget.ts';
import { claimSignals } from './signals/claims.ts';
import { dataQualitySignals } from './signals/data-quality.ts';
import { debtSignals } from './signals/debt.ts';
import { goalSignals } from './signals/goals.ts';
import { incomeProfile, incomeSignals } from './signals/income.ts';
import { priceSignals } from './signals/prices.ts';
import { receivableSignals } from './signals/receivable.ts';
import { recurringSignals } from './signals/recurring.ts';
import { spendingSignals } from './signals/spending.ts';
import type { DeepDive, Domain, InsightSignal, Story } from './types.ts';

export type { InsightSignal, Story } from './types.ts';
export type InsightOptions = {
  memory?: InsightMemory;
  /** Number of Data Health findings (lib/finance-control.ts scanData), lowers confidence and adds a note. */
  healthIssues?: number;
  /** Advisor card ids the user chose to ignore (per-device list plus the synced one). */
  hiddenFindings?: string[];
  /** Advisor output already computed for the same input (skips running it twice). */
  advice?: Advice;
};
export type InsightReport = {
  advice: Advice;
  context: InsightContext;
  signals: InsightSignal[];
  stories: Story[];
  hero: { score: number; delta: ScoreDelta | null; statement: string };
  brief: BriefSentence[];
  changed: Story[];
  priority: Story[];
  progress: { stories: Story[]; resolved: ResolvedItem[] };
  deepDive: Record<DeepDive, InsightSignal[]>;
  timeline: TimelineEntry[];
  learning: { active: boolean; cycles: number; message: string; detail: string };
  memory: InsightMemory; memoryChanged: boolean;
  ms: number;
};

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const HIDDEN_STATES = new Set(['DISMISSED', 'SNOOZED']);
const CHANGE_DOMAINS = new Set<Domain>(['spending', 'merchant', 'cashflow', 'income', 'debt', 'recurring', 'budget', 'behavior']);

export function analyzeInsight(input: AdvisorInput, options: InsightOptions = {}): InsightReport {
  const started = now();
  const advice = options.advice || analyzeFinances(input);
  const ctx = buildContext(input, { healthIssues: options.healthIssues });
  const learning = ctx.baseline.length < 2;
  const spendingChecked = !learning && ctx.current.progress >= .15;
  const raw = [
    ...spendingSignals(ctx), ...budgetSignals(ctx), ...incomeSignals(ctx), ...claimSignals(ctx), ...receivableSignals(ctx),
    ...debtSignals(ctx), ...goalSignals(ctx), ...recurringSignals(ctx), ...anomalySignals(ctx), ...dataQualitySignals(ctx),
  ];
  const { adapted } = bridgeAdvisor(advice, raw, ctx.today);
  // Advisor spending cards read the same categories, so the same Data Health caveat applies to them.
  if (ctx.quality.uncategorizedCurrent >= .05) for (const s of adapted) if (s.domain === 'spending' || s.domain === 'budget') s.caveats.push(`${Math.round(ctx.quality.uncategorizedCurrent * 100)}% pengeluaran siklus ini belum memiliki kategori, jadi angka per kategori bisa kurang.`);
  const evaluated = new Set<Domain>(['budget', 'claims', 'receivable', 'debt', 'goals', 'recurring', 'data', 'behavior', 'income', ...(spendingChecked ? ['spending', 'merchant', 'cashflow'] as Domain[] : [])]);
  const memoryIn = options.memory || emptyMemory();
  const life = applyLifecycle([...raw, ...adapted], memoryIn, ctx.today, ctx.current.start, evaluated);
  const memory = recordScore(life.memory, advice, ctx.today, ctx.current.start);
  const hiddenFindings = new Set([...(options.hiddenFindings || []), ...(memory.hidden || [])]);
  const signals = life.signals.map(s => s.finding && hiddenFindings.has(s.finding.id) && s.lifecycleState !== 'WORSENING' ? { ...s, lifecycleState: 'DISMISSED' as const } : s);
  const income = incomeProfile(ctx).typical;
  const stories = rankStories(buildStories(signals), ctx.profile, income);
  const visible = stories.filter(s => !HIDDEN_STATES.has(s.state));

  // Yang berubah: material changes, the biggest and surest first, at most 4, good news included.
  const changeScore = (s: Story) => Math.abs(s.impact) * s.confidence.score * (s.root.novelty + .5);
  let changed = visible.filter(s => s.root.material && CHANGE_DOMAINS.has(s.root.domain) && s.root.type !== 'advisor_card' && s.root.confidence.level !== 'low').sort((a, b) => changeScore(b) - changeScore(a));
  // The overall pace is left out when one category story already explains most of it.
  const pace = changed.find(s => s.signature === 'cashflow:spending-pace');
  if (pace) { const covered = changed.filter(s => s.root.domain === 'spending' && Math.sign(s.root.delta || 0) === Math.sign(pace.root.delta || 0)).reduce((n, s) => n + Math.abs(s.root.delta || 0), 0); if (covered >= Math.abs(pace.root.delta || 0) * .6) changed = changed.filter(s => s !== pace); }
  let top = changed.slice(0, 4);
  const positive = changed.find(s => s.tone === 'positive');
  if (positive && !top.includes(positive)) top = [...top.slice(0, 3), positive];
  changed = top;

  const priority = visible.filter(s => s.tone !== 'positive' && (s.root.actionable || s.tone === 'important' || s.tone === 'watch'));
  const progressStories = visible.filter(s => s.tone === 'positive' && s.root.material || s.state === 'IMPROVING');
  const deepDive = { spending: [], cashflow: [], duty: [], goals: [], wealth: [], habits: [], prices: [] } as Record<DeepDive, InsightSignal[]>;
  for (const s of signals) if (!HIDDEN_STATES.has(s.lifecycleState) && s.type !== 'advisor_card') deepDive[s.deepDive].push(s);
  const delta = scoreDelta(advice, memoryIn.h, ctx.today);
  const learningInfo = { active: learning, cycles: ctx.baseline.length, message: 'Insight masih mempelajari pola normalmu', detail: `${ctx.baseline.length} siklus lengkap tersedia${learning ? ' — perbandingan dan penyebab muncul setelah 2 siklus' : ''}` };
  const brief = financialBrief({ score: advice.score, delta, changed, priority, progress: progressStories, resolved: life.resolved, learning: learningInfo });
  return {
    advice, context: ctx, signals, stories,
    hero: { score: advice.score, delta, statement: heroStatement(advice.score, delta, priority[0], learning) },
    brief, changed, priority, progress: { stories: progressStories, resolved: life.resolved }, deepDive,
    timeline: [...memory.tl].reverse(), learning: learningInfo,
    memory, memoryChanged: JSON.stringify(memory) !== JSON.stringify(memoryIn), ms: now() - started,
  };
}

/** Receipt item prices: computed only when the Harga section is opened. */
export function analyzePrices(report: Pick<InsightReport, 'context'>) { return priceSignals(report.context); }
