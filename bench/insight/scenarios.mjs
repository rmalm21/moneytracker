/**
 * Insight V2.5 benchmark: deterministic synthetic users.
 *
 * `makeUser(options)` builds a full ledger (6 salary cycles + the current one) with merchants, subcategories, times,
 * receipts with items, wallets, budgets, debts, receivables, claims, goals and recurring bills. Every number comes
 * from a seeded generator, so a scenario is the same on every run. Scenarios plant one known change (or none) and
 * say which signals must appear and which must not; the runner scores the current Advisor and V2.5 on them.
 */
import { metrics } from '../../lib/accounting.ts';

const DAY = 86_400_000;
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parse = s => new Date(`${s}T12:00:00`);
export const addDays = (s, n) => iso(new Date(parse(s).getTime() + n * DAY));
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export const cat = (id, name, parentId = null, type = 'expense') => ({ id, name, type, parentId, icon: '', sortOrder: 0, isArchived: false });
export const categories = [
  cat('food', 'Makan & Minum'), cat('food-delivery', 'Pesan Antar', 'food'), cat('food-warteg', 'Warteg', 'food'), cat('food-coffee', 'Kopi', 'food'),
  cat('trans', 'Transportasi'), cat('trans-fuel', 'Bensin', 'trans'), cat('trans-ride', 'Ojol', 'trans'), cat('trans-park', 'Parkir', 'trans'),
  cat('shop', 'Belanja'), cat('shop-online', 'Belanja Online', 'shop'), cat('shop-groc', 'Belanja Dapur', 'shop'),
  cat('fun', 'Hiburan'), cat('bills', 'Tagihan'), cat('bills-power', 'Listrik', 'bills'), cat('bills-net', 'Internet', 'bills'), cat('bills-stream', 'Langganan Streaming', 'bills'),
  cat('home', 'Sewa Kos'), cat('give', 'Sedekah'), cat('gadget', 'Gadget'), cat('travel', 'Liburan'), cat('travel-ticket', 'Tiket Pesawat', 'travel'), cat('travel-hotel', 'Hotel', 'travel'),
  cat('salary', 'Gaji', null, 'income'), cat('side', 'Sampingan', null, 'income'),
];

/** Spending habits: merchant, category, how often per cycle, usual ticket. */
export const baseHabits = [
  { key: 'grabfood', merchant: 'GrabFood', categoryId: 'food', subcategoryId: 'food-delivery', perCycle: 8, ticket: 55_000, wallet: 'gopay' },
  { key: 'gofood', merchant: 'GoFood', categoryId: 'food', subcategoryId: 'food-delivery', perCycle: 4, ticket: 48_000, wallet: 'gopay' },
  { key: 'warteg', merchant: 'Warteg Bahari', categoryId: 'food', subcategoryId: 'food-warteg', perCycle: 14, ticket: 22_000, wallet: 'cash' },
  { key: 'kopi', merchant: 'Kopi Kenangan', categoryId: 'food', subcategoryId: 'food-coffee', perCycle: 6, ticket: 28_000, wallet: 'gopay' },
  { key: 'fuel', merchant: 'Pertamina', categoryId: 'trans', subcategoryId: 'trans-fuel', perCycle: 4, ticket: 80_000, wallet: 'bca' },
  { key: 'ride', merchant: 'Gojek', categoryId: 'trans', subcategoryId: 'trans-ride', perCycle: 6, ticket: 25_000, wallet: 'gopay' },
  { key: 'park', merchant: '', categoryId: 'trans', subcategoryId: 'trans-park', perCycle: 10, ticket: 3_000, wallet: 'cash' },
  { key: 'online', merchant: 'Tokopedia', categoryId: 'shop', subcategoryId: 'shop-online', perCycle: 2, ticket: 180_000, wallet: 'bca' },
  { key: 'groc', merchant: 'Indomaret', categoryId: 'shop', subcategoryId: 'shop-groc', perCycle: 4, ticket: 0, wallet: 'bca', receipt: true },
  { key: 'fun', merchant: 'CGV', categoryId: 'fun', subcategoryId: null, perCycle: 2, ticket: 90_000, wallet: 'bca' },
];
/** Groceries bought with a receipt: name, sku, unit, price. */
export const groceryItems = [
  { name: 'Beras Pandan Wangi 5kg', sku: '8991001', price: 68_000, every: 1 },
  { name: 'Minyak Goreng Bimoli 2L', sku: '8991002', price: 38_000, every: 2 },
  { name: 'Telur Ayam 1kg', sku: '8991003', price: 29_000, every: 1 },
  { name: 'Indomie Goreng 85g', sku: '8991004', price: 3_500, qty: 5, every: 1 },
  { name: 'Susu UHT Ultra 1L', sku: '8991005', price: 19_500, every: 2 },
];

