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
