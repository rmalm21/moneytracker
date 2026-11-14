import test from 'node:test';
import assert from 'node:assert/strict';
import { chatterWords, onlyFiller, readRoles, transferSentence, withoutChatter, withoutWords } from '../lib/catat/roles.ts';
import { TAGGER } from '../lib/catat/tagger-model.ts';
import { useTagger } from '../lib/catat/tagger.ts';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { lacksSub, missingSubs, subsOf, withoutSubs } from '../lib/subcategory-hint.ts';

const WALLETS = ['Jago', 'GoPay', 'Jenius', 'Mandiri', 'BRI', 'Krom', 'Cash'];
const roles = s => readRoles(s, WALLETS, TAGGER);

test('a move between two wallets without a transfer word is read as a transfer', () => {
  assert.equal(transferSentence(roles('mandiri ke bri 14rb'), WALLETS), 'transfer 14rb dari mandiri ke bri');
  assert.equal(transferSentence(roles('oper 50rb dari jago ke gopay'), WALLETS), 'transfer 50rb dari jago ke gopay');
});

test('spending with one wallet, or something bought at a place, is never made a transfer', () => {
  for (const s of ['kopi susu 20rb pake jago', 'beli kopi 20rb dari jago', 'celana 150rb di superindo pake jenius', 'nasi goreng 25rb pake gopay']) {
    assert.equal(transferSentence(roles(s), WALLETS), null, s);
  }
});

test('slang and laughter leave the name; places, people and words said on purpose stay', () => {
  assert.deepEqual([...chatterWords(roles('gan, parkir 33k pake jago'), WALLETS)], ['gan']);
  assert.deepEqual([...chatterWords(roles('martabak 45rb jenius wkwk'), WALLETS)], ['wkwk']);
  for (const s of ['celana 150rb di superindo pake jenius', 'es teh 7rb sama dimas pake cash', 'beli kado 80rb pake jago', 'bayar listrik 300rb dari mandiri']) {
    assert.equal(chatterWords(roles(s), WALLETS).size, 0, s);
  }
  // A word the person used in their own records is theirs, never slang.
  assert.equal(chatterWords(roles('martabak 45rb jenius wkwk'), WALLETS, new Set(['wkwk'])).size, 0);
});

test('taking words out of a sentence and off the edges of a name', () => {
  assert.equal(onlyFiller('Bayarnya'), true);
  assert.equal(onlyFiller(''), true);
  assert.equal(onlyFiller('Parkir'), false);
  assert.equal(onlyFiller('Bayarnya Celana'), false);
  assert.equal(withoutWords('gan, parkir 33k pake jago', new Set(['gan'])), 'parkir 33k pake jago');
  assert.equal(withoutChatter('Celana · Cuy', new Set(['cuy'])), 'Celana ·');
  assert.equal(withoutChatter('Wkwk Martabak Wkwk', new Set(['wkwk'])), 'Martabak');
  assert.equal(withoutChatter('Kopi Gan Susu', new Set(['gan'])), 'Kopi Gan Susu');
  assert.equal(withoutChatter('Kopi', new Set()), 'Kopi');
});

test('Catat otomatis: the transfer and the clean name once the pembaca kalimat is in, nothing changes before', () => {
  const ctx = { wallets: WALLETS.map(n => ({ id: n.toLowerCase(), name: n, isArchived: false, type: 'bank' })), categories: [{ id: 'tr', name: 'Transportasi', type: 'expense', parentId: null, isArchived: false, sortOrder: 0, icon: '' }], history: [], today: '2026-11-14' };
  useTagger(null);
  assert.notEqual(parseQuickPlan('mandiri ke bri 14rb', ctx).actions[0]?.result.kind, 'transfer');
  useTagger(TAGGER);
  try {
    const move = parseQuickPlan('mandiri ke bri 14rb', ctx).actions[0].result;
    assert.equal(move.kind, 'transfer');
    assert.equal(move.preset.walletId, 'mandiri');
    assert.equal(move.preset.destinationWalletId, 'bri');
    assert.equal(move.amount, 14000);
    // The thing stays even where it comes after the wallet and looks like chatter to the tagger.
    for (const [s, item] of [['110ribu bayarnya krom celana', /celana/i], ['6rbu bayarnya cash siomay', /siomay/i], ['110ribu krom celana', /celana/i]]) {
      assert.match(parseQuickPlan(s, ctx).actions[0].result.preset.description || '', item, s);
    }
    const park = parseQuickPlan('gan, parkir 33k pake jago', ctx).actions[0].result;
    assert.equal(park.kind, 'expense');
    assert.equal(park.preset.walletId, 'jago');
    assert.ok(!/gan/i.test(`${park.preset.description} ${park.preset.merchant || ''}`), park.preset.description);
  } finally { useTagger(null); }
});

