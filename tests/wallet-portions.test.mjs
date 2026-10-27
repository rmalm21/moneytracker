import test from 'node:test';
import assert from 'node:assert/strict';
import { walletSplit, portionMoved, ownedWallets } from '../lib/wallet-portions.ts';
import { metrics } from '../lib/accounting.ts';

// SeaBank: 1,5jt of own money, then 6jt of business money transferred in by someone else.
const seabank = { id: 'sea', name: 'SeaBank', type: 'bank', openingBalance: 1500000, cachedBalance: 7500000, isReserved: false, isSpendable: true, includeInNetWorth: true, isArchived: false, portions: [{ id: 'biz', name: 'Dana bisnis', kind: 'titipan', base: 6000000 }] };
const tx = (o) => ({ id: o.id || Math.random().toString(36), type: 'expense', amount: 0, date: '2026-10-20', walletId: 'sea', destinationWalletId: null, categoryId: 'x', subcategoryId: null, merchant: '', description: '', notes: '', tags: [], claimId: null, debtId: null, receivableId: null, fundId: null, recurringTransactionId: null, draftId: null, adjustmentDirection: 'in', ...o });
const empty = { wallets: [], transactions: [], categories: [], budgets: [], claims: [], receivables: [], debts: [], funds: [], recurring: [], drafts: [], plannedTransactions: [], wishlist: [] };

test('one account, told apart: Uangku 1,5jt + Dana bisnis 6jt = 7,5jt in the bank', () => {
  const s = walletSplit(seabank, []);
  assert.equal(s.total, 7500000);
  assert.equal(s.own, 1500000);
  assert.equal(s.titipan, 6000000);
  assert.equal(s.parts[0].amount, 6000000);
  assert.equal(s.short, false);
});

test('spending tagged to the part moves the part; untagged spending moves Uangku', () => {
  const paySupplier = tx({ type: 'transfer', amount: 2000000, destinationWalletId: 'bca', portionFrom: 'biz' });
  const lunch = tx({ amount: 50000 });
  const w = { ...seabank, cachedBalance: 7500000 - 2000000 - 50000 };
  const s = walletSplit(w, [paySupplier, lunch]);
  assert.equal(s.parts[0].amount, 4000000, 'dana bisnis berkurang 2jt');
  assert.equal(s.own, 1450000, 'uangku berkurang 50rb');
  assert.equal(portionMoved('sea', 'biz', [paySupplier, lunch]), -2000000);
});

test('money coming in to a part (income or transfer into it) adds to it', () => {
  const income = tx({ type: 'income', amount: 500000, portionFrom: 'biz' });
  const transferIn = tx({ type: 'transfer', amount: 300000, walletId: 'gopay', destinationWalletId: 'sea', portionTo: 'biz' });
  const s = walletSplit({ ...seabank, cachedBalance: 8300000 }, [income, transferIn]);
  assert.equal(s.parts[0].amount, 6800000);
  assert.equal(s.own, 1500000);
});

test('a tag for another wallet never moves this one', () => {
  const other = tx({ walletId: 'bca', amount: 100000, portionFrom: 'biz' });
  assert.equal(walletSplit(seabank, [other]).parts[0].amount, 6000000);
});

test('balance below the parts shows as short (Uangku negative), never hidden', () => {
  const s = walletSplit({ ...seabank, cachedBalance: 5000000 }, []);
  assert.equal(s.own, -1000000);
  assert.equal(s.short, true);
});

test('Uang Bebas and Aset bersih leave titipan out; disisihkan stays in assets but not in Uang Bebas', () => {
  const plain = metrics({ ...empty, wallets: [{ ...seabank, portions: [] }] }, '2026-10-01', '2026-11-01');
  const split = metrics({ ...empty, wallets: [seabank] }, '2026-10-01', '2026-11-01');
  assert.equal(plain.free, 7500000);
  assert.equal(split.free, 1500000);
  assert.equal(split.assets, 1500000);
  assert.equal(split.netWorth, 1500000);
  assert.equal(split.freeParts.titipan, 6000000);
  const kept = metrics({ ...empty, wallets: [{ ...seabank, portions: [{ id: 'kos', name: 'Bayar kos', kind: 'disisihkan', base: 1000000 }] }] }, '2026-10-01', '2026-11-01');
  assert.equal(kept.assets, 7500000);
  assert.equal(kept.free, 6500000);
  assert.equal(kept.reserved, 1000000);
});

test('ownedWallets: Insight sees only the own money of a wallet', () => {
  assert.equal(ownedWallets([seabank], [])[0].cachedBalance, 1500000);
  assert.equal(ownedWallets([{ ...seabank, portions: undefined }], [])[0].cachedBalance, 7500000);
});
