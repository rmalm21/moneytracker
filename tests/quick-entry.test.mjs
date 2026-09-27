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
  // Pocari is a drink: the Minuman subcategory, inside Makan & Minum.
  assert.deepEqual(p('beli pocari 8rb di alfa'), { type: 'expense', amount: 8000, date: '2026-09-26', merchant: 'Alfamart', description: 'Pocari', categoryId: 'food', subcategoryId: 'drink' });
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

// The other menus.
const menus = {
  ...ctx, ...records,
  wallets: [...ctx.wallets, { id: 'dana', name: 'DANA' }],
  categories: [...ctx.categories, { id: 'fun', name: 'Hiburan', type: 'expense' }, { id: 'bills', name: 'Tagihan', type: 'expense' }, { id: 'save', name: 'Tabungan', type: 'savings' }],
  budgets: [{ id: 'b1', name: 'Makan & Minum', categoryId: 'food', subcategoryId: null, amount: 1_500_000, active: true, cycleType: 'salary' }],
};
const m = (text, mode) => parseQuickText(text, menus, mode);

test('buka menu: a menu name, with or without "buka", opens it', () => {
  assert.deepEqual(m('buka laporan').menu, { key: 'report', label: 'Laporan' });
  assert.deepEqual(m('lihat utang').menu, { key: 'debts', label: 'Utang' });
  assert.deepEqual(m('pengaturan').menu, { key: 'settings', label: 'Pengaturan' });
  assert.deepEqual(m('pengingat').menu, { key: 'settings', target: 'reminders', label: 'Pengingat' });
  assert.deepEqual(m('saldo bca').menu, { key: 'wallets', target: 'bca', label: 'BCA' });
  assert.equal(m('anggaran').kind, 'open');
  // An amount means something is being recorded, not opened.
  assert.equal(m('buka puasa 50rb').kind, 'expense');
  assert.equal(m('laporan keuangan tahunan', 'open').menu.key, 'report');
});
test('anggaran: a new budget, or the existing one changes', () => {
  assert.deepEqual([m('anggaran transport 1jt').kind, m('anggaran transport 1jt').amount, m('anggaran transport 1jt').budget], ['budget', 1_000_000, { categoryId: 'trans', subcategoryIds: [], cycleType: 'salary' }]);
  assert.deepEqual(m('anggaran makan 2jt per bulan').budget, { id: 'b1', previous: 1_500_000, categoryId: 'food', subcategoryIds: [], cycleType: 'salary' });
  assert.equal(m('naikin anggaran makan 500rb').amount, 2_000_000);
  assert.equal(m('turunin anggaran makan 500rb').amount, 1_000_000);
  assert.equal(m('anggaran makan jadi 2,5jt').amount, 2_500_000);
  assert.deepEqual(m('anggaran parkir 200rb').budget, { categoryId: 'trans', subcategoryIds: ['park'], cycleType: 'salary' });
  // A different period is another budget, not a change to the monthly one.
  assert.deepEqual(m('jatah jajan 300rb per minggu').budget, { categoryId: 'food', subcategoryIds: [], cycleType: 'weekly', cycleStartDay: 1 });
  assert.deepEqual(m('budget hiburan 500rb mulai tgl 25').budget, { categoryId: 'fun', subcategoryIds: [], cycleType: 'custom', cycleStartDay: 25 });
  assert.equal(m('anggaran makan').amount, 0);
});
test('tujuan dana baru: name, target, deadline, monthly saving, where it is kept', () => {
  const trip = m('target liburan jepang 30jt desember 2027');
  assert.deepEqual([trip.kind, trip.amount, trip.name, trip.goal], ['fund_new', 30_000_000, 'Liburan Jepang', { targetDate: '2027-12-31', monthly: 0, emergency: false }]);
  const house = m('buat target rumah 500jt tahun 2030 nabung 5jt per bulan');
  assert.deepEqual([house.amount, house.name, house.goal.targetDate, house.goal.monthly], [500_000_000, 'Rumah', '2030-12-31', 5_000_000]);
  assert.deepEqual([m('target nikah 100jt di jenius').preset.walletId, m('tujuan dana motor baru 25jt').name], ['jenius', 'Motor Baru']);
  // The same name is the existing target (its amount changes); "dana" is not the DANA wallet here.
  const emergency = m('target dana darurat 30jt');
  assert.deepEqual([emergency.name, emergency.goal.existingId, emergency.goal.emergency, emergency.preset.walletId], ['Dana Darurat', 'f1', true, undefined]);
  assert.equal(m('isi target liburan bali 500rb').kind, 'target');
});
test('wish list baru: price, picture, priority and monthly saving', () => {
  assert.deepEqual([m('pengen headphone 1,5jt').kind, m('pengen headphone 1,5jt').amount, m('pengen headphone 1,5jt').goal.emoji], ['wish_new', 1_500_000, '🎧']);
  assert.equal(m('pengen beli iphone 15 20jt').name, 'iPhone 15');
  assert.equal(m('wishlist sepatu lari 1,2jt prioritas tinggi').goal.priority, 1);
  const ps = m('impian ps5 8jt nabung 500rb per bulan');
  assert.deepEqual([ps.kind, ps.amount, ps.name, ps.goal.monthly], ['wish_new', 8_000_000, 'PS5', 500_000]);
  assert.equal(m('wishlist headphone noise cancelling 3jt').goal.existingId, 'w1');
  assert.equal(m('pengen nabung 1jt buat headphone').kind, 'wish');
});
test('dompet baru and perbarui saldo', () => {
  assert.deepEqual([m('rekening baru jago saldo 1jt').name, m('rekening baru jago saldo 1jt').amount, m('rekening baru jago saldo 1jt').wallet], ['Jago', 1_000_000, { type: 'bank' }]);
  assert.deepEqual([m('tambah dompet ovo').name, m('tambah dompet ovo').wallet.type], ['OVO', 'ewallet']);
  assert.deepEqual([m('kartu kredit baru bca').name, m('kartu kredit baru bca').wallet.type], ['Kartu Kredit BCA', 'credit']);
  assert.equal(m('buat rekening bca').wallet.existingId, 'bca');
  for (const [text, wallet, amount] of [['saldo bca sekarang 12jt', 'bca', 12_000_000], ['perbarui saldo gopay 150rb', 'gopay', 150_000], ['gopay tinggal 150rb', 'gopay', 150_000], ['saldo dana 200rb', 'dana', 200_000]]) {
    const r = m(text); assert.deepEqual([r.kind, r.preset.walletId, r.amount], ['balance', wallet, amount], text);
  }
  assert.equal(m('biaya tinggal di hotel 500rb pake bca').kind, 'expense');
  const topup = m('topup gopay 50rb');
  assert.deepEqual([topup.kind, topup.preset.walletId, topup.preset.destinationWalletId], ['transfer', undefined, 'gopay']);
  assert.deepEqual([m('bca 12jt', 'wallet').kind, m('dompet arisan', 'wallet').kind], ['balance', 'wallet_new']);
});
test('kategori baru: never a copy of one that exists', () => {
  assert.deepEqual([m('kategori baru jajan').name, m('kategori baru jajan').category], ['Jajan', { type: 'expense', parentId: null }]);
  assert.deepEqual(m('tambah kategori freelance pemasukan').category, { type: 'income', parentId: null });
  assert.deepEqual([m('subkategori tol di transport').name, m('subkategori tol di transport').category], ['Tol', { type: 'expense', parentId: 'trans' }]);
  assert.equal(m('subkategori parkir di transportasi').category.existingId, 'park');
  assert.equal(m('kategori baru makan & minum').category.existingId, 'food');
  assert.equal(m('subkategori kopi').category.parentAsked, true);
});
test('jadwal rutin: how often and when it starts', () => {
  const netflix = m('langganan netflix 54rb tiap tanggal 5 pake bca');
  assert.deepEqual([netflix.kind, netflix.name, netflix.date, netflix.schedule, netflix.preset.walletId, netflix.preset.categoryId], ['recurring_new', 'Netflix', '2026-10-05', { frequency: 'monthly', mode: 'inbox', anchorDay: 5 }, 'bca', 'fun']);
  const salary = m('gaji 7,5jt tiap tanggal 25 masuk bca');
  assert.deepEqual([salary.preset.type, salary.name, salary.date], ['income', 'Gaji', '2026-10-25']);
  assert.deepEqual([m('bayar pajak motor 500rb tiap 17 agustus').schedule.frequency, m('bayar pajak motor 500rb tiap 17 agustus').date], ['yearly', '2027-08-17']);
  assert.deepEqual([m('arisan 200rb tiap minggu').schedule.frequency, m('spotify 55rb per bulan otomatis').schedule.mode], ['weekly', 'auto']);
  assert.equal(m('bayar kos 1,5jt tiap bulan tgl 1').date, '2026-10-01');
  assert.equal(m('cicilan motor 800rb tiap tanggal 10').name, 'Cicilan Motor');
});
test('rencana and catatan: things still to come', () => {
  assert.deepEqual([m('besok bayar arisan 200rb').kind, m('besok bayar arisan 200rb').date, m('besok bayar arisan 200rb').name], ['plan_new', '2026-09-27', 'Arisan']);
  assert.deepEqual([m('rencana servis motor 500rb tgl 10').date, m('rencana servis motor 500rb tgl 10').name], ['2026-10-10', 'Servis Motor']);
  assert.deepEqual([m('bayar pajak 500rb 17 oktober').kind, m('bayar pajak 500rb 17 oktober').date], ['plan_new', '2026-10-17']);
  assert.equal(m('terima bonus 2jt bulan depan').preset.type, 'income');
  const stnk = m('ingetin perpanjang stnk 20 oktober');
  assert.deepEqual([stnk.kind, stnk.name, stnk.date, stnk.reminder], ['note_new', 'Perpanjang STNK', '2026-10-20', true]);
  assert.deepEqual([m('ingetin bayar utang budi tgl 1').kind, m('ingetin bayar utang budi tgl 1').date], ['note_new', '2026-10-01']);
  assert.equal(m('catatan: bulan ini banyak kondangan').name, 'Bulan ini banyak kondangan');
  // Past dates in words still work for what already happened.
  assert.equal(m('kopi 25rb senin').date, '2026-09-21');
  assert.deepEqual([m('makan 50rb 20 september').kind, m('makan 50rb 20 september').date], ['expense', '2026-09-20']);
});
test('everyday spending that only sounds like another menu stays spending', () => {
  for (const text of ['belanja bulanan 500rb', 'uang mingguan anak 100rb', 'iuran bulanan rt 50rb', 'belanja rutin 200rb', 'beli dompet baru 150rb', 'jatah makan siang kantor 30rb', 'ingin makan bakso 20rb', 'beli kado impian istri 500rb', 'buka puasa 50rb', 'bayar langganan spotify 55rb', 'parkir 5rb tiap hari']) assert.equal(m(text).kind, 'expense', text);
  // Picked on a chip, those words do count.
  assert.deepEqual([m('netflix 54rb bulanan', 'recurring').schedule.frequency, m('netflix 54rb bulanan', 'recurring').name], ['monthly', 'Netflix']);
  assert.equal(m('arisan 100rb mingguan', 'recurring').schedule.frequency, 'weekly');
  assert.deepEqual(m('lap', 'open').menu, { key: 'report', label: 'Laporan' });
});

