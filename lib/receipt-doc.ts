/**
 * Receipt Intelligence V3: the document before the fields.
 *
 *   lines → document family → blocks (header, address, store, products, summary, payment, help/UI) → line roles →
 *   amount roles → items and charges.
 *
 * A line can be read perfectly and still mean nothing for the transaction (an address, a phone number, a "Lacak"
 * button). Context comes first: a line inside an address block is never an item, a payment row closes the item list,
 * a crossed-out price is not what was paid, a summary row is never a product. Pure functions on text lines (positions
 * are optional), so the same rules hold for every OCR engine.
 */
import type { ChargeKey, ChargeType, PaymentMethod, ReceiptCharge, ReceiptLine, ReceiptRead } from './receipt.ts';

export type DocFamily = 'thermal_retail' | 'restaurant_pos' | 'cafe_pos' | 'supermarket' | 'minimarket' | 'fuel_receipt' | 'parking_receipt' | 'digital_receipt' | 'ecommerce_order' | 'delivery_order' | 'invoice' | 'generic_financial_document';
export type BlockRole = 'PAGE_HEADER' | 'ADDRESS_BLOCK' | 'MERCHANT_BLOCK' | 'PROMO_BANNER' | 'PRODUCT_BLOCK' | 'ORDER_SUMMARY' | 'PAYMENT_BLOCK' | 'HELP_BLOCK' | 'FOOTER_ACTIONS' | 'UNKNOWN_BLOCK';
export type LineRole =
  | 'merchant_brand' | 'merchant_legal' | 'branch' | 'platform' | 'address' | 'recipient' | 'phone' | 'ui_navigation' | 'status_bar' | 'promo'
  | 'product_name' | 'product_variant' | 'product_qty' | 'product_sku' | 'item_price' | 'item_modifier'
  | 'subtotal' | 'shipping' | 'shipping_discount' | 'voucher_platform' | 'voucher_store' | 'payment_discount' | 'item_discount' | 'bill_discount'
  | 'tax' | 'service' | 'admin_fee' | 'insurance' | 'tip' | 'rounding' | 'grand_total' | 'payment_method' | 'cash' | 'change'
  | 'date' | 'time' | 'receipt_id' | 'footer' | 'separator' | 'noise' | 'unknown';
export type AmountRole = 'item_original_price' | 'item_sale_price' | 'item_total' | 'subtotal' | 'shipping' | 'shipping_discount' | 'voucher' | 'payment_discount' | 'bill_discount' | 'tax' | 'service' | 'admin_fee' | 'insurance' | 'grand_total' | 'cash' | 'change' | 'unknown_amount';
export type DocLine = { index: number; text: string; role: LineRole; block: BlockRole; amounts: { value: number; negative: boolean; role: AmountRole }[] };
export type DocReading = { family: DocFamily; platform?: string; lines: DocLine[]; why: string[] };

/* ------------------------------------------------------------------ Words that decide roles */

