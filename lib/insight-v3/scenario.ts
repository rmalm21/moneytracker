/**
 * Insight V3 — liquidity timing and the Scenario Engine (read-only).
 *
 * The baseline path walks day by day from today to payday: it starts at Uang bebas minus the safety buffer, takes
 * the canonical spending pace (forecast) each day, and applies the dated events from finance-control.upcomingEvents
 * (bills, plans, inbox drafts, recurring, debt due dates, claims with an expected date). Salary arrives at the end.
 * A scenario is a set of changes applied to a COPY of that path: nothing in the user's data is ever touched.
 * Results are simulations ("SIMULASI"), never facts or predictions.
 */
import type { UpcomingEvent } from '../finance-control.ts';
import { quantile, sum } from '../insight-v25/baseline.ts';
import { addDays, daysBetween } from '../insight-v25/context.ts';
import type { FinancialWorld } from './world.ts';
import type { Claim } from '../types';

export type ScenarioInput = {
  id?: string; label?: string;
  /** Change of next salary (rupiah) and/or a factor (0.8 = −20%). */
  incomeDelta?: number; incomeFactor?: number;
  /** One-off spending today (an unexpected bill). */
  expenseDelta?: number;
  /** Daily spending pace change in percent (−10 = 10% less). */
  dailyAdjust?: number;
  /** Recurring schedules left out (ids). */
  removeRecurring?: string[];
  /** Claim payout timing: as recorded, on the usual historical day, earlier (today) or not before payday. */
  claimTiming?: 'recorded' | 'historical' | 'early' | 'delayed';
  extraDebtPayment?: number;
  /** Monthly goal contribution change (paid on the next salary). */
  goalContributionChange?: number;
  largePurchase?: { amount: number; date?: string; label?: string };
  /** A category back to its usual pace: the extra per remaining day removed. */
  spendingReturnedToBaseline?: { label: string; extraPerDay: number };
  /** Count a "high recurring month": all recurring bills ×(1+x). */
  recurringFactor?: number;
  /** Only regular pay (no overtime/bonus). */
  regularOnly?: boolean;
};
export type PathEvent = { date: string; label: string; amount: number; kind: string };
export type PathPoint = { date: string; balance: number; events: PathEvent[] };
export type ScenarioResult = {
  input: ScenarioInput; points: PathPoint[];
  lowest: { date: string; balance: number; events: PathEvent[] };
  beforePayday: number; afterSalary: number;
  /** Room per remaining day if the lowest point is kept at zero (simulation, not Jatah Aman). */
  roomPerDay: number;
  /** Reserved money that would be needed if the path goes below zero. */
  reservedNeeded: number;
  goalCapacity: number; debtAfter: number;
};

const claimEvents = (claims: Claim[], world: FinancialWorld, timing: ScenarioInput['claimTiming'] = 'recorded'): PathEvent[] => {
  const open = claims.filter(c => c.remainingAmount > 0 && c.status !== 'paid' && c.status !== 'rejected');
  const usual = usualClaimDays(claims);
  return open.flatMap(c => {
    if (timing === 'delayed') return [];
    const date = timing === 'early' ? world.asOf : timing === 'historical' && usual !== null && c.submissionDate ? addDays(c.submissionDate, Math.round(usual)) : c.expectedPaymentDate;
    if (!date) return [];
    return [{ date: date < world.asOf ? world.asOf : date, label: `Klaim ${c.name} cair`, amount: c.remainingAmount, kind: 'claim' }];
  });
};
export function usualClaimDays(claims: Claim[]) {
  const days = claims.filter(c => c.status === 'paid' && c.paidDate && c.submissionDate && c.paidDate >= c.submissionDate).map(c => daysBetween(c.submissionDate, c.paidDate));
  return days.length >= 3 ? quantile(days, .5) : null;
}

