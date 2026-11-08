import test from 'node:test';
import assert from 'node:assert/strict';
import { makePdf } from './helpers/pdf.mjs';
import { T, ewalletPdf, bankPocketsPdf, classicBankPages } from './helpers/statement-pdfs.mjs';
import { readStatement, readStatementSource, readStatementFile, planImport, reconcile } from '../lib/import/statement.ts';

// 8.7 — bank and e-wallet statements as PDF, read on the device. Every PDF here is made up for the test (written by
// tests/helpers/pdf.mjs in the layouts of an e-wallet history, a digital bank's e-statement with pockets, and a classic
// bank e-statement, tests/helpers/statement-pdfs.mjs): no real account data.
const today = '2026-11-07';

const readPdf = async (bytes, password) => { const src = await readStatementSource(bytes, { password }); return { src, read: readStatement(src.table, today, undefined, src.meta) }; };

test('8.7 an e-wallet history PDF: two-line rows, summary under its labels, Coins cashback left out, totals match', async () => {
  const { src, read } = await readPdf(ewalletPdf());
  assert.equal(src.kind, 'pdf');
  assert.equal(src.meta.owner, 'Budi Santoso');
  assert.deepEqual([src.meta.totalIn, src.meta.totalOut, src.meta.pointsUsed], [100071, 110264, 250]);
  assert.deepEqual(read.rows.map(r => [r.date, r.amount, r.type]), [
    ['2026-10-05', 25000, 'expense'], ['2026-10-06', 100000, 'income'], ['2026-10-08', 15500, 'expense'], ['2026-10-09', 50000, 'expense'],
    ['2026-10-10', 20000, 'expense'], ['2026-10-12', 71, 'income'], ['2026-10-12', 14, 'expense'],
  ]);
  assert.equal(read.points, 1, 'the Coins cashback row (no Rp) is points, not money');
  // Money out is 250 more than the bank's total: paid with Coins. Still complete.
  assert.equal(read.balance.complete, true);
  assert.equal(read.rows[0].description, 'Kopi Kenangan Senopati');
});

test('8.7 an e-wallet history: top-ups and money to your own name are moves between your wallets, not income or spending', async () => {
  const { read } = await readPdf(ewalletPdf());
  const wallets = [{ id: 'gopay', name: 'GoPay', type: 'ewallet' }, { id: 'bca', name: 'BCA', type: 'bank' }];
  const plan = planImport(read, { walletId: 'gopay', wallets, categories: [], transactions: [], drafts: [] });
  const by = Object.fromEntries(plan.map(x => [x.description.split(' · ')[0], x]));
  assert.deepEqual([by['GoPay top up'].flow, by['GoPay top up'].walletId, by['GoPay top up'].destinationWalletId, by['GoPay top up'].name], ['transfer', '', 'gopay', 'Top up GoPay']);
  assert.deepEqual([by['Ditransfer ke Budi Santoso'].flow, by['Ditransfer ke Budi Santoso'].destinationWalletId, by['Ditransfer ke Budi Santoso'].name], ['transfer', null, 'Transfer ke rekening sendiri']);
  assert.equal(by['Ditransfer ke Sari Wulandari'].flow, 'expense');
  assert.equal(by['Bunga'].name, 'Bunga tabungan');
  assert.equal(by['Pajak atas bunga'].name, 'Pajak bunga');
  // The money in from your own account adds to this wallet when the balance is matched.
  const match = reconcile({ ...read, balance: { closing: 100000, closingDate: '2026-10-31' } }, plan, { id: 'gopay', cachedBalance: 0 }, []);
  assert.equal(match.pending, -25000 + 100000 - 15500 - 50000 - 20000 + 71 - 14);
});

