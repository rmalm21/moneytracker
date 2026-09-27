/**
 * Reading a receipt (struk / nota) from its text: the text a phone copied from a photo, or what the on-device OCR read
 * (lib/receipt-ocr.ts). Pure functions, no storage.
 *
 *  - cleanOcrText fixes the usual OCR slips in amounts: O→0, l/I→1, S→5, "35 000" → "35000", "12.000,-" → "12.000".
 *  - readReceiptText finds the place, date and time, items (with quantity and unit price), subtotal, tax (PB1/PPN),
 *    service, discount, delivery, rounding, total, the amount paid and the change, and how it was paid (tunai, QRIS,
 *    debit, e-wallet). Lines it does not understand are skipped and counted; nothing is made up.
 *  - checkReceipt decides which total to trust by comparing the printed total, items + charges, and paid − change,
 *    and says how sure it is.
 *  - receiptToTransaction turns a receipt into a transaction to confirm: amount, date, place, wallet from the payment
 *    method, category from the place and the items (the person's own categories and habits), and a split by category
 *    when the items belong to different ones.
 */
import { allocate } from './accounting.ts';
import { suggestCategory } from './categorize.ts';
import type { Category, LedgerTx, SplitLine, Wallet } from './types';

export type ReceiptLine = { name: string; qty: number; price: number; total: number };
export type PaymentMethod = '' | 'cash' | 'qris' | 'debit' | 'credit' | 'transfer' | 'gopay' | 'ovo' | 'dana' | 'shopeepay' | 'linkaja';
export type ReceiptRead = { merchant: string; date: string; time: string; items: ReceiptLine[]; subtotal: number; tax: number; service: number; discount: number; delivery: number; rounding: number; total: number; paid: number; change: number; payment: PaymentMethod; skipped: number };
export const PAYMENT_LABELS: Record<PaymentMethod, string> = { '': '', cash: 'Tunai', qris: 'QRIS', debit: 'Kartu debit', credit: 'Kartu kredit', transfer: 'Transfer', gopay: 'GoPay', ovo: 'OVO', dana: 'DANA', shopeepay: 'ShopeePay', linkaja: 'LinkAja' };

/* ------------------------------------------------------------------ Cleaning OCR text */

