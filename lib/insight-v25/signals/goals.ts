/**
 * Insight V2.5 — goal portfolio: what all goals with a deadline need per month together, against the money that is
 * usually left over. When they do not fit, the trade-offs are listed (push a deadline, lower a target) and the user
 * chooses — Insight never picks a goal for them. Per-goal numbers come from lib/savings.ts savingsPlan.
 */
import { isKantong } from '../../pockets.ts';
import { savingsPlan } from '../../savings.ts';
import { quantile, sum } from '../baseline.ts';
import { confidence } from '../confidence.ts';
import type { InsightContext } from '../context.ts';
import type { InsightSignal } from '../types.ts';
import { incomeProfile } from './income.ts';
import { clamp01, rp, short, signal } from './common.ts';

export function goalSignals(ctx: InsightContext): InsightSignal[] {
  const funds = ctx.input.data.funds.filter(f => !f.isArchived && f.targetAmount > 0 && f.targetDate);
  if (!funds.length || ctx.baseline.length < 2) return [];
  const plans = funds.map(f => {
    const current = isKantong(f) ? sum((f.walletIds || []).map(id => ctx.input.data.wallets.find(w => w.id === id)?.cachedBalance || 0)) : f.currentAmount;
    return { fund: f, plan: savingsPlan({ ...f, currentAmount: Math.max(0, current) }, ctx.today) };
  }).filter(p => p.plan.remaining > 0 && p.plan.status !== 'overdue');
  if (!plans.length) return [];
  const demand = sum(plans.map(p => p.plan.perMonth));
  const income = incomeProfile(ctx).typical;
  // What is usually left: income minus spending of the complete cycles; goal deposits are transfers, not spending.
  const surplus = income - quantile(ctx.baseline.map(c => c.expense), .5);
  if (demand <= Math.max(0, surplus)) return [];
  const gap = demand - Math.max(0, surplus);
  const options = plans.sort((a, b) => b.plan.perMonth - a.plan.perMonth).map(p => {
    const months = p.plan.monthsLeft || 1, slower = Math.ceil(p.plan.remaining / Math.max(1, p.plan.perMonth - gap));
    return { label: p.fund.name, value: `${rp(p.plan.perMonth)}/bln`, note: p.plan.perMonth > gap ? `pilihan: mundurkan tenggat ±${Math.max(1, slower - months)} bulan untuk menutup kekurangan ${short(gap)}/bln` : `sisa ${rp(p.plan.remaining)}, ${months} bulan lagi; menunda ini saja belum menutup kekurangan` };
  });
  return [signal({
    signature: 'goals:pressure', domain: 'goals', type: 'goals_over_surplus',
    title: `Target dana butuh ${short(demand)}/bln, sisa biasanya ${short(Math.max(0, surplus))}`,
    summary: `Semua target dengan tenggat butuh ${rp(demand)} per bulan, sedangkan sisa uang per siklus biasanya ${rp(Math.max(0, surplus))}. Pilih sendiri mana yang didahulukan atau ditunda.`,
    headline: `Target dana kurang ${short(gap)}/bln dari sisa uang biasanya`,
    tone: gap > surplus * .5 ? 'important' : 'watch', severity: clamp01(.35 + gap / Math.max(1, demand) * .5), deepDive: 'goals',
    confidence: confidence({ cycles: ctx.baseline.length }), current: demand, baseline: Math.max(0, surplus), delta: gap, impact: gap, urgency: .3, actionable: true, material: true,
    evidence: [{ label: 'Kebutuhan semua target', value: `${rp(demand)}/bln` }, { label: 'Sisa uang biasanya', value: `${rp(Math.max(0, surplus))}/bln`, note: 'pemasukan biasa − pengeluaran median per siklus' }, ...options],
    caveats: ['Insight tidak memilihkan target. Pilihan di atas hanya gambaran pertukarannya.'],
    action: { label: 'Atur tujuan dana', target: { view: 'funds' } },
  }, ctx.today)];
}
