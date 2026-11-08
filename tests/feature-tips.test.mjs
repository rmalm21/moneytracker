import test from 'node:test';
import assert from 'node:assert/strict';
import { TIPS, cardTips, derivedUsed, usedSet, suggestionsFor, pickSuggestion, addDays, HIDE_DAYS } from '../lib/feature-tips.ts';

// 8.10 — "Bisa dicoba di sini": up to three unused features per menu; gone only when used; ✕ hides for 7 days.
const empty = { profile: null, data: { transactions: [], recurring: [], funds: [], wallets: [], drafts: [], budgets: [] }, layout: [], local: {} };
const today = '2026-11-10';

test('8.10 every tip has a menu, text, a way to try it, and an id that can be a field name', () => {
  const ids = new Set();
  for (const t of TIPS) { assert.ok(t.title && t.text && t.try, t.id); assert.ok(!ids.has(t.id), t.id); ids.add(t.id); assert.match(t.id, /^[a-z]+_[a-z_]+$/); }
  assert.equal(TIPS.filter(t => t.menu === 'home').length, 10);
});

test('8.10 the card shows the first three unused features, the next one moves up once one is used', () => {
  const card = cardTips('home', new Set(), {}, today);
  assert.deepEqual(card.map(t => t.id), ['home_layout', 'home_cards', 'home_chartcfg']);
  const after = cardTips('home', new Set(['home_cards']), {}, today);
  assert.deepEqual(after.map(t => t.id), ['home_layout', 'home_chartcfg', 'home_period']);
  const all = new Set(TIPS.filter(t => t.menu === 'inbox').map(t => t.id));
  assert.deepEqual(cardTips('inbox', all, {}, today), [], 'every feature used: the card is gone for good');
});

test('8.10 ✕ hides the card until the day it may show again, nothing is marked as used', () => {
  const state = { hiddenUntil: { home: addDays(today, HIDE_DAYS) } };
  assert.deepEqual(cardTips('home', new Set(), state, today), []);
  assert.deepEqual(cardTips('home', new Set(), state, addDays(today, 6)), []);
  assert.equal(cardTips('home', new Set(), state, addDays(today, 7)).length, 3);
  assert.equal(cardTips('wallets', new Set(), state, today).length, 3, 'only that menu is hidden');
});

test('8.10 features already used before 8.10 are read from the records', () => {
  const used = derivedUsed({
    profile: { dashboardWidgets: ['free', 'daysUntilSalary'], quickActions: [], pinHash: 'x', reminders: { balanceEnabled: true }, insightProfile: {} },
    data: { transactions: [{ type: 'transfer' }, { type: 'expense', origin: 'scan' }, { type: 'adjustment' }], recurring: [{}], funds: [{ name: 'Dana darurat', walletIds: ['a'] }], wallets: [{ displayOrder: 0 }], drafts: [{ source: 'import' }], budgets: [{ subcategoryId: null, subcategoryIds: [] }] },
    layout: ['free', 'daysUntilSalary'], local: { chatUsed: true },
  });
  for (const id of ['home_layout', 'home_cards', 'home_quick', 'settings_pin', 'settings_reminder', 'trans_transfer', 'add_scan', 'wallet_adjust', 'trans_recurring', 'wallet_kantong', 'wallet_emergency', 'inbox_import', 'home_chat', 'chat_ask']) assert.ok(used.has(id), id);
  for (const id of ['home_period', 'add_sentence', 'wallet_order', 'budget_sub', 'insight_profile', 'settings_hide']) assert.ok(!used.has(id), id);
  assert.equal(derivedUsed(empty).size, 0);
  assert.ok(usedSet({ used: ['home_eye'] }, new Set(['home_bell'])).has('home_eye'));
});

const ctx = (over = {}) => ({ used: new Set(TIPS.map(t => t.id)), today, layout: ['free'], daysUntilSalary: 10, transactions: [], recurring: [], budgets: [], categories: [], quickActions: [], pendingDrafts: 3, ...over });

test('8.10 suggestions fit the moment and only for features already known', () => {
  assert.equal(suggestionsFor('home', ctx({ daysUntilSalary: 2 }))[0].id, 'home_payday');
  assert.equal(suggestionsFor('home', ctx({ daysUntilSalary: 2, layout: ['daysUntilSalary'] })).length, 0);
  assert.equal(suggestionsFor('home', ctx({ daysUntilSalary: 2, used: new Set() })).length, 0, 'not known yet: it is on the card, not a suggestion');
  const kopi = d => ({ id: d, type: 'expense', amount: 25000, date: d, description: 'Kopi susu' });
  const s = suggestionsFor('home', ctx({ transactions: [kopi('2026-11-01'), kopi('2026-11-05'), kopi('2026-11-09')] }));
  assert.match(s[0].text, /Kopi susu/);
  assert.equal(suggestionsFor('home', ctx({ transactions: [kopi('2026-11-01'), kopi('2026-11-05'), kopi('2026-11-09')], quickActions: [{ label: 'Kopi', description: 'Kopi susu' }] })).length, 0);
  assert.equal(suggestionsFor('inbox', ctx({ pendingDrafts: 0 }))[0].id, 'inbox_empty_import');
  const net = m => ({ id: m, type: 'expense', amount: 300000, date: `2026-${m}-05`, description: 'Wifi rumah' });
  assert.match(suggestionsFor('transactions', ctx({ transactions: [net('09'), net('10')] }))[0].text, /Wifi rumah/);
  assert.equal(suggestionsFor('transactions', ctx({ transactions: [net('09'), net('10')], recurring: [{ name: 'Wifi rumah' }] })).length, 0);
  const food = n => ({ id: `f${n}`, type: 'expense', amount: 20000, date: `2026-11-0${n}`, description: 'Makan', categoryId: 'food' });
  const b = suggestionsFor('budgets', ctx({ transactions: [food(1), food(2), food(3)], categories: [{ id: 'food', name: 'Makan & Minum', type: 'expense', parentId: null }] }));
  assert.match(b[0].text, /Makan & Minum/);
});

test('8.10 at most one suggestion per menu per day, and a closed one stays away', () => {
  const list = [{ id: 'a', menu: 'home' }, { id: 'b', menu: 'home' }];
  assert.equal(pickSuggestion('home', list, {}, today).id, 'a');
  assert.equal(pickSuggestion('home', list, { suggested: { home: { day: today, id: 'b' } } }, today).id, 'b');
  assert.equal(pickSuggestion('home', list, { suggested: { home: { day: today, id: 'b' } }, closed: { b: addDays(today, 30) } }, today), null, 'closed today: no other one that day');
  assert.equal(pickSuggestion('home', list, { suggested: { home: { day: '2026-11-09', id: 'b' } }, closed: { a: addDays(today, 30) } }, today).id, 'b');
});