const PLATFORMS: [RegExp, string][] = [[/\bshopee(?:pay|food)?\b/i, 'Shopee'], [/\btokopedia\b|\btokopedia card\b/i, 'Tokopedia'], [/\blazada\b/i, 'Lazada'], [/\btiktok\s*shop\b/i, 'TikTok Shop'], [/\bblibli\b/i, 'Blibli'], [/\bbukalapak\b/i, 'Bukalapak'], [/\bgrab(?:food|mart)?\b/i, 'Grab'], [/\bgo(?:food|mart|send)\b|\bgojek\b/i, 'Gojek']];
const ECOMMERCE_CUES = /\b(rincian pesanan|subtotal (?:produk|pengiriman|untuk produk)|total pesanan|total pembayaran|voucher (?:shopee|toko|platform)|alamat pengiriman|hubungi penjual|ajukan pengembalian|pesanan selesai|metode pembayaran|no\.? pesanan|waktu pemesanan|kunjungi toko|beli lagi)\b/i;
/** UI and navigation text on app screens. */
const UI = /^(?:rincian pesanan|detail pesanan|pesanan selesai|pesanan (?:telah|sudah) (?:sampai|diterima|dikirim)\b.*|butuh bantuan\??|ajukan pengembalian.*|hubungi penjual|chat penjual|lacak(?: pesanan)?|tonton sekarang|beli lagi|nilai|beri penilaian|lihat (?:semua|detail|rincian)|kunjungi toko|salin|tampilkan (?:lebih|semua)|pusat bantuan|kembali|informasi pengiriman|dikirim dengan.*|no\.? resi.*|pesanan diterima|batalkan pesanan|ubah|bagikan|ikuti|chat)$/i;
const PROMO = /\b(flash sale|harga (?:flash|spesial|special)|special live|live\b|cashback|gratis ongkir|promo|hemat|diskon \d+%|terlaris|mall|star\+?)\b/i;
const ADDRESS_WORD = /^(?:alamat\b|jl\b|jln\b|jalan\b|gg\b|gang\b|komplek\b|kompleks\b|perum(?:ahan)?\b|ruko\b|blok\b|kel\b|kec\b|kab\b|kota\b|provinsi\b)|\b(?:rt\.?\s*\d|rw\.?\s*\d|kel(?:urahan)?\.?\s|kec(?:amatan)?\.?\s|kab(?:upaten)?\.?\s|kota\s+[a-z]|dki jakarta|jawa (?:barat|tengah|timur)|banten|\bid\s+\d{5}\b|\b\d{5}\b\s*$)/i;
export const PHONE = /(?:\+62|\(\+62\)|\b62|\b0)\s*-?\s*8\d{1,3}[-\s]?\d{3,4}[-\s]?\d{3,5}\b/;
const PAYMENT_WORD = /^(?:metode pembayaran|pembayaran|bayar dengan|dibayar dengan)?\s*(?:debit|kartu debit|credit|kartu kredit|kredit|qris|cash|tunai|visa|mastercard|master card|gopay|ovo|dana|shopeepay|spaylater|linkaja|transfer bank|virtual account|va\b|cod|bayar di tempat|edc)\b/i;
const MONEY = /(-)?\s*(?:rp\.?\s*)(\d{1,3}(?:[.,]\d{3})+|\d+)(?![\d.,]*%)/gi;
const STATUS_BAR = /^\d{1,2}[.:]\d{2}(?:\s|$)|^[\d.:%\s]+$/;

/** The money values on a line ("Rp699.000 Rp212.000", "-Rp6.500"), in order. Only amounts written with Rp. */
export function moneyIn(text: string) {
  const out: { value: number; negative: boolean; at: number }[] = [];
  for (const m of text.matchAll(MONEY)) {
    const value = Number(m[2].replace(/[.,]/g, ''));
    if (value > 0) out.push({ value, negative: Boolean(m[1]) || /[-−–]\s*$/.test(text.slice(0, m.index)), at: m.index ?? 0 });
  }
  return out;
}
/** A summary label → its role and the charge it becomes. */
const SUMMARY: [RegExp, LineRole, AmountRole, ChargeType | null, ChargeKey | null][] = [
  [/^(?:subtotal (?:produk|pesanan|untuk produk|belanja)|total harga(?: produk| barang)?|harga barang)\b/i, 'subtotal', 'subtotal', null, null],
  [/^(?:subtotal )?diskon (?:pengiriman|ongkir|ongkos kirim)|^(?:voucher )?gratis ongkir|^potongan ongkir/i, 'shipping_discount', 'shipping_discount', 'shipping_discount', 'discount'],
  [/^(?:subtotal )?(?:pengiriman|ongkos kirim|ongkir|biaya (?:pengiriman|kirim)|ongkos pengiriman)\b/i, 'shipping', 'shipping', 'delivery', 'delivery'],
  [/^voucher (?:shopee|tokopedia|lazada|platform|marketplace)|^promo (?:shopee|tokopedia)|^voucher digunakan/i, 'voucher_platform', 'voucher', 'voucher', 'discount'],
  [/^voucher toko|^voucher penjual|^diskon toko|^potongan toko/i, 'voucher_store', 'voucher', 'voucher', 'discount'],
  [/^(?:diskon|potongan) (?:pembayaran|metode pembayaran)|^cashback pembayaran/i, 'payment_discount', 'payment_discount', 'discount', 'discount'],
  [/^(?:diskon|potongan|voucher|promo)\b/i, 'bill_discount', 'bill_discount', 'discount', 'discount'],
  [/^biaya (?:layanan|jasa|aplikasi|penanganan|platform)|^service fee/i, 'service', 'service', 'platform_fee', 'fee'],
  [/^biaya (?:admin|transaksi)|^admin\b/i, 'admin_fee', 'admin_fee', 'admin_fee', 'fee'],
  [/^(?:biaya )?(?:asuransi|proteksi)/i, 'insurance', 'insurance', 'insurance', 'fee'],
  [/^(?:ppn|pajak|pb1|tax)\b/i, 'tax', 'tax', 'tax', 'tax'],
  [/^(?:total (?:pesanan|pembayaran|belanja|tagihan|bayar)|grand total|total)\b/i, 'grand_total', 'grand_total', null, null],
];

