import test from 'node:test';
import assert from 'node:assert/strict';
import { chatReply } from '../lib/chat/engine.ts';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { statsCtx } from '../bench/v81/state.mjs';

// 8.2 — every menu answered from its data, and the questions 8.1 got wrong.
const ctx = { ...statsCtx, data: { ...statsCtx.data,
  drafts: [{ id: 'dr1', recurringId: 'rc1', plannedDate: '2026-10-16', type: 'expense', amount: 65000, walletId: 'jago', destinationWalletId: null, categoryId: null, name: 'Netflix', status: 'pending' }],
  plannedTransactions: [{ id: 'p1', title: 'Servis motor', type: 'expense', amount: 250000, date: '2026-10-19', walletId: 'jago', categoryId: null, subcategoryId: null, notes: '', committed: false, status: 'planned' }],
  receivables: [...statsCtx.data.receivables, { id: 'r3', splitBillId: 'sb1', person: 'Ferdi', description: 'Hokben', originalAmount: 81001, remainingAmount: 81001, sourceWalletId: 'jago', date: '2026-10-10', dueDate: '', status: 'open' }],
  funds: [...statsCtx.data.funds, { id: 'f2', kind: 'emergency', name: 'Dana darurat', targetAmount: 10000000, currentAmount: 2500000, monthlyContribution: 0, targetDate: '', linkedWalletId: '', notes: '' }],
} };
const ask = async (text, memory = {}) => chatReply(text, memory, { ...ctx, voice: 'santai' });
const said = r => r.reply.kind === 'say' ? `${r.reply.text} ${(r.reply.lines || []).map(l => `${l.label} ${l.value}`).join(' ')}` : r.reply.text;

test('8.2 "terakhir makan apa" dan sejenisnya: catatan terakhir jenis itu', async () => {
  assert.match(said(await ask('terakhir makan apa')), /Makan Siang.*Warteg Bahari.*Rp35\.000/);
  assert.match(said(await ask('terakhir ngopi di mana')), /Kopi Kenangan/);
  assert.match(said(await ask('transaksi terakhir apa')), /Rp35\.000/);
  const period = await ask('pengeluaran 7 hari terakhir berapa');
  assert.equal(period.reply.kind, 'plan');
});

test('8.2 menu yang dijawab dari datanya, dengan tombol', async () => {
  const cases = [['tagihan minggu depan apa aja', 'upcoming', /Servis motor/], ['kategori aku apa aja', 'categories', /kategori pengeluaran/], ['ada draf yang perlu dikonfirmasi?', 'inbox', /Netflix/],
    ['split bill yang belum lunas', 'splitbill', /Ferdi/], ['total utang piutang', 'owedReport', /Utangmu Rp1\.800\.000/], ['kekayaan bersih aku berapa', 'wallets', /Kekayaan bersih/], ['dana darurat aku cukup berapa bulan', 'funds', /bulan/]];
  for (const [text, view, pattern] of cases) { const r = await ask(text); assert.equal(r.reply.open?.view, view, text); assert.match(said(r), pattern, text); }
  for (const [text, view] of [['perkiraan uang akhir bulan', 'forecast'], ['insight bulan ini apa', 'advisor'], ['laporan bulan ini', 'report']]) assert.equal((await ask(text)).reply.open?.view, view, text);
  assert.match(said(await ask('transaksi kemarin apa aja')), /2 transaksi/);
});

test('8.2 perintah dan pertanyaan lama tidak ikut tertangkap', async () => {
  assert.equal((await ask('stop langganan spotify bulan depan')).reply.kind, 'plan');
  const income = parseQuickPlan('pemasukan bulan lalu berapa', ctx.quick).actions[0].result.operation.query.answer;
  assert.match(income, /Pemasukanmu bulan lalu Rp8\.500\.000/);
  assert.equal(parseQuickPlan('kopi 30rb, masukin hiburan aja', ctx.quick).actions[0].result.preset.categoryId, 'expense.nongkrong-hiburan');
});

test('8.2 topik berganti: saran setelah permainan tidak menempel', async () => {
  const game = await ask('suit yuk');
  const next = await ask('cara bikin anggaran', game.memory);
  assert.equal(next.memory.topic, 'howto');
});
