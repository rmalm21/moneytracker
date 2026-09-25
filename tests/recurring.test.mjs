import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceSchedule, anchorFor, scheduleDay } from '../lib/recurring.ts';
import { commitments } from '../lib/finance-control.ts';

test('monthly schedules on the 29th–31st go back to their day after a short month', () => {
  let date = '2026-01-31'; const seen = [];
  for (let i = 0; i < 4; i++) { date = advanceSchedule(date, 'monthly', 31); seen.push(date); }
  assert.deepEqual(seen, ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  assert.equal(advanceSchedule('2026-12-31', 'monthly', 31), '2027-01-31');
  assert.equal(advanceSchedule('2026-01-30', 'monthly', 30), '2026-02-28');
});

test('yearly on 29 Feb returns to 29 Feb in leap years; weekly adds 7 days', () => {
  assert.equal(advanceSchedule('2028-02-29', 'yearly', 29), '2029-02-28');
  assert.equal(advanceSchedule('2031-02-28', 'yearly', 29), '2032-02-29');
  assert.equal(advanceSchedule('2026-12-28', 'weekly'), '2027-01-04');
});

test('older schedules without a stored day keep today’s behaviour; saving stores the chosen day', () => {
  assert.equal(scheduleDay({ nextDate: '2026-02-28' }), 28);
  assert.equal(scheduleDay({ nextDate: '2026-02-28', anchorDay: 31 }), 31);
  assert.equal(anchorFor('2026-03-31'), 31);
  assert.equal(anchorFor('2026-02-28', { nextDate: '2026-02-28', anchorDay: 31 }), 31, 'unchanged date keeps the original day');
  assert.equal(anchorFor('2026-03-05', { nextDate: '2026-02-28', anchorDay: 31 }), 5, 'a new date sets a new day');
});

test('upcoming bills follow the intended day', () => {
  const data = { drafts: [], plannedTransactions: [], recurring: [{ id: 'r', name: 'Sewa', type: 'expense', amount: 1_000_000, walletId: 'w', categoryId: null, frequency: 'monthly', nextDate: '2026-02-28', anchorDay: 31, mode: 'inbox', active: true }] };
  const dates = commitments(data, { start: '2026-02-01', end: '2026-06-01' }).map(c => c.date);
  assert.deepEqual(dates, ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
});
