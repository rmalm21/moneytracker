import test from 'node:test';
import assert from 'node:assert/strict';
import { metrics } from '../lib/accounting.ts';
import { walletActions, walletAllows } from '../lib/wallet-capabilities.ts';
import { calculateCycleSnapshot } from '../lib/finance-control.ts';
import { forecast } from '../lib/forecast.ts';

// Whole-app audit: money figures shown on different pages must agree, and corrections must always be possible.
const wallet = (id, balance, extra = {}) => ({ id, name: id, type: 'bank', openingBalance: balance, cachedBalance: balance, purpose: '', isReserved: false, isSpendable: true, includeInNetWorth: true, isArchived: false, ...extra });
const empty = { wallets: [], categories: [], budgets: [], transactions: [], claims: [], receivables: [], debts: [], funds: [], recurring: [], drafts: [], plannedTransactions: [], categorizationRules: [], financialNotes: [], cycleSnapshots: [], wishlist: [] };

test('Uang bebas leaves out Disimpan wallets, kantong wallets and goal money, and says how', () => {
  const data = { ...empty,
    wallets: [wallet('bca', 5_000_000), wallet('mandiri', 3_000_000), wallet('tab', 10_000_000, { isReserved: true, isSpendable: false })],
    funds: [
      { id: 'dd', name: 'Dana darurat', kind: 'emergency', walletIds: ['mandiri'], linkedWalletId: 'mandiri', currentAmount: 0, targetAmount: 0, monthlyContribution: 0, targetDate: '', notes: '' },
      { id: 'g', name: 'Laptop', kind: 'goal', linkedWalletId: 'bca', currentAmount: 1_000_000, targetAmount: 8_000_000, monthlyContribution: 0, targetDate: '', notes: '' },
    ] };
  const m = metrics(data, '2026-09-25', '2026-10-25');
  assert.equal(m.free, 1_000_000 * 4, 'BCA 5 jt − 1 jt goal; Mandiri is in a kantong');
  assert.deepEqual([m.freeParts.usable, m.freeParts.kantongMoney, m.freeParts.goalMoney], [8_000_000, 3_000_000, 1_000_000]);
  assert.equal(m.reserved, 10_000_000 + 3_000_000 + 1_000_000);
  assert.equal(m.free + m.reserved, m.assets, 'every rupiah is either free or set aside');
});

test('a balance correction works on any active wallet, in both directions', () => {
  const savings = wallet('tab', 1_000_000, { isReserved: true, isSpendable: false, canPay: false });
  for (const adjustmentDirection of ['in', 'out']) {
    const { source } = walletActions({ type: 'adjustment', adjustmentDirection });
    assert.ok(walletAllows(savings, source), adjustmentDirection);
  }
  assert.ok(!walletAllows({ ...savings, isArchived: true }, walletActions({ type: 'adjustment', adjustmentDirection: 'out' }).source));
  assert.ok(!walletAllows(savings, walletActions({ type: 'expense' }).source), 'spending from it is still blocked');
});

test('cycle report counts a category budget and its subcategory budget once', () => {
  const budget = (id, categoryId, subcategoryId, amount) => ({ id, name: id, categoryId, subcategoryId, amount, classification: 'living', cycleType: 'salary', rolloverEnabled: false, active: true });
  const data = { ...empty, categories: [{ id: 'food', name: 'Makan', type: 'expense', parentId: null }, { id: 'lunch', name: 'Makan siang', type: 'expense', parentId: 'food' }],
    budgets: [budget('b1', 'food', null, 2_000_000), budget('b2', 'food', 'lunch', 800_000)] };
  const ledger = [{ id: 't', type: 'expense', amount: 500_000, date: '2026-09-28', walletId: 'w', categoryId: 'food', subcategoryId: 'lunch' }];
  const s = calculateCycleSnapshot(data, ledger, { start: '2026-09-25', end: '2026-10-25' });
  assert.equal(s.budgetTotal, 2_000_000);
  assert.equal(s.budgetSpent, 500_000);
});

test('debts settled without a wallet are added back for earlier cycles', () => {
  const data = { ...empty, debts: [{ id: 'd', name: 'Pinjaman', originalAmount: 1_000_000, outstandingAmount: 400_000, status: 'open', manualPayments: [{ id: 'p', amount: 600_000, date: '2026-10-01' }] }] };
  const before = calculateCycleSnapshot(data, [], { start: '2026-08-25', end: '2026-09-25' });
  assert.equal(before.debtOutstanding, 1_000_000);
});

test('forecast spending never assumes less than the spending pace just because a few budgets exist', () => {
  const f = forecast({ free: 5_000_000, spentThisCycle: 3_000_000, daysElapsed: 15, daysRemaining: 15, daysTotal: 30, salary: 8_000_000, totalBudget: 1_000_000 });
  assert.equal(f.monthlyOut, 6_000_000);
});
