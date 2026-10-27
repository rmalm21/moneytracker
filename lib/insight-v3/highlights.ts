/**
 * Insight — "Sorotan": the few events of this salary cycle worth seeing at a glance, as facts with a date (salary in,
 * the biggest purchase, an unusual one, a budget about to overflow, money running short, a claim or a friend's
 * payback that is late, something that got better). Read from the same report the page shows; nothing new is judged
 * here, so a highlight never says more than its card. Each one opens its story or its transaction.
 */
import { transactionExpense } from '../accounting.ts';
import type { InsightSignal } from '../insight-v25/types.ts';
import type { InsightV3Report } from './index.ts';
import { dayMonth, money } from './format.ts';

export type HighlightKind = 'income' | 'spend' | 'alert' | 'warn' | 'good';
export type Highlight = { key: string; date: string; kind: HighlightKind; label: string; title: string; value?: string; signature?: string; txId?: string };

const median = (values: number[]) => { if (!values.length) return 0; const s = [...values].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };

export function highlightsView(r: InsightV3Report, limit = 6): Highlight[] {
  const cur = r.v25.context.current, today = r.world.asOf;
  const byId = new Map(cur.items.map(t => [t.id, t]));
  const out: (Highlight & { rank: number })[] = [];
  const dateOf = (s: InsightSignal) => s.evidence.flatMap(e => e.txIds || []).map(id => byId.get(id)?.date).filter((d): d is string => Boolean(d)).sort().pop() || today;
  const live = [...r.v25.signals, ...r.extra].filter(s => s.lifecycleState !== 'DISMISSED' && s.lifecycleState !== 'SNOOZED' && s.lifecycleState !== 'RESOLVED');

  // Money in and out of this cycle.
  const income = cur.items.filter(t => t.type === 'income').sort((a, b) => b.amount - a.amount)[0];
  if (income && income.amount >= 500_000) out.push({ key: `in:${income.id}`, rank: 3, date: income.date, kind: 'income', label: 'Uang masuk', title: income.description || income.merchant || 'Pemasukan', value: `+${money(income.amount)}`, txId: income.id });
  const spends = cur.items.filter(t => transactionExpense(t) > 0);
  const biggest = [...spends].sort((a, b) => transactionExpense(b) - transactionExpense(a))[0];
  const flagged = new Set(live.filter(s => s.type === 'unusual_transaction').flatMap(s => s.evidence.flatMap(e => e.txIds || [])));
  if (biggest && !flagged.has(biggest.id) && transactionExpense(biggest) >= Math.max(300_000, median(spends.map(transactionExpense)) * 3))
    out.push({ key: `out:${biggest.id}`, rank: 2, date: biggest.date, kind: 'spend', label: 'Pengeluaran terbesar', title: biggest.description || biggest.merchant || 'Pengeluaran', value: money(transactionExpense(biggest)), txId: biggest.id });

  // What the cards say needs attention, the most pressing first.
  for (const s of live) {
    const base = { key: s.signature, signature: s.signature, title: s.headline && s.headline.length <= 70 ? s.headline : s.title };
    if (s.type === 'unusual_transaction') { const tx = byId.get(s.evidence.flatMap(e => e.txIds || [])[0] || ''); out.push({ ...base, rank: 1, date: dateOf(s), kind: 'alert', label: 'Tidak biasa', title: tx ? [tx.description, tx.merchant].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ') || s.title : s.title.replace(/^Tidak biasa:\s*/, ''), value: s.current ? money(s.current) : undefined, txId: tx?.id }); }
    else if (s.signature === 'liquidity:lowest' && (s.current ?? 0) < 0) out.push({ ...base, rank: 0, date: today, kind: 'alert', label: 'Hati-hati', title: s.title, value: money(s.current!) });
    else if (s.type === 'budget_over' || /^budget:pressure/.test(s.signature)) out.push({ ...base, rank: 1, date: today, kind: 'warn', label: 'Anggaran', title: s.title });
    else if (/^claims:aging/.test(s.signature)) out.push({ ...base, rank: 2, date: today, kind: 'warn', label: 'Klaim kantor', title: s.title });
    else if (/^receivable:late/.test(s.signature)) out.push({ ...base, rank: 2, date: today, kind: 'warn', label: 'Piutang', title: s.title });
    else if (s.tone === 'positive' && s.material && (s.lifecycleState === 'NEW' || s.lifecycleState === 'IMPROVING')) out.push({ ...base, rank: 4, date: today, kind: 'good', label: 'Membaik', title: s.title });
  }
  // Good news the history already logged during this cycle (a target reached, a warning that cleared).
  for (const e of r.memory.tl.filter(x => x.d >= cur.start && (x.e === 'milestone' || x.e === 'resolved' || x.e === 'outcome')).slice(-2))
    out.push({ key: `tl:${e.k}:${e.d}`, rank: 4, date: e.d, kind: 'good', label: e.e === 'milestone' ? 'Tercapai' : e.e === 'outcome' ? 'Hasil pilihanmu' : 'Selesai', title: e.t });

  const seen = new Set<string>();
  return out.sort((a, b) => a.rank - b.rank || b.date.localeCompare(a.date))
    .filter(h => { const k = h.title.toLocaleLowerCase('id-ID'); if (seen.has(h.key) || seen.has(k)) return false; seen.add(h.key); seen.add(k); return true; })
    .slice(0, limit).map(({ rank: _rank, ...h }) => h);
}

/** "27 Okt" for a past day, "Hari ini" for today. */
export const highlightDate = (date: string, today: string) => date === today ? 'Hari ini' : dayMonth(date);
