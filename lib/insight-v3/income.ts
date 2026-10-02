/**
 * Insight V3 — income structure and cashflow dependency.
 *
 * Regular pay vs irregular income (lembur, bonus, freelance, proyek…): a claim payout is reimbursement, and a friend
 * paying back is the user's own money, so neither is income (lib/accounting.ts transactionIncome already says so).
 * The income floor for resilience is the conservative one: regular pay, the lowest of the recent cycles. Overtime and
 * bonus never enter it. "Sustainable under average income but not salary-only" is said only when both sides are
 * read from at least 3 complete cycles.
 */
import { mean, quantile } from '../insight-v25/baseline.ts';
import { confidence } from '../insight-v25/confidence.ts';
import { signal, pct, rp, short } from '../insight-v25/signals/common.ts';
import type { InsightSignal } from '../insight-v25/types.ts';
import type { FinancialWorld } from './world.ts';

export function incomeStructure(world: FinancialWorld) {
  const c = world.historicalCycles;
  const spend = quantile(c.map(x => x.expense), .5);
  return { cycles: c.length, average: mean(c.map(x => x.income)), regular: world.income.regularTypical, floor: world.income.floor, irregularShare: world.income.irregularShare, typicalSpend: spend };
}

export function incomeSignalsV3(world: FinancialWorld): InsightSignal[] {
  const s = incomeStructure(world), out: InsightSignal[] = [];
  if (s.cycles < 3) return out;
  if (s.irregularShare >= .1) out.push(signal({
    signature: 'income:dependency', domain: 'income', type: 'income_dependency',
    title: `${pct(s.irregularShare)} pemasukan dari sumber tidak tetap`,
    summary: `Dalam ${s.cycles} siklus terakhir, ${pct(s.irregularShare)} pemasukan berasal dari lembur, bonus, proyek, atau sumber tidak tetap lain. Untuk rencana, Insight memakai gaji tetap saja (${rp(s.floor)}).`,
    headline: `${pct(s.irregularShare)} pemasukan dari sumber tidak tetap`,
    tone: 'neutral', severity: .25, deepDive: 'cashflow', confidence: confidence({ cycles: s.cycles }), current: s.irregularShare, unit: 'percent', material: s.irregularShare >= .2,
    evidence: [{ label: 'Rata-rata pemasukan', value: rp(s.average) }, { label: 'Gaji tetap biasanya', value: rp(s.regular) }, { label: 'Batas aman (gaji tetap terendah)', value: rp(s.floor) }],
    caveats: ['Lembur, bonus, dan sampingan tidak pernah dihitung sebagai pemasukan pasti.'],
  }, world.asOf));
  // Sustainability: spending covered by average income but not by regular pay alone.
  if (s.average >= s.typicalSpend && s.floor < s.typicalSpend && s.average - s.floor >= 300_000) out.push(signal({
    signature: 'cashflow:dependency', domain: 'cashflow', type: 'spending_depends_on_extra',
    title: 'Pengeluaran biasa butuh pemasukan tambahan',
    summary: `Pengeluaran biasa ${rp(s.typicalSpend)} per siklus tertutup oleh rata-rata pemasukan (${rp(s.average)}), tetapi tidak oleh gaji tetap saja (${rp(s.floor)}). Selisihnya ${rp(s.typicalSpend - s.floor)}.`,
    headline: `Tanpa pemasukan tambahan, siklus kurang ${short(s.typicalSpend - s.floor)}`,
    tone: 'watch', severity: .45, deepDive: 'cashflow', confidence: confidence({ cycles: s.cycles }), current: s.typicalSpend, baseline: s.floor, delta: s.typicalSpend - s.floor, impact: s.typicalSpend - s.floor, actionable: true, material: true,
    evidence: [{ label: 'Pengeluaran biasa (median)', value: rp(s.typicalSpend) }, { label: 'Rata-rata pemasukan', value: rp(s.average) }, { label: 'Gaji tetap terendah', value: rp(s.floor) }],
    caveats: ['Ini gambaran bila pemasukan tambahan tidak datang, bukan ramalan.'],
  }, world.asOf));
  return out;
}

/**
 * Goal trade-offs: what each path does, side by side. Keep all contributions / prioritise one goal / pause the wish
 * list. Delays are estimated only when the goal has a deadline and the numbers are there. No path is "best".
 */
export type GoalOption = { key: string; label: string; detail: string; delays: { name: string; months: number }[] };
export function goalTradeoffs(world: FinancialWorld, surplus: number, wishMonthly: number): GoalOption[] {
  const goals = world.targets.filter(t => t.perMonth > 0 && t.status !== 'reached' && t.monthsLeft);
  const demand = goals.reduce((n, g) => n + g.perMonth, 0);
  if (goals.length < 1 || demand <= surplus || surplus <= 0) return [];
  const months = (g: typeof goals[number], perMonth: number) => perMonth > 0 ? Math.ceil((g.target - g.current) / perMonth) : Infinity;
  const options: GoalOption[] = [];
  // Keep all: everyone gets the same share of what is left.
  const ratio = surplus / demand;
  options.push({ key: 'keep-all', label: 'Pertahankan semua setoran', detail: `Sisa uang hanya cukup ${Math.round(ratio * 100)}% dari total kebutuhan; semua target melambat bersama.`, delays: goals.map(g => ({ name: g.name, months: Math.max(0, months(g, g.perMonth * ratio) - (g.monthsLeft || 0)) })) });
  for (const first of goals) {
    // The chosen goal gets what it needs (or all that is left); the others share the rest.
    const own = Math.min(first.perMonth, surplus), rest = surplus - own;
    const others = goals.filter(g => g !== first), otherDemand = others.reduce((n, g) => n + g.perMonth, 0);
    options.push({ key: `first-${first.id}`, label: `Dahulukan ${first.name}`, detail: own >= first.perMonth ? `${first.name} tetap sesuai rencana; target lain berbagi sisa ${short(rest)}/bln.` : `Seluruh sisa ${short(surplus)}/bln ke ${first.name}, masih di bawah kebutuhannya; target lain berhenti dulu.`, delays: [{ name: first.name, months: Math.max(0, months(first, own) - (first.monthsLeft || 0)) }, ...others.map(g => ({ name: g.name, months: Math.max(0, months(g, otherDemand ? g.perMonth * rest / otherDemand : 0) - (g.monthsLeft || 0)) }))] });
  }
  if (wishMonthly > 0) { const r = Math.min(1, (surplus + wishMonthly) / demand); options.push({ key: 'pause-wish', label: 'Tunda setoran wish list', detail: `Menambah ${short(wishMonthly)}/bln untuk target utama; cukup ${Math.round(r * 100)}% dari kebutuhan.`, delays: goals.map(g => ({ name: g.name, months: Math.max(0, months(g, g.perMonth * r) - (g.monthsLeft || 0)) })) }); }
  return options;
}
