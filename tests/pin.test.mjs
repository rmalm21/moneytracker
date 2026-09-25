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

import { savingsPlan } from '../lib/savings.ts';
test('savings target works out the monthly and weekly amount needed before the deadline', () => {
  const plan = savingsPlan({ targetAmount: 15_000_000, currentAmount: 3_000_000, monthlyContribution: 1_000_000, targetDate: '2027-03-15' }, '2026-09-25');
  assert.equal(plan.remaining, 12_000_000);
  assert.equal(plan.monthsLeft, 6);
  assert.equal(plan.perMonth, 2_000_000);
  assert.equal(plan.status, 'behind');
  assert.equal(plan.finish, '2027-09-25');
  assert.equal(plan.lateMonths, 6);
  assert.equal(savingsPlan({ targetAmount: 1_000, currentAmount: 1_000, monthlyContribution: 0, targetDate: '' }, '2026-09-25').status, 'reached');
  assert.equal(savingsPlan({ targetAmount: 10_000, currentAmount: 0, monthlyContribution: 5_000, targetDate: '2026-08-01' }, '2026-09-25').status, 'overdue');
  assert.equal(savingsPlan({ targetAmount: 6_000_000, currentAmount: 0, monthlyContribution: 2_000_000, targetDate: '2026-11-30' }, '2026-09-25').status, 'on_track');
});

import { monthlyTotals } from '../lib/insights.ts';
test('annual report adds up each month of the year', () => {
  const rows = monthlyTotals([tx({ date: '2026-01-05', amount: 100_000 }), tx({ date: '2026-01-20', type: 'income', amount: 1_000_000 }), tx({ date: '2026-12-31', amount: 50_000 }), tx({ date: '2025-12-31', amount: 999 })], 2026);
  assert.equal(rows.length, 12);
  assert.deepEqual([rows[0].income, rows[0].expense, rows[0].net, rows[0].rate], [1_000_000, 100_000, 900_000, 90]);
  assert.deepEqual([rows[11].expense, rows[11].end], [50_000, '2027-01-01']);
  assert.equal(rows[1].end, '2026-03-01');
});

import { dueReminders, defaultReminders } from '../lib/reminders.ts';
test('reminders fire once per chosen time, catch up within 3 hours, and never repeat', () => {
  const config = { ...defaultReminders, balanceEnabled: true, times: ['08:00', '13:00', '20:00'], billsEnabled: true, billTime: '08:00' };
  assert.deepEqual(dueReminders(config, '07:59', []), { fire: [], consumed: [] });
  const morning = dueReminders(config, '08:05', []);
  assert.deepEqual(morning.fire, ['balance', 'bills']);
  assert.deepEqual(dueReminders(config, '08:30', morning.consumed).fire, []);
  const late = dueReminders(config, '14:00', morning.consumed);
  assert.deepEqual([late.fire, late.consumed], [['balance'], ['balance@13:00']]);
  const tooLate = dueReminders(config, '23:30', [...morning.consumed, 'balance@13:00']);
  assert.deepEqual([tooLate.fire, tooLate.consumed], [[], ['balance@20:00']]);
  assert.deepEqual(dueReminders({ ...config, balanceEnabled: false, billsEnabled: false }, '20:00', []).fire, []);
});

import { budgetDetail, previousWindows } from '../lib/budget-detail.ts';
test('budget detail works out pace, projection and breakdowns inside the budget period', () => {
  const cats = [{ id: 'food', name: 'Makan', type: 'expense', parentId: null }, { id: 'lunch', name: 'Makan siang', type: 'expense', parentId: 'food' }, { id: 'fun', name: 'Hiburan', type: 'expense', parentId: null }];
  const budget = { id: 'b', name: 'Makan', categoryId: 'food', subcategoryId: null, amount: 3_000_000, classification: 'living', cycleType: 'salary', active: true };
  const items = [tx({ date: '2026-09-25', amount: 100_000, categoryId: 'food', subcategoryId: 'lunch', merchant: 'Warteg' }), tx({ date: '2026-09-26', amount: 50_000, categoryId: 'food', walletId: 'b' }), tx({ date: '2026-09-26', amount: 999_000, categoryId: 'fun' }), tx({ date: '2026-09-20', amount: 70_000, categoryId: 'food' })];
  const d = budgetDetail(budget, items, cats, { start: '2026-09-25', end: '2026-10-25' }, '2026-09-26', 3_000_000);
  assert.equal(d.spent, 150_000);
  assert.deepEqual([d.totalDays, d.elapsed, d.daysLeft], [30, 2, 29]);
  assert.equal(d.projected, 2_250_000);
  assert.deepEqual(d.bySub.map(s => [s.id, s.amount]), [['lunch', 100_000]]);
  assert.equal(d.unassigned, 50_000);
  assert.deepEqual(d.byWallet, [{ walletId: 'a', amount: 100_000 }, { walletId: 'b', amount: 50_000 }]);
  assert.deepEqual([d.pace[0].spent, d.pace[1].spent, d.pace[2].spent, d.pace[29].ideal], [100_000, 150_000, null, 3_000_000]);
  assert.equal(d.weeks.length, 5);
  const windows = previousWindows({ start: '2026-09-25' }, 3, date => { const y = date.getFullYear(), m = date.getMonth(); const start = new Date(y, date.getDate() >= 25 ? m : m - 1, 25), end = new Date(start.getFullYear(), start.getMonth() + 1, 25); const f = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-25`; return { start: f(start), end: f(end) }; });
  assert.deepEqual(windows.map(w => w.start), ['2026-06-25', '2026-07-25', '2026-08-25']);
});

import { weeklyCycle, budgetWindow as bw, budgetMonthly } from '../lib/accounting.ts';
test('weekly budget windows start on the chosen weekday', () => {
  // 25 Sep 2026 is a Friday.
  assert.deepEqual([weeklyCycle(new Date(2026, 8, 25), 1).start, weeklyCycle(new Date(2026, 8, 25), 1).end], ['2026-09-21', '2026-09-28']);
  assert.equal(weeklyCycle(new Date(2026, 8, 25), 5).start, '2026-09-25');
  assert.equal(weeklyCycle(new Date(2026, 8, 25), 6).start, '2026-09-19');
  assert.equal(weeklyCycle(new Date(2026, 8, 27), 7).start, '2026-09-27');
  assert.equal(bw({ cycleType: 'weekly', cycleStartDay: 1 }, new Date(2026, 11, 30), 24).end, '2027-01-04');
  assert.equal(budgetMonthly({ amount: 300000, cycleType: 'weekly' }), 1300000);
  assert.equal(budgetMonthly({ amount: 300000, cycleType: 'salary' }), 300000);
});