let n = 0;
export function tx(type, amount, date, extra = {}) {
  return { id: `x${n++}`, type, amount, date, time: '12:00', walletId: 'bca', destinationWalletId: null, categoryId: null, subcategoryId: null, merchant: '', description: '', notes: '', tags: [], claimId: null, debtId: null, receivableId: null, fundId: null, recurringTransactionId: null, draftId: null, adjustmentDirection: 'out', ...extra };
}
const wallet = (id, name, type, group, balance, extra = {}) => ({ id, name, type, group, openingBalance: balance, cachedBalance: balance, purpose: '', isReserved: false, isSpendable: true, includeInNetWorth: true, isArchived: false, ...extra });

/** Salary cycles (start..end) oldest first, ending with the current one. */
export function cycleStarts(today, salaryDay, count) {
  const t = parse(today); let start = new Date(t.getFullYear(), t.getMonth(), Math.min(salaryDay, 28));
  if (start > t) start = new Date(t.getFullYear(), t.getMonth() - 1, Math.min(salaryDay, 28));
  const list = [];
  for (let i = count; i >= 0; i--) { const s = new Date(start.getFullYear(), start.getMonth() - i, start.getDate()); const e = new Date(s.getFullYear(), s.getMonth() + 1, s.getDate()); list.push({ start: iso(s), end: iso(e) }); }
  return list;
}

/**
 * options: seed, today, salaryDay, cycles (complete past cycles), habits (override/extra),
 * change(habit, cycleIndex, isCurrent) → { perCycle?, ticket? } multiplier hook, salary, extraIncome(cycleIndex) → amount,
 * uncategorized (share of current-cycle spending recorded without a category), startOffset (days recording started late),
 * build(ctx) → extra records (claims, receivables, debts, funds, recurring, budgets, plans, transactions).
 */