test('8.7 a digital bank e-statement with pockets: English header lines, cents, moves between pockets left out, balance adds up', async () => {
  const { src, read } = await readPdf(bankPocketsPdf());
  assert.deepEqual(src.table.find(r => r.length > 1), ['Tanggal & Waktu', 'Detail Transaksi', 'Tipe Transaksi', 'Jumlah']);
  assert.equal(src.meta.owner, 'Budi Santoso');
  assert.deepEqual([src.meta.opening, src.meta.closing, src.meta.totalIn, src.meta.totalOut], [1000000, 825512.08, 111012.34, 285500.26]);
  assert.deepEqual(read.rows.map(r => [r.date, r.amount, r.type]), [['2026-10-01', 61000, 'income'], ['2026-10-15', 200000, 'expense'], ['2026-10-20', 35500, 'expense'], ['2026-10-31', 12, 'income']]);
  assert.equal(read.internal, 2, 'both sides of the move between pockets');
  assert.equal(read.skipped, 1, 'tax of a few cents rounds to nothing');
  assert.equal(read.balance.complete, true);
  assert.deepEqual([read.balance.opening, read.balance.closing, read.balance.closingDate], [1000000, 825512, '2026-10-31']);
  assert.match(read.rows[0].description, /^Dompet Anak Bangsa · Cimb Niaga \| 84573F1234 · GoPay Bank Transfer/);
  assert.ok(!read.rows.some(r => r.date === '2026-05-10'), '"10.05 WIB" is a time, not 10 May');
});

test('8.7 a digital bank e-statement: the e-wallet company and your own name are moves to those wallets', async () => {
  const { read } = await readPdf(bankPocketsPdf());
  const wallets = [{ id: 'krom', name: 'Krom', type: 'bank' }, { id: 'gopay', name: 'GoPay', type: 'ewallet' }, { id: 'mandiri', name: 'Mandiri', type: 'bank' }];
  const plan = planImport(read, { walletId: 'krom', wallets, categories: [], transactions: [], drafts: [] });
  assert.deepEqual(plan.map(x => [x.name, x.flow, x.walletId, x.destinationWalletId]), [
    ['Transfer dari GoPay', 'transfer', 'gopay', 'krom'],
    ['Transfer ke Mandiri', 'transfer', 'krom', 'mandiri'],
    ['Toko Sinar Jaya', 'expense', 'krom', null],
    ['Bunga tabungan', 'income', 'krom', null],
  ]);
  // Without a GoPay wallet in the app, money from the e-wallet company stays money in.
  const noGopay = planImport(read, { walletId: 'krom', wallets: wallets.filter(w => w.id !== 'gopay'), categories: [], transactions: [], drafts: [] });
  assert.equal(noGopay[0].flow, 'income');
  // A move into this wallet already recorded from the other side is found.
  const recorded = planImport(read, { walletId: 'krom', wallets, categories: [], transactions: [{ type: 'transfer', amount: 61000, date: '2026-10-01', walletId: 'gopay', destinationWalletId: 'krom', description: 'Tarik ke Krom' }], drafts: [] });
  assert.equal(recorded[0].already, 'recorded');
});

test('8.7 a classic bank e-statement PDF: DB marks, wrapped lines, period year, totals and balances at the bottom', async () => {
  const { src, read } = await readPdf(makePdf(classicBankPages()));
  assert.deepEqual([src.meta.opening, src.meta.closing, src.meta.totalIn, src.meta.totalOut], [1000000, 5950000, 5000000, 50000]);
  assert.deepEqual(read.rows.map(r => [r.date, r.amount, r.type, r.balance]), [['2026-10-02', 50000, 'expense', 950000], ['2026-10-05', 5000000, 'income', 5950000]]);
  assert.equal(read.balance.complete, true);
  const plan = planImport(read, { walletId: 'bca', wallets: [{ id: 'bca', name: 'BCA', type: 'bank' }], categories: [], transactions: [], drafts: [] });
  assert.equal(plan[0].name, 'Sari Wulandari');
  assert.match(plan[1].name, /^Gaji Oktober/);
});

