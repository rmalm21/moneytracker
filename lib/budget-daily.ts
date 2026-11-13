/**
 * 10.1 "Sehari seharusnya segini": once a spending is saved (chat, Catat otomatis, form Tambah), the budget it counts
 * toward says how much is left a day. Worked out exactly as the Anggaran menu does its "±Rp…/hari": what is left after
 * the spending already planned for this period, over the days remaining. A spending no budget covers gets nothing.
 */
import { budgetCurrent, budgetMatcher, rupiah } from './accounting.ts';
import { budgetCommitted } from './finance-control.ts';
import type { Data } from './types';

export type SpentEntry = { categoryId?: string | null; subcategoryId?: string | null; amount: number; /** Outside the budget's current period it does not count toward it (a record backdated to last month). */ date?: string };
export type BudgetDaily = { budgetId: string; name: string; perDay: number; left: number; days: number; over: number };

/**
 * The budgets these spendings count toward, each once, the narrowest first (a subcategory's budget before its whole
 * category's). `pending`: the spendings are not in `data` yet (the note is written before the ledger catches up), so
 * they are counted in here.
 */
export function dailyForSpending(data: Data, entries: SpentEntry[], today: Date, salaryDay: number, pending = true): BudgetDaily[] {
  const out: BudgetDaily[] = [];
  for (const b of data.budgets) {
    if (!b.active || b.classification === 'savings' || b.classification === 'sinking') continue;
    const counts = budgetMatcher(b, data.categories);
    const status = budgetCurrent(b, data.transactions, data.categories, today, salaryDay);
    const mine = entries.filter(e => e.amount > 0 && counts(e.categoryId, e.subcategoryId) && (!e.date || e.date >= status.start && e.date < status.end));
    if (!mine.length) continue;
    const added = pending ? mine.reduce((n, e) => n + e.amount, 0) : 0;
    const left = status.remaining - added - budgetCommitted(b, data, today, salaryDay);
    out.push({ budgetId: b.id, name: b.name, perDay: left > 0 ? left / Math.max(1, status.daysRemaining) : 0, left, days: Math.max(1, status.daysRemaining), over: left < 0 ? -left : 0 });
  }
  const narrow = (id: string) => { const b = data.budgets.find(x => x.id === id); return (b?.subcategoryIds?.length || b?.subcategoryId) ? 0 : 1; };
  return out.sort((a, b) => narrow(a.budgetId) - narrow(b.budgetId)).slice(0, 2);
}

/** Rounded down to Rp100, so "sehari seharusnya" never says more than is there. */
export const perDayAmount = (n: number) => Math.max(0, Math.floor(n / 100) * 100);

/** One plain line for a notification after saving ("Anggaran Makan: sehari seharusnya ±Rp45.900 (sisa Rp413.500, 9 hari)."). */
export function dailyLine(d: BudgetDaily): string {
  if (d.left <= 0) return d.over > 0
    ? `Anggaran ${d.name} sudah lewat ${rupiah(d.over)}, sebaiknya jangan nambah dulu sampai ${d.days} hari lagi.`
    : `Anggaran ${d.name} sudah habis, sebaiknya jangan nambah dulu sampai ${d.days} hari lagi.`;
  return `Anggaran ${d.name}: sehari seharusnya ±${rupiah(perDayAmount(d.perDay))} (sisa ${rupiah(d.left)}, ${d.days} hari lagi).`;
}

/** 10.1 Whether the per-day line is shown (Pengaturan chat → "Tampilkan jatah per hari", on unless switched off). */
export function dailyLineOn(uid: string | undefined): boolean {
  if (!uid) return true;
  try { const s = JSON.parse(localStorage.getItem(`dompet-ajaib:chat:settings:${uid}`) || 'null'); return !(s && s.daily === false); } catch { return true; }
}
