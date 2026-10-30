/**
 * 8.3 chat v3: the expected answers, computed from the bench account (bench/v83/state.mjs) without the chat engine.
 * Periods and sums are written out here; only the app's own definitions are borrowed (Uang bebas = Beranda's
 * `metrics`, sisa anggaran = `budgetCurrent`, skor kesehatan = Insight's `analyzeFinances`), since those numbers
 * are what the app shows elsewhere and the chat has to agree with them.
 */
import { v3Ctx, data, transactions } from './state.mjs';
import { budgetCurrent, metrics } from '../../lib/accounting.ts';
import { analyzeFinances } from '../../lib/advisor.ts';
import { committedAmount } from '../../lib/finance-control.ts';

export const TODAY = v3Ctx.today, CYCLE = v3Ctx.cycle;
export const PERIODS = {
  'bulan ini': ['2026-10-01', '2026-11-01'], 'bulan lalu': ['2026-09-01', '2026-10-01'], 'bulan kemarin': ['2026-09-01', '2026-10-01'],
  'minggu ini': ['2026-10-12', '2026-10-19'], 'minggu lalu': ['2026-10-05', '2026-10-12'], 'minggu kemarin': ['2026-10-05', '2026-10-12'],
  'hari ini': ['2026-10-15', '2026-10-16'], kemarin: ['2026-10-14', '2026-10-15'], agustus: ['2026-08-01', '2026-09-01'],
  september: ['2026-09-01', '2026-10-01'], oktober: ['2026-10-01', '2026-11-01'], 'siklus ini': [CYCLE.start, CYCLE.end],
};
// English and regional period words (the questions may say them; the sums are the same).
PERIODS['this month'] = PERIODS['bulan ini']; PERIODS['last month'] = PERIODS['bulan lalu']; PERIODS['this week'] = PERIODS['minggu ini']; PERIODS['last week'] = PERIODS['minggu lalu'];
PERIODS['sasi iki'] = PERIODS['bulan ini']; PERIODS['bulan ieu'] = PERIODS['bulan ini'];
export const day = iso => [iso, new Date(new Date(`${iso}T12:00:00Z`).getTime() + 864e5).toISOString().slice(0, 10)];

const expenses = transactions.filter(t => t.type === 'expense');
const inside = (t, [start, end]) => t.date >= start && t.date < end;
export const catOf = id => data.categories.find(c => c.id === id);
export const inCategory = (t, id) => t.categoryId === id || t.subcategoryId === id;
export const spend = (period, keep = () => true) => expenses.filter(t => inside(t, period) && keep(t)).reduce((n, t) => n + t.amount, 0);
export const count = (period, keep = () => true) => expenses.filter(t => inside(t, period) && keep(t)).length;
export const income = period => transactions.filter(t => t.type === 'income' && inside(t, period)).reduce((n, t) => n + t.amount, 0);
export const byMerchant = name => t => (t.merchant || '').toLowerCase().includes(name.toLowerCase());
/** Spending per top-level category in a period, biggest first. */
export function parents(period) {
  const out = new Map();
  for (const t of expenses) if (inside(t, period)) out.set(t.categoryId, (out.get(t.categoryId) || 0) + t.amount);
  return [...out].map(([id, amount]) => ({ id, name: catOf(id).name, amount })).sort((a, b) => b.amount - a.amount);
}

const asOf = new Date(`${TODAY}T12:00:00`);
const m = metrics(data, CYCLE.start, CYCLE.end, v3Ctx.salaryDay, asOf);
const daysLeft = Math.max(1, Math.round((Date.parse(`${CYCLE.end}T00:00:00Z`) - Date.parse(`${TODAY}T00:00:00Z`)) / 864e5));
export const FREE = m.free, DAILY = Math.round(m.free / daysLeft), DAYS_LEFT = daysLeft;
export const BALANCE = Object.fromEntries(data.wallets.map(w => [w.id, w.cachedBalance]));
export const TOTAL_BALANCE = data.wallets.reduce((n, w) => n + w.cachedBalance, 0);
export const budgetLeft = name => { const b = data.budgets.find(x => x.name === name); return budgetCurrent(b, transactions, data.categories, asOf, v3Ctx.salaryDay).remaining; };
const stat = { free: m.free, reserved: m.reserved, netWorth: m.netWorth, liabilities: m.liabilities };
export const SCORE = analyzeFinances({ data, history: transactions, today: TODAY, salaryDay: v3Ctx.salaryDay, monthlySalary: 0, warnPercent: 80, stat, committed: committedAmount(data, TODAY, CYCLE.end, {}), profile: null }).score;

/** A regex source for an amount as the chat may write it: "Rp4.200.000", "Rp 4.200.000" or "Rp4,2 jt" / "Rp45 rb". */
export function money(n) {
  const v = Math.round(n), full = `Rp\\s?${v.toLocaleString('id-ID').replace(/\./g, '\\.')}`, alts = [full];
  if (v >= 1e6) alts.push(`Rp\\s?${(v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }).replace(/\./g, '\\.')}\\s?(?:jt|juta)`);
  else if (v >= 1e3) alts.push(`Rp\\s?${(v / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 1 }).replace(/\./g, '\\.')}\\s?(?:rb|ribu)`);
  return `(?:${alts.join('|')})(?![\\d.,]\\d)`;
}
export { data, transactions, v3Ctx };