test('8.7 a PDF locked with a password: asked for, a wrong one said so, the right one opens it', async () => {
  const locked = makePdf(classicBankPages(), { password: '151290' });
  await assert.rejects(readStatementSource(locked), e => e.name === 'PdfPasswordError' && e.wrong === false);
  await assert.rejects(readStatementSource(locked, { password: '000000' }), e => e.name === 'PdfPasswordError' && e.wrong === true && /salah/.test(e.message));
  const { read } = await readPdf(locked, '151290');
  assert.equal(read.rows.length, 2);
  assert.equal(read.balance.complete, true);
  // The file kept by the screen is not consumed by a failed try.
  assert.equal(locked[0], 0x25);
});

test('8.7 a scan, a broken PDF and a PDF without a statement table are refused with what to do', async () => {
  await assert.rejects(readStatementSource(makePdf([[]])), /gambar \(hasil scan\)/);
  await assert.rejects(readStatementSource(new TextEncoder().encode('%PDF-1.7 rusak')), /tidak bisa dibuka/);
  await assert.rejects(readStatementSource(makePdf([[T(40, 60, 'Bukti Transfer'), T(40, 80, 'Nominal Rp50.000')]])), /Tabel mutasi tidak ditemukan/);
  // CSV and Excel still go the old way.
  const csv = await readStatementSource(new TextEncoder().encode('Tanggal,Keterangan,Jumlah\n01/10/2026,Kopi,-25000\n'));
  assert.equal(csv.kind, 'sheet');
  await assert.rejects(readStatementFile(new TextEncoder().encode('%PDF-1.7 ...')), /PDF/);
});

// 8.7 — rows that may have been recorded before, transfers with a person, and editing before saving.
import { finalize, missing, txTypeOf, suggestFor, fromDraft } from '../lib/import/edit.ts';

const csvRead = async (text) => readStatement((await readStatementSource(new TextEncoder().encode(text))).table, today);
const W = [{ id: 'bca', name: 'BCA', type: 'bank' }, { id: 'gopay', name: 'GoPay', type: 'ewallet' }, { id: 'cash', name: 'Tunai', type: 'cash' }];

test('8.7 possible doubles: same amount in another wallet, a few days apart, or a fee apart at the same place', async () => {
  const read = await csvRead(`Tanggal;Keterangan;Debit;Kredit
05/10/2026;QRIS KOPI KENANGAN SENOPATI;26.700,00;
08/10/2026;INDOMARET CIPUTAT;87.350,00;
12/10/2026;PARKIR MALL;50.000,00;
20/10/2026;GRAB FOOD;45.000,00;
25/10/2026;TOKO BUKU GRAMEDIA;150.000,00;
`);
  const transactions = [
    { id: 't1', type: 'expense', amount: 25000, date: '2026-10-05', walletId: 'gopay', destinationWalletId: null, description: 'Kopi Kenangan', merchant: '', categoryId: 'c' },
    { id: 't2', type: 'expense', amount: 87350, date: '2026-10-06', walletId: 'cash', destinationWalletId: null, description: 'Belanja bulanan', merchant: '', categoryId: 'c' },
    { id: 't3', type: 'expense', amount: 50000, date: '2026-10-10', walletId: 'cash', destinationWalletId: null, description: 'Bensin', merchant: '', categoryId: 'c' },
    { id: 't4', type: 'expense', amount: 45000, date: '2026-10-22', walletId: 'bca', destinationWalletId: null, description: 'Makan siang', merchant: '', categoryId: 'c' },
    { id: 't5', type: 'income', amount: 150000, date: '2026-10-25', walletId: 'cash', destinationWalletId: null, description: 'Gramedia', merchant: '', categoryId: 'c' },
  ];
  const plan = planImport(read, { walletId: 'bca', wallets: W, categories: [], transactions, drafts: [] });
  const by = Object.fromEntries(plan.map(x => [x.description.split(' ').slice(0, 2).join(' '), x]));
  // A fee apart at the same place (Kopi Kenangan 25.000 vs 26.700 in GoPay).
  assert.deepEqual([by['QRIS KOPI'].maybe?.why, by['QRIS KOPI'].maybe?.amount], ['wallet', 25000]);
  // The same unusual amount two days earlier in another wallet, even with another name.
  assert.equal(by['INDOMARET CIPUTAT'].maybe?.why, 'wallet');
  // A round amount in another wallet with nothing else alike is not flagged.
  assert.equal(by['PARKIR MALL'].maybe, undefined);
  // The same amount in this wallet two days later.
  assert.equal(by['GRAB FOOD'].maybe?.why, 'date');
  // Money in is never matched with money out.
  assert.equal(by['TOKO BUKU'].maybe, undefined);
});

