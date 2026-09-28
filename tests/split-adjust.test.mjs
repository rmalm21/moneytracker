import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSplit } from '../lib/split-bill.ts';

const people = [{ id: 'a', name: 'Rama', isMe: true }, { id: 'b', name: 'Suci' }, { id: 'c', name: 'Andi' }];
const bill = (extra = {}) => ({ total: 100_000, method: 'equal', participants: people, items: [], extras: [], payer: 'me', payerId: 'a', ...extra });

test('rounding a friend up moves the difference to the payer; the bill still adds up', () => {
  const plain = computeSplit(bill());
  assert.deepEqual(plain.people.map(p => p.total), [33_334, 33_333, 33_333]);
  const r = computeSplit(bill({ participants: [people[0], { ...people[1], adjust: 667 }, { ...people[2], adjust: 1_667 }] }));
  assert.deepEqual(r.people.map(p => p.total), [31_000, 34_000, 35_000]);
  assert.equal(r.allocated, 100_000); assert.equal(r.unassigned, 0);
  assert.ok(r.people[0].lines.some(l => l.key === 'adjust' && l.amount === -2_334));
});

test('when someone else paid, they take the difference; the payer\'s own correction is ignored', () => {
  const r = computeSplit(bill({ payer: 'other', payerId: 'b', participants: [{ ...people[0], adjust: -334 }, { ...people[1], adjust: 5_000 }, people[2]] }));
  assert.deepEqual(r.people.map(p => p.total), [33_000, 33_667, 33_333]);
  assert.equal(r.allocated, 100_000);
});
