/**
 * Insight V3 — financial state beyond the score: Pressure (what is under strain now), Momentum (which way things
 * move across cycles) and Regime (the context of this cycle). None of them changes the Health score; a healthy user
 * can carry temporary claim pressure. Momentum is never a number: a state plus the parts that make it.
 */
import type { Advice } from '../advisor.ts';
import { mean, sum } from '../insight-v25/baseline.ts';
import type { InsightContext } from '../insight-v25/context.ts';
import type { InsightSignal } from '../insight-v25/types.ts';
import { obligationClusters, type ScenarioResult } from './scenario.ts';
import type { Level, Momentum, MomentumPart, Pressure, Regime } from './types.ts';
import type { FinancialWorld } from './world.ts';

const levelOf = (score: number): Level => score >= .7 ? 'pressure' : score >= .45 ? 'watch' : score >= .2 ? 'stable' : 'good';
const short = (v: number) => { const n = Math.abs(v); return `${v < 0 ? '-' : ''}Rp${n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} jt` : `${Math.round(n / 1e3)} rb`}`; };

export function pressures(world: FinancialWorld, signals: InsightSignal[], advice: Advice, base: ScenarioResult): Pressure[] {
  const has = (sig: string) => signals.find(s => s.signature === sig && s.lifecycleState !== 'DISMISSED' && s.lifecycleState !== 'SNOOZED');
  const out: Pressure[] = [];
  const pace = Math.max(1, world.liquidity.dailyPace);
  // Liquidity: the lowest point of the path to payday.
  {
    const low = base.lowest.balance, clusters = obligationClusters(world);
    const score = low < 0 ? .85 : low < pace * 3 ? .6 : low < pace * 7 ? .45 : clusters.length ? .3 : .1;
    out.push({ domain: 'liquidity', label: 'Likuiditas', level: levelOf(score), score, reasons: [`Titik terendah sebelum gajian ±${short(low)} (${base.lowest.date.slice(8)}/${base.lowest.date.slice(5, 7)})`, ...clusters.slice(0, 1).map(c => `${c.items.length} tagihan ${short(c.total)} berdekatan`)] });
  }
  const budgets = signals.filter(s => s.domain === 'budget' && s.lifecycleState !== 'DISMISSED');
  if (budgets.length) { const over = budgets.filter(s => s.type === 'budget_over').length; const score = Math.min(1, .4 + over * .25 + budgets.length * .1); out.push({ domain: 'budget', label: 'Anggaran', level: levelOf(score), score, reasons: budgets.slice(0, 3).map(s => s.title), signature: budgets[0].signature }); }
  if (world.obligations.debtOutstanding > 0) { const dsr = advice.summary.dsr; const score = dsr > .4 ? .8 : dsr > .3 ? .55 : dsr > .15 ? .3 : .15; out.push({ domain: 'debt', label: 'Utang', level: levelOf(score), score, reasons: [`Cicilan ${Math.round(dsr * 100)}% dari pemasukan`, `Sisa utang ${short(world.obligations.debtOutstanding)}`], signature: 'debt:trajectory' }); }
  const goal = has('goals:pressure');
  if (goal) { const gap = goal.delta || 0, demand = goal.current || 1; const score = Math.min(1, .45 + gap / demand * .5); out.push({ domain: 'goal', label: 'Target dana', level: levelOf(score), score, reasons: [goal.headline || goal.title], signature: goal.signature }); }
  const claims = has('claims:outstanding');
  if (claims) { const ratio = world.liquidity.available > 0 ? (claims.current || 0) / world.liquidity.available : 1; const aging = signals.filter(s => s.signature.startsWith('claims:aging:')).length; const score = Math.min(1, .2 + Math.min(.4, ratio * .4) + aging * .15); out.push({ domain: 'claim', label: 'Klaim kantor', level: levelOf(score), score, reasons: [claims.headline || claims.title, ...(world.liquidity.available > 0 ? [`${Math.round(ratio * 100)}% dari uang tersedia`] : [])], signature: claims.signature }); }
  const rec = has('receivable:outstanding');
  if (rec) { const late = signals.filter(s => s.signature.startsWith('receivable:late:')).length; const ratio = world.liquidity.available > 0 ? (rec.current || 0) / world.liquidity.available : 1; const score = Math.min(1, .15 + late * .15 + Math.min(.3, ratio * .3)); out.push({ domain: 'receivable', label: 'Piutang', level: levelOf(score), score, reasons: [rec.headline || rec.title], signature: rec.signature }); }
  const recurringLeft = -sum(world.obligations.upcoming.filter(e => e.id.startsWith('recurring:') && e.amount < 0 && e.date < world.currentCycle.end).map(e => e.amount));
  if (recurringLeft > 0) { const ratio = world.liquidity.available > 0 ? recurringLeft / world.liquidity.available : 1; const score = ratio > .6 ? .7 : ratio > .35 ? .45 : .15; out.push({ domain: 'recurring', label: 'Tagihan rutin', level: levelOf(score), score, reasons: [`${short(recurringLeft)} tagihan rutin sebelum gajian`] }); }
  return out.sort((a, b) => b.score - a.score);
}
/** "Tekanan utama": at most two domains that are really under strain. */
export const mainPressure = (list: Pressure[]) => list.filter(p => p.level === 'watch' || p.level === 'pressure').slice(0, 2);

export function momentum(world: FinancialWorld, signals: InsightSignal[], ctx: InsightContext): Momentum {
  const cycles = world.historicalCycles;
  if (cycles.length < 3) return { state: 'STABLE', label: 'Belum cukup riwayat', parts: [], enough: false };
  const recent = cycles.slice(-2), earlier = cycles.slice(0, -2);
  const parts: MomentumPart[] = [];
  const move = (key: string, label: string, now: number, before: number, upIsGood: boolean, min: number, unit = (v: number) => short(v)) => {
    const d = now - before;
    const direction = Math.abs(d) < Math.max(min, Math.abs(before) * .1) ? 'flat' : d > 0 ? 'up' : 'down';
    parts.push({ key, label, direction, good: direction === 'flat' ? null : (direction === 'up') === upIsGood, detail: `${unit(before)} → ${unit(now)} per siklus` });
  };
  move('savings', 'Sisa per siklus', mean(recent.map(c => c.surplus)), mean(earlier.map(c => c.surplus)), true, 200_000);
  move('spending', 'Pengeluaran', mean(recent.map(c => c.expense)), mean(earlier.map(c => c.expense)), false, 200_000);
  const debt = signals.find(s => s.signature === 'debt:trajectory');
  if (debt) parts.push({ key: 'debt', label: 'Utang', direction: (debt.delta || 0) < 0 ? 'down' : 'up', good: (debt.delta || 0) < 0, detail: debt.headline || debt.title });
  const emergencyIds = new Set(ctx.input.data.funds.filter(f => f.kind === 'emergency').map(f => f.id));
  if (emergencyIds.size) {
    const contrib = (c: { start: string; end: string }) => sum(ctx.input.history.filter(tx => tx.type === 'fund_contribution' && tx.fundId && emergencyIds.has(tx.fundId) && tx.date >= c.start && tx.date < c.end).map(tx => tx.amount));
    const total = sum(recent.map(contrib));
    parts.push({ key: 'emergency', label: 'Dana darurat', direction: total > 0 ? 'up' : 'flat', good: total > 0 ? true : null, detail: total > 0 ? `+${short(total)} dalam 2 siklus terakhir` : 'tidak ada setoran 2 siklus terakhir' });
  }
  if (signals.some(s => s.signature === 'goals:pressure')) parts.push({ key: 'goals', label: 'Target dana', direction: 'down', good: false, detail: 'kebutuhan target di atas sisa uang biasanya' });
  const goods = parts.filter(p => p.good === true).length, bads = parts.filter(p => p.good === false).length;
  const state = bads >= 2 && !goods ? 'UNDER_PRESSURE' : goods && bads ? 'MIXED' : goods ? 'IMPROVING' : bads ? 'UNDER_PRESSURE' : 'STABLE';
  return { state, label: { IMPROVING: 'Membaik', STABLE: 'Stabil', MIXED: 'Campuran', UNDER_PRESSURE: 'Tertekan' }[state], parts, enough: true };
}

const TRAVEL = /(tiket|hotel|pesawat|travel|liburan|kereta|traveloka|tiket\.com|airbnb|wisata|penginapan|villa|resort|bandara|airport)/i;
export function regimes(world: FinancialWorld, ctx: InsightContext): Regime[] {
  const out: Regime[] = [];
  const cur = ctx.current, data = ctx.input.data;
  const spend = cur.lines.filter(l => l.tx.type === 'expense'), total = sum(spend.map(l => l.amount));
  const travel = spend.filter(l => TRAVEL.test(`${ctx.nameOf(l.categoryId)} ${ctx.nameOf(l.subcategoryId)} ${l.merchant} ${l.tx.description}`));
  const travelPlans = data.plannedTransactions.filter(p => p.date >= cur.start && p.date < cur.end && TRAVEL.test(`${p.title} ${p.notes}`));
  const travelAmount = sum(travel.map(l => l.amount));
  if ((travelAmount >= 500_000 && total && travelAmount / total >= .15) || travelPlans.length) out.push({ key: 'TRAVEL_HEAVY', label: 'Siklus perjalanan', evidence: [...(travelAmount ? [`${short(travelAmount)} untuk tiket/penginapan/perjalanan siklus ini`] : []), ...travelPlans.map(p => `Rencana: ${p.title}`)] });
  const big = [...data.plannedTransactions.filter(p => p.type === 'expense' && p.amount >= 1_000_000 && p.date >= cur.start && p.date < cur.end && p.status !== 'cancelled').map(p => `Rencana ${p.title} ${short(p.amount)}`), ...(data.wishlist || []).filter(w => w.status === 'bought' && w.boughtDate && w.boughtDate >= cur.start && w.price >= 1_000_000).map(w => `Wish list dibeli: ${w.name} ${short(w.price)}`)];
  if (big.length) out.push({ key: 'LARGE_PURCHASE', label: 'Pembelian besar terencana', evidence: big });
  if (world.obligations.claimsOutstanding >= 2_000_000 || (world.liquidity.available > 0 && world.obligations.claimsOutstanding >= world.liquidity.available * .5)) out.push({ key: 'HIGH_CLAIM', label: 'Banyak klaim tertahan', evidence: [`${short(world.obligations.claimsOutstanding)} klaim belum cair`] });
  if (world.income.typical && cur.income >= world.income.typical * 1.3) out.push({ key: 'HIGH_INCOME', label: 'Pemasukan tinggi', evidence: [`${short(cur.income)} siklus ini, biasanya ${short(world.income.typical)}`] });
  const last = world.historicalCycles[world.historicalCycles.length - 1];
  if (last && world.income.typical && last.income <= world.income.typical * .8) out.push({ key: 'LOW_INCOME', label: 'Pemasukan rendah', evidence: [`${short(last.income)} siklus lalu, biasanya ${short(world.income.typical)}`] });
  return out;
}
export const isTravelLine = (text: string) => TRAVEL.test(text);
