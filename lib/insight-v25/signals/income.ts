/**
 * Insight V2.5 — income: usual level, how steady it is, and outlier safety.
 *
 * "Usual" is the robust typical value of the complete cycles (a bonus month is left out of it, never removed from
 * the ledger). Fixed vs variable follows the Insight profile when the user set it, otherwise the history.
 * The running cycle is never judged on income that simply has not arrived yet.
 */
import { compare, stats, volatility } from '../baseline.ts';
import { confidence } from '../confidence.ts';
import type { InsightContext } from '../context.ts';
import type { InsightSignal } from '../types.ts';
import { pct, rp, short, signal } from './common.ts';

export type IncomeProfile = { typical: number; median: number; mean: number; volatility: number; regular: boolean; source: 'profile' | 'history'; outliers: number; cycles: number };

export function incomeProfile(ctx: InsightContext): IncomeProfile {
  const series = ctx.baseline.map(c => c.income);
  const b = compare(0, series, 'full');
  const vol = volatility(stats(b.kept.map(i => series[i])));
  const set = ctx.input.profile?.income;
  return { typical: ctx.profile.monthlyIncome || b.typical || ctx.input.monthlySalary || 0, median: b.stats.median, mean: b.stats.mean, volatility: vol, regular: set ? set === 'fixed' : vol < .2, source: set ? 'profile' : 'history', outliers: b.outliers.length, cycles: series.length };
}

export function incomeSignals(ctx: InsightContext): InsightSignal[] {
  const out: InsightSignal[] = [];
  if (ctx.baseline.length < 3) return out;
  const p = incomeProfile(ctx), series = ctx.baseline.map(c => c.income), labels = ctx.baseline.map(c => c.label);
  // The last complete cycle against the ones before it.
  const last = series[series.length - 1], before = compare(last, series.slice(0, -1), 'full');
  if (before.typical > 0 && Math.abs(before.deltaPct) >= .2 && Math.abs(before.delta) >= 500_000 && Math.abs(before.z) >= 2) {
    const up = before.delta > 0;
    out.push(signal({
      signature: 'income:last-cycle', domain: 'income', type: up ? 'income_up' : 'income_down',
      title: up ? `Pemasukan siklus lalu ${pct(before.deltaPct)} di atas biasanya` : `Pemasukan siklus lalu ${pct(-before.deltaPct)} di bawah biasanya`,
      summary: `${rp(last)} pada siklus ${labels[labels.length - 1]}, biasanya ${rp(before.typical)}.`,
      headline: `Pemasukan siklus lalu ${up ? 'naik' : 'turun'} ${short(Math.abs(before.delta))}`,
      tone: up ? 'positive' : 'watch', severity: up ? .2 : Math.min(.8, .3 + -before.deltaPct), deepDive: 'cashflow',
      confidence: confidence({ cycles: series.length - 1, volatility: volatility(before.stats), z: before.z }),
      current: last, baseline: before.typical, delta: before.delta, impact: before.delta, actionable: !up, material: true,
      evidence: [{ label: 'Siklus lalu', value: rp(last) }, { label: 'Biasanya', value: rp(before.typical), note: `median ${rp(before.stats.median)}` }],
      caveats: up ? ['Pemasukan lebih yang tidak rutin (bonus, THR) tidak dihitung sebagai pemasukan biasa.'] : [],
      series: { labels, values: series },
    }, ctx.today));
  }
  if (!p.regular && p.volatility >= .2) out.push(signal({
    signature: 'income:volatility', domain: 'income', type: 'income_irregular',
    title: 'Pemasukanmu naik-turun', summary: `Antara ${short(Math.min(...series))} dan ${short(Math.max(...series))} per siklus. Pakai angka terendah yang wajar untuk rencana bulanan.`,
    headline: 'Pemasukan tidak tetap: rencanakan dari angka yang aman',
    tone: 'neutral', severity: .3, deepDive: 'cashflow', confidence: confidence({ cycles: series.length }), unit: 'money',
    current: p.median, baseline: p.median, impact: 0, actionable: false, material: false,
    evidence: [{ label: 'Median per siklus', value: rp(p.median) }, { label: 'Rata-rata', value: rp(p.mean) }, { label: 'Terendah wajar', value: rp(stats(series).p25), note: 'kuartil bawah' }, { label: 'Sumber pola', value: p.source === 'profile' ? 'Profil Insight: tidak tetap' : 'Riwayat pemasukan' }],
    caveats: p.outliers ? [`${p.outliers} siklus dengan pemasukan tidak biasa tidak dihitung dalam angka biasa.`] : [],
    series: { labels, values: series },
  }, ctx.today));
  return out;
}
