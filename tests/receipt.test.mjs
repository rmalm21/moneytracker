import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReceipt, cleanOcrText, readReceiptText, receiptScore, receiptToTransaction, walletForPayment } from '../lib/receipt.ts';
import { categoryTemplates } from '../lib/category-templates.ts';

const templates = [];
for (const t of categoryTemplates) {
  templates.push({ id: t.key, name: t.name, type: t.type, parentId: null, icon: t.icon, templateKey: t.key });
  for (const s of t.subcategories) templates.push({ id: s.key, name: s.name, type: t.type, parentId: t.key, icon: s.icon, templateKey: s.key });
}
const wallets = [{ id: 'bca', name: 'BCA', type: 'bank' }, { id: 'dompet', name: 'Dompet', type: 'cash' }, { id: 'gp', name: 'GoPay', type: 'ewallet' }];

test('OCR slips in amounts are fixed, words are left alone', () => {
  assert.equal(cleanOcrText('NASI GORENG   35.0O0'), 'NASI GORENG 35.000');
  assert.equal(cleanOcrText('ES TEH l2.500'), 'ES TEH 12.500');
  assert.equal(cleanOcrText('TOTAL 35 000'), 'TOTAL 35000');
  assert.equal(cleanOcrText('Kopi susu 18.000,-'), 'Kopi susu 18.000');
  assert.equal(cleanOcrText('SOTO BOLOS'), 'SOTO BOLOS');
});

test('a noisy restaurant receipt: items, charges, payment and the check', () => {
  const text = `WARUNG BU SRI
Jl. Melati No 5
Tgl: 21/09/2026 Jam 12:41
NASI GORENG 2 x 25.000 50.000
ES TEH
2 x 5.0O0 10.000
AYAM BAKAR 32.000
SUBTOTAI 92.000
PB 1 10% 9.200
SERV1CE 5% 4.600
T0TAL 105.800
TUNAI 110.000
KEMBALI 4.200`;
  const read = readReceiptText(text);
  assert.equal(read.merchant, 'WARUNG BU SRI');
  assert.equal(read.date, '2026-09-21');
  assert.equal(read.time, '12:41');
  assert.deepEqual(read.items.map(i => [i.name, i.qty, i.price]), [['NASI GORENG', 2, 25000], ['ES TEH', 2, 5000], ['AYAM BAKAR', 1, 32000]]);
  assert.equal(read.subtotal, 92000); assert.equal(read.tax, 9200); assert.equal(read.service, 4600);
  assert.equal(read.total, 105800); assert.equal(read.paid, 110000); assert.equal(read.change, 4200);
  assert.equal(read.payment, 'cash');
  const check = checkReceipt(read);
  assert.equal(check.total, 105800); assert.equal(check.source, 'printed'); assert.equal(check.confidence, 'tinggi'); assert.ok(check.matches);
});

test('with no printed total, paid − change or items + charges is used and flagged', () => {
  const paid = checkReceipt(readReceiptText('Kopi 18.000\nRoti 12.000\nTunai 50.000\nKembalian 20.000'));
  assert.equal(paid.total, 30000); assert.equal(paid.source, 'paid'); assert.equal(paid.confidence, 'tinggi');
  const items = checkReceipt(readReceiptText('Kopi 18.000\nRoti 12.000'));
  assert.equal(items.total, 30000); assert.equal(items.source, 'items'); assert.equal(items.confidence, 'rendah');
  assert.match(items.notes.join(' '), /tidak tertulis/);
  const none = checkReceipt(readReceiptText('terima kasih'));
  assert.equal(none.total, 0); assert.equal(none.confidence, 'rendah'); assert.match(none.notes.join(' '), /Isi nominalnya sendiri/);
});

test('a total that disagrees with the items is reported, not hidden', () => {
  const check = checkReceipt(readReceiptText('Kopi 18.000\nRoti 12.000\nTOTAL 45.000'));
  assert.equal(check.total, 45000); assert.equal(check.matches, false); assert.equal(check.confidence, 'sedang');
  assert.match(check.notes.join(' '), /selisih Rp15\.000/);
});

test('the better OCR pass scores higher', () => {
  const good = readReceiptText('Kopi 18.000\nRoti 12.000\nTOTAL 30.000');
  const bad = readReceiptText('K0pi l8\nR0ti ##\nT0TAL');
  assert.ok(receiptScore(good) > receiptScore(bad));
});

test('payment method picks the wallet', () => {
  assert.equal(walletForPayment('gopay', wallets, 'bca').walletId, 'gp');
  assert.equal(walletForPayment('cash', wallets, 'bca').walletId, 'dompet');
  assert.equal(walletForPayment('qris', wallets, 'bca').walletId, 'bca');
  assert.equal(walletForPayment('', wallets, 'bca').why, '');
});

