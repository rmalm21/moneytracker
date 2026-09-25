/** Cash-flow projection shared by the Proyeksi page and the dashboard card. */
export type ForecastInput = {
  free: number; spentThisCycle: number; daysElapsed: number; daysRemaining: number; daysTotal: number;
  salary: number; totalBudget: number; overtime?: number; extra?: number; claim?: number; debtDue?: number;
  /** Average daily spending of the previous cycle, used while this cycle is still too young to judge. */
  baselineDaily?: number;
  /** Spending pattern change in percent, e.g. -10 = 10% more frugal. */
  spendAdjust?: number;
};
export type ForecastStatus = 'aman' | 'tipis' | 'minus';

export function forecast(input: ForecastInput) {
  const { free, spentThisCycle, daysElapsed, daysRemaining, daysTotal, salary, totalBudget } = input;
  const overtime = input.overtime || 0, extra = input.extra || 0, claim = input.claim || 0, debtDue = input.debtDue || 0;
  const factor = 1 + (input.spendAdjust || 0) / 100;
  const currentDaily = spentThisCycle / Math.max(1, daysElapsed);
  const useBaseline = daysElapsed < 7 && (input.baselineDaily || 0) > 0;
  const daily = Math.max(0, (useBaseline ? input.baselineDaily! : currentDaily) * factor);
  const untilPayday = Math.round(daily * daysRemaining);
  const before = free - untilPayday - extra + claim - debtDue;
  const income = salary + overtime;
  const after = before + income;
  // Monthly spending: the budget or the spending pace for a full cycle, whichever is larger
  // (budgets often cover only some categories).
  const monthlyOut = Math.round(Math.max(totalBudget * factor, daily * daysTotal));
  const monthlyNet = income - monthlyOut;
  const months = Array.from({ length: 6 }, (_, index) => after + index * monthlyNet);
  const status: ForecastStatus = before < 0 ? 'minus' : before < daily * 7 ? 'tipis' : 'aman';
  return { daily, dailySource: useBaseline ? 'baseline' as const : 'current' as const, untilPayday, before, after, income, monthlyOut, monthlyNet, months, status, extra, claim, debtDue, overtime };
}
export const statusText: Record<ForecastStatus, [string, string]> = {
  aman: ['Aman', 'Uang bebas cukup sampai gajian.'],
  tipis: ['Tipis', 'Sisa sebelum gajian kurang dari seminggu belanja.'],
  minus: ['Minus', 'Dengan pola ini uang bebas habis sebelum gajian.'],
};
