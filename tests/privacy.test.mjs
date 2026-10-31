import test from 'node:test';
import assert from 'node:assert/strict';
import { firstMoneyWord, hasAmount, hasBareAmount, hasMoneyWord, maskAmounts, maskBareAmounts, maskImportantAmounts } from '../lib/privacy.ts';

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

test('amounts without "Rp" in charts and chat are hidden; times, dates, percentages and counts stay (8.3.1)', () => {
  assert.equal(maskBareAmounts('2,5jt'), '•••••');
  assert.equal(maskBareAmounts('250rb'), '•••••');
  assert.equal(maskBareAmounts('kopi 25rb pakai gopay'), 'kopi ••••• pakai gopay');
  assert.equal(maskBareAmounts('gaji 8.500.000 masuk bca'), 'gaji ••••• masuk bca');
  assert.equal(maskBareAmounts('makan 35k, parkir 2 ribu'), 'makan •••••, parkir •••••');
  assert.equal(maskBareAmounts('−1.250.000'), '•••••');
  for (const text of ['jam 17.40', '24 Okt 2026', '70% terpakai', '9 transaksi', 'tanggal 5', '1.5%', 'Rp•••••', 'Hari ke-2']) { assert.equal(hasBareAmount(text), false, text); assert.equal(maskBareAmounts(text), text); }
  // "Angka penting saja" reads the same words for amounts without "Rp"
  assert.equal(maskImportantAmounts('gaji 8.500.000 masuk bca', '', true), 'gaji ••••• masuk bca');
  assert.equal(maskImportantAmounts('makan siang 35rb pakai gopay', '', true), 'makan siang 35rb pakai gopay');
  assert.equal(maskImportantAmounts('Selisih Rp1.200.000', ''), 'Selisih Rp•••••');
  assert.equal(maskImportantAmounts('Klaim kantor Rp350.000 belum cair', ''), 'Klaim kantor Rp••••• belum cair');
  // No word before it: the words right after it decide, up to a comma
  assert.equal(maskImportantAmounts('Rp2,3 jt klaim kantor belum cair'), 'Rp••••• klaim kantor belum cair');
  assert.equal(maskImportantAmounts('Rp1.000.000 masuk ke BCA'), 'Rp••••• masuk ke BCA');
  assert.equal(maskImportantAmounts('Kopi Rp25.000, saldo GoPay sekarang Rp375.000'), 'Kopi Rp25.000, saldo GoPay sekarang Rp•••••');
  assert.equal(maskImportantAmounts('Rp45.000 Makan malam'), 'Rp45.000 Makan malam');
  assert.equal(maskImportantAmounts('Semua target dengan tenggat butuh Rp7.917.000 per bulan'), 'Semua target dengan tenggat butuh Rp••••• per bulan');
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

