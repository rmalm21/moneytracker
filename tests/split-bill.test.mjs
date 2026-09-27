import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate, billProgress, billShareText, computeSplit, ownCategoryLines, personShareText, readReceiptText, reminderText } from '../lib/split-bill.ts';

const people = (...names) => names.map((name, i) => ({ id: name.toLowerCase(), name, ...(i === 0 ? { isMe: true } : {}) }));
const bill = (fields) => ({ total: 0, method: 'equal', participants: people('Rama', 'Ivan', 'Aldi', 'Atuy'), items: [], extras: [], categoryId: 'makan', subcategoryId: null, ...fields });
const shares = (result) => result.people.map(person => person.total);
const item = (id, name, qty, price, fields = {}) => ({ id, name, qty, price, assign: 'shared', people: [], ...fields });

test('dividing Rupiah never loses or creates money', () => {
  assert.deepEqual(allocate(100000, [1, 1, 1]), [33334, 33333, 33333]);
  assert.deepEqual(allocate(15000, [100000, 50000]), [10000, 5000]);
  assert.deepEqual(allocate(-10000, [1, 1, 1]), [-3334, -3333, -3333]);
  assert.deepEqual(allocate(1000, [0, 0]), [500, 500]);
  assert.deepEqual(allocate(7, [0, 5, 0]), [0, 7, 0]);
  // Many random divisions: the parts always add up to the whole, and nobody gets more than one Rupiah above their exact part.
  let seed = 7; const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let round = 0; round < 500; round++) {
    const total = Math.floor(random() * 5_000_000) + 1, weights = Array.from({ length: 1 + Math.floor(random() * 8) }, () => Math.floor(random() * 300_000));
    const parts = allocate(total, weights), sum = weights.reduce((a, b) => a + b, 0) || weights.length;
    assert.equal(parts.reduce((a, b) => a + b, 0), total);
    parts.forEach((part, i) => { const exact = total * (sum === weights.length && !weights.some(Boolean) ? 1 : weights[i]) / sum; assert.ok(part >= Math.floor(exact) && part <= Math.floor(exact) + 1); });
  }
  // Huge amounts stay exact.
  assert.deepEqual(allocate(9_000_000_000_001, [3_000_000_000, 6_000_000_000]), [3_000_000_000_000, 6_000_000_000_001]);
});

test('equal, manual amount and percentage splits', () => {
  assert.deepEqual(shares(computeSplit(bill({ total: 400000 }))), [100000, 100000, 100000, 100000]);
  assert.deepEqual(shares(computeSplit(bill({ total: 100000, participants: people('Rama', 'Ivan', 'Aldi') }))), [33334, 33333, 33333]);

  const manual = amounts => bill({ total: 400000, method: 'amount', participants: people('Rama', 'Ivan', 'Aldi', 'Atuy').map((p, i) => ({ ...p, amount: amounts[i] })) });
  const exact = computeSplit(manual([125000, 90000, 110000, 75000]));
  assert.equal(exact.ok, true);
  assert.deepEqual(shares(exact), [125000, 90000, 110000, 75000]);
  assert.deepEqual(computeSplit(manual([125000, 90000, 110000, 62500])).issues.map(i => i.message), ['Masih ada Rp12.500 yang belum dibagi.']);
  assert.deepEqual(computeSplit(manual([125000, 90000, 110000, 80000])).issues.map(i => i.message), ['Pembagian lebih Rp5.000.']);

  const percent = points => bill({ total: 400000, method: 'percent', participants: people('Rama', 'Ivan', 'Aldi', 'Atuy').map((p, i) => ({ ...p, percent: points[i] })) });
  assert.deepEqual(shares(computeSplit(percent([4000, 3000, 2000, 1000]))), [160000, 120000, 80000, 40000]);
  assert.deepEqual(computeSplit(percent([4000, 3000, 1000, 1000])).issues.map(i => i.message), ['Persentase baru 90%. Masih kurang 10%.']);
  assert.deepEqual(computeSplit(percent([4000, 3000, 2000, 1500])).issues.map(i => i.message), ['Persentase lebih 5%.']);
  // Thirds as 33,33% + 33,33% + 33,34%.
  assert.deepEqual(shares(computeSplit(bill({ total: 100000, method: 'percent', participants: people('A', 'B', 'C').map((p, i) => ({ ...p, percent: [3333, 3333, 3334][i] })) }))), [33330, 33330, 33340]);
});

