import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'node:zlib';
import { parseAmount, parseDate, readStatement, readStatementFile, planImport, nameFor } from '../lib/import/statement.ts';

// 8.5 — bank and e-wallet statements (CSV / Excel) read on the device into suggestions for Perlu dikonfirmasi.
// The files below are made up in the shapes banks export (no real account data).
const today = '2026-11-07';
const enc = s => new TextEncoder().encode(s);
const read = async (text) => readStatement(await readStatementFile(enc(text)), today);

test('8.5 amounts as banks write them', () => {
  const cases = [['50,000.00', 50000, 0], ['1.250.000,00', 1250000, 0], ['-25.000', 25000, -1], ['(10.000)', 10000, -1], ['50,000.00 DB', 50000, -1], ['1,500,000.00 CR', 1500000, 1], ['Rp 15.500', 15500, 0], ['+200000', 200000, 1], ['12.5', 12, 0], ['IDR 3,000', 3000, 0], ['75000', 75000, 0], ['1.000', 1000, 0], ['2,5', 2, 0]];
  for (const [raw, value, sign] of cases) { const a = parseAmount(raw); assert.ok(a, raw); assert.equal(a.value, value, raw); assert.equal(a.sign, sign, raw); }
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
});

test('8.5 dates as banks write them', () => {
  const o = { today };
  assert.equal(parseDate('01/10/2026', o), '2026-10-01');
  assert.equal(parseDate("'05/10", o), '2026-10-05');
  assert.equal(parseDate('05/12', o), '2025-12-05');
  assert.equal(parseDate('05/12', { ...o, year: 2026 }), '2026-12-05');
  assert.equal(parseDate('2026-10-03 14:22:10', o), '2026-10-03');
  assert.equal(parseDate('3 Okt 2026', o), '2026-10-03');
  assert.equal(parseDate('03-Oct-26', o), '2026-10-03');
  assert.equal(parseDate('Oct 3, 2026', o), '2026-10-03');
  assert.equal(parseDate('10/03/2026', { ...o, order: 'mdy' }), '2026-10-03');
  assert.equal(parseDate('PEND', o), null);
  assert.equal(parseDate('31/02/2026', o), null);
});

test('8.5 BCA-style CSV: period above, DB/CR column after Jumlah, PEND rows left out', async () => {
  const r = await read(`Informasi Rekening - Mutasi Rekening
No. rekening : 1234567890
Nama : CONTOH
Periode : 01/10/2026 - 31/10/2026
Kode Mata Uang : IDR

Tanggal Transaksi,Keterangan,Cabang,Jumlah,,Saldo
'01/10,TRSF E-BANKING DB 0110/FTSCY/WS95051 50000.00 SARI WULANDARI,0000,"50,000.00",DB,"2,450,000.00"
'02/10,KARTU DEBIT INDOMARET CIPUTAT,0000,"23,500.00",DB,"2,426,500.00"
'03/10,TARIKAN ATM 03/10,0000,"500,000.00",DB,"1,926,500.00"
'25/10,TRSF E-BANKING CR 2510/FTSCY/WS95051 GAJI PT CONTOH ABADI,0000,"8,000,000.00",CR,"9,926,500.00"
'31/10,BIAYA ADM,0000,"15,000.00",DB,"9,911,500.00"
PEND,TRSF E-BANKING DB SHOPEE,0000,"99,000.00",DB,
Saldo Awal,,,"2,500,000.00"
Mutasi Debet,,,"588,500.00"
`);
  assert.equal(r.rows.length, 5);
  assert.deepEqual(r.rows.map(x => [x.date, x.amount, x.type]), [['2026-10-01', 50000, 'expense'], ['2026-10-02', 23500, 'expense'], ['2026-10-03', 500000, 'expense'], ['2026-10-25', 8000000, 'income'], ['2026-10-31', 15000, 'expense']]);
  assert.equal(r.unsure, 0);
  assert.equal(r.columns.kind, 'DB/CR');
  assert.equal(nameFor(r.rows[0].description), 'Sari Wulandari');
  assert.equal(nameFor(r.rows[1].description), 'Indomaret Ciputat');
  assert.equal(nameFor(r.rows[2].description), 'Tarik tunai');
  assert.equal(nameFor(r.rows[4].description), 'Biaya admin bank');
});

