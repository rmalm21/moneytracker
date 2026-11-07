/**
 * Insight 8.5 — habits that jumped this week: a subcategory (or a category without one) spent at least twice its usual
 * week in the last 7 days ("Kopi minggu ini 2,3× rata-ratamu"). The usual week is the mean of the 8 weeks before
 * (weeks with nothing count as zero), and only habits seen in at least 3 of those weeks are judged, so a one-off
 * purchase is left to "Tidak biasa". Recurring charges and planned purchases do not count.
 */
import { addDays, type InsightContext, type Line } from '../context.ts';
import type { InsightSignal } from '../types.ts';
import { clamp01, rp, signal } from './common.ts';

const WEEKS = 8, MIN_WEEKS_SEEN = 3, MIN_RATIO = 2, MIN_EXTRA = 40_000;
const times = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('id-ID')}×`;

export function weeklySignals(ctx: InsightContext): InsightSignal[] {
  const seen = new Set<string>(), lines: Line[] = [];
  for (const l of [...ctx.cycles.flatMap(c => c.lines), ...ctx.current.lines]) {
    if (l.tx.type !== 'expense' || l.tx.recurringTransactionId || l.tx.plannedId || seen.has(`${l.tx.id}:${l.subcategoryId}:${l.categoryId}`)) continue;
    seen.add(`${l.tx.id}:${l.subcategoryId}:${l.categoryId}`); lines.push(l);
  }
  const weekStart = addDays(ctx.today, -6), oldest = addDays(weekStart, -7 * WEEKS);
  if (!lines.some(l => l.date < addDays(weekStart, -7 * (MIN_WEEKS_SEEN + 1)))) return [];
  type Group = { id: string; now: number; count: number; txIds: string[]; weeks: number[] };
  const groups = new Map<string, Group>();
  for (const l of lines) {
    if (l.date < oldest || l.date > ctx.today) continue;
    const id = l.subcategoryId && l.subcategoryId !== 'none' ? l.subcategoryId : l.categoryId;
    if (!id || id === 'none') continue;
    const g: Group = groups.get(id) || { id, now: 0, count: 0, txIds: [] as string[], weeks: Array<number>(WEEKS).fill(0) };
    if (l.date >= weekStart) { g.now += l.amount; g.count++; g.txIds.push(l.tx.id); }
    else { const back = Math.floor((Date.parse(`${weekStart}T00:00:00Z`) - Date.parse(`${l.date}T00:00:00Z`) - 1) / (7 * 864e5)); if (back >= 0 && back < WEEKS) g.weeks[back] += l.amount; }
    groups.set(id, g);
  }
  const out: InsightSignal[] = [];
  for (const g of groups.values()) {
    const weeksSeen = g.weeks.filter(x => x > 0).length, usual = g.weeks.reduce((a, b) => a + b, 0) / WEEKS;
    if (weeksSeen < MIN_WEEKS_SEEN || usual <= 0 || g.now < usual * MIN_RATIO || g.now - usual < MIN_EXTRA || g.count < 2) continue;
    const name = ctx.nameOf(g.id), ratio = g.now / usual;
    out.push(signal({
      signature: `spending:week:${g.id}`, domain: 'spending', type: 'weekly_spike',
      title: `${name} minggu ini ${times(ratio)} rata-ratamu`,
      summary: `7 hari terakhir ${rp(g.now)} untuk ${name} (${g.count} transaksi), biasanya sekitar ${rp(Math.round(usual))} seminggu (rata-rata ${WEEKS} minggu).`,
      headline: `${name} minggu ini ${times(ratio)} biasanya`,
      tone: ctx.kindOf(g.id) === 'want' ? 'watch' : 'neutral', deepDive: 'habits',
      severity: clamp01(.25 + Math.min(.35, (ratio - MIN_RATIO) * .12) + Math.min(.2, (g.now - usual) / Math.max(1, ctx.input.monthlySalary || 5_000_000) * 4)),
      current: g.now, baseline: Math.round(usual), delta: Math.round(g.now - usual), impact: Math.round(g.now - usual), urgency: .3, actionable: true, material: true,
      evidence: [{ label: '7 hari terakhir', value: rp(g.now), note: `${g.count} transaksi`, txIds: g.txIds }, { label: 'Biasanya seminggu', value: rp(Math.round(usual)), note: `rata-rata ${WEEKS} minggu, muncul di ${weeksSeen} minggu` }],
      caveats: ['Jadwal rutin dan rencana tidak dihitung. Minggu tanpa transaksi dihitung nol.'],
      action: { label: 'Lihat transaksinya', target: { view: 'transactions', focus: `tx:${g.txIds.join(',')}@${weekStart}..${addDays(ctx.today, 1)}` } },
    }, ctx.today));
  }
  return out.sort((a, b) => b.severity - a.severity).slice(0, 3);
}
