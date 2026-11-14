import test from 'node:test';
import assert from 'node:assert/strict';
import { editDistance, nearestWallet, repairWallets, tagTokens, tokens, useTagger, walletWords } from '../lib/catat/tagger.ts';
import { TAGGER } from '../lib/catat/tagger-model.ts';
import { fuzzyCategory } from '../lib/category-resolve.ts';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { assertClean, makeCorpus } from '../scripts/tagger-corpus.mjs';

const WALLETS = ['Jago', 'GoPay', 'Jenius', 'Mandiri', 'BRI', 'Krom', 'Cash'];

test('edit distance counts a swap of two letters as one slip', () => {
  assert.equal(editDistance('jenuis', 'jenius'), 1);
  assert.equal(editDistance('mandri', 'mandiri'), 1);
  assert.equal(editDistance('kopi', 'kopi'), 0);
  assert.equal(nearestWallet('gopey', walletWords(WALLETS)).name, 'GoPay');
});

test('the tagger marks the parts of a money sentence', () => {
  const tags = tagTokens(TAGGER, tokens('transfer 200rb dari jago ke gopay'), WALLETS).map(t => t.tag);
  assert.deepEqual(tags, ['O', 'AMT', 'O', 'WAL', 'O', 'WTO']);
  const spend = tagTokens(TAGGER, tokens('beli nasi goreng 25rb pake jenius'), WALLETS).map(t => t.tag);
  assert.deepEqual(spend, ['O', 'ITEM', 'ITEM', 'AMT', 'O', 'WAL']);
});

test('a wallet typed wrong is written right, where a wallet goes', () => {
  for (const [typed, want] of [['ayam geprek 25rb jenisu', 'ayam geprek 25rb jenius'], ['bayar wifi 300rb dari jgao', 'bayar wifi 300rb dari jago'], ['isi bensin 40rb cahs', 'isi bensin 40rb cash'], ['beli pulsa 25rb lewat manidri', 'beli pulsa 25rb lewat mandiri']]) {
    assert.equal(repairWallets(typed, WALLETS, TAGGER).text, want, typed);
  }
});

test('words that only look like a wallet stay what they are', () => {
  for (const s of ['es krim 15rb', 'sabun mandi 12rb', 'jagung 5rb', 'mandor 50rb', 'beri makan kucing 20rb', 'krupuk 5rb', 'jamu kunyit 8rb', 'nasi jagung 12rb', 'casan hp 50rb']) {
    assert.equal(repairWallets(s, WALLETS, TAGGER).fixed.length, 0, s);
  }
});

test('without the weights (not loaded yet) nothing is changed', () => {
  assert.equal(repairWallets('nasgor 18rb mandri', WALLETS, null).text, 'nasgor 18rb mandri');
});

test('Catat otomatis reads the wallet typed wrong once the pembaca kalimat is in', () => {
  const ctx = { wallets: WALLETS.map(n => ({ id: n.toLowerCase(), name: n, isArchived: false })), categories: [], history: [], today: '2026-11-14' };
  useTagger(null);
  assert.equal(parseQuickPlan('kopi 20rb jagoo', ctx).actions[0].result.preset.walletId || '', '');
  useTagger(TAGGER);
  const r = parseQuickPlan('kopi 20rb jagoo', ctx).actions[0].result;
  assert.equal(r.preset.walletId, 'jago');
  assert.ok(!/jagoo/i.test(r.preset.description || ''));
  useTagger(null);
});

test('a category named with a slip, only when one is clearly closest', () => {
  const cats = [
    { id: 'tr', name: 'Transportasi', type: 'expense', parentId: null }, { id: 'tk', name: 'Transport Kerja', type: 'expense', parentId: 'kerja' }, { id: 'kerja', name: 'Kerja', type: 'expense', parentId: null },
    { id: 'rb', name: 'Reimbursement', type: 'income', parentId: null }, { id: 'rbt', name: 'Transport', type: 'income', parentId: 'rb' },
    { id: 'mm', name: 'Makan & Minum', type: 'expense', parentId: null }, { id: 'jj', name: 'Jajan', type: 'expense', parentId: 'mm' },
  ];
  assert.equal(fuzzyCategory('transprot', cats, 'expense')?.name, 'Transportasi');
  assert.equal(fuzzyCategory('transprot', cats, 'income')?.name, 'Transport');
  assert.equal(fuzzyCategory('jajann', cats, 'expense')?.subcategoryId, 'jj');
  assert.equal(fuzzyCategory('kopi', cats, 'expense'), null);
});

test('the tagger corpus uses none of the held-out words (and the check does catch one)', () => {
  const { sentences } = makeCorpus(3, 500);
  assert.doesNotThrow(() => assertClean(sentences));
  assert.throws(() => assertClean([{ account: ['GoPay'], tokens: [['kopi', 'ITEM'], ['gopai', 'WAL']] }]), /tersembunyi/);
});