test('8.5 BRI / Mandiri / BNI style: debit and credit columns, semicolons, comma decimals', async () => {
  const bri = await read(`Tanggal,Uraian Transaksi,Teller,Debet,Kredit,Saldo
02/10/26,ESB:INTRABANK TRANSFER ke BUDI,8888,"150.000,00","0,00","1.850.000,00"
04/10/26,BUNGA,8888,"0,00","1.245,00","1.851.245,00"
`);
  assert.deepEqual(bri.rows.map(x => [x.date, x.amount, x.type]), [['2026-10-02', 150000, 'expense'], ['2026-10-04', 1245, 'income']]);
  assert.equal(nameFor(bri.rows[1].description), 'Bunga tabungan');
  const mandiri = await read(`Tanggal;Keterangan;Debit;Kredit;Saldo
05/10/2026;QRIS PAYMENT KOPI KENANGAN SENOPATI;35.000,00;;1.000.000,00
06/10/2026;TOP UP GOPAY 0812xxxx;100.000,00;;900.000,00
`);
  assert.deepEqual(mandiri.rows.map(x => [x.amount, x.type]), [[35000, 'expense'], [100000, 'expense']]);
  assert.equal(nameFor(mandiri.rows[0].description), 'Kopi Kenangan Senopati');
  assert.equal(nameFor(mandiri.rows[1].description), 'Top up GoPay');
  const bni = await read(`Post Date,Value Date,Branch,Journal No.,Description,Debit,Credit
07/10/2026 10:12:01,07/10/2026,0123,445566,TRANSFER KE 0091 TOKOPEDIA,"120,000.00",
08/10/2026 08:01:55,08/10/2026,0123,445567,TRANSFER DARI ANDI,,"200,000.00"
`);
  assert.deepEqual(bni.rows.map(x => [x.date, x.amount, x.type]), [['2026-10-07', 120000, 'expense'], ['2026-10-08', 200000, 'income']]);
});

test('8.5 digital bank / e-wallet style: one signed amount column, English headers, month first', async () => {
  const jago = await read(`Date & Time,Source/Destination,Transaction Details,Notes,Amount,Balance
2026-10-09 12:30,Warung Padang Sederhana,QRIS Payment,,-45.000,955.000
2026-10-10 09:00,Andi Pratama,Incoming Transfer,patungan,+150.000,1.105.000
`);
  assert.deepEqual(jago.rows.map(x => [x.date, x.amount, x.type]), [['2026-10-09', 45000, 'expense'], ['2026-10-10', 150000, 'income']]);
  assert.match(nameFor(jago.rows[0].description), /^Warung Padang Sederhana/);
  const kind = await read(`Tanggal,Deskripsi,Tipe,Nominal
11 Okt 2026,Bayar PLN token,Uang Keluar,"Rp52.500"
12 Okt 2026,Cashback,Uang Masuk,"Rp2.500"
`);
  assert.deepEqual(kind.rows.map(x => [x.date, x.amount, x.type]), [['2026-10-11', 52500, 'expense'], ['2026-10-12', 2500, 'income']]);
  const us = await read(`Date,Description,Amount
10/13/2026,Coffee shop,-3.50
10/14/2026,Refund,12.00
`);
  assert.deepEqual(us.rows.map(x => x.date), ['2026-10-13', '2026-10-14']);
  // No sign anywhere: read as spending and counted as "to check".
  const plain = await read(`Tanggal,Keterangan,Jumlah
15/10/2026,Belanja bulanan,250000
`);
  assert.equal(plain.rows[0].type, 'expense');
  assert.equal(plain.unsure, 1);
});

test('8.5 a file without a header row: columns found by what is in them', async () => {
  const r = await read(`16/10/2026,MAKAN SIANG BAKSO,25000,975000
17/10/2026,PARKIR MALL,5000,970000
18/10/2026,GOJEK,18000,952000
`);
  assert.deepEqual(r.rows.map(x => [x.date, x.amount]), [['2026-10-16', 25000], ['2026-10-17', 5000], ['2026-10-18', 18000]]);
});

// A minimal .xlsx (shared strings, a number cell, a date cell with a date style), zipped here with deflate.
function zip(files) {
  const parts = [], central = []; let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text), packed = deflateRawSync(data), nameBuf = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, packed);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, end]));
}