const DIGITISH = /[0-9OoDQlIi|SsBZz]/;
/** Fixes letters read in place of digits inside amounts, and amounts split by spaces. */
export function cleanOcrText(text: string) {
  return text.split(/\r?\n/).map(raw => {
    let line = raw.replace(/[‐‑‒–—―]/g, '-').replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/\t/g, '  ');
    line = line.replace(/^[\s|_~`'"*•·]+|[\s|_~`'"]+$/g, '');
    // Tokens that are mostly digits: fix look-alike letters ("35.0O0", "l2.500", "S.170").
    line = line.replace(/[0-9OoDQlIi|SsBZz][0-9OoDQlIi|SsBZz.,]{2,}/g, token => {
      const digits = (token.match(/\d/g) || []).length, letters = token.replace(/[\d.,]/g, '').length;
      if (digits < 2 || letters > digits || !/[.,]\d|\d[.,]|\d{3}/.test(token.replace(/[OoDQ]/g, '0').replace(/[lIi|]/g, '1'))) return token;
      return [...token].map(ch => !DIGITISH.test(ch) || /\d/.test(ch) ? ch : /[OoDQ]/.test(ch) ? '0' : /[lIi|]/.test(ch) ? '1' : /[Ss]/.test(ch) ? '5' : /[B]/.test(ch) ? '8' : /[Zz]/.test(ch) ? '2' : ch).join('');
    });
    // "35 000", "4 700" → one number (Rupiah amounts end in 0), "12.000,-" / "12.000,00" / "12.000 IDR" → "12.000".
    line = line.replace(/(^|[\s:=@x×])(\d{1,3}) (\d{2}0)(?=\s|$|[.,]\d{3})/g, '$1$2$3').replace(/(\d)[.,]-(?=\s|$)/g, '$1').replace(/(\d)\s*(?:IDR|idr)\b/g, '$1');
    // "2 Xx 6.000", "2X6.000", "2 * 6.000" → "2 x 6.000".
    line = line.replace(/(^|\s)(\d{1,3})\s*(?:[xX×]{1,2}|\*)\s*(?=(?:rp\.?\s*)?\d)/gi, '$1$2 x ');
    return line.replace(/\s+/g, ' ').trim();
  }).filter(Boolean).join('\n');
}

/* ------------------------------------------------------------------ Reading */

const AMOUNT = /(-|−)?\s*(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?=\s*$)/i;
/** "35.000", "35,000", "Rp 35.000,00", "35000" → 35000. */
export function readAmount(text: string) {
  const match = text.match(AMOUNT);
  if (!match) return null;
  const value = Number(match[2].replace(/[.,]/g, ''));
  if (!Number.isSafeInteger(value)) return null;
  return { value: match[1] ? -value : value, start: match.index || 0 };
}
type Key = 'subtotal' | 'tax' | 'service' | 'discount' | 'delivery' | 'rounding' | 'total' | 'paid' | 'change' | 'ignore';
/** Checked in this order; OCR typos in the key words (T0TAL, SUBTOTAI, SERV1CE, PB 1) are allowed. */
const KEYS: [Key, RegExp][] = [
  ['ignore', /\b(npwp|telp|tel|phone|hp|wa|kasir|cashier|no\.?\s*(struk|nota|meja|order|trx|transaksi|invoice|ref)|order\s*#|table|meja|pax|shift|member\s*id|poin|point|saldo)\b|(#|\bno\.?|\bnomor)\s*:?\s*$/i],
  ['subtotal', /\b(sub\s*-?\s*t[o0]ta[l1i]|t[o0]ta[l1i]\s*(item|harga|pesanan|qty)|jumlah\s*item)\b/i],
  ['discount', /\b(d[i1]skon|disc(ount)?|potongan|promo|voucher|hemat|cashback|member\s*disc)\b/i],
  ['service', /\b(serv[i1l]ce(\s*charge)?|serv[i1l]s|srv|layanan|s\.?c\.?|biaya\s*layanan)\b/i],
  ['tax', /\b(pb\s*-?\s*[1il]|p\.b\.?\s*1|pajak(\s*resto(ran)?)?|ppn|tax|vat|pbjt)\b/i],
  ['delivery', /\b(ongkir|ongkos\s*kirim|delivery(\s*fee)?|pengiriman|biaya\s*antar)\b/i],
  ['rounding', /\b(pembulatan|rounding|round)\b/i],
  ['change', /\b(kembal[i1l](an)?|change|kembali\s*uang)\b/i],
  ['total', /\b(grand\s*t[o0]ta[l1i]|t[o0]ta[l1i](\s*(bayar|tagihan|belanja|harga|pembayaran|akhir))?|jumlah(\s*(bayar|tagihan))?|tagihan|amount\s*due|net\s*(amount|total)|harus\s*dibayar)\b/i],
  ['paid', /\b(tunai|cash|bayar|dibayar|pembayaran|payment|paid|tendered|debit|kredit|credit|qris|gopay|go-pay|ovo|dana|shopeepay|linkaja|edc|kartu|card|transfer)\b/i],
];
const PAYMENTS: [PaymentMethod, RegExp][] = [
  ['gopay', /\bgo\s*-?\s*pay\b/i], ['ovo', /\bovo\b/i], ['shopeepay', /\bshopee\s*pay\b/i], ['linkaja', /\blink\s*aja\b/i], ['dana', /\bdana\b(?!\s*(darurat|pensiun))/i],
  ['qris', /\bqris\b|\bqr\s*code\b/i], ['credit', /\b(kartu\s*kredit|credit\s*card|kredit|visa|master\s*card|mastercard)\b/i], ['debit', /\b(debit|debet|kartu\s*debit|edc|bca\s*card|atm)\b/i],
  ['transfer', /\b(transfer|trf|tf)\b/i], ['cash', /\b(tunai|cash)\b/i],
];
const NUMBER = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d{3,})`;
const readNumber = (text: string) => Number(text.replace(/[.,]/g, ''));
/** Name, quantity and unit price from the text before a line's total; a reading counts only when quantity × price = total. */
function readItem(label: string, total: number) {
  const tries: [RegExp, (match: RegExpMatchArray) => [number, number] | null][] = [
    [new RegExp(String.raw`(?:^|\s)(\d{1,3})\s*[x×@]\s*(?:rp\.?\s*)?${NUMBER}\s*$`, 'i'), match => [+match[1], readNumber(match[2])]],
    [new RegExp(String.raw`(?:^|\s)@\s*(?:rp\.?\s*)?${NUMBER}\s*$`, 'i'), match => { const unit = readNumber(match[1]); return unit && total % unit === 0 ? [total / unit, unit] : null; }],
    [new RegExp(String.raw`(?:^|\s)(\d{1,3})\s+(?:rp\.?\s*)?${NUMBER}\s*$`, 'i'), match => [+match[1], readNumber(match[2])]],
    [new RegExp(String.raw`(?:^|\s)(?:rp\.?\s*)?${NUMBER}\s*$`, 'i'), match => [1, readNumber(match[1])]],
  ];
  for (const [pattern, read] of tries) {
    const match = label.match(pattern), got = match && read(match);
    if (match && got && got[0] >= 1 && got[1] > 0 && got[0] * got[1] === total) return { name: label.slice(0, match.index).trim(), qty: got[0], price: got[1] };
  }
  const lead = label.match(/^(\d{1,3})\s*[x×]\s*(?=\D)/i) || label.match(/^(\d{1,3})\s+(?=[a-z])/i);
  if (lead && +lead[1] >= 1 && +lead[1] <= 99 && total % +lead[1] === 0) return { name: label.slice(lead[0].length).trim(), qty: +lead[1], price: total / +lead[1] };
  const tail = label.match(/\s[x×]\s*(\d{1,3})$/i) || label.match(/\s(\d{1,3})\s*[x×]$/i);
  if (tail && +tail[1] >= 1 && total % +tail[1] === 0) return { name: label.slice(0, tail.index).trim(), qty: +tail[1], price: total / +tail[1] };
  return { name: label, qty: 1, price: total };
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'];
const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATE_TEXT = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b|\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b|\b(\d{1,2})[\s-]+([a-z]{3})[a-z]*\.?[\s-]+(20\d{2})\b/i;
export function readReceiptDate(text: string) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const valid = (y: number, m: number, d: number) => y >= 2000 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : '';
  const match = text.match(DATE_TEXT);
  if (!match) return '';
  if (match[1]) return valid(+match[1], +match[2], +match[3]);
  if (match[4]) return valid(+match[6] < 100 ? 2000 + +match[6] : +match[6], +match[5], +match[4]);
  const key = match[8].toLowerCase(), month = Math.max(MONTHS.indexOf(key), MONTHS_EN.indexOf(key)) + 1;
  return month ? valid(+match[9], month, +match[7]) : '';
}
/** A shop name: mostly letters, at least four of them (not OCR noise like "0 ERA" or "Se"). */
const looksLikeName = (line: string) => { const letters = (line.match(/[a-z]/gi) || []).length, visible = line.replace(/\s/g, '').length; return letters >= 4 && letters / visible >= .7 && /[a-z]{3,}/i.test(line); };
const TIME = /\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:[:.][0-5]\d)?\b/;

/** Items, charges, totals and payment from receipt text, for the user to check. */
export function readReceiptText(text: string): ReceiptRead {
  const out: ReceiptRead = { merchant: '', date: '', time: '', items: [], subtotal: 0, tax: 0, service: 0, discount: 0, delivery: 0, rounding: 0, total: 0, paid: 0, change: 0, payment: '', skipped: 0 };
  const cleaned = cleanOcrText(text);
  const lines = cleaned.split('\n').slice(0, 300);
  out.payment = PAYMENTS.find(([, pattern]) => pattern.test(cleaned))?.[0] || '';
  const quantityLine = (line: string | undefined) => Boolean(line && /^\d{1,3}\s*[x×@]/i.test(line));
  let pendingName = '';
  lines.forEach((line, position) => {
    const date = out.date ? '' : readReceiptDate(line);
    const time = line.match(TIME);
    if (date || (time && /\b(jam|time|waktu|pukul|tgl|tanggal|date)\b/i.test(line))) {
      if (date) out.date = date;
      if (time && !out.time) out.time = `${time[1].padStart(2, '0')}:${time[2]}`;
      // A date line (often with the time) carries no price.
      const rest = line.replace(DATE_TEXT, '').replace(new RegExp(TIME.source, 'g'), '');
      if ((readAmount(rest)?.value || 0) < 100) return;
    }
    const amount = readAmount(line);
    if (!amount) {
      // A name alone: its quantity and price may be on the next line ("ES TEH" / "2 x 6.000 12.000").
      if (/[a-z]{2,}/i.test(line) && !/\d{3,}/.test(line.replace(/[\s.,]/g, ''))) {
        if (!out.merchant && position < 5 && looksLikeName(line) && !quantityLine(lines[position + 1]) && !KEYS.some(([, pattern]) => pattern.test(line)) && !/^(jl|jln|jalan|ruko|komplek|blok)\b/i.test(line)) { out.merchant = line.slice(0, 60); return; }
        pendingName = KEYS.some(([, pattern]) => pattern.test(line)) ? '' : line.slice(0, 60);
      } else out.skipped++;
      return;
    }
    const label = line.slice(0, amount.start).replace(/[:=]\s*$/, '').trim();
    const key = KEYS.find(([, pattern]) => pattern.test(label))?.[0];
    if (key === 'ignore') { pendingName = ''; return; }
    if (key) {
      const value = Math.abs(amount.value);
      if (key === 'rounding') out.rounding += amount.value;
      else if (key === 'total') { if (!out.total || /grand|tagihan|bayar|due|akhir|harus/i.test(label)) out.total = value; }
      else if (key === 'paid') { if (!out.paid) out.paid = value; }
      else if (key === 'change') out.change = value;
      else if (key === 'subtotal') out.subtotal = value;
      else out[key] += value;
      pendingName = '';
      return;
    }
    if (amount.value < 100 || out.items.length >= 100) { out.skipped++; return; }
    const read = readItem(label, amount.value);
    const name = (read.name || pendingName).replace(/^[-*•.\s\d]*\s(?=[a-z])|^[-*•.\s]+|[-*•.:\s]+$/gi, '').slice(0, 60);
    pendingName = '';
    if (!/[a-z]{2,}/i.test(name)) { out.skipped++; return; }
    out.items.push({ name, qty: read.qty, price: read.price, total: read.qty * read.price });
  });
  return out;
}

/* ------------------------------------------------------------------ Which total to trust */

export type ReceiptCheck = { total: number; itemsTotal: number; computed: number; source: 'printed' | 'computed' | 'paid' | 'items' | 'none'; confidence: 'tinggi' | 'sedang' | 'rendah'; matches: boolean; notes: string[] };
const near = (a: number, b: number) => a > 0 && b > 0 && Math.abs(a - b) <= Math.max(100, Math.round(b * .01));
const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
export function checkReceipt(read: ReceiptRead): ReceiptCheck {
  const itemsTotal = read.items.reduce((sum, item) => sum + item.total, 0);
  const charges = read.tax + read.service + read.delivery - read.discount + read.rounding;
  const base = read.subtotal || itemsTotal;
  const computed = base ? base + charges : 0;
  const byPayment = read.paid && read.change && read.paid > read.change ? read.paid - read.change : 0;
  const notes: string[] = [];
  let total = 0, source: ReceiptCheck['source'] = 'none';
  if (read.total) { total = read.total; source = 'printed'; }
  else if (byPayment) { total = byPayment; source = 'paid'; notes.push(`Total dihitung dari bayar ${rp(read.paid)} dikurangi kembalian ${rp(read.change)}.`); }
  else if (computed) { total = computed; source = read.subtotal || !charges ? 'items' : 'computed'; notes.push('Total tidak tertulis jelas; dihitung dari item dan biaya.'); }
  // Only an independent total (printed, or paid − change) can confirm the items.
  const matches = Boolean((source === 'printed' || source === 'paid') && computed && near(total, computed));
  if (read.total && byPayment && !near(read.total, byPayment)) notes.push(`Total tertulis ${rp(read.total)}, tetapi bayar − kembalian = ${rp(byPayment)}. Periksa lagi.`);
  if (read.total && computed && !matches) notes.push(`Item dan biaya berjumlah ${rp(computed)}, total tertulis ${rp(read.total)} (selisih ${rp(Math.abs(read.total - computed))}). Mungkin ada item yang terlewat atau salah baca.`);
  if (read.subtotal && itemsTotal && !near(read.subtotal, itemsTotal)) notes.push(`Jumlah item ${rp(itemsTotal)} belum sama dengan subtotal ${rp(read.subtotal)}.`);
  if (matches) notes.unshift('Item, pajak, dan service cocok dengan totalnya.');
  const crossChecked = matches || Boolean(source === 'printed' && byPayment && near(read.total, byPayment));
  // A printed total with nothing to compare it with, or a suspiciously small one, is not trusted.
  const lonely = source === 'printed' && !computed && !byPayment;
  const tiny = total > 0 && total < 1000;
  if (lonely && !tiny) notes.push('Tidak ada item atau subtotal untuk mencocokkan total. Pastikan nominalnya benar.');
  if (tiny) notes.push('Nominal sangat kecil; mungkin angka depannya tidak terbaca. Periksa lagi dengan struknya.');
  const confidence: ReceiptCheck['confidence'] = !total || tiny ? 'rendah' : crossChecked ? 'tinggi' : lonely ? 'rendah' : source === 'printed' || source === 'paid' ? 'sedang' : 'rendah';
  if (!total) notes.push('Total belum terbaca. Isi nominalnya sendiri.');
  return { total, itemsTotal, computed, source, confidence, matches, notes };
}
/** How good a reading is, to pick the better of two OCR passes. */
export function receiptScore(read: ReceiptRead) {
  const check = checkReceipt(read);
  return read.items.length * 2 + (read.total ? 4 : 0) + (check.matches ? 8 : 0) + (read.date ? 1 : 0) + (read.merchant ? 1 : 0) - read.skipped * .3;
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
