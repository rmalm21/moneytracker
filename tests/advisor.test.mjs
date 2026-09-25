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

function sample() {
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
  return analyzeFinances({ data, history, today: '2026-10-12', salaryDay: 25, monthlySalary: 8_000_000, warnPercent: 80, stat: { free: 5_000_000, reserved: 3_000_000, netWorth: 8_000_000, liabilities: 0 }, committed: 0 });
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
});

test('advisor says when there is not enough history yet', () => {
  const data = { wallets: [], categories: [], budgets: [], transactions: [], claims: [], receivables: [], debts: [], funds: [], recurring: [], drafts: [], plannedTransactions: [], categorizationRules: [], financialNotes: [], cycleSnapshots: [] };
  const advice = analyzeFinances({ data, history: [], today: '2026-10-12', salaryDay: 25, monthlySalary: 0, warnPercent: 80, stat: { free: 0, reserved: 0, netWorth: 0, liabilities: 0 }, committed: 0 });
  assert.equal(advice.enoughHistory, false);
  assert.equal(advice.cyclesUsed, 0);
  assert.ok(Number.isFinite(advice.score));
});