test('8.5 Excel (.xlsx): shared strings, numbers and date cells', async () => {
  const sst = ['Tanggal', 'Keterangan', 'Debit', 'Kredit', 'Saldo', 'GRAB FOOD &amp; MART', 'Gaji Oktober'];
  const file = zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="Mutasi" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<sst>${sst.map(s => `<si><t>${s}</t></si>`).join('')}</sst>`,
    'xl/styles.xml': '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row>
      <row r="2"><c r="A2" s="1"><v>46296</v></c><c r="B2" t="s"><v>5</v></c><c r="C2"><v>64000</v></c><c r="E2"><v>936000</v></c></row>
      <row r="3"><c r="A3" s="1"><v>46321</v></c><c r="B3" t="s"><v>6</v></c><c r="D3"><v>8000000</v></c><c r="E3"><v>8936000</v></c></row>
      <row r="4"><c r="A4" t="inlineStr"><is><t>27/10/2026</t></is></c><c r="B4" t="inlineStr"><is><t>Parkir</t></is></c><c r="C4"><v>5000</v></c></row>
    </sheetData></worksheet>`,
  });
  const r = readStatement(await readStatementFile(file), today);
  assert.deepEqual(r.rows.map(x => [x.date, x.description, x.amount, x.type]), [['2026-10-01', 'GRAB FOOD & MART', 64000, 'expense'], ['2026-10-26', 'Gaji Oktober', 8000000, 'income'], ['2026-10-27', 'Parkir', 5000, 'expense']]);
});

test('8.5 old .xls and PDF are refused with what to do', async () => {
  await assert.rejects(readStatementFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0])), /\.xlsx atau \.csv/);
  await assert.rejects(readStatementFile(enc('%PDF-1.7 ...')), /CSV atau Excel/);
});

test('8.5 the plan: categories guessed, transfers to own wallets, already recorded and already imported found', async () => {
  const r = await read(`Tanggal;Keterangan;Debit;Kredit
05/10/2026;QRIS PAYMENT KOPI KENANGAN SENOPATI;35.000,00;
06/10/2026;TOP UP GOPAY 0812xxxx;100.000,00;
07/10/2026;TARIKAN ATM;300.000,00;
07/10/2026;QRIS PAYMENT KOPI KENANGAN SENOPATI;35.000,00;
08/10/2026;GAJI PT CONTOH;;8.000.000,00
`);
  const categories = [
    { id: 'food', name: 'Makan & Minum', type: 'expense', parentId: null, icon: '🍜' },
    { id: 'coffee', name: 'Kopi', type: 'expense', parentId: 'food', icon: '☕' },
    { id: 'salary', name: 'Gaji', type: 'income', parentId: null, icon: '💼' },
  ];
  const wallets = [{ id: 'bca', name: 'BCA', type: 'bank', isArchived: false }, { id: 'gopay', name: 'GoPay', type: 'ewallet', isArchived: false }, { id: 'cash', name: 'Tunai', type: 'cash', isArchived: false }];
  const transactions = [{ type: 'expense', amount: 35000, date: '2026-10-08', walletId: 'bca', destinationWalletId: null, description: 'kopi', merchant: '', categoryId: 'food', subcategoryId: 'coffee' }];
  const first = planImport(r, { walletId: 'bca', wallets, categories, transactions, drafts: [] });
  assert.equal(first.length, 5);
  assert.equal(first[0].subcategoryId || first[0].categoryId, 'coffee');
  assert.equal(first[1].flow, 'transfer'); assert.equal(first[1].destinationWalletId, 'gopay');
  assert.equal(first[2].flow, 'transfer'); assert.equal(first[2].destinationWalletId, 'cash');
  assert.equal(first[0].already, undefined);
  assert.equal(first[3].already, 'recorded'); // a day off, same amount, same wallet
  assert.equal(first[4].categoryId, 'salary');
  // The same coffee twice in the file keeps two rows with different ids; importing again finds them.
  assert.notEqual(first[0].id, first[3].id);
  const again = planImport(r, { walletId: 'bca', wallets, categories, transactions: [], drafts: first.map(x => ({ id: x.id })) });
  assert.ok(again.every(x => x.already === 'imported'));
  assert.ok(first.every(x => /^imp_[\w-]+$/.test(x.id) && x.id.length <= 140));
});

// 8.5 2c — "Hari ini belum ada catatan": at the chosen time, only on a day with nothing recorded by the person.
import { dueReminders, lastRecordDate, quietReminder, defaultReminders } from '../lib/reminders.ts';
test('8.5 the daily "nothing recorded yet" reminder', () => {
  const config = { ...defaultReminders, quietEnabled: true, quietTime: '20:30' };
  assert.deepEqual(dueReminders(config, '20:00', []).fire, []);
  const due = dueReminders(config, '20:31', []);
  assert.deepEqual(due.fire, ['quiet']); assert.deepEqual(due.consumed, ['quiet@20:30']);
  assert.deepEqual(dueReminders(config, '20:45', ['quiet@20:30']).fire, []);
  // Opened long after the time: marked as done without a reminder.
  const late = dueReminders(config, '23:59', []);
  assert.deepEqual(late.fire, []); assert.deepEqual(late.consumed, ['quiet@20:30']);
  assert.deepEqual(dueReminders({ ...config, quietEnabled: false }, '20:31', []).fire, []);
  // Interest and schedules recorded by themselves are not the person's records.
  const txs = [{ id: 'a', date: '2026-11-05' }, { id: 'wint_bca_2026-11-07', date: '2026-11-07' }, { id: 'r', date: '2026-11-07', recurringTransactionId: 'netflix' }];
  assert.equal(lastRecordDate(txs), '2026-11-05');
  assert.equal(quietReminder('2026-11-07', '2026-11-07'), null);
  assert.match(quietReminder('2026-11-06', '2026-11-07').title, /^Hari ini belum ada catatan/);
  assert.match(quietReminder('2026-11-05', '2026-11-07').title, /^Sudah 2 hari belum ada catatan/);
  assert.match(quietReminder('', '2026-11-07').title, /^Hari ini/);
});

