/**
 * Insight V2.5 — recurring price drift: a bill or subscription that used to cost the same and now costs something
 * else ("Netflix Rp54.000 → Rp65.000"). A change is information, not a verdict: it is shown neutrally with its
 * yearly effect. Scheduled changes the user already set (Recurring.pendingChange) are shown as planned, not drift.
 */
import { quantile } from '../baseline.ts';
import { confidence } from '../confidence.ts';
import { merchantKey, type InsightContext, type Line } from '../context.ts';
import type { InsightSignal } from '../types.ts';
import { dateText, pct, rp, signal } from './common.ts';

export function recurringSignals(ctx: InsightContext): InsightSignal[] {
  const out: InsightSignal[] = [];
  const lines = [...ctx.cycles.flatMap(c => c.lines), ...ctx.current.lines].filter(l => l.tx.type === 'expense');
  const groups = new Map<string, Line[]>();
  for (const l of lines) {
    const key = l.tx.recurringTransactionId ? `r:${l.tx.recurringTransactionId}` : l.merchant ? `m:${merchantKey(l.merchant)}|${l.subcategoryId}` : '';
    if (!key) continue;
    const list = groups.get(key) || []; list.push(l); groups.set(key, list);
  }
  const cycleOf = (date: string) => [...ctx.cycles, ctx.current].findIndex(c => date >= c.start && date < c.end);
  for (const [key, list] of groups) {
    const byCycle = new Map<number, Line[]>(); for (const l of list) { const i = cycleOf(l.date); byCycle.set(i, [...(byCycle.get(i) || []), l]); }
    // A recurring charge: once per cycle, in at least 4 cycles (scheduled ones: 3).
    if (byCycle.size < (key.startsWith('r:') ? 3 : 4) || [...byCycle.values()].some(v => v.length > 1)) continue;
    const ordered = [...list].sort((a, b) => a.date.localeCompare(b.date));
    // The latest price may already have repeated: compare the trailing run of the new price with what came before.
    const last = ordered[ordered.length - 1];
    let from = ordered.length - 1; while (from > 0 && Math.abs(ordered[from - 1].amount - last.amount) <= last.amount * .01) from--;
    const earlier = ordered.slice(0, from).map(l => l.amount), since = ordered[from];
    if (earlier.length < 2) continue;
    const usual = quantile(earlier, .5);
    // The earlier ones must have been steady (a fixed price), or the "change" is just normal variation.
    if (earlier.some(v => Math.abs(v - usual) > usual * .03)) continue;
    const diff = last.amount - usual;
    if (Math.abs(diff) < Math.max(2_000, usual * .05)) continue;
    const name = last.merchant || ctx.nameOf(last.subcategoryId !== 'none' ? last.subcategoryId : last.categoryId);
    const up = diff > 0, yearly = diff * 12;
    out.push(signal({
      signature: `recurring:drift:${key.replace(/[^a-z0-9:|-]+/gi, '-')}`, domain: 'recurring', type: up ? 'recurring_up' : 'recurring_down',
      title: `${name} ${up ? 'naik' : 'turun'} ${pct(Math.abs(diff) / usual)}`,
      summary: `Dari ${rp(usual)} menjadi ${rp(last.amount)} sejak ${dateText(since.date)}. Setahun ${up ? 'bertambah' : 'berkurang'} ±${rp(Math.abs(yearly))}.`,
      headline: `${name} kini ${rp(last.amount)} (sebelumnya ${rp(usual)})`,
      tone: up ? 'neutral' : 'positive', severity: up ? Math.min(.45, .15 + Math.abs(diff) / usual * .6) : .15, deepDive: 'prices',
      confidence: confidence({ direct: true, samples: list.length }), current: last.amount, baseline: usual, delta: diff, impact: diff, actionable: false, material: Math.abs(yearly) >= 100_000,
      evidence: [...ordered.slice(-5).map(l => ({ label: dateText(l.date), value: rp(l.amount), txIds: [l.tx.id] })), { label: 'Efek per tahun', value: `${up ? '+' : '−'}${rp(Math.abs(yearly))}` }],
      caveats: ['Perubahan harga langganan belum tentu buruk: bisa karena paket atau pajak baru.'],
      action: { label: 'Lihat pengeluaran rutin', target: { view: 'recurring' } },
    }, ctx.today));
  }
  for (const r of ctx.input.data.recurring.filter(r => r.active && r.pendingChange && r.pendingChange.amount !== r.amount)) {
    const change = r.pendingChange!, diff = change.amount - r.amount;
    out.push(signal({
      signature: `recurring:planned:${r.id}`, domain: 'recurring', type: 'recurring_planned_change',
      title: `${r.name} ${diff > 0 ? 'naik' : 'turun'} mulai ${dateText(change.from)}`, summary: `Jadwal rutin berubah dari ${rp(r.amount)} menjadi ${rp(change.amount)} (sudah kamu atur).`,
      tone: 'neutral', severity: .1, deepDive: 'prices', confidence: confidence({ direct: true }), current: change.amount, baseline: r.amount, delta: diff, impact: diff, material: false,
      evidence: [{ label: 'Sekarang', value: rp(r.amount) }, { label: `Mulai ${dateText(change.from)}`, value: rp(change.amount) }],
      action: { label: 'Lihat jadwal rutin', target: { view: 'recurring' } },
    }, ctx.today));
  }
  return out;
}