test('8.7 an earlier import still waiting (CSV before, PDF now) counts as already imported', async () => {
  const read = await csvRead('Tanggal;Keterangan;Debit;Kredit\n05/10/2026;TRSF E-BANKING DB SARI WULANDARI;50.000,00;\n06/10/2026;KOPI;20.000,00;\n');
  const drafts = [{ id: 'imp_other_file_1', status: 'pending', source: 'import', amount: 50000, walletId: 'bca', destinationWalletId: null, plannedDate: '2026-10-05' }];
  const plan = planImport(read, { walletId: 'bca', wallets: W, categories: [], transactions: [], drafts });
  assert.deepEqual(plan.map(x => x.already), ['imported', undefined]);
});

test('8.7 a transfer with a person is asked what it was for; shops and own accounts are not', async () => {
  const read = await csvRead(`Tanggal;Keterangan;Debit;Kredit
05/10/2026;TRSF E-BANKING DB 0510/FTSCY SARI WULANDARI;50.000,00;
06/10/2026;TRSF E-BANKING CR 0610/FTSCY ANDI PRATAMA;;200.000,00
07/10/2026;TRSF E-BANKING DB TOKO SINAR JAYA;35.000,00;
08/10/2026;TRSF E-BANKING DB BUDI SANTOSO;100.000,00;
09/10/2026;QRIS KOPI KENANGAN;25.000,00;
`);
  const plan = planImport(read, { walletId: 'bca', wallets: W, categories: [], transactions: [], drafts: [], owners: ['Budi Santoso'] });
  assert.deepEqual(plan.map(x => x.person || null), ['Sari Wulandari', 'Andi Pratama', null, null, null]);
  assert.equal(plan[3].flow, 'transfer', 'to your own name: a move, not a person');
  const sari = finalize(plan[0], {}, 'bca');
  assert.equal(sari.purpose, null);
  assert.equal(missing(sari), 'Pilih untuk apa');
});

