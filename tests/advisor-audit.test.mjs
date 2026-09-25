import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFinances, potentialSaving } from '../lib/advisor.ts';

// Insight audit: the cards, the paycheck plan and the numbers behind them must never contradict each other.
const cat = (id, name) => ({ id, name, type: 'expense', parentId: null, icon: '', sortOrder: 0, isArchived: false });
const budget = (id, categoryId, amount) => ({ id, name: '', categoryId, subcategoryId: null, amount, classification: 'living', cycleType: 'salary', rolloverEnabled: false, active: true });
let n = 0;
const tx = (type, amount, date, categoryId = null, extra = {}) => ({ id: `a${n++}`, type, amount, date, walletId: 'op', destinationWalletId: null, categoryId, subcategoryId: null, merchant: '', description: '', notes: '', tags: [], claimId: null, debtId: null, receivableId: null, fundId: null, recurringTransactionId: null, draftId: null, adjustmentDirection: 'out', ...extra });
const day = (start, offset) => { const [y, m, d] = start.split('-').map(Number); const date = new Date(y, m - 1, d + offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const starts = ['2026-03-25', '2026-04-25', '2026-05-25', '2026-06-25', '2026-07-25', '2026-08-25'];

function build({ history = null, wallets = [], funds = [], budgets = [], debts = [], categories = null } = {}) {
  const items = history || starts.flatMap(start => [tx('income', 8_000_000, start), tx('expense', 1_500_000, day(start, 3), 'food'), tx('expense', 400_000, day(start, 6), 'transport'), tx('expense', 700_000, day(start, 10), 'fun')]);
  items.push(tx('income', 8_000_000, '2026-09-25'), tx('expense', 700_000, '2026-09-28', 'food'));
  return { wallets, categories: categories || [cat('food', 'Makan & Minum'), cat('transport', 'Transportasi'), cat('fun', 'Hiburan'), cat('rent', 'Sewa Kos'), cat('snack', 'Jajan')], budgets, transactions: items, claims: [], receivables: [], debts, funds, recurring: [], drafts: [], plannedTransactions: [], categorizationRules: [], financialNotes: [], cycleSnapshots: [], wishlist: [] };
}
const run = (data, extra = {}) => analyzeFinances({ data, history: data.transactions, today: '2026-10-12', salaryDay: 25, monthlySalary: 8_000_000, warnPercent: 80, stat: { free: 5_000_000, reserved: 0, netWorth: 0, liabilities: 0 }, committed: 0, ...extra });
const wallet = (id, name, group, balance, extra = {}) => ({ id, name, type: group === 'savings' ? 'savings' : 'bank', group, cachedBalance: balance, isArchived: false, ...extra });
const emergencyKantong = (walletIds, targetAmount) => ({ id: 'dd', name: 'Dana darurat', kind: 'emergency', walletIds, linkedWalletId: walletIds[0], currentAmount: 0, targetAmount, monthlyContribution: 0, targetDate: '', notes: '' });

test('one emergency amount everywhere: the card, the paycheck plan and monthly investing agree', () => {
  const data = build({ wallets: [wallet('op', 'BCA', 'operational', 3_000_000), wallet('md', 'Mandiri', 'savings', 1_000_000)], funds: [emergencyKantong(['md'], 10_000_000)] });
  const a = run(data, { profile: { emergencyMonths: 1, savingsTarget: .2 } });
  const row = a.paycheck.find(r => r.key === 'emergency');
  assert.ok(row && row.amount > 0);
  const card = a.obligations.find(f => f.id === 'emergency');
  assert.match(card.detail, new RegExp(`Sisihkan Rp${row.amount.toLocaleString('id-ID').replace(/\./g, '\\.')} per bulan`));
  const investRow = a.paycheck.find(r => r.key === 'invest');
  assert.equal(a.invest?.monthly || 0, investRow ? Math.round(investRow.amount / 10_000) * 10_000 : 0);
});

test('a target on the emergency kantong wins over the Insight profile, and the page says where it comes from', () => {
  const data = build({ wallets: [wallet('op', 'BCA', 'operational', 3_000_000), wallet('md', 'Mandiri', 'savings', 1_000_000)], funds: [emergencyKantong(['md'], 10_000_000)] });
  const a = run(data, { profile: { emergencyMonths: 1 } });
  assert.equal(a.idle.emergencyTarget, 10_000_000);
  assert.equal(a.idle.emergencyShortfall, 9_000_000);
  assert.match(a.idle.emergencyTargetText, /dari kantong/);
  // Without a kantong target the profile decides.
  const b = run(build({ wallets: data.wallets, funds: [emergencyKantong(['md'], 0)] }), { profile: { emergencyMode: 'amount', emergencyAmount: 4_000_000 } });
  assert.equal(b.idle.emergencyTarget, 4_000_000);
});

test('a budget that keeps overflowing is never told to "rise" to a lower amount', () => {
  const history = starts.flatMap(start => [tx('income', 8_000_000, start), tx('expense', 1_300_000, day(start, 3), 'food')]);
  const a = run(build({ history, budgets: [budget('b-food', 'food', 1_000_000)] }), { profile: { budgetStyle: 'strict' } });
  const tip = a.budgetTips.find(f => f.id === 'tight-b-food');
  assert.ok(tip, 'tight budget found');
  assert.ok(tip.apply.amount > 1_000_000, `raise to ${tip.apply.amount}`);
  assert.match(tip.detail, /dari 3 periode/);
});

test('"Potensi hemat" counts overlapping suggestions once', () => {
  const list = [{ id: 'cut-fun', saving: 150_000 }, { id: 'leak-fun', saving: 100_000 }, { id: 'new-fun', saving: 40_000 }, { id: 'cut-snack', saving: 50_000 }, { id: 'split', saving: 180_000 }, { id: 'shrink-b1', saving: 70_000 }];
  assert.equal(potentialSaving(list), 200_000 + 70_000);
});

test('a cycle where recording started halfway is left out of the averages', () => {
  // Recording started on 10 April, halfway through the 25 Mar – 25 Apr cycle.
  const history = [tx('expense', 300_000, '2026-04-10', 'food'), ...starts.slice(1).flatMap(start => [tx('income', 8_000_000, start), tx('expense', 2_000_000, day(start, 3), 'food')])];
  const a = run(build({ history }));
  assert.equal(a.cyclesUsed, 5);
  assert.equal(a.summary.avgExpense, 2_000_000);
});

test('uncategorised spending is never a category to cut or budget; Insight asks to categorise it', () => {
  const history = starts.flatMap(start => [tx('income', 8_000_000, start), tx('expense', 1_500_000, day(start, 3), 'food'), tx('expense', 900_000, day(start, 5))]);
  const a = run(build({ history }));
  assert.ok(!a.categories.some(c => c.id === 'uncategorized'));
  assert.ok(![...a.reduce, ...a.budgetTips].some(f => f.id.includes('uncategorized')));
  assert.ok(a.alerts.some(f => f.id === 'uncategorized'));
});

test('goal money kept in a daily wallet and "Disimpan" wallets are not idle daily money', () => {
  const wallets = [wallet('op', 'BCA', 'operational', 12_000_000), wallet('keep', 'Cadangan', 'operational', 5_000_000, { isReserved: true })];
  const goal = { id: 'g', name: 'Laptop', kind: 'goal', linkedWalletId: 'op', currentAmount: 4_000_000, targetAmount: 10_000_000, monthlyContribution: 0, targetDate: '', notes: '' };
  const a = run(build({ wallets, funds: [goal] }));
  assert.equal(a.idle.operationalBalance, 12_000_000, 'the Disimpan wallet is left out');
  assert.ok(a.idle.opCalc.some(r => r.label === 'Sudah terkumpul untuk tujuan dana' && r.amount === 4_000_000));
});

test('rent paid right after payday is not an "efek gajian" habit', () => {
  const history = starts.flatMap(start => [tx('income', 8_000_000, start), tx('expense', 3_000_000, day(start, 1), 'rent'), ...[4, 9, 14, 19, 24].map(d => tx('expense', 60_000, day(start, d), 'snack')), ...[2, 8, 13, 18, 23, 27].map(d => tx('expense', 45_000, day(start, d), 'food'))]);
  const a = run(build({ history }));
  assert.ok(!a.habits.some(f => f.id === 'payday'));
});

test('a debt without an instalment amount is not called "Cicilan 0%"', () => {
  const a = run(build({ debts: [{ id: 'd1', name: 'Pinjaman teman', status: 'active', outstandingAmount: 2_000_000, installmentAmount: 0, interestRate: 0 }] }));
  const card = a.obligations.find(f => f.id === 'debt');
  assert.ok(!/Cicilan 0%/.test(card.title), card.title);
  assert.match(card.detail, /belum diisi/);
});

test('no "idle daily money" card while money may not last until payday', () => {
  const data = build({ wallets: [wallet('op', 'BCA', 'operational', 9_000_000)] });
  const a = run(data, { stat: { free: 0, reserved: 0, netWorth: 0, liabilities: 0 } });
  assert.ok([...a.alerts, ...a.actions].some(f => f.id === 'runway'));
  assert.ok(!a.wealth.some(f => f.id === 'idle-operational'));
  assert.equal(a.idle.investable, 0);
});

test('bills with "want" words stay needs', () => {
  const history = starts.flatMap(start => [tx('income', 8_000_000, start), tx('expense', 400_000, day(start, 3), 'net')]);
  const a = run(build({ history, categories: [cat('net', 'Langganan Internet')] }));
  assert.equal(a.categories.find(c => c.id === 'net').kind, 'need');
});
