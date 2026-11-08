import test from 'node:test';
import assert from 'node:assert/strict';
import { placeCategory, categoryByNames } from '../lib/import/places.ts';
import { planImport } from '../lib/import/statement.ts';
import { finalize, missing } from '../lib/import/edit.ts';

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
