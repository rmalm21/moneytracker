/**
 * Catat otomatis V3.3 — the money inside one purchase.
 *
 *   "makan 100k diskon 20k jago"            → gross 100.000, discount 20.000, paid 80.000 (one expense, never an income)
 *   "makan 100k diskon 20k service 5k jago" → 100.000 − 20.000 + 5.000 = 85.000
 *   "bensin 100k cashback 10k gopay"        → paid 100.000, cashback 10.000 back now → costs 90.000
 *   "bensin 100k nanti dapet cashback 10k"  → paid 100.000; the cashback is promised, not money yet
 *   "3 kopi 18k satu" / "3 kopi @18k"       → 3 × 18.000 = 54.000;  "3 kopi 18k" stays 18.000 (total), never multiplied
 *
 * Amount roles: MAIN_AMOUNT, UNIT_PRICE, DISCOUNT, FEE, SERVICE, TAX, CASHBACK, SHIPPING, TIP. A role comes from the word
 * right before the amount. Every part stays inside the one transaction (stored as its structured receipt), so a charge
 * or a discount never becomes a second action.
 */
import { findAmounts, type Amount } from '../quick-entry.ts';
import type { ReceiptSnapshot, ReceiptSnapshotCharge } from '../types';

export type AmountRole = 'MAIN_AMOUNT' | 'UNIT_PRICE' | 'DISCOUNT' | 'FEE' | 'SERVICE' | 'TAX' | 'CASHBACK' | 'SHIPPING' | 'TIP' | 'TRANSFER_FEE' | 'REPAYMENT' | 'REMAINING_BALANCE' | 'SPLIT_SHARE';
export type CompositionPart = { role: AmountRole; type: ReceiptSnapshotCharge['type'] | 'cashback'; label: string; amount: number; sign: 1 | -1 | 0; text: string; start: number; end: number; pending?: boolean };
export type Composition = { gross: number; parts: CompositionPart[]; net: number; cashback?: number; cashbackPending?: boolean; core: string; formula: string };

const ROLE: [RegExp, AmountRole, CompositionPart['type'], string, 1 | -1 | 0][] = [
  [/(?:diskon|disc|discount|potongan|promo|hemat)/, 'DISCOUNT', 'discount', 'Diskon', -1],
  [/(?:voucher|vocer|voucer)/, 'DISCOUNT', 'voucher', 'Voucher', -1],
  [/(?:pajak|ppn|pb1|tax)/, 'TAX', 'tax', 'Pajak', 1],
  [/(?:service charge|service|servis charge|svc)/, 'SERVICE', 'service', 'Service', 1],
  [/(?:ongkir|ongkos kirim|biaya kirim|ongkos)/, 'SHIPPING', 'delivery', 'Ongkir', 1],
  [/(?:biaya admin|admin|biaya layanan|fee)/, 'FEE', 'admin_fee', 'Biaya admin', 1],
  [/(?:tip|tips)/, 'TIP', 'tip', 'Tip', 1],
  [/(?:cashback|cash back|kesbek)/, 'CASHBACK', 'cashback', 'Cashback', 0],
];
const FUTURE = /\b(nanti|ntar|akan|bakal|menyusul|pending|belum masuk|dijanjikan|dapet nanti|dapat nanti)\b/;
const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