test('a receipt becomes a transaction to confirm, split by category when items differ', () => {
  const read = readReceiptText('APOTEK SEHAT\n12/09/2026\nPARACETAMOL 12.000\nBERAS 5KG 70.000\nTOTAL 82.000\nGOPAY 82.000');
  const tx = receiptToTransaction(read, { categories: templates, history: [], wallets, today: '2026-09-27', defaultWalletId: 'bca' });
  assert.equal(tx.amount, 82000); assert.equal(tx.date, '2026-09-12'); assert.equal(tx.walletId, 'gp'); assert.equal(tx.merchant, 'APOTEK SEHAT');
  assert.ok(tx.items.every(item => item.categoryId));
  if (tx.splits.length) assert.equal(tx.splits.reduce((sum, line) => sum + line.amount, 0), 82000);
  // A date in the future or far past falls back to today.
  const old = receiptToTransaction(readReceiptText('Kopi 18.000\n01/01/2020'), { categories: templates, history: [], wallets, today: '2026-09-27' });
  assert.equal(old.date, '2026-09-27');
  assert.equal(old.amount, 18000);
});

test('OCR quantity typos and untrustworthy totals', () => {
  const read = readReceiptText('ES TEH MANIS\n2 Xx 6.000 12.000\nTOTAL 12.000');
  assert.deepEqual(read.items.map(i => [i.name, i.qty, i.price]), [['ES TEH MANIS', 2, 6000]]);
  // Leading digits lost: ". 360" must never look reliable.
  const lost = checkReceipt(readReceiptText('NASI GORENG . 000\nTOTAL . 360'));
  assert.equal(lost.confidence, 'rendah');
  const lonely = checkReceipt(readReceiptText('TOTAL 129.360'));
  assert.equal(lonely.confidence, 'rendah'); assert.match(lonely.notes.join(' '), /Pastikan nominalnya benar/);
});

test('OCR noise above the header is not taken as the place', () => {
  assert.equal(readReceiptText('0 ERA\nWARUNG KOPI NUSANTARA\nJl. Melati No. 12\nKopi 18.000').merchant, 'WARUNG KOPI NUSANTARA');
});

test('a mangled grand total is still the total, never an item', () => {
  for (const label of ['GRAND T0TAI', 'GRAMD TOTAL', 'GRANDTOTAL', 'Grand Tota1', 'T O T A L', 'TOTAL BAYAR']) {
    const read = readReceiptText(`RM PADANG\nRendang 25.000\nEs Jeruk 8.000\n${label} 33.000\nTunai 50.000\nKembali 17.000`);
    assert.deepEqual(read.items.map(i => i.name), ['Rendang', 'Es Jeruk'], label);
    assert.equal(checkReceipt(read).total, 33000, label);
  }
  // Card slip after the total: approval codes and card numbers are not items.
  const card = readReceiptText('KOPI\nLatte 30.000\nTOTAL 30.000\nDEBIT BCA 30.000\nNO KARTU 4567\nAPPR CODE 123456\nREF 000123456789');
  assert.deepEqual(card.items.map(i => i.total), [30000]);
  assert.equal(card.payment, 'debit');
});

test('names and prices copied as two columns are paired back', () => {
  const read = readReceiptText('WARUNG BAKSO\nBakso Urat\nEs Teh\nSubtotal\nTotal\n30.000\n6.000\n36.000\n36.000');
  assert.deepEqual(read.items.map(i => [i.name, i.total]), [['Bakso Urat', 30000], ['Es Teh', 6000]]);
  assert.equal(read.total, 36000); assert.ok(checkReceipt(read).matches);
});

test('a minimarket receipt: PPN already inside the prices, DPP ignored', () => {
  const read = readReceiptText(`lNDOMARET
JL. RAYA BOGOR KM 30
21.09.26 18:05 2.3.42
INDOMIE GRG SPC 2 3.100 6.200
AQUA 600ML 1 3.500 3.500
SUSU UHT 25.000 x 2 50.000
TOTAL ITEM 4
HARGA JUAL : 59.700
TOTAL : 59.700
TUNAI : 100.000
KEMBALIAN : 40.300
PPN : 5.916
DPP : 53.784`);
  assert.equal(read.merchant, 'Indomaret');
  assert.equal(read.date, '2026-09-21');
  assert.deepEqual(read.items.map(i => [i.qty, i.price]), [[2, 3100], [1, 3500], [2, 25000]]);
  const check = checkReceipt(read);
  assert.equal(check.total, 59700); assert.ok(check.matches); assert.equal(check.confidence, 'tinggi');
  assert.match(check.notes[0], /pajak sudah termasuk/);
});

