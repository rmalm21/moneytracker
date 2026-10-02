/**
 * Insight V2.5 — how sure a reading is (never how serious it is).
 *
 * Starts sure and loses certainty for each weakness, each one named in plain words so the evidence drawer can say
 * why: few complete cycles, values that swing a lot, a change that is small next to the usual swing, a cycle that
 * has barely started, spending without a category (Data Health), few transactions behind the number.
 * Shown only as a label: "Keyakinan tinggi", "Cukup yakin" or "Data terbatas" — no percentages.
 */
import type { Confidence } from './types.ts';

export type ConfidenceInput = {
  /** Complete cycles behind the baseline. */
  cycles?: number;
  /** Robust coefficient of variation of the baseline. */
  volatility?: number;
  /** |robust z| of the change. */
  z?: number;
  /** Share of the running cycle that has passed (only for running-cycle comparisons). */
  progress?: number;
  /** Share of spending without a category that this reading depends on. */
  uncategorized?: number;
  /** Number of observations (transactions, payments, receipts) behind the number. */
  samples?: number;
  /** A fact read straight from a record (a claim's date, a debt balance): no estimate involved. */
  direct?: boolean;
};

export const confidenceLabels = { high: 'Keyakinan tinggi', medium: 'Cukup yakin', low: 'Data terbatas' } as const;

export function confidence(input: ConfidenceInput): Confidence {
  let score = 1;
  const reasons: string[] = [];
  if (input.direct) reasons.push('Dibaca langsung dari catatanmu');
  if (input.cycles !== undefined) {
    if (input.cycles < 2) { score *= .4; reasons.push(`Baru ${input.cycles} siklus lengkap untuk pembanding`); }
    else if (input.cycles < 3) { score *= .65; reasons.push('Baru 2 siklus lengkap untuk pembanding'); }
    else if (input.cycles < 5) { score *= .88; reasons.push(`${input.cycles} siklus lengkap untuk pembanding`); }
    else reasons.push(`${input.cycles} siklus lengkap untuk pembanding`);
  }
  if (input.volatility !== undefined && input.volatility > .45) { score *= input.volatility > .8 ? .6 : .78; reasons.push('Nilainya biasa naik-turun cukup besar'); }
  if (input.z !== undefined && Math.abs(input.z) < 1.5) { score *= .8; reasons.push('Perubahannya masih dekat dengan naik-turun biasa'); }
  if (input.progress !== undefined && input.progress < .25) { score *= .7; reasons.push('Siklus ini baru berjalan sebentar'); }
  if (input.uncategorized !== undefined && input.uncategorized >= .05) { score *= Math.max(.4, 1 - input.uncategorized * 1.5); reasons.push(`${Math.round(input.uncategorized * 100)}% pengeluaran belum memiliki kategori`); }
  if (input.samples !== undefined && input.samples < 4) { score *= input.samples < 2 ? .55 : .75; reasons.push(`Hanya ${input.samples} catatan yang mendasari`); }
  const level = score >= .7 ? 'high' : score >= .45 ? 'medium' : 'low';
  return { level, label: confidenceLabels[level], score, reasons };
}
