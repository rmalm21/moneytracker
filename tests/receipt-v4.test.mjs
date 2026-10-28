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

// 7.2 — minimarket receipts (measured on bench/minimarket): two-line items with sizes, weighed items, item discounts.
test('a name with its size over its quantity row is that row\'s item ("CLEO 1500ML" / "1 x 6.000 6.000")', () => {
  const read = readReceiptText('CLEO 1500ML\n   1 x 6.000      6.000\nCOCA COLA 390ML\n   2 x 6.500     13.000\nULTRA MILK CKLT 250\n   2 x 6.200     12.400\nTISU PASEO 250S\n   1 x 18.900    18.900\nTotal : 50.300');
  assert.deepEqual(read.items.map(i => [i.name, i.qty, i.total]), [['CLEO 1500ML', 1, 6000], ['COCA COLA 390ML', 2, 13000], ['ULTRA MILK CKLT 250', 2, 12400], ['TISU PASEO 250S', 1, 18900]]);
});
test('a shop name with a small number is the name; a weighed item survives a voucher; "Kembalian 0" means cash', () => {
  const read = readReceiptText('BINTANG 24\nJL. MERPATI BLOK C2\nMALANG\nAYAM FILLET\n   0.582 KG x 59,900      34,862\nSUBTOTAL 34,862\nVOUCHER -5,000\nTOTAL 29,862\nBayar : 29,862\nKembalian : 0');
  assert.equal(read.merchant, 'BINTANG 24');
  assert.deepEqual(read.items.map(i => [i.name, i.qty, i.total]), [['AYAM FILLET', 1, 34862]]);
  assert.equal(checkReceipt(read).total, 29862); assert.equal(read.payment, 'cash');
});
test('"Total Item 3" before the discounts and "Total Belanja" is the subtotal; "POT. HARGA" belongs to its item; "ANDA HEMAT" is not counted again', () => {
  const read = readReceiptText('POCARI SWEAT 500ML    1   7,900    7,900\n   POT. HARGA                    -1,600\nKINDER JOY            2  13,500   27,000\nTotal Item       3               34,900\nTotal Disc.                      -1,600\nTotal Belanja                    33,300\nTunai                            50,000\nKembalian                        16,700\nANDA HEMAT :                      1,600');
  assert.deepEqual(read.items.map(i => [i.name, i.total, i.discount || 0]), [['POCARI SWEAT 500ML', 7900, 1600], ['KINDER JOY', 27000, 0]]);
  assert.equal(read.subtotal, 34900); assert.equal(read.discount, 0);
  const check = checkReceipt(read); assert.equal(check.total, 33300); assert.equal(check.matches, true);
});

// 7.3 — thermal minimarket photos (bench/minimarket, PHOTO_STYLE=thermal) and "sure" only when the numbers agree.
test('amounts read just above their labels pair with them ("120.000 / Bayar / 6.300 / Kembali")', () => {
  const read = readReceiptText('ROTI TAWAR\n   1 x 113.700      113.700\nTOTAL\n113.700\n120.000\nBayar\n6.300\nKembali');
  assert.deepEqual([read.total, read.paid, read.change], [113700, 120000, 6300]);
});
test('"Total Item" or "Total Harga" before another total is the subtotal, even when the two are the same', () => {
  assert.equal(readReceiptText('KOPI   1   9,600   9,600\nTotal Item   1   9,600\nTotal Belanja   9,600\nTunai   10,000').subtotal, 9600);
  const read = readReceiptText('KOPI   1   9,600   9,600\nTOTAL HARGA :   9,600\nPOT. HARGA   -100\nTOTAL :   9,500');
  assert.equal(read.subtotal, 9600); assert.equal(checkReceipt(read).total, 9500);
});
test('a price cut under the last item is that item\'s; "HEMAT" after the total is not counted again', () => {
  const read = readReceiptText('TEH   1   5,000   5,000\nKOPI   2   9,900   19,800\n   POT. HARGA   -1,500\nTOTAL   23,300\nTUNAI   50,000\nKEMBALI   26,700\nHEMAT :   1,500');
  assert.deepEqual(read.items.map(i => i.discount || 0), [0, 1500]); assert.equal(read.discount, 0);
  assert.equal(checkReceipt(read).total, 23300);
});
test('0 read as 8 or 6 on a faded print: the unit price and line total that agree, with a note', () => {
  const read = readReceiptText('SUNSILK SHMP 170ML   1 25,980 25,968\nTELUR AYAM 10BTR   2 27,908 55,880\nTOTAL 81,700');
  assert.deepEqual(read.items.map(i => [i.qty, i.price, i.total]), [[1, 25900, 25900], [2, 27900, 55800]]);
  assert.ok(read.fixes.some(f => /SUNSILK/.test(f)));
  assert.deepEqual(readReceiptText('Mango Tea 1 29,090 29,890\nTOTAL 29,090').items.map(i => i.total), [29090]);
});
test('"sure" only when the numbers agree within Rp100, and not when a digit was changed just to reach the total', () => {
  const off = readReceiptText('RINSO   3 23,960   71,760\nBERAS   4 72,500 290,000\nHARGA JUAL :   373,766\nTOTAL :   373,209');
  assert.notEqual(checkReceipt(off).confidence, 'tinggi');
  const fitted = readReceiptText('Nasi Goreng 20.000\nEs Teh 5.000\nPB1 2.500\nTOTAL 32.500');
  assert.ok(fitted.fittedToTotal); assert.equal(checkReceipt(fitted).total, 32500); assert.notEqual(checkReceipt(fitted).confidence, 'tinggi');
});