test('items: shared items, quantities, custom amounts and what is still unassigned', () => {
  const items = [
    item('udang', 'Udang Keju', 1, 25000, { people: ['rama'] }),
    item('rice', 'Rice Bowl Matah', 1, 35000, { people: ['ivan'] }),
    item('mie', 'Mie Goreng', 1, 24000, { people: ['rama', 'aldi'] }),
    item('teh', 'Es Teh', 1, 10000, { people: ['rama', 'ivan', 'aldi', 'atuy'] }),
  ];
  const result = computeSplit(bill({ method: 'items', items }));
  assert.equal(result.ok, true);
  assert.equal(result.total, 94000);
  assert.deepEqual(shares(result), [25000 + 12000 + 2500, 35000 + 2500, 12000 + 2500, 2500]);
  assert.equal(result.people[0].lines.find(line => line.key === 'item:mie').label, 'Mie Goreng (dibagi 2)');

  // French fries Rp40.000 for Rama and Ivan: Rp20.000 each.
  assert.deepEqual(shares(computeSplit(bill({ method: 'items', items: [item('fries', 'French Fries', 1, 40000, { people: ['rama', 'ivan'] })], participants: people('Rama', 'Ivan') }))), [20000, 20000]);
  // Es Teh 4 × Rp10.000: Rama 1, Ivan 1, Aldi 2.
  const teh = computeSplit(bill({ method: 'items', items: [item('teh', 'Es Teh', 4, 10000, { assign: 'units', units: { rama: 1, ivan: 1, aldi: 2 } })] }));
  assert.deepEqual(shares(teh), [10000, 10000, 20000, 0]);
  assert.equal(teh.ok, true);
  // Only 3 of 4 chosen: one glass is still unassigned and the bill can't be saved yet.
  const short = computeSplit(bill({ method: 'items', items: [item('teh', 'Es Teh', 4, 10000, { assign: 'units', units: { rama: 1, ivan: 1, aldi: 1 } })] }));
  assert.deepEqual(short.unassignedItems, [{ id: 'teh', name: 'Es Teh', amount: 10000 }]);
  assert.deepEqual(short.issues.map(i => i.message), ['Masih ada Rp10.000 yang belum dibagi.']);
  // An item nobody picked.
  const open = computeSplit(bill({ method: 'items', items: [...items, item('sate', 'Sate', 1, 42000)] }));
  assert.equal(open.ok, false);
  assert.deepEqual(open.issues.map(i => i.message), ['Masih ada Rp42.000 yang belum dibagi.']);
  // Custom amounts inside an item.
  const custom = computeSplit(bill({ method: 'items', participants: people('Rama', 'Ivan'), items: [item('pizza', 'Pizza', 1, 100000, { assign: 'custom', custom: { rama: 60000, ivan: 40000 } })] }));
  assert.deepEqual(shares(custom), [60000, 40000]);
  assert.match(computeSplit(bill({ method: 'items', participants: people('Rama', 'Ivan'), items: [item('pizza', 'Pizza', 1, 100000, { assign: 'custom', custom: { rama: 70000, ivan: 40000 } })] })).issues[0].message, /Pizza: pembagian lebih Rp10.000/);
});

