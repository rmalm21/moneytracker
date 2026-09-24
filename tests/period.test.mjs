import test from 'node:test';
import assert from 'node:assert/strict';
import { dateInTimeZone, groupTransactions, resolvePeriodRange, summarizeTransactions, daysInRange } from '../lib/period.ts';

const items = [
  { id: '1', date: '2026-09-30', type: 'income', amount: 3000000 },
  { id: '2', date: '2026-09-30', type: 'expense', amount: 120000 },
  { id: '3', date: '2026-10-01', type: 'expense', amount: 80000 },
  { id: '4', date: '2026-10-02', type: 'claim_writeoff', amount: 40000 },
  { id: '5', date: '2026-10-03', type: 'transfer', amount: 500000 },
];

test('the configured timezone controls the calendar day near midnight', () => {
  const instant = new Date('2026-09-23T18:30:00Z');
  const jakarta = dateInTimeZone(instant, 'Asia/Jakarta');
  assert.equal(jakarta.getDate(), 24);
  assert.equal(resolvePeriodRange('salary_cycle', 24, jakarta).start, '2026-09-24');
  assert.equal(resolvePeriodRange('salary_cycle', 24, dateInTimeZone(instant, 'UTC')).start, '2026-08-24');
});

test('period presets and custom ranges keep the end exclusive', () => {
  const date = new Date(2026, 9, 3, 12);
  assert.deepEqual(resolvePeriodRange('last_7_days', 24, date), { start: '2026-09-27', end: '2026-10-04' });
  assert.deepEqual(resolvePeriodRange('calendar_month', 24, date), { start: '2026-10-01', end: '2026-11-01' });
  assert.deepEqual(resolvePeriodRange('custom', 24, date, { start: '2026-09-30', end: '2026-10-03' }), { start: '2026-09-30', end: '2026-10-03' });
  assert.equal(daysInRange({ start: '2026-09-30', end: '2026-10-03' }), 3);
});

test('all chart groupings reconcile with the same transaction totals', () => {
  const range = { start: '2026-09-30', end: '2026-10-03' };
  const summary = summarizeTransactions(items.filter(item => item.date >= range.start && item.date < range.end));
  assert.deepEqual(summary, { income: 3000000, expense: 240000, cashFlow: 2760000 });
  for (const mode of ['daily', 'weekly', 'monthly', 'yearly', 'auto']) {
    const chart = groupTransactions(items, range, mode);
    assert.equal(chart.reduce((sum, row) => sum + row.income, 0), summary.income, `${mode} income`);
    assert.equal(chart.reduce((sum, row) => sum + row.expense, 0), summary.expense, `${mode} expense`);
    assert.equal(chart.reduce((sum, row) => sum + row.cashFlow, 0), summary.cashFlow, `${mode} cash flow`);
  }
});
