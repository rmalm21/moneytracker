/**
 * Catat otomatis 6.0 — Tanya: the money a question is answered from. The V3.5 state (Thu 15 Oct 2026, salary day 25,
 * so this salary cycle is 25 Sep – 24 Oct) plus a ledger with amounts, wallet balances and three budgets.
 *
 * The truth of each question is computed here by an explicit filter over this ledger (sum / count / last date), so it
 * never depends on how the engine reads the sentence.
 */
import { ctx as base } from './fixtures-v35state.mjs';
export const today = '2026-10-15';

const e = (id, date, amount, categoryId, subcategoryId, description, merchant, walletId) => ({ id, type: 'expense', date, amount, categoryId, subcategoryId, description, merchant, walletId, destinationWalletId: null });
const inc = (id, date, amount, categoryId, description, walletId) => ({ id, type: 'income', date, amount, categoryId, subcategoryId: null, description, merchant: '', walletId, destinationWalletId: null });
export const transactions = [
  inc('s1', '2026-08-25', 8_000_000, 'salary', 'Gaji', 'jago'),
  inc('s2', '2026-09-25', 8_000_000, 'salary', 'Gaji', 'jago'),
  e('x01', '2026-09-02', 45_000, 'food', null, 'Makan siang', 'Warteg Bahari', 'gopay'),
  e('x02', '2026-09-05', 50_000, 'trans', 'fuel', 'Bensin', 'Pertamina', 'cash'),
  e('x03', '2026-09-10', 330_000, 'bills', 'net', 'Wifi', 'IndiHome', 'jago'),
  e('x04', '2026-09-12', 28_000, 'food', 'drink', 'Kopi', 'Kopi Kenangan', 'gopay'),
  e('x05', '2026-09-18', 250_000, 'fun', 'hang', 'Nongkrong', 'Kongsi Tiam', 'jago'),
  e('x06', '2026-09-20', 54_000, 'bills', 'subs', 'Netflix', 'Netflix', 'jago'),
  e('x07', '2026-09-22', 60_000, 'trans', 'fuel', 'Bensin', 'Shell', 'cash'),
  e('x08', '2026-09-26', 35_000, 'food', 'breakfast', 'Sarapan bubur', '', 'cash'),
  e('x09', '2026-09-28', 120_000, 'shop', null, 'Belanja bulanan', 'Indomaret', 'mandiri'),
  e('x10', '2026-09-30', 40_000, 'trans', 'fuel', 'Bensin', 'Pertamina', 'cash'),
  e('x11', '2026-10-01', 25_000, 'food', 'drink', 'Kopi', 'Kopi Kenangan', 'gopay'),
  e('x12', '2026-10-02', 450_000, 'shop', 'clothes', 'Sepatu', 'Zalora', 'mandiri'),
  e('x13', '2026-10-03', 18_000, 'food', null, 'Mie ayam', '', 'cash'),
  e('x29', '2026-10-04', 12_000, 'food', null, 'Jajan gorengan', '', 'cash'),
  e('x14', '2026-10-05', 50_000, 'trans', 'fuel', 'Bensin', 'Pertamina', 'cash'),
  inc('x15', '2026-10-06', 1_500_000, 'refund', 'Freelance desain', 'jago'),
  e('x16', '2026-10-07', 85_000, 'fun', 'cinema', 'Nonton', 'XXI', 'gopay'),
  e('x17', '2026-10-08', 30_000, 'food', 'drink', 'Kopi', 'Fore', 'jago'),
  e('x30', '2026-10-08', 15_000, 'food', null, 'Jajan cilok', '', 'cash'),
  e('x18', '2026-10-09', 330_000, 'bills', 'net', 'Wifi', 'IndiHome', 'jago'),
  e('x19', '2026-10-10', 200_000, 'fun', 'hang', 'Nongkrong', 'Kongsi Tiam', 'jago'),
  e('x20', '2026-10-11', 65_000, 'food', null, 'Makan malam', 'Solaria', 'gopay'),
  e('x21', '2026-10-12', 22_000, 'food', 'drink', 'Kopi', 'Kopi Kenangan', 'gopay'),
  e('x22', '2026-10-12', 5_000, 'trans', 'park', 'Parkir', '', 'cash'),
  e('x23', '2026-10-13', 75_000, 'trans', 'fuel', 'Bensin', 'Shell', 'mandiri'),
  e('x24', '2026-10-13', 32_000, 'food', null, 'Makan siang', 'Warteg Bahari', 'cash'),
  e('t3', '2026-10-14', 20_000, 'food', null, 'Makan', '', 'gopay'),
  e('x26', '2026-10-14', 150_000, 'shop', null, 'Belanja', 'Indomaret', 'mandiri'),
  e('t1', '2026-10-15', 19_000, 'food', 'drink', 'Kopi', 'Cotti Coffee', 'jago'),
  e('t2', '2026-10-15', 2_000, 'trans', 'park', 'Parkir', '', 'cash'),
  { id: 't4', type: 'transfer', date: '2026-10-15', amount: 100_000, categoryId: null, subcategoryId: null, description: '', merchant: '', walletId: 'jago', destinationWalletId: 'mandiri' },
];
export const balances = { jago: 3_450_000, gopay: 185_000, jenius: 0, mandiri: 5_200_000, bri: 0, krom: 900_000, cash: 120_000 };
export const budgets = [
  { id: 'b1', name: 'Makan & Minum', categoryId: 'food', subcategoryId: null, amount: 1_500_000, active: true, cycleType: 'salary', classification: 'living' },
  { id: 'b2', name: 'Nongkrong & Hiburan', categoryId: 'fun', subcategoryId: null, amount: 400_000, active: true, cycleType: 'salary', classification: 'living' },
  { id: 'b3', name: 'Bensin', categoryId: 'trans', subcategoryId: 'fuel', subcategoryIds: ['fuel'], amount: 300_000, active: true, cycleType: 'salary', classification: 'living' },
];

