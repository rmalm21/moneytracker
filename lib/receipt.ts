/**
 * Reading a receipt (struk / nota) from its text: the text a phone copied from a photo, or what the on-device OCR read
 * (lib/receipt-ocr.ts). Pure functions, no storage.
 *
 *  - cleanOcrText fixes the usual OCR slips in amounts: O→0, l/I→1, S→5, "35 000" / "35. 000" → "35000" / "35.000",
 *    "12.000,-", "(5.000)" → "-5.000", tax flags after prices ("50.000 T").
 *  - Text copied from a photo often lists the names first and the prices after them (two columns read one after
 *    the other); those are paired back into lines.
 *  - readReceiptText follows the receipt's layout: header (place, date), items, then the summary (subtotal, tax, service,
 *    total) and payment (paid, change, method). Once the summary starts, amounts are never taken as items. Key words
 *    are matched loosely (T0TAL, GRAN TOTAI, SUBT0TAL, KEMBALlAN). Lines it does not understand are skipped and
 *    counted; nothing is made up.
 *  - checkReceipt decides which total to trust: every printed total and paid − change are compared with the items and
 *    every combination of charges (a PPN already included in the prices, a "hemat" line that is only information).
 *  - receiptToTransaction turns a receipt into a transaction to confirm.
 */
import { allocate } from './accounting.ts';
import { suggestCategory } from './categorize.ts';
import type { Category, LedgerTx, SplitLine, Wallet } from './types';

export type ReceiptLine = { name: string; qty: number; price: number; total: number };
export type PaymentMethod = '' | 'cash' | 'qris' | 'debit' | 'credit' | 'transfer' | 'gopay' | 'ovo' | 'dana' | 'shopeepay' | 'linkaja';
export type ReceiptRead = {
  merchant: string; date: string; time: string; items: ReceiptLine[];
  subtotal: number; tax: number; service: number; discount: number; delivery: number; rounding: number; total: number;
  paid: number; change: number; payment: PaymentMethod; skipped: number;
  /** Every total printed (Grand Total, Total Bayar, Total…), the most likely first. */
  totals?: number[];
  /** Percentages printed next to tax and service ("PB1 10%"), to catch a misread amount. */
  rates?: Partial<Record<'tax' | 'service' | 'delivery', number>>;
  /** Amounts corrected because they did not add up (shown to the user). */
  fixes?: string[];
};
export const PAYMENT_LABELS: Record<PaymentMethod, string> = { '': '', cash: 'Tunai', qris: 'QRIS', debit: 'Kartu debit', credit: 'Kartu kredit', transfer: 'Transfer', gopay: 'GoPay', ovo: 'OVO', dana: 'DANA', shopeepay: 'ShopeePay', linkaja: 'LinkAja' };

/* ------------------------------------------------------------------ Cleaning OCR text */

