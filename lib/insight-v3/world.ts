/**
 * Insight V3 — FinancialWorld: one normalized, read-only reading of the user's finances.
 *
 * Derived every time from the canonical engines, never stored and never a second ledger:
 *   accounting.metrics (Uang bebas, disimpan, aset, utang, sisa anggaran), finance-control (committedAmount,
 *   availableMoney → Uang tersedia, safeDaily → Jatah Aman, upcomingEvents → dated bills/claims/salary),
 *   forecast (spending pace and the money before payday), savings.savingsPlan (goals), wallet-interest records,
 *   and the Insight V2.5 context (cycles, baselines, data quality).
 * If a number exists in one of those, the world takes it from there; it never recalculates it another way.
 */
import { metrics, transactionExpense, transactionIncome } from '../accounting.ts';
import type { AdvisorInput } from '../advisor.ts';
import { availableMoney, committedAmount, safeDaily, upcomingEvents, type UpcomingEvent } from '../finance-control.ts';
import { forecast } from '../forecast.ts';
import { isKantong } from '../pockets.ts';
import { savingsPlan } from '../savings.ts';
import type { Profile } from '../types';
import { sum } from '../insight-v25/baseline.ts';
import { addDays, daysBetween, inRange, parse, type InsightContext } from '../insight-v25/context.ts';

/** Income that is not regular pay: by category / description words. A claim payout is reimbursement, never income. */
const IRREGULAR = /(lembur|overtime|bonus|thr|insentif|komisi|freelance|proyek|project|sampingan|side|jual|hadiah|cashback|bunga)/i;

export type CycleRow = { start: string; end: string; label: string; income: number; regular: number; irregular: number; expense: number; surplus: number };
export type FinancialWorld = {
  asOf: string;
  currentCycle: { start: string; end: string; elapsed: number; total: number; daysLeft: number; income: number; expense: number };
  historicalCycles: CycleRow[];
  income: { typical: number; regularTypical: number; irregularShare: number; floor: number; salary: number };
  liquidity: { free: number; committed: number; buffer: number; available: number; safeDaily: number; reserved: number; beforePayday: number; dailyPace: number };
  spending: { cycleSoFar: number; dailyPace: number };
  obligations: { debtOutstanding: number; claimsOutstanding: number; receivablesOutstanding: number; upcoming: UpcomingEvent[] };
  targets: { id: string; name: string; target: number; current: number; perMonth: number; monthsLeft: number | null; status: string; emergency: boolean }[];
  wealth: { assets: number; netWorth: number; invested: number; interest: { gross: number; tax: number; net: number; days: number; trend: number[] } };
  dataQuality: { category: number; merchant: number; time: number; receipt: number; spendingCount: number };
  profile: Pick<Profile, 'monthlySalary' | 'salaryCycleStartDay' | 'salaryIncomeCategoryId'>;
};

