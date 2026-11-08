import test from 'node:test';
import assert from 'node:assert/strict';
import { rootSegments, isSpaceKey, spaceKey, spaceIdOf, setActor, stamp } from '../lib/space-key.ts';
import { spaceProfile, formatCode, cleanCode, SPACE_FIELDS, targetShares } from '../lib/space-profile.ts';
import { balances, equalShares, restorable } from '../lib/space-math.ts';
import { contributions } from '../lib/space-report.ts';
import { SPACE_COLORS, spaceColor } from '../lib/space-look.ts';
import { validAccent } from '../lib/appearance.ts';

// 9.0 Dompet Bersama — records keyed by owner or space, the space profile, who owes whom, contributions.
test('9.0 records live under users/{uid} or spaces/{id}', () => {
  assert.deepEqual(rootSegments('abc123'), ['users', 'abc123']);
  assert.deepEqual(rootSegments(spaceKey('s1')), ['spaces', 's1']);
  assert.ok(isSpaceKey('space:s1') && !isSpaceKey('abc'));
  assert.equal(spaceIdOf(spaceKey('xyz')), 'xyz');
});

test('9.0 shared records say who added and changed them; one’s own records do not', () => {
  setActor({ uid: 'u1', name: 'Rama' });
  assert.deepEqual(stamp('space:s1', true), { createdBy: 'u1', createdByName: 'Rama', updatedBy: 'u1', updatedByName: 'Rama' });
  assert.deepEqual(stamp('space:s1', false), { updatedBy: 'u1', updatedByName: 'Rama' });
  assert.deepEqual(stamp('u1', true), {});
  setActor(null);
  assert.deepEqual(stamp('space:s1', true), {});
});

test('9.0 a space has its own record settings, the person keeps their name, look and PIN', () => {
  const personal = { uid: 'u1', displayName: 'Rama', theme: 'dark', pinHash: 'h', salaryCycleStartDay: 25, monthlySalary: 9000000, dashboardWidgets: ['free', 'debts'], quickActions: [{ id: 'k', label: 'Kopi', kind: 'expense' }], netWorthIncludesReceivables: true, featureTips: { used: ['x'] } };
  const shown = spaceProfile(personal, { id: 's1', name: 'Rumah', createdBy: 'u1', memberIds: ['u1'], members: {}, salaryCycleStartDay: 1 });
  assert.equal(shown.displayName, 'Rama'); assert.equal(shown.theme, 'dark'); assert.equal(shown.pinHash, 'h');
  assert.equal(shown.salaryCycleStartDay, 1); assert.equal(shown.monthlySalary, 0);
  assert.deepEqual(shown.dashboardWidgets, []); assert.equal(shown.quickActions, undefined, 'own Catat cepat buttons point at own wallets');
  assert.equal(shown.netWorthIncludesReceivables, undefined);
  assert.equal(spaceProfile(personal, { id: 's', name: 'X', createdBy: 'u', memberIds: [], members: {} }).salaryCycleStartDay, 25, 'no period set yet: the person’s own');
  for (const f of ['displayName', 'theme', 'pinHash', 'featureTips', 'reminders', 'personalLexicon', 'timeZone']) assert.ok(!SPACE_FIELDS.includes(f), f);
});

test('9.0 invite codes read the same with or without the dash, in any case', () => {
  assert.equal(formatCode('ABCDEFGH23'), 'ABCDE-FGH23');
  assert.equal(cleanCode(' abcde-fgh23 '), 'ABCDEFGH23');
});

test('9.0 who owes whom is netted both ways', () => {
  assert.deepEqual(balances({ owed: { dina: { rama: 75000 }, rama: { dina: 20000 } } }), [{ from: 'dina', to: 'rama', amount: 55000 }]);
  assert.deepEqual(balances({ owed: { dina: { rama: 75000 } } }).length, 1);
  assert.deepEqual(balances({ owed: { dina: { rama: 0 } } }), [], 'paid back: nothing left');
  assert.deepEqual(balances({ owed: { dina: { rama: -10000 } } }), [{ from: 'rama', to: 'dina', amount: 10000 }], 'paid too much: the other way');
  assert.deepEqual(balances({}), []);
  const three = balances({ owed: { b: { a: 30000 }, c: { a: 30000, b: 5000 } } });
  assert.deepEqual(three, [{ from: 'b', to: 'a', amount: 30000 }, { from: 'c', to: 'a', amount: 30000 }, { from: 'c', to: 'b', amount: 5000 }]);
});