export function makeUser(options = {}) {
  n = 0;
  const seed = options.seed ?? 7, today = options.today || '2026-10-12', salaryDay = options.salaryDay || 25;
  const pastCount = options.cycles ?? 6, salary = options.salary ?? 9_000_000;
  const random = rng(seed);
  const cycles = cycleStarts(today, salaryDay, pastCount);
  const habits = (options.habits || baseHabits).map(h => ({ ...h }));
  const transactions = [];
  const recordFrom = options.startOffset ? addDays(cycles[0].start, options.startOffset) : cycles[0].start;
  cycles.forEach((cycle, ci) => {
    const current = ci === cycles.length - 1;
    const total = Math.round((parse(cycle.end) - parse(cycle.start)) / DAY);
    const elapsed = current ? Math.round((parse(today) - parse(cycle.start)) / DAY) + 1 : total;
    const income = options.income ? options.income(ci, current) : salary;
    if (income > 0) transactions.push(tx('income', income, cycle.start, { categoryId: 'salary', description: 'Gaji', time: '08:00' }));
    const extra = options.extraIncome?.(ci, current) || 0;
    if (extra) transactions.push(tx('income', extra, addDays(cycle.start, 12), { categoryId: 'side', description: 'Proyek sampingan', time: '19:00' }));
    // Rent and bills: fixed, early in the cycle.
    if (options.rent !== false) transactions.push(tx('expense', 1_800_000, addDays(cycle.start, 1), { categoryId: 'home', description: 'Sewa kos', time: '09:00' }));
    if (!current || elapsed > 5) transactions.push(tx('expense', options.power?.(ci) ?? 250_000 + Math.round(random() * 40) * 1000, addDays(cycle.start, 5), { categoryId: 'bills', subcategoryId: 'bills-power', merchant: 'PLN', description: 'Token listrik', time: '10:00' }));
    if (!current || elapsed > 8) transactions.push(tx('expense', 330_000, addDays(cycle.start, 8), { categoryId: 'bills', subcategoryId: 'bills-net', merchant: 'IndiHome', description: 'Internet', time: '10:00', recurringTransactionId: 'r-net' }));
    const stream = options.streaming?.(ci) ?? 54_000;
    if (stream && (!current || elapsed > 3)) transactions.push(tx('expense', stream, addDays(cycle.start, 3), { categoryId: 'bills', subcategoryId: 'bills-stream', merchant: 'Netflix', description: 'Netflix', time: '20:00', recurringTransactionId: 'r-netflix' }));
    if (options.giving !== false) transactions.push(tx('expense', 200_000, addDays(cycle.start, 2), { categoryId: 'give', description: 'Sedekah', time: '17:00' }));
    for (const habit of habits) {
      const mod = options.change?.(habit, ci, current) || {};
      const perCycle = habit.perCycle * (mod.perCycle ?? 1), ticket = habit.ticket * (mod.ticket ?? 1);
      // Same pace through the cycle: the current one has elapsed/total of the usual count so far.
      const expected = perCycle * elapsed / total;
      const count = Math.max(0, Math.round(expected + (random() - .5) * Math.min(2, perCycle * .25)));
      for (let k = 0; k < count; k++) {
        const date = addDays(cycle.start, Math.floor((k + random()) / Math.max(count, 1) * elapsed));
        if (date < recordFrom || date > today) continue;
        const hour = 8 + Math.floor(random() * 14), minute = Math.floor(random() * 60);
        const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        if (habit.receipt) {
          const items = groceryItems.filter((item, i) => (ci + k + i) % item.every === 0 || item.every === 1).map(item => {
            const price = Math.round(item.price * (options.itemPrice?.(item, ci) ?? 1) / 100) * 100, qty = item.qty || 1;
            return { name: item.name, sku: item.sku, qty, price, total: price * qty, ...(options.itemExtra?.(item, ci) || {}) };
          });
          const total = items.reduce((s, it) => s + it.total, 0);
          transactions.push(tx('expense', total, date, { time, categoryId: habit.categoryId, subcategoryId: habit.subcategoryId, merchant: habit.merchant, walletId: habit.wallet, description: 'Belanja dapur', origin: 'scan', receipt: { merchant: habit.merchant, date, items, charges: [], total } }));
          continue;
        }
        const amount = Math.max(1000, Math.round(ticket * (1 + (random() - .5) * .3) / 500) * 500);
        transactions.push(tx('expense', amount, date, { time, categoryId: habit.categoryId, subcategoryId: habit.subcategoryId, merchant: habit.merchant, walletId: habit.wallet, description: habit.merchant || 'Parkir' }));
      }
    }
    // Own transfers and goal deposits move money, they are not spending.
    transactions.push(tx('transfer', 500_000, addDays(cycle.start, 1), { walletId: 'bca', destinationWalletId: 'gopay', time: '09:30' }));
    if (options.saving !== false) transactions.push(tx('fund_contribution', 1_000_000, addDays(cycle.start, 1), { walletId: 'bca', destinationWalletId: 'tab', fundId: 'f-dd', time: '09:40' }));
  });
  // Recording that started late: nothing before that day exists in the ledger.
  if (options.startOffset) transactions.splice(0, transactions.length, ...transactions.filter(t => t.date >= recordFrom));
  // Uncategorized share of the current cycle (Data Health).
  if (options.uncategorized) {
    const cur = cycles[cycles.length - 1];
    const list = transactions.filter(t => t.type === 'expense' && t.date >= cur.start && t.categoryId && t.categoryId !== 'home');
    const target = list.reduce((s, t) => s + t.amount, 0) * options.uncategorized;
    let moved = 0;
    for (const t of list) { if (moved >= target) break; t.categoryId = null; t.subcategoryId = null; moved += t.amount; }
  }
  const data = {
    wallets: [wallet('bca', 'BCA', 'bank', 'operational', options.balance ?? 6_500_000), wallet('gopay', 'GoPay', 'ewallet', 'operational', 400_000), wallet('cash', 'Tunai', 'cash', 'operational', 300_000), wallet('tab', 'Tabungan', 'savings', 'savings', options.savings ?? 12_000_000, { isReserved: true }), wallet('inv', 'Bibit', 'investment', 'investment', 5_000_000, { isReserved: true, isSpendable: false })],
    categories, budgets: [], transactions, claims: [], receivables: [], debts: [], funds: [{ id: 'f-dd', name: 'Dana darurat', kind: 'emergency', walletIds: ['tab'], linkedWalletId: 'tab', currentAmount: 0, targetAmount: options.emergencyTarget ?? 30_000_000, monthlyContribution: 1_000_000, targetDate: '', notes: '' }],
    recurring: [{ id: 'r-netflix', name: 'Netflix', type: 'expense', amount: options.streaming?.(pastCount) ?? 54_000, walletId: 'bca', destinationWalletId: null, categoryId: 'bills', frequency: 'monthly', nextDate: addDays(cycles[cycles.length - 1].end, 3), active: true, mode: 'draft' }, { id: 'r-net', name: 'IndiHome', type: 'expense', amount: 330_000, walletId: 'bca', destinationWalletId: null, categoryId: 'bills', frequency: 'monthly', nextDate: addDays(cycles[cycles.length - 1].end, 8), active: true, mode: 'draft' }],
    drafts: [], plannedTransactions: [], categorizationRules: [], financialNotes: [], cycleSnapshots: [], wishlist: [],
  };
  options.build?.({ data, cycles, today, tx, addDays, random });
  data.transactions.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  const cur = cycles[cycles.length - 1];
  const stat = metrics(data, cur.start, cur.end, salaryDay, parse(today));
  const input = { data, history: data.transactions, today, salaryDay, monthlySalary: salary, warnPercent: 80, stat, committed: 0, profile: options.profile };
  return { input, cycles, data };
}
