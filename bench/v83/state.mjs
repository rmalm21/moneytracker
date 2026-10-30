/**
 * 8.3 chat v3 state: the chat bench account (bench/v80/state.mjs: wallets, default taxonomy, Thursday 15 Oct 2026,
 * payday on the 24th) with three months of everyday records (Aug–Oct, shop names, three wallets, two incomes) and
 * several named items per menu (two debts, three receivables, three goals, two wish-list items, four recurring bills,
 * two office claims), so questions about one of them by name have to pick the right one.
 *
 * Records come from a fixed table plus a seeded pattern, so every run sees the same account.
 */
import { chatCtx, data as base } from '../chat/state.mjs';
import { fullCtx } from '../v80/state.mjs';
import { C } from '../quick/fixtures-v68state.mjs';
import { inspect } from '../../lib/chat/inspect.ts';

let seed = 83;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = list => list[Math.floor(rand() * list.length)];
const round = (n, step = 500) => Math.round(n / step) * step;
const tx = (id, date, amount, cat, merchant = '', walletId = 'jago', extra = {}) => ({ id, type: 'expense', amount, date, time: '', walletId, destinationWalletId: null, categoryId: cat.split('.').slice(0, 2).join('.'), subcategoryId: cat.split('.').length > 2 ? cat : null, merchant, description: merchant, notes: '', tags: [], splits: [], transferFee: 0, adjustmentDirection: 'in', ...extra });
const income = (id, date, amount, cat, merchant, walletId = 'jago') => ({ ...tx(id, date, amount, cat, merchant, walletId), type: 'income', categoryId: cat.split('.').slice(0, 2).join('.'), subcategoryId: cat.split('.').length > 2 ? cat : null });

const day = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = iso => new Date(`${iso}T12:00:00Z`).getUTCDay();
const transactions = [];
let n = 0;
const add = (...args) => transactions.push(tx(`v${++n}`, ...args));
// Everyday pattern, 1 Aug – 15 Oct.
for (let d = '2026-08-01'; d <= '2026-10-15'; d = day(d, 1)) {
  const wd = weekday(d), workday = wd >= 1 && wd <= 5;
  if (workday) add(d, round(25000 + rand() * 20000), C('Makan Siang'), pick(['Warteg Bahari', 'Padang Sederhana', 'Bakmi GM']), pick(['jago', 'gopay', 'cash']));
  if (rand() < .45) add(d, round(22000 + rand() * 26000), C('Kopi & Minuman'), pick(['Kopi Kenangan', 'Fore Coffee', 'Starbucks']), 'gopay');
  if (workday && rand() < .5) add(d, round(15000 + rand() * 20000), C('Ojek'), pick(['Gojek', 'Grab']), 'gopay');
  if (rand() < .3) add(d, round(10000 + rand() * 30000), C('Jajan'), pick(['Indomaret', 'Alfamart']), pick(['cash', 'gopay']));
  if (wd === 6) add(d, round(100000 + rand() * 50000, 1000), C('Bensin'), pick(['Pertamina', 'Shell']), 'jago');
  if (wd === 0 && rand() < .7) add(d, round(60000 + rand() * 90000, 1000), C('Makan Malam'), pick(['Solaria', 'Hokben', 'Sate Khas Senayan']), 'jago');
  if (rand() < .2) add(d, pick([2000, 3000, 5000]), C('Parkir'), 'Parkir', 'cash');
}
// Monthly and one-off records.
for (const m of ['08', '09', '10']) {
  add(`2026-${m}-01`, 1500000, 'expense.tagihan.sewa-kost', 'Kos Bu Ani', 'jago');
  add(`2026-${m}-14`, m === '08' ? 285000 : m === '09' ? 310000 : 300000, C('Listrik'), 'PLN', 'jago');
  add(`2026-${m}-05`, 100000, C('Pulsa'), 'Telkomsel', 'gopay');
  add(`2026-${m}-03`, 250000, C('Gym'), 'Gym Fitness First', 'jago');
}
for (const m of ['08', '09']) add(`2026-${m}-20`, 330000, C('Internet'), 'IndiHome', 'jago');
add('2026-08-17', 450000, C('Marketplace'), 'Tokopedia', 'jago');
add('2026-09-12', 620000, C('Sepatu'), 'Shopee', 'jago');
add('2026-10-04', 189000, C('Pakaian'), 'Uniqlo', 'jago');
add('2026-10-11', 50000, C('Bioskop'), 'CGV', 'gopay');
add('2026-09-27', 50000, C('Bioskop'), 'XXI', 'gopay');
add('2026-10-09', 150000, C('Obat'), 'Kimia Farma', 'cash');
transactions.push(
  income('i0', '2026-08-24', 8500000, 'income.gaji', 'Gaji PT Maju'),
  income('i1', '2026-09-24', 8500000, 'income.gaji', 'Gaji PT Maju'),
  income('i2', '2026-10-10', 1200000, C('Freelance'), 'Desain logo'),
  income('i3', '2026-10-12', 15000, C('Cashback'), 'Cashback GoPay', 'gopay'),
);
transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

