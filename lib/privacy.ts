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
