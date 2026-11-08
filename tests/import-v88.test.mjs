import test from 'node:test';
import assert from 'node:assert/strict';
import { placeCategory, categoryByNames } from '../lib/import/places.ts';
import { planImport, placeKey } from '../lib/import/statement.ts';
import { finalize, missing, keepFor, isTransferRow, isMerchantRow } from '../lib/import/edit.ts';

// 8.8 — what kind of place an imported line names, matched to the person's own category names. Made-up lines.
const cat = (id, name, type = 'expense', parentId = null) => ({ id, name, type, parentId, icon: '', sortOrder: 0, isArchived: false });
const mine = [cat('food', 'Makan'), cat('coffee', 'Kopi', 'expense', 'food'), cat('groc', 'Belanja Dapur', 'expense', 'food'), cat('ride', 'Transport'), cat('ojol', 'Ojol', 'expense', 'ride'),
  cat('bills', 'Tagihan'), cat('net', 'Internet', 'expense', 'bills'), cat('fun', 'Hiburan'), cat('pay', 'Gaji', 'income'), cat('cb', 'Cashback', 'income')];
const name = (hit) => hit && mine.find(c => c.id === (hit.subcategoryId || hit.categoryId)).name;

test('8.8 places go to the person\'s own categories (other names than the starter ones)', () => {
  assert.equal(name(placeCategory('QRIS PAYMENT SBUX GRAND INDONESIA', 'expense', mine)), 'Kopi');
  assert.equal(name(placeCategory('Superindo Bintaro', 'expense', mine)), 'Belanja Dapur');
  assert.equal(name(placeCategory('GoRide', 'expense', mine)), 'Ojol');
  assert.equal(name(placeCategory('IndiHome Telkom', 'expense', mine)), 'Internet');
  assert.equal(name(placeCategory('Cinema XXI Plaza Senayan', 'expense', mine)), 'Hiburan');
  assert.equal(name(placeCategory('Cashback Bonus', 'income', mine)), 'Cashback', 'a cashback bonus is not a work bonus');
  assert.equal(name(placeCategory('Payroll PT Sinar Abadi', 'income', mine)), 'Gaji');
  assert.equal(placeCategory('Toko Sinar Jaya', 'expense', mine), null, 'nothing to go on: no guess');
  assert.equal(placeCategory('Kopi Kenangan', 'income', mine), null, 'money in is not matched with spending places');
  assert.deepEqual(categoryByNames(['kopi & minuman'], 'expense', mine), { categoryId: 'food', subcategoryId: 'coffee' });
});

test('8.8 the person\'s own choice for a brand still comes first', () => {
  const read = { rows: [{ line: 1, date: '2026-10-05', description: 'Kopi Kenangan Senopati', amount: 25000, type: 'expense' }], columns: { date: 'Tanggal', description: ['Keterangan'] }, skipped: 0, unsure: 0 };
  const history = [{ type: 'expense', amount: 22000, date: '2026-09-01', walletId: 'w', destinationWalletId: null, description: 'Kopi Kenangan Ciputat', merchant: '', categoryId: 'fun', subcategoryId: null }];
  const [x] = planImport(read, { walletId: 'w', wallets: [{ id: 'w', name: 'Bank', type: 'bank' }], categories: mine, transactions: history, drafts: [] });
  assert.deepEqual([x.categoryId, x.from], ['fun', 'history']);
  const [y] = planImport(read, { walletId: 'w', wallets: [{ id: 'w', name: 'Bank', type: 'bank' }], categories: mine, transactions: [], drafts: [] });
  assert.deepEqual([y.subcategoryId, y.from], ['coffee', 'place']);
});

test('8.8 a move says which side is still missing', () => {
  const base = { line: 1, date: '2026-10-05', description: 'Top up', amount: 100000, unsure: false, id: 'i', name: 'Top up', categoryId: null, subcategoryId: null };
  const inn = finalize({ ...base, type: 'income', flow: 'transfer', walletId: '', destinationWalletId: 'gopay' }, {}, 'gopay');
  assert.equal(missing(inn), 'Pilih dompet asal');
  const out = finalize({ ...base, type: 'expense', flow: 'transfer', walletId: 'gopay', destinationWalletId: null }, {}, 'gopay');
  assert.equal(missing(out), 'Pilih dompet tujuan');
});

