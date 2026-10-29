import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSpend } from '../lib/budget-detail.ts';

// 7.4: a budget's end-of-period estimate follows how earlier periods were spent, not only an even daily pace.
test('bills paid early in the period: scaled by the share earlier periods had spent by this day', () => {
  // Rent 1.8jt + internet 330rb by day 20 of 31; earlier periods: 2.13jt of 2.48jt by day 20.
  const past = [{ total: 2_480_000, byDay: 2_130_000 }, { total: 2_480_000, byDay: 2_130_000 }, { total: 2_480_000, byDay: 2_130_000 }];
  assert.equal(projectSpend(2_130_000, 20, 31, past), 2_480_000);
  // The even pace would have said 3.3jt.
  assert.equal(projectSpend(2_130_000, 20, 31, []), 3_301_500);
});

test('fewer than two earlier periods: the even pace; never below what is spent', () => {
  assert.equal(projectSpend(300_000, 10, 30, [{ total: 900_000, byDay: 300_000 }]), 900_000);
  assert.equal(projectSpend(500_000, 30, 30, []), 500_000);
  assert.equal(projectSpend(400_000, 5, 30, [{ total: 300_000, byDay: 300_000 }, { total: 350_000, byDay: 350_000 }]), 400_000);
});

test('almost nothing spent by this day before: the average of earlier totals', () => {
  assert.equal(projectSpend(50_000, 3, 30, [{ total: 600_000, byDay: 20_000 }, { total: 800_000, byDay: 30_000 }]), 700_000);
});
