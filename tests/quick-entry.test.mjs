import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickText } from '../lib/quick-entry.ts';

const ctx = {
  today: '2026-09-26',
  wallets: [{ id: 'bca', name: 'BCA' }, { id: 'gopay', name: 'GoPay' }, { id: 'cash', name: 'Tunai' }, { id: 'jenius', name: 'Jenius' }],
  categories: [
    { id: 'food', name: 'Makan & Minum', type: 'expense' }, { id: 'drink', name: 'Minuman', type: 'expense', parentId: 'food' },
    { id: 'trans', name: 'Transportasi', type: 'expense' }, { id: 'park', name: 'Parkir', type: 'expense', parentId: 'trans' },
    { id: 'shop', name: 'Belanja', type: 'expense' }, { id: 'salary', name: 'Gaji', type: 'income' },
  ],
  history: [],
};
const p = (text, extra = {}) => parseQuickText(text, { ...ctx, ...extra })?.preset;

test('the example sentence: beli pocari 8rb di alfa', () => {
  assert.deepEqual(p('beli pocari 8rb di alfa'), { type: 'expense', amount: 8000, date: '2026-09-26', merchant: 'Alfamart', description: 'Pocari', categoryId: 'food', subcategoryId: null });
});
test('amount formats', () => {
  for (const [text, amount] of [['kopi 25k', 25000], ['bensin Rp 50.000', 50000], ['gaji 7,5jt masuk bca', 7500000], ['makan 1.250.000', 1250000], ['parkir 5000', 5000], ['jajan 2 ribu', 2000]]) assert.equal(p(text).amount, amount, text);
  assert.equal(parseQuickText('beli pocari di alfa', ctx), null);
});
test('income, wallet, date and a category named in the text', () => {
  assert.deepEqual(p('gaji 7,5jt masuk bca'), { type: 'income', amount: 7500000, date: '2026-09-26', walletId: 'bca', description: 'Gaji', categoryId: 'salary', subcategoryId: null });
  const park = p('parkir 5000 kemarin pake tunai');
  assert.deepEqual([park.date, park.walletId, park.categoryId, park.subcategoryId], ['2026-09-25', 'cash', 'trans', 'park']);
  assert.equal(p('makan siang 30rb tgl 28').date, '2026-08-28');
  assert.equal(p('bakso 15rb 3 hari lalu').date, '2026-09-23');
});
test('transfer between two wallets', () => {
  const tf = p('tf 200rb dari bca ke gopay');
  assert.deepEqual([tf.type, tf.amount, tf.walletId, tf.destinationWalletId], ['transfer', 200000, 'bca', 'gopay']);
});
test('earlier transactions teach the category and the full place name', () => {
  const history = [{ type: 'expense', description: 'Sabun', merchant: 'Superindo Kemang', categoryId: 'shop', subcategoryId: null, date: '2026-09-01' }];
  const r = p('sabun 12rb di superindo', { history });
  assert.deepEqual([r.description, r.merchant, r.categoryId], ['Sabun', 'Superindo', 'shop']);
  const r2 = p('beli tisu 9rb di superindo kemang', { history });
  assert.equal(r2.merchant, 'Superindo Kemang');
  // A category the user doesn't have is never invented.
  assert.equal(p('netflix 54rb', { categories: ctx.categories }).categoryId, undefined);
});