export function buildWorld(input: AdvisorInput, ctx: InsightContext, profile: Partial<Profile> = {}): FinancialWorld {
  const { data, history, today, salaryDay } = input;
  const cur = ctx.current;
  const stat = metrics(data, cur.start, cur.end, salaryDay, parse(today));
  const settings = { excludeCommittedFromAvailable: profile.excludeCommittedFromAvailable, commitmentHorizon: profile.commitmentHorizon, freeMoneyBuffer: input.safetyBuffer ?? profile.freeMoneyBuffer };
  const committed = input.committed ?? committedAmount(data, today, cur.end, settings);
  const fullProfile = { monthlySalary: input.monthlySalary, salaryCycleStartDay: salaryDay, salaryIncomeCategoryId: profile.salaryIncomeCategoryId } as Profile;
  // The running cycle's spending pace without bills and plans (they come as dated events instead, never twice).
  const scheduled = (tx: typeof history[number]) => Boolean(tx.recurringTransactionId || tx.plannedId || tx.draftId);
  const discretionary = sum(cur.items.filter(tx => !scheduled(tx)).map(transactionExpense));
  const lastCycle = ctx.baseline[ctx.baseline.length - 1];
  const baselineDaily = lastCycle ? sum(lastCycle.items.filter(tx => !scheduled(tx)).map(transactionExpense)) / Math.max(1, daysBetween(lastCycle.start, lastCycle.end)) : 0;
  const fc = forecast({ free: stat.free, spentThisCycle: discretionary, daysElapsed: cur.elapsed, daysRemaining: cur.daysLeft, daysTotal: cur.total, salary: input.monthlySalary, totalBudget: stat.totalBudget, baselineDaily });
  const salaryCategory = profile.salaryIncomeCategoryId;
  const isIrregular = (tx: typeof history[number]) => tx.type === 'income' && !(salaryCategory && tx.categoryId === salaryCategory) && IRREGULAR.test(`${data.categories.find(c => c.id === tx.categoryId)?.name || ''} ${tx.description} ${tx.merchant}`);
  const historicalCycles: CycleRow[] = ctx.baseline.map(c => {
    const income = c.income, irregular = sum(c.items.filter(isIrregular).map(transactionIncome));
    return { start: c.start, end: c.end, label: c.label, income, irregular, regular: income - irregular, expense: c.expense, surplus: income - c.expense };
  });
  const sorted = (v: number[]) => [...v].sort((a, b) => a - b), median = (v: number[]) => v.length ? sorted(v)[Math.floor((v.length - 1) / 2)] : 0;
  const totalIncome = sum(historicalCycles.map(c => c.income)), irregularIncome = sum(historicalCycles.map(c => c.irregular));
  const regularTypical = median(historicalCycles.map(c => c.regular)) || input.monthlySalary;
  const lowest = historicalCycles.length >= 3 ? sorted(historicalCycles.map(c => c.regular))[0] : regularTypical;
  const events = upcomingEvents(data, fullProfile, { start: today, end: addDays(cur.end, 1) });
  const interestTx = history.filter(tx => tx.interest?.source === 'wallet_interest');
  const recentInterest = interestTx.filter(tx => tx.date >= addDays(today, -30));
  const spend = cur.lines.filter(l => l.tx.type === 'expense'), spendTx = [...new Map(spend.map(l => [l.tx.id, l.tx])).values()];
  const share = (pick: (tx: typeof spendTx[number]) => boolean) => spendTx.length ? spendTx.filter(pick).length / spendTx.length : 1;
  return {
    asOf: today,
    currentCycle: { start: cur.start, end: cur.end, elapsed: cur.elapsed, total: cur.total, daysLeft: cur.daysLeft, income: cur.income, expense: cur.expense },
    historicalCycles,
    income: { typical: median(historicalCycles.map(c => c.income)) || input.monthlySalary, regularTypical, irregularShare: totalIncome ? irregularIncome / totalIncome : 0, floor: Math.min(regularTypical, lowest || regularTypical), salary: input.monthlySalary },
    liquidity: { free: stat.free, committed, buffer: Math.max(0, settings.freeMoneyBuffer || 0), available: availableMoney(stat.free, committed, settings), safeDaily: safeDaily(stat.discretionaryRemaining, cur.daysLeft), reserved: stat.reserved, beforePayday: fc.before, dailyPace: fc.daily },
    spending: { cycleSoFar: cur.expense, dailyPace: fc.daily },
    obligations: {
      debtOutstanding: stat.liabilities,
      claimsOutstanding: sum(data.claims.filter(c => c.status !== 'rejected' && c.status !== 'paid').map(c => Math.max(0, c.remainingAmount))),
      receivablesOutstanding: sum(data.receivables.map(r => Math.max(0, r.remainingAmount))),
      upcoming: events,
    },
    targets: data.funds.filter(f => !f.isArchived && f.targetAmount > 0).map(f => {
      const current = isKantong(f) ? sum((f.walletIds || []).map(id => data.wallets.find(w => w.id === id)?.cachedBalance || 0)) : f.currentAmount;
      const plan = savingsPlan({ ...f, currentAmount: Math.max(0, current) }, today);
      return { id: f.id, name: f.name, target: f.targetAmount, current: Math.max(0, current), perMonth: plan.perMonth || f.monthlyContribution || 0, monthsLeft: plan.monthsLeft, status: plan.status, emergency: f.kind === 'emergency' };
    }),
    wealth: {
      assets: stat.assets, netWorth: stat.netWorth, invested: sum(data.wallets.filter(w => !w.isArchived && (w.group === 'investment' || w.type === 'investment')).map(w => Math.max(0, w.cachedBalance))),
      interest: { gross: sum(recentInterest.map(tx => tx.interest!.grossMicro)) / 1e6, tax: sum(recentInterest.map(tx => tx.interest!.taxMicro)) / 1e6, net: sum(recentInterest.map(tx => tx.amount)), days: 30, trend: [...ctx.baseline.map(c => sum(interestTx.filter(tx => inRange(tx.date, c)).map(tx => tx.amount))), sum(interestTx.filter(tx => inRange(tx.date, cur)).map(tx => tx.amount))] },
    },
    dataQuality: { category: 1 - ctx.quality.uncategorizedCurrent, merchant: share(tx => Boolean(tx.merchant?.trim())), time: share(tx => /^\d{2}:\d{2}/.test(tx.time || '')), receipt: share(tx => Boolean(tx.receipt?.items?.length)), spendingCount: spendTx.length },
    profile: fullProfile,
  };
}
