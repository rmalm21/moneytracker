/**
 * Insight V3 — decision memory and outcomes.
 *
 * When the user taps an Insight action (change or create a budget), a small record is kept in the Insight memory:
 * what was decided, when, from which Insight, and the before/after amounts. It is not a ledger: no transaction is
 * copied, and the budget itself is saved by the normal budget flow. Outcomes are measured later from the ledger:
 * spending in that category in the cycles before vs after. Wording is "setelah" (after), never "karena" (because).
 */
import { sum } from '../insight-v25/baseline.ts';
import { inRange, type InsightContext } from '../insight-v25/context.ts';
import type { InsightMemory } from '../insight-v25/lifecycle.ts';
import { dateText, rp } from '../insight-v25/signals/common.ts';

export type DecisionRecord = { id: string; d: string; k: 'budget_set' | 'budget_create'; sig?: string; f?: string; cat?: string; budgetId?: string; label: string; before?: number; after: number; /** Outcome already written to the timeline. */ o?: string };
export type Outcome = { decision: DecisionRecord; status: 'improved' | 'unchanged' | 'worse' | 'pending'; text: string; before: number; after: number; overLimit: number; provisional: boolean };

export function recordDecision(memory: InsightMemory, d: Omit<DecisionRecord, 'id'>): InsightMemory {
  const list = [...(memory.dec || [])].filter(x => !(x.d === d.d && x.budgetId && x.budgetId === d.budgetId));
  list.push({ ...d, id: `${d.d}:${d.k}:${d.budgetId || d.cat || list.length}` });
  return { ...memory, dec: list.slice(-30) };
}

/** Spending of one category per cycle: complete cycles before and after the decision, or the running one. */
export function outcomes(memory: InsightMemory, ctx: InsightContext): Outcome[] {
  const all = [...ctx.cycles, { ...ctx.current, label: 'Kini', usable: true }];
  const spendIn = (cat: string, lines: typeof ctx.current.lines) => sum(lines.filter(l => l.categoryId === cat && l.tx.type === 'expense').map(l => l.amount));
  return (memory.dec || []).filter(d => d.cat).map(d => {
    const at = all.findIndex(c => inRange(d.d, c));
    const before = at > 0 ? all[at - 1] : null;
    const completeAfter = all.slice(at + 1).filter(c => c.label !== 'Kini');
    const runningAfter = at >= 0 && at < all.length - 1 ? all[all.length - 1] : null;
    if (!before) return { decision: d, status: 'pending' as const, text: `Belum ada siklus sebelum ${dateText(d.d)} untuk dibandingkan.`, before: 0, after: 0, overLimit: 0, provisional: true };
    const b = spendIn(d.cat!, before.lines);
    let a: number, provisional = false;
    if (completeAfter.length) a = sum(completeAfter.map(c => spendIn(d.cat!, c.lines))) / completeAfter.length;
    else if (runningAfter && ctx.current.progress >= .25) { a = spendIn(d.cat!, ctx.current.lines) / ctx.current.progress; provisional = true; }
    else return { decision: d, status: 'pending' as const, text: `${d.label}: hasilnya terlihat setelah siklus berikutnya berjalan.`, before: b, after: 0, overLimit: 0, provisional: true };
    const diff = a - b, over = Math.max(0, a - d.after);
    const status = diff <= -Math.max(20_000, b * .05) ? 'improved' : diff >= Math.max(20_000, b * .05) ? 'worse' : 'unchanged';
    const change = status === 'improved' ? `turun ${rp(-diff)}` : status === 'worse' ? `naik ${rp(diff)}` : 'relatif sama';
    const text = `${d.label} pada ${dateText(d.d)}${d.before ? ` (dari ${rp(d.before)} ke ${rp(d.after)})` : ` (${rp(d.after)})`}. Setelahnya, pengeluaran ${change}${provisional ? ' (perkiraan dari siklus berjalan)' : ''}${over > 0 ? `, masih ${rp(over)} di atas batas baru` : ''}.`;
    return { decision: d, status, text, before: b, after: a, overLimit: over, provisional };
  });
}
