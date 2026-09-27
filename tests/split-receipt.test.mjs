import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkReceipt, readReceiptText } from '../lib/receipt.ts';
import { buildReceiptSnapshot } from '../lib/receipt-snapshot.ts';
import { mergeReceiptReads } from '../lib/receipt-intel.ts';
import { computeSplit, splitFromReceipt } from '../lib/split-bill.ts';

let n = 0; const id = prefix => `${prefix}${++n}`;
/** What the shared review hands over after "Gunakan di Split Bill", optionally with the person's corrections. */
function reviewed(read, fix = {}) {
  const included = checkReceipt(read).included;
  const counted = Object.fromEntries(['discount', 'tax', 'service', 'delivery', 'fee', 'rounding'].map(k => [k, !included.includes(k)]));
  const items = (fix.items || read.items).map(i => ({ name: i.name, qty: i.qty, price: i.price, discount: i.discount }));
  return buildReceiptSnapshot({ read, merchant: read.merchant, date: read.date, time: read.time, payment: read.payment, total: fix.total ?? checkReceipt(read).total, items, subtotal: read.subtotal, charges: { discount: read.discount, tax: read.tax, service: read.service, delivery: read.delivery, fee: read.fee || 0, rounding: read.rounding, ...(fix.charges || {}) }, counted });
}
const people = [{ id: 'a', name: 'Rama', isMe: true }, { id: 'b', name: 'Suci' }];

test('an item discount stays on its item and only the net amount is shared', () => {
  const r = splitFromReceipt(reviewed(readReceiptText('BURGER BAR\nBURGER 50.000\nDISC BURGER -10.000\nTOTAL 40.000')), id);
  assert.deepEqual(r.items.map(i => [i.name, i.qty, i.price, i.discount]), [['BURGER', 1, 50_000, 10_000]]);
  const result = computeSplit({ total: 40_000, method: 'items', participants: people, items: [{ ...r.items[0], people: ['a', 'b'] }], extras: r.extras });
  assert.equal(result.total, 40_000);
  assert.deepEqual(result.people.map(p => p.total), [20_000, 20_000], 'never Rp50.000 split after the discount is known');
});

test('quantities, bill discounts, vouchers, tax, service and fees come in with their own kind', () => {
  const read = readReceiptText('SWALAYAN\nES TEH 3 x 8.000 24.000\nBURGER 50.000\nDISC BURGER -10.000\nKENTANG 20.000\nSUBTOTAL 84.000\nMEMBER DISC -5.000\nVOUCHER 3.000\nSERVICE 4.000\nPB1 10% 7.000\nBIAYA ADMIN 2.000\nTOTAL 89.000');
  const r = splitFromReceipt(reviewed(read), id);
  assert.deepEqual(r.items.find(i => i.name === 'ES TEH') && [r.items.find(i => i.name === 'ES TEH').qty, r.items.find(i => i.name === 'ES TEH').price], [3, 8_000]);
  const kinds = r.extras.map(e => [e.kind, e.amount]);
  assert.ok(kinds.some(([k, a]) => k === 'discount' && a === 5_000) || kinds.some(([k, a]) => k === 'discount' && a === 8_000), JSON.stringify(kinds));
  assert.ok(kinds.some(([k, a]) => k === 'tax' && a === 7_000));
  assert.ok(kinds.some(([k, a]) => k === 'service' && a === 4_000));
  assert.ok(kinds.some(([k]) => k === 'admin'));
  // Discounts are stored as amounts to take off; the bill adds up to the receipt.
  assert.ok(r.extras.filter(e => e.kind === 'discount').every(e => e.amount > 0));
  const result = computeSplit({ total: r.total, method: 'items', participants: people, items: r.items.map(i => ({ ...i, people: ['a', 'b'] })), extras: r.extras });
  assert.equal(result.total, r.total);
  assert.equal(result.mismatch, 0);
});

test('a charge already inside the prices and cashback are not added', () => {
  const r = splitFromReceipt(reviewed(readReceiptText('MINIMARKET\nSabun 40.000\nSusu 60.000\nTOTAL 100.000\nDPP 90.909\nPPN 9.091\nTUNAI 100.000')), id);
  assert.ok(!r.extras.some(e => e.kind === 'tax'));
  const cb = splitFromReceipt(reviewed(readReceiptText('TEH TARIK\nTeh 60.000\nRoti 40.000\nTotal paid 100.000\nCashback 10.000')), id);
  assert.equal(cb.extras.length, 0); assert.equal(cb.total, 100_000);
});

test('corrections made in the review reach Split Bill unchanged', () => {
  const read = readReceiptText('WARUNG\nNASI GORENK 25.000\nES TEH 5.000\nTOTAL 30.000');
  const r = splitFromReceipt(reviewed(read, { items: [{ name: 'Nasi Goreng', qty: 2, price: 12_500, discount: 1_000 }, { name: 'Es Teh', qty: 1, price: 5_000 }], total: 29_000, charges: { tax: 2_000 } }), id);
  assert.deepEqual(r.items.map(i => [i.name, i.qty, i.price, i.discount || 0]), [['Nasi Goreng', 2, 12_500, 1_000], ['Es Teh', 1, 5_000, 0]]);
  assert.equal(r.total, 29_000);
  assert.deepEqual(r.extras.map(e => [e.kind, e.amount]), [['tax', 2_000]]);
});

test('a long receipt read in two photos does not bring its overlapping items twice', () => {
  const first = readReceiptText('TOKO\nApel 10.000\nJeruk 12.000\nMangga 15.000');
  const second = readReceiptText('Mangga 15.000\nPisang 8.000\nTOTAL 45.000');
  const merged = mergeReceiptReads(first, second).read;
  const r = splitFromReceipt(reviewed(merged), id);
  assert.deepEqual(r.items.map(i => i.name.toUpperCase()), ['APEL', 'JERUK', 'MANGGA', 'PISANG']);
});

test('Split Bill uses the shared review, which never saves a transaction there', () => {
  const flow = readFileSync(new URL('../components/split-bill-flow.tsx', import.meta.url), 'utf8');
  assert.match(flow, /<ReceiptScan [^>]*context="split_bill"/);
  assert.ok(!/readReceiptPhoto|Abaikan|Pakai hasil ini/.test(flow), 'no second, limited receipt path');
  const scan = readFileSync(new URL('../components/receipt-scan.tsx', import.meta.url), 'utf8');
  assert.match(scan, /Gunakan di Split Bill/);
  assert.match(scan, /if \(split\) \{ useForSplit\(\); return; \}/, 'the split review returns before any transaction is saved');
  assert.match(scan, /Simpan transaksi/, 'Scan struk still saves transactions');
});
