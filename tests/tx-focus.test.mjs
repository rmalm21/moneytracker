import test from 'node:test';
import assert from 'node:assert/strict';
import { focusTitle, matchesFocus, readFocus } from '../lib/tx-focus.ts';

const CATS = [
  { id: 'mm', name: 'Makan & Minum', type: 'expense', parentId: null },
  { id: 'kopi', name: 'Kopi', type: 'expense', parentId: 'mm' },
  { id: 'tg', name: 'Tagihan', type: 'expense', parentId: null },
  { id: 'listrik', name: 'Listrik', type: 'expense', parentId: 'tg' },
  { id: 'gaji', name: 'Gaji', type: 'income', parentId: null },
];
const WALLETS = [{ id: 'bca', name: 'BCA' }, { id: 'gopay', name: 'GoPay' }];
const tx = (id, over) => ({ id, type: 'expense', amount: 10_000, date: '2026-11-12', walletId: 'bca', destinationWalletId: null, categoryId: 'mm', subcategoryId: null, merchant: '', description: '', notes: '', tags: [], ...over });
const LIST = [
  tx('a', { subcategoryId: 'kopi', description: 'Kopi susu' }),
  tx('b', { description: 'Nasi padang' }),
  tx('c', { categoryId: 'tg', subcategoryId: 'listrik', description: 'Token' }),
  tx('d', { categoryId: 'tg', description: 'Wifi' }),
  tx('e', { type: 'income', categoryId: 'gaji', amount: 5_000_000, description: 'Gaji November' }),
  tx('f', { type: 'transfer', categoryId: null, destinationWalletId: 'gopay', description: 'Isi GoPay' }),
  tx('g', { categoryId: null, description: 'Lain-lain' }),
];
const pick = raw => { const f = readFocus(raw, CATS); return LIST.filter(t => matchesFocus(t, { ...f, query: f.search.toLocaleLowerCase('id-ID') }, CATS, WALLETS)).map(t => t.id); };

test('a link is read as a filter and the period it came from', () => {
  assert.deepEqual(readFocus('category:mm@2026-11-12..2026-12-12', CATS), { type: 'expense', walletId: '', categoryId: 'mm', noSub: '', txIds: [], search: '', range: { start: '2026-11-12', end: '2026-12-12' } });
  assert.equal(readFocus('category:gaji', CATS).type, 'income');
  assert.equal(readFocus('nosub:tg', CATS).type, 'expense');
  assert.equal(readFocus('@2026-11-01..2026-12-01', CATS).type, 'all');
  assert.equal(readFocus('@2026-12-01..2026-11-01', CATS).range, undefined);
  assert.deepEqual(readFocus('tx:a,b', CATS).txIds, ['a', 'b']);
  assert.equal(readFocus(undefined, CATS).type, 'all');
});

test('each kind of link shows exactly its transactions', () => {
  assert.deepEqual(pick('category:mm'), ['a', 'b']);
  assert.deepEqual(pick('category:kopi'), ['a']);
  assert.deepEqual(pick('nosub:tg'), ['d']);
  assert.deepEqual(pick('nosub:mm'), ['b']);
  assert.deepEqual(pick('type:income'), ['e']);
  assert.deepEqual(pick('type:transfer'), ['f']);
  assert.deepEqual(pick('wallet:gopay'), ['f']);
  assert.deepEqual(pick('tx:c,e'), ['c', 'e']);
  assert.deepEqual(pick('category:uncategorized'), ['g']);
  assert.deepEqual(pick('search:padang'), ['b']);
  assert.deepEqual(pick('search:listrik'), ['c']);
  assert.equal(pick('').length, LIST.length);
});

test('the list in place says what it shows', () => {
  const title = raw => focusTitle(readFocus(raw, CATS), CATS, WALLETS, t => ({ income: 'Pemasukan', expense: 'Pengeluaran' })[t] || t);
  assert.equal(title('nosub:tg@2026-11-12..2026-12-12'), 'Tagihan · tanpa subkategori');
  assert.equal(title('category:kopi'), 'Kopi');
  assert.equal(title('category:uncategorized'), 'Tanpa kategori');
  assert.equal(title('tx:a'), 'Transaksinya');
  assert.equal(title('tx:a,b,c'), '3 transaksi pilihan');
  assert.equal(title('wallet:gopay'), 'GoPay');
  assert.equal(title('type:income'), 'Pemasukan');
  assert.equal(title('@2026-11-01..2026-12-01'), 'Transaksi');
});
