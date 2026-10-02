/**
 * Insight V3 — Financial Brief and "Jelaskan siklus ini".
 *
 * Deterministic templates over signals, the world model, momentum and pressure. Every sentence carries the source
 * it was built from. A contradiction check drops a later sentence that says the opposite about the same domain and
 * horizon (e.g. "cashflow membaik" and "cashflow memburuk"). Nothing is said that no source holds.
 */
import { quantile } from '../insight-v25/baseline.ts';
import { dateText, rp, short } from '../insight-v25/signals/common.ts';
import type { InsightReport } from '../insight-v25/index.ts';
import type { Momentum, Pressure } from './types.ts';
import type { FinancialWorld } from './world.ts';

export type BriefLine = { text: string; source: string; domain: string; polarity: 1 | 0 | -1; horizon: string };

export function noContradiction(lines: BriefLine[]) {
  const out: BriefLine[] = [];
  for (const l of lines) if (!out.some(o => o.domain === l.domain && o.horizon === l.horizon && o.polarity * l.polarity === -1)) out.push(l);
  return out;
}

export function financialBriefV3(v25: InsightReport, world: FinancialWorld, momentum: Momentum, main: Pressure[]): BriefLine[] {
  const lines: BriefLine[] = [];
  const cur = world.currentCycle, cycles = world.historicalCycles;
  if (cycles.length >= 2) {
    const last = cycles[cycles.length - 1], typical = world.income.typical;
    const near = typical && Math.abs(last.income - typical) <= typical * .1;
    lines.push({ text: near ? `Pemasukan siklus lalu ${rp(last.income)}, masih di kisaran biasamu.` : `Pemasukan siklus lalu ${rp(last.income)}, ${last.income > typical ? 'di atas' : 'di bawah'} biasanya (${rp(typical)}).`, source: 'world:income', domain: 'income', polarity: near ? 0 : last.income > typical ? 1 : -1, horizon: 'MULTI_CYCLE' });
  }
  const pace = v25.signals.find(s => s.signature === 'cashflow:spending-pace' && s.lifecycleState !== 'DISMISSED');
  const root = v25.changed.find(s => s.root.domain === 'spending' && (s.root.delta || 0) > 0);
  if (pace) lines.push({ text: `Pengeluaran sampai hari ke-${cur.elapsed} ${rp(Math.abs(pace.delta || 0))} ${(pace.delta || 0) > 0 ? 'di atas' : 'di bawah'} biasanya${root ? `; ${root.root.headline}` : ''}.`, source: pace.signature, domain: 'spending', polarity: (pace.delta || 0) > 0 ? -1 : 1, horizon: 'CURRENT_CYCLE' });
  else if (root) lines.push({ text: `${root.root.headline}.`, source: root.signature, domain: 'spending', polarity: -1, horizon: 'CURRENT_CYCLE' });
  else if (cycles.length >= 2) lines.push({ text: 'Pengeluaran siklus ini masih dalam pola biasamu.', source: 'world:spending', domain: 'spending', polarity: 0, horizon: 'CURRENT_CYCLE' });
  const goods = momentum.parts.filter(p => p.good === true && (p.key === 'debt' || p.key === 'emergency' || p.key === 'savings'));
  if (goods.length) lines.push({ text: `${goods.map(p => `${p.label} ${p.key === 'debt' ? 'berkurang' : 'bertambah'}`).join(' dan ')} (${goods.map(p => p.detail).join('; ')}).`, source: 'momentum', domain: 'progress', polarity: 1, horizon: 'MULTI_CYCLE' });
  const claims = v25.signals.find(s => s.signature === 'claims:outstanding');
  if (claims && claims.lifecycleState !== 'DISMISSED') lines.push({ text: `${claims.title.replace(' · ', ' senilai ')}; uang itu belum dihitung sebagai uang tersedia.`, source: claims.signature, domain: 'claims', polarity: -1, horizon: 'IMMEDIATE' });
  if (momentum.enough) lines.push({ text: `Arah keseluruhan: ${momentum.label.toLowerCase()}${main.length ? `; tekanan utama ${main.map(p => p.label.toLowerCase()).join(' dan ')}` : ''}.`, source: 'momentum', domain: 'overall', polarity: momentum.state === 'IMPROVING' ? 1 : momentum.state === 'UNDER_PRESSURE' ? -1 : 0, horizon: 'MULTI_CYCLE' });
  else if (main.length) lines.push({ text: `Tekanan utama: ${main.map(p => p.label.toLowerCase()).join(' dan ')}.`, source: `pressure:${main[0].domain}`, domain: 'overall', polarity: -1, horizon: 'CURRENT_CYCLE' });
  return noContradiction(lines).slice(0, 5);
}

/** "Jelaskan siklus ini": short sections, each with its source. */
export function explainCycle(v25: InsightReport, world: FinancialWorld, momentum: Momentum, main: Pressure[]) {
  const cur = world.currentCycle, typical = quantile(world.historicalCycles.map(c => c.expense), .5);
  const upcoming = world.obligations.upcoming.filter(e => e.amount < 0 && !e.id.startsWith('salary:') && e.date < cur.end).sort((a, b) => a.amount - b.amount).slice(0, 3);
  return [
    { title: 'Ringkasan', source: 'world', lines: [`Hari ke-${cur.elapsed} dari ${cur.total}, ${cur.daysLeft} hari lagi sampai gajian.`, `Pemasukan siklus ini ${rp(cur.income)}, pengeluaran ${rp(cur.expense)}${typical ? ` (biasanya ${short(typical)} untuk satu siklus penuh)` : ''}.`, `Uang tersedia ${rp(world.liquidity.available)}; Jatah Aman ${rp(world.liquidity.safeDaily)} per hari.`] },
    { title: 'Penyebab utama', source: 'changed', lines: v25.changed.length ? v25.changed.map(s => s.root.headline || s.title) : ['Tidak ada perubahan berarti dibanding pola biasa.'] },
    { title: 'Kemajuan', source: 'progress', lines: [...v25.progress.stories.map(s => s.root.headline || s.title), ...momentum.parts.filter(p => p.good).map(p => `${p.label}: ${p.detail}`)].slice(0, 4) },
    { title: 'Tekanan', source: 'pressure', lines: main.length ? main.flatMap(p => [`${p.label}: ${p.reasons[0]}`]) : ['Tidak ada tekanan berarti.'] },
    { title: 'Kewajiban terdekat', source: 'world:obligations', lines: upcoming.length ? upcoming.map(e => `${dateText(e.date)} · ${e.title} ${rp(-e.amount)}`) : ['Tidak ada tagihan terjadwal sebelum gajian.'] },
  ].filter(s => s.lines.length);
}