/* ------------------------------------------------------------------ Family */

export function documentFamily(lines: string[]): { family: DocFamily; platform?: string; why: string[] } {
  const all = lines.join('\n'), why: string[] = [];
  const platform = PLATFORMS.find(([re]) => re.test(all))?.[1];
  const cues = lines.filter(l => ECOMMERCE_CUES.test(l)).length;
  const qty = lines.some(l => /^\s*[x×]\s*\d{1,3}\s*$/i.test(l));
  if (cues >= 2 || cues >= 1 && (platform || qty)) {
    why.push(`${cues} tanda halaman pesanan online${platform ? ` (${platform})` : ''}`);
    return { family: /\b(gofood|grabfood|shopeefood|ongkos kirim driver|driver)\b/i.test(all) ? 'delivery_order' : 'ecommerce_order', ...(platform ? { platform } : {}), why };
  }
  if (/\b(spbu|pertamax|pertalite|solar|liter)\b/i.test(all)) return { family: 'fuel_receipt', why: ['kata BBM'] };
  if (/\bparkir\b/i.test(all) && /\b(masuk|keluar|durasi)\b/i.test(all)) return { family: 'parking_receipt', why: ['tiket parkir'] };
  if (/\b(meja|table|pb1|service charge)\b/i.test(all)) return { family: 'restaurant_pos', why: ['meja / PB1 / service'] };
  if (/\b(invoice|faktur|jatuh tempo)\b/i.test(all)) return { family: 'invoice', why: ['invoice'] };
  if (/\b(ppn included|ppn termasuk|dpp)\b/i.test(all) || lines.some(l => /^\d{6,14}\s/.test(l))) return { family: 'thermal_retail', why: ['PPN termasuk / SKU'] };
  return { family: 'generic_financial_document', why: [] };
}

/* ------------------------------------------------------------------ Online orders */

/**
 * An order screen (Shopee, Tokopedia, …) read block by block: the address and the help buttons are set aside, the
 * store card gives the merchant, each product card gives one item (name, variant, quantity, the price paid and the
 * crossed-out price), the summary rows give the charges, and arithmetic only chooses between prices that were read.
 */
