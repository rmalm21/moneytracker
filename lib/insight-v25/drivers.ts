/**
 * Insight V2.5 — why a number moved.
 *
 * Driver tree: a spending change splits into subcategories, then merchants, then the transactions themselves.
 * Every level adds up exactly to its parent: the typical value is the mean of the baseline cycles (baseline.ts),
 * and the branches not shown are kept in one "Lainnya" branch. Each branch also splits its change into
 *   frequencyEffect = (cC − bC) × (cA + bA) / 2   — more or fewer purchases
 *   ticketEffect    = (cA − bA) × (cC + bC) / 2   — pricier or cheaper each time
 * (c = current, b = baseline, C = count, A = average ticket); the two always add up to the change.
 */
import { mean, quantile, sum } from './baseline.ts';
import { merchantKey, type InsightContext, type Line } from './context.ts';
import type { Driver } from './types.ts';

/** Frequency vs ticket size. With nothing on one side the whole change is frequency (a new or stopped habit). */
export function decompose(current: { amount: number; count: number }, base: { amount: number; count: number }) {
  const delta = current.amount - base.amount;
  if (!current.count || !base.count) return { frequencyEffect: delta, ticketEffect: 0 };
  const cA = current.amount / current.count, bA = base.amount / base.count;
  const frequencyEffect = (current.count - base.count) * (cA + bA) / 2;
  return { frequencyEffect, ticketEffect: delta - frequencyEffect };
}

type Level = 'subcategory' | 'merchant';
const txCount = (lines: Line[]) => new Set(lines.map(l => l.tx.id)).size;
const keyOf: Record<Level, (l: Line) => string> = { subcategory: l => l.subcategoryId, merchant: l => merchantKey(l.merchant) || '∅' };

function node(id: string, label: string, level: Driver['level'], cur: Line[], base: Line[][]): Driver {
  const current = sum(cur.map(l => l.amount)), baseline = base.length ? mean(base.map(lines => sum(lines.map(l => l.amount)))) : 0;
  const count = { current: txCount(cur), baseline: base.length ? mean(base.map(txCount)) : 0 };
  return { id, label, level, current, baseline, delta: current - baseline, count, ...decompose({ amount: current, count: count.current }, { amount: baseline, count: count.baseline }) };
}

/**
 * Build the tree for a set of lines (already limited to one category, or one merchant…).
 * `base` holds one list of lines per baseline cycle (same-point lines for a running cycle).
 */
export function driverTree(ctx: InsightContext, id: string, label: string, level: Driver['level'], cur: Line[], base: Line[][], levels: Level[] = ['subcategory', 'merchant'], maxChildren = 4): Driver {
  const root = node(id, label, level, cur, base);
  const [next, ...rest] = levels;
  if (!next) {
    // Leaves: the largest transactions of the current cycle behind this branch.
    root.txIds = [...new Map(cur.map(l => [l.tx.id, l])).values()].sort((a, b) => b.amount - a.amount).slice(0, 12).map(l => l.tx.id);
    return root;
  }
  const keys = new Set([...cur.map(keyOf[next]), ...base.flat().map(keyOf[next])]);
  const labelOf = (key: string, sample?: Line) => next === 'subcategory' ? ctx.nameOf(key) : key === '∅' ? 'Tanpa nama tempat' : sample?.merchant || key;
  let children = [...keys].map(key => {
    const c = cur.filter(l => keyOf[next](l) === key), b = base.map(lines => lines.filter(l => keyOf[next](l) === key));
    return driverTree(ctx, `${id}/${next}:${key}`, labelOf(key, c[0] || b.flat()[0]), next, c, b, rest, maxChildren);
  }).filter(d => d.current || d.baseline).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  // One child that is the whole parent ("Tanpa subkategori" only) adds nothing: go one level deeper instead.
  if (children.length === 1 && rest.length && (children[0].id.endsWith(':none') || children[0].id.endsWith(':∅'))) return { ...root, children: children[0].children, txIds: children[0].txIds };
  if (children.length > maxChildren + 1) {
    const shown = children.slice(0, maxChildren), others = children.slice(maxChildren);
    const other: Driver = { id: `${id}/other`, label: 'Lainnya', level: 'other', current: sum(others.map(d => d.current)), baseline: sum(others.map(d => d.baseline)), delta: 0, count: { current: sum(others.map(d => d.count?.current || 0)), baseline: sum(others.map(d => d.count?.baseline || 0)) }, txIds: others.flatMap(d => d.txIds || []).slice(0, 12) };
    other.delta = other.current - other.baseline;
    Object.assign(other, decompose({ amount: other.current, count: other.count!.current }, { amount: other.baseline, count: other.count!.baseline }));
    children = [...shown, other];
  }
  root.children = children;
  root.txIds = [...new Map(cur.map(l => [l.tx.id, l])).values()].sort((a, b) => b.amount - a.amount).slice(0, 12).map(l => l.tx.id);
  return root;
}

/** Round values to whole rupiah so they still add up to the rounded total (largest remainder). */
export function roundToTotal(values: number[], total: number) {
  const floors = values.map(v => Math.floor(v)), rest = Math.round(total) - sum(floors);
  const order = values.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  const out = [...floors];
  for (let k = 0; k < Math.abs(rest) && order.length; k++) out[order[k % order.length]] += Math.sign(rest);
  return out;
}

export type MerchantStat = { key: string; name: string; count: number; total: number; avg: number; median: number; share: number; baseline: number; baselineCount: number; delta: number; frequencyEffect: number; ticketEffect: number; cycles: number; categoryId: string; subcategoryId: string };
/** Merchant intelligence for the running cycle against the same point of earlier cycles. */
export function merchantStats(ctx: InsightContext): MerchantStat[] {
  const spend = (lines: Line[]) => lines.filter(l => l.tx.type === 'expense' && l.merchant);
  const cur = spend(ctx.current.lines), base = ctx.baseline.map(c => spend(ctx.samePoint(c)));
  const all = sum(ctx.current.lines.filter(l => l.tx.type === 'expense').map(l => l.amount));
  const keys = new Set([...cur, ...base.flat()].map(l => merchantKey(l.merchant)));
  return [...keys].map(key => {
    const c = cur.filter(l => merchantKey(l.merchant) === key), b = base.map(lines => lines.filter(l => merchantKey(l.merchant) === key));
    const total = sum(c.map(l => l.amount)), count = txCount(c), baseline = base.length ? mean(b.map(lines => sum(lines.map(l => l.amount)))) : 0, baselineCount = base.length ? mean(b.map(txCount)) : 0;
    const tickets = [...c, ...b.flat()].map(l => l.amount), sample = c[0] || b.flat()[0];
    // Where the merchant usually sits (most of its money).
    const byCat = new Map<string, number>(); for (const l of [...c, ...b.flat()]) byCat.set(`${l.categoryId}|${l.subcategoryId}`, (byCat.get(`${l.categoryId}|${l.subcategoryId}`) || 0) + l.amount);
    const [categoryId, subcategoryId] = ([...byCat.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || 'uncategorized|none').split('|');
    return { key, name: sample.merchant, count, total, avg: count ? total / count : 0, median: quantile(tickets, .5), share: all ? total / all : 0, baseline, baselineCount, delta: total - baseline, ...decompose({ amount: total, count }, { amount: baseline, count: baselineCount }), cycles: b.filter(lines => lines.length).length, categoryId, subcategoryId };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
