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