export const ctx = {
  ...base, today,
  history: transactions.map(({ type, description, merchant, categoryId, subcategoryId, date }) => ({ type, description, merchant, categoryId, subcategoryId, date })),
  budgets,
  ask: { transactions, wallets: base.wallets.map(w => ({ ...w, cachedBalance: balances[w.id] ?? 0 })), budgets },
};

// ——— Truth helpers (plain filters; end is exclusive) ———
export const CYCLE = ['2026-09-25', '2026-10-25'], OCT = ['2026-10-01', '2026-11-01'], SEP = ['2026-09-01', '2026-10-01'], WEEK = ['2026-10-12', '2026-10-19'], LAST_WEEK = ['2026-10-05', '2026-10-12'];
export const DAY = d => [d, d === '2026-10-15' ? '2026-10-16' : d === '2026-10-14' ? '2026-10-15' : null];
const within = ([s, e]) => t => t.date >= s && t.date < e;
const spent = t => t.type === 'expense' ? t.amount : 0;
export const pick = (range, f = () => true) => transactions.filter(t => within(range)(t) && f(t));
export const spend = (range, f) => pick(range, f).reduce((n, t) => n + spent(t), 0);
export const income = (range, f) => pick(range, f).filter(t => t.type === 'income').reduce((n, t) => n + t.amount, 0);
export const count = (range, f) => pick(range, f).filter(t => t.type === 'expense').length;
export const last = f => transactions.filter(t => t.type === 'expense' && f(t)).map(t => t.date).sort().pop();
export const cat = id => t => t.categoryId === id || t.subcategoryId === id;
export const sub = id => t => t.subcategoryId === id;
export const at = name => t => t.merchant === name;
export const via = id => t => t.walletId === id;
export const says = word => t => t.description.toLowerCase().includes(word);
export const total = Object.values(balances).reduce((n, v) => n + v, 0);