/** Roles of the amounts of an expense text; null when there is only a main amount. */
export function readComposition(text: string): Composition | null {
  const amounts = findAmounts(text).filter(a => a.marked || a.value >= 100);
  if (amounts.length < 2) return null;
  const parts: CompositionPart[] = []; let main: Amount | undefined; let core = text;
  for (const a of amounts) {
    const before = text.slice(Math.max(0, a.index - 24), a.index).toLocaleLowerCase('id-ID');
    const hit = ROLE.find(([re]) => new RegExp(`(?:^|\\s)${re.source}(?:nya)?\\s*(?:sebesar|senilai|rp\\.?)?\\s*$`).test(before));
    if (!hit) { if (!main) { main = a; continue; } return null; }
    const [re, role, type, label, sign] = hit;
    const word = before.match(new RegExp(`${re.source}(?:nya)?\\s*(?:sebesar|senilai|rp\\.?)?\\s*$`))!;
    let start = a.index - word[0].length; const end = a.index + a.text.length;
    // "nanti dapet cashback 10k", "kena admin 2500": the small words before the role belong to it.
    const lead = text.slice(0, start).match(/(?:(?:nanti|ntar|dapet|dapat|kena|plus|ada|terus|udah|sudah|pake|pakai)\s+)+$/i); if (lead) start -= lead[0].length;
    // "nanti dapet cashback 10k", "cashback 10k nanti": promised, not money yet.
    const around = text.slice(Math.max(0, start - 20), Math.min(text.length, end + 16)).toLocaleLowerCase('id-ID');
    parts.push({ role, type, label, amount: a.value, sign, text: text.slice(start, end), start, end, ...(role === 'CASHBACK' && FUTURE.test(around) ? { pending: true } : {}) });
  }
  if (!main || !parts.length) return null;
  for (const p of [...parts].sort((x, y) => y.start - x.start)) core = core.slice(0, p.start) + ' '.repeat(p.end - p.start) + core.slice(p.end);
  for (let guard = 0; guard < 4; guard++) core = core.replace(/\s+/g, ' ').trim().replace(/(?:^|\s)(?:nanti|ntar|dapet|dapat|terus|plus|\+|kena|ada)$/, '');
  core = core.trim();
  const charges = parts.filter(p => p.role !== 'CASHBACK');
  const paid = main.value + charges.reduce((n, p) => n + p.sign * p.amount, 0);
  const cash = parts.find(p => p.role === 'CASHBACK');
  // Cashback received at once lowers what the purchase costs (and what left the wallet); a promised one changes nothing yet.
  const net = cash && !cash.pending ? paid - cash.amount : paid;
  const formula = [rupiah(main.value), ...parts.map(p => p.role === 'CASHBACK' ? (p.pending ? '' : `− cashback ${rupiah(p.amount)}`) : `${p.sign < 0 ? '−' : '+'} ${p.label.toLowerCase()} ${rupiah(p.amount)}`)].filter(Boolean).join(' ') + ` = ${rupiah(net)}`;
  return { gross: main.value, parts, net, ...(cash ? { cashback: cash.amount, cashbackPending: Boolean(cash.pending) } : {}), core, formula };
}

/** The purchase as a structured receipt (stored on the transaction; never in its notes). */
export function compositionReceipt(c: Composition, name: string, merchant?: string): ReceiptSnapshot {
  return {
    ...(merchant ? { merchant } : {}),
    items: [{ name: name || 'Pembelian', qty: 1, price: c.gross, total: c.gross }],
    charges: c.parts.filter(p => p.type !== 'cashback').map(p => ({ type: p.type as ReceiptSnapshotCharge['type'], label: p.label, amount: p.amount })),
    subtotal: c.gross, total: c.parts.filter(p => p.type !== 'cashback').reduce((n, p) => n + p.sign * p.amount, c.gross),
    ...(c.cashback && !c.cashbackPending ? { cashback: c.cashback } : {}),
  };
}

/** "3 kopi 18k satu", "3 kopi @18k", "2 tiket 50k per orang": count × price each. Null when the price may be the total. */
export function readUnitPrice(text: string): { qty: number; unit: number; total: number; text: string } | null {
  const price = '((?:rp\\.?\\s*)?\\d[\\d.,]*\\s*(?:rb|ribu|k|jt|juta)?)';
  const each = '(?:satu|satunya|sebiji|seporsi|segelas|sebungkus|sebotol|per\\s*(?:porsi|buah|biji|pcs|orang|gelas|cup|bungkus|botol|item|tiket|lembar)|\\/\\s*(?:pcs|biji|porsi|gelas|buah|orang)|masing-masing|masing2|@)';
  const after = text.match(new RegExp(`\\b(\\d{1,3})\\s+((?:[\\p{L}-]+\\s+){1,3}?)${price}\\s*${each}(?![\\p{L}])`, 'u'));
  const before = text.match(new RegExp(`\\b(\\d{1,3})\\s+((?:[\\p{L}-]+\\s+){1,3}?)${each}\\s*${price}`, 'u'));
  const m = after || before; if (!m) return null;
  const qty = Number(m[1]), unit = findAmounts(m[3])[0]?.value;
  if (!unit || qty < 2 || qty > 100) return null;
  return { qty, unit, total: qty * unit, text: m[0] };
}
