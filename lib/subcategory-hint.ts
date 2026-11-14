/**
 * 10.3.1 Transactions without a subcategory. When a main category has subcategories and none was picked, every place that
 * makes or edits a transaction says so and offers them as quick picks (most used first); saving still works without one.
 * The old ones are counted per category so the chart and Insight can point at them ("8 transaksi belum punya subkategori").
 */
import { expenseAllocations } from './accounting.ts';
import type { Category, LedgerTx } from './types';

/** The active subcategories of a main category, for a choice that has none. */
export function subsOf(categories: Category[], categoryId: string | null | undefined): Category[] {
  if (!categoryId) return [];
  return categories.filter(c => c.parentId === categoryId && !c.isArchived).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'id'));
}

/**
 * The subcategories to offer for a transaction placed in `categoryId` with no `subcategoryId`, most used first (the
 * person's own records), or null when there is nothing to warn about: a subcategory is already chosen, the choice is
 * itself a subcategory, or the category has none.
 */
export function missingSubs(categories: Category[], transactions: LedgerTx[], categoryId: string | null | undefined, subcategoryId: string | null | undefined): Category[] | null {
  if (!categoryId || subcategoryId) return null;
  const chosen = categories.find(c => c.id === categoryId);
  if (!chosen || chosen.parentId) return null;
  const subs = subsOf(categories, categoryId);
  if (!subs.length) return null;
  const used = usage(transactions);
  return subs.map((c, i) => ({ c, i, n: used.get(c.id) || 0 })).sort((a, b) => b.n - a.n || a.i - b.i).map(x => x.c);
}

/** How often each subcategory was used, counted once per list of transactions (the forms ask on every render). */
const USAGE = new WeakMap<LedgerTx[], Map<string, number>>();
function usage(transactions: LedgerTx[]): Map<string, number> {
  let used = USAGE.get(transactions);
  if (used) return used;
  used = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.subcategoryId) used.set(tx.subcategoryId, (used.get(tx.subcategoryId) || 0) + 1);
    for (const line of tx.splits || []) if (line.subcategoryId) used.set(line.subcategoryId, (used.get(line.subcategoryId) || 0) + 1);
  }
  USAGE.set(transactions, used);
  return used;
}

/** Does this transaction (or one of its split lines) sit in `categoryId` without a subcategory? */
export function lacksSub(tx: LedgerTx, categoryId: string): boolean {
  if (tx.type === 'income') return tx.categoryId === categoryId && !tx.subcategoryId;
  if (tx.type !== 'expense') return false;
  return expenseAllocations(tx).some(line => line.categoryId === categoryId && !line.subcategoryId);
}

export type MissingSubGroup = { category: Category; count: number; amount: number; ids: Set<string> };
/**
 * Spending and income placed in a main category that has subcategories, without one, per category (most first). Only
 * plain spending and income: transfers, debts and claims have their own places.
 */
export function withoutSubs(transactions: LedgerTx[], categories: Category[]): MissingSubGroup[] {
  const lookup = new Map(categories.map(c => [c.id, c])), hasSubs = new Set(categories.filter(c => c.parentId && !c.isArchived).map(c => c.parentId!));
  const groups = new Map<string, MissingSubGroup>();
  const add = (tx: LedgerTx, id: string | null | undefined, amount: number) => {
    const category = id ? lookup.get(id) : undefined;
    if (!category || category.parentId || category.isArchived || !hasSubs.has(category.id) || amount <= 0) return;
    const g = groups.get(category.id) || { category, count: 0, amount: 0, ids: new Set<string>() };
    g.ids.add(tx.id); g.count = g.ids.size; g.amount += amount; groups.set(category.id, g);
  };
  for (const tx of transactions) {
    if (tx.type === 'income') { if (!tx.subcategoryId) add(tx, tx.categoryId, tx.amount); continue; }
    if (tx.type !== 'expense') continue;
    for (const line of expenseAllocations(tx)) if (!line.subcategoryId) add(tx, line.categoryId, line.amount);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.amount - a.amount);
}