export function simulate(world: FinancialWorld, claims: Claim[], input: ScenarioInput = {}): ScenarioResult {
  const end = world.currentCycle.end;
  const factor = 1 + (input.dailyAdjust || 0) / 100;
  const pace = Math.max(0, world.liquidity.dailyPace * factor - (input.spendingReturnedToBaseline?.extraPerDay || 0));
  const skip = new Set(input.removeRecurring || []);
  const recurringId = (e: UpcomingEvent) => e.id.startsWith('recurring:') ? e.id.split(':')[1] : '';
  const events: PathEvent[] = world.obligations.upcoming
    .filter(e => e.kind !== 'claim' && e.kind !== 'receivable' && e.kind !== 'note' && !e.id.startsWith('salary:') && !skip.has(recurringId(e)) && e.date < end)
    .map(e => ({ date: e.date, label: e.title, amount: e.amount * (e.id.startsWith('recurring:') && e.amount < 0 ? 1 + (input.recurringFactor || 0) : 1), kind: e.kind }));
  events.push(...claimEvents(claims, world, input.claimTiming).filter(e => e.date < end));
  if (input.expenseDelta) events.push({ date: world.asOf, label: 'Pengeluaran tak terduga', amount: -input.expenseDelta, kind: 'what-if' });
  if (input.largePurchase?.amount) events.push({ date: input.largePurchase.date && input.largePurchase.date >= world.asOf ? input.largePurchase.date : world.asOf, label: input.largePurchase.label || 'Pembelian besar', amount: -input.largePurchase.amount, kind: 'what-if' });
  if (input.extraDebtPayment) events.push({ date: world.asOf, label: 'Bayar utang lebih', amount: -input.extraDebtPayment, kind: 'debt' });
  const points: PathPoint[] = [];
  let balance = world.liquidity.free - world.liquidity.buffer;
  for (let d = world.asOf; d < end; d = addDays(d, 1)) {
    const today = events.filter(e => e.date === d);
    balance += sum(today.map(e => e.amount)) - pace;
    points.push({ date: d, balance, events: today });
  }
  if (!points.length) points.push({ date: world.asOf, balance, events: [] });
  const low = points.reduce((m, p) => p.balance < m.balance ? p : m, points[0]);
  const lowIndex = points.indexOf(low);
  const near = points.slice(Math.max(0, lowIndex - 4), lowIndex + 1).flatMap(p => p.events).filter(e => e.amount < 0);
  const salary = (input.regularOnly ? world.income.regularTypical : world.income.salary || world.income.regularTypical) * (input.incomeFactor ?? 1) + (input.incomeDelta || 0);
  const beforePayday = points[points.length - 1].balance;
  // What a cycle usually leaves for goals: typical income − typical spending, after this scenario's changes.
  const typicalSpend = quantile(world.historicalCycles.map(c => c.expense), .5);
  const goalCapacity = salary - typicalSpend * factor - (input.goalContributionChange || 0);
  return {
    input, points, lowest: { date: low.date, balance: low.balance, events: near },
    beforePayday, afterSalary: beforePayday + salary - (input.goalContributionChange || 0),
    roomPerDay: Math.max(0, low.balance) / Math.max(1, points.length),
    reservedNeeded: Math.max(0, -low.balance),
    goalCapacity, debtAfter: Math.max(0, world.obligations.debtOutstanding - (input.extraDebtPayment || 0)),
  };
}

/** Bills and plans close together: at least 2 outflows within 4 days, together material. */
export function obligationClusters(world: FinancialWorld) {
  const outs = world.obligations.upcoming.filter(e => e.amount < 0 && !e.id.startsWith('salary:') && Math.abs(e.amount) >= 50_000).sort((a, b) => a.date.localeCompare(b.date));
  const clusters: { from: string; to: string; total: number; items: UpcomingEvent[] }[] = [];
  for (let i = 0; i < outs.length; i++) {
    const group = outs.filter(e => e.date >= outs[i].date && daysBetween(outs[i].date, e.date) <= 4);
    const total = -sum(group.map(e => e.amount));
    if (group.length >= 2 && (total >= 500_000 || total >= Math.max(1, world.liquidity.available) * .2) && !clusters.some(c => c.items.some(x => x.id === group[0].id))) clusters.push({ from: group[0].date, to: group[group.length - 1].date, total, items: group });
  }
  return clusters;
}

/** "What if" stress tests: never predictions. */
export const stressTests: ScenarioInput[] = [
  { id: 'income-20', label: 'Gaji berikutnya −20%', incomeFactor: .8 },
  { id: 'claim-delayed', label: 'Klaim belum cair sampai gajian', claimTiming: 'delayed' },
  { id: 'unexpected-1m', label: 'Pengeluaran tak terduga Rp1 jt', expenseDelta: 1_000_000 },
  { id: 'recurring-high', label: 'Tagihan rutin 50% lebih besar', recurringFactor: .5 },
  { id: 'no-extra', label: 'Tanpa lembur/bonus', regularOnly: true },
];