test('tax, service, discounts, fees and shared costs', () => {
  const two = people('Rama', 'Ivan');
  const food = [item('a', 'Steak', 1, 100000, { people: ['rama'] }), item('b', 'Pasta', 1, 50000, { people: ['ivan'] })];
  // Tax Rp15.000 in proportion to Rp100.000 and Rp50.000: Rp10.000 and Rp5.000.
  const tax = computeSplit(bill({ method: 'items', participants: two, items: food, extras: [{ id: 't', kind: 'tax', label: 'PB1', amount: 15000, distribution: 'proportional' }] }));
  assert.deepEqual(shares(tax), [110000, 55000]);
  assert.equal(tax.total, 165000);
  // Equally instead.
  assert.deepEqual(shares(computeSplit(bill({ method: 'items', participants: two, items: food, extras: [{ id: 't', kind: 'tax', label: 'PB1', amount: 15000, distribution: 'equal' }] }))), [107500, 57500]);
  // A discount lowers the total and is shared in proportion; a custom division must add up.
  const discount = computeSplit(bill({ method: 'items', participants: two, items: food, extras: [{ id: 'd', kind: 'discount', label: 'Promo', amount: 30000, distribution: 'proportional' }] }));
  assert.deepEqual(shares(discount), [80000, 40000]);
  assert.equal(discount.total, 120000);
  const customTax = computeSplit(bill({ method: 'items', participants: two, items: food, extras: [{ id: 't', kind: 'tax', label: 'PB1', amount: 15000, distribution: 'custom', custom: { rama: 5000 } }] }));
  assert.deepEqual(customTax.issues.map(i => i.message), ['PB1: masih ada Rp10.000 yang belum dibagi.']);
  // A discount on one item stays with the people who had that item.
  const itemDiscount = computeSplit(bill({ method: 'items', participants: two, items: [item('a', 'Steak', 1, 100000, { people: ['rama'], discount: 20000 }), food[1]] }));
  assert.deepEqual(shares(itemDiscount), [80000, 50000]);
  // A discount divided equally may not push anyone below zero.
  const tooMuch = computeSplit(bill({ method: 'items', participants: two, items: [item('a', 'Steak', 1, 100000, { people: ['rama'] }), item('b', 'Teh', 1, 5000, { people: ['ivan'] })], extras: [{ id: 'd', kind: 'discount', label: 'Voucher', amount: 20000, distribution: 'equal' }] }));
  assert.ok(tooMuch.issues.some(i => i.message === 'Bagian Ivan jadi minus. Ubah cara bagi diskonnya.'));
  // Court rental for everyone, parking for two only.
  const sport = computeSplit(bill({ total: 720000, extras: [{ id: 'court', kind: 'shared', label: 'Sewa Lapangan', amount: 100000, distribution: 'equal' }, { id: 'park', kind: 'shared', label: 'Parkir', amount: 10000, distribution: 'equal', people: ['rama', 'ivan'] }] }));
  assert.equal(sport.subtotal, 610000);
  assert.deepEqual(shares(sport), [152500 + 25000 + 5000, 152500 + 25000 + 5000, 152500 + 25000, 152500 + 25000]);
  assert.equal(sport.allocated, 720000);
  assert.deepEqual(sport.people[0].lines.map(line => line.label), ['Bagian', 'Sewa Lapangan', 'Parkir']);
  // Extra costs larger than the total paid.
  assert.deepEqual(computeSplit(bill({ total: 50000, extras: [{ id: 'x', kind: 'shared', label: 'Sewa', amount: 60000, distribution: 'equal' }] })).issues.map(i => i.message), ['Biaya tambahan lebih besar dari total tagihan.']);
});

test('the receipt example: service 10% and PB1 10% on food plus service', () => {
  const receipt = computeSplit(bill({ method: 'items', participants: people('Rama', 'Ivan'), items: [item('n', 'Nasi Goreng', 1, 35000, { people: ['rama'] }), item('e', 'Es Teh', 1, 12000, { people: ['ivan'] })], extras: [{ id: 's', kind: 'service', label: 'Service', amount: 0, percent: 10, distribution: 'proportional' }, { id: 't', kind: 'tax', label: 'PB1', amount: 0, percent: 10, distribution: 'proportional' }] }));
  assert.deepEqual(receipt.extras.map(extra => extra.amount), [4700, 5170]);
  assert.equal(receipt.total, 56870);
  assert.equal(receipt.allocated, 56870);
  // The receipt says Rp57.000: the difference must be settled before saving (for example as rounding).
  const declared = computeSplit(bill({ total: 57000, method: 'items', participants: people('Rama', 'Ivan'), items: [item('n', 'Nasi Goreng', 1, 35000, { people: ['rama'] }), item('e', 'Es Teh', 1, 12000, { people: ['ivan'] })], extras: [{ id: 's', kind: 'service', label: 'Service', amount: 0, percent: 10, distribution: 'proportional' }, { id: 't', kind: 'tax', label: 'PB1', amount: 0, percent: 10, distribution: 'proportional' }] }));
  assert.equal(declared.mismatch, 130);
  assert.equal(declared.ok, false);
});

test('validation of people and totals', () => {
  assert.deepEqual(computeSplit(bill({ total: 50000, participants: people('Rama') })).issues.map(i => i.message), ['Tambahkan minimal 2 orang.']);
  assert.match(computeSplit(bill({ total: 50000, participants: people('Rama', 'rama') })).issues[0].message, /dipakai lebih dari sekali/);
  assert.deepEqual(computeSplit(bill({ total: 0 })).issues.map(i => i.message), ['Isi total tagihan.']);
  assert.deepEqual(computeSplit(bill({ method: 'items' })).issues.map(i => i.message), ['Isi total tagihan.', 'Tambahkan item, atau pilih cara bagi yang lain.']);
});

