/**
 * Insight V2.5 — "Tidak biasa": single transactions far above what the same place (or the same subcategory) usually
 * costs, judged with median and MAD so one earlier big purchase does not hide the next. A purchase that was
 * planned (a posted Rencana, a bought wish-list item, a recurring charge) is never called unusual.
 */
import { stats } from '../baseline.ts';
import { confidence } from '../confidence.ts';
import { addDays, daysBetween, merchantKey, type InsightContext, type Line } from '../context.ts';
import type { InsightSignal } from '../types.ts';
import { clamp01, dateText, rp, short, signal } from './common.ts';

export function anomalySignals(ctx: InsightContext): InsightSignal[] {
  const past = ctx.cycles.flatMap(c => c.lines).filter(l => l.tx.type === 'expense');
  if (past.length < 20) return [];
  const { plannedTransactions = [], wishlist = [] } = ctx.input.data;
  const planned = new Set([...plannedTransactions.map(p => p.postedTransactionId).filter(Boolean)] as string[]);
  const isPlanned = (l: Line) => Boolean(l.tx.plannedId || planned.has(l.tx.id) || l.tx.recurringTransactionId || l.tx.draftId
    || wishlist.some(w => w.status === 'bought' && w.boughtDate && Math.abs(daysBetween(w.boughtDate, l.date)) <= 3 && Math.abs(w.price - l.amount) <= w.price * .1));
  const recent = addDays(ctx.today, -14);
  const candidates = ctx.current.lines.filter(l => l.tx.type === 'expense' && l.date >= recent && l.amount >= 150_000);
  const out: InsightSignal[] = [];
  for (const l of candidates) {
    const key = merchantKey(l.merchant);
    const groups: [string, Line[]][] = [[l.merchant, key ? past.filter(p => merchantKey(p.merchant) === key) : []], [ctx.nameOf(l.subcategoryId), l.subcategoryId !== 'none' ? past.filter(p => p.subcategoryId === l.subcategoryId) : []], [ctx.nameOf(l.categoryId), past.filter(p => p.categoryId === l.categoryId)]];
    const [peerName, peers] = groups.find(([, list], i) => list.length >= (i === 2 ? 8 : 5)) || ['', []];
    if (!peers.length) continue;
    const s = stats(peers.map(p => p.amount)), z = (l.amount - s.median) / Math.max(1.4826 * s.mad, s.median * .25, 1);
    if (l.amount < s.median * 3 || z < 4) continue;
    const wasPlanned = isPlanned(l);
    if (wasPlanned) continue;
    out.push(signal({
      signature: `behavior:unusual:${l.tx.id}`, domain: 'behavior', type: 'unusual_transaction',
      title: `Tidak biasa: ${short(l.amount)} di ${l.merchant || peerName}`,
      summary: `${rp(l.amount)} pada ${dateText(l.date)}, sedangkan transaksi di ${peerName} biasanya sekitar ${rp(s.median)}. Kalau memang direncanakan, abaikan saja.`,
      headline: `Ada transaksi ${short(l.amount)} di ${l.merchant || peerName}, jauh di atas biasanya`,
      tone: 'watch', severity: clamp01(.3 + Math.min(.4, l.amount / Math.max(1, ctx.input.monthlySalary || 5_000_000))), deepDive: 'habits',
      confidence: confidence({ samples: peers.length, direct: false }), current: l.amount, baseline: s.median, delta: l.amount - s.median, impact: 0, urgency: .2, actionable: false, material: true,
      evidence: [{ label: 'Transaksi ini', value: rp(l.amount), note: dateText(l.date), txIds: [l.tx.id] }, { label: `Biasanya di ${peerName}`, value: rp(s.median), note: `median ${peers.length} transaksi; rentang ${short(s.p25)}–${short(s.p75)}` }],
      caveats: ['Transaksi dari rencana, daftar keinginan yang sudah dibeli, dan jadwal rutin tidak pernah ditandai tidak biasa.'],
      action: { label: 'Periksa transaksinya', target: { view: 'transactions', focus: `search:${l.merchant || l.tx.description}@${ctx.current.start}..${ctx.current.end}` } },
    }, ctx.today));
  }
  return out;
}
