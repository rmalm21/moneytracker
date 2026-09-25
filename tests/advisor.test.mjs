import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFinances, categoryKind, friendlyRound, pastCycles } from '../lib/advisor.ts';

test('suggested amounts are rounded up to friendly numbers', () => {
  assert.equal(friendlyRound(123_400), 125_000);
  assert.equal(friendlyRound(1_234_000), 1_240_000);
  assert.equal(friendlyRound(2_310_000), 2_350_000);
  assert.equal(friendlyRound(0), 5_000);
});

test('categories are split into needs and wants by name', () => {
  for (const name of ['Makan & Minum', 'Transportasi', 'Tagihan Listrik', 'Belanja Dapur']) assert.equal(categoryKind(name), 'need', name);
  for (const name of ['Jajan', 'Hiburan', 'Kopi', 'Belanja Online']) assert.equal(categoryKind(name), 'want', name);
  // Giving is never treated as something to cut; unknown subcategories follow their parent.
  for (const name of ['Sedekah', 'Zakat', 'Donasi']) assert.equal(categoryKind(name), 'need', name);
  assert.equal(categoryKind('Warteg', 'Makan & Minum'), 'need');
  assert.equal(categoryKind('Warteg'), 'want');
});

test('past cycles are complete salary cycles before the current one, oldest first', () => {
  const list = pastCycles({ start: '2026-09-25', end: '2026-10-25' }, 3, 25);
  assert.deepEqual(list.map(c => [c.start, c.end]), [['2026-06-25', '2026-07-25'], ['2026-07-25', '2026-08-25'], ['2026-08-25', '2026-09-25']]);
});

const cat = (id, name) => ({ id, name, type: 'expense', parentId: null, icon: '', sortOrder: 0, isArchived: false });
const budget = (id, categoryId, amount) => ({ id, name: '', categoryId, subcategoryId: null, amount, classification: 'living', cycleType: 'salary', rolloverEnabled: false, active: true });
let n = 0;
const tx = (type, amount, date, categoryId = null, extra = {}) => ({ id: `t${n++}`, type, amount, date, walletId: 'A', destinationWalletId: null, categoryId, subcategoryId: null, merchant: '', description: '', notes: '', tags: [], claimId: null, debtId: null, receivableId: null, fundId: null, recurringTransactionId: null, draftId: null, adjustmentDirection: 'out', ...extra });

