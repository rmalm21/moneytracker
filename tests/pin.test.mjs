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

import { forecast } from '../lib/forecast.ts';
test('forecast follows the spending pace and uses last cycle while this one is new', () => {
  const base = { free: 3_000_000, spentThisCycle: 1_000_000, daysElapsed: 10, daysRemaining: 20, daysTotal: 30, salary: 8_000_000, totalBudget: 6_000_000 };
  const f = forecast(base);
  assert.equal(f.daily, 100_000);
  assert.equal(f.before, 1_000_000);
  assert.equal(f.after, 9_000_000);
  assert.deepEqual(f.months.slice(0, 3), [9_000_000, 11_000_000, 13_000_000]);
  assert.equal(f.status, 'aman');
  const early = forecast({ ...base, spentThisCycle: 500_000, daysElapsed: 1, baselineDaily: 80_000 });
  assert.equal(early.dailySource, 'baseline');
  assert.equal(early.daily, 80_000);
  const frugal = forecast({ ...base, spendAdjust: -10 });
  assert.equal(frugal.untilPayday, 1_800_000);
  assert.equal(forecast({ ...base, free: 500_000 }).status, 'minus');
});

import { cumulativeSpending, sizeBands, timeOfDaySpending, topPlaces, walletFlows, weekdaySpending } from '../lib/insights.ts';
const tx = (over) => ({ id: Math.random().toString(36), type: 'expense', amount: 10_000, date: '2026-09-21', time: '', walletId: 'a', destinationWalletId: null, categoryId: 'c', subcategoryId: null, merchant: '', description: '', notes: '', tags: [], claimId: null, debtId: null, receivableId: null, fundId: null, recurringTransactionId: null, draftId: null, adjustmentDirection: 'in', ...over });
test('analysis helpers group spending by weekday, time, size, place and wallet', () => {
  const items = [tx({ date: '2026-09-21', time: '08:10', merchant: 'Kopi Kenangan' }), tx({ date: '2026-09-21', amount: 150_000, time: '20:00', description: 'Belanja bulanan' }), tx({ date: '2026-09-27', amount: 30_000, merchant: 'kopi kenangan' }), tx({ type: 'transfer', amount: 100_000, destinationWalletId: 'b', transferFee: 2_500 }), tx({ type: 'income', amount: 500_000, walletId: 'b' })];
  const week = weekdaySpending(items, { start: '2026-09-21', end: '2026-09-28' });
  assert.equal(week[0].total, 160_000 + 2_500); assert.equal(week[6].total, 30_000); assert.equal(week[0].occurrences, 1);
  const time = timeOfDaySpending(items); assert.equal(time.rows[1].total, 10_000); assert.equal(time.rows[4].total, 150_000);
  assert.deepEqual(sizeBands(items).map(b => b.count), [2, 1, 1, 0]);
  assert.deepEqual(topPlaces(items)[1], { name: 'Kopi Kenangan', total: 40_000, count: 2 });
  const flows = walletFlows(items, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  assert.deepEqual(flows.find(f => f.id === 'b'), { id: 'b', name: 'B', icon: undefined, color: undefined, in: 600_000, out: 0, net: 600_000 });
  assert.equal(flows.find(f => f.id === 'a').out, 10_000 + 150_000 + 30_000 + 102_500);
  const cumulative = cumulativeSpending(items, { start: '2026-09-21', end: '2026-09-28' });
  assert.equal(cumulative[0], 162_500); assert.equal(cumulative[6], 192_500);
});
