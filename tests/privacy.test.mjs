import test from 'node:test';
import assert from 'node:assert/strict';
import { firstMoneyWord, hasAmount, hasMoneyWord, maskAmounts, maskImportantAmounts } from '../lib/privacy.ts';

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
test('the punctuation after an amount stays (8.3)', () => {
  assert.equal(maskAmounts('Uang bebasmu Rp7.200.000. Pengeluaran Rp7.732.500, dari 63 transaksi.'), 'Uang bebasmu Rp•••••. Pengeluaran Rp•••••, dari 63 transaksi.');
});
test('"angka penting saja": balances, income, savings and debts are hidden, everyday spending stays (8.3)', () => {
  assert.equal(maskImportantAmounts('Uang bebasmu Rp7.200.000. Pengeluaran bulan ini Rp7.732.500.'), 'Uang bebasmu Rp•••••. Pengeluaran bulan ini Rp7.732.500.');
  assert.equal(maskImportantAmounts('Saldo semua dompet Rp24 jt: BCA Rp6,5 jt, GoPay Rp400 rb'), 'Saldo semua dompet Rp•••••: BCA Rp•••••, GoPay Rp•••••');
  assert.equal(maskImportantAmounts('Pemasukan siklus lalu Rp9.000.000, masih di kisaran biasamu.'), 'Pemasukan siklus lalu Rp•••••, masih di kisaran biasamu.');
  assert.equal(maskImportantAmounts('Sisa utang Rp6.000.000 dari Rp12.000.000'), 'Sisa utang Rp••••• dari Rp•••••');
  for (const text of ['Makan Rp45.000, sisa anggaran Rp198 rb', 'Aman ±Rp15 rb/hari', 'Total belanja lebih cepat Rp2,5 jt dari biasanya']) assert.equal(maskImportantAmounts(text), text);
  // An amount in its own element reads the label shown before it in the card
  assert.equal(maskImportantAmounts('Rp7.200.000', 'UANG BEBAS'), 'Rp•••••');
  assert.equal(maskImportantAmounts('Rp198.500', 'Sisa Anggaran'), 'Rp198.500');
  assert.equal(maskImportantAmounts('naik dibanding periode lalu (Rp5.932.500)', 'Uang Bebas Rp•••••'), 'naik dibanding periode lalu (Rp•••••)');
  assert.equal(maskImportantAmounts('+Rp9 jt', 'Uang masuk Gaji'), '+Rp•••••');
  assert.equal(hasMoneyWord('Pengeluaranmu bulan ini'), true);
  assert.equal(hasMoneyWord('GrabFood Pesan Antar GoPay'), false);
  assert.equal(firstMoneyWord('JAWABAN Rp24.200.000 Total saldo di 5 dompet'), 'saldo');
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

