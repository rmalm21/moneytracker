import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAmount, maskAmounts } from '../lib/privacy.ts';

test('every amount format is hidden, the sign and the words around it stay', () => {
  assert.equal(maskAmounts('Rp12.000'), 'Rp•••••');
  assert.equal(maskAmounts('-Rp1.208.000'), '-Rp•••••');
  assert.equal(maskAmounts('Sisa Rp400.000 sampai 24 Okt'), 'Sisa Rp••••• sampai 24 Okt');
  assert.equal(maskAmounts('Rp1,3 jt direncanakan'), 'Rp••••• direncanakan');
  assert.equal(maskAmounts('±Rp33 rb/hari'), '±Rp•••••/hari');
  assert.equal(maskAmounts('Naik +Rp4.800.000/bulan'), 'Naik +Rp•••••/bulan');
  assert.equal(maskAmounts('Rp2,5 M'), 'Rp•••••');
  assert.equal(maskAmounts('Masuk Rp0 · Keluar Rp85.000'), 'Masuk Rp••••• · Keluar Rp•••••');
});
test('a word after an amount is not swallowed, other numbers are left alone', () => {
  assert.equal(maskAmounts('Rp12.000 Makan malam'), 'Rp••••• Makan malam');
  assert.equal(maskAmounts('Rp50.000 Transfer'), 'Rp••••• Transfer');
  for (const text of ['Hari ke-2 dari 30', '70% terpakai', '25 Sep 2026 – 24 Okt 2026', '9 transaksi', 'Rp']) { assert.equal(hasAmount(text), false); assert.equal(maskAmounts(text), text); }
});

import { categoryBreakdown, DEBT_GROUP } from '../lib/category-analytics.ts';
import { incomeBreakdown, RECEIVABLE_GROUP } from '../lib/insights.ts';
import { summarizeTransactions } from '../lib/period.ts';
test('debt and receivable payments land in categories, or in their own group without one', () => {
  const base = { walletId: 'a', date: '2026-09-25', splits: [] };
  const cats = [{ id: 'cicilan', name: 'Cicilan', type: 'expense' }, { id: 'lain', name: 'Pemasukan lain', type: 'income' }];
  const items = [
    { ...base, id: '1', type: 'debt_payment', amount: 500_000, categoryId: 'cicilan' },
    { ...base, id: '2', type: 'debt_payment', amount: 100_000, categoryId: null },
    { ...base, id: '3', type: 'receivable_payment', amount: 200_000, categoryId: 'lain' },
    { ...base, id: '4', type: 'receivable_payment', amount: 50_000, categoryId: null },
    { ...base, id: '5', type: 'income', amount: 1_000_000, categoryId: null },
  ];
  assert.deepEqual(categoryBreakdown(items, cats).map(r => [r.id, r.amount]), [['cicilan', 500_000], [DEBT_GROUP.id, 100_000]]);
  assert.deepEqual(incomeBreakdown(items, cats).map(r => [r.id, r.amount]), [['none', 1_000_000], ['lain', 200_000], [RECEIVABLE_GROUP.id, 50_000]]);
  assert.deepEqual(summarizeTransactions(items), { income: 1_250_000, expense: 600_000, cashFlow: 650_000 });
});
