import test from 'node:test';
import assert from 'node:assert/strict';
import { chatReply } from '../lib/chat/engine.ts';
import { v3Ctx } from '../bench/v83/state.mjs';
import { walletAllows } from '../lib/wallet-capabilities.ts';
import { moneyOut, transactionExpense } from '../lib/accounting.ts';

// 8.3.3 — fixes from the person's own use.
test('8.3.3 a wallet that can pay is usable for paying, whether or not it counts in Uang bebas', () => {
  const wallet = { id: 'jago', name: 'GoPay / Jago', isArchived: false, isSpendable: false, isReserved: false, canPay: true };
  assert.equal(walletAllows(wallet, 'pay'), true);
  assert.equal(walletAllows({ ...wallet, canPay: false }, 'pay'), false);
  assert.equal(walletAllows({ ...wallet, isArchived: true }, 'pay'), false);
});
test('8.3.3 paying back a Split Bill share is not money out again in the Transaksi totals', () => {
  const share = { id: 's', type: 'expense', amount: 58853, walletId: '', splitBillId: 'b1', categoryId: 'food', date: '2026-10-31' };
  const payBack = { id: 'p', type: 'debt_payment', amount: 58853, walletId: 'gopay', splitBillId: 'b1', debtId: 'd1', date: '2026-11-01' };
  const plainDebt = { ...payBack, id: 'q', splitBillId: null };
  assert.equal(moneyOut(share) + moneyOut(payBack), 58853);
  assert.equal(transactionExpense(share) + transactionExpense(payBack), 58853);
  assert.equal(moneyOut(plainDebt), 58853);
});
test('8.3.3 chat: "adjust ke 564.800" right after a wallet balance updates that wallet', async () => {
  const ctx = { ...v3Ctx, voice: 'barbar' };
  for (const [question, follow, expected] of [['saldo mandiri brp', 'adjust ke 564.800', 'saldo Mandiri sekarang Rp564.800'], ['saldo gopay berapa', 'sesuaikan saldonya jadi 250rb', 'saldo GoPay sekarang 250rb'], ['isi jago berapa', 'jadiin 1,2jt', 'saldo Jago sekarang 1,2jt']]) {
    const first = await chatReply(question, {}, ctx), next = await chatReply(follow, first.memory, ctx);
    assert.equal(next.reply.kind, 'plan', follow);
    assert.equal(next.reply.text, expected);
    assert.equal(ctx.inspect(next.reply.text).kind, 'balance', expected);
  }
  // Not after a question about one wallet: left as it was.
  for (const question of ['pengeluaran bulan ini berapa', 'saldo semua dompet berapa']) {
    const first = await chatReply(question, {}, ctx), next = await chatReply('adjust ke 500rb', first.memory, ctx);
    assert.ok(!(next.reply.kind === 'plan' && /^saldo /.test(next.reply.text)), question);
  }
});
