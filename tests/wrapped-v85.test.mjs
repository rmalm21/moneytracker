import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWrapped, defaultPeriod, periodChoices, periodOf, previousOf } from '../lib/wrapped.ts';

// 8.5 — Rekap: a month or a year of the person's own records, worked out on the device.
const cats = [{ id: 'food', name: 'Makan & Minum', type: 'expense', parentId: null }, { id: 'coffee', name: 'Kopi', type: 'expense', parentId: 'food' }, { id: 'trans', name: 'Transportasi', type: 'expense', parentId: null }, { id: 'salary', name: 'Gaji', type: 'income', parentId: null }];
let n = 0;
const tx = (type, amount, date, extra = {}) => ({ id: `t${++n}`, type, amount, date, walletId: 'bca', destinationWalletId: null, categoryId: null, subcategoryId: null, merchant: '', description: '', notes: '', tags: [], splits: [], ...extra });

test('8.5 periods: months and years, the one before, and what is offered first', () => {
  assert.deepEqual(periodOf('2026-10'), { kind: 'month', start: '2026-10-01', end: '2026-11-01', label: 'Oktober 2026' });
  assert.deepEqual(periodOf('2026'), { kind: 'year', start: '2026-01-01', end: '2027-01-01', label: '2026' });
  assert.equal(previousOf(periodOf('2026-01')).label, 'Desember 2025');
  assert.equal(previousOf(periodOf('2026')).label, '2025');
  assert.equal(defaultPeriod('2026-11-07').label, 'Oktober 2026');
  assert.equal(defaultPeriod('2026-11-20').label, 'November 2026');
  const choices = periodChoices('2026-02-10').map(p => p.label);
  assert.deepEqual(choices.slice(0, 3), ['Februari 2026', 'Januari 2026', 'Desember 2025']);
  assert.deepEqual(choices.slice(-2), ['2026', '2025']);
});

test('8.5 the recap: totals, top categories, favourite place, biggest day, streak, change', () => {
  const items = [
    tx('income', 8_000_000, '2026-10-01', { categoryId: 'salary' }),
    tx('expense', 25_000, '2026-10-02', { categoryId: 'food', subcategoryId: 'coffee', merchant: 'Kopi Kenangan' }),
    tx('expense', 27_000, '2026-10-03', { categoryId: 'food', subcategoryId: 'coffee', merchant: 'Kopi Kenangan' }),
    tx('expense', 30_000, '2026-10-04', { categoryId: 'food', subcategoryId: 'coffee', merchant: 'kopi kenangan' }),
    tx('expense', 500_000, '2026-10-10', { categoryId: 'trans', merchant: 'Pertamina', description: 'Servis motor' }),
    tx('expense', 40_000, '2026-10-10', { categoryId: 'food', merchant: 'Warteg' }),
    tx('income', 12_000, '2026-10-31', { id: 'wint_bca_2026-10-31' }),
  ];
  const previous = [tx('expense', 400_000, '2026-09-10', { categoryId: 'food' })];
  const w = buildWrapped(items, previous, cats, periodOf('2026-10'), '2026-11-07');
  assert.equal(w.expense, 622_000);
  assert.equal(w.income, 8_012_000);
  assert.equal(w.saved, 8_012_000 - 622_000);
  assert.equal(w.top[0].name, 'Transportasi');
  assert.equal(w.top[1].name, 'Makan & Minum');
  assert.equal(w.place.name, 'Kopi Kenangan'); assert.equal(w.place.count, 3);
  assert.equal(w.biggestDay.date, '2026-10-10'); assert.equal(w.biggestDay.amount, 540_000);
  assert.equal(w.biggest.name, 'Servis motor');
  assert.equal(w.longestStreak, 4, '1–4 Oktober in a row; interest does not count as a record');
  assert.equal(w.days, 31);
  assert.ok(Math.abs(w.change - (622_000 - 400_000) / 400_000) < 1e-9);
  // A running month counts days up to today; nothing recorded means an empty recap without errors.
  const running = buildWrapped(items, [], cats, periodOf('2026-11'), '2026-11-07');
  assert.equal(running.count, 0); assert.equal(running.days, 7); assert.equal(running.change, null);
});
