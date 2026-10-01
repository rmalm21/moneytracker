import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeGemini, parseGemini } from '../lib/gemini-receipt.ts';
import { readReceiptText } from '../lib/receipt.ts';

test('Gemini JSON is checked, never guessed', () => {
  const g = parseGemini(JSON.stringify({ merchant: ' KOPI SENJA ', date: '2026-09-03', time: '8:15', items: [{ name: 'CAFFE LATTE', qty: 1, total: 32000 }, { name: '', qty: 1, total: 5 }, { name: 'AIR', qty: 0, total: '16000' }], subtotal: 78000, tax: 7800, total: -5, payment: 'QRIS' }));
  assert.equal(g.merchant, 'KOPI SENJA');
  assert.equal(g.time, '08:15');
  assert.deepEqual(g.items.map(i => [i.name, i.qty, i.total]), [['CAFFE LATTE', 1, 32000], ['AIR', 1, 16000]]);
  assert.equal(g.total, null, 'a negative total is dropped');
  assert.equal(parseGemini('not json'), null);
  assert.equal(parseGemini(JSON.stringify({ items: [], date: '03/09/2026' })).date, null);
});

test('Gemini values win, empty ones keep the on-device reading', () => {
  const local = readReceiptText('WARUNG SEDERHANA\n27/09/2026 19:30\nNasi Goreng 35.000\nTotal 35.000');
  const merged = mergeGemini(local, { merchant: null, date: null, time: null, items: [{ name: 'Nasi Goreng Spesial', qty: 2, unitPrice: 17500, total: 35000 }], tax: 3500, total: 38500, payment: 'qris' });
  assert.equal(merged.merchant, local.merchant);
  assert.equal(merged.date, local.date);
  assert.deepEqual(merged.items.map(i => [i.name, i.qty, i.price, i.total]), [['Nasi Goreng Spesial', 2, 17500, 35000]]);
  assert.equal(merged.tax, 3500);
  assert.equal(merged.total, 38500);
  assert.equal(merged.payment, 'qris');
  assert.equal(mergeGemini(local, null), local);
});