test('own share by category for the ledger', () => {
  const result = computeSplit(bill({ method: 'items', participants: people('Rama', 'Ivan'), items: [item('a', 'Nasi', 1, 30000, { people: ['rama'] }), item('b', 'Teh', 1, 10000, { people: ['rama', 'ivan'] })], extras: [{ id: 'court', kind: 'shared', label: 'Sewa Lapangan', amount: 50000, distribution: 'equal', categoryId: 'olahraga' }] }));
  assert.deepEqual(ownCategoryLines(result.people[0]), [{ categoryId: 'makan', subcategoryId: null, amount: 35000 }, { categoryId: 'olahraga', subcategoryId: null, amount: 25000 }]);
});

test('payment status: Piutang when I paid, Utang when someone else paid, and payments between others', () => {
  const participants = [{ id: 'me', name: 'Saya', isMe: true }, { id: 'rama', name: 'Rama', receivableId: 'r1' }, { id: 'aldi', name: 'Aldi', receivableId: 'r2' }, { id: 'atuy', name: 'Atuy', receivableId: 'r3' }];
  const mine = { id: 'b1', title: 'Makan', merchant: '', date: '2026-09-27', status: 'active', payer: 'me', payerId: 'me', walletId: 'jenius', transactionId: 't1', categoryId: 'makan', subcategoryId: null, total: 600000, method: 'amount', participants, items: [], extras: [], payments: [], notes: '', shares: { me: 150000, rama: 170000, aldi: 130000, atuy: 150000 } };
  const receivables = [{ id: 'r1', person: 'Rama', originalAmount: 170000, remainingAmount: 0 }, { id: 'r2', person: 'Aldi', originalAmount: 130000, remainingAmount: 130000 }, { id: 'r3', person: 'Atuy', originalAmount: 150000, remainingAmount: 75000 }];
  const progress = billProgress(mine, receivables, []);
  assert.deepEqual(progress.people.map(p => [p.name, p.status, p.remaining]), [['Saya', 'payer', 0], ['Rama', 'paid', 0], ['Aldi', 'unpaid', 130000], ['Atuy', 'partial', 75000]]);
  assert.equal(progress.status, 'partial');
  assert.equal(progress.toMe, 205000);
  assert.equal(progress.myShare, 150000);
  assert.equal(billProgress({ ...mine, status: 'draft' }, receivables, []).status, 'draft');
  assert.equal(billProgress(mine, receivables.map(r => ({ ...r, remainingAmount: 0 })), []).status, 'settled');

  const theirs = { ...mine, payer: 'other', payerId: 'ivan', participants: [{ id: 'me', name: 'Saya', isMe: true, debtId: 'd1' }, { id: 'ivan', name: 'Ivan' }, { id: 'aldi', name: 'Aldi' }], shares: { me: 100000, ivan: 150000, aldi: 150000 }, payments: [{ id: 'p', participantId: 'aldi', amount: 150000, date: '2026-09-28', createdAt: '' }] };
  const owed = billProgress(theirs, [], [{ id: 'd1', name: 'Ivan', originalAmount: 100000, outstandingAmount: 100000 }]);
  assert.deepEqual(owed.people.map(p => [p.name, p.role, p.status]), [['Saya', 'debt', 'unpaid'], ['Ivan', 'payer', 'payer'], ['Aldi', 'between', 'paid']]);
  assert.equal(owed.fromMe, 100000);
  assert.equal(owed.payerName, 'Ivan');
});