test('8.7 editing a row: purpose, category, wallet, debt or receivable, person; what is still missing', async () => {
  const read = await csvRead('Tanggal;Keterangan;Debit;Kredit\n05/10/2026;TRSF E-BANKING DB SARI WULANDARI;50.000,00;\n06/10/2026;TRSF E-BANKING CR ANDI PRATAMA;;200.000,00\n');
  const [sari, andi] = planImport(read, { walletId: 'bca', wallets: W, categories: [], transactions: [], drafts: [] });
  const lend = finalize(sari, { purpose: 'receivable_issue' }, 'bca');
  assert.deepEqual([missing(lend), txTypeOf(lend), lend.person, lend.walletId], [null, 'expense', 'Sari Wulandari', 'bca']);
  assert.equal(missing(finalize(sari, { purpose: 'receivable_issue', person: ' ' }, 'bca')), 'Isi nama orangnya');
  assert.equal(missing(finalize(sari, { purpose: 'expense' }, 'bca')), 'Pilih kategori');
  assert.equal(missing(finalize(sari, { purpose: 'expense', categoryId: 'food', name: 'Patungan makan', amount: 45000, date: '2026-10-04' }, 'bca')), null);
  const paid = finalize(sari, { purpose: 'debt_payment' }, 'bca');
  assert.equal(missing(paid), 'Pilih utangnya');
  assert.deepEqual([txTypeOf(finalize(sari, { purpose: 'debt_payment', debtId: 'd1' }, 'bca')), finalize(sari, { purpose: 'debt_payment', debtId: 'd1' }, 'bca').debtId], ['debt_payment', 'd1']);
  const move = finalize(sari, { purpose: 'transfer' }, 'bca');
  assert.equal(missing(move), 'Pilih dompet tujuan');
  assert.deepEqual([finalize(sari, { purpose: 'transfer', otherWalletId: 'gopay' }, 'bca').destinationWalletId, missing(finalize(sari, { purpose: 'transfer', otherWalletId: 'gopay' }, 'bca'))], ['gopay', null]);
  const back = finalize(andi, { purpose: 'transfer', otherWalletId: 'gopay' }, 'bca');
  assert.deepEqual([back.walletId, back.destinationWalletId, txTypeOf(back)], ['gopay', 'bca', 'transfer']);
  assert.deepEqual([txTypeOf(finalize(andi, { purpose: 'borrowing' }, 'bca')), txTypeOf(finalize(andi, { purpose: 'receivable_payment', receivableId: 'r1' }, 'bca'))], ['income', 'receivable_payment']);
  // An open debt or receivable with that person is suggested (the person still taps).
  const debts = [{ id: 'd1', name: 'Utang ke Sari', provider: 'Sari', status: 'open', outstandingAmount: 100000 }], receivables = [{ id: 'r1', person: 'Andi', status: 'partial', remainingAmount: 50000 }];
  assert.deepEqual(suggestFor('Sari Wulandari', 'out', debts, receivables), { debtId: 'd1', purpose: 'debt_payment' });
  assert.deepEqual(suggestFor('Andi Pratama', 'in', debts, receivables), { receivableId: 'r1', purpose: 'receivable_payment' });
  assert.deepEqual(suggestFor('Andi Pratama', 'out', debts, receivables), {});
});

test('8.7 a possible double is never recorded now unless the person says it is not one; drafts keep what was chosen', async () => {
  const read = await csvRead('Tanggal;Keterangan;Debit;Kredit\n05/10/2026;QRIS KOPI KENANGAN SENOPATI;26.700,00;\n');
  const [kopi] = planImport(read, { walletId: 'bca', wallets: W, categories: [], transactions: [{ type: 'expense', amount: 25000, date: '2026-10-05', walletId: 'gopay', destinationWalletId: null, description: 'Kopi Kenangan', merchant: '', categoryId: 'c' }], drafts: [] });
  assert.equal(missing(finalize(kopi, { categoryId: 'coffee' }, 'bca')), 'Mungkin dobel');
  assert.equal(missing(finalize(kopi, { categoryId: 'coffee', notDouble: true }, 'bca')), null);
  // A waiting draft back as a row: a transfer with a person still to decide, a new loan, a 8.6 draft.
  assert.equal(missing(fromDraft({ id: 'a', type: 'expense', amount: 50000, plannedDate: '2026-10-05', walletId: 'bca', destinationWalletId: null, categoryId: null, name: 'Sari', person: 'Sari', status: 'pending', recurringId: '' })), 'Pilih untuk apa');
  assert.equal(missing(fromDraft({ id: 'b', type: 'expense', amount: 50000, plannedDate: '2026-10-05', walletId: 'bca', destinationWalletId: null, categoryId: null, name: 'Sari', person: 'Sari', purpose: 'receivable_issue', status: 'pending', recurringId: '' })), null);
  assert.equal(missing(fromDraft({ id: 'c', type: 'expense', amount: 5000, plannedDate: '2026-10-05', walletId: 'bca', destinationWalletId: null, categoryId: 'park', name: 'Parkir', status: 'pending', recurringId: '' })), null);
  assert.equal(missing(fromDraft({ id: 'd', type: 'expense', amount: 5000, plannedDate: '2026-10-05', walletId: 'bca', destinationWalletId: null, categoryId: 'park', name: 'Parkir', maybeDuplicate: 'Parkir · Rp5.000', status: 'pending', recurringId: '' })), 'Mungkin dobel');
});

// 8.7 — more bank layouts (made up from common shapes; real samples of these banks were not available).
import { nominalSignedPdf, debitCreditPdf, postingDatePdf, sourceDestPdf } from './helpers/statement-pdfs.mjs';

