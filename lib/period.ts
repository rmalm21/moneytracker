import type { LedgerTx, TimeZone } from './types';
import { salaryCycle, transactionExpense, transactionIncome } from './accounting.ts';

export type PeriodPreset = 'salary_cycle' | 'calendar_month' | 'last_7_days' | 'last_30_days' | 'last_3_months' | 'year_to_date' | 'custom';
export type Granularity = 'auto' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type DateRange = { start: string; end: string };
export const periodOptions: { value: PeriodPreset; label: string }[] = [
  { value: 'salary_cycle', label: 'Siklus gaji' }, { value: 'calendar_month', label: 'Bulan ini' },
  { value: 'last_7_days', label: '7 hari terakhir' }, { value: 'last_30_days', label: '30 hari terakhir' },
  { value: 'last_3_months', label: '3 bulan terakhir' }, { value: 'year_to_date', label: 'Tahun ini' },
  { value: 'custom', label: 'Pilih tanggal sendiri' },
];
export const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function dateInTimeZone(now = new Date(), timeZone: TimeZone = 'Asia/Jakarta') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(part => [part.type, Number(part.value)]));
  return new Date(parts.year, parts.month - 1, parts.day, 12);
}
export const todayInTimeZone = (timeZone: TimeZone = 'Asia/Jakarta') => localDate(dateInTimeZone(new Date(), timeZone));
export const timeInTimeZone = (timeZone: TimeZone = 'Asia/Jakarta') => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
export const parseDate = (date: string) => new Date(`${date}T12:00:00`);
export const nextDate = (date: string) => { const day = parseDate(date); day.setDate(day.getDate() + 1); return localDate(day); };
export const previousDate = (date: string) => { const day = parseDate(date); day.setDate(day.getDate() - 1); return localDate(day); };
const utcDay = (value: string) => { const [year, month, day] = value.split('-').map(Number); return Date.UTC(year, month - 1, day); };
export const daysInRange = ({ start, end }: DateRange) => Math.max(1, Math.round((utcDay(end) - utcDay(start)) / 86400000));

export function resolvePeriodRange(preset: PeriodPreset, salaryDay: number, today = dateInTimeZone(), custom?: DateRange): DateRange {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const tomorrow = new Date(date); tomorrow.setDate(date.getDate() + 1);
  if (preset === 'salary_cycle') { const { start, end } = salaryCycle(date, salaryDay); return { start, end }; }
  if (preset === 'calendar_month') return { start: localDate(new Date(date.getFullYear(), date.getMonth(), 1)), end: localDate(new Date(date.getFullYear(), date.getMonth() + 1, 1)) };
  if (preset === 'year_to_date') return { start: `${date.getFullYear()}-01-01`, end: localDate(tomorrow) };
  if (preset === 'custom' && custom?.start && custom?.end && custom.start < custom.end) return custom;
  if (preset === 'last_3_months') { const start = new Date(date); start.setDate(1); start.setMonth(start.getMonth() - 2); return { start: localDate(start), end: localDate(tomorrow) }; }
  const start = new Date(date); start.setDate(start.getDate() - (preset === 'last_7_days' ? 6 : 29));
  return { start: localDate(start), end: localDate(tomorrow) };
}

/** Human date for lists, e.g. "24 Sep 2026". Invalid or empty values are returned unchanged. */
export const formatDate = (date: string, withYear = true) => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? parseDate(date).toLocaleDateString('id-ID', withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }) : date;
export const periodLabel = (range: DateRange) => `${parseDate(range.start).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} – ${parseDate(previousDate(range.end)).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
export const automaticGranularity = (range: DateRange): Exclude<Granularity, 'auto'> => { const days = daysInRange(range); return days <= 45 ? 'daily' : days <= 125 ? 'weekly' : days <= 730 ? 'monthly' : 'yearly'; };

export function summarizeTransactions(items: LedgerTx[]) {
  const income = items.reduce((sum, item) => sum + transactionIncome(item), 0);
  const expense = items.reduce((sum,item)=>sum+transactionExpense(item),0);
  return { income, expense, cashFlow: income - expense };
}
function groupStart(date: string, granularity: Exclude<Granularity, 'auto'>) {
  const day = parseDate(date);
  if (granularity === 'weekly') day.setDate(day.getDate() - (day.getDay() + 6) % 7);
  if (granularity === 'monthly') day.setDate(1);
  if (granularity === 'yearly') { day.setMonth(0); day.setDate(1); }
  return localDate(day);
}
function advance(date: string, granularity: Exclude<Granularity, 'auto'>) {
  const day = parseDate(date);
  if (granularity === 'daily') day.setDate(day.getDate() + 1);
  if (granularity === 'weekly') day.setDate(day.getDate() + 7);
  if (granularity === 'monthly') day.setMonth(day.getMonth() + 1);
  if (granularity === 'yearly') day.setFullYear(day.getFullYear() + 1);
  return localDate(day);
}
export function groupTransactions(items: LedgerTx[], range: DateRange, requested: Granularity) {
  const granularity = requested === 'auto' ? automaticGranularity(range) : requested;
  const grouped = new Map<string, ReturnType<typeof summarizeTransactions>>();
  for (let date = groupStart(range.start, granularity); date < range.end; date = advance(date, granularity)) grouped.set(date, { income: 0, expense: 0, cashFlow: 0 });
  for (const item of items) {
    if (item.date < range.start || item.date >= range.end) continue;
    const key = groupStart(item.date, granularity);
    const row = grouped.get(key); if (!row) continue;
    row.income += transactionIncome(item);
    row.expense += transactionExpense(item);
    row.cashFlow = row.income - row.expense;
  }
  return [...grouped].map(([date, values]) => ({ date, label: granularity === 'yearly' ? date.slice(0, 4) : granularity === 'monthly' ? parseDate(date).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }) : parseDate(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }), ...values }));
}

const shiftDays = (date: string, days: number) => { const day = parseDate(date); day.setDate(day.getDate() + days); return localDate(day); };
const daysBetween = (from: string, to: string) => Math.round((utcDay(to) - utcDay(from)) / 86400000);
/**
 * The previous period (PP) of the same kind. While the current period is still running, PP is cut to the same
 * number of days so "day 10 of this cycle" is compared with "day 10 of the last cycle".
 */
export function previousComparableRange(preset: PeriodPreset, salaryDay: number, range: DateRange, today: string): DateRange & { partial: boolean; days: number } {
  let previous: DateRange;
  if (preset === 'salary_cycle' || preset === 'calendar_month') previous = resolvePeriodRange(preset, salaryDay, parseDate(previousDate(range.start)));
  else if (preset === 'year_to_date') { const year = Number(range.start.slice(0, 4)) - 1; previous = { start: `${year}-01-01`, end: `${year + 1}-01-01` }; }
  else { const length = daysBetween(range.start, range.end); previous = { start: shiftDays(range.start, -length), end: range.start }; }
  const running = today >= range.start && today < range.end;
  const days = Math.max(1, running ? daysBetween(range.start, nextDate(today)) : daysBetween(range.start, range.end));
  const cut = shiftDays(previous.start, days);
  return { start: previous.start, end: running && cut < previous.end ? cut : previous.end, partial: running, days };
}
/** Percentage change, or null when there is nothing to compare with. */
export function percentChange(current: number, previous: number) { if (!previous) return current ? null : 0; return Math.round((current - previous) / Math.abs(previous) * 100); }