export function readOrderScreen(text: string): (ReceiptRead & { doc: DocReading }) | null {
  const raw = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const fam = documentFamily(raw);
  if (fam.family !== 'ecommerce_order' && fam.family !== 'delivery_order') return null;
  const lines: DocLine[] = raw.map((t, index) => ({ index, text: t, role: 'unknown', block: 'UNKNOWN_BLOCK', amounts: [] }));
  const set = (l: DocLine, role: LineRole, block: BlockRole) => { l.role = role; l.block = block; };

  // 1. Lines whose meaning does not depend on the neighbours.
  let block: BlockRole = 'PAGE_HEADER';
  const firstSummary = lines.findIndex(l => SUMMARY.some(([re]) => re.test(l.text)) && moneyIn(l.text).length > 0);
  for (const l of lines) {
    const t = l.text, inSummary = firstSummary >= 0 && l.index >= firstSummary;
    if (l.index <= 1 && STATUS_BAR.test(t)) { set(l, 'status_bar', 'PAGE_HEADER'); continue; }
    if (UI.test(t)) { set(l, 'ui_navigation', inSummary ? 'HELP_BLOCK' : block === 'PAGE_HEADER' ? 'PAGE_HEADER' : 'HELP_BLOCK'); continue; }
    if (/^alamat(?: pengiriman| penerima)?$/i.test(t)) { block = 'ADDRESS_BLOCK'; set(l, 'address', block); continue; }
    if (PHONE.test(t)) { set(l, block === 'ADDRESS_BLOCK' ? 'recipient' : 'phone', block === 'ADDRESS_BLOCK' ? block : 'UNKNOWN_BLOCK'); continue; }
    if (block === 'ADDRESS_BLOCK' && (ADDRESS_WORD.test(t) || !moneyIn(t).length && /,/.test(t))) { set(l, 'address', block); continue; }
    if (block === 'ADDRESS_BLOCK') block = 'MERCHANT_BLOCK';
    if (/^(?:metode pembayaran|pembayaran|bayar dengan|dibayar dengan)\b/i.test(t) || PAYMENT_WORD.test(t) && !moneyIn(t).length && inSummary) { set(l, 'payment_method', 'PAYMENT_BLOCK'); continue; }
    if (/^(?:no\.?\s*pesanan|nomor pesanan|order id|invoice)\b/i.test(t)) { set(l, 'receipt_id', 'PAYMENT_BLOCK'); continue; }
    if (/^(?:waktu (?:pemesanan|pembayaran|pengiriman|pesanan selesai)|tanggal)\b/i.test(t)) { set(l, 'date', 'PAYMENT_BLOCK'); continue; }
    const summary = SUMMARY.find(([re]) => re.test(t));
    if (summary && moneyIn(t).length && inSummary) { set(l, summary[1], 'ORDER_SUMMARY'); continue; }
    if (inSummary) { set(l, moneyIn(t).length ? 'unknown' : 'footer', 'FOOTER_ACTIONS'); continue; }
    if (PROMO.test(t) && !moneyIn(t).length) { set(l, 'promo', 'PROMO_BANNER'); continue; }
    if (/^[x×]\s*\d{1,3}$/i.test(t)) { set(l, 'product_qty', 'PRODUCT_BLOCK'); continue; }
    if (moneyIn(t).length && !t.replace(MONEY, '').replace(/[x×]\s*\d{1,3}/gi, '').trim()) { set(l, 'item_price', 'PRODUCT_BLOCK'); continue; }
  }
  // 2. The store card: the first plain line after the address (or the header) that is not the product's own text.
  const firstPrice = lines.findIndex(l => l.role === 'item_price');
  const candidates = lines.filter(l => l.role === 'unknown' && !moneyIn(l.text).length && (firstPrice < 0 || l.index < firstPrice));
  const store = candidates.find(l => /\b(official|store|shop|toko|mall|indonesia|id)\b/i.test(l.text) && l.text.length <= 48) || candidates.find(l => l.text.length <= 40 && !/[[\]]/.test(l.text) && candidates.indexOf(l) < candidates.length - 1);
  if (store) set(store, 'merchant_brand', 'MERCHANT_BLOCK');
  // 3. Products: a name (one or more lines), then variant / quantity / prices, until the next name or the summary.
  type Product = { name: string[]; variant?: string; qty: number; prices: number[]; lines: number[] };
  const products: Product[] = [];
  let cur: Product | null = null;
  for (const l of lines) {
    if (firstSummary >= 0 && l.index >= firstSummary) break;
    if (store && l.index <= store.index) continue;
    if (l.role === 'product_qty') { if (cur) { cur.qty = Number(l.text.replace(/\D/g, '')) || 1; cur.lines.push(l.index); } continue; }
    if (l.role === 'item_price') {
      if (cur) { const q = l.text.match(/[x×]\s*(\d{1,3})/i); if (q) cur.qty = Number(q[1]); cur.prices.push(...moneyIn(l.text).filter(m => !m.negative).map(m => m.value)); cur.lines.push(l.index); }
      continue;
    }
    if (l.role !== 'unknown') continue;
    const money = moneyIn(l.text);
    if (money.length) {
      // A name and its price on one line.
      if (!cur || cur.prices.length) { cur = { name: [l.text.slice(0, money[0].at).trim()], qty: 1, prices: [], lines: [] }; products.push(cur); }
      cur.prices.push(...money.filter(m => !m.negative).map(m => m.value)); cur.lines.push(l.index); set(l, 'product_name', 'PRODUCT_BLOCK');
      continue;
    }
    // A variant is labelled ("Variasi: Hitam"), or a short line right before the quantity or the price.
    const next = lines[l.index + 1];
    const looksVariant = cur && !cur.prices.length && cur.name.length && l.text.length <= 30 && !/[[\]]/.test(l.text) && (/^(?:variasi|varian|warna|ukuran|size)\b/i.test(l.text) || l.text.split(/\s+/).length <= 3 && (next?.role === 'product_qty' || next?.role === 'item_price'));
    if (looksVariant && cur) { cur.variant = l.text.replace(/^(?:variasi|varian)\s*:?\s*/i, ''); cur.lines.push(l.index); set(l, 'product_variant', 'PRODUCT_BLOCK'); continue; }
    if (!cur || cur.prices.length || cur.variant) { cur = { name: [l.text], qty: 1, prices: [], lines: [l.index] }; products.push(cur); }
    else { cur.name.push(l.text); cur.lines.push(l.index); }
    set(l, 'product_name', 'PRODUCT_BLOCK');
  }
  // 4. Summary rows → charges.
  const charges: ReceiptCharge[] = [];
  let subtotal = 0, total = 0, delivery = 0, discount = 0, fee = 0, tax = 0;
  const totals: number[] = [];
  for (const l of lines.filter(x => x.block === 'ORDER_SUMMARY')) {
    const rule = SUMMARY.find(([re]) => re.test(l.text))!, money = moneyIn(l.text), value = money[money.length - 1]?.value || 0;
    l.amounts = money.map(m => ({ value: m.value, negative: m.negative, role: rule[2] }));
    if (rule[1] === 'subtotal') { if (!subtotal) subtotal = value; continue; }
    if (rule[1] === 'grand_total') { totals.push(value); if (!total || /pesanan|pembayaran|bayar|tagihan/i.test(l.text)) total = value; continue; }
    const type = rule[3]!, key = rule[4]!;
    charges.push({ type, key, label: l.text.slice(0, money[0]?.at ?? l.text.length).trim(), amount: value, line: l.index });
    if (key === 'delivery') delivery += value; else if (key === 'discount') discount += value; else if (key === 'fee') fee += value; else if (key === 'tax') tax += value;
  }
  // 5. Each product's price: of the prices read on its card, the one the subtotal confirms; otherwise the lower one
  // when two are shown (the higher is the crossed-out price). Nothing is invented.
  const items: ReceiptLine[] = products.filter(p => p.prices.length && p.name.join(' ').trim()).map(p => {
    const lower = Math.min(...p.prices), higher = Math.max(...p.prices);
    return { name: p.name.join(' ').trim(), qty: p.qty, price: lower, total: lower * p.qty, lines: p.lines, ...(p.variant ? { variant: p.variant } : {}), ...(higher > lower ? { originalPrice: higher } : {}) } as ReceiptLine;
  });
  if (subtotal && items.length) {
    const sum = items.reduce((n, i) => n + i.total, 0);
    if (sum !== subtotal) {
      // Try the other price of each product that showed two: only a combination of read prices may match.
      for (const item of items) {
        const alt = (item as ReceiptLine & { originalPrice?: number }).originalPrice;
        if (alt && sum - item.total + alt * item.qty === subtotal) { (item as ReceiptLine & { originalPrice?: number }).originalPrice = item.price; item.price = alt; item.total = alt * item.qty; break; }
      }
    }
  }
  for (const item of items) for (const i of item.lines || []) { const l = lines[i]; if (l.role === 'item_price') l.amounts = moneyIn(l.text).map(m => ({ value: m.value, negative: m.negative, role: m.value === item.price ? 'item_sale_price' : 'item_original_price' })); }
  const payLine = lines.find(l => l.role === 'payment_method');
  const payText = payLine ? `${payLine.text} ${lines[payLine.index + 1]?.text || ''}` : raw.join(' ');
  const payment = (/shopeepay|spaylater/i.test(payText) ? 'shopeepay' : /gopay/i.test(payText) ? 'gopay' : /\bovo\b/i.test(payText) ? 'ovo' : /\bdana\b/i.test(payText) ? 'dana' : /qris/i.test(payText) ? 'qris' : /kartu kredit|credit/i.test(payText) ? 'credit' : /debit/i.test(payText) ? 'debit' : /transfer|virtual account/i.test(payText) ? 'transfer' : /\bcod\b|bayar di tempat|tunai|cash/i.test(payText) ? 'cash' : '') as PaymentMethod;
  const doc: DocReading = { family: fam.family, ...(fam.platform ? { platform: fam.platform } : {}), lines, why: fam.why };
  return {
    merchant: store?.text || '', date: '', time: '', items, subtotal, tax, service: 0, discount, delivery, rounding: 0, total, fee, paid: 0, change: 0, payment, skipped: 0,
    totals, charges, receiptType: fam.family === 'delivery_order' ? 'food_delivery' : 'marketplace', ...(fam.platform ? { platform: fam.platform } : {}),
    layout: lines.map(l => ({ line: l.index, zone: l.block === 'PRODUCT_BLOCK' ? 'items' : l.block === 'ORDER_SUMMARY' ? 'summary' : l.block === 'PAYMENT_BLOCK' ? 'payment' : l.block === 'MERCHANT_BLOCK' || l.block === 'PAGE_HEADER' ? 'header' : 'footer', text: l.text })) as ReceiptRead['layout'],
    sources: { ...(store ? { merchant: [store.index] } : {}), ...(lines.find(l => l.role === 'grand_total') ? { total: [lines.find(l => l.role === 'grand_total')!.index] } : {}), ...(lines.find(l => l.role === 'subtotal') ? { subtotal: [lines.find(l => l.role === 'subtotal')!.index] } : {}) },
    doc,
  } as ReceiptRead & { doc: DocReading };
}
