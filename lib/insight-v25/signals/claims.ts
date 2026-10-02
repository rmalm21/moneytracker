/**
 * Insight V2.5 — office claims (reimbursement): what is still out, how long, and what that means for cash.
 *
 * An unpaid claim is money owed to the user, not money in a wallet: it is never counted as available. The usual
 * payout time is read from the user's own paid claims (median, at least 3) and shown as history, never as a promise.
 */
import { availableMoney } from '../../finance-control.ts';
import { quantile, sum } from '../baseline.ts';
import { confidence } from '../confidence.ts';
import { daysBetween, type InsightContext } from '../context.ts';
import type { InsightSignal } from '../types.ts';
import { clamp01, dateText, pct, rp, short, signal } from './common.ts';

export const AGING_BUCKETS = [['0–7 hari', 0, 7], ['8–14 hari', 8, 14], ['15–30 hari', 15, 30], ['> 30 hari', 31, Infinity]] as const;
export function agingBuckets<T>(items: T[], age: (item: T) => number, amount: (item: T) => number) {
  return AGING_BUCKETS.map(([label, from, to]) => { const list = items.filter(i => age(i) >= from && age(i) <= to); return { label, count: list.length, amount: sum(list.map(amount)) }; });
}
/** Uang tersedia as the dashboard reads it (free − bills/plans in the horizon − safety buffer). */
export const availableOf = (ctx: InsightContext) => availableMoney(ctx.input.stat.free, ctx.input.committed, { freeMoneyBuffer: ctx.input.safetyBuffer });

export function claimSignals(ctx: InsightContext): InsightSignal[] {
  const claims = ctx.input.data.claims || [];
  const open = claims.filter(c => c.remainingAmount > 0 && c.status !== 'paid' && c.status !== 'rejected' && c.submissionDate);
  if (!open.length) return [];
  const age = (c: typeof open[number]) => Math.max(0, daysBetween(c.submissionDate, ctx.today));
  const paidDays = claims.filter(c => c.status === 'paid' && c.paidDate && c.submissionDate && c.paidDate >= c.submissionDate).map(c => daysBetween(c.submissionDate, c.paidDate));
  const usual = paidDays.length >= 3 ? quantile(paidDays, .5) : null;
  const total = sum(open.map(c => c.remainingAmount)), available = availableOf(ctx);
  const buckets = agingBuckets(open, age, c => c.remainingAmount);
  const old = open.filter(c => age(c) > Math.max(30, usual ? usual * 2 : 0));
  const pastExpected = open.filter(c => c.expectedPaymentDate && c.expectedPaymentDate < ctx.today);
  const share = available > 0 ? total / available : Infinity;
  const out: InsightSignal[] = [];
  const usualText = usual !== null ? `Biasanya klaimmu cair ±${Math.round(usual)} hari setelah diajukan (dari ${paidDays.length} klaim lunas).` : 'Riwayat klaim lunas belum cukup untuk tahu lama cair biasanya.';
  out.push(signal({
    signature: 'claims:outstanding', domain: 'claims', type: 'claims_outstanding',
    title: `${open.length} klaim kantor belum cair · ${short(total)}`,
    summary: `${usualText} Uang ini belum dihitung sebagai uang tersedia.`,
    headline: `${short(total)} klaim kantor belum cair${old.length ? `, ${old.length} lebih dari ${Math.max(30, usual ? Math.round(usual * 2) : 0)} hari` : ''}`,
    tone: old.length || pastExpected.length ? 'watch' : 'neutral',
    severity: clamp01(.2 + (old.length ? .25 : 0) + (share >= .5 ? .25 : share >= .25 ? .1 : 0)),
    confidence: confidence({ direct: true }), deepDive: 'duty', current: total, impact: 0, urgency: clamp01(old.length ? .5 : pastExpected.length ? .4 : .1),
    actionable: old.length > 0 || pastExpected.length > 0, material: old.length > 0 || total >= 500_000,
    evidence: [
      ...buckets.filter(b => b.count).map(b => ({ label: `Umur ${b.label}`, value: rp(b.amount), note: `${b.count} klaim` })),
      { label: 'Uang tersedia sekarang', value: rp(available), note: 'klaim yang belum cair tidak dihitung' },
      ...(available > 0 ? [{ label: 'Klaim dibanding uang tersedia', value: pct(total / available) }] : []),
      ...(usual !== null ? [{ label: 'Lama cair biasanya', value: `±${Math.round(usual)} hari`, note: `median ${paidDays.length} klaim lunas; riwayat, bukan janji` }] : []),
    ],
    caveats: usual === null ? ['Perkiraan lama cair muncul setelah minimal 3 klaim lunas tercatat.'] : [],
    action: { label: 'Buka klaim', target: { view: 'claims' } },
  }, ctx.today));
  for (const c of [...new Set([...old, ...pastExpected])]) out.push(signal({
    signature: `claims:aging:${c.id}`, domain: 'claims', type: 'claim_aging', parent: 'claims:outstanding',
    title: `Klaim ${c.name} sudah ${age(c)} hari`,
    summary: `${rp(c.remainingAmount)} diajukan ${dateText(c.submissionDate)}${c.expectedPaymentDate ? `, perkiraan cair ${dateText(c.expectedPaymentDate)}` : ''}.${usual !== null ? ` Biasanya ±${Math.round(usual)} hari.` : ''}`,
    headline: `Klaim ${c.name} ${rp(c.remainingAmount)} belum cair ${age(c)} hari`,
    tone: 'watch', severity: clamp01(.3 + age(c) / 120), confidence: confidence({ direct: true }), deepDive: 'duty', unit: 'money',
    current: c.remainingAmount, impact: 0, urgency: clamp01(age(c) / 60), actionable: true, material: true,
    evidence: [{ label: 'Diajukan', value: dateText(c.submissionDate) }, { label: 'Umur', value: `${age(c)} hari` }, ...(c.expectedPaymentDate ? [{ label: 'Perkiraan cair', value: dateText(c.expectedPaymentDate), note: c.expectedPaymentDate < ctx.today ? 'sudah lewat' : '' }] : [])],
    action: { label: 'Tanyakan ke kantor, lalu catat bila cair', target: { view: 'claims', focus: c.id } },
  }, ctx.today));
  return out;
}
