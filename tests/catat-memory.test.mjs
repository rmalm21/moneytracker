import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseQuickPlanV3 } from '../lib/catat/v3.ts';
import { placeMemory, recallPlace, habitOf } from '../lib/catat/context-memory.ts';
import { ctx as base } from '../bench/quick/fixtures-v35state.mjs';

// The account's own history: what it recorded before is the memory.
const past = (merchant, description, categoryId, subcategoryId, n = 1, date = '2026-10-10', walletId = 'krom') => Array.from({ length: n }, () => ({ type: 'expense', merchant, description, categoryId, subcategoryId, date, walletId }));
const history = [...base.history,
  ...past('Dopamine Avenue', 'Kopi', 'food', 'drink', 3),
  ...past('Kongsi Tiam', 'Nongkrong', 'fun', 'hang', 2),
  ...past('Warung Bu Siti', 'Makan', 'food', null),
  ...past('Kenari Bakery', 'Roti', 'food', null),
  ...past('Kenari Laundry', 'Laundry', 'shop', null),
  ...past('Krom Store', 'Belanja', 'shop', null),
  ...past('Bengkel Jaya Motor', 'Servis', 'trans', null, 1),
];
const ctx = { ...base, history };
const read = (text, c = ctx, personal) => parseQuickPlanV3(text, c, 'auto', personal);
const one = async (text, c, personal) => { const p = await read(text, c, personal); assert.equal(p.actions.length, 1, `${text}: ${p.actions.length} entri`); return p.actions[0]; };
const sub = r => r.preset.subcategoryId || r.preset.categoryId;

test('"kopi dopamine 77k" after "kopi di Dopamine Avenue": the remembered place, without "di"', async () => {
  const a = await one('kopi dopamine 77k');
  assert.equal(a.result.preset.merchant, 'Dopamine Avenue');
  assert.equal(a.result.preset.description, 'Kopi');
  assert.equal(a.result.amount, 77000);
  assert.equal(sub(a.result), 'drink');
  assert.ok(a.evidence.some(e => /“dopamine” dibaca Dopamine Avenue, tempat yang pernah kamu catat \(3 kali\)/.test(e)));
});

test('any order, case and a one-letter typo name the same place', async () => {
  for (const t of ['dopamine kopi 77k', 'krom 77k kopi dopamine', 'KOPI DOPAMINE 77K', 'kopi dopamin 77k', 'kopi di dopamine 77k', 'kopi 77k dopamine avenue']) {
    const a = await one(t);
    assert.equal(a.result.preset.merchant, 'Dopamine Avenue', t);
    assert.equal(a.result.preset.description, 'Kopi', t);
  }
});

test('only the place said: description and category come from the habit there, marked "kemungkinan benar"', async () => {
  const a = await one('dopamine 45k jago');
  assert.equal(a.result.preset.merchant, 'Dopamine Avenue');
  assert.equal(a.result.preset.description, 'Kopi');
  assert.equal(sub(a.result), 'drink');
  assert.equal(a.fields.category.status, 'likely');
  assert.equal(a.result.preset.walletId, 'jago', 'dompet yang disebut, bukan dari kebiasaan');
  assert.ok(a.evidence.some(e => /Di Dopamine Avenue kamu biasanya mencatat keterangan Kopi/.test(e)));
  const n = await one('nongkrong kongsi 60k krom');
  assert.equal(n.result.preset.merchant, 'Kongsi Tiam');
  assert.equal(sub(n.result), 'hang');
});

test('what was said wins over the habit', async () => {
  const a = await one('makan dopamine 50k');
  assert.equal(a.result.preset.merchant, 'Dopamine Avenue');
  assert.equal(a.result.preset.description, 'Makan');
  assert.equal(a.result.preset.categoryId, 'food');
  assert.notEqual(a.result.preset.subcategoryId, 'drink', 'kategori dari kata yang ditulis, bukan kebiasaan tempat');
});

test('never from memory: money, wallet, date; a word naming two places equally is left alone', async () => {
  const a = await one('kenari 20k');
  assert.equal(a.result.preset.merchant || '', '', 'Kenari Bakery dan Kenari Laundry: tidak ditebak');
  const w = await one('belanja krom 50k');
  assert.equal(w.result.preset.walletId, 'krom', '"krom" tetap dompet walau ada Krom Store');
  assert.equal(w.result.preset.merchant || '', '');
  const d = await one('kemarin kopi dopamine 77k');
  assert.equal(d.result.date, '2026-10-14');
});

test('common words are never a place from memory ("warung", "motor", "kopi")', async () => {
  for (const t of ['makan warung 20k', 'servis motor 150k', 'kopi 25k']) {
    const a = await one(t);
    assert.equal(a.result.preset.merchant || '', '', t);
  }
  const siti = await one('makan siti 20k');
  assert.equal(siti.result.preset.merchant, 'Warung Bu Siti');
});

test('debts, transfers and the other engines are untouched', async () => {
  const d = await one('dopamine ngutang 50k');
  assert.equal(d.result.kind, 'receivable_new');
  const t = await one('tf 100k dari jago ke krom');
  assert.equal(t.result.kind, 'transfer');
});

test('personalization off: no memory', async () => {
  const a = await one('kopi dopamine 77k', ctx, { lexicon: { on: false, aliases: {} } });
  assert.equal(a.result.preset.merchant || '', '');
});

test('account isolation: another history has no Dopamine Avenue', async () => {
  const a = await one('kopi dopamine 77k', base);
  assert.equal(a.result.preset.merchant || '', '');
});

test('placeMemory: counts, habits, distinctive words only', () => {
  const m = placeMemory(ctx);
  assert.equal(habitOf('dopamine avenue', m).count, 3);
  assert.equal(habitOf('Dopamine Avenue', m).description.text, 'Kopi');
  assert.equal(recallPlace('dopamine', m).name, 'Dopamine Avenue');
  assert.equal(recallPlace('warung', m), null);
  assert.equal(recallPlace('kenari', m), null);
  assert.equal(recallPlace('siti', m).name, 'Warung Bu Siti');
  assert.equal(placeMemory(ctx), m, 'dibangun sekali per riwayat');
});

test('local only: no network or storage in the memory', () => {
  const src = readFileSync(new URL('../lib/catat/context-memory.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|firebase|gemini|openai|anthropic|localStorage|indexedDB/i);
});
