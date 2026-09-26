import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickText } from '../lib/quick-entry.ts';

const ctx = {
  today: '2026-09-26',
  wallets: [{ id: 'bca', name: 'BCA' }, { id: 'gopay', name: 'GoPay' }, { id: 'cash', name: 'Tunai' }, { id: 'jenius', name: 'Jenius' }],
  categories: [
    { id: 'food', name: 'Makan & Minum', type: 'expense' }, { id: 'drink', name: 'Minuman', type: 'expense', parentId: 'food' },
    { id: 'trans', name: 'Transportasi', type: 'expense' }, { id: 'park', name: 'Parkir', type: 'expense', parentId: 'trans' },
    { id: 'shop', name: 'Belanja', type: 'expense' }, { id: 'salary', name: 'Gaji', type: 'income' },
  ],
  history: [],
};
const p = (text, extra = {}) => parseQuickText(text, { ...ctx, ...extra })?.preset;

test('the example sentence: beli pocari 8rb di alfa', () => {
  assert.deepEqual(p('beli pocari 8rb di alfa'), { type: 'expense', amount: 8000, date: '2026-09-26', merchant: 'Alfamart', description: 'Pocari', categoryId: 'food', subcategoryId: null });
});
test('amount formats', () => {
  for (const [text, amount] of [['kopi 25k', 25000], ['bensin Rp 50.000', 50000], ['gaji 7,5jt masuk bca', 7500000], ['makan 1.250.000', 1250000], ['parkir 5000', 5000], ['jajan 2 ribu', 2000]]) assert.equal(p(text).amount, amount, text);
  assert.equal(parseQuickText('beli pocari di alfa', ctx), null);
});
test('income, wallet, date and a category named in the text', () => {
  assert.deepEqual(p('gaji 7,5jt masuk bca'), { type: 'income', amount: 7500000, date: '2026-09-26', walletId: 'bca', description: 'Gaji', categoryId: 'salary', subcategoryId: null });
  const park = p('parkir 5000 kemarin pake tunai');
  assert.deepEqual([park.date, park.walletId, park.categoryId, park.subcategoryId], ['2026-09-25', 'cash', 'trans', 'park']);
  assert.equal(p('makan siang 30rb tgl 28').date, '2026-08-28');
  assert.equal(p('bakso 15rb 3 hari lalu').date, '2026-09-23');
});
test('transfer between two wallets', () => {
  const tf = p('tf 200rb dari bca ke gopay');
  assert.deepEqual([tf.type, tf.amount, tf.walletId, tf.destinationWalletId], ['transfer', 200000, 'bca', 'gopay']);
});
test('earlier transactions teach the category and the full place name', () => {
  const history = [{ type: 'expense', description: 'Sabun', merchant: 'Superindo Kemang', categoryId: 'shop', subcategoryId: null, date: '2026-09-01' }];
  const r = p('sabun 12rb di superindo', { history });
  assert.deepEqual([r.description, r.merchant, r.categoryId], ['Sabun', 'Superindo', 'shop']);
  const r2 = p('beli tisu 9rb di superindo kemang', { history });
  assert.equal(r2.merchant, 'Superindo Kemang');
  // A category the user doesn't have is never invented.
  assert.equal(p('netflix 54rb', { categories: ctx.categories }).categoryId, undefined);
});

const records = {
  debts: [{ id: 'd1', name: 'Cicilan laptop', provider: 'Kredivo', outstandingAmount: 5_500_000 }, { id: 'd2', name: 'Pinjaman Budi', provider: 'Budi', outstandingAmount: 300_000 }],
  receivables: [{ id: 'r1', person: 'Andi', description: 'Makan', remainingAmount: 150_000 }],
  claims: [{ id: 'c1', name: 'Hotel Bandung', remainingAmount: 900_000 }],
  funds: [{ id: 'f1', name: 'Dana Darurat', linkedWalletId: 'tabungan' }, { id: 'f2', name: 'Liburan Bali', walletIds: ['bca'] }],
  wishlist: [{ id: 'w1', name: 'Headphone noise cancelling', status: 'active' }],
};
const q = (text, mode) => parseQuickText(text, { ...ctx, ...records }, mode);
const brief = r => r && { kind: r.kind, amount: r.amount, ...(r.person !== undefined ? { person: r.person } : {}), ...(r.name ? { name: r.name } : {}), ...(r.wishId ? { wishId: r.wishId } : {}), ...Object.fromEntries(['type', 'walletId', 'destinationWalletId', 'debtId', 'receivableId', 'claimId', 'fundId', 'description'].filter(k => r.preset[k] !== undefined).map(k => [k, r.preset[k]])) };

