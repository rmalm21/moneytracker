import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickPlanV3 } from '../lib/catat/v3.ts';
import { analyzeSemantics } from '../lib/catat/nlp-engine.ts';
import { normalizeGeneral } from '../lib/catat/language.ts';
import { ctx } from '../bench/quick/fixtures-v35state.mjs';

// Catat otomatis — 6.0 preparation (Bahasa umum 2.0 and the retrained NLP.js model). Sentences of their own, not taken
// from the benchmark sets. State: Thu 15 Oct 2026.
const one = async text => { const p = await parseQuickPlanV3(text, ctx); assert.equal(p.actions.length, 1, `${text}: ${p.actions.length} aksi`); return p.actions[0].result; };
const low = s => (s || '').toLocaleLowerCase('id-ID');

test('"salah / nggak / no" before a new amount takes the old amount back (one entry)', async () => {
  assert.equal((await one('kopi 30rb, salah, 28rb')).amount, 28000);
  assert.equal((await one('galon 2jt? nggak, galon 20rb')).amount, 20000);
  const r = await one('token listrik 1jt? no, token listrik 100rb');
  assert.equal(r.amount, 100000);
  assert.equal(low(r.preset.description), 'token listrik');
  // Without the comma it is not a correction.
  assert.equal((await one('parkir 5rb ga pake karcis')).amount, 5000);
});

test('regional and English verbs, but a shop named like a verb stays a shop', async () => {
  const roti = await one('tuku roti 10rb');
  assert.equal(low(roti.preset.description), 'roti');
  const shop = await one('es kopi 30rb di tuku');
  assert.ok(/tuku/.test(low(`${shop.preset.merchant} ${shop.preset.description}`)), 'Tuku tetap nama tempat');
  assert.equal((await one('bakso 25rb go pay')).preset.walletId, 'gopay');
  assert.equal(normalizeGeneral('bought snacks 20k', ctx).text, 'beli snack 20k');
});

test('leftovers around an amount, payment words and "semalam"', async () => {
  const kaos = await one('beli kaos Rp 85.000,-');
  assert.equal(kaos.amount, 85000);
  assert.ok(!/,-/.test(kaos.preset.description || ''));
  const card = await one('makan 40rb pake kartu debit mandiri');
  assert.equal(card.preset.walletId, 'mandiri');
  assert.equal(low(card.preset.description), 'makan');
  assert.equal((await one('semalam beli sate 30rb')).date, '2026-10-14');
  assert.equal((await one('nginep villa semalam 600rb')).date, '2026-10-15');
});

test('a friend paying back by transfer is a receivable payment with the person', async () => {
  const r = await one('dina tf balik 50rb ke jago');
  assert.equal(r.kind, 'receivable_payment');
  assert.equal(r.preset.walletId, 'jago');
  assert.equal(low(r.person), 'dina');
});

test('NLP.js tells who owes whom for a person the records know', async () => {
  const top = async t => (await analyzeSemantics(t, ctx)).intentCandidates[0]?.intent;
  assert.equal(await top('atuy ngutang 15rb'), 'receivable_creation');
  assert.equal(await top('ngutang ke rudi 50rb'), 'debt_creation');
  assert.equal(await top('sinta balikin 40rb'), 'receivable_payment');
});