test('8.7 other bank layouts: signed Nominal, Debet/Kredit with 0.00, two date columns with D/K, Sumber/Tujuan', async () => {
  const cases = [
    [nominalSignedPdf(), [['2026-10-01', 50000, 'expense'], ['2026-10-05', 35500, 'expense'], ['2026-10-25', 1000000, 'income']], [2000000, 2914500, 1000000, 85500]],
    [debitCreditPdf(), [['2026-10-02', 50000, 'expense'], ['2026-10-03', 27300, 'expense'], ['2026-10-25', 4000000, 'income']], [1000000, 4922700, 4000000, 77300]],
    [postingDatePdf(), [['2026-10-01', 50000, 'expense'], ['2026-10-10', 25000, 'expense'], ['2026-10-28', 100000, 'income']], [500000, 525000, 100000, 75000]],
    [sourceDestPdf(), [['2026-10-02', 50000, 'expense'], ['2026-10-09', 32000, 'expense'], ['2026-10-20', 75000, 'income']], null],
  ];
  for (const [bytes, rows, totals] of cases) {
    const { src, read } = await readPdf(bytes);
    assert.deepEqual(read.rows.map(r => [r.date, r.amount, r.type]), rows, JSON.stringify(src.table[0]));
    if (totals) assert.deepEqual([src.meta.opening, src.meta.closing, src.meta.totalIn, src.meta.totalOut], totals, JSON.stringify(src.meta));
    assert.notEqual(read.balance?.complete, false, 'the figures add up');
    assert.ok(read.rows.every(r => r.description && !/\d{2}:\d{2}/.test(r.description)), 'no time or empty description');
  }
  // A transfer to someone is read as a person to ask about, in every layout.
  for (const bytes of [nominalSignedPdf(), debitCreditPdf(), postingDatePdf(), sourceDestPdf()]) {
    const { read } = await readPdf(bytes);
    const plan = planImport(read, { walletId: 'bank', wallets: [{ id: 'bank', name: 'Bank', type: 'bank' }], categories: [], transactions: [], drafts: [] });
    assert.ok(plan.some(x => x.person === 'Sari Wulandari'), JSON.stringify(plan.map(x => [x.name, x.person])));
  }
});

// 8.8 — layouts the PDF reader learned in 8.8 (made up).
import { dayGroupedPdf, unsignedBalancePdf, wrappedHeaderPdf } from './helpers/statement-pdfs.mjs';

test('8.8 an e-wallet history grouped by day, with no table header: each time row gets its day', async () => {
  const { read } = await readPdf(dayGroupedPdf());
  assert.deepEqual(read.rows.map(r => [r.date, r.amount, r.type]), [['2026-10-05', 25000, 'expense'], ['2026-10-05', 100000, 'income'], ['2026-10-07', 15500, 'expense'], ['2026-10-07', 50000, 'expense']]);
  assert.equal(read.rows[0].description, 'Kopi Kenangan Senopati · Pembayaran');
});

test('8.8 amounts without a sign: the running balance says money in or out', async () => {
  const { read } = await readPdf(unsignedBalancePdf());
  assert.deepEqual(read.rows.map(r => [r.date, r.amount, r.type]), [['2026-10-02', 25000, 'expense'], ['2026-10-05', 200000, 'income'], ['2026-10-09', 15500, 'expense']]);
  assert.equal(read.unsure, 0);
  assert.equal(read.balance.complete, true);
});

test('8.8 a header wrapped onto two lines ("Uang" / "Masuk") is read as one', async () => {
  const { src, read } = await readPdf(wrappedHeaderPdf());
  assert.deepEqual(src.table.find(r => r.length > 1), ['Tanggal', 'Keterangan', 'Uang Keluar', 'Uang Masuk', 'Saldo']);
  assert.deepEqual(read.rows.map(r => [r.date, r.amount, r.type]), [['2026-10-03', 5000000, 'income'], ['2026-10-04', 250000, 'expense']]);
});