import { amountWords, parseQuickBatch } from '../lib/quick-entry.ts';
import { categoryTemplates as allTemplates } from '../lib/category-templates.ts';
const tpl = [];
for (const t of allTemplates) { tpl.push({ id: t.key, name: t.name, type: t.type, parentId: null }); for (const s of t.subcategories) tpl.push({ id: s.key, name: s.name, type: t.type, parentId: t.key }); }
const wctx = { today: '2026-09-27', wallets: [{ id: 'bca', name: 'BCA', type: 'bank' }, { id: 'gopay', name: 'GoPay', type: 'ewallet' }, { id: 'jago', name: 'Jago', type: 'bank' }, { id: 'cash', name: 'Tunai', type: 'cash' }], categories: tpl, history: [], budgets: [] };

test('amounts in words and slang', () => {
  assert.equal(amountWords('makan dua puluh lima ribu'), 'makan 25000');
  assert.equal(amountWords('bayar kos satu setengah juta'), 'bayar kos 1500000');
  assert.equal(amountWords('sejuta setengah'), '1500000');
  assert.equal(amountWords('belanja setengah juta'), 'belanja 500000');
  assert.equal(amountWords('dua ratus lima puluh ribu'), '250000');
  assert.equal(amountWords('tiga belas ribu'), '13000');
  assert.equal(amountWords('beli satu kopi'), 'beli satu kopi');
  for (const [text, value] of [['parkir goceng', 5000], ['makan ceban', 10000], ['bensin gocap', 50000], ['pulsa cepek', 100000], ['jajan seceng', 1000]]) assert.equal(parseQuickText(text, wctx).amount, value, text);
  assert.equal(parseQuickText('makan 30rb 3/9', wctx).preset.date, '2026-09-03');
});

