import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryBreakdown, categoryLines, incomeCategoryBreakdown } from '../lib/category-analytics.ts';
import { amountsBySub, drillBuckets, drillStats, drillUnit, shortDate } from '../lib/category-drill.ts';

const categories = [
  { id: 'mm', name: 'Makan & Minum', type: 'expense', parentId: null },
  { id: 'siang', name: 'Makan Siang', type: 'expense', parentId: 'mm' },
  { id: 'jajan', name: 'Jajan', type: 'expense', parentId: 'mm' },
  { id: 'tr', name: 'Transportasi', type: 'expense', parentId: null },
  { id: 'gaji', name: 'Gaji', type: 'income', parentId: null },
  { id: 'bonus', name: 'Bonus', type: 'income', parentId: 'gaji' },
];
const tx = (id, date, amount, categoryId, subcategoryId = null, extra = {}) => ({ id, type: 'expense', date, amount, walletId: 'w', destinationWalletId: null, categoryId, subcategoryId, merchant: '', description: '', notes: '', tags: [], ...extra });
const items = [
  tx('a', '2026-10-03', 25000, 'mm', 'siang', { merchant: 'Warteg Bahari' }),
  tx('b', '2026-10-10', 30000, 'mm', 'siang', { merchant: 'warteg bahari' }),
  tx('c', '2026-10-10', 12000, 'mm', 'jajan', { description: 'Cilok' }),
  tx('d', '2026-10-17', 8000, 'mm', null, { description: 'Es teh' }),
  tx('e', '2026-10-11', 20000, 'tr', null, { description: 'Bensin' }),
  // One payment split over two subcategories of the same category: one transaction in the category's detail.
  tx('f', '2026-10-24', 50000, null, null, { description: 'Belanja pasar', splits: [{ categoryId: 'mm', subcategoryId: 'siang', amount: 30000 }, { categoryId: 'mm', subcategoryId: 'jajan', amount: 20000 }] }),
];

test('the parts behind each slice add up to the slice, subcategory by subcategory', () => {
  const lines = categoryLines(items, categories, 'expense'), slices = categoryBreakdown(items, categories);
  for (const slice of slices) {
    const parts = lines.get(slice.id) || [];
    assert.equal(parts.reduce((n, l) => n + l.amount, 0), slice.amount, slice.id);
    const bySub = amountsBySub(parts);
    for (const sub of slice.subcategories) assert.equal(bySub.get(sub.id), sub.amount, sub.id);
  }
  assert.equal(amountsBySub(lines.get('mm')).get(null), 8000);
});

test('income parts match the income chart', () => {
  const income = [tx('g', '2026-10-25', 7_000_000, 'gaji', null, { type: 'income' }), tx('h', '2026-10-26', 500_000, 'gaji', 'bonus', { type: 'income' })];
  const lines = categoryLines(income, categories, 'income'), slice = incomeCategoryBreakdown(income, categories)[0];
  assert.equal(lines.get('gaji').reduce((n, l) => n + l.amount, 0), slice.amount);
  assert.equal(amountsBySub(lines.get('gaji')).get('bonus'), 500_000);
});

test('detail of a category: totals, count by transaction, average, per day up to today, names, biggest, busiest day', () => {
  const parts = categoryLines(items, categories, 'expense').get('mm');
  const s = drillStats(parts, { start: '2026-10-01', end: '2026-11-01' }, '2026-10-24');
  assert.equal(s.total, 125000);
  assert.equal(s.count, 5); // f counted once
  assert.equal(s.average, 25000);
  assert.equal(s.days, 24);
  assert.equal(Math.round(s.perDay), Math.round(125000 / 24));
  assert.equal(s.unit, 'day');
  assert.equal(s.buckets.length, 31);
  assert.equal(s.buckets.at(-1).start, '2026-10-31');
  assert.equal(s.buckets.find(b => b.start === '2026-10-10').amount, 42000);
  assert.deepEqual(s.names[0], { name: 'Warteg Bahari', amount: 55000, count: 2 });
  assert.equal(s.biggest[0].tx.id, 'f');
  assert.equal(s.biggest[0].amount, 50000);
  // Oct 3, 10, 17, 24 2026 are all Saturdays.
  assert.deepEqual(s.busiestDay, { day: 'Sabtu', count: 5 });
});

test('detail of one subcategory only counts its own share', () => {
  const parts = categoryLines(items, categories, 'expense').get('mm').filter(l => l.subId === 'jajan');
  const s = drillStats(parts, { start: '2026-10-01', end: '2026-11-01' }, '2026-11-14');
  assert.equal(s.total, 32000);
  assert.equal(s.count, 2);
  assert.equal(s.days, 31); // a period that is over is averaged over all its days
  assert.equal(s.full, 31);
  assert.deepEqual(s.busiestDay, { day: 'Sabtu', count: 2 });
  // One on a Sunday and one on a Saturday: nothing stands out.
  assert.equal(drillStats([{ tx: items[4], amount: 1 }, { tx: items[0], amount: 1 }], { start: '2026-10-01', end: '2026-11-01' }, '2026-10-31').busiestDay, null);
});

test('trend bars: days for a month, weeks up to ~3 months, months beyond', () => {
  // A period's end is the day after its last day (lib/period.ts).
  assert.equal(drillUnit('2026-10-01', '2026-11-01'), 'day');
  assert.equal(drillUnit('2026-08-24', '2026-11-24'), 'week');
  assert.equal(drillUnit('2026-01-01', '2027-01-01'), 'month');
  const weeks = drillBuckets('2026-09-01', '2026-10-16', 'week');
  assert.equal(weeks[0].start, '2026-09-01');
  assert.equal(weeks[0].end, '2026-09-07');
  assert.equal(weeks.at(-1).end, '2026-10-15');
  const months = drillBuckets('2026-01-15', '2026-03-11', 'month');
  assert.deepEqual(months.map(m => [m.label, m.start, m.end]), [['Jan', '2026-01-15', '2026-01-31'], ['Feb', '2026-02-01', '2026-02-28'], ['Mar', '2026-03-01', '2026-03-10']]);
  assert.equal(shortDate('2026-10-03'), '3 Okt');
});
