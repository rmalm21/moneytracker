/**
 * Insight V2.5 — the shared reading of the ledger every signal works from.
 *
 * Built once per run: the current salary cycle and how far into it we are, the past cycles the ledger really covers
 * (lib/advisor.ts coveredCycles, the same rule as the Advisor), which of them are complete enough to be a baseline,
 * category lookups, and how complete the data is. Spending and income always come from lib/accounting.ts
 * (transactionExpense / expenseAllocations / transactionIncome), so a transfer or a goal deposit is never spending,
 * a Split Bill counts only the user's own share, and a friend paying back their share is not income.
 */
import { expenseAllocations, salaryCycle, transactionExpense, transactionIncome } from '../accounting.ts';
import { categoryKind, coveredCycles, type AdvisorInput, type Range } from '../advisor.ts';
import { resolveInsightProfile, type InsightProfile } from '../insight-profile.ts';
import type { Category, LedgerTx } from '../types';

const DAY = 86_400_000;
export const parse = (date: string) => new Date(`${date}T12:00:00`);
export const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY);
export const addDays = (date: string, n: number) => iso(new Date(parse(date).getTime() + n * DAY));
export const inRange = (date: string, range: Range) => date >= range.start && date < range.end;

/** One spending line: the part of a transaction that counts as spending, with its parent category resolved. */
export type Line = { tx: LedgerTx; amount: number; categoryId: string; subcategoryId: string; merchant: string; date: string };
export type Cycle = Range & {
  label: string; items: LedgerTx[]; lines: Line[]; income: number; expense: number;
  /** False when the cycle looks half-recorded (far fewer records than usual): kept out of baselines. */
  usable: boolean;
};

export type InsightContext = {
  input: AdvisorInput; today: string; salaryDay: number; profile: InsightProfile;
  current: Range & { lines: Line[]; items: LedgerTx[]; elapsed: number; total: number; progress: number; daysLeft: number; income: number; expense: number };
  /** Past covered cycles, oldest first (the Advisor's set). */
  cycles: Cycle[];
  /** The ones complete enough to compare with. */
  baseline: Cycle[];
  categories: Map<string, Category>;
  parentOf: (id: string | null | undefined) => string;
  nameOf: (id: string) => string;
  kindOf: (id: string) => 'need' | 'want';
  /** Share of spending without a category, this cycle and in the baseline cycles. */
  quality: { uncategorizedCurrent: number; uncategorizedBaseline: number; noMerchantCurrent: number; issues: number };
  /** Lines of the past cycles up to the same day of the cycle as today (fair comparison for a running cycle). */
  samePoint: (cycle: Cycle) => Line[];
};

export const merchantKey = (name: string) => name.toLocaleLowerCase('id-ID').replace(/[^a-z0-9]+/g, ' ').trim();

export function buildContext(input: AdvisorInput, options: { healthIssues?: number } = {}): InsightContext {
  const { data, history, today, salaryDay } = input;
  const profile = resolveInsightProfile(input.profile);
  const categories = new Map(data.categories.map(c => [c.id, c]));
  const parentOf = (id: string | null | undefined) => { if (!id) return 'uncategorized'; const c = categories.get(id); return c?.parentId && categories.has(c.parentId) ? c.parentId : id; };
  const nameOf = (id: string) => id === 'uncategorized' ? 'Tanpa kategori' : id === 'debt-payment' ? 'Bayar utang' : id === 'none' ? 'Tanpa subkategori' : categories.get(id)?.name || 'Kategori';
  const kindOf = (id: string) => { const c = categories.get(id); return categoryKind(c?.name || '', c?.parentId ? categories.get(c.parentId)?.name : undefined); };
  const linesOf = (items: LedgerTx[]): Line[] => items.flatMap(tx => expenseAllocations(tx).map(line => {
    const parent = line.categoryId ? parentOf(line.categoryId) : tx.type === 'debt_payment' ? 'debt-payment' : 'uncategorized';
    const sub = line.subcategoryId && categories.get(line.subcategoryId)?.parentId === parent ? line.subcategoryId : line.categoryId && line.categoryId !== parent ? line.categoryId : 'none';
    return { tx, amount: line.amount, categoryId: parent, subcategoryId: sub, merchant: (tx.merchant || '').trim(), date: tx.date };
  }).filter(line => line.amount > 0));
  const sum = (values: number[]) => values.reduce((n, v) => n + v, 0);

  const cur = salaryCycle(parse(today), salaryDay), currentRange = { start: cur.start, end: cur.end };
  const { covered } = coveredCycles(history, currentRange, today, salaryDay);
  const cycles: Cycle[] = covered.map(range => {
    const items = history.filter(tx => inRange(tx.date, range));
    return { ...range, label: parse(range.start).toLocaleDateString('id-ID', { month: 'short' }), items, lines: linesOf(items), income: sum(items.map(transactionIncome)), expense: sum(items.map(transactionExpense)), usable: true };
  });
  // A past cycle with far fewer spending records than the others was probably not recorded fully.
  const counts = cycles.map(c => c.lines.length).sort((a, b) => a - b), typical = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  if (cycles.length >= 3) for (const c of cycles) c.usable = c.lines.length >= typical * .4;
  const currentItems = history.filter(tx => inRange(tx.date, currentRange));
  const elapsed = Math.max(1, daysBetween(cur.start, today) + 1), total = Math.max(1, daysBetween(cur.start, cur.end));
  const current = { ...currentRange, items: currentItems, lines: linesOf(currentItems), elapsed, total, progress: Math.min(1, elapsed / total), daysLeft: Math.max(0, total - elapsed + 1), income: sum(currentItems.map(transactionIncome)), expense: sum(currentItems.map(transactionExpense)) };
  const baseline = cycles.filter(c => c.usable);
  const uncategorized = (lines: Line[]) => { const all = sum(lines.map(l => l.amount)); return all ? sum(lines.filter(l => l.categoryId === 'uncategorized').map(l => l.amount)) / all : 0; };
  const spendLines = (lines: Line[]) => lines.filter(l => l.tx.type === 'expense');
  const quality = {
    uncategorizedCurrent: uncategorized(spendLines(current.lines)),
    uncategorizedBaseline: uncategorized(spendLines(baseline.flatMap(c => c.lines))),
    noMerchantCurrent: (() => { const lines = spendLines(current.lines), all = sum(lines.map(l => l.amount)); return all ? sum(lines.filter(l => !l.merchant).map(l => l.amount)) / all : 0; })(),
    issues: options.healthIssues || 0,
  };
  const samePoint = (cycle: Cycle) => { const until = addDays(cycle.start, elapsed); return cycle.lines.filter(l => l.date < until); };
  return { input, today, salaryDay, profile, current, cycles, baseline, categories, parentOf, nameOf, kindOf, quality, samePoint };
}
