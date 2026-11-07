/**
 * 8.5 "Rekap" — a month or a year of the person's own records, told like a short story: what came in and went out,
 * where it went, the favourite place, the biggest day, the recording streak, and how it compares with the period
 * before. Everything is worked out on the device from the ledger; nothing is uploaded.
 */
import { transactionExpense, transactionIncome } from './accounting.ts';
import { categoryBreakdown } from './category-analytics.ts';
import type { Category, LedgerTx } from './types';

export type WrappedPeriod = { kind: 'month' | 'year'; start: string; end: string; label: string };
export type Wrapped = {
  period: WrappedPeriod;
  income: number; expense: number; saved: number; savedRate: number;
  count: number; days: number; recordedDays: number; longestStreak: number; perDay: number;
  top: { name: string; icon?: string; amount: number; share: number }[];
  place?: { name: string; count: number; amount: number };
  biggestDay?: { date: string; amount: number; count: number };
  biggest?: { name: string; date: string; amount: number };
  /** Spending against the period before (null when there is nothing to compare with). */
  change: number | null;
  /** Most spending by day of the week ("Sabtu"). */
  weekday?: { name: string; share: number };
};

const pad = (n: number) => String(n).padStart(2, '0');
const dayMs = 864e5;
const dayNo = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / dayMs);
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** A calendar month (`2026-10`) or year (`2026`) as a period; the end is the day after its last day. */
export function periodOf(key: string): WrappedPeriod {
  if (/^\d{4}$/.test(key)) return { kind: 'year', start: `${key}-01-01`, end: `${Number(key) + 1}-01-01`, label: key };
  const [y, m] = key.split('-').map(Number), next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return { kind: 'month', start: `${y}-${pad(m)}-01`, end: next, label: `${MONTHS[m - 1]} ${y}` };
}
/** The period just before (the month or year before). */
export function previousOf(p: WrappedPeriod): WrappedPeriod {
  const y = Number(p.start.slice(0, 4)), m = Number(p.start.slice(5, 7));
  return p.kind === 'year' ? periodOf(String(y - 1)) : periodOf(m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`);
}
/** The periods to offer: the last 12 months (newest first, the current one included) and the last two years. */
export function periodChoices(today: string): WrappedPeriod[] {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)), out: WrappedPeriod[] = [];
  for (let i = 0; i < 12; i++) { const mm = ((m - 1 - i) % 12 + 12) % 12 + 1, yy = y - (m - 1 - i < 0 ? Math.ceil((i - m + 1) / 12) : 0); out.push(periodOf(`${yy}-${pad(mm)}`)); }
  out.push(periodOf(String(y)), periodOf(String(y - 1)));
  return out;
}
/** The recap offered first: last month in the first week of a month, else this month. */
export function defaultPeriod(today: string): WrappedPeriod {
  const p = periodOf(today.slice(0, 7));
  return Number(today.slice(8, 10)) <= 7 ? previousOf(p) : p;
}

const placeKey = (t: LedgerTx) => (t.merchant || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function buildWrapped(items: LedgerTx[], previous: LedgerTx[], categories: Category[], period: WrappedPeriod, today: string): Wrapped {
  const inPeriod = items.filter(t => t.date >= period.start && t.date < period.end);
  const income = inPeriod.reduce((n, t) => n + transactionIncome(t), 0), expense = inPeriod.reduce((n, t) => n + transactionExpense(t), 0);
  const saved = income - expense;
  // Days counted up to today for a running period.
  const last = period.end <= today ? period.end : String(today) > period.start ? new Date((dayNo(today) + 1) * dayMs).toISOString().slice(0, 10) : period.start;
  const days = Math.max(1, dayNo(last) - dayNo(period.start));
  const recorded = [...new Set(inPeriod.filter(t => !t.id.startsWith('wint_') && !t.recurringTransactionId).map(t => t.date))].sort();
  let longestStreak = 0, run = 0, prev = -2;
  for (const d of recorded) { const n = dayNo(d); run = n === prev + 1 ? run + 1 : 1; prev = n; longestStreak = Math.max(longestStreak, run); }
  const slices = categoryBreakdown(inPeriod, categories).filter(s => s.amount > 0).sort((a, b) => b.amount - a.amount);
  const top = slices.slice(0, 3).map(s => ({ name: s.name, icon: s.icon, amount: s.amount, share: expense ? s.amount / expense : 0 }));
  const spends = inPeriod.map(t => ({ t, amount: transactionExpense(t) })).filter(x => x.amount > 0);
  const places = new Map<string, { name: string; count: number; amount: number }>();
  for (const { t, amount } of spends) { const k = placeKey(t); if (!k) continue; const p = places.get(k) || { name: t.merchant.trim(), count: 0, amount: 0 }; p.count++; p.amount += amount; places.set(k, p); }
  const place = [...places.values()].sort((a, b) => b.count - a.count || b.amount - a.amount)[0];
  const byDay = new Map<string, { amount: number; count: number }>();
  for (const { t, amount } of spends) { const d = byDay.get(t.date) || { amount: 0, count: 0 }; d.amount += amount; d.count++; byDay.set(t.date, d); }
  const bigDay = [...byDay.entries()].sort((a, b) => b[1].amount - a[1].amount)[0];
  const big = spends.sort((a, b) => b.amount - a.amount)[0];
  const weekdays = Array(7).fill(0) as number[];
  for (const { t, amount } of spends) weekdays[new Date(`${t.date}T12:00:00Z`).getUTCDay()] += amount;
  const topDay = weekdays.indexOf(Math.max(...weekdays));
  const prevExpense = previous.reduce((n, t) => n + transactionExpense(t), 0);
  return {
    period, income, expense, saved, savedRate: income > 0 ? saved / income : 0,
    count: inPeriod.length, days, recordedDays: recorded.length, longestStreak, perDay: Math.round(expense / days), top,
    ...(place && place.count >= 2 ? { place } : {}),
    ...(bigDay ? { biggestDay: { date: bigDay[0], ...bigDay[1] } } : {}),
    ...(big ? { biggest: { name: big.t.description || big.t.merchant || 'Transaksi', date: big.t.date, amount: big.amount } } : {}),
    change: prevExpense > 0 && expense > 0 ? (expense - prevExpense) / prevExpense : null,
    ...(expense > 0 ? { weekday: { name: DAYS[topDay], share: weekdays[topDay] / expense } } : {}),
  };
}
