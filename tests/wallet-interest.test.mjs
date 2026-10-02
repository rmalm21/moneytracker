import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyInterest, microToRupiah, planInterest, reconcileInterest, simulateInterest, estimateToday, updateInterestSettings, interestId, addDays } from '../lib/wallet-interest.ts';

const period = (rate, tax = true, taxRate = 20, from = '2026-10-01', basis = 'year') => ({ from, rate, basis, tax, taxRate });
const wallet = (opening, interest) => ({ id: 'jenius', openingBalance: opening, interest });
const on = (rate = 4.5, extra = {}) => ({ enabled: true, startDate: '2026-10-01', periods: [period(rate, extra.tax ?? true, extra.taxRate ?? 20)], ...extra.settings });
const tx = (date, type, amount, more = {}) => ({ id: `${type}-${date}-${amount}`, type, amount, date, walletId: 'jenius', destinationWalletId: null, categoryId: null, ...more });
/** What the stored interest transactions would be after applying a plan (as the Firestore step writes them). */
const asTransactions = plan => plan.map(p => tx(p.date, 'income', p.amount, { id: p.id, time: '23:59', interest: p.record }));

test('required example: Rp10.000.000 at 4.5% p.a. with 20% tax', () => {
  const d = dailyInterest(10_000_000, period(4.5));
  assert.equal(microToRupiah(d.grossMicro).toFixed(4), '1232.8767');
  assert.equal(microToRupiah(d.taxMicro).toFixed(4), '246.5753');
  assert.equal(microToRupiah(d.netMicro).toFixed(4), '986.3014');
});

test('0% earns nothing; decimal rates; tax off; custom tax rate', () => {
  assert.equal(dailyInterest(10_000_000, period(0)).netMicro, BigInt(0));
  assert.equal(microToRupiah(dailyInterest(10_000_000, period(3.5, false)).netMicro).toFixed(4), '958.9041');
  assert.equal(microToRupiah(dailyInterest(10_000_000, period(4.25, false)).grossMicro).toFixed(4), '1164.3836');
  assert.equal(microToRupiah(dailyInterest(10_000_000, period(5.75, true, 10)).netMicro).toFixed(4), '1417.8082');
  const noTax = dailyInterest(10_000_000, period(4.5, false));
  assert.equal(noTax.taxMicro, BigInt(0)); assert.equal(noTax.netMicro, noTax.grossMicro);
});

test('zero and negative balances earn nothing (no negative interest)', () => {
  assert.equal(dailyInterest(0, period(4.5)).netMicro, BigInt(0));
  assert.equal(dailyInterest(-5_000_000, period(4.5)).netMicro, BigInt(0));
  assert.deepEqual(planInterest(wallet(0, on()), [], '2026-10-05'), []);
  assert.deepEqual(planInterest(wallet(-1_000_000, on()), [], '2026-10-05'), []);
});

test('one completed day: credited whole rupiah (rounded half up); today is never credited early', () => {
  const plan = planInterest(wallet(10_000_000, on()), [], '2026-10-02');
  assert.equal(plan.length, 1);
  assert.deepEqual([plan[0].id, plan[0].date, plan[0].amount], [interestId('jenius', '2026-10-01'), '2026-10-01', 986]);
  assert.equal(plan[0].record.closing, 10_000_000);
  assert.equal(plan[0].record.carryOutMicro, 0);
  assert.deepEqual(planInterest(wallet(10_000_000, on()), [], '2026-10-01'), []);
});

