import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkReceipt, readReceiptText } from '../lib/receipt.ts';
import { buildReceiptSnapshot, receiptMoneyRows, receiptStartsOpen } from '../lib/receipt-snapshot.ts';

/** The snapshot the scan screen saves, from a reading confirmed as it is. */
function snap(text, changes = {}) {
  const read = readReceiptText(text), included = checkReceipt(read).included;
  const counted = Object.fromEntries(['discount', 'tax', 'service', 'delivery', 'fee', 'rounding'].map(k => [k, !included.includes(k)]));
  return buildReceiptSnapshot({ read, merchant: read.merchant, date: read.date, time: read.time, payment: read.payment, total: checkReceipt(read).total, items: read.items.map(i => ({ name: i.name, qty: i.qty, price: i.price, discount: i.discount })), subtotal: read.subtotal, charges: { discount: read.discount, tax: read.tax, service: read.service, delivery: read.delivery, fee: read.fee || 0, rounding: read.rounding }, counted, reconciled: true, ...changes });
}

test('a scanned receipt keeps its structure: items, item discounts, charges, payment, number, total', () => {
  const r = snap('HOKBEN\nNo. Struk INV-12345\n27/09/2026 12:10\nNASI GORENG 2 x 25.000 50.000\nES TEH 10.000\nAYAM GEPREK 35.000\nDISC AYAM -5.000\nSUBTOTAL 90.000\nVOUCHER 10.000\nSERVICE 5.000\nPB1 10% 9.000\nTOTAL 89.000\nQRIS 89.000');
  assert.equal(r.merchant.toUpperCase(), 'HOKBEN'); assert.equal(r.receiptNo, 'INV-12345'); assert.equal(r.payment, 'QRIS'); assert.equal(r.total, 89_000);
  assert.deepEqual(r.items.map(i => [i.name, i.qty, i.price, i.discount || 0, i.total]), [['NASI GORENG', 2, 25_000, 0, 50_000], ['ES TEH', 1, 10_000, 0, 10_000], ['AYAM GEPREK', 1, 35_000, 5_000, 30_000]]);
  assert.ok(r.charges.some(c => c.type === 'voucher' && c.amount === -10_000));
  assert.ok(r.charges.some(c => c.type === 'tax' && c.label === 'PB1' && c.amount === 9_000));
  assert.ok(r.charges.some(c => c.type === 'service' && c.amount === 5_000));
  assert.equal(r.reconciled, true);
});

test('only what the receipt had is kept, and nothing technical', () => {
  const r = snap('WARUNG\nNasi 20.000\nTOTAL 20.000');
  for (const key of ['receiptNo', 'orderNo', 'payment', 'paid', 'change', 'cashback', 'fuel']) assert.ok(!(key in r), `${key} should be absent`);
  assert.deepEqual(r.charges, []);
  const text = JSON.stringify(r);
  for (const word of ['sources', 'layout', 'line', 'box', 'confidence', 'pass', 'votes', 'raw']) assert.ok(!text.includes(`"${word}"`), `${word} must not be stored`);
});

test('the detail shows no empty rows', () => {
  assert.deepEqual(receiptMoneyRows(snap('WARUNG\nNasi 20.000\nTOTAL 20.000')), []);
  const rows = receiptMoneyRows(snap('KOPI\nLatte 30.000\nSUBTOTAL 30.000\nPB1 10% 3.000\nTOTAL 33.000'));
  assert.deepEqual(rows.map(r => [r.label, r.amount]), [['Subtotal', 30_000], ['PB1', 3_000]]);
  assert.ok(rows.every(r => r.amount !== 0));
});

test('a charge already inside the prices is marked, not added', () => {
  const r = snap('MINIMARKET\nSabun 40.000\nSusu 60.000\nTOTAL 100.000\nDPP 90.909\nPPN 9.091\nTUNAI 100.000');
  const tax = r.charges.find(c => c.type === 'tax');
  assert.equal(tax.included, true); assert.equal(r.total, 100_000);
});

test('a charge changed on the review screen is kept as confirmed', () => {
  const r = snap('KOPI\nLatte 30.000\nSUBTOTAL 30.000\nPB1 10% 3.000\nTOTAL 33.000', { charges: { discount: 0, tax: 3_300, service: 0, delivery: 0, fee: 0, rounding: 0 } });
  assert.deepEqual(r.charges.map(c => [c.type, c.amount]), [['tax', 3_300]]);
});

