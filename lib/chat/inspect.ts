/**
 * What Catat otomatis makes of a sentence, for the chat: a record (and the one thing it still needs, asked back in the
 * chat with choices), an answered question, a question it cannot answer, or nothing.
 */
import { parseQuickPlan } from '../quick-plan.ts';
import { mayAsk } from '../catat/ask.ts';
import type { QuickContext } from '../quick-entry.ts';

export type Reading = 'record' | 'question' | 'unanswered' | 'none';
export type AskField = 'amount' | 'wallet' | 'to' | 'category' | 'date' | 'borrower' | 'lender';
export type Inspection = { reading: Reading; ask?: { field: AskField; choices: string[] }; kind?: string; count?: number; /** 7.9: the person of the first entry ("dia" next time), the wallet named, the total of all entries. */ person?: string; walletId?: string; total?: number;
  /** 8.0: the category of a single entry (the same treat recorded again and again gets a tease). */ categoryId?: string; subcategoryId?: string;
  /** 10.0 A budget card that changes one already there (its name and limit now), not a new one. */ replaces?: { name: string; amount: number } };

const COMMON = ['Makan & Minum', 'Transportasi', 'Belanja', 'Tagihan', 'Hiburan'];

export function inspect(text: string, quick: QuickContext): Inspection {
  let plan;
  try { plan = parseQuickPlan(text, quick); } catch { return { reading: 'none' }; }
  const acts = plan.actions;
  if (acts.some(a => a.result.kind === 'query')) return { reading: 'question', kind: 'query' };
  if (!acts.length) return { reading: mayAsk(text) ? 'unanswered' : 'none' };
  const a = acts[0], r = a.result, name = (id: string) => quick.wallets.find(w => w.id === id)?.name || id;
  const base: Inspection = { reading: 'record', kind: r.kind, count: acts.length, ...(r.person ? { person: r.person } : {}), ...(r.preset.walletId ? { walletId: r.preset.walletId } : {}), total: acts.reduce((n, x) => n + (x.result.amount || 0), 0), ...(acts.length === 1 && r.preset.categoryId ? { categoryId: r.preset.categoryId } : {}), ...(acts.length === 1 && r.preset.subcategoryId ? { subcategoryId: r.preset.subcategoryId } : {}) };
  if (acts.length > 1) return base;
  if (r.kind === 'budget' && r.budget?.id) { const b = (quick.budgets || []).find(x => x.id === r.budget!.id); if (b) base.replaces = { name: b.name, amount: b.amount }; }
  // 8.4 A receivable or a debt without a name ("516rb piutang"): who, asked first (the next message answers it).
  if ((r.kind === 'receivable_new' || r.kind === 'debt_new') && !r.person) {
    const names = r.kind === 'receivable_new' ? (quick.receivables || []).map(x => x.person) : (quick.debts || []).map(x => x.name);
    return { ...base, ask: { field: r.kind === 'receivable_new' ? 'borrower' : 'lender', choices: [...new Set(names.filter(Boolean))].slice(0, 4) } };
  }
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
