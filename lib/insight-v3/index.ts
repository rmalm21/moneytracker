/**
 * Insight V3.0 — Financial Intelligence OS (entry point).
 *
 * OBSERVE → MODEL → COMPARE → DETECT → EXPLAIN → CONNECT → SIMULATE → PRIORITIZE → REMEMBER → MEASURE → BRIEF →
 * SELF-AUDIT, then show only what matters.
 *
 * Runs Insight V2.5 unchanged (which runs the Advisor unchanged) and adds, through V2.5's `extend` hook so the new
 * signals share its lifecycle, stories and ranking: the FinancialWorld (derived from canonical engines), horizons,
 * regime context, liquidity timing, income structure, behavior sequences, exposure and wallet yield. On top of the
 * V2.5 result it builds the impact graph, pressure, momentum, the read-only scenario engine, goal trade-offs, decision
 * outcomes, recommendation conflicts, a self-audit of what reaches the top, the V3 brief and "Jelaskan siklus ini".
 * Heavy parts (personal cost index, merchant prices, stress tests, full graph view) are computed only when asked.
 */
import type { AdvisorInput } from '../advisor.ts';
import { analyzeInsight, type InsightOptions, type InsightReport } from '../insight-v25/index.ts';
import type { InsightContext } from '../insight-v25/context.ts';
import type { InsightSignal, Story } from '../insight-v25/types.ts';
import type { Profile } from '../types';
import { explainCycle, financialBriefV3 } from './brief.ts';
import { outcomes, type Outcome } from './decisions.ts';
import { buildGraph, chainFrom } from './graph.ts';
import { auditStory, conflicts, type Audit, type Suppressed } from './guard.ts';
import { goalTradeoffs, incomeSignalsV3 } from './income.ts';
import { merchantPrices, personalCostIndex } from './prices.ts';
import { simulate, stressTests, type ScenarioInput, type ScenarioResult } from './scenario.ts';
import { behaviorSignals, liquiditySignals, yieldSignals } from './signals.ts';
import { isTravelLine, mainPressure, momentum, pressures, regimes } from './state.ts';
import type { Horizon, ImpactGraph, Momentum, Pressure, Regime } from './types.ts';
import { buildWorld, type FinancialWorld } from './world.ts';

export type { FinancialWorld } from './world.ts';
export type InsightV3Options = InsightOptions & { profile?: Partial<Profile> };
export type InsightV3Report = {
  v25: InsightReport; world: FinancialWorld;
  horizonOf: (s: InsightSignal) => Horizon;
  extra: InsightSignal[];
  graph: ImpactGraph; chain: (signature: string) => ReturnType<typeof chainFrom>;
  pressures: Pressure[]; mainPressure: Pressure[]; momentum: Momentum; regimes: Regime[];
  scenarios: { base: ScenarioResult; claimArrives: ScenarioResult; claimDelayed: ScenarioResult };
  whatIf: (input: ScenarioInput) => ScenarioResult;
  stress: () => ScenarioResult[];
  goalOptions: ReturnType<typeof goalTradeoffs>;
  costIndex: () => ReturnType<typeof personalCostIndex>;
  merchantPrices: () => ReturnType<typeof merchantPrices>;
  outcomes: Outcome[];
  suppressed: Suppressed[]; audits: Audit[];
  changed: Story[]; priority: Story[]; silent: boolean;
  brief: ReturnType<typeof financialBriefV3>;
  explain: () => ReturnType<typeof explainCycle>;
  hero: { score: number; momentum: string; pressure: string; statement: string };
  memory: InsightReport['memory']; memoryChanged: boolean; ms: number;
};

/** Horizon of any signal, from its kind. */
export function horizonOf(s: InsightSignal): Horizon {
  if (/^(claims:aging|behavior:unusual|liquidity:|budget:pressure)/.test(s.signature) || s.type === 'budget_over' || s.signature === 'advisor:runway') return 'IMMEDIATE';
  if (/^(goals:|advisor:(emergency|fund-|invest|idle|dormant|emergency-yield))|^wealth:|^prices:/.test(s.signature)) return 'LONG_TERM';
  if (/^(debt:|recurring:|income:|behavior:payday|exposure:|cashflow:dependency)/.test(s.signature)) return 'MULTI_CYCLE';
  return 'CURRENT_CYCLE';
}

