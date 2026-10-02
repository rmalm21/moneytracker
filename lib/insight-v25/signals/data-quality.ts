/**
 * Insight V2.5 — how complete the data is. Spending without a category, half-recorded cycles and Data Health
 * findings (lib/finance-control.ts scanData) lower the confidence of other signals and are shown as their own
 * notes, so the user knows what to fix for sharper readings.
 */
import { sum } from '../baseline.ts';
import { confidence } from '../confidence.ts';
import type { InsightContext } from '../context.ts';
import type { InsightSignal } from '../types.ts';
import { pct, rp, signal } from './common.ts';

export function dataQualitySignals(ctx: InsightContext): InsightSignal[] {
  const out: InsightSignal[] = [], q = ctx.quality;
  if (q.uncategorizedCurrent >= .05) {
    const lines = ctx.current.lines.filter(l => l.categoryId === 'uncategorized' && l.tx.type === 'expense');
    out.push(signal({
      signature: 'data:uncategorized', domain: 'data', type: 'uncategorized_share',
      title: `${pct(q.uncategorizedCurrent)} pengeluaran belum memiliki kategori`,
      summary: `${rp(sum(lines.map(l => l.amount)))} dari ${new Set(lines.map(l => l.tx.id)).size} transaksi siklus ini. Analisis per kategori jadi kurang tajam sampai kategorinya diisi.`,
      headline: `${pct(q.uncategorizedCurrent)} pengeluaran siklus ini belum berkategori`,
      tone: q.uncategorizedCurrent >= .15 ? 'watch' : 'neutral', severity: Math.min(.5, q.uncategorizedCurrent * 1.5), deepDive: 'spending', unit: 'percent',
      confidence: confidence({ direct: true }), current: q.uncategorizedCurrent, actionable: true, material: q.uncategorizedCurrent >= .15,
      evidence: [{ label: 'Belum berkategori', value: rp(sum(lines.map(l => l.amount))), txIds: lines.slice(0, 12).map(l => l.tx.id) }, { label: 'Porsi dari pengeluaran siklus ini', value: pct(q.uncategorizedCurrent) }],
      action: { label: 'Isi kategorinya', target: { view: 'transactions', focus: `type:expense@${ctx.current.start}..${ctx.current.end}` } },
    }, ctx.today));
  }
  const skipped = ctx.cycles.filter(c => !c.usable);
  if (skipped.length) out.push(signal({
    signature: 'data:sparse-cycles', domain: 'data', type: 'sparse_cycles',
    title: `${skipped.length} siklus tampak belum tercatat lengkap`, summary: `Siklus ${skipped.map(c => c.label).join(', ')} punya jauh lebih sedikit catatan dari biasanya, jadi tidak dipakai sebagai pembanding.`,
    tone: 'neutral', severity: .15, deepDive: 'spending', confidence: confidence({ direct: true }), unit: 'count', material: false,
    evidence: skipped.map(c => ({ label: `Siklus ${c.label}`, value: `${c.lines.length} catatan pengeluaran` })),
  }, ctx.today));
  if (q.issues > 0) out.push(signal({
    signature: 'data:health', domain: 'data', type: 'data_health_issues',
    title: `${q.issues} catatan perlu diperiksa di Kesehatan Data`, summary: 'Saldo, kategori, atau tautan yang tidak cocok bisa membuat angka Insight kurang tepat.',
    tone: 'neutral', severity: .2, deepDive: 'spending', confidence: confidence({ direct: true }), unit: 'count', actionable: true, material: false, current: q.issues,
    action: { label: 'Buka Kesehatan Data', target: { view: 'health' } },
  }, ctx.today));
  return out;
}
