/**
 * What Catat otomatis makes of a sentence, for the chat: a record (and the one thing it still needs, asked back in the
 * chat with choices), an answered question, a question it cannot answer, or nothing.
 */
import { parseQuickPlan } from '../../../lib/quick-plan.ts';
import { mayAsk } from '../../../lib/catat/ask.ts';
import type { QuickContext } from '../../../lib/quick-entry.ts';

export type Reading = 'record' | 'question' | 'unanswered' | 'none';
export type AskField = 'amount' | 'wallet' | 'to' | 'category' | 'date';
export type Inspection = { reading: Reading; ask?: { field: AskField; choices: string[] }; kind?: string; count?: number };

const COMMON = ['Makan & Minum', 'Transportasi', 'Belanja', 'Tagihan', 'Hiburan'];

export function inspect(text: string, quick: QuickContext): Inspection {
  let plan;
  try { plan = parseQuickPlan(text, quick); } catch { return { reading: 'none' }; }
  const acts = plan.actions;
  if (acts.some(a => a.result.kind === 'query')) return { reading: 'question', kind: 'query' };
  if (!acts.length) return { reading: mayAsk(text) ? 'unanswered' : 'none' };
  const a = acts[0], r = a.result, name = (id: string) => quick.wallets.find(w => w.id === id)?.name || id;
  const base: Inspection = { reading: 'record', kind: r.kind, count: acts.length };
  if (acts.length > 1) return base;
  const ask = a.ask;
  if (ask && (ask.field === 'wallet' || ask.field === 'to')) return { ...base, ask: { field: ask.field, choices: (ask.choices || []).slice(0, 5).map(name) } };
  if (ask?.field === 'amount') return { ...base, ask: { field: 'amount', choices: (ask.choices || []).slice(0, 4).map(v => `${Number(v).toLocaleString('id-ID')}`) } };
  if (ask?.field === 'date') return { ...base, ask: { field: 'date', choices: ['hari ini', 'kemarin'] } };
  // A spending whose category was not read: the most used categories (or the usual ones) to pick from.
  if (r.kind === 'expense' && !r.preset.categoryId && !r.preset.splits?.length && !r.split) {
    const used = new Map<string, number>();
    for (const t of quick.history) if (t.type === 'expense' && t.categoryId) used.set(t.categoryId, (used.get(t.categoryId) || 0) + 1);
    const names = [...used.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => quick.categories.find(c => c.id === id)?.name).filter((n): n is string => Boolean(n));
    const top = (names.length >= 3 ? names : [...names, ...COMMON.filter(n => quick.categories.some(c => c.name === n) && !names.includes(n))]).slice(0, 5);
    return { ...base, ask: { field: 'category', choices: top } };
  }
  return base;
}
