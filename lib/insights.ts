/** Pure helpers behind Laporan and Analisis. */
import { transactionExpense } from './accounting.ts';
import { parseDate } from './period.ts';
import type { Category, LedgerTx, Wallet } from './types';

const IN_TYPES = new Set(['income', 'claim_payment', 'receivable_payment', 'borrowing']);
const OUT_TYPES = new Set(['expense', 'debt_payment', 'claim_advance', 'receivable_issue']);
const days = (start: string, end: string) => Math.max(1, Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000));

/** Income grouped by its main category. */
export function incomeBreakdown(items: LedgerTx[], categories: Category[]) {
  const lookup = new Map(categories.map(c => [c.id, c]));
  const rows = new Map<string, { id: string; name: string; icon?: string; color?: string; amount: number; count: number }>();
  for (const tx of items) {
    if (tx.type !== 'income') continue;
    const own = lookup.get(tx.categoryId || ''), parent = own?.parentId ? lookup.get(own.parentId) || own : own;
    const id = parent?.id || 'none';
    const row = rows.get(id) || { id, name: parent?.name || 'Tanpa kategori', icon: parent?.icon, color: parent?.color, amount: 0, count: 0 };
    row.amount += tx.amount; row.count += 1; rows.set(id, row);
  }
  return [...rows.values()].sort((a, b) => b.amount - a.amount);
}

/** Money in and out of each wallet during the period, transfers included. */
export function walletFlows(items: LedgerTx[], wallets: Wallet[]) {
  const rows = new Map(wallets.map(w => [w.id, { id: w.id, name: w.name, icon: w.icon, color: w.color, in: 0, out: 0 }]));
  const add = (id: string | null | undefined, key: 'in' | 'out', amount: number) => { const row = id ? rows.get(id) : undefined; if (row) row[key] += amount; };
  for (const tx of items) {
    if (tx.type === 'transfer' || tx.type === 'fund_contribution') { add(tx.walletId, 'out', tx.amount + (tx.transferFee || 0)); add(tx.destinationWalletId, 'in', tx.amount); }
    else if (tx.type === 'adjustment') add(tx.walletId, tx.adjustmentDirection === 'in' ? 'in' : 'out', tx.amount);
    else if (IN_TYPES.has(tx.type)) add(tx.walletId, 'in', tx.amount);
    else if (OUT_TYPES.has(tx.type)) add(tx.walletId, 'out', tx.amount);
  }
  return [...rows.values()].filter(row => row.in || row.out).map(row => ({ ...row, net: row.in - row.out })).sort((a, b) => b.in + b.out - (a.in + a.out));
}

export const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
/** Spending per weekday: total, and the average for one such day in the period. */
export function weekdaySpending(items: LedgerTx[], range: { start: string; end: string }) {
  const totals = WEEKDAYS.map(label => ({ label, total: 0, count: 0, occurrences: 0, average: 0 }));
  for (let d = parseDate(range.start); d < parseDate(range.end); d.setDate(d.getDate() + 1)) totals[(d.getDay() + 6) % 7].occurrences++;
  for (const tx of items) { const amount = transactionExpense(tx); if (!amount) continue; const row = totals[(parseDate(tx.date).getDay() + 6) % 7]; row.total += amount; row.count++; }
  return totals.map(row => ({ ...row, average: row.occurrences ? Math.round(row.total / row.occurrences) : 0 }));
}

/** Spending by time of day (only transactions with a time). */
export function timeOfDaySpending(items: LedgerTx[]) {
  const slots = [['Dini hari', 0, 5], ['Pagi', 5, 11], ['Siang', 11, 15], ['Sore', 15, 19], ['Malam', 19, 24]] as const;
  const rows = slots.map(([label, from, to]) => ({ label, range: `${String(from).padStart(2, '0')}–${String(to).padStart(2, '0')}`, total: 0, count: 0 }));
  let untimed = 0;
  for (const tx of items) {
    const amount = transactionExpense(tx); if (!amount) continue;
    const hour = /^\d{2}:\d{2}/.test(tx.time || '') ? Number(tx.time!.slice(0, 2)) : -1;
    const index = slots.findIndex(([, from, to]) => hour >= from && hour < to);
    if (index < 0) { untimed += amount; continue; }
    rows[index].total += amount; rows[index].count++;
  }
  return { rows, untimed };
}

/** How many payments fall into each size band. */
export function sizeBands(items: LedgerTx[]) {
  const bands = [['< Rp25rb', 0, 25_000], ['Rp25–100rb', 25_000, 100_000], ['Rp100–500rb', 100_000, 500_000], ['≥ Rp500rb', 500_000, Infinity]] as const;
  const rows = bands.map(([label]) => ({ label, count: 0, total: 0 }));
  for (const tx of items) { const amount = transactionExpense(tx); if (!amount) continue; const index = bands.findIndex(([, from, to]) => amount >= from && amount < to); rows[index].count++; rows[index].total += amount; }
  return rows;
}

/** Where the money goes most often, by merchant or description. */
export function topPlaces(items: LedgerTx[], limit = 6) {
  const rows = new Map<string, { name: string; total: number; count: number }>();
  for (const tx of items) {
    const amount = transactionExpense(tx); if (!amount) continue;
    const name = (tx.merchant || tx.description || '').trim(); if (!name) continue;
    const key = name.toLocaleLowerCase('id-ID');
    const row = rows.get(key) || { name, total: 0, count: 0 }; row.total += amount; row.count++; rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || b.count - a.count).slice(0, limit);
}

/** Running total of spending per day, so this period's pace can be laid over the previous one. */
export function cumulativeSpending(items: LedgerTx[], range: { start: string; end: string }) {
  const length = days(range.start, range.end), perDay = new Array(length).fill(0);
  for (const tx of items) { const index = Math.round((parseDate(tx.date).getTime() - parseDate(range.start).getTime()) / 86400000); if (index >= 0 && index < length) perDay[index] += transactionExpense(tx); }
  let sum = 0; return perDay.map(value => (sum += value));
}

export function largestExpenses(items: LedgerTx[], limit = 5) { return items.filter(tx => transactionExpense(tx) > 0).sort((a, b) => transactionExpense(b) - transactionExpense(a)).slice(0, limit); }