const DIGITISH = /[0-9OoDQlIi|SsBZz]/;
/** Fixes letters read in place of digits inside amounts, and amounts broken by spaces. */
export function cleanOcrText(text: string) {
  return text.split(/\r?\n/).map(raw => {
    let line = raw.replace(/[‐‑‒–—―]/g, '-').replace(/[“”„]/g, '"').replace(/[‘’`´]/g, "'").replace(/\t/g, '  ');
    line = line.replace(/^[\s|_~'"*•·]+|[\s|_~'"]+$/g, '').replace(/^[.,:;=~—-]{2,}\s*|^[.,:;=~]\s+/, '').replace(/["'](?=\d)|(?<=\d)["']/g, '');
    // Tokens that are mostly digits: fix look-alike letters ("35.0O0", "l2.500", "S.170").
    line = line.replace(/[0-9OoDQlIi|SsBZz][0-9OoDQlIi|SsBZz.,]{2,}/g, token => {
      const digits = (token.match(/\d/g) || []).length, letters = token.replace(/[\d.,]/g, '').length;
      if (digits < 2 || letters > digits || !/[.,]\d|\d[.,]|\d{3}/.test(token.replace(/[OoDQ]/g, '0').replace(/[lIi|]/g, '1'))) return token;
      return [...token].map(ch => !DIGITISH.test(ch) || /\d/.test(ch) ? ch : /[OoDQ]/.test(ch) ? '0' : /[lIi|]/.test(ch) ? '1' : /[Ss]/.test(ch) ? '5' : /[B]/.test(ch) ? '8' : /[Zz]/.test(ch) ? '2' : ch).join('');
    });
    // "12. 000" / "12 .000" → "12.000"; "35 000" → "35000" (Rupiah amounts end in 0).
    line = line.replace(/(\d)\s*([.,])\s+(\d{3})(?!\d)/g, '$1$2$3').replace(/(\d)\s+([.,]\d{3})(?!\d)/g, '$1$2');
    line = line.replace(/(^|[\s:=@x×])(\d{1,3}) (\d{2}0)(?=\s|$|[.,]\d{3})/g, '$1$2$3');
    // "12.000,-" / "12.000 IDR" → "12.000"; "(5.000)" → "-5.000"; a tax flag after the price ("50.000 T", "50.000 *").
    line = line.replace(/(\d)[.,]-(?=\s|$)/g, '$1').replace(/(\d)\s*(?:IDR|idr)\b/g, '$1').replace(/\(\s*(?:rp\.?\s*)?(\d[\d.,]*)\s*\)\s*$/i, '-$1');
    line = line.replace(/(\d[.,]\d{3})\s+(?:[A-WYZa-wyz]|[*#]{1,2})$/, '$1');
    // Noise the camera picked up after the price ("28.000 im", "11.025 |.", "121.275 Bi").
    { const tokens = line.split(/\s+/); while (tokens.length > 2 && (tokens[tokens.length - 1].length <= 2 || /^[A-Za-z]{3}$/.test(tokens[tokens.length - 1]) && /\d[.,]\d{3}$/.test(tokens[tokens.length - 2])) && !/^\d+$/.test(tokens[tokens.length - 1]) && tokens.slice(0, -1).some(t => /\d[.,]\d{3}/.test(t))) tokens.pop(); line = tokens.join(' ').replace(/(\d[.,]\d{3})[^\d\s]{1,2}$/, '$1'); }
    // One digit too many in the last group ("16.5600" → "16.560"); the item check below may correct it further.
    line = line.replace(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{3})\d(?=\s*$)/, '$1');
    // "2 Xx 6.000", "2X6.000", "2 * 6.000" → "2 x 6.000".
    line = line.replace(/(^|\s)(\d{1,3})\s*(?:[xX×]{1,2}|\*)\s*(?=(?:rp\.?\s*)?\d)/gi, '$1$2 x ');
    return line.replace(/\s+/g, ' ').trim();
  }).filter(Boolean).join('\n');
}

/* ------------------------------------------------------------------ Two columns read one after the other */

const AMOUNT_ONLY = /^[-−]?\s*(?:rp\.?\s*|idr\s*)?(?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|[1-9]\d{2,6})$/i;
const labelOnly = (line: string) => /[a-z]{2,}/i.test(line) && !/\d{3,}/.test(line.replace(/[\s.,]/g, ''));
/**
 * "NASI GORENG / ES TEH / TOTAL / 35.000 / 12.000 / 47.000" → "NASI GORENG 35.000 / ES TEH 12.000 / TOTAL 47.000".
 * The prices belong to the last names before them (the header above has no price).
 */
export function pairColumns(lines: string[]) {
  const out: string[] = [];
  for (let i = 0; i < lines.length;) {
    if (!labelOnly(lines[i])) { out.push(lines[i]); i++; continue; }
    let j = i; while (j < lines.length && labelOnly(lines[j])) j++;
    let k = j; while (k < lines.length && AMOUNT_ONLY.test(lines[k])) k++;
    const labels = j - i, amounts = k - j, n = Math.min(labels, amounts);
    if (!n) { out.push(...lines.slice(i, j)); i = j; continue; }
    out.push(...lines.slice(i, j - n));
    for (let m = 0; m < n; m++) out.push(`${lines[j - n + m]} ${lines[j + m]}`);
    out.push(...lines.slice(j + n, k));
    i = k;
  }
  return out;
}

/* ------------------------------------------------------------------ Key words, matched loosely */

const AMOUNT = /(-|−)?\s*(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?=\s*$)/i;
/** "35.000", "35,000", "Rp 35.000,00", "35000" → 35000. Long plain digit runs (phone numbers, codes) are not amounts. */
export function readAmount(text: string) {
  const match = text.match(AMOUNT);
  if (!match) return null;
  const before = text[(match.index || 0) + match[0].indexOf(match[2]) - 1] || '';
  if (/[\d.,]/.test(before)) return null;
  if (!/[.,]/.test(match[2]) && (match[2].length > 8 || (match[2].length > 1 && match[2].startsWith('0')))) return null;
  const value = Number(match[2].replace(/[.,]/g, ''));
  if (!Number.isSafeInteger(value)) return null;
  return { value: match[1] ? -value : value, start: match.index || 0 };
}
type Key = 'subtotal' | 'tax' | 'service' | 'discount' | 'delivery' | 'rounding' | 'total' | 'paid' | 'change' | 'ignore';
/** Checked in this order. */
const KEYS: [Key, RegExp][] = [
  ['ignore', /\b(npwp|telp|tel|phone|hp|wa|kasir|cashier|operator|no\.?\s*(struk|nota|meja|order|trx|transaksi|invoice|ref|kartu|card)|order\s*(#|id|no)|table|meja|pax|shift|member\s*(id|no|card)|(no|id)\.?\s*member|poin|points?|stamp|saldo|sisa\s*saldo|dpp|approval|appr|trace|batch|tid|mid|rrn|auth|kode|code|terminal|merchant\s*id|invoice|pin|total\s*(item|items|qty|barang|pcs|jumlah\s*item)|jumlah\s*(item|barang|qty|pcs)|qty\s*total|item\s*:?|sms|call|hubungi|customer|konsumen|kritik|saran|www|http|email|wifi|password)\b|(#|\bno\.?|\bnomor)\s*:?\s*$/i],
  ['subtotal', /\b(sub\s*-?\s*t[o0]ta[l1i]|s\/?t[o0]ta[l1i]|total\s*harga\s*barang|harga\s*jual|total\s*penjualan)\b/i],
  ['discount', /\b(d[i1l]sk[o0]n|disc(ount)?|potongan|promo|voucher|hemat|cashback|member\s*disc|rabat)\b/i],
  ['service', /\b(serv[i1l]ce(\s*charge)?|serv[i1l]s|srv|svc|s\.?c\.?|biaya\s*layanan|layanan\s*\d+\s*%)\b/i],
  ['tax', /\b(pb\s*-?\s*[1il]|p\.b\.?\s*1|pajak(\s*resto(ran)?)?|ppn|tax|vat|pbjt)\b/i],
  ['delivery', /\b(ongkir|ongkos\s*kirim|delivery(\s*fee)?|pengiriman|biaya\s*antar|shipping)\b/i],
  ['rounding', /\b(pembulatan|rounding|round|pembul)\b/i],
  ['change', /\b(kembal[i1l](an)?|change|kembali\s*uang|kemb)\b/i],
  ['total', /\b(grand\s*t[o0]ta[l1i]|t[o0]ta[l1i](\s*(bayar|tagihan|belanja|harga|pembayaran|akhir|pesanan|penjualan))?|t[o0]t|ttl|jumlah(\s*(bayar|tagihan|harga))?|tagihan|amount\s*due|net\s*(amount|total|sales)|harus\s*dibayar|total\s*due)\b/i],
  ['paid', /\b(tunai|cash|bayar|dibayar|pembayaran|payment|paid|tendered|debit|debet|kredit|credit|qris|gopay|go-pay|ovo|dana|shopeepay|linkaja|edc|kartu|card|transfer|flazz|e-?money|brizzi|tapcash)\b/i],
];
/** Strong payment words; the weaker ones (kartu, debit, transfer…) count only in the summary, not as an item name. */
const PAID_STRONG = /^\s*(tunai|cash|bayar|dibayar|pembayaran|payment|paid|tendered|qris|edc)\b/i;
const FUZZY: [Key, string[]][] = [
  ['subtotal', ['subtotal']], ['total', ['total', 'grandtotal', 'tagihan']], ['change', ['kembali', 'kembalian']], ['paid', ['tunai']],
  ['discount', ['diskon', 'discount', 'potongan']], ['service', ['service']], ['tax', ['pajak']], ['rounding', ['pembulatan']],
];
function editDistance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}
/** Digits read in place of letters inside words: T0TAL → TOTAL, KEMBAL1 → KEMBALI, 5ERVICE → SERVICE. */
const lettersOf = (text: string) => text.toLowerCase().replace(/0/g, 'o').replace(/[1|!]/g, 'l').replace(/5/g, 's').replace(/8/g, 'b').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
function keyOf(label: string): Key | undefined {
  const direct = KEYS.find(([, pattern]) => pattern.test(label))?.[0];
  if (direct) return direct;
  const letters = lettersOf(label);
  const loose = KEYS.find(([key, pattern]) => key !== 'ignore' && pattern.test(letters))?.[0];
  if (loose) return loose;
  const words = letters.split(' '), joined = letters.replace(/\s/g, '');
  for (const [key, list] of FUZZY) for (const word of list) {
    const limit = word.length >= 8 ? 2 : word.length >= 5 ? 1 : 0;
    if (limit && (words.some(w => w.length >= 4 && editDistance(w, word) <= limit) || (joined.length <= word.length + 6 && editDistance(joined, word) <= limit))) return key;
  }
  return undefined;
}
/** How strongly a total line is the amount to pay. */
const totalStrength = (label: string) => /grand|tagihan|harus|bayar|akhir|due|net|belanja/i.test(lettersOf(label)) ? 3 : /t[o0]ta[l1i]|ttl|tot\b/i.test(label) ? 2 : 1;

const PAYMENTS: [PaymentMethod, RegExp][] = [
  ['gopay', /\bgo\s*-?\s*pay\b/i], ['ovo', /\bovo\b/i], ['shopeepay', /\bshopee\s*pay\b|\bspay\b/i], ['linkaja', /\blink\s*aja\b/i], ['dana', /\bdana\b(?!\s*(darurat|pensiun))/i],
  ['qris', /\bqris\b|\bqr\s*(code|payment)\b/i], ['credit', /\b(kartu\s*kredit|credit\s*card|kredit|visa|master\s*card|mastercard|amex|jcb)\b/i], ['debit', /\b(debit|debet|kartu\s*debit|edc|bca\s*card|atm|gpn|flazz|e-?money|brizzi|tapcash)\b/i],
  ['transfer', /\b(transfer|trf|tf|virtual\s*account|va)\b/i], ['cash', /\b(tunai|cash)\b/i],
];
const NUMBER = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d{3,})`;
const readNumber = (text: string) => Number(text.replace(/[.,]/g, ''));
/** Name, quantity and unit price from the text before a line's total; a reading counts only when quantity × price = total. */
function readItem(label: string, total: number): { name: string; qty: number; price: number; alt?: number } {
  label = label.replace(/(\s+[^\w\s.,]{1,2})+$/, '').trim();
  const tries: [RegExp, (match: RegExpMatchArray) => [number, number] | null][] = [
    [new RegExp(String.raw`(?:^|\s)(\d{1,3})\s*(?:pcs|x|×|@)\s*(?:rp\.?\s*)?${NUMBER}\s*$`, 'i'), match => [+match[1], readNumber(match[2])]],
    [new RegExp(String.raw`(?:^|\s)@\s*(?:rp\.?\s*)?${NUMBER}\s*$`, 'i'), match => { const unit = readNumber(match[1]); return unit && total % unit === 0 ? [total / unit, unit] : null; }],
    [new RegExp(String.raw`(?:^|\s)${NUMBER}\s*[x×]\s*(\d{1,3})\s*$`, 'i'), match => [+match[2], readNumber(match[1])]],
    [new RegExp(String.raw`(?:^|\s)(\d{1,3})\s*(?:pcs|bh|buah|btl|pck|porsi)?\s+(?:rp\.?\s*)?${NUMBER}\s*$`, 'i'), match => [+match[1], readNumber(match[2])]],
    [new RegExp(String.raw`(?:^|\s)(?:rp\.?\s*)?${NUMBER}\s*$`, 'i'), match => [1, readNumber(match[1])]],
  ];
  for (const [pattern, read] of tries) {
    const match = label.match(pattern), got = match && read(match);
    if (match && got && got[0] >= 1 && got[1] > 0 && got[0] * got[1] === total) return { name: label.slice(0, match.index).trim(), qty: got[0], price: got[1] };
  }
  // "ROTI 1 16.560 16.500": the quantity is clear but the unit price was misread; the line total decides.
  const unclear = label.match(new RegExp(String.raw`(?:^|\s)(\d{1,2})\s*(?:x|×|@|pcs)?\s+(?:rp\.?\s*)?${NUMBER}\s*$`, 'i'));
  if (unclear && +unclear[1] >= 1 && total % +unclear[1] === 0 && Math.abs(readNumber(unclear[2]) - total / +unclear[1]) <= total / +unclear[1] * .15) return { name: label.slice(0, unclear.index).trim(), qty: +unclear[1], price: total / +unclear[1], alt: +unclear[1] * readNumber(unclear[2]) };
  // Quantity and unit price that do not give the line total: one of them was misread; kept as an alternative.
  if (unclear && +unclear[1] >= 1 && /[a-z]{2,}/i.test(label.slice(0, unclear.index))) { const qty = +unclear[1], unit = readNumber(unclear[2]); return { name: label.slice(0, unclear.index).trim(), qty: total % qty === 0 ? qty : 1, price: total % qty === 0 ? total / qty : total, alt: qty * unit }; }
  const lead = label.match(/^(\d{1,3})\s*[x×]\s*(?=\D)/i) || label.match(/^(\d{1,2})\s+(?=[a-z])/i);
  if (lead && +lead[1] >= 1 && +lead[1] <= 99 && total % +lead[1] === 0) return { name: label.slice(lead[0].length).trim(), qty: +lead[1], price: total / +lead[1] };
  const tail = label.match(/\s[x×]\s*(\d{1,3})$/i) || label.match(/\s(\d{1,3})\s*(?:[x×]|pcs)$/i);
  if (tail && +tail[1] >= 1 && total % +tail[1] === 0) return { name: label.slice(0, tail.index).trim(), qty: +tail[1], price: total / +tail[1] };
  return { name: label, qty: 1, price: total };
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'];
const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATE_TEXT = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b|\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b|\b(\d{1,2})[\s-]+([a-z]{3})[a-z]*\.?[\s-]+(20\d{2}|\d{2})\b|\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i;
export function readReceiptDate(text: string) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const valid = (y: number, m: number, d: number) => y >= 2000 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : '';
  const monthOf = (name: string) => { const key = name.toLowerCase(); return Math.max(MONTHS.indexOf(key), MONTHS_EN.indexOf(key)) + 1; };
  const year = (text: string) => +text < 100 ? 2000 + +text : +text;
  const match = text.match(DATE_TEXT);
  if (!match) return '';
  if (match[1]) return valid(+match[1], +match[2], +match[3]);
  if (match[4]) return valid(year(match[6]), +match[5], +match[4]);
  if (match[7]) { const month = monthOf(match[8]); return month ? valid(year(match[9]), month, +match[7]) : ''; }
  const month = monthOf(match[10]); return month ? valid(+match[12], month, +match[11]) : '';
}
const TIME = /\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:[:.][0-5]\d)?\b/;

/* ------------------------------------------------------------------ The place */

/** Well-known shops, found even when the OCR misses a letter ("lNDOMARET", "ALFAMRT"). */
const SHOPS = ['Indomaret', 'Alfamart', 'Alfamidi', 'Alfaexpress', 'Lawson', 'FamilyMart', 'Circle K', 'Superindo', 'Hypermart', 'Transmart', 'Carrefour', 'Lotte Mart', 'Giant', 'Hero', 'Ranch Market', 'Farmers Market', 'Grand Lucky', 'Tip Top', 'Yogya', 'Griya', 'Borma', 'Matahari', 'Ramayana', 'Uniqlo', 'Miniso', 'Daiso', 'IKEA', 'ACE Hardware', 'Informa', 'Mitra10', 'Gramedia', 'Guardian', 'Watsons', 'Century', 'Kimia Farma', 'Apotek K-24', 'Apotek Roxy', 'Starbucks', 'Janji Jiwa', 'Kopi Kenangan', 'Fore Coffee', 'Point Coffee', 'Tomoro Coffee', 'Kopi Tuku', 'Excelso', 'J.CO', 'Dunkin', 'Chatime', 'Mixue', 'KFC', "McDonald's", 'Burger King', 'Pizza Hut', "Domino's", 'HokBen', 'Yoshinoya', 'Marugame Udon', 'Solaria', 'Richeese Factory', 'A&W', 'Bakmi GM', 'Sushi Tei', 'Pertamina', 'Shell', 'Cinema XXI', 'CGV', 'Cinepolis', 'Tokopedia', 'Shopee', 'Grab', 'Gojek'];
const squash = (text: string) => lettersOf(text).replace(/\s/g, '');
const SHOP_ALIASES: Record<string, string> = { indomarco: 'Indomaret', sumberalfaria: 'Alfamart', midimutiara: 'Alfamidi', lawsonindonesia: 'Lawson', sumberalfariatrijaya: 'Alfamart' };
function knownShop(lines: string[]) {
  const picked = [...lines.slice(0, 8), ...lines.slice(-4)], candidates = picked.map(squash), raw = picked.map(l => l.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const [alias, shop] of Object.entries(SHOP_ALIASES)) if (candidates.some(line => line.includes(alias))) return shop;
  for (const shop of SHOPS) {
    const key = squash(shop.replace(/'/g, '')), exact = shop.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (/^(apotek|kopi|toko|point|fore|grand|circle)/i.test(shop)) { if (candidates.some((line, i) => line.includes(key) && raw[i].includes(exact))) return shop; continue; }
    if (key.length < 3) continue;
    for (const line of candidates) {
      if (line.includes(key)) return shop;
      if (key.length >= 6) for (let i = 0; i + key.length - 1 <= line.length; i++) if (editDistance(line.slice(i, i + key.length), key) <= 1) return shop;
    }
  }
  return '';
}
/** A shop name: mostly letters, at least four of them (not OCR noise like "0 ERA" or "Se"), and not a greeting. */
const looksLikeName = (line: string) => { const letters = (line.match(/[a-z]/gi) || []).length, visible = line.replace(/\s/g, '').length, words = line.split(/\s+/); return letters >= 4 && letters / visible >= .7 && (words.some(w => /^[a-z&'.-]{4,}$/i.test(w)) || words.every(w => /^[A-Z0-9&'.-]{2,}$/.test(w))) && !/^(selamat|welcome|struk|receipt|nota|invoice|bukti|terima kasih|thank)/i.test(line); };

/* ------------------------------------------------------------------ Reading */

/** Items, charges, totals and payment from receipt text, for the user to check. */
export function readReceiptText(text: string): ReceiptRead {
  const out: ReceiptRead = { merchant: '', date: '', time: '', items: [], subtotal: 0, tax: 0, service: 0, discount: 0, delivery: 0, rounding: 0, total: 0, paid: 0, change: 0, payment: '', skipped: 0, totals: [] };
  const cleaned = cleanOcrText(text);
  const lines = pairColumns(cleaned.split('\n').slice(0, 300));
  out.payment = PAYMENTS.find(([, pattern]) => pattern.test(cleaned))?.[0] || '';
  const quantityLine = (line: string | undefined) => Boolean(line && /^\d{1,3}\s*[x×@]/i.test(line));
  const totals: { value: number; strength: number; position: number }[] = [];
  let pendingName = '', summary = false, sawHemat = false;
  const alts = new Map<ReceiptLine, number>();
  lines.forEach((line, position) => {
    const date = out.date ? '' : readReceiptDate(line);
    const time = line.match(TIME);
    if (date || (time && /\b(jam|time|waktu|pukul|tgl|tanggal|date)\b/i.test(line))) {
      if (date) out.date = date;
      if (time && !out.time) out.time = `${time[1].padStart(2, '0')}:${time[2]}`;
      const rest = line.replace(DATE_TEXT, '').replace(new RegExp(TIME.source, 'g'), '');
      if ((readAmount(rest)?.value || 0) < 100) return;
    }
    const amount = readAmount(line);
    if (!amount) {
      // A name alone: its quantity and price may be on the next line ("ES TEH" / "2 x 6.000 12.000").
      if (/[a-z]{2,}/i.test(line) && !/\d{3,}/.test(line.replace(/[\s.,]/g, ''))) {
        if (!out.merchant && position < 5 && looksLikeName(line) && !quantityLine(lines[position + 1]) && !keyOf(line) && !/^(jl|jln|jalan|ruko|komplek|blok|kel|kec|kota|cabang)\b/i.test(line)) { out.merchant = line.slice(0, 60); return; }
        pendingName = summary || keyOf(line) ? '' : line.slice(0, 60);
      } else out.skipped++;
      return;
    }
    const label = line.slice(0, amount.start).replace(/[:=]\s*$/, '').trim();
    let key = keyOf(label);
    if (key === 'paid' && !summary && !PAID_STRONG.test(label) && !lettersOf(label).split(' ').some(w => ['tunai', 'bayar', 'cash'].some(k => w.length >= 4 && editDistance(w, k) <= 1))) key = undefined;
    if (key === 'ignore') { pendingName = ''; return; }
    if (key) {
      const value = Math.abs(amount.value);
      pendingName = '';
      if (key !== 'rounding' && key !== 'change' && value < 100) return;
      if (['subtotal', 'total', 'paid', 'change'].includes(key)) summary = true;
      if (key === 'rounding') out.rounding += amount.value;
      else if (key === 'total') totals.push({ value, strength: totalStrength(label), position });
      else if (key === 'paid') { if (!out.paid) out.paid = value; }
      else if (key === 'change') out.change = value;
      else if (key === 'subtotal') out.subtotal = value;
      else if (key === 'discount') { const hemat = /hemat/i.test(label); if (!(hemat && out.discount && !sawHemat)) out.discount += value; sawHemat ||= hemat; }
      else { out[key] += value; const pct = label.match(/(\d{1,2}(?:[.,]\d)?)\s*%/); if (pct) (out.rates ||= {})[key as 'tax' | 'service'] = Number(pct[1].replace(',', '.')); }
      return;
    }
    // After the summary starts, a price is never an item (card numbers, approval codes, "Anda hemat"…).
    if (summary) { out.skipped++; pendingName = ''; return; }
    if (amount.value < 0) { out.discount += -amount.value; pendingName = ''; return; }
    if (amount.value < 100 || out.items.length >= 150) { out.skipped++; return; }
    const read = readItem(label, amount.value);
    let name = (read.name || pendingName).replace(/^\d{4,}\s+/, '').replace(/^[-*•.\s\d]*\s(?=[a-z])|^[-*•.\s]+|[-*•.:\s]+$/gi, '').slice(0, 60);
    pendingName = '';
    if (!/[a-z]{2,}/i.test(name)) { out.skipped++; return; }
    const tokens = name.split(' ');
    if (tokens.filter(t => /^[A-Z0-9]{2,}$/.test(t)).length >= 2) while (tokens.length > 2 && !/^[A-Z0-9&]{2,}$/.test(tokens[0]) && tokens[0].length <= 5) tokens.shift();
    name = tokens.join(' ');
    out.items.push({ name, qty: read.qty, price: read.price, total: read.qty * read.price });
    if (read.alt && read.alt !== read.qty * read.price) alts.set(out.items[out.items.length - 1], read.alt);
  });
  // The total to pay: the strongest total line; when several are equally strong, the last one.
  totals.sort((a, b) => b.strength - a.strength || b.position - a.position);
  out.totals = [...new Set(totals.map(t => t.value))];
  out.total = out.totals[0] || 0;
  // A total the OCR mangled beyond recognition can still end up as the last "item": drop items that are exactly a total
  // or larger than it.
  const money = new Set([out.total, out.subtotal, out.paid, ...out.totals].filter(Boolean));
  while (out.items.length > 1 && money.has(out.items[out.items.length - 1].total) && out.items.slice(0, -1).reduce((n, i) => n + i.total, 0) > 0) { out.items.pop(); out.skipped++; }
  if (out.total) { const before = out.items.length; out.items = out.items.filter(item => item.total <= out.total * 1.02); out.skipped += before - out.items.length; }
  if (out.merchant) { const t = out.merchant.split(' '); if (t.length > 2 && t[0].length === 1) t.shift(); if (t.length > 2 && t[t.length - 1].length <= 2 && /[a-z]/.test(t[t.length - 1])) t.pop(); out.merchant = t.join(' '); }
  repairItems(out, alts);
  repairCharges(out);
  const shop = knownShop(lines);
  if (shop) out.merchant = shop;
  return out;
}

/** Digits OCR confuses most on receipts. */
const LOOKALIKE: Record<string, string[]> = { '0': ['6', '8', '9'], '6': ['0', '5', '8'], '8': ['0', '3', '6', '9'], '9': ['0', '8'], '5': ['6', '3'], '3': ['8', '5'], '1': ['7', '4'], '7': ['1'], '2': ['7'], '4': ['1'] };
function lookalikes(value: number) {
  const text = String(value), out: number[] = [];
  for (let i = 0; i < text.length; i++) for (const d of LOOKALIKE[text[i]] || []) { if (!i && d === '0') continue; out.push(Number(text.slice(0, i) + d + text.slice(i + 1))); }
  return out;
}
/**
 * Items that do not add up to the subtotal (or the total): a line whose qty × unit price disagrees with its total, or one
 * misread digit in one or two prices ("6.920" for "6.900"). A correction is kept only when exactly one cheapest set of
 * changes makes the items add up exactly; otherwise nothing is touched and the user is told to check.
 */
function repairItems(read: ReceiptRead, alts: Map<ReceiptLine, number>) {
  const items = read.items, sum = items.reduce((n, i) => n + i.total, 0);
  if (items.length < 2 || items.length > 40) return;
  const targets = [...new Set([read.subtotal, read.totals?.[0] || read.total, read.total ? read.total + read.discount : 0].filter(v => v > 0))];
  if (targets.some(t => t === sum)) return;
  const options = items.map(item => { const list: [number, number][] = []; const alt = alts.get(item); if (alt) list.push([alt, 1]); for (const v of lookalikes(item.total)) if (v >= 100 && v !== alt) list.push([v, 2]); return list; });
  // The lines' own quantity × unit price, for any number of lines, when that makes everything add up.
  const withAlt = items.map((item, i) => [i, alts.get(item) || 0] as [number, number]).filter(([, alt]) => alt).slice(0, 12);
  for (const target of targets) {
    const fits: number[] = [];
    for (let mask = 1; mask < 1 << withAlt.length; mask++) { let total = sum; withAlt.forEach(([i, alt], b) => { if (mask & (1 << b)) total += alt - items[i].total; }); if (total === target) fits.push(mask); }
    const fewest = Math.min(...fits.map(m => m.toString(2).replace(/0/g, '').length)), chosen = fits.filter(m => m.toString(2).replace(/0/g, '').length === fewest);
    if (chosen.length !== 1) continue;
    const fixes = read.fixes || [];
    withAlt.forEach(([i, alt], b) => { if (!(chosen[0] & (1 << b))) return; const item = items[i], qty = alt % item.qty === 0 ? item.qty : 1; fixes.push(`${item.name}: terbaca ${rp(item.total)}, dibetulkan jadi ${rp(alt)} (jumlah × harga satuan) agar cocok dengan ${target === read.subtotal ? 'subtotal' : 'total'}.`); items[i] = { ...item, qty, price: alt / qty, total: alt }; });
    read.fixes = fixes;
    return;
  }
  for (const target of targets) {
    const need = target - sum;
    if (Math.abs(need) > target * .3) continue;
    let best: { cost: number; changes: [number, number][] }[] = [];
    const consider = (cost: number, changes: [number, number][]) => { if (!best.length || cost < best[0].cost) best = [{ cost, changes }]; else if (cost === best[0].cost) best.push({ cost, changes }); };
    options.forEach((list, i) => list.forEach(([v, c]) => { if (v - items[i].total === need) consider(c, [[i, v]]); }));
    if (!best.length || best[0].cost > 1) for (let i = 0; i < items.length; i++) for (const [v1, c1] of options[i]) { const rest = need - (v1 - items[i].total); for (let j = i + 1; j < items.length; j++) for (const [v2, c2] of options[j]) if (v2 - items[j].total === rest) consider(c1 + c2 + 1, [[i, v1], [j, v2]]); }
    if (best.length !== 1) continue;
    const fixes = read.fixes || [];
    for (const [i, value] of best[0].changes) {
      const item = items[i], qty = value % item.qty === 0 ? item.qty : 1;
      fixes.push(`${item.name}: terbaca ${rp(item.total)}, dibetulkan jadi ${rp(value)} agar cocok dengan ${target === read.subtotal ? 'subtotal' : 'total'}.`);
      items[i] = { ...item, qty, price: value / qty, total: value };
    }
    read.fixes = fixes;
    return;
  }
}
/**
 * "SERVICE 5%  259": when a percentage is printed and the amount read does not add up, the amount the percentage gives
 * is tried; it is kept only if the whole receipt then matches the printed total exactly.
 */
function repairCharges(read: ReceiptRead) {
  const rates = read.rates, target = read.totals?.[0] || read.total;
  if (!rates || !target) return;
  const itemsTotal = read.items.reduce((n, i) => n + i.total, 0), base = read.subtotal || itemsTotal;
  if (!base || solve(read, itemsTotal).best) return;
  const service = rates.service ? [Math.round(base * rates.service / 100)] : [read.service];
  for (const s of new Set([read.service, ...service])) {
    const taxes = rates.tax ? [Math.round(base * rates.tax / 100), Math.round((base + s) * rates.tax / 100)] : [read.tax];
    for (const t of new Set([read.tax, ...taxes])) {
      if (s === read.service && t === read.tax) continue;
      const trial = { ...read, service: s, tax: t };
      if (!solve(trial, itemsTotal).best) continue;
      const fixes: string[] = [];
      if (s !== read.service) fixes.push(`Service terbaca ${rp(read.service)}, dibetulkan jadi ${rp(s)} (${rates.service}% dari ${rp(base)}).`);
      if (t !== read.tax) fixes.push(`Pajak terbaca ${rp(read.tax)}, dibetulkan jadi ${rp(t)} (${rates.tax}%).`);
      Object.assign(read, { service: s, tax: t, fixes });
      return;
    }
  }
}

/* ------------------------------------------------------------------ Which total to trust */

export type ReceiptCheck = { total: number; itemsTotal: number; computed: number; source: 'printed' | 'computed' | 'paid' | 'items' | 'none'; confidence: 'tinggi' | 'sedang' | 'rendah'; matches: boolean; notes: string[] };
const near = (a: number, b: number) => a > 0 && b > 0 && Math.abs(a - b) <= Math.max(100, Math.round(b * .002));
const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const CHARGE_LABELS: Record<string, string> = { tax: 'pajak', service: 'service', delivery: 'ongkir', discount: 'diskon', rounding: 'pembulatan' };
/**
 * Every printed total and paid − change against items (or subtotal) plus every combination of the charges. A combination
 * that leaves a charge out explains it: PPN already inside the prices, a "hemat" line that was only information.
 */
function solve(read: ReceiptRead, itemsTotal: number) {
  const charges = ([['tax', read.tax], ['service', read.service], ['delivery', read.delivery], ['discount', -read.discount], ['rounding', read.rounding]] as [string, number][]).filter(([, value]) => value);
  const bases = [...new Set([read.subtotal, itemsTotal].filter(v => v > 0))];
  const byPayment = read.paid && read.change && read.paid > read.change ? read.paid - read.change : 0;
  const targets = [...(read.totals?.length ? read.totals : read.total ? [read.total] : []), ...(byPayment ? [byPayment] : [])];
  let best: { target: number; base: number; left: string[]; value: number; rank: number } | null = null;
  targets.forEach((target, t) => bases.forEach((base, b) => {
    for (let mask = 0; mask < 1 << charges.length; mask++) {
      const used = charges.filter((_, i) => mask & (1 << i)), value = base + used.reduce((n, [, v]) => n + v, 0);
      if (!near(value, target)) continue;
      const rank = (t === 0 ? 100 : 0) + used.length * 10 + (b === 0 ? 1 : 0);
      if (!best || rank > best.rank) best = { target, base, left: charges.filter((_, i) => !(mask & (1 << i))).map(([k]) => k), value, rank };
    }
  }));
  return { best: best as { target: number; base: number; left: string[]; value: number; rank: number } | null, byPayment, all: (bases[0] || 0) ? bases[0] + charges.reduce((n, [, v]) => n + v, 0) : 0 };
}
export function checkReceipt(read: ReceiptRead): ReceiptCheck {
  const itemsTotal = read.items.reduce((sum, item) => sum + item.total, 0);
  const { best, byPayment, all } = solve(read, itemsTotal);
  const notes: string[] = [...(read.fixes || [])];
  let total = 0, source: ReceiptCheck['source'] = 'none', computed = all;
  if (best) {
    total = best.target; computed = best.value;
    source = read.total && (read.totals || [read.total]).includes(best.target) ? 'printed' : 'paid';
    notes.push(best.left.length ? `Item dan biaya cocok dengan totalnya (${best.left.map(k => CHARGE_LABELS[k]).join(', ')} sudah termasuk atau hanya info).` : 'Item, pajak, dan service cocok dengan totalnya.');
    if (best.target !== read.total && read.total) notes.push(`Dipakai ${rp(best.target)} karena cocok dengan isi struk; total lain yang terbaca ${rp(read.total)}.`);
  } else if (read.total) { total = read.total; source = 'printed'; }
  else if (byPayment) { total = byPayment; source = 'paid'; notes.push(`Total dihitung dari bayar ${rp(read.paid)} dikurangi kembalian ${rp(read.change)}.`); }
  else if (all) { total = all; source = read.subtotal || all === itemsTotal ? 'items' : 'computed'; notes.push('Total tidak tertulis jelas; dihitung dari item dan biaya.'); }
  const matches = Boolean(best);
  if (!best && read.total && byPayment && !near(read.total, byPayment)) notes.push(`Total tertulis ${rp(read.total)}, tetapi bayar − kembalian = ${rp(byPayment)}. Periksa lagi.`);
  if (!best && read.total && all) notes.push(`Item dan biaya berjumlah ${rp(all)}, total tertulis ${rp(read.total)} (selisih ${rp(Math.abs(read.total - all))}). Mungkin ada item yang terlewat atau salah baca.`);
  if (read.subtotal && itemsTotal && !near(read.subtotal, itemsTotal) && !near(read.subtotal, itemsTotal - read.discount)) notes.push(`Jumlah item ${rp(itemsTotal)} belum sama dengan subtotal ${rp(read.subtotal)}; periksa itemnya.`);
  const crossChecked = matches || Boolean(source === 'printed' && byPayment && near(read.total, byPayment));
  const lonely = source === 'printed' && !all && !byPayment;
  const tiny = total > 0 && total < 1000;
  if (lonely && !tiny) notes.push('Tidak ada item atau subtotal untuk mencocokkan total. Pastikan nominalnya benar.');
  if (tiny) notes.push('Nominal sangat kecil; mungkin angka depannya tidak terbaca. Periksa lagi dengan struknya.');
  const confidence: ReceiptCheck['confidence'] = !total || tiny ? 'rendah' : crossChecked ? 'tinggi' : lonely ? 'rendah' : source === 'printed' || source === 'paid' ? 'sedang' : 'rendah';
  if (!total) notes.push('Total belum terbaca. Isi nominalnya sendiri.');
  return { total, itemsTotal, computed, source, confidence, matches, notes };
}
/** How good a reading is, to pick the best of several OCR passes. */
export function receiptScore(read: ReceiptRead) {
  const check = checkReceipt(read);
  return read.items.length * 2 + (read.total ? 4 : 0) + (check.matches ? 10 : 0) + (check.confidence === 'tinggi' ? 3 : 0) + (read.subtotal ? 1 : 0) + (read.date ? 1 : 0) + (read.merchant ? 1 : 0) - read.skipped * .3;
}

/* ------------------------------------------------------------------ A transaction to confirm */

export type ReceiptItemGuess = ReceiptLine & { categoryId: string | null; subcategoryId: string | null };
export type ReceiptTransaction = {
  type: 'expense' | 'income'; amount: number; date: string; time: string; merchant: string; description: string;
  categoryId: string | null; subcategoryId: string | null; why?: string; walletId: string; walletWhy: string;
  items: ReceiptItemGuess[]; splits: SplitLine[]; check: ReceiptCheck;
};
type Context = { categories: Pick<Category, 'id' | 'name' | 'type' | 'parentId' | 'icon' | 'templateKey' | 'isArchived'>[]; history: LedgerTx[]; wallets: Pick<Wallet, 'id' | 'name' | 'type' | 'isArchived' | 'canPay' | 'isSpendable'>[]; today: string; defaultWalletId?: string };
const lower = (text: string) => text.toLocaleLowerCase('id-ID');
/** The wallet the receipt was most likely paid with. */
export function walletForPayment(payment: PaymentMethod, wallets: Context['wallets'], fallback = '') {
  const usable = wallets.filter(w => !w.isArchived && w.isSpendable !== false && w.canPay !== false);
  const named = (words: string[]) => usable.find(w => words.some(word => lower(w.name).replace(/[^a-z0-9]/g, '').includes(word)));
  const brand: Partial<Record<PaymentMethod, string[]>> = { gopay: ['gopay'], ovo: ['ovo'], dana: ['dana'], shopeepay: ['shopeepay', 'spay'], linkaja: ['linkaja'] };
  let wallet = brand[payment] ? named(brand[payment]!) : undefined;
  if (!wallet && payment === 'cash') wallet = usable.find(w => w.type === 'cash');
  if (!wallet && payment === 'credit') wallet = usable.find(w => w.type === 'credit');
  const chosen = wallet || usable.find(w => w.id === fallback) || usable[0];
  return { walletId: chosen?.id || '', why: wallet ? `Dibayar ${PAYMENT_LABELS[payment]} → ${wallet.name}` : payment ? `Dibayar ${PAYMENT_LABELS[payment]}; dompet utama dipakai` : '' };
}
/** Everything the confirmation screen starts with; the user checks and changes it before saving. */
export function receiptToTransaction(read: ReceiptRead, context: Context, type: 'expense' | 'income' = 'expense'): ReceiptTransaction {
  const check = checkReceipt(read);
  const categories = context.categories.filter(c => !c.isArchived);
  const guessFor = (text: string, amount: number, merchant = read.merchant) => suggestCategory({ text: lower(text), item: lower(text), merchant, amount, type }, { categories, history: context.history });
  const itemText = read.items.map(item => item.name).join(' ');
  const overall = guessFor(`${read.merchant} ${itemText}`.trim(), check.total);
  // Each item on its own: "nasi goreng" at a coffee shop is still food.
  const items: ReceiptItemGuess[] = read.items.map(item => { const guess = type === 'expense' ? guessFor(item.name, item.total, '') : null; return { ...item, categoryId: guess?.categoryId || overall?.categoryId || null, subcategoryId: guess ? guess.subcategoryId || null : overall?.subcategoryId || null }; });
  // A split by category when the items clearly belong to different categories (e.g. groceries and medicine).
  let splits: SplitLine[] = [];
  const groups = new Map<string, SplitLine>();
  for (const item of items) { if (!item.categoryId) continue; const key = `${item.categoryId}:${item.subcategoryId || ''}`; const line = groups.get(key) || { categoryId: item.categoryId, subcategoryId: item.subcategoryId, amount: 0 }; line.amount += item.total; groups.set(key, line); }
  const parents = new Set([...groups.values()].map(line => line.categoryId));
  if (type === 'expense' && parents.size > 1 && check.total > 0 && check.itemsTotal > 0 && items.every(item => item.categoryId)) {
    const lines = [...groups.values()];
    const parts = allocate(check.total, lines.map(line => line.amount));
    splits = lines.map((line, i) => ({ ...line, amount: parts[i] })).filter(line => line.amount > 0);
  }
  const wallet = walletForPayment(read.payment, context.wallets, context.defaultWalletId);
  const date = read.date && read.date <= context.today && read.date >= `${Number(context.today.slice(0, 4)) - 1}${context.today.slice(4)}` ? read.date : context.today;
  const names = read.items.map(item => item.name);
  const description = names.length && names.length <= 2 ? names.join(', ') : read.merchant ? (type === 'income' ? `Dari ${read.merchant}` : `Belanja di ${read.merchant}`) : names[0] || '';
  return { type, amount: check.total, date, time: read.time, merchant: read.merchant, description, categoryId: overall?.categoryId || null, subcategoryId: overall?.subcategoryId || null, why: overall?.why, walletId: wallet.walletId, walletWhy: wallet.why, items, splits, check };
}
