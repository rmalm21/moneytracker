/**
 * Insight V2.5 — debt trajectory: total debt at the end of each past cycle, rebuilt from today's balances and the
 * payments recorded since (the same way lib/finance-control.ts rebuilds cycle snapshots). A payoff estimate is shown
 * only when the balance has gone down steadily for at least three cycles without new borrowing; otherwise none.
 * Split Bill paybacks are short-term and have their own card, so they are left out.
 */
import { mean, quantile, stats, sum, volatility } from '../baseline.ts';
import { confidence } from '../confidence.ts';
import type { InsightContext } from '../context.ts';
import type { InsightSignal } from '../types.ts';
import { clamp01, pct, rp, short, signal } from './common.ts';

const createdOn = (value: unknown) => { const s = (value as { seconds?: number } | undefined)?.seconds; return s ? new Date(s * 1000).toISOString().slice(0, 10) : ''; };

export function debtTrajectory(ctx: InsightContext) {
  const debts = ctx.input.data.debts.filter(d => d.sourceType !== 'split_bill');
  const ledger = ctx.input.history;
  const at = (cutoff: string) => sum(debts.map(d => {
    const made = createdOn(d.createdAt);
    if (made && made >= cutoff) return 0;
    const paid = ledger.filter(tx => tx.debtId === d.id && tx.type === 'debt_payment' && tx.date >= cutoff).reduce((n, tx) => n + tx.amount, 0);
    const borrowed = ledger.filter(tx => tx.debtId === d.id && tx.type === 'borrowing' && tx.date >= cutoff).reduce((n, tx) => n + tx.amount, 0);
    const manual = (d.manualPayments || []).filter(p => p.date >= cutoff).reduce((n, p) => n + p.amount, 0) - (d.balanceUpdates || []).filter(u => u.date >= cutoff).reduce((n, u) => n + u.to - u.from, 0);
    return Math.max(0, d.outstandingAmount + paid + manual - borrowed);
  }));
  const points = [...ctx.cycles.map(c => ({ label: c.label, date: c.end, amount: at(c.end) })), { label: 'Kini', date: ctx.today, amount: sum(debts.map(d => Math.max(0, d.outstandingAmount))) }];
  // Only from the first cycle in which some debt existed.
  const first = points.findIndex(p => p.amount > 0);
  return first < 0 ? [] : points.slice(first);
}

export function debtSignals(ctx: InsightContext): InsightSignal[] {
  const points = debtTrajectory(ctx);
  const now = points[points.length - 1]?.amount || 0;
  if (points.length < 3 || !now && points.every(p => !p.amount)) return [];
  const steps = points.slice(1).map((p, i) => points[i].amount - p.amount);
  const startAmount = points[0].amount, change = now - startAmount;
  const decreasing = steps.filter(s => s > 0), rises = steps.filter(s => s < 0);
  const out: InsightSignal[] = [];
  const evidence = points.map(p => ({ label: p.label, value: rp(p.amount) }));
  // Steady payoff: at least three reductions in a row at the end, no rises in that run, similar sizes.
  const run: number[] = []; for (let i = steps.length - 1; i >= 0 && steps[i] > 0; i--) run.unshift(steps[i]);
  const steady = run.length >= 3 && volatility(stats(run)) < .35;
  const pace = steady ? quantile(run, .5) : 0, months = steady && now > 0 ? Math.ceil(now / pace) : null;
  if (change < 0 && Math.abs(change) >= Math.max(100_000, startAmount * .05)) out.push(signal({
    signature: 'debt:trajectory', domain: 'debt', type: 'debt_down',
    title: now === 0 ? 'Utang sudah lunas semua' : `Utang turun ${short(-change)} sejak ${points[0].label}`,
    summary: `Dari ${rp(startAmount)} menjadi ${rp(now)}${months ? `. Dengan pola bayar ±${rp(pace)} per siklus, perkiraan lunas ±${months} bulan lagi.` : '.'}`,
    headline: now === 0 ? 'Semua utang lunas' : `Utang turun ${pct(-change / startAmount)} sejak ${points[0].label}`,
    tone: 'positive', severity: .2, deepDive: 'duty', confidence: confidence({ direct: true, cycles: points.length - 1 }),
    current: now, baseline: startAmount, delta: change, impact: -mean(decreasing), material: true,
    evidence: [...evidence, ...(months ? [{ label: 'Perkiraan lunas', value: `±${months} bulan`, note: `bila tetap membayar ±${rp(pace)} per siklus` }] : [])],
    caveats: months ? [] : ['Perkiraan lunas muncul setelah utang turun stabil minimal 3 siklus berturut-turut.'],
    series: { labels: points.map(p => p.label), values: points.map(p => p.amount) },
    action: { label: 'Buka utang', target: { view: 'debts' } },
  }, ctx.today));
  else if (change > 0 && change >= Math.max(200_000, startAmount * .1)) out.push(signal({
    signature: 'debt:trajectory', domain: 'debt', type: 'debt_up',
    title: `Utang bertambah ${short(change)} sejak ${points[0].label}`,
    summary: `Dari ${rp(startAmount)} menjadi ${rp(now)}. ${rises.length} kali naik dalam ${steps.length} siklus.`,
    headline: `Total utang naik ${short(change)}`,
    tone: change >= startAmount * .3 ? 'important' : 'watch', severity: clamp01(.4 + (startAmount ? change / startAmount : .5) * .5), deepDive: 'duty',
    confidence: confidence({ direct: true, cycles: points.length - 1 }), current: now, baseline: startAmount, delta: change, impact: change / Math.max(1, steps.length), urgency: .4, actionable: true, material: true,
    evidence, series: { labels: points.map(p => p.label), values: points.map(p => p.amount) },
    action: { label: 'Buka utang', target: { view: 'debts' } },
  }, ctx.today));
  return out;
}