test('texts to share and reminders say only what this bill is about', () => {
  const participants = [{ id: 'ivan', name: 'Ivan' }, { id: 'rama', name: 'Rama' }, { id: 'me', name: 'Saya', isMe: true }];
  const shared = { id: 'b', title: 'Badminton + Dinner', merchant: 'GOR Sehat', date: '2026-09-27', status: 'active', payer: 'other', payerId: 'ivan', walletId: '', transactionId: '', categoryId: 'makan', subcategoryId: null, total: 0, method: 'items', participants, items: [item('m', 'Makanan', 1, 277500, { assign: 'custom', custom: { ivan: 92500, rama: 92500, me: 92500 } })], extras: [{ id: 'c', kind: 'shared', label: 'Sewa Lapangan', amount: 75000, distribution: 'equal' }, { id: 's', kind: 'service', label: 'Service', amount: 9000, distribution: 'proportional' }, { id: 't', kind: 'tax', label: 'PB1', amount: 18750, distribution: 'proportional' }], payments: [], notes: '' };
  const result = computeSplit(shared);
  assert.equal(result.ok, true);
  const text = personShareText(shared, result, 'rama', { myName: 'Dewi' });
  assert.equal(text, ['*Badminton + Dinner*', '27 Sep · GOR Sehat', '', 'Rama', 'Makanan: Rp92.500', 'Service + PB1: Rp9.250', 'Sewa Lapangan: Rp25.000', '', 'TOTAL: Rp126.750', 'Bayar ke: Ivan'].join('\n'));
  assert.doesNotMatch(text, /saldo|dompet|Dewi/i);
  const group = billShareText(shared, result, { myName: 'Dewi' });
  assert.equal(group, ['*Split Bill — Badminton + Dinner*', '27 Sep · GOR Sehat', '', 'Ivan: Rp126.750 (yang bayar)', 'Rama: Rp126.750', 'Dewi: Rp126.750', '', 'Total: Rp380.250', 'Bayar ke: Ivan'].join('\n'));
  assert.equal(reminderText(shared, { name: 'Rama' }, 126750), 'Hai Rama, bagian Split Bill Badminton + Dinner tanggal 27 Sep masih Rp126.750 ya, dibayar ke Ivan. Terima kasih!');
  assert.equal(reminderText({ ...shared, payer: 'me', payerId: 'me' }, { name: 'Rama' }, 126750), 'Hai Rama, bagian Split Bill Badminton + Dinner tanggal 27 Sep masih Rp126.750 ya. Terima kasih!');
});

test('reading text copied from a receipt, for the user to check', () => {
  const read = readReceiptText(`WARUNG MAKAN SEDERHANA
Jl. Merdeka No. 10
27/09/2026 19:30
Nasi Goreng        35.000
Es Teh 2 x 6.000   12.000
Subtotal           47.000
Service 10%         4.700
PB1 10%             5.170
Total              56.870
Tunai             100.000
Kembali            43.130`);
  assert.equal(read.merchant, 'WARUNG MAKAN SEDERHANA');
  assert.equal(read.date, '2026-09-27');
  assert.deepEqual(read.items.map(({ name, qty, price, total }) => ({ name, qty, price, total })), [{ name: 'Nasi Goreng', qty: 1, price: 35000, total: 35000 }, { name: 'Es Teh', qty: 2, price: 6000, total: 12000 }]);
  assert.deepEqual([read.subtotal, read.service, read.tax, read.total], [47000, 4700, 5170, 56870]);

  const other = readReceiptText(`KOPI KITA
ES KOPI SUSU
  2 x 18.000        36.000
2x Croissant 50.000
AQUA 600ML 2 3.500 7.000
Roti Bakar Rp 22.000
Diskon Member -10.000
Pembulatan -70
Grand Total 104.930
Bayar QRIS 104.930`);
  assert.equal(other.merchant, 'KOPI KITA');
  assert.deepEqual(other.items.map(i => [i.name, i.qty, i.price]), [['ES KOPI SUSU', 2, 18000], ['Croissant', 2, 25000], ['AQUA 600ML', 2, 3500], ['Roti Bakar', 1, 22000]]);
  assert.deepEqual([other.discount, other.rounding, other.total], [10000, -70, 104930]);
  // Nothing made up from lines it cannot read.
  assert.deepEqual(readReceiptText('terima kasih\natas kunjungan anda').items, []);
});

