/**
 * Hiding amounts on screen (the eye button in the top bar): "Rp12.000", "-Rp1,3 jt" and "±Rp33 rb" all
 * become "Rp•••••". The sign stays; the digits and the size word (rb, jt, M, T) are hidden, so the
 * length gives nothing away. Other numbers (dates, percentages, counts) are left alone.
 */
const MONEY = /Rp\s?\d(?:[\d.,]*\d)?(?:\s?(?:rb|jt|M|T)\b)?/g;
const HAS_MONEY = /Rp\s?\d/;
export const MASKED_AMOUNT = 'Rp•••••';
export const hasAmount = (text: string) => HAS_MONEY.test(text);
export const maskAmounts = (text: string) => text.replace(MONEY, MASKED_AMOUNT);
/**
 * 8.3.1: amounts written without "Rp", where the app or the person writes them that way: chart axes ("2,5jt", "250rb")
 * and chat messages ("kopi 25rb", "gaji 8.500.000"). Times ("17.40") and percentages are left alone.
 */
const BARE = /(?<![\p{L}\d.,•:/])[-−+±]?\d+(?:[.,]\d+)?\s?(?:rb|ribu|jt|juta|k|M|T)(?![\p{L}])|(?<![\p{L}\d.,•:/])[-−+±]?\d{1,3}(?:\.\d{3})+(?![\d,.]?\d)(?!\s?%)/gu;
export const MASKED_BARE = '•••••';
export const hasBareAmount = (text: string) => { BARE.lastIndex = 0; return BARE.test(text); };
export const maskBareAmounts = (text: string) => text.replace(BARE, MASKED_BARE);
