/**
 * Hiding amounts on screen (the eye button in the top bar): "Rp12.000", "-Rp1,3 jt" and "±Rp33 rb" all
 * become "Rp•••••". The sign stays; the digits and the size word (rb, jt, M, T) are hidden, so the
 * length gives nothing away. Other numbers (dates, percentages, counts) are left alone.
 */
const MONEY = /Rp\s?\d[\d.,]*(?:\s?(?:rb|jt|M|T)\b)?/g;
const HAS_MONEY = /Rp\s?\d/;
export const MASKED_AMOUNT = 'Rp•••••';
export const hasAmount = (text: string) => HAS_MONEY.test(text);
export const maskAmounts = (text: string) => text.replace(MONEY, MASKED_AMOUNT);

/**
 * 6.4 "Yang penting saja": only the amounts that say how much money someone has (wallet balances, totals, assets,
 * income, savings) are hidden; spending, budgets and bills stay readable. An amount on screen is matched by its value,
 * also when written short ("Rp9,8 jt" is 9.8 million give or take the last digit shown).
 */
const UNIT: Record<string, number> = { rb: 1e3, jt: 1e6, M: 1e9, T: 1e12 };
export function amountsIn(text: string): { text: string; value: number; step: number }[] {
  return [...text.matchAll(MONEY)].map(m => {
    const raw = m[0], unit = raw.match(/(rb|jt|M|T)$/)?.[1], digits = raw.replace(/^Rp\s?/, '').replace(/\s?(rb|jt|M|T)$/, '');
    if (!unit) { const value = Number(digits.replace(/\./g, '').replace(',', '.')); return { text: raw, value, step: 1 }; }
    const [whole, frac = ''] = digits.replace(/\./g, '').split(','), scale = UNIT[unit];
    return { text: raw, value: Number(`${whole}.${frac || '0'}`) * scale, step: scale / 10 ** frac.length };
  }).filter(a => Number.isFinite(a.value));
}
/** Hides only the amounts whose value is one of `sensitive` (a few thousand rupiah or more). */
export function maskSensitive(text: string, sensitive: number[]) {
  if (!sensitive.length || !HAS_MONEY.test(text)) return text;
  return text.replace(MONEY, raw => {
    const [a] = amountsIn(raw);
    if (!a || a.value < 1000) return raw;
    return sensitive.some(v => Math.abs(Math.abs(v) - a.value) <= a.step / 2 + 0.5) ? MASKED_AMOUNT : raw;
  });
}
