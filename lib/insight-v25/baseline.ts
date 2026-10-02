/**
 * Insight V2.5 — one baseline engine for every comparison.
 *
 * "Normal" for a value is read from the past cycles the ledger covers completely (context.baseline):
 *   - robust summary: mean, median, p25/p75, MAD, min/max, count;
 *   - a cycle that is far off its peers (|robust z| > 3.5, MAD-based) is left out of the typical value, so one bonus
 *     month or one laptop does not make every later month look "low";
 *   - for a running cycle the comparison is fair: what was spent up to the same day of earlier cycles (same point),
 *     never a full past cycle against a half-finished one;
 *   - previous cycle, the last 3 and last 6 are kept for the evidence.
 * The typical value is a mean of the kept cycles, so a total splits exactly into its parts (drivers.ts).
 */
export type Stats = { count: number; mean: number; median: number; p25: number; p75: number; mad: number; min: number; max: number };

export const sum = (values: number[]) => values.reduce((n, v) => n + v, 0);
export const mean = (values: number[]) => values.length ? sum(values) / values.length : 0;
export function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b), pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
export function stats(values: number[]): Stats {
  const median = quantile(values, .5);
  return { count: values.length, mean: mean(values), median, p25: quantile(values, .25), p75: quantile(values, .75), mad: quantile(values.map(v => Math.abs(v - median)), .5), min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0 };
}
/** Spread used for z-scores: MAD scaled to a standard deviation, never below a tenth of the median (or a floor). */
export const spread = (s: Stats, floor = 0) => Math.max(1.4826 * s.mad, Math.abs(s.median) * .1, floor, 1);
export const robustZ = (value: number, s: Stats, floor = 0) => (value - s.median) / spread(s, floor);
/** Coefficient of variation from robust numbers (0 = perfectly steady). */
export const volatility = (s: Stats) => s.median ? 1.4826 * s.mad / Math.abs(s.median) : s.max ? 1 : 0;

export type Baseline = {
  /** 'same-point' compares the running cycle with earlier cycles at the same day; 'full' compares whole cycles. */
  kind: 'same-point' | 'full';
  typical: number; stats: Stats;
  /** Indexes (into the series) of cycles left out as outliers. */
  outliers: number[]; kept: number[];
  previous: number | null; recent3: number; recent6: number;
  current: number; delta: number; deltaPct: number; z: number;
};

/** Compare `current` with a series of past values (oldest first). */
export function compare(current: number, series: number[], kind: Baseline['kind'], floor = 0): Baseline {
  const s = stats(series);
  const outliers = series.length >= 4 ? series.map((v, i) => [v, i]).filter(([v]) => Math.abs(robustZ(v, s, floor)) > 3.5).map(([, i]) => i) : [];
  const kept = series.map((_, i) => i).filter(i => !outliers.includes(i));
  const typical = mean(kept.map(i => series[i]));
  const delta = current - typical;
  return { kind, typical, stats: s, outliers, kept, previous: series.length ? series[series.length - 1] : null, recent3: mean(series.slice(-3)), recent6: mean(series.slice(-6)), current, delta, deltaPct: typical ? delta / typical : current ? 1 : 0, z: robustZ(current, stats(kept.map(i => series[i])), floor) };
}