const CATS = [
  { id: 'mm', name: 'Makan & Minum', type: 'expense', parentId: null, isArchived: false, sortOrder: 0, icon: '🍽️' },
  { id: 'jj', name: 'Jajan', type: 'expense', parentId: 'mm', isArchived: false, sortOrder: 1, icon: '' },
  { id: 'ms', name: 'Makan Siang', type: 'expense', parentId: 'mm', isArchived: false, sortOrder: 0, icon: '' },
  { id: 'old', name: 'Lama', type: 'expense', parentId: 'mm', isArchived: true, sortOrder: 2, icon: '' },
  { id: 'tr', name: 'Transportasi', type: 'expense', parentId: null, isArchived: false, sortOrder: 1, icon: '' },
  { id: 'gj', name: 'Gaji', type: 'income', parentId: null, isArchived: false, sortOrder: 0, icon: '' },
  { id: 'gp', name: 'Gaji Pokok', type: 'income', parentId: 'gj', isArchived: false, sortOrder: 0, icon: '' },
];
const tx = (id, over) => ({ id, type: 'expense', amount: 10_000, date: '2026-11-10', walletId: 'jago', destinationWalletId: null, categoryId: 'mm', subcategoryId: null, merchant: '', description: '', notes: '', tags: [], ...over });

test('a main category with subcategories and none chosen offers them, most used first (archived ones never)', () => {
  const history = [tx('a', { subcategoryId: 'jj' }), tx('b', { subcategoryId: 'jj' }), tx('c', { subcategoryId: 'ms' })];
  assert.deepEqual(missingSubs(CATS, history, 'mm', null).map(c => c.id), ['jj', 'ms']);
  assert.deepEqual(missingSubs(CATS, [], 'mm', null).map(c => c.id), ['ms', 'jj']);
  assert.deepEqual(subsOf(CATS, 'mm').map(c => c.id), ['ms', 'jj']);
  // Nothing to say: a subcategory is chosen, the choice is a subcategory, the category has none, or there is no category.
  assert.equal(missingSubs(CATS, history, 'mm', 'jj'), null);
  assert.equal(missingSubs(CATS, history, 'jj', null), null);
  assert.equal(missingSubs(CATS, history, 'tr', null), null);
  assert.equal(missingSubs(CATS, history, '', null), null);
});

test('old records without a subcategory are counted per category (spending, split lines and income)', () => {
  const list = [
    tx('a'), tx('b', { amount: 20_000 }), tx('c', { subcategoryId: 'jj' }), tx('d', { categoryId: 'tr' }),
    tx('e', { categoryId: null, splits: [{ categoryId: 'mm', subcategoryId: null, amount: 4_000 }, { categoryId: 'mm', subcategoryId: 'ms', amount: 6_000 }] }),
    tx('f', { type: 'income', categoryId: 'gj', amount: 5_000_000 }), tx('g', { type: 'transfer', categoryId: null, destinationWalletId: 'gopay' }),
  ];
  const groups = withoutSubs(list, CATS);
  assert.deepEqual(groups.map(g => [g.category.id, g.count, g.amount]), [['mm', 3, 34_000], ['gj', 1, 5_000_000]]);
  assert.equal(lacksSub(list[0], 'mm'), true);
  assert.equal(lacksSub(list[2], 'mm'), false);
  assert.equal(lacksSub(list[4], 'mm'), true);
  assert.equal(lacksSub(list[5], 'gj'), true);
  assert.equal(lacksSub(list[6], 'mm'), false);
});