/* The ledger side: what the Split Bill store writes, read by the same accounting as every other screen. */
import { budgetSpent, effects, metrics, splitBillFlows, transactionExpense, transactionIncome, walletBalance } from '../lib/accounting.ts';
import { categoryBreakdown, incomeCategoryBreakdown, transactionsForBudget } from '../lib/category-analytics.ts';
import { incomeBreakdown, walletFlows } from '../lib/insights.ts';
const tx = (type, amount, walletId, extra = {}) => ({ id: Math.random().toString(36).slice(2), type, amount, walletId, destinationWalletId: null, date: '2026-09-27', categoryId: null, subcategoryId: null, merchant: '', description: '', notes: '', tags: [], claimId: null, debtId: null, receivableId: null, fundId: null, recurringTransactionId: null, draftId: null, adjustmentDirection: 'in', ...extra });
const categories = [{ id: 'makan', name: 'Makan & Minum', type: 'expense', parentId: null, icon: '🍜', sortOrder: 0, isArchived: false }, { id: 'olahraga', name: 'Olahraga', type: 'expense', parentId: null, icon: '🏸', sortOrder: 1, isArchived: false }];
const makanBudget = { id: 'b', name: 'Makan', categoryId: 'makan', subcategoryId: null, amount: 2000000, classification: 'living', cycleType: 'calendar', rolloverEnabled: false, active: true };
const wallet = (id, balance) => ({ id, name: id, type: 'bank', openingBalance: balance, cachedBalance: balance, purpose: '', isReserved: false, isSpendable: true, includeInNetWorth: true, isArchived: false });

test('scenario A: I paid Rp600.000 from Jenius, my share is Rp150.000', () => {
  const bill = tx('expense', 600000, 'jenius', { categoryId: 'makan', splitBillId: 'bill-a', ownShare: 150000 });
  // Cash really left Jenius: Rp600.000.
  assert.deepEqual(effects(bill), { jenius: -600000 });
  assert.equal(walletBalance(wallet('jenius', 1000000), [bill]), 400000);
  assert.deepEqual(walletFlows([bill], [wallet('jenius', 0)]).map(row => [row.id, row.out]), [['jenius', 600000]]);
  // Spending, budget and analysis: only my Rp150.000.
  assert.equal(transactionExpense(bill), 150000);
  assert.equal(budgetSpent(makanBudget, [bill], categories), 150000);
  assert.deepEqual(categoryBreakdown([bill], categories).map(row => [row.id, row.amount]), [['makan', 150000]]);
  assert.equal(transactionsForBudget([bill], categories, makanBudget)[0].amount, 150000);
  const data = { wallets: [{ ...wallet('jenius', 1000000), cachedBalance: 400000 }], categories, budgets: [makanBudget], transactions: [bill], claims: [], receivables: [{ id: 'r', originalAmount: 450000, remainingAmount: 450000 }], debts: [], funds: [], recurring: [], drafts: [], plannedTransactions: [], categorizationRules: [], financialNotes: [], cycleSnapshots: [], wishlist: [] };
  const m = metrics(data, '2026-09-01', '2026-10-01', 24, new Date(2026, 8, 28), true);
  assert.equal(m.expenses, 150000);
  assert.equal(m.receivables, 450000);
  // Net worth fell by my own share only once the Rp450.000 owed to me is counted.
  assert.equal(m.netWorth, 400000 + 450000);

  // Rama pays back Rp170.000 into Jago: the balance goes up, it is not income.
  const repaid = tx('receivable_payment', 170000, 'jago', { receivableId: 'r-rama', splitBillId: 'bill-a' });
  assert.deepEqual(effects(repaid), { jago: 170000 });
  assert.equal(transactionIncome(repaid), 0);
  assert.equal(transactionExpense(repaid), 0);
  assert.deepEqual(incomeBreakdown([repaid], categories), []);
  assert.deepEqual(incomeCategoryBreakdown([repaid], categories), []);
  // An ordinary Piutang repayment keeps its old meaning.
  assert.equal(transactionIncome(tx('receivable_payment', 50000, 'jago', { receivableId: 'r-other' })), 50000);

  assert.deepEqual(splitBillFlows([bill, repaid]), { cashOut: 600000, ownShare: 150000, advanced: 450000, repaid: 170000, settled: 0, bills: 1 });
});

test('scenario B: Ivan paid Rp400.000, my share is Rp100.000', () => {
  // My share: spending on the day, no wallet moves yet.
  const share = tx('expense', 100000, '', { categoryId: 'makan', splitBillId: 'bill-b' });
  assert.deepEqual(effects(share), {});
  assert.equal(transactionExpense(share), 100000);
  assert.equal(budgetSpent(makanBudget, [share], categories), 100000);
  assert.deepEqual(walletFlows([share], [wallet('jago', 0)]), []);
  // Paying Ivan back later from Jago: money leaves, but it is not a second expense.
  const settle = tx('debt_payment', 100000, 'jago', { debtId: 'd-ivan', splitBillId: 'bill-b' });
  assert.deepEqual(effects(settle), { jago: -100000 });
  assert.equal(transactionExpense(settle), 0);
  assert.equal(budgetSpent(makanBudget, [share, settle], categories), 100000);
  assert.deepEqual(categoryBreakdown([share, settle], categories).map(row => [row.id, row.amount]), [['makan', 100000]]);
  // An ordinary debt payment is still spending.
  assert.equal(transactionExpense(tx('debt_payment', 100000, 'jago', { debtId: 'd-bank' })), 100000);
  assert.deepEqual(splitBillFlows([share, settle]), { cashOut: 0, ownShare: 100000, advanced: 0, repaid: 0, settled: 100000, bills: 1 });
});

