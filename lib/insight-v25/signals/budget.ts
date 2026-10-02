/**
 * Insight V2.5 — budget pressure for the running window, read with lib/accounting.ts budgetCurrent
 * (the same spent / available numbers the Anggaran page shows). A budget belongs to its category's story.
 */
import { budgetCurrent, budgetIconCategoryId, countedBudgets } from '../../accounting.ts';
import { confidence } from '../confidence.ts';
import { daysBetween, parse, type InsightContext } from '../context.ts';
import type { InsightSignal } from '../types.ts';
import { clamp01, pct, rp, signal } from './common.ts';

export function budgetSignals(ctx: InsightContext): InsightSignal[] {
  const { data, history } = ctx.input, out: InsightSignal[] = [];
  for (const budget of countedBudgets(data.budgets.filter(b => b.active))) {
    const now = budgetCurrent(budget, history, data.categories, parse(ctx.today), ctx.salaryDay);
    if (!now.available) continue;
    const fresh = Boolean(budget.createdDate && budget.createdDate >= now.start);
    const length = Math.max(1, daysBetween(now.start, now.end)), passed = Math.min(1, (daysBetween(now.start, ctx.today) + 1) / length);
    const usage = now.spent / now.available, projected = passed >= .2 ? now.spent / passed : now.spent;
    const over = now.spent > now.available, heading = !over && passed >= .2 && projected > now.available * 1.05 && usage >= .5;
    if (!over && !heading) continue;
    const name = budget.name || ctx.nameOf(budgetIconCategoryId(budget));
    const category = ctx.parentOf(budget.categoryId);
    out.push(signal({
      signature: `budget:pressure:${budget.id}`, domain: 'budget', type: over ? 'budget_over' : 'budget_heading_over',
      title: over ? `Anggaran ${name} terlampaui` : `Anggaran ${name} diperkirakan terlampaui`,
      summary: over ? `Terpakai ${rp(now.spent)} dari ${rp(now.available)} (${pct(usage)}).` : `Baru ${pct(passed)} periode berjalan, sudah terpakai ${pct(usage)}.`,
      headline: over ? `Anggaran ${name} lewat ${rp(now.spent - now.available)}` : `Anggaran ${name} mengarah ke ${rp(projected)} dari ${rp(now.available)}`,
      tone: over ? 'important' : 'watch', severity: clamp01(over ? .55 + Math.min(.35, usage - 1) : .35 + (projected / now.available - 1) * .5),
      confidence: confidence({ direct: over, progress: over ? undefined : passed }), deepDive: 'spending', unit: 'money',
      current: now.spent, baseline: now.available, delta: now.spent - now.available, impact: Math.max(0, (over ? now.spent : projected) - now.available),
      urgency: clamp01(over ? .7 : .4 + passed * .3), actionable: true, material: true,
      parent: `spending:category:${category}`,
      evidence: [{ label: 'Terpakai', value: rp(now.spent) }, { label: 'Anggaran periode ini', value: rp(now.available) }, { label: 'Periode berjalan', value: pct(passed) }, ...(over ? [] : [{ label: 'Bila pola sama', value: rp(projected), note: 'perkiraan sampai akhir periode' }])],
      caveats: fresh ? ['Anggaran ini baru dibuat periode ini.'] : [],
      action: { label: 'Buka anggaran', target: { view: 'budgets' } },
    }, ctx.today));
  }
  return out;
}