test('utang: borrowing money and paying it back', () => {
  assert.deepEqual(brief(q('pinjam 500rb dari budi')), { kind: 'debt_new', amount: 500000, person: 'Budi', name: 'Pinjaman Budi' });
  assert.deepEqual(brief(q('dipinjemin budi 1jt masuk bca')), { kind: 'debt_new', amount: 1000000, person: 'Budi', name: 'Pinjaman Budi', walletId: 'bca' });
  assert.equal(q('utang 200rb ke warung sebelah').person, 'Warung');
  assert.equal(q('kasbon 1jt ke kantor').name, 'Kasbon Kantor');
  assert.deepEqual(brief(q('bayar cicilan laptop 500rb')), { kind: 'debt_payment', amount: 500000, type: 'debt_payment', debtId: 'd1', description: 'Bayar Cicilan laptop' });
  assert.deepEqual(brief(q('bayar utang budi 100rb pake gopay')), { kind: 'debt_payment', amount: 100000, type: 'debt_payment', walletId: 'gopay', debtId: 'd2', description: 'Bayar Pinjaman Budi' });
  assert.equal(q('cicil kredivo 750rb').preset.debtId, 'd1');
  assert.equal(q('balikin uang budi 300rb').kind, 'debt_payment');
  assert.deepEqual([q('lunasin utang budi').kind, q('lunasin utang budi').amount], ['debt_payment', 300000]);
});
test('piutang: lending money and getting it back', () => {
  assert.deepEqual(brief(q('pinjemin andi 100rb')), { kind: 'receivable_new', amount: 100000, person: 'Andi' });
  assert.equal(q('andi pinjam 100rb').kind, 'receivable_new');
  assert.equal(q('budi utang 200rb').kind, 'receivable_new');
  assert.deepEqual(brief(q('bayarin sinta makan 50rb')), { kind: 'receivable_new', amount: 50000, person: 'Sinta', description: 'Makan' });
  assert.deepEqual(brief(q('andi bayar 50rb')), { kind: 'receivable_payment', amount: 50000, type: 'receivable_payment', receivableId: 'r1', description: 'Dibayar Andi' });
  assert.equal(q('terima 50rb dari andi masuk bca').preset.walletId, 'bca');
  assert.equal(q('terima 50rb dari andi masuk bca').kind, 'receivable_payment');
  assert.deepEqual([q('andi lunas').kind, q('andi lunas').amount], ['receivable_payment', 150000]);
});
test('klaim kantor and target', () => {
  assert.deepEqual(brief(q('klaim taksi 80rb')), { kind: 'claim_new', amount: 80000, name: 'Taksi' });
  assert.deepEqual(brief(q('reimburse hotel 300rb pake bca')), { kind: 'claim_new', amount: 300000, name: 'Hotel', walletId: 'bca' });
  assert.deepEqual(brief(q('klaim cair 900rb')), { kind: 'claim_payment', amount: 900000, type: 'claim_payment', claimId: 'c1', description: 'Klaim cair: Hotel Bandung' });
  assert.equal(q('klaim hotel bandung cair').amount, 900000);
  assert.deepEqual(brief(q('nabung 500rb ke dana darurat')), { kind: 'target', amount: 500000, type: 'fund_contribution', destinationWalletId: 'tabungan', fundId: 'f1', description: 'Isi Dana Darurat' });
  assert.deepEqual(brief(q('isi liburan bali 1jt dari jenius')), { kind: 'target', amount: 1000000, type: 'fund_contribution', walletId: 'jenius', destinationWalletId: 'bca', fundId: 'f2', description: 'Isi Liburan Bali' });
  assert.deepEqual(brief(q('nabung 100rb buat headphone')), { kind: 'wish', amount: 100000, wishId: 'w1' });
});
test('everyday entries stay what they were, and a chip or an exact kind wins', () => {
  assert.equal(q('bayar listrik 350rb pake bca').kind, 'expense');
  assert.equal(q('makan siang 30rb').preset.description, 'Makan Siang');
  assert.equal(q('dapat bonus 1jt').kind, 'income');
  assert.equal(q('tf 200rb dari bca ke gopay').kind, 'transfer');
  assert.equal(q('andi 50rb', 'receivable').kind, 'receivable_new');
  assert.equal(q('andi 50rb', 'receivable_payment').preset.receivableId, 'r1');
  assert.equal(q('budi 500rb', 'debt').person, 'Budi');
  assert.equal(q('kopi 25rb', 'income').kind, 'income');
  assert.equal(q('pinjam 500rb dari budi', 'expense').kind, 'expense');
});
test('two loans to the same friend: a repayment goes to the oldest one', () => {
  const receivables = [{ id: 'r2', person: 'Andi', remainingAmount: 100_000, date: '2026-09-20' }, { id: 'r1', person: 'Andi', remainingAmount: 150_000, date: '2026-08-01' }];
  assert.equal(parseQuickText('andi bayar 50rb', { ...ctx, receivables }).preset.receivableId, 'r1');
  // Two different debts that both only match "cicilan" stay undecided (the form asks).
  const debts = [{ id: 'a', name: 'Cicilan laptop', provider: '', outstandingAmount: 1 }, { id: 'b', name: 'Cicilan motor', provider: '', outstandingAmount: 1 }];
  assert.equal(parseQuickText('bayar cicilan 500rb', { ...ctx, debts }).preset.debtId, undefined);
});
test('a wallet word inside a target name is not the wallet', () => {
  const wallets = [...ctx.wallets, { id: 'tabungan', name: 'Tabungan Darurat' }];
  const r = parseQuickText('nabung 200rb ke dana darurat dari bca', { ...ctx, ...records, wallets });
  assert.deepEqual([r.kind, r.preset.walletId, r.preset.destinationWalletId, r.preset.fundId], ['target', 'bca', 'tabungan', 'f1']);
});
