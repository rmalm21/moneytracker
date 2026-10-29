import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickPlanV3 } from '../lib/catat/v3.ts';
import { askMoney, looksLikeQuestion, readPeriod } from '../lib/catat/ask.ts';
import { ctx, spend, count, OCT, SEP, WEEK, CYCLE, cat, sub, says } from '../bench/quick/fixtures-v60askstate.mjs';

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

// 7.4: with the real default categories, "makan" is Makan & Minum (not Travel & Liburan › Makan, which has the same
// name), and a subcategory named by two words ("makan siang") is that subcategory.
test('the default categories: a two-word subcategory, and a word that is also another branch\'s subcategory', async () => {
  const { planTemplateSeed, categoryTemplates } = await import('../lib/category-templates.ts');
  const categories = planTemplateSeed([], categoryTemplates.map(t => t.key)).map(r => ({ id: r.id, ...r.data }));
  const id = name => categories.find(c => c.name === name && c.parentId === 'tpl1_expense_makan_minum')?.id || categories.find(c => c.name === name).id;
  const food = 'tpl1_expense_makan_minum', lunch = id('Makan Siang'), dinner = id('Makan Malam'), coffee = id('Kopi & Minuman');
  const tx = (tid, date, amount, subcategoryId, description) => ({ id: tid, type: 'expense', date, amount, categoryId: food, subcategoryId, description, merchant: '', walletId: 'gopay', destinationWalletId: null });
  const transactions = [tx('a', '2026-10-27', 21_000, lunch, 'Ayam Geprek'), tx('b', '2026-10-29', 22_000, lunch, 'Ayam Geprek'), tx('c', '2026-10-28', 27_000, lunch, 'Nasi Goreng'),
    tx('d', '2026-10-28', 18_000, coffee, 'Kopi Susu'), tx('e', '2026-10-20', 45_000, dinner, 'Sate'), tx('f', '2026-10-21', 30_000, food, 'Makan siang kantin')];
  const budgets = [{ id: 'b0', name: 'Makan & Minum', categoryId: food, subcategoryId: null, amount: 1_900_000, active: true, cycleType: 'salary', classification: 'living' }];
  const c2 = { ...ctx, categories, today: '2026-10-29', salaryDay: 10, budgets, history: [], ask: { transactions, wallets: ctx.ask.wallets, budgets } };
  const ask = async text => (await parseQuickPlanV3(text, c2)).actions.find(a => a.result.kind === 'query')?.result.operation?.query;
  const week = await ask('makan siang minggu ini berapa?');
  assert.equal(week.ask.total, 21_000 + 22_000 + 27_000);
  assert.equal(week.ask.subject, 'Makan Siang');
  // A note that says "makan siang" outside the subcategory still counts.
  assert.equal((await ask('makan siang bulan ini berapa?')).ask.total, 21_000 + 22_000 + 27_000 + 30_000);
  assert.equal((await ask('makan bulan ini habis berapa')).ask.total, 21_000 + 22_000 + 27_000 + 18_000 + 45_000 + 30_000);
  assert.equal((await ask('makan malam bulan ini berapa')).ask.total, 45_000);
  const budget = await ask('sisa anggaran makan berapa?');
  assert.equal(budget.ask.label, 'Makan & Minum');
  assert.match(budget.answer, /^Anggaran Makan & Minum masih sisa/);
});

test('7.4: "pengeluaran bulan agustus" without "berapa" is a question; mayAsk tells when the ledger is worth reading', async () => {
  const { mayAsk } = await import('../lib/catat/ask.ts');
  const a = await answer('pengeluaran bulan september');
  assert.equal(a.ask.intent, 'spend');
  assert.equal(a.ask.total, spend(SEP));
  assert.deepEqual(await kinds('beli kopi 25rb'), ['expense']);
  assert.equal(mayAsk('listrik bulan lalu berapa'), true);
  assert.equal(mayAsk('sisa anggaran makan'), true);
  assert.equal(mayAsk('makan 30rb?'), false);
  assert.equal(mayAsk('kopi susu 18rb di fore'), false);
});