test('more date shapes and noisy amounts', () => {
  assert.equal(readReceiptText('Sep 21, 2026').date, '2026-09-21');
  assert.equal(readReceiptText('21-Sep-26 10:00').date, '2026-09-21');
  const read = readReceiptText('Nasi Uduk 12. 000\nTeh (2.000)\nKerupuk 3.000 T\nTOTAL 13.000');
  assert.deepEqual(read.items.map(i => i.total), [12000, 3000]);
  assert.equal(read.discount, 2000); assert.ok(checkReceipt(read).matches);
});

import { rowsFromWords, slopeOf } from '../lib/receipt-rows.ts';
test('rows are rebuilt from word positions, even on a tilted photo', () => {
  // A 3° tilt: the price column sits lower than its name; the OCR's own lines would split them.
  const tilt = Math.tan(3 * Math.PI / 180);
  const word = (text, x, y) => ({ text, x0: x, x1: x + text.length * 14, y0: y + x * tilt, y1: y + x * tilt + 26, confidence: 90 });
  const words = [word('NASI', 40, 100), word('GORENG', 110, 100), word('50.000', 700, 100), word('ES', 40, 150), word('TEH', 80, 150), word('12.000', 700, 150), word('TOTAL', 40, 200), word('62.000', 700, 200)];
  const slope = slopeOf([{ x0: 0, y0: 0, x1: 800, y1: 800 * tilt }]);
  assert.equal(rowsFromWords(words, slope), 'NASI GORENG   50.000\nES TEH   12.000\nTOTAL   62.000');
  const read = readReceiptText(rowsFromWords(words, slope));
  assert.equal(read.total, 62000); assert.equal(read.items.length, 2);
});

test('a misread service or tax is repaired from its printed percentage, only when everything then adds up', () => {
  const read = readReceiptText('RM SEDERHANA\nRendang 28.000\nAyam Pop 24.000\nNasi 2 x 6.000 12.000\nGulai 10.000\nEs Jeruk 3 x 9.000 27.000\nTeh 4.000\nSUBTOTAL 105.000\nSERVICE 5% 259\nPB1 10% 11.025\nGRAND TOTAL 121.275');
  assert.equal(read.service, 5250);
  const check = checkReceipt(read);
  assert.ok(check.matches); assert.match(check.notes.join(' '), /Service terbaca Rp259, dibetulkan jadi Rp5\.250/);
  // A percentage that does not explain the difference changes nothing.
  const other = readReceiptText('Kopi 20.000\nSERVICE 5% 259\nTOTAL 30.000');
  assert.equal(other.service, 259); assert.equal(other.fixes, undefined);
});

test('one or two misread prices are corrected only when that makes the items add up exactly', () => {
  const read = readReceiptText('INDOMARET\nINDOMIE GRG SPC 2 3.100 5.200\nAQUA MNRL 600ML 1 3.500 3.500\nSUSU UHT COKLAT 3 6.920 20.760\nROTI TAWAR 1 16.500 16.500\nSABUN 2 4.250 8.500\nHARGA JUAL : 55.400\nTOTAL : 55.400');
  assert.deepEqual(read.items.map(i => i.total), [6200, 3500, 20700, 16500, 8500]);
  assert.equal(read.items[0].price, 3100);
  assert.equal(read.fixes.length, 2);
  assert.ok(checkReceipt(read).matches);
  // Nothing is guessed when several corrections would fit.
  const unsure = readReceiptText('Kopi 10.000\nTeh 10.000\nTOTAL 26.000');
  assert.deepEqual(unsure.items.map(i => i.total), [10000, 10000]);
});

test('three misread line totals are corrected from their own quantity × unit price', () => {
  const read = readReceiptText('TT aan\nINDOMARET\nINDOMIE GRG SPC 2 3.100 6.200\nAQUA 1 3.500 3.500\nSUSU UHT COKLAT 3 6.900 20.760\nROTI TAWAR SARI 1 16.500 16.5600\nSABUN LIFEBUOY 2 4.250 8.560\nHARGA JUAL : 55.400\nTOTAL : 55.400');
  assert.equal(read.merchant, 'Indomaret');
  assert.deepEqual(read.items.map(i => i.total), [6200, 3500, 20700, 16500, 8500]);
  assert.ok(checkReceipt(read).matches);
  assert.equal(readReceiptText('TT aan\nWARUNG BAROKAH\nKopi 5.000').merchant, 'WARUNG BAROKAH');
});
