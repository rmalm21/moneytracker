import test from 'node:test';
import assert from 'node:assert/strict';
import { readReceiptText, checkReceipt } from '../lib/receipt.ts';
import { receipts } from '../bench/v79/receipts-user.mjs';

// 8.0 — the nine receipts the person sent, written as the OCR reads them: every field the reader is asked for.
for (const r of receipts) test(`struk pemakai ${r.id}`, () => {
  const read = readReceiptText(r.text), check = checkReceipt(read), t = r.truth;
  if (t.merchant) assert.match(read.merchant, t.merchant);
  assert.equal(read.date, t.date); assert.equal(read.time, t.time); assert.equal(check.total, t.total);
  for (const k of ['subtotal', 'paid', 'change', 'payment']) if (t[k] !== undefined) assert.equal(read[k], t[k], k);
  assert.deepEqual(read.items.map(i => i.total - (i.discount || 0)), t.items.map(([, v]) => v));
  t.items.forEach(([name], i) => assert.ok(read.items[i].name.toLowerCase().startsWith(name.toLowerCase().slice(0, 4)), `${read.items[i].name} ~ ${name}`));
});

test('baris jumlah × harga di bawah nama: grosir, toko bangunan, UD', () => {
  const read = readReceiptText('TOKO X\nTgl 01-02-2026\nBeras\n4.000 Kg X 12.500 Rp. 50.000.000\nAMPLAS NO.240\n2,500.00 x 4.00 PCS = 10,000.00\nAqua 600ml\n2.500 x2 = 5.000\nTotal Rp. 50.015.000');
  assert.deepEqual(read.items.map(i => [i.name, i.qty, i.price]), [['Beras', 4000, 12500], ['AMPLAS N0.240', 4, 2500], ['Aqua 600ml', 2, 2500]]);
});

test('hypermarket: harga normal dan diskon toko di bawah harga bersih', () => {
  const read = readReceiptText('HYPERMART X\n21/10/19\n37502944 DIAMOND MLUHFLCR1LTR 22,580\n2 @ 13,500\ndisc toko (-)( 2) -4,420\n4 ITEMS TOTAL : 22,580');
  assert.deepEqual(read.items.map(i => [i.qty, i.price, i.total, i.discount]), [[2, 13500, 27000, 4420]]);
});

test('nomor antrean besar di bawah nama toko bukan barang', () => {
  const read = readReceiptText('FORE COFFEE\nShila at Sawangan\n5096\nTake Away Order\nSelasa, 25 Februari 2025, 14:38\n1x Large Iced Butterscotch\nSea Salt Latte\nLess Ice\nRp 38.000\nTotal Inc Tax Rp 38.000');
  assert.equal(read.items.length, 1); assert.equal(read.items[0].name, 'Large Iced Butterscotch Sea Salt Latte'); assert.deepEqual(read.items[0].modifiers, ['Less Ice']);
});
