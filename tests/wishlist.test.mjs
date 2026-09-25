import test from 'node:test';
import assert from 'node:assert/strict';
import { coolingLeft, eta, monthlyForDate, progress, readiness, remaining, sortWishes, wishSummary } from '../lib/wishlist.ts';

const wish = (extra = {}) => ({ id: 'w', name: 'Laptop', emoji: '💻', price: 12_000_000, saved: 3_000_000, monthly: 1_500_000, priority: 2, status: 'active', addedDate: '2026-09-01', ...extra });

test('progress, remaining and eta', () => {
  const w = wish();
  assert.equal(remaining(w), 9_000_000);
  assert.equal(progress(w), .25);
  assert.deepEqual(eta(w, '2026-09-25'), { months: 6, date: '2027-03-25' });
  assert.equal(eta(wish({ monthly: 0 }), '2026-09-25'), null);
  assert.equal(eta(wish({ saved: 12_000_000 }), '2026-09-25').months, 0);
  assert.equal(monthlyForDate(w, '2027-03-25', '2026-09-25'), 1_500_000);
});

test('big purchases get a 30-day think period, small ones 7 days', () => {
  assert.equal(coolingLeft(wish({ addedDate: '2026-09-20' }), 8_500_000, '2026-09-25'), 25);
  assert.equal(coolingLeft(wish({ price: 300_000, addedDate: '2026-09-20' }), 8_500_000, '2026-09-25'), 2);
  assert.equal(coolingLeft(wish({ addedDate: '2026-01-01' }), 8_500_000, '2026-09-25'), 0);
});

test('readiness uses at most half of free money and respects the waiting period', () => {
  const old = '2026-01-01';
  assert.equal(readiness(wish({ addedDate: old }), 30_000_000, 8_500_000, '2026-09-25').kind, 'affordable');
  assert.equal(readiness(wish({ addedDate: old }), 10_000_000, 8_500_000, '2026-09-25').kind, 'saving');
  assert.equal(readiness(wish({ addedDate: old, saved: 12_000_000 }), 0, 8_500_000, '2026-09-25').kind, 'reached');
  assert.equal(readiness(wish({ addedDate: '2026-09-24', saved: 12_000_000 }), 0, 8_500_000, '2026-09-25').kind, 'wait');
});

test('sorting and summary', () => {
  const list = [wish({ id: 'a', price: 1_000_000, saved: 0, monthly: 500_000, priority: 3, sortOrder: 2 }), wish({ id: 'b', priority: 1, sortOrder: 1 }), wish({ id: 'c', status: 'bought' })];
  assert.deepEqual(sortWishes(list.slice(0, 2), 'manual', '2026-09-25').map(w => w.id), ['b', 'a']);
  assert.deepEqual(sortWishes(list.slice(0, 2), 'priority', '2026-09-25').map(w => w.id), ['b', 'a']);
  assert.deepEqual(sortWishes(list.slice(0, 2), 'nearest', '2026-09-25').map(w => w.id), ['a', 'b']);
  const sum = wishSummary(list);
  assert.deepEqual([sum.count, sum.total, sum.saved, sum.bought, sum.monthly], [2, 13_000_000, 3_000_000, 1, 2_000_000]);
});
