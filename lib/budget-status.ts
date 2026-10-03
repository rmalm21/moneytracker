/** Budgets that need attention (almost used up or over), shared by Beranda's "Perlu perhatian" and the budget-alerts card. */
import { budgetCurrent } from './accounting.ts';
import { budgetCommitted } from './finance-control.ts';
import type { Budget, Data } from './types.ts';

export type BudgetStatus = { b: Budget; used: number; left: number; over: boolean; warn: boolean };
export function budgetStatuses(data: Data, day: Date, salaryDay: number, defaultWarn = 80): BudgetStatus[] {
  return data.budgets.filter(b => b.active && b.classification !== 'savings' && b.classification !== 'sinking').map(b => {
    const s = budgetCurrent(b, data.transactions, data.categories, day, salaryDay), committed = budgetCommitted(b, data, day, salaryDay);
    const used = (s.spent + committed) / Math.max(1, s.available), warn = (b.warningPercent || defaultWarn) / 100;
    return { b, used, left: s.remaining - committed, over: s.spent > s.available || s.remaining - committed < 0, warn: used >= warn };
  });
}
