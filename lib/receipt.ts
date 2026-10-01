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
 *
 * Receipt Intelligence 2.0 additions (nothing here is ever made up; what is not printed stays empty):
 *  - every field remembers the input line(s) it came from (`sources`, item `lines`), so the app can show where on the
 *    photo a value was read, and the lines are sorted into zones: header, items, summary, payment, footer;
 *  - an item name printed over two lines ("AYAM GEPREK" / "SAMBAL MATAH 32.000") stays one item; notes under an item
 *    ("NO ICE") belong to it; a paid add-on ("+ EXTRA SHOT") stays its own line, marked as an add-on;
 *  - a discount printed right under an item ("DISC MINYAK -5.000") is that item's discount, not the bill's;
 *  - charges are also kept one by one with a finer type (admin, packaging, voucher, shipping discount…); cashback is
 *    information, never taken off what was paid;
 *  - the payment method comes from the payment part of the receipt ("PROMO GOPAY" in the footer is not a payment);
 *  - dates are checked against the real calendar (31/02 is not a date);
 *  - receipt numbers, cashier, table, fuel (litres × price per litre) and parking details are read when printed.
 */
import { allocate } from './accounting.ts';
import { suggestCategory } from './categorize.ts';
import { readOrderScreen } from './receipt-doc.ts';
import type { Category, LedgerTx, SplitLine, Wallet } from './types';

export type ReceiptLine = {
  name: string; qty: number; price: number;
  /** qty × price: the amount printed on the line, before an item discount. */
  total: number;
  /** A discount printed for this item (positive); the item costs total − discount. */
  discount?: number;
  /** Notes printed under the item ("NO ICE", "LESS SUGAR"). */
  modifiers?: string[];
  /** Modifiers whose owner is not certain (shown as "Perlu dicek"); always also in `modifiers`. */
  modifiersUnsure?: string[];
  /** A variant or product code printed under the name ("DB024 - 12/60"). */
  variant?: string;
  /** The variant has letters and digits OCR often swaps (O/0, I/1, S/5) side by side: shown as "Perlu dicek". */
  variantUnsure?: boolean;
  /** A barcode / SKU printed on the item's row; never an item by itself. */
  sku?: string;
  /** The crossed-out price on an order screen: information only, never what was paid. */
  originalPrice?: number;
  /** A paid add-on ("+ EXTRA SHOT") and the item it belongs to. */
  addOnOf?: string;
  /** False when the unit price was not printed (only derived from the line total ÷ quantity). */
  unitPrinted?: boolean;
  /** The input lines it was read from (0-based lines of the text given to readReceiptText). */
  lines?: number[];
};
export type ReceiptZone = 'header' | 'items' | 'summary' | 'payment' | 'footer';
export type ChargeType = 'tax' | 'service' | 'delivery' | 'admin_fee' | 'platform_fee' | 'packaging' | 'tip' | 'insurance' | 'other_fee' | 'discount' | 'voucher' | 'shipping_discount' | 'rounding' | 'cashback';
/** One charge line as printed; `key` is the simple group the rest of the app uses. */
export type ReceiptCharge = { type: ChargeType; key: ChargeKey | 'cashback'; label: string; amount: number; rate?: number; line: number };
export type ReceiptType = 'restaurant' | 'cafe' | 'minimarket' | 'supermarket' | 'retail' | 'pharmacy' | 'fuel' | 'parking' | 'food_delivery' | 'marketplace' | 'travel' | 'generic' | 'unknown';
export type ReceiptIds = { receiptNo?: string; orderNo?: string; cashier?: string; table?: string; terminal?: string; branch?: string; station?: string; pump?: string; plate?: string };
export type SourceField = 'merchant' | 'date' | 'time' | 'subtotal' | 'total' | 'tax' | 'service' | 'discount' | 'delivery' | 'fee' | 'rounding' | 'paid' | 'change' | 'payment' | 'cashback';
/** Net amount of an item (after its own discount). */
export const netOf = (item: Pick<ReceiptLine, 'total' | 'discount'>) => item.total - (item.discount || 0);
export const itemsNet = (items: Pick<ReceiptLine, 'total' | 'discount'>[]) => items.reduce((n, item) => n + netOf(item), 0);
export type PaymentMethod = '' | 'cash' | 'qris' | 'debit' | 'credit' | 'transfer' | 'gopay' | 'ovo' | 'dana' | 'shopeepay' | 'linkaja';
export type ReceiptRead = {
  merchant: string; date: string; time: string; items: ReceiptLine[];
  subtotal: number; tax: number; service: number; discount: number; delivery: number; rounding: number; total: number;
  /** Other charges: admin, handling, packaging, app fee, tip. */
  fee?: number;
  paid: number; change: number; payment: PaymentMethod; skipped: number;
  /** Every total printed (Grand Total, Total Bayar, Total…), the most likely first. */
  totals?: number[];
  /** Percentages printed next to tax and service ("PB1 10%"), to catch a misread amount. */
  rates?: Partial<Record<'tax' | 'service' | 'discount', number>>;
  /** Amounts corrected because they did not add up (shown to the user). */
  fixes?: string[];
  /** Receipt Intelligence 2.0 (all optional; older readings do not have them). */
  merchantRaw?: string;
  /** The company behind the shop ("PT Daya Indah Anugerah") and the outlet ("Depok Town Square"), when printed. */
  legalEntity?: string;
  branch?: string;
  /** The app an order was made in (Shopee, Tokopedia…), when it is not the shop itself. */
  platform?: string;
  charges?: ReceiptCharge[];
  /** Cashback or points received: information only, never taken off what was paid. */
  cashback?: number;
  identifiers?: ReceiptIds;
  receiptType?: ReceiptType;
  /** Input line indices each field was read from. */
  sources?: Partial<Record<SourceField, number[]>>;
  /** Every input line that was used, with its zone. */
  layout?: { line: number; zone: ReceiptZone; text: string }[];
  fuel?: { product: string; liters: number; pricePerLiter: number; matches: boolean };
  parking?: { entry?: string; exit?: string; duration?: string };
  /** Amount lines in the item part that could not be read as items (an item may be missing). */
  itemGaps?: number;
};
export const PAYMENT_LABELS: Record<PaymentMethod, string> = { '': '', cash: 'Tunai', qris: 'QRIS', debit: 'Kartu debit', credit: 'Kartu kredit', transfer: 'Transfer', gopay: 'GoPay', ovo: 'OVO', dana: 'DANA', shopeepay: 'ShopeePay', linkaja: 'LinkAja' };

/* ------------------------------------------------------------------ Cleaning OCR text */

