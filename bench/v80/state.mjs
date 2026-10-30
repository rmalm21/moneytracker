/**
 * 8.0 chat state: the chat bench account (bench/chat/state.mjs) with what every menu holds (debts, receivables, goals,
 * recurring, wish list, claims) and, in `borosCtx`, a cycle of coffee and snacks every day for a roast to read.
 */
import { chatCtx, data } from '../chat/state.mjs';
import { C } from '../quick/fixtures-v68state.mjs';

const more = {
  debts: [{ id: 'd1', name: 'Cicilan HP', provider: 'Kredivo', originalAmount: 3000000, outstandingAmount: 1800000, dueDate: '2026-10-20', interestRate: 0, installmentAmount: 300000, notes: '', status: 'open' }],
  receivables: [{ id: 'r1', person: 'Budi', description: 'pinjam buat bensin', originalAmount: 100000, remainingAmount: 100000, sourceWalletId: 'jago', date: '2026-10-02', dueDate: '', status: 'open' },
    { id: 'r2', person: 'Sari', description: 'patungan kado', originalAmount: 75000, remainingAmount: 50000, sourceWalletId: 'jago', date: '2026-10-05', dueDate: '', status: 'partial' }],
  funds: [{ id: 'f1', kind: 'goal', name: 'Liburan Bali', targetAmount: 5000000, currentAmount: 1250000, monthlyContribution: 500000, targetDate: '2027-03-01', linkedWalletId: '', notes: '' }],
  recurring: [{ id: 'rc1', name: 'Netflix', type: 'expense', amount: 65000, walletId: 'jago', destinationWalletId: null, categoryId: null, frequency: 'monthly', nextDate: '2026-10-20', active: true, mode: 'reminder' },
    { id: 'rc2', name: 'Kos', type: 'expense', amount: 1500000, walletId: 'jago', destinationWalletId: null, categoryId: null, frequency: 'monthly', nextDate: '2026-11-01', active: true, mode: 'reminder' }],
  wishlist: [{ id: 'w1', name: 'Sepatu lari', emoji: '👟', price: 900000, saved: 300000, priority: 1, status: 'active', addedDate: '2026-09-01' }],
  claims: [{ id: 'c1', name: 'Taksi meeting klien', amount: 180000, remainingAmount: 180000, sourceWalletId: 'jago', submissionDate: '2026-10-10', expectedPaymentDate: '2026-10-25', paidDate: '', status: 'submitted', description: '', notes: '' }],
};
export const fullCtx = { ...chatCtx, data: { ...data, ...more } };
const tx = (id, date, amount, cat) => ({ id, type: 'expense', amount, date, time: '', walletId: 'jago', destinationWalletId: null, categoryId: cat.split('.').slice(0, 2).join('.'), subcategoryId: cat.split('.').length > 2 ? cat : null, merchant: '', description: '', notes: '', tags: [], splits: [], transferFee: 0, adjustmentDirection: 'in' });
const coffee = Array.from({ length: 20 }, (_, i) => tx(`k${i}`, `2026-10-${String(1 + (i % 15)).padStart(2, '0')}`, 45000, C('Kopi & Minuman')));
const shopping = Array.from({ length: 6 }, (_, i) => tx(`s${i}`, `2026-10-${String(2 + i * 2).padStart(2, '0')}`, 450000, C('Jajan')));
const boros = { ...data, ...more, wallets: data.wallets.map(w => ({ ...w, cachedBalance: Math.round(w.cachedBalance / 10) })), transactions: [...data.transactions, ...coffee, ...shopping] };
export const borosCtx = { ...chatCtx, data: boros, quick: { ...chatCtx.quick, history: [...(chatCtx.quick.history || []), ...coffee], ask: { ...chatCtx.quick.ask, transactions: boros.transactions } } };