test('money moving between wallets goes the right way', () => {
  const move = text => { const r = parseQuickText(text, wctx); return [r.kind, r.preset.walletId || '', r.preset.destinationWalletId || '']; };
  assert.deepEqual(move('top up gopay 100rb dari bca'), ['transfer', 'bca', 'gopay']);
  assert.deepEqual(move('tf 200rb ke gopay dari bca'), ['transfer', 'bca', 'gopay']);
  assert.deepEqual(move('isi gopay 50rb pakai bca'), ['transfer', 'bca', 'gopay']);
  assert.deepEqual(move('tarik tunai 500rb dari jago'), ['transfer', 'jago', 'cash']);
  assert.deepEqual(move('setor tunai 1jt ke bca'), ['transfer', 'cash', 'bca']);
  assert.equal(parseQuickText('biaya tarik tunai 6.500', wctx).kind, 'expense');
  assert.equal(parseQuickText('freelance desain 2,5jt', wctx).kind, 'income');
  assert.equal(parseQuickText('dapat transferan dari mama 500rb', wctx).preset.subcategoryId, 'income.penghasilan-tambahan.hadiah-uang');
});

test('a budget covers exactly the subcategories asked for', () => {
  const subs = text => { const r = parseQuickText(text, wctx); return r.budget.subcategoryIds.map(id => id.split('.').pop()).join(','); };
  assert.equal(subs('budget makan 2jt untuk sarapan, makan siang dan kopi'), 'sarapan,makan-siang,kopi-minuman');
  assert.equal(subs('budget makan siang dan malam 1,5jt'), 'makan-siang,makan-malam');
  assert.equal(subs('budget transport 1jt: bensin, parkir, tol'), 'bensin,parkir,tol');
  assert.equal(subs('budget makan khusus sarapan 400rb'), 'sarapan');
  const except = parseQuickText('budget hiburan 500rb selain bioskop', wctx);
  assert.ok(!except.budget.subcategoryIds.includes('expense.nongkrong-hiburan.bioskop') && except.budget.subcategoryIds.length === 9);
  assert.equal(except.name, 'Nongkrong & Hiburan (tanpa Bioskop)');
  assert.equal(parseQuickText('budget makan 2jt kecuali delivery', wctx).budget.subcategoryIds.includes('expense.makan-minum.delivery'), false);
});

