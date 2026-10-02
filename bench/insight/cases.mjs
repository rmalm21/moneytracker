/**
 * Insight V2.5 benchmark scenarios. Each plants a known situation in a synthetic user (scenarios.mjs) and states:
 *   expect   — V2.5 signatures that must be present (and, with `changed`, shown under "Yang berubah");
 *   forbid   — signatures (regex) that must NOT appear (false alarms);
 *   advisor  — how the current Advisor could show the same thing at best (finding id regex), for a fair comparison;
 *   driver   — the merchant/subcategory that must be named as the main cause;
 *   mech     — "frequency" or "ticket": which part of the change must dominate.
 */
import { addDays } from './scenarios.mjs';

const claim = (id, name, amount, submissionDate, extra = {}) => ({ id, name, amount, remainingAmount: amount, sourceWalletId: 'bca', submissionDate, expectedPaymentDate: '', paidDate: '', status: 'submitted', description: '', notes: '', ...extra });
const receivable = (id, person, amount, date, extra = {}) => ({ id, person, description: '', originalAmount: amount, remainingAmount: amount, sourceWalletId: 'bca', date, dueDate: '', status: 'open', ...extra });

export const cases = [
  { id: 'stable', tags: ['false-alarm'], options: {}, expect: [], forbid: [/^spending:|^merchant:|^cashflow:spending-pace/], advisorForbid: /^(cut|room)-/ },
  { id: 'delivery-frequency', tags: ['change', 'driver'], options: { change: (h, ci, cur) => cur && h.key === 'grabfood' ? { perCycle: 2.5 } : {} }, expect: ['spending:category:food'], changed: ['spending:category:food'], driver: 'GrabFood', mech: 'frequency', advisor: /^cut-food|^leak-food/ },
  { id: 'coffee-ticket', tags: ['change', 'driver'], options: { change: (h, ci, cur) => cur && h.key === 'kopi' ? { ticket: 1.8 } : {} }, expect: ['spending:subcategory:food-coffee'], changed: ['spending:subcategory:food-coffee'], driver: 'Kopi Kenangan', mech: 'ticket', advisor: /^(cut|leak)-food/ },
  { id: 'delivery-down', tags: ['positive'], options: { change: (h, ci, cur) => cur && (h.key === 'grabfood' || h.key === 'gofood') ? { perCycle: 0 } : {} }, expect: ['spending:category:food'], changed: ['spending:category:food'], positive: true, advisor: /^room-food|^loose/ },
  { id: 'new-user', tags: ['learning'], options: { cycles: 0 }, expect: [], learning: true, forbid: [/^spending:|^merchant:/] },
  { id: 'thin-history', tags: ['learning'], options: { cycles: 1 }, expect: [], learning: true, forbid: [/^spending:|^merchant:/] },
  { id: 'early-cycle-rent', tags: ['fairness'], options: { today: '2026-09-27' }, expect: [], forbid: [/^spending:category:home|^cashflow:spending-pace/] },
  { id: 'uncategorized', tags: ['data-quality'], options: { uncategorized: .25 }, expect: ['data:uncategorized'], caveat: /belum memiliki kategori/ },
  {
    id: 'claims-aging', tags: ['claims'], options: { build: ({ data, today }) => {
      data.claims.push(claim('c1', 'Dinas Bandung', 1_250_000, addDays(today, -41)), claim('c2', 'Taksi klien', 180_000, addDays(today, -5)), claim('c3', 'Hotel Surabaya', 900_000, addDays(today, -18)));
      for (let i = 0; i < 4; i++) data.claims.push(claim(`p${i}`, `Klaim lama ${i}`, 300_000, addDays(today, -150 + i * 20), { status: 'paid', remainingAmount: 0, paidDate: addDays(today, -150 + i * 20 + 10 + i) }));
    } }, expect: ['claims:outstanding', 'claims:aging:c1'], forbid: [/^claims:aging:c2/], advisorCovers: false,
  },
  {
    id: 'receivable-late', tags: ['receivable'], options: { build: ({ data, today }) => {
      data.receivables.push(receivable('r1', 'Dodi', 750_000, addDays(today, -40), { dueDate: addDays(today, -20) }), receivable('r2', 'Nisa', 100_000, addDays(today, -3)), receivable('r3', 'Dodi', 400_000, addDays(today, -12), { remainingAmount: 250_000, status: 'partial' }));
    } }, expect: ['receivable:outstanding', 'receivable:late:r1'], forbid: [/receivable:late:r2/], advisor: /^receivable$/,
  },
  {
    id: 'debt-paydown', tags: ['debt'], options: { build: ({ data, cycles, tx }) => {
      data.debts.push({ id: 'd1', name: 'Cicilan motor', provider: 'Adira', originalAmount: 12_000_000, outstandingAmount: 6_000_000, dueDate: '', interestRate: 0, installmentAmount: 1_000_000, notes: '', status: 'open' });
      cycles.slice(1).forEach(c => data.transactions.push(tx('debt_payment', 1_000_000, addDays(c.start, 4), { debtId: 'd1', walletId: 'bca' })));
    } }, expect: ['debt:trajectory'], positive: true, eta: true, advisorCovers: false,
  },
  {
    id: 'goals-pressure', tags: ['goals'], options: { salary: 7_000_000, build: ({ data, today }) => {
      data.funds.push({ id: 'g1', name: 'DP rumah', kind: 'goal', currentAmount: 5_000_000, targetAmount: 60_000_000, monthlyContribution: 0, targetDate: addDays(today, 365), linkedWalletId: 'tab', notes: '' }, { id: 'g2', name: 'Liburan Jepang', kind: 'goal', currentAmount: 0, targetAmount: 20_000_000, monthlyContribution: 0, targetDate: addDays(today, 180), linkedWalletId: 'tab', notes: '' });
    } }, expect: ['goals:pressure'], advisor: /^fund-/,
  },
  { id: 'recurring-drift', tags: ['recurring'], options: { streaming: ci => ci >= 5 ? 65_000 : 54_000 }, expect: ['recurring:drift:r:r-netflix'], advisor: /^fixed$|^repeat-/ },
  {
    id: 'unusual-purchase', tags: ['anomaly'], options: { build: ({ data, today, tx }) => { data.transactions.push(tx('expense', 2_400_000, addDays(today, -2), { categoryId: 'shop', subcategoryId: 'shop-online', merchant: 'Tokopedia', description: 'Monitor', time: '21:00', id: 'big1' })); } },
    expect: ['behavior:unusual:big1'], advisor: /^odd-big1/,
  },
  {
    id: 'planned-purchase', tags: ['anomaly', 'false-alarm'], options: { build: ({ data, today, tx }) => { data.transactions.push(tx('expense', 2_400_000, addDays(today, -2), { categoryId: 'shop', subcategoryId: 'shop-online', merchant: 'Tokopedia', description: 'Monitor', time: '21:00', id: 'big2', plannedId: 'pl1' })); data.plannedTransactions.push({ id: 'pl1', title: 'Monitor', type: 'expense', amount: 2_400_000, date: addDays(today, -2), walletId: 'bca', categoryId: 'shop', subcategoryId: 'shop-online', notes: '', committed: true, status: 'posted', postedTransactionId: 'big2' }); } },
    expect: [], forbid: [/^behavior:unusual:big2/], advisorForbid: /^odd-big2/,
  },
  {
    id: 'item-price', tags: ['prices'], options: { itemPrice: (item, ci) => item.sku === '8991001' && ci >= 6 ? 76_000 / 68_000 : 1, itemExtra: (item, ci) => item.sku === '8991002' && ci === 6 ? { name: 'Minyak Goreng Bimoli 1L', sku: '8991009' } : {} },
    expect: ['prices:item:sku:8991001|indomaret'], prices: true, forbid: [/8991009/], advisorCovers: false,
  },
  { id: 'income-bonus', tags: ['income', 'outlier'], options: { extraIncome: ci => ci === 3 ? 6_000_000 : 0 }, expect: [], forbid: [/^income:last-cycle/] },
  { id: 'income-drop', tags: ['income'], options: { income: (ci, cur) => ci === 5 ? 6_000_000 : 9_000_000 }, expect: ['income:last-cycle'] },
  { id: 'late-start', tags: ['coverage'], options: { startOffset: 16 }, expect: [], forbid: [/^spending:|^merchant:/] },
  {
    id: 'budget-pressure', tags: ['budget', 'cluster'], options: { change: (h, ci, cur) => cur && h.key === 'grabfood' ? { perCycle: 2.5 } : {}, build: ({ data }) => { data.budgets.push({ id: 'b-food', name: 'Makan', categoryId: 'food', subcategoryId: null, amount: 1_100_000, classification: 'living', cycleType: 'salary', rolloverEnabled: false, active: true }); } },
    expect: ['spending:category:food', 'budget:pressure:b-food'], cluster: ['spending:category:food', 'budget:pressure:b-food'], advisor: /^tight-b-food|^cut-food/,
  },
  {
    id: 'split-bill', tags: ['safety'], options: { build: ({ data, today, tx }) => { data.transactions.push(tx('expense', 100_000, addDays(today, -3), { categoryId: 'food', subcategoryId: 'food-warteg', merchant: 'Warteg Bahari', splitBillId: 's1', ownShare: 25_000, id: 'sb1' })); data.receivables.push(receivable('rs1', 'Teman', 75_000, addDays(today, -3), { sourceType: 'split_bill', splitBillId: 's1' })); } },
    expect: [], forbid: [/^spending:|^merchant:|^behavior:unusual/], safety: { ownShare: { tx: 'sb1', amount: 25_000 } },
  },
];
