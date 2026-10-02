/**
 * Insight presentation formatting, in one place: money (short for summaries, full for details), percentages with an
 * Indonesian comma, signed changes, dates. UI components never format money on their own.
 */
const grouped = (n: number) => Math.round(n).toLocaleString('id-ID');
/** Rp12.487.392 — full value for details. */
export const moneyFull = (value: number) => `${value < 0 ? '−' : ''}Rp${grouped(Math.abs(value))}`;
/** Rp12,5 jt · Rp870 rb · Rp999 — for summaries. */
export function money(value: number) {
  const n = Math.abs(value), sign = value < 0 ? '−' : '';
  const one = (v: number) => (Math.round(v * 10) / 10).toLocaleString('id-ID', { maximumFractionDigits: 1 });
  if (n >= 1e9) return `${sign}Rp${one(n / 1e9)} M`;
  if (n >= 1e6) return `${sign}Rp${one(n / 1e6)} jt`;
  if (n >= 1e4) return `${sign}Rp${Math.round(n / 1e3)} rb`;
  return `${sign}Rp${grouped(n)}`;
}
/** +Rp327 rb / −Rp87 rb. */
export const signedMoney = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`;
/** 17% · 6,9% (one decimal only below 10). */
export function percent(ratio: number, decimals?: number) {
  const v = ratio * 100, d = decimals ?? (Math.abs(v) < 10 && Math.round(v) !== v ? 1 : 0);
  return `${(Math.round(v * 10 ** d) / 10 ** d).toLocaleString('id-ID', { maximumFractionDigits: d })}%`;
}
export const signedPercent = (ratio: number) => `${ratio > 0 ? '+' : ratio < 0 ? '−' : ''}${percent(Math.abs(ratio))}`;
export const dayMonth = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
/** Spoken form for screen readers: "Rp12,5 jt" → "12,5 juta rupiah". */
export function moneySpoken(value: number) {
  const n = Math.abs(value), sign = value < 0 ? 'minus ' : '';
  if (n >= 1e9) return `${sign}${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} miliar rupiah`;
  if (n >= 1e6) return `${sign}${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} juta rupiah`;
  if (n >= 1e3) return `${sign}${Math.round(n / 1e3)} ribu rupiah`;
  return `${sign}${Math.round(n)} rupiah`;
}