test('the own share follows the categories of what I had', () => {
  // Items in two categories: my Rp165.000 = Rp140.000 food + Rp25.000 court.
  const bill = tx('expense', 720000, 'jenius', { categoryId: 'makan', splitBillId: 'bill', ownShare: 165000, ownSplits: [{ categoryId: 'makan', subcategoryId: null, amount: 140000 }, { categoryId: 'olahraga', subcategoryId: null, amount: 25000 }] });
  assert.deepEqual(categoryBreakdown([bill], categories).map(row => [row.id, row.amount]), [['makan', 140000], ['olahraga', 25000]]);
  // A transaction already split over categories: the own share is divided the same way.
  const split = tx('expense', 300000, 'jenius', { splitBillId: 'bill', ownShare: 100000, splits: [{ categoryId: 'makan', subcategoryId: null, amount: 200000 }, { categoryId: 'olahraga', subcategoryId: null, amount: 100000 }] });
  assert.deepEqual(categoryBreakdown([split], categories).map(row => [row.id, row.amount]), [['makan', 66667], ['olahraga', 33333]]);
  // Paying for others only: no own spending at all.
  assert.equal(transactionExpense(tx('expense', 90000, 'jenius', { categoryId: 'makan', splitBillId: 'bill', ownShare: 0 })), 0);
});

import { splitBillFindings } from '../lib/advisor.ts';
test('Insight: money still out in Split Bills, payback time, and own unpaid shares', () => {
  const receivables = [
    { id: 'r1', person: 'Dimas', originalAmount: 170000, remainingAmount: 0, date: '2026-09-01', dueDate: '', sourceType: 'split_bill', splitBillId: 'b1' },
    { id: 'r2', person: 'Aldi', originalAmount: 130000, remainingAmount: 0, date: '2026-09-01', dueDate: '', sourceType: 'split_bill', splitBillId: 'b1', manualPayments: [{ id: 'm', amount: 130000, date: '2026-09-06' }] },
    { id: 'r3', person: 'Atuy', originalAmount: 150000, remainingAmount: 75000, date: '2026-09-01', dueDate: '', sourceType: 'split_bill', splitBillId: 'b1' },
    { id: 'r4', person: 'Budi', originalAmount: 50000, remainingAmount: 50000, date: '2026-09-25', dueDate: '', sourceType: 'split_bill', splitBillId: 'b2' },
    { id: 'r5', person: 'Andi', originalAmount: 300000, remainingAmount: 100000, date: '2026-08-01', dueDate: '' },
  ];
  const history = [tx('receivable_payment', 170000, 'bca', { receivableId: 'r1', splitBillId: 'b1', date: '2026-09-04' })];
  const debts = [{ id: 'd', name: 'Ivan', provider: 'Split Bill — Badminton', originalAmount: 100000, outstandingAmount: 100000, dueDate: '2026-09-20', sourceType: 'split_bill', splitBillId: 'b3' }];
  const found = splitBillFindings({ receivables, debts }, history, '2026-09-27');
  const owed = found.find(f => f.id === 'split-owed');
  assert.equal(owed.title, '1 Split Bill belum lunas lebih dari 14 hari');
  assert.match(owed.detail, /Rp125\.000\*\* masih ada di 2 orang dari 2 Split Bill/);
  assert.match(owed.detail, /dalam \*\*4 hari\*\*/);
  assert.doesNotMatch(owed.detail, /boros|salah|buruk/i);
  const payable = found.find(f => f.id === 'split-payable');
  assert.equal(payable.title, 'Bagianmu Rp100.000 di Split Bill belum dibayar');
  assert.equal(payable.tone, 'warn');
  assert.deepEqual(splitBillFindings({ receivables: [receivables[4]], debts: [] }, [], '2026-09-27'), []);
});
