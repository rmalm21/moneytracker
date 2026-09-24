/** Savings target with a deadline: how much to set aside and whether the current plan is on time. */
import { parseDate } from './period.ts';
import type { Fund } from './types';

export type SavingsStatus = 'reached' | 'on_track' | 'behind' | 'overdue' | 'no_deadline' | 'no_plan';
const monthsBetween = (from: Date, to: Date) => (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + (to.getDate() >= from.getDate() ? 0 : -1);
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function savingsPlan(fund: Pick<Fund, 'targetAmount' | 'currentAmount' | 'monthlyContribution' | 'targetDate'>, today: string) {
  const remaining = Math.max(0, fund.targetAmount - fund.currentAmount);
  const now = parseDate(today);
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(fund.targetDate || '') ? parseDate(fund.targetDate) : null;
  const daysLeft = deadline ? Math.round((deadline.getTime() - now.getTime()) / 86400000) : null;
  // Count the current month as one to save in, so a deadline next month still leaves one deposit.
  const monthsLeft = deadline ? Math.max(1, monthsBetween(now, deadline) + 1) : null;
  const weeksLeft = daysLeft !== null ? Math.max(1, Math.ceil(daysLeft / 7)) : null;
  const perMonth = monthsLeft ? Math.ceil(remaining / monthsLeft) : 0;
  const perWeek = weeksLeft ? Math.ceil(remaining / weeksLeft) : 0;
  const plan = fund.monthlyContribution || 0;
  const monthsWithPlan = plan > 0 ? Math.ceil(remaining / plan) : null;
  let finish: string | null = null;
  if (monthsWithPlan !== null) { const date = new Date(now); date.setMonth(date.getMonth() + monthsWithPlan); finish = iso(date); }
  const status: SavingsStatus = remaining === 0 ? 'reached' : deadline && daysLeft! < 0 ? 'overdue' : !deadline ? (plan ? 'no_deadline' : 'no_plan') : plan >= perMonth ? 'on_track' : 'behind';
  const lateMonths = deadline && finish ? Math.max(0, monthsBetween(deadline, parseDate(finish))) : 0;
  return { remaining, daysLeft, monthsLeft, perMonth, perWeek, finish, status, lateMonths, progress: fund.targetAmount ? Math.min(100, fund.currentAmount / fund.targetAmount * 100) : 0 };
}
export const savingsStatusText: Record<SavingsStatus, [string, string]> = {
  reached: ['Tercapai', 'good'], on_track: ['Sesuai jadwal', 'good'], behind: ['Kurang setoran', 'warn'], overdue: ['Lewat tenggat', 'bad'], no_deadline: ['Tanpa tenggat', 'muted'], no_plan: ['Belum ada rencana', 'muted'],
};
