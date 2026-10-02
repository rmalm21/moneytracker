/**
 * Insight V2.5 — money friends owe (piutang, Split Bill shares included): aging, due dates, partial payments,
 * how much sits with one person, and how long repayments usually took. No "trust score" for people: only facts.
 * A receivable is not cash: it never counts as available money.
 */
import { quantile, sum } from '../baseline.ts';
import { confidence } from '../confidence.ts';
import { daysBetween, type InsightContext } from '../context.ts';
import type { InsightSignal } from '../types.ts';
import { agingBuckets, availableOf } from './claims.ts';
import { clamp01, dateText, pct, rp, short, signal } from './common.ts';

export function receivableSignals(ctx: InsightContext): InsightSignal[] {
  const { receivables } = ctx.input.data, ledger = ctx.input.history;
  const open = receivables.filter(r => r.remainingAmount > 0 && r.status !== 'paid');
  if (!open.length) return [];
  const age = (r: typeof open[number]) => Math.max(0, daysBetween(r.date, ctx.today));
  const overdue = (r: typeof open[number]) => r.dueDate && r.dueDate < ctx.today ? daysBetween(r.dueDate, ctx.today) : 0;
  // Repayment time of settled ones: from the loan to its last payment.
  const durations = receivables.filter(r => r.status === 'paid' && r.date).map(r => {
    const pays = [...ledger.filter(tx => tx.receivableId === r.id && tx.type === 'receivable_payment').map(tx => tx.date), ...(r.manualPayments || []).map(p => p.date)].sort();
    return pays.length ? daysBetween(r.date, pays[pays.length - 1]) : null;
  }).filter((d): d is number => d !== null && d >= 0);
  const usual = durations.length >= 3 ? quantile(durations, .5) : null;
  const total = sum(open.map(r => r.remainingAmount));
  const byPerson = new Map<string, { name: string; amount: number; count: number }>();
  for (const r of open) { const key = r.person.trim().toLocaleLowerCase('id-ID'); const row = byPerson.get(key) || { name: r.person.trim(), amount: 0, count: 0 }; row.amount += r.remainingAmount; row.count++; byPerson.set(key, row); }
  const people = [...byPerson.values()].sort((a, b) => b.amount - a.amount);
  const late = open.filter(r => overdue(r) > 7 || !r.dueDate && age(r) > Math.max(30, usual ? usual * 2 : 0));
  const partial = open.filter(r => r.remainingAmount < r.originalAmount);
  const out: InsightSignal[] = [];
  out.push(signal({
    signature: 'receivable:outstanding', domain: 'receivable', type: 'receivable_outstanding',
    title: `${people.length} orang masih berutang padamu · ${short(total)}`,
    summary: `${usual !== null ? `Biasanya pinjaman kembali ±${Math.round(usual)} hari (dari ${durations.length} yang lunas).` : 'Riwayat pelunasan belum cukup untuk tahu lama kembalinya.'} Uang ini belum dihitung sebagai uang tersedia.`,
    headline: `${short(total)} piutang belum kembali${late.length ? `, ${late.length} sudah lama` : ''}`,
    tone: late.length ? 'watch' : 'neutral', severity: clamp01(.15 + (late.length ? .25 : 0) + Math.min(.3, total / Math.max(1, availableOf(ctx)) * .3)),
    confidence: confidence({ direct: true }), deepDive: 'duty', current: total, urgency: clamp01(late.length ? .45 : .1), actionable: late.length > 0, material: late.length > 0 || total >= 500_000,
    evidence: [
      ...agingBuckets(open, age, r => r.remainingAmount).filter(b => b.count).map(b => ({ label: `Umur ${b.label}`, value: rp(b.amount), note: `${b.count} catatan` })),
      ...(partial.length ? [{ label: 'Sudah dicicil sebagian', value: `${partial.length} catatan`, note: `sisa ${rp(sum(partial.map(r => r.remainingAmount)))}` }] : []),
      ...people.slice(0, 3).map(p => ({ label: p.name, value: rp(p.amount), note: `${pct(p.amount / total)} dari total` })),
      ...(usual !== null ? [{ label: 'Lama kembali biasanya', value: `±${Math.round(usual)} hari`, note: 'riwayat, bukan janji' }] : []),
    ],
    caveats: usual === null ? ['Lama kembali biasanya muncul setelah minimal 3 piutang lunas tercatat.'] : [],
    action: { label: 'Buka piutang', target: { view: 'receivables' } },
  }, ctx.today));
  for (const r of late) out.push(signal({
    signature: `receivable:late:${r.id}`, domain: 'receivable', type: 'receivable_late', parent: 'receivable:outstanding',
    title: overdue(r) ? `${r.person} lewat ${overdue(r)} hari dari janji` : `Piutang ${r.person} sudah ${age(r)} hari`,
    summary: `Sisa ${rp(r.remainingAmount)}${r.remainingAmount < r.originalAmount ? ` dari ${rp(r.originalAmount)}` : ''}, dipinjam ${dateText(r.date)}${r.dueDate ? `, janji kembali ${dateText(r.dueDate)}` : ''}.`,
    headline: `${r.person} masih ${rp(r.remainingAmount)}${overdue(r) ? `, lewat ${overdue(r)} hari` : ''}`,
    tone: 'watch', severity: clamp01(.25 + (overdue(r) || age(r)) / 120), confidence: confidence({ direct: true }), deepDive: 'duty',
    current: r.remainingAmount, urgency: clamp01((overdue(r) || age(r) / 2) / 45), actionable: true, material: true,
    evidence: [{ label: 'Dipinjam', value: dateText(r.date) }, ...(r.dueDate ? [{ label: 'Janji kembali', value: dateText(r.dueDate) }] : []), { label: 'Sisa', value: rp(r.remainingAmount) }, ...(r.sourceType === 'split_bill' ? [{ label: 'Asal', value: 'Split Bill' }] : [])],
    action: { label: 'Ingatkan lewat menu Piutang', target: { view: 'receivables', focus: r.id } },
  }, ctx.today));
  const top = people[0];
  if (people.length >= 2 && top.amount / total >= .6 && top.amount >= 500_000) out.push(signal({
    signature: `receivable:concentration`, domain: 'receivable', type: 'receivable_concentration', parent: 'receivable:outstanding',
    title: `${pct(top.amount / total)} piutang ada di ${top.name}`, summary: `${rp(top.amount)} dari ${rp(total)} piutang terbuka ada di satu orang.`,
    headline: `Sebagian besar piutang ada di ${top.name}`,
    tone: 'neutral', severity: .2, confidence: confidence({ direct: true }), deepDive: 'duty', current: top.amount, material: false,
    evidence: people.slice(0, 4).map(p => ({ label: p.name, value: rp(p.amount), note: `${p.count} catatan` })),
  }, ctx.today));
  return out;
}