test('several entries at once, sharing a date or a wallet said once', () => {
  const b = parseQuickBatch('kemarin makan 25rb, parkir goceng, bensin 30rb pakai gopay', wctx);
  assert.deepEqual(b.map(i => [i.result.amount, i.result.preset.date, i.result.preset.walletId]), [[25000, '2026-09-26', 'gopay'], [5000, '2026-09-26', 'gopay'], [30000, '2026-09-26', 'gopay']]);
  const budgets = parseQuickBatch('budget makan 2jt, transport 800rb, hiburan 500rb', wctx);
  assert.deepEqual(budgets.map(i => [i.result.kind, i.result.budget.categoryId]), [['budget', 'expense.makan-minum'], ['budget', 'expense.transportasi'], ['budget', 'expense.nongkrong-hiburan']]);
  const lines = parseQuickBatch('gaji 7jt\nmakan 30rb\ntf 500rb dari bca ke gopay', wctx);
  assert.deepEqual(lines.map(i => [i.result.kind, i.result.preset.walletId || '']), [['income', ''], ['expense', ''], ['transfer', 'bca']]);
  assert.equal(parseQuickBatch('makan 25rb terus ngopi 18rb', wctx).length, 2);
  // One entry stays one entry.
  for (const text of ['laptop 12,5jt', 'beli nasi dan es teh 25rb', 'tf 200rb dari bca ke gopay']) assert.equal(parseQuickBatch(text, wctx), null, text);
});
