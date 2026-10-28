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
