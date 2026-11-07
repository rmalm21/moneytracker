import test from 'node:test';
import assert from 'node:assert/strict';
import { chatReply } from '../lib/chat/engine.ts';
import { v3Ctx } from '../bench/v83/state.mjs';

// 8.6 — the chat reaches the new features: the Rekap, "kenapa minggu ini boros?", and a kasbon whose direction is not said.
const ctx = { ...v3Ctx, voice: 'santai' };
async function talk(...turns) { let memory = {}, r; for (const say of turns) { r = await chatReply(say, memory, ctx); memory = r.memory; } return r; }
const card = r => r.reply.kind === 'plan' ? ctx.inspect(r.reply.text) : null;

test('8.6 "rekap …" opens the Rekap for that month or year (the bench day is 15 Oktober 2026)', async () => {
  for (const [say, view] of [['rekap bulan lalu', 'rekap:2026-09'], ['rekap oktober', 'rekap:2026-10'], ['rekap bulan ini dong', 'rekap:2026-10'], ['rekap tahun ini', 'rekap:2026'], ['wrapped tahun lalu', 'rekap:2025'], ['rekap desember', 'rekap:2025-12'], ['kilas balik agustus 2026', 'rekap:2026-08']]) {
    const r = await talk(say);
    assert.equal(r.reply.kind, 'say', say);
    assert.equal(r.reply.open?.view, view, say);
  }
  // "ringkasan bulan lalu" stays the summary it was.
  assert.notEqual((await talk('ringkasan bulan lalu')).reply.open?.view?.startsWith('rekap'), true);
});

test('8.6 "kenapa minggu ini boros?" compares the last 7 days with the weeks before', async () => {
  for (const say of ['kenapa minggu ini boros', 'minggu ini aku boros di mana', 'pengeluaran minggu ini kok banyak', 'kok minggu ini boros banget ya']) {
    const r = await talk(say);
    assert.equal(r.reply.kind, 'say', say);
    assert.equal(r.reply.hero?.label, '7 hari terakhir', say);
    assert.match(r.reply.text, /7 hari terakhir|minggu ini/i, say);
  }
  // With more spending this week, what went up is named.
  const busy = { ...ctx, data: { ...ctx.data, transactions: [...ctx.data.transactions, ...[0, 1, 2].map(i => ({ id: `x${i}`, type: 'expense', amount: 900_000, date: `2026-10-1${3 + i}`, walletId: 'jago', destinationWalletId: null, categoryId: 'expense.belanja', subcategoryId: null, merchant: 'Tokopedia', description: 'belanja', notes: '', tags: [], splits: [] }))] } };
  const r = await chatReply('kenapa minggu ini boros?', {}, busy);
  assert.match(r.reply.text, /Paling naik: [^.]*Belanja/);
});

test('8.6 "kasbon pak rt 300rb" asks who took it; the answer makes the right card', async () => {
  const ask = await talk('kasbon pak rt 300rb');
  assert.equal(ask.intent, 'clarify');
  assert.deepEqual(ask.reply.chips, ['pak rt kasbon 300rb', 'aku kasbon ke pak rt 300rb']);
  for (const [answer, kind] of [['aku', 'debt_new'], ['gue yang kasbon', 'debt_new'], ['pak rt yang kasbon', 'receivable_new'], ['dia', 'receivable_new'], ['pak rt kasbon 300rb', 'receivable_new'], ['aku kasbon ke pak rt 300rb', 'debt_new']]) {
    const c = card(await talk('kasbon pak rt 300rb', answer));
    assert.equal(c?.kind, kind, answer); assert.equal(c.total, 300_000, answer); assert.match(String(c.person), /Pak RT/, answer);
  }
  // Said with a direction: no question.
  for (const say of ['pak rt kasbon 300rb', 'aku kasbon ke pak rt 300rb', 'kasbon 200rb ke bang ojan']) assert.equal((await talk(say)).reply.kind, 'plan', say);
});

test('8.6 the bench knows the chat records too: "dimas bayar 250rb" is a receivable payment', async () => {
  const c = card(await talk('dimas bayar 250rb'));
  assert.equal(c.kind, 'receivable_payment'); assert.equal(c.total, 250_000);
});