function sampleData() {
  n = 0;
  return buildSample().data;
}
function sample() {
  const { data, history } = buildSample();
  return analyzeFinances({ data, history, today: '2026-10-12', salaryDay: 25, monthlySalary: 8_000_000, warnPercent: 80, stat: { free: 5_000_000, reserved: 3_000_000, netWorth: 8_000_000, liabilities: 0 }, committed: 0 });
}
function buildSample() {
  const history = [];
  const starts = ['2026-03-25', '2026-04-25', '2026-05-25', '2026-06-25', '2026-07-25', '2026-08-25'];
  const jajan = [200_000, 200_000, 210_000, 200_000, 420_000, 500_000];
  starts.forEach((start, i) => {
    const d = (day) => { const [y, m] = start.split('-').map(Number); const date = new Date(y, m - 1, 25 + day); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
    history.push(tx('income', 8_000_000, d(0)));
    history.push(tx('expense', 400_000, d(3), 'transport'));
    history.push(tx('expense', 1_300_000, d(5), 'food'));
    history.push(tx('expense', 600_000, d(9), 'fun'));
    history.push(tx('expense', jajan[i], d(12), 'snack'));
  });
  // Current cycle, 18 days in: transport far below its usual pace.
  history.push(tx('income', 8_000_000, '2026-09-25'), tx('expense', 50_000, '2026-09-28', 'transport'), tx('expense', 900_000, '2026-10-01', 'food'));
  const data = { wallets: [], categories: [cat('food', 'Makan & Minum'), cat('transport', 'Transportasi'), cat('fun', 'Hiburan'), cat('snack', 'Jajan')], budgets: [budget('b-transport', 'transport', 1_000_000), budget('b-food', 'food', 1_000_000)], transactions: history, claims: [], receivables: [], debts: [], funds: [], recurring: [], drafts: [], plannedTransactions: [], categorizationRules: [], financialNotes: [], cycleSnapshots: [] };
  return { data, history };
}

test('advisor reads history and suggests what to cut, loosen and rebudget', () => {
  const advice = sample();
  assert.equal(advice.enoughHistory, true);
  assert.equal(advice.cyclesUsed, 6);
  assert.ok(advice.score >= 0 && advice.score <= 100);
  assert.equal(advice.parts.length, 6);
  // Loose budget: used 40% every cycle → shrink to p75 × 1.05.
  const shrink = advice.budgetTips.find(f => f.id === 'shrink-b-transport');
  assert.deepEqual(shrink.apply, { kind: 'set-budget', budgetId: 'b-transport', amount: 420_000 });
  assert.equal(shrink.saving, 580_000);
  // Tight budget: over every cycle → raise to a realistic amount.
  const tight = advice.budgetTips.find(f => f.id === 'tight-b-food');
  assert.equal(tight.tone, 'bad');
  assert.equal(tight.apply.amount, 1_370_000);
  // Big category without a budget gets one.
  const created = advice.budgetTips.find(f => f.id === 'new-fun');
  assert.equal(created.apply.kind, 'create-budget');
  assert.equal(created.apply.categoryId, 'fun');
  // A rising discretionary category is flagged to reduce.
  assert.ok(advice.reduce.some(f => f.id === 'cut-snack'));
  assert.ok(!advice.reduce.some(f => f.id === 'cut-food'), 'needs are not told to be cut');
  // Transport is far under its usual pace this cycle.
  assert.ok(advice.loose.some(f => f.id === 'room-transport'));
  assert.ok(advice.actions.length > 0 && advice.actions.length <= 6);
  assert.equal(advice.cycles.at(-1).label, 'Kini');
  // Emphasis markers in the explanations always come in pairs.
  for (const f of [...advice.reduce, ...advice.loose, ...advice.budgetTips, ...advice.habits, ...advice.recurring, ...advice.obligations, ...advice.alerts]) {
    assert.equal(f.detail.split('**').length % 2, 1, f.id);
    assert.equal(f.detail.split('==').length % 2, 1, f.id);
  }
});

test('advisor says when there is not enough history yet', () => {
  const data = { wallets: [], categories: [], budgets: [], transactions: [], claims: [], receivables: [], debts: [], funds: [], recurring: [], drafts: [], plannedTransactions: [], categorizationRules: [], financialNotes: [], cycleSnapshots: [] };
  const advice = analyzeFinances({ data, history: [], today: '2026-10-12', salaryDay: 25, monthlySalary: 0, warnPercent: 80, stat: { free: 0, reserved: 0, netWorth: 0, liabilities: 0 }, committed: 0 });
  assert.equal(advice.enoughHistory, false);
  assert.equal(advice.cyclesUsed, 0);
  assert.ok(Number.isFinite(advice.score));
});

import { resolveInsightProfile, scoreRiskQuiz, suggestedEmergencyMonths } from '../lib/insight-profile.ts';
import { allocation, futureValue } from '../lib/invest-plan.ts';

test('insight profile fills defaults and sizes the emergency fund to the household', () => {
  assert.equal(resolveInsightProfile(null).emergencyMonths, 3);
  assert.equal(suggestedEmergencyMonths({ household: 'family', dependants: 2, income: 'fixed' }), 8);
  assert.equal(suggestedEmergencyMonths({ household: 'single', dependants: 0, income: 'variable' }), 6);
  assert.equal(resolveInsightProfile({ household: 'couple' }).emergencyMonths, 6);
  assert.equal(resolveInsightProfile({ emergencyMonths: 9 }).emergencyMonths, 9);
  const quiz = scoreRiskQuiz({ drop: 3, when: 3, share: 3 });
  assert.deepEqual([quiz.risk, quiz.horizon, quiz.score, quiz.max], ['agresif', 'long', 9, 9]);
  assert.equal(scoreRiskQuiz({ drop: 1, when: 1, share: 2 }).risk, 'konservatif');
  assert.equal(scoreRiskQuiz({ drop: 2, when: 2, share: 2 }).risk, 'moderat');
});

test('investment mix follows risk and horizon', () => {
  const short = allocation('agresif', 'short', 'experienced', 10_000_000);
  assert.deepEqual(short.map(i => i.key).sort(), ['deposito', 'rdpu']);
  const bold = allocation('agresif', 'long', 'experienced', 10_000_000);
  assert.equal(bold.find(i => i.key === 'saham').share, 55);
  assert.equal(bold.reduce((n, i) => n + i.share, 0), 100);
  const novice = allocation('agresif', 'long', 'none', 10_000_000);
  assert.equal(novice.find(i => i.key === 'saham').share, 20);
  assert.equal(novice.reduce((n, i) => n + i.share, 0), 100);
  assert.ok(allocation('konservatif', 'long', 'basic', 1).every(i => i.key !== 'saham'));
  assert.equal(futureValue(1_000_000, 0, 0, 5), 1_000_000);
  assert.ok(futureValue(1_000_000, 100_000, .06, 1) > 2_200_000);
});

test('idle money is found and routed: emergency fund first, then investing by profile', () => {
  const wallets = [
    { id: 'op', name: 'BCA', type: 'bank', group: 'operational', cachedBalance: 20_000_000, isArchived: false, isReserved: false },
    { id: 'sv', name: 'Tabungan', type: 'savings', group: 'savings', cachedBalance: 30_000_000, isArchived: false, isReserved: true },
  ];
  const run = (profile, sv = 30_000_000) => {
    const data = { ...sampleData(), wallets: wallets.map(w => w.id === 'sv' ? { ...w, cachedBalance: sv } : w) };
    return analyzeFinances({ data, history: data.transactions, today: '2026-10-12', salaryDay: 25, monthlySalary: 8_000_000, warnPercent: 80, stat: { free: 20_000_000, reserved: sv, netWorth: 0, liabilities: 0 }, committed: 0, profile });
  };
  const a = run({ risk: 'moderat', horizon: 'long', emergencyMonths: 3, personalized: true });
  assert.ok(a.idle.savingsExcess > 0 && a.idle.operational > 0);
  assert.equal(a.idle.emergencyShortfall, 0);
  assert.ok(a.wealth.some(f => f.id === 'idle-savings'));
  assert.ok(a.invest && a.invest.amount > 0 && a.invest.items.some(i => i.key === 'saham'));
  assert.ok(a.invest.sectors.length > 0);
  assert.ok(a.invest.projection[2].invested > a.invest.projection[2].idle);
  // A bigger emergency target swallows the savings excess before anything is invested.
  const b = run({ risk: 'moderat', horizon: 'long', emergencyMonths: 12 }, 5_000_000);
  assert.ok(b.idle.emergencyShortfall > 0);
  assert.equal(b.idle.savingsExcess, 0);
  assert.ok(b.idle.investable < a.idle.investable);
  assert.ok(b.obligations.some(f => f.id === 'emergency'));
  // Conservative profile never gets stocks.
  const c = run({ risk: 'konservatif', horizon: 'long' });
  assert.ok(c.invest.items.every(i => i.key !== 'saham') && c.invest.sectors === null);
  // Paycheck plan adds up to the average income.
  const total = a.paycheck.reduce((n, r) => n + r.amount, 0);
  assert.ok(Math.abs(total - a.summary.avgIncome) < 10_000, `${total} vs ${a.summary.avgIncome}`);
  // Savings target is personal.
  assert.equal(run({ savingsTarget: .5 }).personal.savingsTarget, .5);
});

const calcTotal = rows => rows.reduce((n, r) => r.op === '-' ? n - r.amount : r.op === '=' || r.op === '×' ? n : n + r.amount, 0);

test('thin history does not call the whole balance idle: salary-based needs and budgets are reserved', () => {
  n = 0;
  // Only a few small expenses recorded this cycle, salary known.
  const history = [tx('expense', 20_000, '2026-09-26', 'food'), tx('expense', 15_000, '2026-09-27', 'snack')];
  const wallets = [{ id: 'op', name: 'BCA', type: 'bank', group: 'operational', cachedBalance: 5_476_000, isArchived: false }, { id: 'sv', name: 'Tabungan', type: 'savings', group: 'savings', cachedBalance: 912_000, isArchived: false }];
  const data = { ...sampleData(), wallets, transactions: history, budgets: [] };
  const a = analyzeFinances({ data, history, today: '2026-09-27', salaryDay: 25, monthlySalary: 8_500_000, warnPercent: 80, stat: { free: 5_476_000, reserved: 912_000, netWorth: 0, liabilities: 0 }, committed: 0 });
  assert.equal(a.idle.needSource, 'salary');
  assert.equal(a.idle.monthlyNeed, 6_800_000);
  assert.equal(a.idle.operational, 0, 'nothing idle: salary-based needs until payday exceed the balance');
  assert.ok(!a.wealth.some(f => f.id === 'idle-operational'));
  assert.ok(a.idle.emergencyTarget >= 6_800_000 * 3);
});

test('unspent budgets, goal set-asides and wish list money are not idle; the breakdown adds up', () => {
  const base = sampleData();
  const wallets = [{ id: 'op', name: 'BCA', type: 'bank', group: 'operational', cachedBalance: 20_000_000, isArchived: false }];
  const run = extra => { const data = { ...base, wallets, ...extra }; return analyzeFinances({ data, history: data.transactions, today: '2026-10-12', salaryDay: 25, monthlySalary: 8_000_000, warnPercent: 80, stat: { free: 20_000_000, reserved: 0, netWorth: 0, liabilities: 0 }, committed: 0 }); };
  const plain = run({});
  const withWish = run({ wishlist: [{ id: 'w1', name: 'Laptop', emoji: '💻', price: 15_000_000, saved: 3_000_000, monthly: 1_000_000, priority: 1, status: 'active', addedDate: '2026-09-01', history: [] }] });
  assert.ok(withWish.idle.operational <= plain.idle.operational - 3_000_000 - 1_000_000 + 1, `${withWish.idle.operational} vs ${plain.idle.operational}`);
  assert.ok(withWish.paycheck.some(r => r.key === 'wish'));
  const f = withWish.wealth.find(x => x.id === 'idle-operational');
  assert.ok(f && f.calc.length >= 4);
  assert.equal(Math.round(calcTotal(f.calc.slice(0, -1))), Math.round(f.calc.at(-1).amount));
  const bigBudget = run({ budgets: [{ id: 'bb', name: '', categoryId: 'fun', subcategoryId: null, amount: 12_000_000, classification: 'living', cycleType: 'salary', rolloverEnabled: false, active: true }] });
  assert.ok(bigBudget.idle.budgetReserve > 11_000_000);
  assert.ok(bigBudget.idle.operational < plain.idle.operational);
});

test('personal overrides: fixed emergency amount, monthly need, buffer, idle minimum, syariah and excluded instruments', () => {
  const wallets = [{ id: 'op', name: 'BCA', type: 'bank', group: 'operational', cachedBalance: 20_000_000, isArchived: false }, { id: 'sv', name: 'Tabungan', type: 'savings', group: 'savings', cachedBalance: 30_000_000, isArchived: false }];
  const run = profile => { const data = { ...sampleData(), wallets }; return analyzeFinances({ data, history: data.transactions, today: '2026-10-12', salaryDay: 25, monthlySalary: 8_000_000, warnPercent: 80, stat: { free: 20_000_000, reserved: 30_000_000, netWorth: 0, liabilities: 0 }, committed: 0, profile }); };
  const a = run({ emergencyMode: 'amount', emergencyAmount: 25_000_000, monthlyNeed: 5_000_000, buffer: .3, risk: 'agresif', horizon: 'long', syariah: true, excluded: ['saham'] });
  assert.equal(a.idle.emergencyTarget, 25_000_000);
  assert.equal(a.idle.monthlyNeed, 5_000_000);
  assert.equal(a.idle.needSource, 'profile');
  assert.equal(a.idle.savingsExcess, 5_000_000);
  assert.ok(a.idle.opCalc.some(r => r.label.includes('30%') && r.amount === 1_500_000));
  assert.ok(a.invest.items.every(i => i.key !== 'saham'));
  assert.equal(a.invest.items.reduce((n, i) => n + i.share, 0), 100);
  assert.ok(a.invest.items.some(i => /sukuk|syariah/i.test(i.name)));
  const high = run({ idleMinimum: 100_000_000 });
  assert.ok(!high.wealth.some(f => f.id === 'idle-operational' || f.id === 'idle-savings'));
  assert.equal(run({ monthlyIncome: 12_000_000 }).summary.avgIncome, 12_000_000);
});

import { walletPockets } from '../lib/pockets.ts';
test('savings pockets: emergency pocket is the emergency fund; other pockets are set aside; the rest is unallocated', () => {
  const sv = { id: 'sv', name: 'Tabungan', type: 'savings', group: 'savings', cachedBalance: 30_000_000, isArchived: false };
  const funds = [
    { id: 'e', name: 'Dana darurat', kind: 'emergency', linkedWalletId: 'sv', currentAmount: 12_000_000, targetAmount: 15_000_000, monthlyContribution: 0, targetDate: '', notes: '' },
    { id: 'k', name: 'Tabungan kuliah', kind: 'goal', linkedWalletId: 'sv', currentAmount: 10_000_000, targetAmount: 20_000_000, monthlyContribution: 0, targetDate: '', notes: '' },
  ];
  const p = walletPockets(sv, funds);
  assert.deepEqual([p.allocated, p.unallocated, p.pockets[0].id], [22_000_000, 8_000_000, 'e']);
  const data = { ...sampleData(), wallets: [sv], funds };
  const a = analyzeFinances({ data, history: data.transactions, today: '2026-10-12', salaryDay: 25, monthlySalary: 8_000_000, warnPercent: 80, stat: { free: 0, reserved: 30_000_000, netWorth: 0, liabilities: 0 }, committed: 0 });
  assert.equal(a.idle.emergencyTarget, 15_000_000, 'pocket target is used');
  assert.equal(a.idle.emergencyShortfall, 3_000_000, 'only the emergency pocket counts');
  assert.equal(a.idle.savingsExcess, 8_000_000, 'unallocated savings, kuliah stays untouched');
  assert.ok(a.obligations.some(f => f.id === 'emergency'));
});
