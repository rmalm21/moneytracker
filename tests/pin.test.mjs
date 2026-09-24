import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPin, hashPin, newPinSalt, validPin } from '../lib/pin.ts';

test('only four digits are accepted as a PIN', () => {
  assert.equal(validPin('2580'), true);
  for (const bad of ['258', '25801', 'abcd', '25 8', '']) assert.equal(validPin(bad), false);
});

test('PIN is stored as a salted hash and checked against it', async () => {
  const salt = newPinSalt(), other = newPinSalt();
  assert.notEqual(salt, other);
  const hash = await hashPin('2580', salt);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, '2580');
  assert.notEqual(hash, await hashPin('2580', other));
  assert.equal(await checkPin('2580', salt, hash), true);
  assert.equal(await checkPin('0852', salt, hash), false);
  assert.equal(await checkPin('25a0', salt, hash), false);
});

import { percentChange, previousComparableRange } from '../lib/period.ts';
test('previous period is the same kind of period, cut to the days elapsed so far', () => {
  const cycle = { start: '2026-09-25', end: '2026-10-25' };
  const running = previousComparableRange('salary_cycle', 25, cycle, '2026-10-04');
  assert.deepEqual([running.start, running.end, running.partial, running.days], ['2026-08-25', '2026-09-04', true, 10]);
  const finished = previousComparableRange('salary_cycle', 25, cycle, '2026-11-01');
  assert.deepEqual([finished.start, finished.end, finished.partial], ['2026-08-25', '2026-09-25', false]);
  const month = previousComparableRange('last_30_days', 25, { start: '2026-08-27', end: '2026-09-26' }, '2026-09-25');
  assert.deepEqual([month.start, month.end], ['2026-07-28', '2026-08-27']);
});
test('percent change handles zero and direction', () => {
  assert.equal(percentChange(93, 100), -7);
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(0, 0), 0);
  assert.equal(percentChange(50, 0), null);
});
