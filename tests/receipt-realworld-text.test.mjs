// Text transcribed by hand from four real receipt photos (bench/realworld/realworld-dev, kept out of git). These test
// the reader's understanding of real layouts at text level; OCR accuracy on the photos is measured by the benchmark.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkReceipt, readReceiptText } from '../lib/receipt.ts';

const read = name => readReceiptText(fs.readFileSync(new URL(`./fixtures/realworld-text/${name}.txt`, import.meta.url), 'utf8'));
const rows = r => r.items.map(i => [i.name, i.qty, i.total]);

test('40/41/111 MR D.I.Y.: brand, company and outlet apart; 2 items with variant and SKU; DEBIT is the payment; PPN inside the total', () => {
  const r = read('mrdiy-1'), c = checkReceipt(r);
  assert.equal(r.merchant, 'MR D.I.Y.'); assert.equal(r.legalEntity, 'PT. DAYA INDAH ANUGERAH'); assert.equal(r.branch, 'DEPOK TOWN SQUARE');
  assert.deepEqual(rows(r), [['AUTO FOLD UMBRELLA 535MM*8K Y201#', 1, 91500], ['GREEN LEAF CHINTAI RD MIRROR 12 x 3*14.7CN', 1, 20000]]);
  assert.deepEqual(r.items.map(i => [i.variant, i.sku]), [['DB024 - 12/60', '9038568'], [undefined, '3109482']]);
  assert.equal(r.payment, 'debit'); assert.equal(r.date, '2026-09-28'); assert.equal(r.time, '19:42');
  assert.equal(c.total, 111500); assert.ok(c.included.includes('tax')); assert.equal(c.matches, true);
});
test('83 payment row never becomes an item; 84 an address with a postcode never becomes money', () => {
  const r = read('mrdiy-1');
  assert.ok(!r.items.some(i => /debit|jakarta|jalan|gedung|item\(s\)|customer|whatsapp/i.test(i.name)));
  assert.equal(r.discount, 0);
});
test('Alfamidi: "Total Item 1 9,600" is the total; cash with change; DPP/PPN information only', () => {
  const r = read('alfamidi-1'), c = checkReceipt(r);
  assert.deepEqual(rows(r), [['POCARI 500ML', 1, 9600]]);
  assert.equal(r.total, 9600); assert.equal(r.payment, 'cash'); assert.equal(r.paid, 50000); assert.equal(r.change, 40400); assert.equal(c.matches, true);
});
test('Dopamine Avenue: header fields stay metadata; PB1 and service add up; "Mandiri / qr" is QRIS', () => {
  const r = read('dopamine-1'), c = checkReceipt(r);
  assert.equal(r.merchant, 'Dopamine Avenue');
  assert.deepEqual(rows(r), [['Butterscotch Sea Salt Latte', 1, 44000]]);
  assert.deepEqual([r.subtotal, r.tax, r.service, r.total, r.payment], [44000, 4400, 2200, 50600, 'qris']);
  assert.equal(c.matches, true);
});
test('Wizzmie: quantity first, a note under Air Mineral, "13 items" is a count, QRIS reference is the payment', () => {
  const r = read('wizzmie-1'), c = checkReceipt(r);
  assert.equal(r.items.length, 8);
  assert.deepEqual(r.items.find(i => i.name === 'Air Mineral').modifiers, ['2 dingin, 1 biasa']);
  assert.ok(!r.items.some(i => i.modifiers?.some(m => /items/.test(m))));
  assert.deepEqual([r.subtotal, r.tax, r.total, r.payment], [149090, 14909, 164000, 'qris']);
  assert.equal(c.matches, true);
});

test('Alfamart digital receipt (first held-out image): delivery block, Ref line and "Total Diskon" summary stay out of the money', () => {
  const r = read('alfamart-digital-1'), c = checkReceipt(r);
  assert.equal(r.merchant, 'Alfamart');
  assert.deepEqual(r.items.map(i => [i.name, i.qty, i.total, i.discount]), [['Yakult Minuman Susu Fermentasi 5 x 65 ml', 2, 24200, undefined], ['Hydro Coco Minuman Air Kelapa Original 500 ml', 2, 32000, 4000]]);
  assert.equal(r.discount, 0); assert.equal(r.total, 52200); assert.equal(c.matches, true);
  assert.ok(!/delivered|budi/i.test(r.branch || ''));
  assert.ok(!r.items.some(i => /ref\.|budi|kenanga|kirim/i.test(i.name)));
});