test('long receipts start folded in the detail, short ones open', () => {
  const names = 'Apel Jeruk Mangga Pisang Anggur Melon Semangka Nanas Salak Duku Kiwi Pepaya Jambu Durian Rambutan Kelapa Lemon Alpukat Sawo Markisa Belimbing Kedondong Manggis Sirsak Nangka Leci Kurma Tomat Wortel Kentang'.split(' ');
  const lines = names.map((n, i) => `${n.toUpperCase()} ${(i + 1)}.000`).join('\n');
  const long = snap(`TOKO\n${lines}\nTOTAL 465.000`);
  assert.equal(long.items.length, 30); assert.equal(receiptStartsOpen(long), false);
  assert.equal(receiptStartsOpen(snap('WARUNG\nNasi 20.000\nTOTAL 20.000')), true);
});

test('saving keeps notes for the person; structure goes to receipt and origin, and survives edits', () => {
  const scan = readFileSync(new URL('../components/receipt-scan.tsx', import.meta.url), 'utf8');
  const save = scan.slice(scan.indexOf('function toTx()'), scan.indexOf('async function save('));
  assert.match(save, /notes: draft\.notes\.trim\(\)/);
  assert.match(save, /origin: 'scan'/); assert.match(save, /receipt/);
  assert.ok(!/Isi struk:|Rincian: |No\. struk: |Dibayar: /.test(save), 'receipt facts must not be written into notes');
  const store = readFileSync(new URL('../lib/firestore.ts', import.meta.url), 'utf8');
  assert.match(store, /\.\.\.\(input\.receipt\?\{receipt:input\.receipt\}:\{\}\)/);
  // An edit updates only the fields the form sends; the form never sends `receipt`, so the snapshot stays as scanned.
  assert.match(store, /if\(old\)trx\.update\(r,\{\.\.\.fields/);
  const form = readFileSync(new URL('../components/transaction-form.tsx', import.meta.url), 'utf8');
  assert.match(form, /!editing&&preset\?\.receipt\?\{receipt:preset\.receipt\}:\{\}/);
  // Catat Otomatis: structured fields and an origin, never parser output in notes.
  const quick = readFileSync(new URL('../components/quick-entry.tsx', import.meta.url), 'utf8');
  assert.match(quick, /origin: 'quick'/); assert.ok(!/notes:\s*(action|result|plan)/.test(quick));
});

test('the receipt detail is a view: it never writes, so opening it cannot save twice', () => {
  const view = readFileSync(new URL('../components/receipt-detail.tsx', import.meta.url), 'utf8');
  assert.ok(!/@\/lib\/firestore|upsertTransaction|saveRecord|finance-store/.test(view));
  const scan = readFileSync(new URL('../components/receipt-scan.tsx', import.meta.url), 'utf8');
  assert.equal((scan.match(/upsertTransaction\(/g) || []).length, 1, 'one save per receipt');
});

test('Catat Otomatis keeps relationships in their own fields, never in notes', async () => {
  const { parseQuickPlan } = await import('../lib/quick-plan.ts');
  const { ctx } = await import('../bench/quick/fixtures.mjs');
  const pay = parseQuickPlan('bayar cicilan laptop 500rb pakai bca', ctx).actions[0].result.preset;
  assert.deepEqual([pay.type, pay.debtId, pay.walletId], ['debt_payment', 'd1', 'bca']); assert.ok(!('notes' in pay));
  const tf = parseQuickPlan('tf 200rb dari bca ke gopay', ctx).actions[0].result.preset;
  assert.deepEqual([tf.walletId, tf.destinationWalletId], ['bca', 'gopay']); assert.ok(!('notes' in tf));
  const got = parseQuickPlan('andi bayar 50rb', ctx).actions[0].result.preset;
  assert.equal(got.receivableId, 'r1'); assert.ok(!('notes' in got));
  const buy = parseQuickPlan('beli kopi 25rb di kenangan', ctx).actions[0].result.preset;
  assert.equal(buy.merchant, 'Kopi Kenangan'); assert.ok(buy.categoryId); assert.ok(!('notes' in buy));
});
