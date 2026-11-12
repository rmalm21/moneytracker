import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeChanges, sameData, stableJson } from '../lib/same-data.ts';

test('the same data in another field order counts as the same', () => {
  assert.ok(sameData({ a: 1, b: { x: [1, 2], y: 'z' } }, { b: { y: 'z', x: [1, 2] }, a: 1 }));
  assert.ok(!sameData({ a: [1, 2] }, { a: [2, 1] }));
  assert.ok(!sameData({ a: 1 }, { a: 2 }));
  assert.ok(sameData({ a: 1, gone: undefined }, { a: 1 }), 'undefined fields count as missing, like Firestore');
  assert.ok(sameData(null, undefined));
  assert.equal(stableJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
});

test('a change made on this phone goes on top of another phone\'s newer copy', () => {
  // The pet as this phone saw it, after this phone fed it, and as the account holds it after another phone patted it.
  const base = { meals: { day: 'd1', n: 1 }, elus: { hour: 'h1', n: 0 }, pets: { kucing: { name: 'Mochi', growth: 10, needs: { kenyang: 50, senang: 50 } } } };
  const mine = { meals: { day: 'd1', n: 2 }, elus: { hour: 'h1', n: 0 }, pets: { kucing: { name: 'Mochi', growth: 12, needs: { kenyang: 80, senang: 50 } } } };
  const theirs = { meals: { day: 'd1', n: 1 }, elus: { hour: 'h1', n: 3 }, pets: { kucing: { name: 'Mochi', growth: 11, needs: { kenyang: 50, senang: 90 } } } };
  const out = mergeChanges(base, mine, theirs);
  assert.deepEqual(out.meals, { day: 'd1', n: 2 }, 'the meal from this phone');
  assert.deepEqual(out.elus, { hour: 'h1', n: 3 }, 'the pats from the other phone');
  assert.equal(out.pets.kucing.needs.kenyang, 80);
  assert.equal(out.pets.kucing.needs.senang, 90);
  assert.equal(out.pets.kucing.growth, 12, 'both changed it: this phone wins');
});

test('nothing changed here: the account\'s copy stays as it is', () => {
  const theirs = { xp: 900, list: [1, 2, 3] };
  assert.equal(mergeChanges({ xp: 100 }, { xp: 100 }, theirs), theirs);
});

test('a field added or removed on this phone, and a pet adopted on another', () => {
  const base = { active: 'kucing', pets: { kucing: { name: 'A' } } };
  const mine = { active: 'anjing', pets: { kucing: { name: 'A' }, anjing: { name: 'B' } } };
  const theirs = { active: 'kucing', pets: { kucing: { name: 'A' }, tokek: { name: 'C' } } };
  assert.deepEqual(mergeChanges(base, mine, theirs), { active: 'anjing', pets: { kucing: { name: 'A' }, tokek: { name: 'C' }, anjing: { name: 'B' } } });
  assert.deepEqual(mergeChanges({ a: 1, b: 2 }, { a: 1 }, { a: 5, b: 2, c: 3 }), { a: 5, c: 3 });
});

test('changedFields: only what this phone changed', async () => {
  const { changedFields } = await import('../lib/same-data.ts');
  assert.deepEqual(changedFields({ xp: 10, days: ['a'], best: 3 }, { xp: 20, days: ['a'], best: 3 }), { xp: 20 });
  assert.deepEqual(changedFields(null, { xp: 1 }), { xp: 1 });
  assert.deepEqual(changedFields({ a: { x: 1 } }, { a: { x: 1 } }), {});
});