test('9.0 equal shares always add up to the total', () => {
  assert.deepEqual(equalShares(150000, ['a', 'b']), { a: 75000, b: 75000 });
  const s = equalShares(100000, ['a', 'b', 'c']);
  assert.equal(Object.values(s).reduce((n, x) => n + x, 0), 100000);
  assert.deepEqual(s, { a: 33334, b: 33333, c: 33333 });
});

test('9.0 contributions: deposits minus withdrawals, paid for everyone, own share of splits', () => {
  const t = (type, amount, memberFlow, createdBy) => ({ id: String(Math.random()), type, amount, date: '2026-11-08', walletId: memberFlow?.kind === 'paid' || memberFlow?.kind === 'split' ? '' : 'w', memberFlow, createdBy });
  const items = [
    t('income', 2000000, { kind: 'deposit', uid: 'rama', name: 'Rama' }, 'rama'),
    t('income', 1500000, { kind: 'deposit', uid: 'dina', name: 'Dina' }, 'dina'),
    t('expense', 200000, { kind: 'withdrawal', uid: 'dina', name: 'Dina' }, 'dina'),
    t('expense', 150000, { kind: 'split', uid: 'rama', name: 'Rama', shares: { rama: 75000, dina: 75000 } }, 'rama'),
    t('expense', 90000, { kind: 'paid', uid: 'dina', name: 'Dina' }, 'dina'),
    t('expense', 300000, undefined, 'rama'),
  ];
  const r = contributions(items, { rama: 'Rama', dina: 'Dina' });
  const rama = r.lines.find(l => l.uid === 'rama'), dina = r.lines.find(l => l.uid === 'dina');
  assert.equal(rama.contributed, 2000000 + 75000); assert.equal(rama.splitPaid, 150000); assert.equal(rama.recorded, 3);
  assert.equal(dina.contributed, 1500000 - 200000 + 90000 + 75000);
  assert.equal(r.sharedSpend, 150000 + 90000 + 300000, 'what a member took out is not shared spending');
});

test('9.0 a deleted shared transaction comes back as a new one, without its old links', () => {
  const back = restorable({ id: 'old', type: 'expense', amount: 5000, walletId: 'w', date: '2026-11-08', draftId: 'd1', plannedId: 'p1', createdBy: 'u', createdByName: 'X', categoryId: 'c' });
  assert.equal(back.id, ''); assert.equal(back.draftId, null); assert.equal(back.plannedId, null); assert.equal(back.createdBy, undefined); assert.equal(back.categoryId, 'c');
});

test('9.0 every space colour stays readable on light and dark screens', () => {
  for (const c of SPACE_COLORS) { assert.ok(validAccent(c.light, 'light'), c.key); assert.ok(validAccent(c.dark, 'dark'), c.key); }
  assert.equal(spaceColor('nope', 'light'), SPACE_COLORS[0].light);
});

test('9.1 target shares: the space’s own split when it covers everyone and adds up to 100, else equal', () => {
  assert.deepEqual(targetShares({ memberIds: ['a', 'b'] }), { a: 50, b: 50 });
  assert.deepEqual(targetShares({ memberIds: ['a', 'b', 'c'] }), { a: 34, b: 33, c: 33 });
  assert.deepEqual(targetShares({ memberIds: ['a', 'b'], shareTarget: { a: 60, b: 40 } }), { a: 60, b: 40 });
  assert.deepEqual(targetShares({ memberIds: ['a', 'b'], shareTarget: { a: 60, b: 30 } }), { a: 50, b: 50 }, 'not 100: equal');
  assert.deepEqual(targetShares({ memberIds: ['a', 'b', 'c'], shareTarget: { a: 60, b: 40 } }), { a: 34, b: 33, c: 33 }, 'a new member: equal until set again');
  assert.deepEqual(targetShares({ memberIds: ['a', 'b'], shareTarget: {} }), { a: 50, b: 50 });
});