let cache: { key: string; report: InsightV3Report } | null = null;
/** Cheap fingerprint of everything the analysis reads: same data, same day, same memory → same result. */
function fingerprint(input: AdvisorInput, options: InsightV3Options) {
  const h = input.history, d = input.data;
  let money = 0; for (const tx of h) money = (money * 31 + tx.amount + tx.date.charCodeAt(9)) % 1e12;
  return JSON.stringify([input.today, h.length, money, h[h.length - 1]?.id, d.wallets.map(w => w.cachedBalance), d.budgets.length, d.claims.map(c => c.remainingAmount + c.status), d.receivables.map(r => r.remainingAmount), d.debts.map(x => x.outstandingAmount), d.funds.map(f => f.currentAmount + f.targetAmount), d.recurring.length, d.plannedTransactions.length, input.stat.free, input.committed, input.profile, options.memory, options.hiddenFindings, options.healthIssues, options.profile]);
}

export function analyzeInsightV3(input: AdvisorInput, options: InsightV3Options = {}): InsightV3Report {
  const key = fingerprint(input, options);
  if (cache?.key === key) return cache.report;
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let world: FinancialWorld | null = null, ctxRef: InsightContext | null = null;
  let base!: ScenarioResult, arrives!: ScenarioResult, delayed!: ScenarioResult, extra: InsightSignal[] = [], regimeList: Regime[] = [];
  const v25 = analyzeInsight(input, {
    ...options,
    extend: (ctx, raw) => {
      ctxRef = ctx;
      world = buildWorld(input, ctx, options.profile);
      regimeList = regimes(world, ctx);
      // Regime is context: in a travel cycle, travel spending is still reported, but not as a warning.
      if (regimeList.some(r => r.key === 'TRAVEL_HEAVY')) for (const s of raw) if ((s.domain === 'spending' || s.domain === 'merchant' || s.domain === 'behavior') && isTravelLine(`${s.title} ${s.summary}`)) { s.caveats.push('Siklus ini banyak perjalanan, jadi kenaikan ini bisa wajar.'); if (s.tone === 'watch' || s.tone === 'important') { s.tone = 'neutral'; s.actionable = false; } }
      const claims = input.data.claims || [];
      base = simulate(world, claims); arrives = simulate(world, claims, { claimTiming: 'historical' }); delayed = simulate(world, claims, { claimTiming: 'delayed' });
      const open = claims.some(c => c.remainingAmount > 0 && c.status !== 'paid' && c.status !== 'rejected');
      extra = [...liquiditySignals(world, base, arrives, delayed, open), ...incomeSignalsV3(world), ...behaviorSignals(ctx, world), ...yieldSignals(world)];
      return extra;
    },
  });
  const w = world as unknown as FinancialWorld, ctx = ctxRef as unknown as InsightContext;
  const graph = buildGraph(v25.signals, v25.stories, w);
  const pressureList = pressures(w, v25.signals, v25.advice, base);
  const main = mainPressure(pressureList);
  const mom = momentum(w, v25.signals, ctx);
  const suppressed = conflicts(v25.signals, pressureList, w);
  const blocked = new Set(suppressed.map(x => x.signature));
  const audits = [...v25.priority, ...v25.changed].map(st => auditStory(st, v25.stories, blocked));
  const passed = new Set(audits.filter(a => a.pass).map(a => a.signature));
  const changed = v25.changed.filter(st => passed.has(st.signature));
  const priority = v25.priority.filter(st => passed.has(st.signature) || st.tone === 'important' && !blocked.has(st.signature));
  for (const s of v25.signals) { const why = suppressed.find(x => x.signature === s.signature); if (why && !s.caveats.includes(why.reason)) s.caveats.push(why.reason); }
  // Memory: milestones and decision outcomes join the timeline once.
  const memory = { ...v25.memory, tl: [...v25.memory.tl], mi: { ...(v25.memory.mi || {}) }, dec: (v25.memory.dec || []).map(d => ({ ...d })) };
  const log = (k: string, t: string, e: 'milestone' | 'outcome', tone: 'positive' | 'neutral') => { if (!memory.tl.some(x => x.k === k)) memory.tl.push({ d: w.asOf, k, e, t, tone }); };
  const months = Math.floor(v25.advice.summary.emergencyMonths || 0);
  if (memory.mi.em !== undefined && months > memory.mi.em && months >= 1) log(`milestone:emergency:${months}`, `Dana darurat mencapai ${months} bulan kebutuhan`, 'milestone', 'positive');
  if (memory.mi.em === undefined || months > memory.mi.em) memory.mi.em = months;
  const debtStep = Math.ceil(w.obligations.debtOutstanding / 1e6);
  if (memory.mi.debt !== undefined && debtStep < memory.mi.debt) log(`milestone:debt:${debtStep}`, debtStep === 0 ? 'Semua utang lunas' : `Utang turun di bawah Rp${debtStep} jt`, 'milestone', 'positive');
  if (memory.mi.debt === undefined || debtStep < memory.mi.debt) memory.mi.debt = debtStep;
  const outs = outcomes(memory, ctx);
  for (const o of outs) if (o.status !== 'pending' && !o.provisional) { const d = memory.dec.find(x => x.id === o.decision.id); if (d && !d.o) { d.o = o.status; log(`outcome:${d.id}`, o.text, 'outcome', o.status === 'improved' ? 'positive' : 'neutral'); } }
  memory.tl = memory.tl.slice(-40);
  if (!memory.dec.length) delete (memory as { dec?: unknown }).dec;
  const surplus = w.income.regularTypical - (w.historicalCycles.length ? [...w.historicalCycles.map(c => c.expense)].sort((a, b) => a - b)[Math.floor((w.historicalCycles.length - 1) / 2)] : 0);
  const wishMonthly = (input.data.wishlist || []).filter(x => x.status === 'active').reduce((n, x) => n + (x.monthly || 0), 0);
  // Silence: nothing material changed and nothing important; standing advice stays in Prioritas, but is not news.
  const silent = !changed.length && !priority.some(st => st.tone === 'important') && !main.some(p => p.level === 'pressure');
  const brief = financialBriefV3(v25, w, mom, main);
  const statement = priority[0]?.tone === 'important' ? (priority[0].root.headline || priority[0].title) : silent ? 'Keuangan relatif stabil.' : main.length ? `${pressureList.find(p => p.domain === 'liquidity')?.level === 'good' || pressureList.find(p => p.domain === 'liquidity')?.level === 'stable' ? 'Likuiditas aman, tapi ' : ''}${main.map(p => p.label.toLowerCase()).join(' dan ')} sedang mendapat tekanan.`.replace(/^./, c => c.toUpperCase()) : v25.hero.statement;
  const report: InsightV3Report = {
    v25, world: w, horizonOf, extra, graph, chain: sig => chainFrom(graph, sig),
    pressures: pressureList, mainPressure: main, momentum: mom, regimes: regimeList,
    scenarios: { base, claimArrives: arrives, claimDelayed: delayed },
    whatIf: inputScenario => simulate(w, input.data.claims || [], inputScenario),
    stress: () => stressTests.map(t => simulate(w, input.data.claims || [], t)),
    goalOptions: goalTradeoffs(w, surplus, wishMonthly),
    costIndex: () => personalCostIndex(ctx), merchantPrices: () => merchantPrices(ctx),
    outcomes: outs, suppressed, audits, changed, priority, silent, brief,
    explain: () => explainCycle(v25, w, mom, main),
    hero: { score: v25.hero.score, momentum: mom.label, pressure: main.map(p => p.label).join(' & '), statement },
    memory, memoryChanged: v25.memoryChanged || JSON.stringify(memory) !== JSON.stringify(v25.memory),
    ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started,
  };
  cache = { key, report };
  return report;
}
