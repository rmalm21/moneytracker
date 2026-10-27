import test from 'node:test';
import assert from 'node:assert/strict';
import { walletDeletePlan, walletLabel } from '../lib/wallet-delete.ts';

const base = { recurring: [], plannedTransactions: [], funds: [], drafts: [], claims: [], receivables: [] };
const txs = [{ walletId: 'sea', destinationWalletId: null }, { walletId: 'bca', destinationWalletId: 'sea' }, { walletId: 'bca', destinationWalletId: null }];

test('a used wallet keeps all its transactions (counted, never removed)', () => {
  const p = walletDeletePlan({ id: 'sea' }, base, txs);
  assert.equal(p.kept, 2);
  assert.equal(p.unused, false);
  assert.deepEqual(p.blockers, []);
});

test('a never-used wallet can be removed whole', () => {
  const p = walletDeletePlan({ id: 'new' }, base, txs);
  assert.equal(p.kept, 0);
  assert.equal(p.unused, true);
});

test('only an active schedule blocks; plans, funds, kantong and drafts just forget the wallet', () => {
  const data = { ...base,
    recurring: [{ id: 'r1', name: 'Gaji', walletId: 'sea', destinationWalletId: null, active: true }, { id: 'r2', name: 'Lama', walletId: 'sea', destinationWalletId: null, active: false }],
    plannedTransactions: [{ id: 'p1', walletId: 'sea', status: 'planned' }, { id: 'p2', walletId: 'sea', status: 'posted' }],
    funds: [{ id: 'f1', linkedWalletId: 'sea' }, { id: 'k1', linkedWalletId: '', walletIds: ['sea', 'bca'] }, { id: 'f2', linkedWalletId: 'bca' }],
    drafts: [{ id: 'd1', walletId: 'sea', destinationWalletId: null, status: 'pending' }, { id: 'd2', walletId: 'sea', destinationWalletId: null, status: 'posted' }] };
  const p = walletDeletePlan({ id: 'sea' }, data, txs);
  assert.deepEqual(p.blockers, ['1 jadwal rutin aktif (Gaji)']);
  assert.deepEqual(p.plans, ['p1']);
  assert.deepEqual(p.funds, ['f1', 'k1']);
  assert.deepEqual(p.drafts, ['d1']);
});

test('deleted wallets are named as such on old transactions', () => {
  assert.equal(walletLabel({ name: 'SeaBank', isDeleted: true }), 'SeaBank (dihapus)');
  assert.equal(walletLabel({ name: 'SeaBank' }), 'SeaBank');
  assert.equal(walletLabel(undefined), 'Dompet terhapus');
});

test('reports keep a deleted wallet\'s history: income/expense unchanged, net worth counts it until the day it was deleted', async () => {
  const { calculateCycleSnapshot, scanData } = await import('../lib/finance-control.ts');
  const w = (o) => ({ type: 'bank', openingBalance: 0, purpose: '', isReserved: false, isSpendable: true, includeInNetWorth: true, isArchived: false, ...o });
  const tx = (o) => ({ time: '', destinationWalletId: null, categoryId: 'food', subcategoryId: null, merchant: '', description: '', notes: '', tags: [], claimId: null, debtId: null, receivableId: null, fundId: null, recurringTransactionId: null, draftId: null, adjustmentDirection: 'in', ...o });
  const ledger = [tx({ id: 'a', type: 'income', amount: 100000, date: '2026-10-02', walletId: 'old' }), tx({ id: 'b', type: 'expense', amount: 30000, date: '2026-10-05', walletId: 'old' })];
  const data = { wallets: [w({ id: 'bca', name: 'BCA', openingBalance: 500000, cachedBalance: 500000 }), w({ id: 'old', name: 'Lama', cachedBalance: 70000, isArchived: true, isDeleted: true, deletedAt: '2026-10-20' })], transactions: ledger, categories: [{ id: 'food', name: 'Makan', type: 'expense', parentId: null }], budgets: [], claims: [], receivables: [], debts: [], funds: [], recurring: [], drafts: [], plannedTransactions: [], wishlist: [], cycleSnapshots: [], splitBills: [] };
  const before = calculateCycleSnapshot(data, ledger, { start: '2026-10-01', end: '2026-10-15' });
  const after = calculateCycleSnapshot(data, ledger, { start: '2026-10-15', end: '2026-10-25' });
  assert.equal(before.income, 100000); assert.equal(before.expense, 30000);
  assert.equal(before.closingAssets, 570000, 'sebelum dihapus: saldonya masih dihitung');
  assert.equal(after.closingAssets, 500000, 'setelah dihapus: tidak lagi dihitung, sama seperti Beranda');
  const issues = scanData(data, ledger, { budgetWarningPercent: 80 });
  assert.ok(!issues.some(i => /Lama/.test(i.title)), 'Periksa Data tidak melaporkan dompet yang sengaja dihapus');
});