// 8.8 — more ways banks write amounts and dates.
import { parseAmount, readStatement, readStatementSource } from '../lib/import/statement.ts';

test('8.8 "50.000,-" is a round amount, and a mark in brackets gives the direction', () => {
  for (const [raw, value, sign] of [['50.000,-', 50000, 0], ['Rp 1.250.000,-', 1250000, 0], ['-50.000,-', 50000, -1], ['50.000,00 (D)', 50000, -1], ['1.000.000,00 (K)', 1000000, 1], ['75,000.00 (CR)', 75000, 1], ['20.000 (DB)', 20000, -1], ['(10.000)', 10000, -1]]) {
    const a = parseAmount(raw); assert.ok(a, raw); assert.deepEqual([a.value, a.sign], [value, sign], raw);
  }
});

test('8.8 a statement over a year change: dates without a year land in the right year', async () => {
  const csv = 'Periode : 20/12/2025 - 10/01/2026\nTanggal;Keterangan;Mutasi\n28/12;Kopi Kenangan;25.000 DB\n31/12;Tiket Kereta;150.000 DB\n02/01;Gaji Desember;5.000.000 CR\n';
  const read = readStatement((await readStatementSource(new TextEncoder().encode(csv))).table, '2026-01-15');
  assert.deepEqual(read.rows.map(r => r.date), ['2025-12-28', '2025-12-31', '2026-01-02']);
  const named = 'Periode: Desember 2025 - Januari 2026\nTanggal,Keterangan,Jumlah\n30 Des,Parkir,-5000\n03 Jan,Bunga,1200\n';
  const read2 = readStatement((await readStatementSource(new TextEncoder().encode(named))).table, '2026-01-15');
  assert.deepEqual(read2.rows.map(r => r.date), ['2025-12-30', '2026-01-03']);
});

test('8.8 import focus: everything, everything but transfers, or shops and services only', () => {
  const rows = [
    { name: 'Mie Gacoan Bintaro', type: 'expense', flow: 'expense', person: null },
    { name: 'Top up GoPay', type: 'income', flow: 'transfer', person: null },
    { name: 'Transfer ke Dewi Lestari', type: 'expense', flow: 'transfer', person: 'Dewi Lestari' },
    { name: 'Transfer dari Andi Pratama', type: 'income', flow: 'income', person: 'Andi Pratama' },
    { name: 'Biaya transfer', type: 'expense', flow: 'expense', person: null },
    { name: 'Gaji Oktober', type: 'income', flow: 'income', person: null },
    { name: 'Steam', type: 'expense', flow: 'expense', person: null },
  ];
  const names = (focus) => rows.filter(r => keepFor(focus, r)).map(r => r.name);
  assert.equal(names('all').length, 7);
  assert.deepEqual(names('notransfer'), ['Mie Gacoan Bintaro', 'Biaya transfer', 'Gaji Oktober', 'Steam']);
  assert.deepEqual(names('merchant'), ['Mie Gacoan Bintaro', 'Steam']);
  assert.equal(isTransferRow(rows[3]), true, 'a transfer from a person counts as a transfer even before its purpose is picked');
  assert.equal(isMerchantRow(rows[4]), false, 'the bank\'s own fee is not a shop');
  for (const name of ['Pajak', 'Pajak bunga', 'Biaya admin', 'Biaya materai', 'Tarik tunai']) assert.equal(isMerchantRow({ name, type: 'expense', flow: 'expense', person: null }), false, name);
});

test('8.8 the same place in one file, without the branch (a category chosen once follows the others)', () => {
  assert.equal(placeKey('Mie Gacoan Bintaro'), placeKey('Mie Gacoan Ciputat'));
  assert.equal(placeKey('Mie Gacoan Bintaro'), 'mie gacoan');
  assert.notEqual(placeKey('Kopi Kenangan Senopati'), placeKey('Kopi Janji Jiwa'));
  assert.equal(placeKey('Indomaret Ciputat'), placeKey('Indomaret Pamulang'));
  assert.equal(placeKey('KFC Bintaro'), placeKey('KFC Ciputat'));
  assert.equal(placeKey('PT Sumber Rejeki Abadi'), 'sumber');
  for (const n of ['Biaya transfer', 'Top up GoPay', 'Transfer ke Dewi', 'Pajak bunga', 'Tarik tunai']) assert.equal(placeKey(n), '', n);
});