const DIGITISH = /[0-9OoDQlIi|SsBZz]/;
/** Fixes letters read in place of digits inside amounts, and amounts broken by spaces. */
export function cleanOcrText(text: string) {
  return text.split(/\r?\n/).map(cleanLine).filter(Boolean).join('\n');
}
function cleanLine(raw: string) {
  {
    let line = raw.replace(/[‐‑‒–—―]/g, '-').replace(/[“”„]/g, '"').replace(/[‘’`´]/g, "'").replace(/\t/g, '  ');
    line = line.replace(/^[\s|_~'"*•·]+|[\s|_~'"]+$/g, '').replace(/^[.,:;=~—-]{2,}\s*|^[.,:;=~]\s+/, '').replace(/["'](?=\d)|(?<=\d)["']/g, '');
    // Tokens that are mostly digits: fix look-alike letters ("35.0O0", "l2.500", "S.170").
    line = line.replace(/[0-9OoDQlIi|SsBZz][0-9OoDQlIi|SsBZz.,]{2,}/g, token => {
      const digits = (token.match(/\d/g) || []).length, letters = token.replace(/[\d.,]/g, '').length;
      // "25.OOO": a thousands group of O's is still money (the shape decides, not the letter count).
      const grouped = /\d/.test(token) && /^[0-9OoDQlI|SB]{1,3}(?:[.,][0-9OoDQ]{3})+$/.test(token);
      if (!grouped && (digits < 2 || letters > digits || !/[.,]\d|\d[.,]|\d{3}/.test(token.replace(/[OoDQ]/g, '0').replace(/[lIi|]/g, '1')))) return token;
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
    line = line.replace(/(^|\s)(\d{1,3})\s*(?:[xX×]{1,3}|\*)\s*(?=(?:rp\.?\s*)?\d)/gi, '$1$2 x ');
    return line.replace(/\s+/g, ' ').trim();
  }
}
/** `raw`: the line as read, before amount clean-up (codes and names are kept as printed). */
type SourceLine = { text: string; origin: number[]; raw?: string };
/**
 * Cleaned lines with the input lines they came from. An amount the reader broke over two lines ("450" / "000", the
 * dot lost) is joined back.
 */
function cleanLines(text: string): SourceLine[] {
  const out: SourceLine[] = [];
  text.split(/\r?\n/).forEach((raw, i) => { const line = cleanLine(raw); if (line) out.push({ text: line, origin: [i], raw: raw.replace(/\s+/g, ' ').trim() }); });
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i].text.match(/^(-?\d{1,3})$/), b = out[i + 1].text.match(/^[.,]?(\d{2}0)$/);
    if (a && b) { out[i] = { text: `${a[1]}.${b[1]}`, origin: [...out[i].origin, ...out[i + 1].origin] }; out.splice(i + 1, 1); }
  }
  return out;
}

/* ------------------------------------------------------------------ Two columns read one after the other */

const AMOUNT_ONLY = /^[-−]?\s*(?:rp\.?\s*|idr\s*)?(?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|[1-9]\d{2,6})$/i;
const labelOnly = (line: string) => /[a-z]{2,}/i.test(line) && !/\d{3,}/.test(line.replace(/[\s.,]/g, ''));
/**
 * "NASI GORENG / ES TEH / TOTAL / 35.000 / 12.000 / 47.000" → "NASI GORENG 35.000 / ES TEH 12.000 / TOTAL 47.000".
 * The prices belong to the last names before them (the header above has no price).
 */
export function pairColumns(lines: string[]) {
  return pairColumnLines(lines.map((text, i) => ({ text, origin: [i] }))).map(line => line.text);
}
function pairColumnLines(lines: SourceLine[]) {
  const out: SourceLine[] = [];
  for (let i = 0; i < lines.length;) {
    if (!labelOnly(lines[i].text)) { out.push(lines[i]); i++; continue; }
    let j = i; while (j < lines.length && labelOnly(lines[j].text)) j++;
    let k = j; while (k < lines.length && AMOUNT_ONLY.test(lines[k].text)) k++;
    const labels = j - i, amounts = k - j, n = Math.min(labels, amounts);
    if (!n) { out.push(...lines.slice(i, j)); i = j; continue; }
    out.push(...lines.slice(i, j - n));
    for (let m = 0; m < n; m++) out.push({ text: `${lines[j - n + m].text} ${lines[j + m].text}`, origin: [...lines[j - n + m].origin, ...lines[j + m].origin] });
    out.push(...lines.slice(j + n, k));
    i = k;
  }
  return out;
}

/* ------------------------------------------------------------------ Key words, matched loosely */

const AMOUNT = /(-|−)?\s*(?:rp\.?\s*|idr\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?=\s*$)/i;
/** "35.000", "35,000", "Rp 35.000,00", "35000" → 35000. Long plain digit runs (phone numbers, codes) are not amounts. */
export function readAmount(text: string) {
  const match = text.match(AMOUNT);
  if (!match) return null;
  const before = text[(match.index || 0) + match[0].indexOf(match[2]) - 1] || '';
  if (/[\d.,]/.test(before)) return null;
  // "A-2231", "INV-0045": a code with a hyphen, not a negative amount.
  if (match[1] && /[a-z0-9]/i.test(text[(match.index || 0) - 1] || '')) return null;
  if (!/[.,]/.test(match[2]) && (match[2].length > 8 || (match[2].length > 1 && match[2].startsWith('0')))) return null;
  const value = Number(match[2].replace(/[.,]/g, ''));
  if (!Number.isSafeInteger(value)) return null;
  return { value: match[1] ? -value : value, start: match.index || 0 };
}
type Key = 'subtotal' | 'tax' | 'service' | 'discount' | 'delivery' | 'fee' | 'rounding' | 'total' | 'paid' | 'change' | 'cashback' | 'ignore';
/** Checked in this order. */
const KEYS: [Key, RegExp][] = [
  ['ignore', /\b(npwp|telp|tel|phone|hp|wa|kasir|cashier|operator|no\.?\s*(struk|nota|meja|order|trx|transaksi|invoice|ref|kartu|card)|order\s*(#|id|no)|table|meja|pax|shift|member\s*(id|no|card)|(no|id)\.?\s*member|poin|points?|stamp|saldo|sisa\s*saldo|dpp|approval|appr|trace|batch|tid|mid|rrn|auth|kode|code|terminal|merchant\s*id|invoice|pin|total\s*(item|items|qty|barang|pcs|jumlah\s*item)|jumlah\s*(item|barang|qty|pcs)|qty\s*total|item\s*:?|sms|call|hubungi|customer|konsumen|kritik|saran|www|http|email|wifi|password)\b|(?:^|\s)(?:#|no\.?|nomor)\s*:?\s*$/i],
  ['subtotal', /\b(sub\s*-?\s*t[o0]ta[l1i]|s\/?t[o0]ta[l1i]|total\s*harga\s*barang|harga\s*jual|total\s*penjualan|harga\s*(makanan|pesanan|barang|produk)|subtotal\s*(produk|pesanan|untuk\s*produk)|jumlah\s*harga|total\s*harga\s*produk|sub\s*jumlah)\b/i],
  ['cashback', /\b(cash\s*back|cashback(\s*koin)?|koin\s*(didapat|diperoleh|cashback)|poin\s*(didapat|diperoleh))\b/i],
  ['discount', /\b(d[i1l]sk[o0]n|disc(ount)?|dsc|potongan|promo|voucher|vouc|kupon|coupon|hemat|member\s*disc|rabat|reduksi|koin\s*(shopee|dipakai)|poin\s*dipakai|subsidi)\b/i],
  ['service', /\b(serv[i1l]ce(\s*charge)?|serv[i1l]s|srv|svc(\s*chg)?|s\/c|service\s*&\s*tax|tax\s*&\s*service|s\.?c\.?|biaya\s*layanan|layanan\s*\d+\s*%)\b/i],
  ['tax', /\b(pb\s*-?\s*[1il)\]|!](?![a-z])|p\.b\.?\s*1|pajak(\s*(resto(ran)?|daerah|pembangunan))?|ppn|tax|vat|pbjt|gst)\b/i],
  ['fee', /\b(asuransi(\s*pengiriman)?|proteksi(\s*pengiriman)?)\b/i],
  ['delivery', /\b(ongkir|ongkos\s*kirim|delivery(\s*fee|\s*charge)?|pengiriman|biaya\s*(antar|kirim)|shipping|kurir|ongkos\s*angkut|biaya\s*angkut|angkutan|ongkos\s*bongkar|jasa\s*antar)\b/i],
  ['fee', /\b(biaya\s*(admin|administrasi|aplikasi|penanganan|kemasan|packing|pengemasan|platform|jasa|transaksi|tambahan|pemesanan|proteksi|asuransi\s*pengiriman)|admin(\s*fee)?|handling(\s*fee)?|packaging|platform\s*fee|convenience\s*fee|order\s*fee|small\s*order\s*fee|tip|tips|gratuity|kemasan|bungkus|takeaway\s*fee|asuransi\s*pengiriman)\b/i],
  ['rounding', /\b(pembulatan|rounding|round|pembul)\b/i],
  ['change', /\b(kembal[i1l](an)?|change|kembali\s*uang|kemb)\b/i],
  ['total', /\b(grand\s*t[o0]ta[l1i]|t[o0]ta[l1i](\s*(bayar|tagihan|belanja|harga|pembayaran|akhir|pesanan|penjualan))?|t[o0]t|ttl|jumlah(\s*(bayar|tagihan|harga))?|tagihan|amount\s*due|net\s*(amount|total|sales)|harus\s*dibayar|total\s*due)\b/i],
  ['paid', /\b(tunai|cash|bayar|dibayar|pembayaran|payment|paid|tendered|debit|debet|kredit|credit|qris|gopay|go-pay|ovo|dana|shopeepay|linkaja|edc|kartu|card|transfer|flazz|e-?money|brizzi|tapcash|[o0]ris)\b/i],
];
/** Strong payment words; the weaker ones (kartu, debit, transfer…) count only in the summary, not as an item name. */
const PAID_STRONG = /^\s*(tunai|cash|bayar|dibayar|pembayaran|payment|paid|tendered|[oq0]ris|edc)\b/i;
const FUZZY: [Key, string[]][] = [
  ['subtotal', ['subtotal']], ['total', ['total', 'grandtotal', 'tagihan']], ['change', ['kembali', 'kembalian']], ['paid', ['tunai']],
  ['discount', ['diskon', 'discount', 'potongan', 'voucher']], ['service', ['service']], ['tax', ['pajak']], ['rounding', ['pembulatan']], ['delivery', ['ongkir', 'pengiriman']],
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
  // "Total Incl. PPN", "Total termasuk PPN": the total, with the tax already inside it.
  if (/^\s*(?:grand\s*)?t[o0]ta[l1i]\b/i.test(label) && /\b(incl\.?|include[sd]?|termasuk|sudah\s*termasuk)\b/i.test(label)) return 'total';
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
  ['gopay', /\bgo\s*-?\s*pay\b/i], ['ovo', /\b[o0]vo\b/i], ['shopeepay', /\bshopee\s*pay\b|\bspay\b/i], ['linkaja', /\blink\s*aja\b/i], ['dana', /\bdana\b(?!\s*(darurat|pensiun))/i],
  ['qris', /\b[oq0]ris\b|\bqr\s*(code|payment)\b|^\s*qr\s*$/i], ['credit', /\b(kartu\s*kredit|credit\s*card|kredit|visa|master\s*card|mastercard|amex|jcb)\b/i], ['debit', /\b(debit|debet|kartu\s*debit|edc|bca\s*card|atm|gpn|flazz|e-?money|brizzi|tapcash)\b/i],
  ['transfer', /\b(transfer|trf|tf|virtual\s*account|va)\b/i], ['cash', /\b(tunai|cash)\b/i],
];
const UNITS = 'sak|kg|kilo|gr|gram|ons|pcs|bh|buah|btl|botol|pck|pack|bks|bungkus|porsi|lusin|dus|box|m|meter|ltr|liter|lbr|lembar|set|unit|roll|batang|ikat|sachet';
const NUMBER = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d{3,})`;
const readNumber = (text: string) => Number(text.replace(/[.,]/g, ''));
/** Name, quantity and unit price from the text before a line's total; a reading counts only when quantity × price = total. */
function readItem(label: string, total: number): { name: string; qty: number; price: number; alt?: number; unitPrinted?: boolean } {
  label = label.replace(/(\s+[^\w\s.,]{1,2})+$/, '').trim();
  // "2 x 5.000 AQUA 600": quantity and unit price printed before the name.
  const front = label.match(new RegExp(String.raw`^(\d{1,3})\s*[x×@]\s*(?:rp\.?\s*)?${NUMBER}\s+(?=[a-z])`, 'i'));
  if (front && +front[1] * readNumber(front[2]) === total) return { name: label.slice(front[0].length).trim(), qty: +front[1], price: readNumber(front[2]), unitPrinted: true };
  const tries: [RegExp, (match: RegExpMatchArray) => [number, number] | null][] = [
    [new RegExp(String.raw`(?:^|[\s.,'|])(\d{1,3})\s*(?:${UNITS})?\s*(?:pcs|x|×|@)\s*(?:rp\.?\s*)?${NUMBER}\s*$`, 'i'), match => [+match[1], readNumber(match[2])]],
    [new RegExp(String.raw`(?:^|\s)@\s*(?:rp\.?\s*)?${NUMBER}\s*$`, 'i'), match => { const unit = readNumber(match[1]); return unit && total % unit === 0 ? [total / unit, unit] : null; }],
    [new RegExp(String.raw`(?:^|\s)${NUMBER}\s*[x×]\s*(\d{1,3})\s*$`, 'i'), match => [+match[2], readNumber(match[1])]],
    [new RegExp(String.raw`(?:^|\s)(\d{1,3})\s*(?:pcs|bh|buah|btl|pck|porsi)?\s+(?:rp\.?\s*)?${NUMBER}\s*$`, 'i'), match => [+match[1], readNumber(match[2])]],
    [new RegExp(String.raw`(?:^|\s)(?:rp\.?\s*)?${NUMBER}\s*$`, 'i'), match => [1, readNumber(match[1])]],
  ];
  for (const [pattern, read] of tries) {
    const match = label.match(pattern), got = match && read(match);
    if (match && got && got[0] >= 1 && got[1] > 0 && got[0] * got[1] === total) return { name: label.slice(0, match.index).trim(), qty: got[0], price: got[1], unitPrinted: true };
  }
  // "ROTI 1 16.560 16.500": the quantity is clear but the unit price was misread; the line total decides.
  const unclear = label.match(new RegExp(String.raw`(?:^|\s)(\d{1,2})\s*(?:x|×|@|pcs)?\s+(?:rp\.?\s*)?${NUMBER}\s*$`, 'i'));
  if (unclear && +unclear[1] >= 1 && total % +unclear[1] === 0 && Math.abs(readNumber(unclear[2]) - total / +unclear[1]) <= total / +unclear[1] * .15) return { name: label.slice(0, unclear.index).trim(), qty: +unclear[1], price: total / +unclear[1], alt: +unclear[1] * readNumber(unclear[2]) };
  // Quantity and unit price that do not give the line total: one of them was misread; kept as an alternative.
  if (unclear && +unclear[1] >= 1 && /[a-z]{2,}/i.test(label.slice(0, unclear.index))) { const qty = +unclear[1], unit = readNumber(unclear[2]); return { name: label.slice(0, unclear.index).trim(), qty: total % qty === 0 ? qty : 1, price: total % qty === 0 ? total / qty : total, alt: qty * unit }; }
  const lead = label.match(/^(\d{1,3})\s*[x×]\s*(?=\D)/i) || label.match(/^(\d{1,2})\s+(?=[a-z])/i);
  // The quantity is printed but not the unit price: the unit price is only derived (the line total is what was printed).
  if (lead && +lead[1] >= 1 && +lead[1] <= 99 && total % +lead[1] === 0) return { name: label.slice(lead[0].length).trim(), qty: +lead[1], price: total / +lead[1], unitPrinted: +lead[1] === 1 };
  const tail = label.match(/\s[x×]\s*(\d{1,3})$/i) || label.match(/\s(\d{1,3})\s*(?:[x×]|pcs)$/i);
  if (tail && +tail[1] >= 1 && total % +tail[1] === 0) return { name: label.slice(0, tail.index).trim(), qty: +tail[1], price: total / +tail[1], unitPrinted: +tail[1] === 1 };
  return { name: label, qty: 1, price: total, unitPrinted: true };
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'];
const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATE_TEXT = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b|\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b|\b(\d{1,2})[\s-]+([a-z]{3})[a-z]*\.?[\s-]+(20\d{2}|\d{2})\b|\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i;
export function readReceiptDate(text: string) {
  const pad = (n: number) => String(n).padStart(2, '0');
  // The real calendar: 31/02 and 29/02/2025 are not dates.
  const valid = (y: number, m: number, d: number) => y >= 2000 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate() ? `${y}-${pad(m)}-${pad(d)}` : '';
  const monthOf = (name: string) => { const key = name.toLowerCase(); return Math.max(MONTHS.indexOf(key), MONTHS_EN.indexOf(key)) + 1; };
  const year = (text: string) => +text < 100 ? 2000 + +text : +text;
  const match = text.match(DATE_TEXT);
  if (!match) return '';
  if (match[1]) return valid(+match[1], +match[2], +match[3]);
  if (match[4]) { let d = +match[4], m = +match[5]; if (m > 12 && d <= 12) [d, m] = [m, d]; return valid(year(match[6]), m, d); }
  if (match[7]) { const month = monthOf(match[8]); return month ? valid(year(match[9]), month, +match[7]) : ''; }
  const month = monthOf(match[10]); return month ? valid(+match[12], month, +match[11]) : '';
}
const TIME = /\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:[:.][0-5]\d)?\b/;
const TIMES = /\b([01]?\d|2[0-3])([:.])([0-5]\d)(?:[:.][0-5]\d)?(?!\d)\s*(am|pm|a\.m\.|p\.m\.)?/gi;
const TIME_WORDS = /\b(jam|pukul|time|waktu|wib|wita|wit|am|pm)\b/i;
/** A clock time on a line (not inside its date): "19:45", "7:45 PM", "19.45 WIB", "Jam 19.45". */
export function timeOf(line: string) {
  const rest = line.replace(DATE_TEXT, ' ');
  const all = [...rest.matchAll(TIMES)];
  const pick = all.find(m => m[2] === ':') || (TIME_WORDS.test(rest) ? all[0] : undefined);
  if (!pick) return '';
  let hour = +pick[1]; const half = pick[4]?.toLowerCase();
  if (half?.startsWith('p') && hour < 12) hour += 12; if (half?.startsWith('a') && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${pick[3]}`;
}
/** Dates that are not the purchase: a voucher's or card's expiry, a due date. */
const NOT_PURCHASE = /\b(berlaku|s\/d|sampai|hingga|exp|expired|expiry|valid|kadaluarsa|kedaluwarsa|jatuh\s*tempo|due|masa\s*aktif|periode)\b/i;

/* ------------------------------------------------------------------ The place */

/** Well-known shops, found even when the OCR misses a letter ("lNDOMARET", "ALFAMRT"). */
const SHOPS = ['Indomaret', 'Alfamart', 'Alfamidi', 'Alfaexpress', 'Lawson', 'FamilyMart', 'Circle K', 'Superindo', 'Hypermart', 'Transmart', 'Carrefour', 'Lotte Mart', 'Giant', 'Hero', 'Ranch Market', 'Farmers Market', 'Grand Lucky', 'Tip Top', 'Yogya', 'Griya', 'Borma', 'Matahari', 'Ramayana', 'Uniqlo', 'Miniso', 'Daiso', 'IKEA', 'ACE Hardware', 'Informa', 'Mitra10', 'Gramedia', 'Guardian', 'Watsons', 'Century', 'Kimia Farma', 'Apotek K-24', 'Apotek Roxy', 'Starbucks', 'Janji Jiwa', 'Kopi Kenangan', 'Fore Coffee', 'Point Coffee', 'Tomoro Coffee', 'Kopi Tuku', 'Excelso', 'J.CO', 'Dunkin', 'Chatime', 'Mixue', 'KFC', "McDonald's", 'Burger King', 'Pizza Hut', "Domino's", 'HokBen', 'Yoshinoya', 'Marugame Udon', 'Solaria', 'Richeese Factory', 'A&W', 'Bakmi GM', 'Sushi Tei', 'Pertamina', 'Shell', 'Cinema XXI', 'CGV', 'Cinepolis', 'Tokopedia', 'Shopee', 'Grab', 'Gojek'];
const squash = (text: string) => lettersOf(text).replace(/\s/g, '');
const SHOP_ALIASES: Record<string, string> = { indomarco: 'Indomaret', sumberalfaria: 'Alfamart', midimutiara: 'Alfamidi', lawsonindonesia: 'Lawson', sumberalfariatrijaya: 'Alfamart' };
function knownShop(lines: string[]) {
  // Lines without prices only (the header and footer), compared word by word, so an item never becomes a shop.
  const picked = [...lines.slice(0, 8), ...lines.slice(-4)].filter(line => !/\d[.,]\d{3}/.test(line) && !/^(jl|jln|jalan|alamat|ruko|komplek|kel|kec|kota|kab)\b|\bjl\.|\b(yogyakarta|jakarta|bandung|surabaya|semarang|medan|bogor|depok|tangerang|bekasi|malang|bali|denpasar)\b.*\d|,\s*\w+\s*$/i.test(line.trim()));
  const candidates = picked.map(squash), raw = picked.map(l => l.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const [alias, shop] of Object.entries(SHOP_ALIASES)) if (candidates.some(line => line.includes(alias))) return shop;
  for (const shop of SHOPS) {
    const key = squash(shop.replace(/'/g, '')), exact = shop.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key.length < 3) continue;
    if (/^(apotek|kopi|toko|point|fore|grand|circle)/i.test(shop)) { if (candidates.some((line, i) => line.includes(key) && raw[i].includes(exact))) return shop; continue; }
    for (let i = 0; i < picked.length; i++) {
      const words = lettersOf(picked[i]).split(' ');
      // Short names ("Yogya", "Hero") only as a whole word, never inside another ("Yogyakarta").
      if (key.length < 6) { if (words.some((w, j) => w === key || w + (words[j + 1] || '') === key)) return shop; continue; }
      if (candidates[i].includes(key)) return shop;
      for (let w = 0; w < words.length; w++) for (const joined of [words[w], words[w] + (words[w + 1] || '')]) if (joined.length >= key.length - 1 && editDistance(joined, key) <= 1) return shop;
    }
  }
  return '';
}
/** A shop name: mostly letters, at least four of them (not OCR noise like "0 ERA" or "Se"), and not a greeting. */
const looksLikeName = (line: string) => { const letters = (line.match(/[a-z]/gi) || []).length, visible = line.replace(/\s/g, '').length, words = line.split(/\s+/); return letters >= 4 && letters / visible >= .7 && (words.some(w => /^[a-z&'.-]{4,}$/i.test(w)) || words.every(w => /^[A-Z0-9&'.-]{2,}$/.test(w))) && !/^(selamat|welcome|struk|receipt|nota|invoice|bukti|terima kasih|thank)/i.test(line); };

/* ------------------------------------------------------------------ Reading */

/* ------------------------------------------------------------------ Kinds of receipt, identifiers, fuel, parking */

const TYPE_CUES: [ReceiptType, RegExp, number, RegExp?][] = [
  ['fuel', /\b(spbu|pertamina|pertamax|pertalite|dexlite|bio\s*solar|solar|shell|v-?power|liter|ltr|pompa|pump|nozzle|bbm)\b/gi, 2, /\b(spbu|pertamax|pertalite|dexlite|solar|liter|ltr|bbm|v-?power)\b/i],
  ['parking', /\b(parkir|parking|karcis|masuk|keluar|durasi|entry|exit|kendaraan|nopol)\b/gi, 2, /\b(parkir|parking|karcis)\b/i],
  ['food_delivery', /\b(go-?food|grab-?food|shopee-?food|pesan(an)?\s*antar|driver|ongkos\s*kirim|ongkir|biaya\s*layanan|biaya\s*kemasan|resto)\b/gi, 2, /\b(go-?food|grab-?food|shopee-?food|pesan(an)?\s*antar|driver)\b/i],
  ['marketplace', /\b(tokopedia|shopee|lazada|bukalapak|blibli|tiktok\s*shop|invoice|subtotal\s*produk|asuransi\s*pengiriman|diskon\s*ongkos\s*kirim|total\s*tagihan|penjual|seller|pembelian)\b/gi, 2, /\b(tokopedia|shopee|lazada|bukalapak|blibli|asuransi\s*pengiriman|subtotal\s*produk|invoice)\b/i],
  ['pharmacy', /\b(apotek|apotik|farma|farmasi|obat|resep|tablet|kaplet|sirup|kapsul)\b/gi, 2, /\b(apotek|apotik|farma|farmasi|obat)\b/i],
  ['minimarket', /\b(indomaret|alfamart|alfamidi|lawson|circle\s*k|familymart|dpp|ppn|harga\s*jual|kembalian|npwp)\b/gi, 1],
  ['supermarket', /\b(swalayan|supermarket|hipermarket|hypermart|superindo|transmart|carrefour|lotte|giant|ranch|member\s*disc|kg)\b/gi, 1],
  ['cafe', /\b(coffee|kopi|cafe|kafe|latte|espresso|americano|cappuccino|teh\s*tarik|boba|croissant|roti\s*bakar)\b/gi, 1],
  ['restaurant', /\b(pb\s*1|service|meja|table|pax|resto(ran)?|rumah\s*makan|warung|nasi|ayam|bakmi|mie|sate|soto|makan)\b/gi, 1],
  ['travel', /\b(tiket|ticket|kereta|pesawat|penerbangan|flight|travel|hotel|booking|kursi|seat|keberangkatan)\b/gi, 2, /\b(kereta|pesawat|penerbangan|flight|hotel|keberangkatan)\b/i],
  ['retail', /\b(toko|store|mall|sepatu|kaos|baju|fashion|elektronik|size)\b/gi, 1],
];
/** What kind of receipt this is, from its words. Only a hint for reading; it never adds anything that is not printed. */
export function detectReceiptType(text: string): ReceiptType {
  if (!text.trim()) return 'unknown';
  const scores = TYPE_CUES.map(([type, cues, weight, needs]) => [type, needs && !needs.test(text) ? 0 : (text.match(cues) || []).length * weight] as [ReceiptType, number]);
  const best = scores.sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 2 ? best[0] : 'generic';
}
const FUEL_PRODUCT = /\b(pertamax\s*(?:turbo|green\s*\d*|plus)?|pertalite|dexlite|pertamina\s*dex|bio\s*solar|solar|shell\s*(?:super|v-?power(?:\s*diesel|\s*nitro\+?)?)|v-?power|revvo\s*\d+|bp\s*(?:ultimate|92|95)|premium)\b/i;
/** Receipt numbers, cashier, table and the like; kept as details, used to spot a receipt recorded twice. */
function readIdentifiers(lines: string[]): ReceiptIds {
  const ids: ReceiptIds = {};
  const first = (pattern: RegExp) => { for (const line of lines) { const m = line.match(pattern); if (m) return m[1].trim(); } return undefined; };
  ids.receiptNo = first(/\b(?:no\.?\s*(?:struk|nota|trx|transaksi|trans|invoice|inv|bon|receipt|ref|tiket|ticket|order)|nomor\s*(?:struk|nota|transaksi)|invoice\s*(?:no\.?|#)?|receipt\s*(?:no\.?|#))\s*[:.#]?\s*([A-Z0-9][A-Z0-9/\-.]{3,})/i);
  ids.orderNo = first(/\border\s*(?:#|no\.?|id)\s*[:.]?\s*([A-Z0-9][A-Z0-9-]{2,})/i) || first(/\border\s*#\s*([A-Z0-9-]{3,})/i);
  ids.cashier = first(/\b(?:kasir|cashier|operator)\s*[:.]?\s*([A-Za-z][A-Za-z.]{1,15}(?:\s[A-Za-z][a-z]{1,12})?)/i)?.replace(/\s+(meja|table|no|shift)$/i, '');
  ids.table = first(/\b(?:meja|table)\s*[:.#]?\s*([A-Z0-9]{1,4})\b/i);
  ids.terminal = first(/\b(?:terminal|tid)\s*[:.#]?\s*([A-Z0-9]{2,})/i);
  ids.branch = first(/\bcabang\s*[:.]?\s*([A-Za-z][\w .-]{1,30})/i);
  ids.station = first(/\bspbu\s*[:.]?\s*(\d[\d.\s-]{5,12}\d)/i)?.replace(/\s/g, '');
  ids.pump = first(/\b(?:pulau\s*\/?\s*pompa|pompa|pump|nozzle)\s*[:.]?\s*(\d{1,2})\b/i);
  ids.plate = first(/\b(?:no\.?\s*pol(?:isi)?|nopol|plat(?:\s*nomor)?|no\.?\s*kendaraan|plat\s*no)\s*[:.]?\s*([A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{0,3})\b/i);
  for (const key of Object.keys(ids) as (keyof ReceiptIds)[]) if (!ids[key]) delete ids[key];
  return ids;
}
/** Fuel: product, litres and price per litre; litres × price per litre must give the total to count as checked. */
function readFuel(lines: string[], total: number) {
  const text = lines.join('\n'), product = text.match(FUEL_PRODUCT)?.[0].replace(/\s+/g, ' ').trim().toUpperCase() || '';
  const liters = [...text.matchAll(/(\d{1,3}[.,]\d{1,3})\s*(?:l|ltr|liter|litre)\b/gi), ...text.matchAll(/\b(?:volume|liter|ltr)\s*[:.]?\s*(\d{1,3}[.,]\d{1,3})/gi)].map(m => Number(m[1].replace(',', '.'))).filter(v => v > 0 && v < 500);
  const prices = [...text.matchAll(/(\d{1,2}[.,]\d{3})(?![.,]\d)/g)].map(m => readNumber(m[1])).filter(v => v >= 5000 && v <= 40000);
  for (const l of liters) for (const p of prices) if (total && Math.abs(l * p - total) <= Math.max(100, total * .005)) return { product, liters: l, pricePerLiter: p, matches: true };
  return product || liters.length ? { product, liters: liters[0] || 0, pricePerLiter: 0, matches: false } : null;
}
function readParking(lines: string[]) {
  const timeOn = (pattern: RegExp) => { const line = lines.find(l => pattern.test(l)); return line ? timeOf(line) || undefined : undefined; };
  const duration = lines.map(l => l.match(/\b(?:durasi|lama|duration)\s*[:.]?\s*(.{2,24})/i)?.[1].trim()).find(Boolean);
  const parking = { entry: timeOn(/\b(masuk|entry|in)\b/i), exit: timeOn(/\b(keluar|exit|out)\b/i), duration };
  return parking.entry || parking.exit || parking.duration ? parking : null;
}
function chargeType(key: Key, label: string): ChargeType {
  const l = label.toLowerCase();
  if (key === 'discount') return /voucher|vouc|kupon|coupon/.test(l) ? 'voucher' : /ongkir|ongkos\s*kirim|pengiriman|shipping|kirim/.test(l) ? 'shipping_discount' : 'discount';
  if (key === 'fee') return /admin/.test(l) ? 'admin_fee' : /kemasan|packing|pengemasan|packaging|bungkus/.test(l) ? 'packaging' : /\btips?\b|gratuity/.test(l) ? 'tip' : /asuransi|proteksi|insurance/.test(l) ? 'insurance' : /platform|aplikasi|layanan|jasa|convenience|order\s*fee|penanganan|handling/.test(l) ? 'platform_fee' : 'other_fee';
  if (key === 'service') return /biaya\s*layanan|aplikasi|platform/.test(l) ? 'platform_fee' : 'service';
  if (key === 'cashback') return 'cashback';
  return key as ChargeType;
}

/* ------------------------------------------------------------------ Reading */

/** Header lines that are never part of an item name. */
const HEADERISH = /^(jl|jln|jalan|alamat|ruko|komplek|blok|kel|kec|kota|kab|cabang|telp|tel|hp|wa|npwp|kasir|cashier|selamat|welcome|terima|thank|www|http|nomor)\b|\bno\.?\s*\d|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/i;
/** A note printed under an item: "NO ICE", "+ EXTRA SHOT", "LESS SUGAR", "LARGE". */
const MODIFIER = /^(?:[+>~]\s*\S|(?:no|non|less|extra|add|tambah|tanpa|without|large|regular|reg|medium|small|hot|iced?|lvl|level|topping|size|sugar|normal|sedang|jumbo|mild|pedas|dingin|panas|take\s*away|dine\s*in)\b)/i;
const ADD_ON = /^(?:\+\s*|(?:extra|add|tambah|topping)\b)/i;
/** Words that make a priceless line under an item a note about it ("1 hangat 2 ice", "springkle", "tanpa bawang"). */
const MODIFIER_WORDS = /\b(no|non|less|kurang|lebih|sedikit|extra|add|tambah|tanpa|without|hangat|panas|hot|dingin|ice|iced|gula|sugar|tawar|sprinkle|springkle|sprinkel|topping|saus|sauce|sambal|pedas|level|lvl|large|regular|medium|small|half|double|bawang|seledri|matang|well\s*done|take\s*away|dine\s*in|bungkus|pisah|note|catatan)\b/i;
/** How much a priceless line under an item reads like a note about it rather than the start of the next name. */
function modifierScore(line: string) {
  let score = 0;
  if (MODIFIER.test(line) || MODIFIER_WORDS.test(line)) score += 3;
  if (/^\d{1,2}\s+[a-z]/i.test(line)) score += 2;                 // "1 hangat 2 ice"
  if (/^[a-z]/.test(line)) score += 1;                           // lower case, unlike printed names
  if (line.length <= 18) score += 1;
  if (/^[A-Z0-9 &'.-]{8,}$/.test(line)) score -= 1;              // an upper-case name like the items
  return score;
}
/** Legal entity, address and payment-brand lines in a receipt header, which are not the shop's own name. */
const LEGAL = /^(pt|cv|ud|pd|koperasi)\b\.?|\b(tbk|persero)\b/i;
const ADDRESSISH = /^(jl|jln|jalan|alamat|ruko|komplek|kompleks|blok|kel|kec|kota|kab|rt|rw|telp|tel|hp|wa|npwp|lt|lantai|gedung|unit)\b\.?|\b(rt|rw)\s*\d|\b\d{5}\b|\bno\.?\s*\d/i;
const PAYMENT_BRANDS = /^(qris|visa|mastercard|gopay|ovo|dana|shopeepay|linkaja|bca|mandiri|bni|bri|debit|kredit|credit)\b/i;
const PAYMENT_WORD = /^(?:qris|[oq0]ris|esb|visa|master|mastercard|gopay|ovo|dana|shopeepay|linkaja|bca|mandiri|bni|bri|cimb|permata|btn|jago|jenius|debit|debet|kredit|credit|card|kartu|edc|qr|tunai|cash|flazz|e-?money|brizzi|tapcash)$/i;
/** Every word of the label is a payment word (a reference number after a dash is allowed). */
function paymentOnly(label: string) {
  const words = label.replace(/\s+-\s+[A-Z0-9]+$/i, '').split(/[^a-z0-9-]+/i).filter(Boolean);
  return words.length > 0 && words.length <= 3 && words.every(w => PAYMENT_WORD.test(w));
}
/** Lines that are never money of the purchase: address with a postcode, phone, NPWP, item/qty counts, contact lines. */
export function notTransaction(line: string, raw: string) {
  const money = /\d{1,3}(?:[.,]\d{3})+|\brp\b/i.test(raw);
  if (/\bnpwp\b/i.test(raw)) return true;
  // Delivery and recipient lines of an order ("Delivered at : Budi S", "Maks Kirim", "Status Order") are not the shop.
  if (/^\s*(?:delivered\s*(?:at|to)|dikirim\s*(?:ke|kepada)|penerima|alamat(?:\s*pengiriman)?|maks\.?\s*kirim|status\s*(?:order|pesanan)|estimasi(?:\s*tiba)?)\b/i.test(raw)) return true;
  // An order or receipt reference ("Ref. S-260728-AGTDTPZ") is an identifier, never part of an item's name.
  if (/^\s*(?:ref|reference|no\.?\s*ref|order\s*(?:id|no)|no\.?\s*(?:order|pesanan|transaksi))\b\.?\s*[:#]?\s*[A-Z0-9][A-Z0-9-]{5,}\s*$/i.test(raw)) return true;
  if (/(?:\+62|\(\+62\)|\b62|\b0)\s*-?\s*8\d{1,3}[-\s]?\d{3,4}[-\s]?\d{3,5}\b|\b0\d{2,3}[-\s]?\d{6,8}\b/.test(raw) && !money) return true;
  if (/^\s*\d{1,3}\s*(?:items?|pcs|qty|barang)\s*$/i.test(raw)) return true;
  if (/^\s*(?:item\(?s?\)?|items?|qty\(?s?\)?|total\s*(?:item|qty|pcs)\(?s?\)?)\s*:\s*\d{1,3}\b(?:\s+(?:item\(?s?\)?|qty\(?s?\)?)\s*:\s*\d{1,3})?\s*$/i.test(raw)) return true;
  if (!money && /\b\d{5}\b/.test(raw) && /(?:jakarta|bandung|surabaya|depok|bekasi|tangerang|bogor|selatan|utara|barat|timur|pusat|kota|kab|jawa|jl\.?|jalan|kec\.?|kel\.?|indonesia)/i.test(raw)) return true;
  if (!money && /^\s*(?:jl|jln|jalan|gedung|gd|ruko|komplek|kompleks|perum|kel|kec|kab|kota)\b\.?/i.test(raw)) return true;
  return false;
}
const BRANCHISH = /\b(mall|plaza|square|town|city|center|centre|store|outlet|cabang|branch|station|stasiun|terminal|bandara|airport|tower|park|residence|junction|walk|point)\b/i;
const DISCOUNT_WORDS = /^(item|d[i1l]sk[o0]n|disc|discount|dsc|potongan|promo|hemat|rabat|off)$/i;
/** Discount words that say nothing about which item ("Member Discount"): the place decides (see below). */
const GENERIC_DISCOUNT_WORDS = /^(member|members|anggota|special|spesial|produk|harga|price|markdown)$/i;
type LineKind = 'item' | 'modifier' | 'charge' | 'subtotal' | 'total' | 'paid' | 'change' | 'meta' | 'other';

/** Items, charges, totals and payment from receipt text, for the user to check. */
export function readReceiptText(text: string): ReceiptRead {
  // An order screen (Shopee, Tokopedia…) is also read as a page of blocks. That reading is used when the evidence
  // favours it: it adds up and the line-by-line reading does not, or the line-by-line reading took an address, a phone
  // number or a help button for an item.
  const paper = readPaperText(text), order = readOrderScreen(text);
  if (!order) return paper;
  const { doc, ...read } = order;
  const quarantined = new Set(doc.lines.filter(l => ['address', 'recipient', 'phone', 'ui_navigation', 'promo', 'status_bar', 'payment_method'].includes(l.role)).map(l => l.text.toLowerCase()));
  const phantom = paper.items.some(item => [...quarantined].some(q => q.includes(item.name.toLowerCase().slice(0, 12))));
  const orderFits = read.items.length > 0 && checkReceipt(read).matches, paperFits = paper.items.length > 0 && checkReceipt(paper).matches;
  return orderFits && (!paperFits || phantom) ? read : paper;
}
function readPaperText(text: string): ReceiptRead {
  const out: ReceiptRead = { merchant: '', date: '', time: '', items: [], subtotal: 0, tax: 0, service: 0, discount: 0, delivery: 0, rounding: 0, total: 0, paid: 0, change: 0, payment: '', skipped: 0, totals: [], fee: 0, charges: [], cashback: 0, sources: {} };
  const source = pairColumnLines(cleanLines(text).slice(0, 300));
  const lines = source.map(line => line.text), origin = (position: number) => source[position]?.origin || [];
  const type = detectReceiptType(lines.join('\n'));
  out.receiptType = type;
  const quantityLine = (line: string | undefined) => Boolean(line && /^\d{1,3}\s*[x×@]/i.test(line));
  const kinds: LineKind[] = lines.map(() => 'other');
  const totals: { value: number; strength: number; position: number }[] = [];
  let pendingName = '', pendingPos = -1, summary = false, sawHemat = false, unplaced = 0, gaps = 0, lastItem: ReceiptLine | null = null, lastItemPos = -1;
  let paidPos = -1, changePos = -1, subtotalPos = -1;
  const header: { text: string; position: number }[] = [];
  let pendingCode = '';
  // "Member Discount" right under an item: that item's discount only if another item follows (it sits inside the item
  // list); as the last line before the summary it is the bill's discount.
  const laterDecided: { item: ReceiptLine; value: number; position: number; label: string }[] = [];
  const alts = new Map<ReceiptLine, number>();
  const sources = out.sources!, add = (field: SourceField, position: number) => { sources[field] = [...(sources[field] || []), ...origin(position)]; };
  const dates: { date: string; time: string; position: number; score: number }[] = [], times: { time: string; position: number }[] = [];
  const fuelDetail = type === 'fuel' ? /\b(harga\s*\/?\s*(l|liter|ltr)|\/\s*(l|liter|ltr)\b|volume|liter|ltr|pompa|pulau|nozzle|shift|spbu)\b/i : null;
  const nearItem = (position: number) => Boolean(lastItem && !summary && (lastItemPos === position - 1 || kinds[position - 1] === 'modifier'));
  lines.forEach((line, position) => {
    const date = readReceiptDate(line), time = timeOf(line);
    if (date || (time && /\b(jam|time|waktu|pukul|tgl|tanggal|date)\b/i.test(line))) {
      kinds[position] = 'meta';
      if (date) dates.push({ date, time, position, score: (/\b(tgl|tanggal|date|tanggal transaksi|waktu)\b/i.test(line) ? 3 : 0) + (time ? 2 : 0) + (position < Math.max(8, lines.length * .4) ? 1 : 0) - (NOT_PURCHASE.test(line) ? 20 : 0) });
      else times.push({ time, position });
      const rest = line.replace(DATE_TEXT, '').replace(new RegExp(TIME.source, 'g'), '');
      if ((readAmount(rest)?.value || 0) < 100) return;
    } else if (time && !readAmount(line.replace(TIMES, ' '))) { times.push({ time, position }); kinds[position] = 'meta'; return; }
    // Fuel: the litre and price-per-litre lines are details of the one purchase, not items.
    if (fuelDetail?.test(line)) { kinds[position] = 'meta'; pendingName = ''; return; }
    // V3 quarantine: an address, a postcode, a phone number, a tax number or a count line is never money of the
    // purchase ("Jakarta Selatan - 12930" is not a discount of 12.930; "Item(s) : 2" is not an item).
    if (notTransaction(line, (source[position]?.raw || line))) { kinds[position] = 'meta'; if (!lastItem) pendingName = ''; return; }
    // A product code under a pending name ("DB024 - 12/60", "SKU-88/XL") is that item's variant, kept as printed.
    const printed = (source[position]?.raw || line).trim();
    if (pendingName && position === pendingPos + 1 && !pendingCode && printed.length <= 28 && /\d/.test(printed) && /^[A-Z0-9][A-Z0-9 ./\-]*$/i.test(printed) && /[\-/]/.test(printed) && !/rp|\d{1,3}[.,]\d{3}\b/i.test(printed) && (printed.match(/[a-z]/gi) || []).length <= 6 && !quantityLine(line)) { pendingCode = printed; pendingPos = position; kinds[position] = 'item'; return; }
    const amount = readAmount(line);
    if (!amount) {
      // A name alone: its quantity and price may be on the next line ("ES TEH" / "2 x 6.000 12.000").
      // A name may carry sizes and codes ("AUTO FOLD UMBRELLA 535MM*8K Y201#", "MIRROR 12*3*14.7CM"): enough letters and
      // no amount written like money still make it a name.
      const lettersCount = (line.match(/[a-z]/gi) || []).length;
      if (/[a-z]{2,}/i.test(line) && (!/\d{3,}/.test(line.replace(/[\s.,]/g, '')) || lettersCount >= 8 && /[a-z]{4,}/i.test(line) && !/\d{1,3}[.,]\d{3}\b|\brp\b/i.test(line) && !/^\s*\d{5,}/.test(line))) {
        // The header (before any item, and before the date unless nothing is found yet): candidates for the shop, its
        // company and its outlet, scored after the whole receipt is read.
        // Not when a price row follows (right under it, or under a product code): then it is the first item's name, even
        // with the date only at the bottom of the receipt.
        const priceRow = (l?: string) => { const a = l && !readReceiptDate(l) && !timeOf(l) ? readAmount(l) : null; return Boolean(l && a && a.value >= 100 && !keyOf(l.slice(0, a.start)) && !notTransaction(l, l) && !/[a-z]{3,}/i.test(l.slice(0, a.start).replace(/\b(?:rp|pcs|x)\b/gi, ''))); };
        const codeLine = (l?: string) => Boolean(l && l.length <= 28 && /\d/.test(l) && /^[A-Z0-9][A-Z0-9 ./\-]*$/i.test(l.trim()) && /[\-/]/.test(l) && !/\d{1,3}[.,]\d{3}\b|\brp\b/i.test(l) && (l.match(/[a-z]/gi) || []).length <= 6);
        const itemAhead = priceRow(lines[position + 1]) || codeLine(source[position + 1]?.raw || lines[position + 1]) && priceRow(lines[position + 2]);
        const headerLike = (line.match(/[a-z]/gi) || []).length >= 3 && !quantityLine(lines[position + 1]) && !keyOf(line) && !itemAhead && !/^[a-z][a-z .]{1,20}\s*:\s*\S/i.test(line);
        if (!out.items.length && !lastItem && position < 7 && headerLike && (!dates.length || (!header.length && looksLikeName(line))) && !/^(selamat|welcome|struk|receipt|nota|invoice|bukti|terima kasih|thank)/i.test(line)) { header.push({ text: line.slice(0, 60), position }); kinds[position] = 'meta'; return; }
        // The rest of an item's name printed under its price row ("5 x 65 ml", "Original 500 ml"): a size or volume.
        if (nearItem(position) && line.length <= 32 && /\b\d+(?:[.,]\d+)?\s*(?:ml|l|ltr|liter|gr|g|gram|kg|pcs|pack|sachet|cm|mm|oz)\b/i.test(line) && !keyOf(line)) {
          lastItem!.name = `${lastItem!.name} ${line.trim()}`.slice(0, 80); lastItem!.lines?.push(...origin(position)); kinds[position] = 'item'; lastItemPos = position; pendingName = ''; return;
        }
        // A note under an item ("NO ICE", "1 hangat 2 ice") belongs to that item.
        // Not when the next line is a price row without a name of its own: then this line is that row's name ("ES TEH" / "2 x 5.000 10.000").
        const nextRow = lines[position + 1] ? readAmount(lines[position + 1]) : null, nextNamed = nextRow ? /[a-z]{3,}/i.test(lines[position + 1].slice(0, nextRow.start).replace(/\d+\s*[x×@*]+\s*|\b[x×]+\b/gi, ' ')) : true;
        if (nearItem(position) && line.length <= 32 && modifierScore(line) >= 3 && (!nextRow || nextNamed)) { (lastItem!.modifiers ||= []).push(line.replace(/^[+>~*]\s*/, '')); lastItem!.lines?.push(...origin(position)); kinds[position] = 'modifier'; pendingName = ''; return; }
        if (summary || keyOf(line)) pendingName = '';
        else { pendingName = line.slice(0, 60); pendingPos = position; pendingCode = ''; }
      } else {
        // A product code under a name ("DB024 - 12/60") is that item's variant, not a new line of text.
        if (pendingName && /[a-z]/i.test(line) && /\d/.test(line) && line.length <= 28 && position === pendingPos + 1) { pendingCode = line.trim(); pendingPos = position; kinds[position] = 'item'; }
        else out.skipped++;
      }
      return;
    }
    const label = line.slice(0, amount.start).replace(/[:=]\s*$/, '').trim();
    let key = keyOf(label);
    // A label that is only a payment method ("DEBIT", "Mandiri", "QRIS ESB - WMAJ1790…") is how it was paid, never an item.
    if (key !== 'total' && key !== 'subtotal' && key !== 'change' && paymentOnly(label)) key = 'paid';
    if (key === 'paid' && !summary && !PAID_STRONG.test(label) && !lettersOf(label).split(' ').some(w => ['tunai', 'bayar', 'cash'].some(k => w.length >= 4 && editDistance(w, k) <= 1))) key = undefined;
    // "Total Item 1   9,600": the count of items and, at the end of the row, the amount to pay.
    if (key === 'ignore' && /^\s*t[o0]ta[l1i]\s*(?:item|items|qty|barang)\b/i.test(label) && amount.value >= 100) key = 'total';
    if (key === 'ignore') { pendingName = ''; return; }
    // A discount printed right under an item ("DISC MINYAK -5.000", "DISKON 20% -90.000") is that item's discount.
    if (nearItem(position) && (key === 'discount' || (!key && amount.value < 0))) {
      const value = Math.abs(amount.value), item = lastItem!;
      const words = lettersOf(label).split(' ').filter(w => w.length >= 3 && !DISCOUNT_WORDS.test(w)), itemWords = lettersOf(item.name).split(' ').filter(w => w.length >= 3);
      if (value >= 100 && value < netOf(item) && words.length && words.every(w => GENERIC_DISCOUNT_WORDS.test(w))) { laterDecided.push({ item, value, position, label }); kinds[position] = 'charge'; pendingName = ''; return; }
      if (value >= 100 && value < netOf(item) && (!words.length || words.some(w => itemWords.some(x => x.startsWith(w) || w.startsWith(x))))) {
        item.discount = (item.discount || 0) + value; item.lines?.push(...origin(position)); kinds[position] = 'item'; pendingName = ''; return;
      }
    }
    if (key) {
      const value = Math.abs(amount.value);
      pendingName = '';
      if (key !== 'rounding' && key !== 'change' && value < 100) return;
      if (['subtotal', 'total', 'paid', 'change'].includes(key)) summary = true;
      kinds[position] = key === 'subtotal' || key === 'total' || key === 'paid' || key === 'change' ? key : 'charge';
      const pct = label.match(/(\d{1,2}(?:[.,]\d)?)\s*%/), rate = pct ? Number(pct[1].replace(',', '.')) : undefined;
      const charge = (amountValue: number) => out.charges!.push({ type: chargeType(key!, label), key: key as ChargeKey | 'cashback', label: label.slice(0, 40), amount: amountValue, ...(rate !== undefined ? { rate } : {}), line: origin(position)[0] ?? position });
      if (key === 'rounding') { out.rounding += amount.value; add('rounding', position); charge(amount.value); }
      else if (key === 'total') totals.push({ value, strength: totalStrength(label), position });
      else if (key === 'paid') { if (!out.paid) { out.paid = value; paidPos = position; add('paid', position); } }
      else if (key === 'change') { out.change = value; changePos = position; sources.change = origin(position); }
      else if (key === 'subtotal') { out.subtotal = value; subtotalPos = position; sources.subtotal = origin(position); }
      else if (key === 'cashback') { out.cashback = (out.cashback || 0) + value; add('cashback', position); charge(value); }
      else if (key === 'discount') { const hemat = /hemat/i.test(label); if (!(hemat && out.discount && !sawHemat)) { out.discount += value; add('discount', position); charge(value); } sawHemat ||= hemat; if (rate !== undefined) (out.rates ||= {}).discount = rate; }
      else { out[key] = (out[key] || 0) + value; add(key, position); charge(value); if (rate !== undefined && (key === 'tax' || key === 'service')) (out.rates ||= {})[key] = rate; }
      return;
    }
    // After the summary starts, a price is never an item (card numbers, approval codes, "Anda hemat"…).
    if (summary) { out.skipped++; unplaced++; pendingName = ''; return; }
    if (amount.value < 0) { out.discount += -amount.value; add('discount', position); out.charges!.push({ type: 'discount', key: 'discount', label: label.slice(0, 40), amount: -amount.value, line: origin(position)[0] ?? position }); kinds[position] = 'charge'; pendingName = ''; return; }
    if (amount.value < 100 || out.items.length >= 150) { out.skipped++; return; }
    const read = readItem(label, amount.value);
    // Punctuation alone ("—", "•") is not a name; then the name is on the line above.
    const own = /[a-z]{2,}/i.test(read.name) ? read.name : '';
    // Hard item boundary: a priceless line right under an item, followed by a row with its own name and price, is not
    // the start of that next name unless it clearly reads like one; it is a note about the item above.
    const underItem = Boolean(own && pendingName && pendingPos === position - 1 && lastItem && lastItemPos === pendingPos - 1 && !summary);
    if (underItem && pendingName.length <= 32 && modifierScore(pendingName) >= 2) {
      (lastItem!.modifiers ||= []).push(pendingName); (lastItem!.modifiersUnsure ||= []).push(pendingName); lastItem!.lines?.push(...origin(pendingPos)); kinds[pendingPos] = 'modifier'; pendingName = '';
    }
    const joinAbove = Boolean(own && pendingName && pendingPos === position - 1 && /[a-z]{3,}/i.test(pendingName) && !HEADERISH.test(pendingName) && !MODIFIER.test(pendingName) && !quantityLine(pendingName));
    const usedAbove = Boolean(pendingName) && (!own || joinAbove);
    const addOn = Boolean(lastItem && lastItemPos >= position - 3 && ADD_ON.test(own || label));
    let name = (joinAbove ? `${pendingName} ${own}` : own || pendingName).replace(/^\d{4,}\s+/, '').replace(/^[-+*•.\s\d]*\s(?=[a-z])|^[-+*•.\s]+|[-*•.:\s]+$/gi, '').slice(0, 60);
    if (!/[a-z]{2,}/i.test(name)) { out.skipped++; if (amount.value >= 1000) gaps++; pendingName = ''; return; }
    const tokens = name.split(' ');
    if (tokens.filter(t => /^[A-Z0-9]{2,}$/.test(t)).length >= 2) while (tokens.length > 2 && !/^[A-Z0-9&]{2,}$/.test(tokens[0]) && tokens[0].length <= 5) tokens.shift();
    name = tokens.join(' ');
    const item: ReceiptLine = { name, qty: read.qty, price: read.price, total: read.qty * read.price, unitPrinted: read.unitPrinted, lines: [...(usedAbove ? origin(pendingPos) : []), ...origin(position)] };
    if (addOn) item.addOnOf = lastItem!.name;
    if (usedAbove) kinds[pendingPos] = 'item';
    if (usedAbove && pendingCode) {
      item.variant = pendingCode; item.lines = [...origin(pendingPos - 1), ...(item.lines || [])];
      if (/[0-9][OIlS]|[OIlS][0-9]/.test(pendingCode)) item.variantUnsure = true;
    }
    const sku = label.match(/^\s*(\d{6,14})\b/)?.[1];
    if (sku && !own) item.sku = sku;
    pendingName = ''; pendingCode = '';
    out.items.push(item); kinds[position] = 'item';
    if (!addOn) lastItem = item;
    lastItemPos = position;
    if (read.alt && read.alt !== read.qty * read.price) alts.set(item, read.alt);
  });
  // "Total Diskon -4,000" that only sums the discounts already printed under the items is not a second discount.
  const itemDiscounts = out.items.reduce((n, i) => n + (i.discount || 0), 0);
  if (itemDiscounts) {
    const summed = out.charges!.filter(c => c.key === 'discount' && /^\s*(?:total|jumlah)\s*(?:d[i1l]sk[o0]n|disc(?:ount)?|potongan|hemat|promo)/i.test(c.label) && c.amount === itemDiscounts);
    for (const c of summed) { out.discount -= c.amount; out.charges!.splice(out.charges!.indexOf(c), 1); }
  }
  for (const d of laterDecided) {
    if (kinds.some((kind, i) => i > d.position && kind === 'item')) { d.item.discount = (d.item.discount || 0) + d.value; d.item.lines?.push(...origin(d.position)); kinds[d.position] = 'item'; }
    else { out.discount += d.value; add('discount', d.position); out.charges!.push({ type: chargeType('discount', d.label), key: 'discount', label: d.label.slice(0, 40), amount: d.value, line: origin(d.position)[0] ?? d.position }); }
  }
  // The purchase date: key words, a time on the same line and a place near the top count; expiry dates never win.
  const when = dates.filter(d => d.score > -10).sort((a, b) => b.score - a.score || a.position - b.position)[0];
  if (when) {
    out.date = when.date; sources.date = origin(when.position);
    const near = when.time ? null : times.sort((a, b) => Math.abs(a.position - when.position) - Math.abs(b.position - when.position))[0];
    out.time = when.time || near?.time || ''; if (out.time) sources.time = origin(near ? near.position : when.position);
  } else if (times.length) { out.time = times[0].time; sources.time = origin(times[0].position); }
  // The total to pay: the strongest total line; when several are equally strong, the last one. A "total" far below
  // the subtotal or the items (the reader lost its first digits: "5.00" for "85.800") is not a total.
  const itemSum = itemsNet(out.items), floor = Math.max(out.subtotal, itemSum) * .3;
  for (let i = totals.length - 1; i >= 0; i--) if (floor && totals[i].value < floor) { totals.splice(i, 1); out.skipped++; }
  totals.sort((a, b) => b.strength - a.strength || b.position - a.position);
  if (!out.subtotal && totals.length > 1) { const sub = totals.find(t => t !== totals[0] && t.value === itemSum && t.value !== totals[0].value); if (sub) { out.subtotal = sub.value; subtotalPos = sub.position; sources.subtotal = origin(sub.position); kinds[sub.position] = 'subtotal'; totals.splice(totals.indexOf(sub), 1); } }
  out.totals = [...new Set(totals.map(t => t.value))];
  out.total = out.totals[0] || 0;
  if (totals[0]) sources.total = origin(totals[0].position);
  // A total the OCR mangled beyond recognition can still end up as the last "item": drop items that are exactly a total
  // or larger than it.
  const money = new Set([out.total, out.subtotal, out.paid, ...out.totals].filter(Boolean));
  while (out.items.length > 1 && money.has(out.items[out.items.length - 1].total) && out.items.slice(0, -1).reduce((n, i) => n + i.total, 0) > 0) { out.items.pop(); out.skipped++; }
  if (out.total) { const before = out.items.length; out.items = out.items.filter(item => netOf(item) <= out.total * 1.02); out.skipped += before - out.items.length; }
  // Shop name from the header candidates: the brand, not the company (PT/CV), an address, a payment brand or the outlet.
  if (header.length) {
    const roles = header.map((h, index) => {
      const text = h.text.trim();
      const role = LEGAL.test(text) ? 'legal' : ADDRESSISH.test(text) ? 'address' : PAYMENT_BRANDS.test(text) ? 'payment' : index > 0 && BRANCHISH.test(text) ? 'branch' : 'name';
      return { ...h, text, role };
    });
    // A clear name first; then a short brand with dots ("MR D.I.Y."); never a line that starts with stray digits.
    const brandLike = (text: string) => { const letters = (text.match(/[a-z]/gi) || []).length, visible = text.replace(/\s/g, '').length; return letters >= 3 && letters / visible >= .55 && !/^\d+\s/.test(text); };
    const names = roles.filter(r => r.role === 'name');
    const brand = names.find(r => looksLikeName(r.text)) || names.find(r => brandLike(r.text)) || roles.find(r => r.role === 'legal');
    if (brand) { out.merchant = brand.text; out.merchantRaw = brand.text; add('merchant', brand.position); }
    const legal = roles.find(r => r.role === 'legal' && r !== brand);
    if (legal) out.legalEntity = legal.text;
    const branch = roles.find(r => r !== brand && (r.role === 'branch' || (r.role === 'name' && brand && r.position > brand.position && (legal ? r.position > legal.position : true))));
    if (branch) out.branch = branch.text.replace(/^\s*\(\s*|\s*\)\s*$/g, "");
  }
    if (out.merchant) { const t = out.merchant.split(' '); if (t.length > 2 && t[0].length === 1) t.shift(); if (t.length > 2 && t[t.length - 1].length <= 2 && /[a-z]/.test(t[t.length - 1])) t.pop(); out.merchant = t.join(' '); }
  out.itemGaps = gaps;
  repairItems(out, alts, unplaced > 0 || gaps > 0);
  repairCharges(out);
  const shop = knownShop(lines);
  if (shop) { out.merchantRaw ||= out.merchant; out.merchant = shop; }

  // Zones: header, items, summary, payment, footer.
  const span = (test: (kind: LineKind) => boolean) => { let first = -1, last = -1; kinds.forEach((kind, i) => { if (test(kind)) { if (first < 0) first = i; last = i; } }); return [first, last]; };
  const [firstItem, lastItemLine] = span(kind => kind === 'item' || kind === 'modifier');
  const [firstSummary, lastSummary] = span(kind => kind === 'subtotal' || kind === 'total' || kind === 'charge');
  const [firstPay, lastPay] = span(kind => kind === 'paid' || kind === 'change');
  const starts = [firstItem, firstSummary, firstPay].filter(v => v >= 0), start = starts.length ? Math.min(...starts) : lines.length, end = Math.max(lastItemLine, lastSummary, lastPay);
  const zoneOf = (p: number): ReceiptZone => p < start ? 'header' : p > end ? 'footer' : kinds[p] === 'paid' || kinds[p] === 'change' || (firstPay >= 0 && p >= firstPay && p > lastSummary) ? 'payment' : firstItem >= 0 && p >= firstItem && p <= lastItemLine && kinds[p] !== 'subtotal' && kinds[p] !== 'total' ? 'items' : 'summary';
  out.layout = lines.map((text, p) => ({ line: origin(p)[0] ?? p, zone: zoneOf(p), text }));

  // The payment method: from the payment part (a "PROMO GOPAY" in the footer or next to a discount is not a payment).
  let method: { value: PaymentMethod; score: number; position: number } | null = null;
  lines.forEach((line, p) => {
    const hit = PAYMENTS.find(([, pattern]) => pattern.test(line)); if (!hit) return;
    const zone = zoneOf(p), value = readAmount(line)?.value || 0;
    let score = (kinds[p] === 'paid' ? 3 : 0) + (zone === 'payment' ? 2 : zone === 'summary' ? 1 : zone === 'footer' ? -1 : zone === 'header' ? -2 : -3);
    if (value && (value === out.total || value === out.paid)) score += 2;
    if (/\b(bayar|dibayar|pembayaran|payment|metode|method|via|dengan|paid)\b/i.test(line)) score += 2;
    // The method's name alone on a line ("OVO", "QRIS", "Visa ****1234").
    if (line.replace(/[\d.,*#:x\s-]+/gi, ' ').trim().split(/\s+/).length <= 3) score += 2;
    if (/\b(promo|cashback|diskon|discount|voucher|hemat|dapatkan|gunakan|berlaku|poin|points?|download|follow|kunjungi|syarat)\b/i.test(line)) score -= 5;
    if (!method || score > method.score) method = { value: hit[0], score, position: p };
  });
  const chosen = method as { value: PaymentMethod; score: number; position: number } | null;
  if (chosen && chosen.score > 0) { out.payment = chosen.value; sources.payment = origin(chosen.position); }
  // Change is only given on a cash payment.
  else if (out.change > 0 || lines.some(line => /^[a-z ]{4,20}$/i.test(line.trim()) && keyOf(line.trim()) === 'change')) { out.payment = 'cash'; if (changePos >= 0) sources.payment = origin(changePos); }

  out.identifiers = readIdentifiers(lines);
  if (type === 'fuel') {
    const fuel = readFuel(lines, out.total);
    if (fuel) {
      out.fuel = fuel;
      const amount = out.total || (fuel.matches ? Math.round(fuel.liters * fuel.pricePerLiter) : 0);
      if (amount) out.items = [{ name: fuel.product || 'BBM', qty: 1, price: amount, total: amount, unitPrinted: true, lines: sources.total || [] }];
    }
    if (!out.merchant && out.identifiers.station) out.merchant = `SPBU ${out.identifiers.station}`;
  }
  if (type === 'parking') { const parking = readParking(lines); if (parking) out.parking = parking; }
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
function repairItems(read: ReceiptRead, alts: Map<ReceiptLine, number>, unexplained = false) {
  const items = read.items, sum = itemsNet(items);
  if (!items.length || items.length > 40) return;
  const targets = [...new Set([read.subtotal, read.totals?.[0] || read.total, read.total ? read.total + read.discount : 0].filter(v => v > 0))];
  if (targets.some(t => t === sum)) return;
  const options = items.map(item => { const list: [number, number][] = []; const alt = alts.get(item); if (alt) list.push([alt, 1]); for (const v of lookalikes(item.total)) if (v >= 100 && v !== alt) list.push([v, 2]); return list; });
  // The lines' own quantity × unit price, for any number of lines, when that makes everything add up.
  const withAlt = items.map((item, i) => [i, alts.get(item) || 0] as [number, number]).filter(([, alt]) => alt).slice(0, 12);
  for (const target of targets) {
    const fits: number[] = [];
    for (let mask = 1; mask < 1 << withAlt.length; mask++) { let total = sum; withAlt.forEach(([i, alt], b) => { if (mask & (1 << b)) total += alt - items[i].total; }); if (total === target) fits.push(mask); }
    const fewest = Math.min(...fits.map(m => m.toString(2).replace(/0/g, '').length)), chosen = fits.filter(m => m.toString(2).replace(/0/g, '').length === fewest);
    // Only one way to make it add up; several would be a guess.
    if (chosen.length !== 1) continue;
    const fixes = read.fixes || [];
    withAlt.forEach(([i, alt], b) => { if (!(chosen[0] & (1 << b))) return; const item = items[i], qty = alt % item.qty === 0 ? item.qty : 1; fixes.push(`${item.name}: terbaca ${rp(item.total)}, dibetulkan jadi ${rp(alt)} (jumlah × harga satuan) agar cocok dengan ${target === read.subtotal ? 'subtotal' : 'total'}.`); items[i] = { ...item, qty, price: alt / qty, total: alt }; });
    read.fixes = fixes;
    return;
  }
  // One-digit guesses only when every amount in and under the items is understood (a missing item or an unknown charge
  // could be the difference), and never for a single item.
  if (unexplained || read.items.length < 3) return;
  for (const target of targets) {
    const need = target - sum;
    if (Math.abs(need) > target * .3) continue;
    let best: { cost: number; changes: [number, number][] }[] = [];
    const consider = (cost: number, changes: [number, number][]) => { if (!best.length || cost < best[0].cost) best = [{ cost, changes }]; else if (cost === best[0].cost) best.push({ cost, changes }); };
    options.forEach((list, i) => list.forEach(([v, c]) => { if (v - items[i].total === need) consider(c, [[i, v]]); }));
    if (!best.length || best[0].cost > 1) for (let i = 0; i < items.length; i++) for (const [v1, c1] of options[i]) { const rest = need - (v1 - items[i].total); for (let j = i + 1; j < items.length; j++) for (const [v2, c2] of options[j]) if (v2 - items[j].total === rest) consider(c1 + c2 + 1, [[i, v1], [j, v2]]); }
    if (best.length !== 1 || (best[0].changes.length > 1 && read.items.length < 4)) continue;
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
  if (!target) return;
  if (!rates) { repairChargeDigit(read); return; }
  const itemsTotal = itemsNet(read.items), gross = read.subtotal || itemsTotal, base = gross - read.discount;
  if (!gross || solve(read, itemsTotal).best) return;
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

/**
 * One charge with one misread digit ("3.008" for "3.000"): each charge's look-alikes are tried, and a change is kept
 * only when exactly one of them makes the whole receipt add up exactly.
 */
function repairChargeDigit(read: ReceiptRead) {
  const itemsTotal = itemsNet(read.items);
  const current = solve(read, itemsTotal).best;
  if (!(read.subtotal || itemsTotal) || (current && current.value === current.target)) return;
  const keys = (['tax', 'service', 'delivery', 'fee', 'discount'] as const).filter(k => (read[k] || 0) >= 100);
  const fits: [typeof keys[number], number][] = [];
  for (const key of keys) for (const value of lookalikes(read[key] || 0)) {
    if (value < 100) continue;
    const trial = { ...read, [key]: value };
    const best = solve(trial, itemsTotal).best;
    if (best && best.left.length === 0 && best.value === best.target) fits.push([key, value]);
  }
  if (fits.length !== 1) return;
  const [key, value] = fits[0];
  (read.fixes ||= []).push(`${CHARGE_LABELS[key][0].toUpperCase()}${CHARGE_LABELS[key].slice(1)} terbaca ${rp(read[key] || 0)}, dibetulkan jadi ${rp(value)} agar cocok dengan total.`);
  read[key] = value;
  const charge = read.charges?.find(c => c.key === key); if (charge) charge.amount = value;
}

/* ------------------------------------------------------------------ Which total to trust */

export type ReceiptCheck = { total: number; itemsTotal: number; computed: number; source: 'printed' | 'computed' | 'paid' | 'items' | 'none'; confidence: 'tinggi' | 'sedang' | 'rendah'; matches: boolean; notes: string[]; /** Charges printed but already inside the prices (or only information), so not added again. */ included: ChargeKey[] };
export type ChargeKey = 'discount' | 'tax' | 'service' | 'delivery' | 'fee' | 'rounding';
const near = (a: number, b: number) => a > 0 && b > 0 && Math.abs(a - b) <= Math.max(100, Math.round(b * .002));
const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const CHARGE_LABELS: Record<string, string> = { tax: 'pajak', service: 'service', delivery: 'ongkir', fee: 'biaya lain', discount: 'diskon', rounding: 'pembulatan' };
/**
 * Every printed total and paid − change against items (or subtotal) plus every combination of the charges. A combination
 * that leaves a charge out explains it: PPN already inside the prices, a "hemat" line that was only information.
 */
function solve(read: ReceiptRead, itemsTotal: number) {
  const charges = ([['tax', read.tax], ['service', read.service], ['delivery', read.delivery], ['fee', read.fee || 0], ['discount', -read.discount], ['rounding', read.rounding]] as [string, number][]).filter(([, value]) => value);
  const bases = [...new Set([read.subtotal, itemsTotal].filter(v => v > 0))];
  const byPayment = read.paid && read.change && read.paid > read.change ? read.paid - read.change : read.paid && !read.change && !read.total ? read.paid : 0;
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
  const itemsTotal = itemsNet(read.items);
  const { best, byPayment, all } = solve(read, itemsTotal);
  const notes: string[] = [...(read.fixes || [])];
  let total = 0, source: ReceiptCheck['source'] = 'none', computed = all;
  if (best) {
    total = best.target; computed = best.value;
    source = read.total && (read.totals || [read.total]).includes(best.target) ? 'printed' : 'paid';
    notes.push(best.left.length ? `Item dan biaya cocok dengan totalnya (${best.left.map(k => CHARGE_LABELS[k]).join(', ')} sudah termasuk atau hanya info).` : 'Item, pajak, dan service cocok dengan totalnya.');
    if (best.target !== read.total && read.total) notes.push(`Dipakai ${rp(best.target)} karena cocok dengan isi struk; total lain yang terbaca ${rp(read.total)}.`);
  } else if (read.total) { total = read.total; source = 'printed'; }
  else if (byPayment) { total = byPayment; source = 'paid'; notes.push(read.change ? `Total dihitung dari bayar ${rp(read.paid)} dikurangi kembalian ${rp(read.change)}.` : `Total diambil dari jumlah yang dibayar (${rp(read.paid)}).`); }
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
  return { total, itemsTotal, computed, source, confidence, matches, notes, included: (best?.left || []) as ChargeKey[] };
}
/** How good a reading is, to pick the best of several OCR passes. */
export function receiptScore(read: ReceiptRead) {
  const check = checkReceipt(read);
  const itemsGiveSubtotal = read.subtotal > 0 && read.items.length > 0 && Math.abs(itemsNet(read.items) - read.subtotal) <= 1;
  return read.items.length * 2 + (read.total ? 4 : 0) + (check.matches ? 10 : 0) + (itemsGiveSubtotal ? 3 : 0) + (check.confidence === 'tinggi' ? 3 : 0) + (read.subtotal ? 1 : 0) + (read.date ? 1 : 0) + (read.merchant ? 1 : 0) - read.skipped * .3;
}

/**
 * Items as Split Bill takes them (quantity × unit price), with each item's own discount already taken off. When the
 * net amount does not divide by the quantity, the line becomes one line of the whole amount ("2× Burger").
 */
export function netItems(items: ReceiptLine[]): ReceiptLine[] {
  return items.map(item => {
    const net = netOf(item);
    if (!item.discount) return item;
    return net % item.qty === 0 ? { ...item, price: net / item.qty, total: net, discount: 0 } : { ...item, name: `${item.qty}× ${item.name}`, qty: 1, price: net, total: net, discount: 0 };
  });
}

/* ------------------------------------------------------------------ Charges in the expense */

export const CHARGE_NAMES: Record<ChargeKey, string> = { discount: 'Diskon / potongan', tax: 'Pajak / PB1 / PPN', service: 'Service', delivery: 'Ongkir', fee: 'Biaya lain (admin, kemasan, tip)', rounding: 'Pembulatan' };
export const CHARGE_ORDER: ChargeKey[] = ['discount', 'tax', 'service', 'delivery', 'fee', 'rounding'];
/** Charges that can be recorded under their own category. Discounts and rounding always stay with the purchase. */
export const SEPARABLE: ChargeKey[] = ['tax', 'service', 'delivery', 'fee'];
type CatRef = { categoryId: string; subcategoryId: string | null };
/**
 * Where a charge goes when recorded separately: tax to "Biaya Keuangan › Pajak", other fees to its "Biaya Lainnya"
 * or "Admin", delivery to a "Delivery / Ongkir" subcategory next to the purchase; the purchase's own category otherwise.
 * Only the person's own categories are used.
 */
export function chargeCategory(key: ChargeKey, categories: Pick<Category, 'id' | 'name' | 'type' | 'parentId' | 'isArchived'>[], purchase: CatRef): CatRef {
  const own = categories.filter(c => !c.isArchived && c.type === 'expense');
  const finance = own.find(c => !c.parentId && /biaya keuangan|keuangan|biaya/i.test(c.name));
  const under = (parentId: string | undefined, pattern: RegExp) => parentId ? own.find(c => c.parentId === parentId && pattern.test(c.name)) : undefined;
  const pick = (c: typeof own[number] | undefined): CatRef | undefined => c && (c.parentId ? { categoryId: c.parentId, subcategoryId: c.id } : { categoryId: c.id, subcategoryId: null });
  const anywhere = (pattern: RegExp) => own.find(c => c.parentId && pattern.test(c.name)) || own.find(c => !c.parentId && pattern.test(c.name));
  // No fitting category of one's own: left empty so the person picks one (never quietly merged back).
  const none = { categoryId: '', subcategoryId: null };
  if (key === 'tax') return pick(under(finance?.id, /pajak/i) || anywhere(/^pajak|pajak$/i)) || none;
  if (key === 'fee') return pick(under(finance?.id, /biaya lain/i) || under(finance?.id, /admin/i) || anywhere(/biaya lain|biaya admin|admin/i)) || none;
  if (key === 'delivery') return pick(under(purchase.categoryId, /delivery|ongkir|pengiriman|pesan antar|kurir/i)) || purchase;
  return purchase;
}
/**
 * The expense's lines: charges recorded separately keep their amount and category; the rest of the amount (the
 * purchase, with discounts, rounding and any charge not separated inside it) is divided over the purchase lines by
 * their size. Lines with the same category are joined; the lines always add up to the amount exactly.
 */
export function receiptSplits(amount: number, purchase: SplitLine[], separate: SplitLine[]): SplitLine[] {
  const own = separate.filter(line => line.amount > 0);
  const rest = amount - own.reduce((n, line) => n + line.amount, 0);
  if (rest <= 0 || !purchase.length) return [];
  const parts = allocate(rest, purchase.map(line => line.amount > 0 ? line.amount : 1));
  const joined = new Map<string, SplitLine>();
  for (const line of [...purchase.map((line, i) => ({ ...line, amount: parts[i] })), ...own]) {
    const id = `${line.categoryId}:${line.subcategoryId || ''}`, current = joined.get(id);
    joined.set(id, current ? { ...current, amount: current.amount + line.amount } : { categoryId: line.categoryId, subcategoryId: line.subcategoryId || null, amount: line.amount });
  }
  return [...joined.values()].filter(line => line.amount > 0);
}
/** "Belanja Rp105.000 · Diskon −Rp5.000 · PB1 Rp10.000" for the transaction's notes. */
export function chargeSummary(base: number, charges: Partial<Record<ChargeKey, number>>, included: ChargeKey[] = []) {
  const short: Record<ChargeKey, string> = { discount: 'Diskon', tax: 'Pajak', service: 'Service', delivery: 'Ongkir', fee: 'Biaya lain', rounding: 'Pembulatan' };
  const parts = CHARGE_ORDER.filter(key => charges[key]).map(key => `${short[key]} ${key === 'discount' ? '−' : (charges[key] || 0) < 0 ? '−' : ''}${rp(Math.abs(charges[key] || 0))}${included.includes(key) ? ' (sudah termasuk)' : ''}`);
  return parts.length ? [base ? `Belanja ${rp(base)}` : '', ...parts].filter(Boolean).join(' · ') : '';
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
  const items: ReceiptItemGuess[] = read.items.map(item => { const guess = type === 'expense' ? guessFor(item.name, netOf(item), '') : null; return { ...item, categoryId: guess?.categoryId || overall?.categoryId || null, subcategoryId: guess ? guess.subcategoryId || null : overall?.subcategoryId || null }; });
  // A split by category when the items clearly belong to different categories (e.g. groceries and medicine).
  let splits: SplitLine[] = [];
  const groups = new Map<string, SplitLine>();
  for (const item of items) { if (!item.categoryId) continue; const key = `${item.categoryId}:${item.subcategoryId || ''}`; const line = groups.get(key) || { categoryId: item.categoryId, subcategoryId: item.subcategoryId, amount: 0 }; line.amount += netOf(item); groups.set(key, line); }
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
