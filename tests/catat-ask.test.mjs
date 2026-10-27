import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickPlanV3 } from '../lib/catat/v3.ts';
import { askMoney, looksLikeQuestion, readPeriod } from '../lib/catat/ask.ts';
import { ctx, spend, count, OCT, WEEK, CYCLE, cat, sub, says } from '../bench/quick/fixtures-v60askstate.mjs';

// Catat otomatis 6.0 — Tanya. The ledger and truth helpers are the benchmark's (Thu 15 Oct 2026, salary cycle 25 Sep – 24 Oct).
const answer = async text => (await parseQuickPlanV3(text, ctx)).actions.find(a => a.result.kind === 'query')?.result.operation?.query;
const kinds = async text => (await parseQuickPlanV3(text, ctx)).actions.map(a => a.result.kind);

test('periods: week from Monday, calendar month, salary cycle, last N days, a named month', () => {
  assert.deepEqual([readPeriod('minggu ini', '2026-10-15').start, readPeriod('minggu ini', '2026-10-15').end], WEEK);
  assert.deepEqual([readPeriod('bulan ini', '2026-10-15').start, readPeriod('bulan ini', '2026-10-15').end], OCT);
  assert.deepEqual([readPeriod('siklus ini', '2026-10-15', 25).start, readPeriod('siklus ini', '2026-10-15', 25).end], CYCLE);
  assert.equal(readPeriod('7 hari terakhir', '2026-10-15').start, '2026-10-09');
  assert.equal(readPeriod('bulan desember', '2026-10-15').start, '2025-12-01');
  assert.equal(readPeriod('kemarin', '2026-10-15').start, '2026-10-14');
});

test('spending by category, by a word of the notes, and nothing borrowed from a wider category', async () => {
  assert.equal((await answer('bensin bulan ini habis berapa')).ask.total, spend(OCT, sub('fuel')));
  assert.equal((await answer('makan siklus ini berapa')).ask.total, spend(CYCLE, cat('food')));
  assert.equal((await answer('jajan bulan ini berapa')).ask.total, spend(OCT, says('jajan')));
  const none = await answer('berapa bayar listrik bulan ini');
  assert.equal(none.ask.total, 0);
  assert.match(none.answer, /belum ada/);
});

test('count, last, budget, balance, compare', async () => {
  assert.equal((await answer('berapa kali parkir minggu ini')).ask.count, count(WEEK, sub('park')));
  assert.equal((await answer('kapan terakhir isi bensin')).ask.date, '2026-10-13');
  assert.equal((await answer('sisa anggaran bensin')).ask.total, 300_000 - spend(CYCLE, sub('fuel')));
  assert.equal((await answer('saldo gopay berapa')).ask.total, 185_000);
  const c = await answer('bulan ini lebih boros dari bulan lalu?');
  assert.equal(c.ask.intent, 'compare');
  assert.equal(c.ask.compare, spend(['2026-09-01', '2026-09-16']));
});

test('every answer opens exactly what it counted in Transaksi', async () => {
  assert.equal((await answer('bensin bulan ini habis berapa')).ask.focus, 'category:fuel@2026-10-01..2026-11-01');
  assert.equal((await answer('jajan bulan ini berapa')).ask.focus, 'search:jajan@2026-10-01..2026-11-01');
  assert.match((await answer('kopi pakai gopay bulan ini berapa')).ask.focus, /^tx:/);
});

test('entries and commands stay what they were', async () => {
  assert.deepEqual(await kinds('beli kopi 25rb'), ['expense']);
  assert.deepEqual(await kinds('saldo jago 1jt'), ['balance']);
  assert.deepEqual(await kinds('budget nongkrong 500rb'), ['budget']);
  assert.deepEqual(await kinds('kategori baru hiburan'), ['category_new']);
  assert.equal((await answer('atuy masih ngutang berapa')).ask.intent, 'owed');
  assert.equal(askMoney('berapa harga emas hari ini', ctx), null);
  assert.equal(looksLikeQuestion('berapa harga emas hari ini'), true);
  assert.equal(looksLikeQuestion('makan 30rb?'), false);
});

test('no ledger, no answer: without the records nothing is made up', () => {
  assert.equal(askMoney('berapa pengeluaranku bulan ini', { ...ctx, ask: undefined }), null);
});
