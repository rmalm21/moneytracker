// Receipt Intelligence V4 (app 7.0): rows decided by the model trained on real receipts (lib/receipt-rowlink.ts), and a
// number glued to a slash read as part of a code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { paddleToRecognized } from '../lib/ocr-paddle.ts';
import { groupRows } from '../lib/receipt-rowlink.ts';
import { ROW_LINK_MODEL } from '../lib/receipt-rowlink-model.ts';
import { readReceiptText } from '../lib/receipt.ts';

const seg = (text, x0, y0, x1, y1) => ({ text, score: .95, poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });

test('the model is the small network that was trained (12 inputs, 16 and 8 hidden, 1 output)', () => {
  assert.deepEqual(ROW_LINK_MODEL.layers.map(l => [l.w.length, l.b.length]), [[12, 16], [16, 8], [8, 1]]);
});

test('a curved receipt: each price joins its own name, though the paper bends and the prices sit lower', () => {
  // Names on the left; prices far right, each a little lower than its name, more so further down (the paper curls).
  const items = [seg('NASI GORENG', 20, 100, 220, 124), seg('25,000', 620, 106, 700, 130), seg('ES TEH MANIS', 20, 140, 240, 164), seg('6,000', 630, 150, 700, 174), seg('TOTAL', 20, 180, 120, 204), seg('31,000', 620, 194, 700, 218)];
  const rows = paddleToRecognized(items).rows.map(r => r.text.replace(/\s+/g, ' '));
  assert.deepEqual(rows, ['NASI GORENG 25,000', 'ES TEH MANIS 6,000', 'TOTAL 31,000']);
});

test('two rows apart are never joined, and an empty receipt has no rows', () => {
  const rows = groupRows([{ x0: 0, y0: 0, x1: 100, y1: 20 }, { x0: 400, y0: 60, x1: 480, y1: 80 }], ROW_LINK_MODEL);
  assert.equal(rows.length, 2);
  assert.deepEqual(groupRows([], ROW_LINK_MODEL), []);
});

test('a number at the end of a code after a slash is not a price', () => {
  const read = readReceiptText('No. InvoiceINV/20260915/XYZ/551\nKabel Data 45.000\nTotal 45.000');
  assert.deepEqual(read.items.map(i => [i.name, i.total]), [['Kabel Data', 45000]]);
});

// 7.1 — no confident wrong totals, fewer fake items (measured on real receipts: bench/cord).
import { checkReceipt } from '../lib/receipt.ts';
test('the total that explains tax and service wins over a stronger-worded total printed before them', () => {
  const read = readReceiptText('1 Mango Lemon Tea Rp29,090\n1 Sliders Set Rp113,636\nNet Total: Rp142,726\nSrv Ch Rp7,136\nTAX Rp14,986\nTOTAL: Rp164,848\nVisa Rp164,848');
  const check = checkReceipt(read);
  assert.equal(check.total, 164848);
  assert.equal(check.confidence, 'tinggi');
});
test('two printed totals that disagree, with nothing paid to settle it, are never "sure"', () => {
  const read = readReceiptText('NASI GORENG 20.000\nTOTAL 20.000\nGRAND TOTAL 25.000');
  assert.notEqual(checkReceipt(read).confidence, 'tinggi');
});
test('summary words as receipts print or the OCR misreads them are not items', () => {
  const read = readReceiptText('KOREAN CURRY M 40,909\nSUB.TOTAL 40,909\nSUC CHG 6% 2,455\nP.Rest 10 % 4,336\nITEMS:1 40,909\nFOOD 40,909\nDUE 47,700\nCASH 50,000\nCHANGE 2,300');
  assert.deepEqual(read.items.map(i => i.name), ['KOREAN CURRY M']);
  assert.equal(read.service, 2455); assert.equal(read.tax, 4336); assert.equal(read.subtotal, 40909);
  assert.equal(checkReceipt(read).total, 47700);
});
test('a choice under a name, printed after a dash with the price, belongs to that item', () => {
  const read = readReceiptText('BBQ Chicken\n-Sedang 41,000\nTotal 41,000');
  assert.deepEqual(read.items.map(i => [i.name, i.total, i.modifiers]), [['BBQ Chicken', 41000, ['Sedang']]]);
});
test('a minus after the amount (rounding) is a negative amount, and "Pet Food" stays an item', () => {
  assert.equal(readReceiptText('IKAN 55,834\nSubtotal 55,834\nRounding 34-\nTotal 55,800').rounding, -34);
  assert.deepEqual(readReceiptText('Pet Food 45.000\nTotal 45.000').items.map(i => i.name), ['Pet Food']);
});
