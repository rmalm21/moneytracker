import test from 'node:test';
import assert from 'node:assert/strict';
import { moneyGroup, moneyIn, moneyOut } from '../lib/accounting.ts';

const tx = (type, amount, extra = {}) => ({ id: type, type, amount, date: '2026-09-27', walletId: 'w', ...extra });

test('Transaksi: bayar utang is money out; piutang kembali, uang pinjaman and klaim cair are money in', () => {
  assert.equal(moneyGroup('debt_payment'), 'out');
  assert.equal(moneyGroup('receivable_issue'), 'out');
  assert.equal(moneyGroup('claim_advance'), 'out');
  assert.equal(moneyGroup('borrowing'), 'in');
  assert.equal(moneyGroup('receivable_payment'), 'in');
  assert.equal(moneyGroup('claim_payment'), 'in');
  assert.equal(moneyGroup('transfer'), 'move');
  assert.equal(moneyGroup('adjustment'), 'other');
  const list = [tx('expense', 50_000), tx('debt_payment', 500_000), tx('income', 8_000_000), tx('borrowing', 1_000_000), tx('receivable_payment', 100_000), tx('transfer', 200_000, { transferFee: 2_500 }), tx('adjustment', 10_000)];
  assert.equal(list.reduce((n, t) => n + moneyIn(t), 0), 9_100_000);
  assert.equal(list.reduce((n, t) => n + moneyOut(t), 0), 552_500);
});
