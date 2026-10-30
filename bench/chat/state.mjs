/**
 * Chat assistant state: the 6.8 everyday-language account (real default taxonomy, Thursday 15 Oct 2026) with balances,
 * this salary cycle's spending and one budget, so summaries, "boleh beli?" and tips have something to read.
 */
import { ctx as quick, C } from '../quick/fixtures-v68state.mjs';
import { inspect } from '../../lib/chat/inspect.ts';

const balance = { jago: 4200000, gopay: 350000, cash: 200000 };
const wallets = quick.wallets.map(w => ({ ...w, cachedBalance: balance[w.id] ?? 0, isSpendable: true, isReserved: false, includeInNetWorth: true, openingBalance: 0 }));
const tx = (id, date, amount, cat, extra = {}) => ({ id, type: 'expense', amount, date, time: '', walletId: 'jago', destinationWalletId: null, categoryId: cat.split('.').slice(0, 2).join('.'), subcategoryId: cat.split('.').length > 2 ? cat : null, merchant: '', description: '', notes: '', tags: [], splits: [], transferFee: 0, adjustmentDirection: 'in', ...extra });
const transactions = [
  { ...tx('i1', '2026-09-24', 8500000, 'income.gaji'), type: 'income', categoryId: 'income.gaji' },
  tx('t1', '2026-10-01', 45000, C('Makan Siang')), tx('t2', '2026-10-03', 120000, C('Bensin')), tx('t3', '2026-10-05', 650000, C('Bahan Makanan')),
  tx('t4', '2026-10-08', 22000, C('Kopi & Minuman')), tx('t5', '2026-10-09', 18000, C('Jajan')), tx('t6', '2026-10-10', 25000, C('Jajan')),
  tx('t7', '2026-10-12', 15000, C('Parkir')), tx('t8', '2026-10-13', 28000, C('Kopi & Minuman')), tx('t9', '2026-10-14', 12000, C('Jajan')),
  tx('t10', '2026-10-14', 300000, C('Listrik')), tx('t11', '2026-10-15', 35000, C('Makan Siang')),
];
const budgets = [{ id: 'b1', name: 'Makan & Minum', categoryId: 'expense.makan-minum', subcategoryId: null, subcategoryIds: [], amount: 1000000, active: true, cycleType: 'salary', classification: 'living', rolloverEnabled: false, rolloverCarry: 0 }];
export const data = { wallets, transactions, budgets, categories: quick.categories, funds: [], debts: [], receivables: [], claims: [] };
// Questions are answered from these records (as the app does).
// 7.9: Catat otomatis knows the budgets too, as in the app (QuickContext.budgets).
const quickAsk = { ...quick, budgets, ask: { transactions, wallets, budgets } };
export const chatCtx = { data, today: '2026-10-15', salaryDay: 24, cycle: { start: '2026-09-24', end: '2026-10-24' }, quick: quickAsk, inspect: text => inspect(text, quickAsk), name: 'Dinda', hour: 15 };
