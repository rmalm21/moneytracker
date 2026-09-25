/** Everything behind the budget detail sheet: pace, projection and breakdowns within one budget period. */
import { transactionExpense } from './accounting.ts';
import { categoryBreakdown, transactionsForCategory } from './category-analytics.ts';
import { parseDate } from './period.ts';
import type { Budget, Category, LedgerTx } from './types';

const dayIndex = (start: string, date: string) => Math.round((parseDate(date).getTime() - parseDate(start).getTime()) / 86400000);
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function budgetDetail(budget: Budget, txs: LedgerTx[], categories: Category[], window: { start: string; end: string }, today: string, available: number) {
  const inWindow = txs.filter(t => t.date >= window.start && t.date < window.end);
  const items = transactionsForCategory(inWindow, categories, budget.subcategoryId || budget.categoryId).filter(t => transactionExpense(t) > 0).sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
  const spent = items.reduce((n, t) => n + transactionExpense(t), 0);
  const totalDays = Math.max(1, dayIndex(window.start, window.end));
  const elapsed = Math.min(totalDays, Math.max(1, dayIndex(window.start, today) + 1));
  const daysLeft = Math.max(0, totalDays - elapsed + (today < window.end ? 1 : 0));
  const dailyAvg = spent / elapsed, ideal = available / totalDays;
  const projected = Math.round(dailyAvg * totalDays);
  // Running total per day next to the even-spread line that would end exactly at the limit.
  const perDay = new Array(totalDays).fill(0);
  for (const t of items) { const i = dayIndex(window.start, t.date); if (i >= 0 && i < totalDays) perDay[i] += transactionExpense(t); }
  let sum = 0;
  const pace = perDay.map((value, i) => { sum += value; const day = new Date(parseDate(window.start)); day.setDate(day.getDate() + i); return { day: `${day.getDate()}`, date: iso(day), spent: i < elapsed ? sum : null, ideal: Math.round(ideal * (i + 1)) }; });
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const short = (d: Date) => `${d.getDate()} ${months[d.getMonth()]}`;
  const weeks: { label: string; amount: number; current: boolean; future: boolean }[] = [];
  for (let i = 0; i < totalDays; i += 7) {
    const from = new Date(parseDate(window.start)); from.setDate(from.getDate() + i);
    const to = new Date(from); to.setDate(to.getDate() + Math.min(6, totalDays - 1 - i));
    weeks.push({ label: from.getTime() === to.getTime() ? short(from) : `${short(from)} – ${short(to)}`, amount: perDay.slice(i, i + 7).reduce((n, v) => n + v, 0), current: elapsed - 1 >= i && elapsed - 1 < i + 7, future: i > elapsed - 1 });
  }
  const slices = categoryBreakdown(items, categories);
  const bySub = budget.subcategoryId ? [] : (slices.find(s => s.id === budget.categoryId)?.subcategories || []);
  const unassigned = budget.subcategoryId ? 0 : Math.max(0, spent - bySub.reduce((n, s) => n + s.amount, 0));
  const walletMap = new Map<string, number>();
  for (const t of items) walletMap.set(t.walletId, (walletMap.get(t.walletId) || 0) + transactionExpense(t));
  const byWallet = [...walletMap].map(([walletId, amount]) => ({ walletId, amount })).sort((a, b) => b.amount - a.amount);
  const places = new Map<string, { name: string; amount: number; count: number }>();
  for (const t of items) { const name = (t.merchant || '').trim(); if (!name) continue; const key = name.toLowerCase(); const row = places.get(key) || { name, amount: 0, count: 0 }; row.amount += transactionExpense(t); row.count++; places.set(key, row); }
  return { items, spent, totalDays, elapsed, daysLeft, dailyAvg, ideal, projected, pace, weeks, bySub, unassigned, byWallet, places: [...places.values()].sort((a, b) => b.amount - a.amount).slice(0, 5), largest: [...items].sort((a, b) => transactionExpense(b) - transactionExpense(a)).slice(0, 3) };
}

/** The periods before the current one, oldest first, for the history strip. */
export function previousWindows(window: { start: string }, count: number, windowFor: (date: Date) => { start: string; end: string }) {
  const list: { start: string; end: string }[] = [];
  let cursor = window.start;
  for (let i = 0; i < count; i++) { const before = parseDate(cursor); before.setDate(before.getDate() - 1); const w = windowFor(before); list.unshift({ start: w.start, end: w.end }); cursor = w.start; }
  return list;
}
