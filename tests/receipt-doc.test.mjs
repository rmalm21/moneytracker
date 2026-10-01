// Receipt Intelligence V3: document families, blocks and roles, the order-screen reader, and the safety gates (address,
// phone, payment, UI and summary rows never become items). All texts here are synthetic transcriptions
// (synthetic-regression); they are not real-world accuracy evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { documentFamily, moneyIn, readOrderScreen, PHONE } from '../lib/receipt-doc.ts';
import { checkReceipt } from '../lib/receipt.ts';

const shopee = fs.readFileSync(new URL('./fixtures/shopee-order.txt', import.meta.url), 'utf8');

test('37/38 Shopee order: one product, every summary row in its place, total adds up, nothing else becomes money', () => {
  const r = readOrderScreen(shopee);
  assert.equal(r.doc.family, 'ecommerce_order'); assert.equal(r.platform, 'Shopee'); assert.equal(r.merchant, 'Enchen Official Shop');
  assert.deepEqual(r.items.map(i => [i.name, i.qty, i.price, i.total, i.originalPrice]), [['[Penawaran Kombo] ENCHEN Mini 6 Alat C...', 1, 212000, 212000, 699000]]);
  assert.deepEqual(r.charges.map(c => [c.type, c.amount]), [['delivery', 6500], ['shipping_discount', 6500], ['voucher', 40384], ['voucher', 10083], ['discount', 1000], ['platform_fee', 2200]]);
  assert.equal(r.subtotal, 212000); assert.equal(r.total, 162733); assert.equal(r.payment, 'shopeepay');
  const check = checkReceipt(r);
  assert.equal(check.matches, true); assert.equal(check.total, 162733);
  const roleOf = text => r.doc.lines.find(l => l.text.startsWith(text)).role;
  for (const t of ['Butuh Bantuan?', 'Ajukan Pengembalian', 'Hubungi Penjual', 'Lacak', 'Rincian Pesanan', 'Tonton Sekarang']) assert.equal(roleOf(t), 'ui_navigation', t);
  assert.equal(roleOf('Rama Almahi'), 'recipient'); assert.equal(roleOf('Jalan Melati'), 'address'); assert.equal(roleOf('harga flash sale'), 'promo');
  // No phone digits, address numbers or postcode anywhere in the money.
  const money = [...r.items.flatMap(i => [i.price, i.total]), ...r.charges.map(c => c.amount), r.total, r.subtotal];
  for (const bad of [10510, 20, 3, 5, 8516128303, 6128, 3003]) assert.ok(!money.includes(bad), String(bad));
});

test('86 the crossed-out price is never the paid price, also when the two prices come on separate lines', () => {
  const text = shopee.replace('Rp699.000 Rp212.000', 'Rp699.000\nRp212.000');
  const r = readOrderScreen(text);
  assert.equal(r.items.length, 1); assert.equal(r.items[0].price, 212000); assert.equal(r.items[0].originalPrice, 699000);
});

test('an OCR that puts the quantity on the price row and wraps the product name still gives one product', () => {
  const text = shopee.replace('[Penawaran Kombo] ENCHEN Mini 6 Alat C...\nHitam\nx1\nRp699.000 Rp212.000', '[Penawaran Kombo] ENCHEN Mini 6 Alat Cukur\nRambut Elektrik Portable\nVariasi: Hitam\nRp699.000 Rp212.000 x1');
  const r = readOrderScreen(text);
  assert.deepEqual(r.items.map(i => [i.name, i.qty, i.price, i.variant]), [['[Penawaran Kombo] ENCHEN Mini 6 Alat Cukur Rambut Elektrik Portable', 1, 212000, 'Hitam']]);
});

test('two products, each with its own prices; the subtotal confirms the paid prices', () => {
  const text = ['Rincian Pesanan', 'Alamat Pengiriman', 'Sari (+62) 812-3456-7890', 'Jl. Kenanga No. 5, Kota Bandung, 40115', 'Toko Rumah Rapi', 'Rak Sepatu Lipat 5 Susun', 'x2', 'Rp120.000 Rp85.000', 'Gantungan Baju Stainless', 'x1', 'Rp30.000',
    'Subtotal Produk Rp200.000', 'Subtotal Pengiriman Rp12.000', 'Biaya Layanan Rp1.000', 'Total Pesanan Rp213.000', 'Metode Pembayaran COD', 'Hubungi Penjual'].join('\n');
  const r = readOrderScreen(text);
  assert.equal(r.merchant, 'Toko Rumah Rapi');
  assert.deepEqual(r.items.map(i => [i.name, i.qty, i.price, i.total]), [['Rak Sepatu Lipat 5 Susun', 2, 85000, 170000], ['Gantungan Baju Stainless', 1, 30000, 30000]]);
  assert.equal(checkReceipt(r).matches, true); assert.equal(r.payment, 'cash');
});

test('85/89 help buttons and summary rows never add items', () => {
  const text = ['Rincian Pesanan', 'Toko Contoh', 'Kaos Polos', 'Rp50.000', 'Subtotal Produk Rp50.000', 'Voucher Toko Digunakan -Rp5.000', 'Biaya Layanan Rp1.000', 'Total Pesanan Rp46.000', 'Butuh Bantuan?', 'Ajukan Pengembalian', 'Hubungi Penjual', 'Lacak'].join('\n');
  const r = readOrderScreen(text);
  assert.equal(r.items.length, 1); assert.equal(r.total, 46000); assert.equal(checkReceipt(r).matches, true);
});

test('family: a paper receipt is not read as an order screen', () => {
  assert.equal(readOrderScreen('MR D.I.Y.\nPT DAYA INDAH ANUGERAH\n27/09/2026\nAUTO FOLD UMBRELLA\n9038568 1 X 91,500 91,500\nTotal 91,500\nDebit 91,500\nPPN INCLUDED 11,050'), null);
  assert.equal(documentFamily(['SPBU 34.123', 'PERTAMAX', 'Volume 4,92 L']).family, 'fuel_receipt');
});

test('23 phone numbers are recognised, and money needs an Rp', () => {
  for (const p of ['+62 851-6128-3003', '(+62) 851-6128-3003', '081234567890', '0812 3456 7890']) assert.ok(PHONE.test(p), p);
  assert.deepEqual(moneyIn('Rp699.000 Rp212.000').map(m => m.value), [699000, 212000]);
  assert.deepEqual(moneyIn('Jalan Melati IV No.20 RT 3 10510').map(m => m.value), []);
  assert.deepEqual(moneyIn('Subtotal Diskon Pengiriman -Rp6.500').map(m => [m.value, m.negative]), [[6500, true]]);
});