// ——— 8.6 Matching the bank's balance ———
import { reconcile } from '../lib/import/statement.ts';
const bcaFile = `Periode : 01/10/2026 - 31/10/2026

Tanggal Transaksi,Keterangan,Cabang,Jumlah,,Saldo
'01/10,TRSF E-BANKING DB SARI,0000,"50,000.00",DB,"2,450,000.00"
'02/10,KARTU DEBIT INDOMARET,0000,"23,500.00",DB,"2,426,500.00"
'25/10,TRSF E-BANKING CR GAJI,0000,"8,000,000.00",CR,"10,426,500.00"
'31/10,BIAYA ADM,0000,"15,000.00",DB,"10,411,500.00"
Saldo Awal,,,"2,500,000.00"
Saldo Akhir,,,"10,411,500.00"
`;
test('8.6 the bank balances are read, and the rows add up from opening to closing', async () => {
  const r = await read(bcaFile);
  assert.deepEqual(r.balance, { opening: 2_500_000, closing: 10_411_500, closingDate: '2026-10-31', complete: true });
  // A row the reader could not read: the sums no longer meet, which is said.
  const broken = await read(bcaFile.replace(`'02/10,KARTU DEBIT INDOMARET,0000,"23,500.00",DB,"2,426,500.00"`, `'02/10,KARTU DEBIT INDOMARET,0000,"dua puluh ribu",DB,"2,426,500.00"`));
  assert.equal(broken.balance.complete, false);
  // Newest first, balance column only (no Saldo Awal line): opening worked out from the earliest row.
  const desc = await read(`Tanggal;Keterangan;Debit;Kredit;Saldo
31/10/2026;BIAYA ADM;15.000,00;;985.000,00
10/10/2026;GAJI;;500.000,00;1.000.000,00
05/10/2026;KOPI;20.000,00;;500.000,00
`);
  assert.deepEqual(desc.balance, { opening: 520_000, closing: 985_000, closingDate: '2026-10-31', complete: true });
  // No balance anywhere: nothing to match.
  const none = await read(`Tanggal,Keterangan,Jumlah
15/10/2026,Belanja,-250000
`);
  assert.equal(none.balance, undefined);
});
test('8.6 the wallet against the bank: recorded up to the last day, plus the new rows', async () => {
  const r = await read(bcaFile);
  const wallets = [{ id: 'bca', name: 'BCA', type: 'bank', isArchived: false }];
  const history = [
    { id: 'a', type: 'expense', amount: 50_000, date: '2026-10-01', walletId: 'bca', destinationWalletId: null, description: 'sari', merchant: '', categoryId: null, subcategoryId: null },
    { id: 'z', type: 'expense', amount: 99_000, date: '2026-11-03', walletId: 'bca', destinationWalletId: null, description: 'later', merchant: '', categoryId: null, subcategoryId: null },
  ];
  const items = planImport(r, { walletId: 'bca', wallets, categories: [], transactions: history, drafts: [] });
  const chosen = items.filter(x => !x.already);
  assert.equal(chosen.length, 3, 'the 50.000 on 1 Oktober is already recorded');
  const m = reconcile(r, chosen, { id: 'bca', cachedBalance: 2_351_000 }, history);
  assert.equal(m.bank, 10_411_500);
  assert.equal(m.app, 2_450_000, 'the balance now (2.351.000) with the 99.000 of 3 November given back');
  assert.equal(m.pending, 8_000_000 - 23_500 - 15_000);
  assert.equal(m.diff, 0);
  // A wallet that started at a different balance in the app: the difference is said.
  assert.equal(reconcile(r, chosen, { id: 'bca', cachedBalance: 2_306_000 }, history).diff, 45_000);
});