test('catch-up over missed days compounds day by day on each closing balance', () => {
  const plan = planInterest(wallet(10_000_000, on()), [], '2026-10-05');
  assert.deepEqual(plan.map(p => p.date), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.equal(plan[1].record.closing, 10_000_986);
  assert.equal(plan[2].record.closing, 10_000_986 + plan[1].amount);
  // Not "today's balance × 4 days": each day uses its own closing balance.
  let balance = 10_000_000;
  for (const p of plan) { assert.equal(p.record.closing, balance); assert.equal(p.amount, Math.round(p.record.netMicro / 1e6)); balance += p.amount; }
});

test('a transaction during the catch-up period changes the following days only', () => {
  const plan = planInterest(wallet(10_000_000, on()), [tx('2026-10-03', 'expense', 4_000_000, { categoryId: 'c' })], '2026-10-05');
  assert.equal(plan[0].amount, 986);
  assert.equal(plan[2].record.closing, 10_000_000 + plan[0].amount + plan[1].amount - 4_000_000);
  assert.ok(plan[2].amount < plan[1].amount);
});

test('a late transaction the same day counts: the day closes with it', () => {
  const plan = planInterest(wallet(10_000_000, on()), [tx('2026-10-01', 'income', 5_000_000, { time: '23:30' })], '2026-10-02');
  assert.equal(plan[0].record.closing, 15_000_000);
});

test('no duplicates: applying the plan, then planning again (refresh, second call, second device) changes nothing', () => {
  const w = wallet(10_000_000, on());
  const first = planInterest(w, [], '2026-10-05');
  const changes = reconcileInterest(w, first, [], '2026-10-05');
  assert.equal(changes.create.length, 4);
  const stored = asTransactions(changes.create);
  const again = reconcileInterest(w, planInterest(w, stored, '2026-10-05'), stored, '2026-10-05');
  assert.deepEqual([again.create.length, again.update.length, again.remove.length], [0, 0, 0]);
  // Same ids from two independent calls: the database write is keyed on them, so it cannot double.
  assert.deepEqual(planInterest(w, [], '2026-10-05').map(p => p.id), first.map(p => p.id));
  // The next day only adds the newly completed day.
  const next = reconcileInterest(w, planInterest(w, stored, '2026-10-06'), stored, '2026-10-06');
  assert.deepEqual(next.create.map(p => p.date), ['2026-10-05']);
});

test('nothing before the start date (enabling today does not backfill years)', () => {
  const plan = planInterest(wallet(50_000_000, { ...on(), startDate: '2026-10-04', periods: [period(4.5, true, 20, '2026-10-04')] }), [tx('2025-01-01', 'income', 1)], '2026-10-06');
  assert.deepEqual(plan.map(p => p.date), ['2026-10-04', '2026-10-05']);
});

test('turning off stops new interest and keeps the old records', () => {
  const w = wallet(10_000_000, on());
  const stored = asTransactions(planInterest(w, [], '2026-10-04'));
  const off = updateInterestSettings(w.interest, { enabled: false, rate: 4.5, basis: 'year', tax: true, taxRate: 20, startDate: '' }, '2026-10-04');
  assert.equal(off.enabled, false); assert.equal(off.endDate, '2026-10-04');
  const changes = reconcileInterest({ ...w, interest: off }, planInterest({ ...w, interest: off }, stored, '2026-10-10'), stored, '2026-10-10');
  assert.deepEqual([changes.create.length, changes.remove.length], [0, 0]);
  // Turned on again later: a new window; the old records stay and count as money in the wallet.
  const again = updateInterestSettings(off, { enabled: true, rate: 4.5, basis: 'year', tax: true, taxRate: 20, startDate: '2026-10-08' }, '2026-10-08');
  const plan = planInterest({ ...w, interest: again }, stored, '2026-10-09');
  assert.deepEqual(plan.map(p => p.date), ['2026-10-08']);
  assert.equal(plan[0].record.closing, 10_000_000 + stored.reduce((n, t) => n + t.amount, 0));
  assert.equal(reconcileInterest({ ...w, interest: again }, plan, stored, '2026-10-09').remove.length, 0);
});

test('a rate change applies from its date only; old days keep the rate they used', () => {
  const w = wallet(10_000_000, on());
  const changed = updateInterestSettings(w.interest, { enabled: true, rate: 6, basis: 'year', tax: true, taxRate: 20, startDate: '2026-10-01' }, '2026-10-03');
  assert.deepEqual(changed.periods.map(p => [p.from, p.rate]), [['2026-10-01', 4.5], ['2026-10-03', 6]]);
  const plan = planInterest({ ...w, interest: changed }, [], '2026-10-05');
  assert.deepEqual(plan.map(p => p.record.rate), [4.5, 4.5, 6, 6]);
  // Records made before the change are not rewritten.
  const before = asTransactions(planInterest(w, [], '2026-10-03'));
  const changes = reconcileInterest({ ...w, interest: changed }, planInterest({ ...w, interest: changed }, before, '2026-10-05'), before, '2026-10-05');
  assert.deepEqual([changes.update.length, changes.create.map(p => p.date)], [0, ['2026-10-03', '2026-10-04']]);
});

test('a backdated transaction recalculates the affected days (update, not duplicate)', () => {
  const w = wallet(10_000_000, on());
  const stored = asTransactions(planInterest(w, [], '2026-10-05'));
  const backdated = tx('2026-10-02', 'expense', 9_000_000, { categoryId: 'c' });
  const all = [...stored, backdated];
  const changes = reconcileInterest(w, planInterest(w, all, '2026-10-05'), all, '2026-10-05');
  assert.deepEqual(changes.create, []);
  assert.deepEqual(changes.update.map(p => p.date), ['2026-10-02', '2026-10-03', '2026-10-04']);
  assert.ok(changes.update.every(p => p.amount < 200));
  // A day that no longer earns anything loses its record.
  const empty = tx('2026-10-02', 'expense', 10_000_986, { categoryId: 'c' });
  const gone = reconcileInterest(w, planInterest(w, [...stored, empty], '2026-10-05'), [...stored, empty], '2026-10-05');
  assert.deepEqual(gone.remove.map(t => t.date), ['2026-10-02', '2026-10-03', '2026-10-04']);
});

test('rounding: half up per payout (10,77 → 11, 10,30 → 10), nothing carried; under Rp0,50 a day earns nothing', async () => {
  const { creditOf } = await import('../lib/wallet-interest.ts');
  assert.equal(creditOf(BigInt(10_770_000)), 11); assert.equal(creditOf(BigInt(10_500_000)), 11);
  assert.equal(creditOf(BigInt(10_499_999)), 10); assert.equal(creditOf(BigInt(10_300_000)), 10); assert.equal(creditOf(BigInt(0)), 0);
  const plan = planInterest(wallet(100_000, on(4.5, { tax: false })), [], addDays('2026-10-01', 30)); // ≈ Rp12,33 a day
  assert.ok(plan.length === 30 && plan.every(p => p.amount === 12));
  assert.ok(plan.every(p => p.record.carryInMicro === 0 && p.record.carryOutMicro === 0));
  assert.deepEqual(planInterest(wallet(3_000, on(4.5, { tax: false })), [], addDays('2026-10-01', 30)), []); // ≈ Rp0,37 a day
});

test('large balances stay exact', () => {
  const d = dailyInterest(250_000_000_000, period(5.25));
  assert.equal(microToRupiah(d.netMicro).toFixed(2), '28767123.29');
});

test('simulation uses the same formula as the engine', () => {
  const sim = simulateInterest(10_000_000, period(4.5), 30);
  const d = dailyInterest(10_000_000, period(4.5));
  assert.equal(sim.gross, microToRupiah(d.grossMicro)); assert.equal(sim.net, microToRupiah(d.netMicro));
  const plan = planInterest(wallet(10_000_000, on()), [], addDays('2026-10-01', 30));
  assert.equal(sim.total, plan.reduce((n, p) => n + p.amount, 0));
  assert.equal(sim.ending, 10_000_000 + sim.total);
});

test('today estimate is informational: from the balance so far, not credited', () => {
  const w = wallet(10_000_000, on());
  const est = estimateToday(w, [tx('2026-10-03', 'income', 1_000_000)], '2026-10-03');
  assert.equal(est.closing, 11_000_000); assert.equal(est.net, 1085);
  assert.equal(estimateToday(wallet(10_000_000, undefined), [], '2026-10-03'), null);
});

test('wallets without the setting, and archived or removed ones, get nothing', () => {
  assert.deepEqual(planInterest(wallet(10_000_000, undefined), [], '2026-10-05'), []);
  assert.deepEqual(planInterest(wallet(10_000_000, { ...on(), enabled: false }), [], '2026-10-05'), []);
  assert.deepEqual(reconcileInterest(wallet(10_000_000, undefined), [], [], '2026-10-05'), { create: [], update: [], remove: [] });
});

test('monthly basis is 12× the monthly rate per year', () => {
  assert.equal(dailyInterest(10_000_000, { rate: 0.375, basis: 'month', tax: false, taxRate: 0 }).grossMicro, dailyInterest(10_000_000, { rate: 4.5, basis: 'year', tax: false, taxRate: 0 }).grossMicro);
});

const scheduled = (payout, payoutDay, from = '2026-10-01') => ({ enabled: true, startDate: from, periods: [{ from, rate: 4.5, basis: 'year', tax: true, taxRate: 20, payout, payoutDay }] });

test('monthly payout on a chosen date: accrues daily, pays once, no compounding before the payout', async () => {
  const { runInterest, isPayoutDay } = await import('../lib/wallet-interest.ts');
  const w = wallet(10_000_000, scheduled('month', 25));
  const { planned, pending } = runInterest(w, [], '2026-11-03');
  assert.deepEqual(planned.map(p => p.date), ['2026-10-25']);
  assert.equal(planned[0].record.days, 25); assert.equal(planned[0].record.accrualFrom, '2026-10-01');
  // 25 days on an unchanged balance (nothing paid in between): 25 × Rp986,30
  assert.equal(planned[0].amount, Math.round(25 * 986.30137));
  assert.equal(pending.from, '2026-10-26'); assert.equal(pending.days, 8); assert.equal(pending.nextPayout, '2026-11-25');
  // Day 31 in a 30-day month pays on the 30th; February on its last day.
  assert.ok(isPayoutDay('2026-11-30', { payout: 'month', payoutDay: 31 }));
  assert.ok(isPayoutDay('2027-02-28', { payout: 'month', payoutDay: 30 }));
  assert.ok(!isPayoutDay('2026-10-30', { payout: 'month', payoutDay: 31 }));
});

test('weekly payout on a weekday', async () => {
  const { runInterest } = await import('../lib/wallet-interest.ts');
  // 2026-10-05 is a Monday (1).
  const { planned } = runInterest(wallet(10_000_000, scheduled('week', 1)), [], '2026-10-20');
  assert.deepEqual(planned.map(p => [p.date, p.record.days]), [['2026-10-05', 5], ['2026-10-12', 7], ['2026-10-19', 7]]);
  assert.ok(planned[1].record.closing > 10_000_000); // the first payment compounds from then on
});

test('turning off pays what has accrued on the last day; a schedule change keeps past payouts', async () => {
  const { runInterest } = await import('../lib/wallet-interest.ts');
  const w = wallet(10_000_000, scheduled('month', 31));
  const off = updateInterestSettings(w.interest, { enabled: false, rate: 4.5, basis: 'year', tax: true, taxRate: 20, startDate: '' }, '2026-10-11');
  const { planned } = runInterest({ ...w, interest: off }, [], '2026-10-20');
  assert.deepEqual(planned.map(p => [p.date, p.record.days]), [['2026-10-10', 10]]);
  const daily = updateInterestSettings(w.interest, { enabled: true, rate: 4.5, basis: 'year', tax: true, taxRate: 20, startDate: '2026-10-01', payout: 'day' }, '2026-11-05');
  assert.deepEqual(daily.periods.map(p => [p.from, p.payout]), [['2026-10-01', 'month'], ['2026-11-05', 'day']]);
  const plan = runInterest({ ...w, interest: daily }, [], '2026-11-07').planned;
  assert.deepEqual(plan.map(p => p.date), ['2026-10-31', '2026-11-05', '2026-11-06']);
  assert.equal(plan[1].record.days, 5); // 1–5 Nov accrued under the monthly schedule, paid on the first daily payout
});

test('simulation follows the payout schedule', () => {
  const daily = simulateInterest(10_000_000, { ...period(4.5), payout: 'day' }, 30);
  const monthly = simulateInterest(10_000_000, { ...period(4.5), payout: 'month' }, 30);
  assert.ok(monthly.total < daily.total && daily.total - monthly.total < 60); // less compounding before the payout
});

test('a payout confirmed or corrected to the bank figure is never rewritten, and later days build on it', async () => {
  const { runInterest, unconfirmedInterest } = await import('../lib/wallet-interest.ts');
  const w = wallet(10_000_000, on());
  const stored = asTransactions(planInterest(w, [], '2026-10-04'));
  // The bank paid Rp990 on 2 Oct instead of the app's Rp986.
  const corrected = stored.map(t => t.date === '2026-10-02' ? { ...t, amount: 990, interest: { ...t.interest, confirmed: { at: 'x', calculated: t.amount } } } : t);
  const { planned } = runInterest(w, corrected, '2026-10-04');
  assert.deepEqual(planned.map(p => p.date), ['2026-10-01', '2026-10-03']);
  assert.equal(planned[1].record.closing, 10_000_000 + 986 + 990);
  const changes = reconcileInterest(w, planned, corrected, '2026-10-04');
  assert.ok(!changes.remove.some(t => t.date === '2026-10-02') && !changes.update.some(p => p.date === '2026-10-02'));
  assert.deepEqual(unconfirmedInterest(corrected, 'jenius').map(t => t.date), ['2026-10-03', '2026-10-01']);
});

test('a deleted (skipped) payout is not made again; later days are worked out without it', () => {
  const settings = on(4.5);
  const full = planInterest(wallet(10_000_000, settings), [], '2026-10-06');
  const gone = full.find(p => p.date === '2026-10-03');
  // The user deleted 3 Okt: it is removed from the records and noted as skipped.
  const kept = asTransactions(full.filter(p => p !== gone));
  const skipped = wallet(10_000_000, { ...settings, skipped: ['2026-10-03'] });
  const plan = planInterest(skipped, kept, '2026-10-06');
  assert.ok(!plan.some(p => p.date === '2026-10-03'));
  const changes = reconcileInterest(skipped, plan, kept, '2026-10-06');
  assert.equal(changes.create.length, 0);
  assert.ok(!changes.create.some(p => p.id === gone.id));
  // The days after carry one rupiah less of base: recalculated as updates, never duplicates.
  assert.ok(changes.update.every(p => p.date > '2026-10-03'));
  assert.equal(changes.remove.length, 0);
  // Changing the rate later keeps the skipped list.
  const next = updateInterestSettings(skipped.interest, { enabled: true, rate: 5, basis: 'year', tax: true, taxRate: 20, startDate: '2026-10-01' }, '2026-10-06');
  assert.deepEqual(next.skipped, ['2026-10-03']);
});

test('a deleted weekly payout drops what had accrued up to it; the next week starts fresh', () => {
  const settings = scheduled('week', 7);
  const plan = planInterest(wallet(100_000_000, { ...settings, skipped: ['2026-10-04'] }), [], '2026-10-13');
  assert.ok(!plan.some(p => p.date === '2026-10-04'));
  const after = plan.find(p => p.date === '2026-10-11');
  assert.equal(after.record.accrualFrom, '2026-10-05');
  assert.equal(after.record.days, 7);
});