const more = {
  debts: [
    { id: 'd1', name: 'Cicilan HP', provider: 'Kredivo', originalAmount: 3000000, outstandingAmount: 1800000, dueDate: '2026-10-20', interestRate: 0, installmentAmount: 300000, notes: '', status: 'open' },
    { id: 'd2', name: 'Pinjaman Kak Rina', provider: 'Kak Rina', originalAmount: 2500000, outstandingAmount: 2000000, dueDate: '', interestRate: 0, installmentAmount: 0, notes: '', status: 'open' },
  ],
  receivables: [
    { id: 'r1', person: 'Budi', description: 'pinjam buat bensin', originalAmount: 100000, remainingAmount: 100000, sourceWalletId: 'jago', date: '2026-10-02', dueDate: '', status: 'open' },
    { id: 'r2', person: 'Sari', description: 'patungan kado', originalAmount: 75000, remainingAmount: 50000, sourceWalletId: 'jago', date: '2026-10-05', dueDate: '', status: 'partial' },
    { id: 'r3', person: 'Dimas', description: 'nalangin tiket konser', originalAmount: 250000, remainingAmount: 250000, sourceWalletId: 'jago', date: '2026-09-28', dueDate: '2026-10-30', status: 'open' },
  ],
  funds: [
    { id: 'f1', kind: 'goal', name: 'Liburan Bali', targetAmount: 5000000, currentAmount: 1250000, monthlyContribution: 500000, targetDate: '2027-03-01', linkedWalletId: '', notes: '' },
    { id: 'f2', kind: 'emergency', name: 'Dana Darurat', targetAmount: 15000000, currentAmount: 3000000, monthlyContribution: 1000000, targetDate: '', linkedWalletId: '', notes: '' },
    { id: 'f3', kind: 'goal', name: 'Laptop Baru', targetAmount: 12000000, currentAmount: 2000000, monthlyContribution: 1000000, targetDate: '2027-08-01', linkedWalletId: '', notes: '' },
  ],
  recurring: [
    { id: 'rc1', name: 'Netflix', type: 'expense', amount: 65000, walletId: 'jago', destinationWalletId: null, categoryId: null, frequency: 'monthly', nextDate: '2026-10-20', active: true, mode: 'reminder' },
    { id: 'rc2', name: 'Kos', type: 'expense', amount: 1500000, walletId: 'jago', destinationWalletId: null, categoryId: null, frequency: 'monthly', nextDate: '2026-11-01', active: true, mode: 'reminder' },
    { id: 'rc3', name: 'Spotify', type: 'expense', amount: 55000, walletId: 'gopay', destinationWalletId: null, categoryId: null, frequency: 'monthly', nextDate: '2026-10-18', active: true, mode: 'reminder' },
    { id: 'rc4', name: 'Internet IndiHome', type: 'expense', amount: 330000, walletId: 'jago', destinationWalletId: null, categoryId: null, frequency: 'monthly', nextDate: '2026-10-20', active: true, mode: 'reminder' },
  ],
  wishlist: [
    { id: 'w1', name: 'Sepatu lari', emoji: '👟', price: 900000, saved: 300000, priority: 1, status: 'active', addedDate: '2026-09-01' },
    { id: 'w2', name: 'Headphone', emoji: '🎧', price: 1200000, saved: 0, priority: 2, status: 'active', addedDate: '2026-10-01' },
  ],
  claims: [
    { id: 'c1', name: 'Taksi meeting klien', amount: 180000, remainingAmount: 180000, sourceWalletId: 'jago', submissionDate: '2026-10-10', expectedPaymentDate: '2026-10-25', paidDate: '', status: 'submitted', description: '', notes: '' },
    { id: 'c2', name: 'Makan dinas Bandung', amount: 420000, remainingAmount: 420000, sourceWalletId: 'jago', submissionDate: '2026-10-02', expectedPaymentDate: '2026-10-20', paidDate: '', status: 'approved', description: '', notes: '' },
  ],
};
const budgets = [
  ...base.budgets.map(b => ({ ...b, amount: 1800000 })),
  { id: 'b2', name: 'Transportasi', categoryId: 'expense.transportasi', subcategoryId: null, subcategoryIds: [], amount: 800000, active: true, cycleType: 'salary', classification: 'living', rolloverEnabled: false, rolloverCarry: 0 },
];
// Balances that fit three months of these records and the money set aside for the goals.
const balance = { jago: 9500000, gopay: 650000, cash: 300000 };
const wallets = fullCtx.data.wallets.map(w => ({ ...w, cachedBalance: balance[w.id] ?? w.cachedBalance }));
export const data = { drafts: [], plannedTransactions: [], categorizationRules: [], financialNotes: [], cycleSnapshots: [], ...fullCtx.data, ...more, wallets, budgets, transactions };
// The app gives Catat otomatis and the chat the same payday (the profile's); the older fixtures used 25 for Catat.
const quick = { ...chatCtx.quick, salaryDay: chatCtx.salaryDay, wallets, budgets, history: transactions.slice(-60), ask: { ...chatCtx.quick.ask, transactions, wallets, budgets } };
export const v3Ctx = { ...chatCtx, data, quick, inspect: text => inspect(text, quick) };
export { transactions };
