// OCR V2.5: receipt structure — modifiers, hard item boundaries, multi-line names, discount ownership, merchant
// hierarchy, variants and SKUs. Spec sections 106–111, plus guards so the new rules do not overreach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReceipt, readReceiptText } from '../lib/receipt.ts';

const items = read => read.items.map(i => ({ name: i.name, qty: i.qty, total: i.total, ...(i.discount ? { discount: i.discount } : {}), ...(i.modifiers ? { modifiers: i.modifiers } : {}) }));

test('106 modifier: "1 hangat 2 ice" is a note on the item, not part of its name or quantity', () => {
  const read = readReceiptText('KEDAI TEH\n27/09/2026 10:00\nEs Teh Jumbo x3          Rp30.000\n1 hangat 2 ice\nTotal                    Rp30.000');
  assert.deepEqual(items(read), [{ name: 'Es Teh Jumbo', qty: 3, total: 30000, modifiers: ['1 hangat 2 ice'] }]);
});

test('107 hard item boundary: a note never becomes the start of the next item name', () => {
  const read = readReceiptText('CAFE X\n27/09/2026\nXXX                    Rp30.000\nspringkle\nMineral Water          Rp10.000\nTotal 40.000');
  assert.deepEqual(items(read), [{ name: 'XXX', qty: 1, total: 30000, modifiers: ['springkle'] }, { name: 'Mineral Water', qty: 1, total: 10000 }]);
});

test('107b a priceless upper-case name between two items is still the next item\'s first line', () => {
  const read = readReceiptText('WARUNG\n27/09/2026\nES JERUK 10.000\nNASI GORENG\nSPECIAL SEAFOOD 35.000\nTotal 45.000');
  assert.deepEqual(read.items.map(i => i.name), ['ES JERUK', 'NASI GORENG SPECIAL SEAFOOD']);
});

test('107c an unclear note between two items is attached above but marked for checking', () => {
  const read = readReceiptText('CAFE\n27/09/2026\nLatte 30.000\nsetengah\nMineral Water 10.000\nTotal 40.000');
  assert.deepEqual(read.items[0].modifiers, ['setengah']);
  assert.deepEqual(read.items[0].modifiersUnsure, ['setengah']);
  assert.equal(read.items[1].name, 'Mineral Water');
});

test('108 multi-line name with the price on its own line', () => {
  const read = readReceiptText('WARUNG\n27/09/2026\nNASI GORENG\nSPECIAL SEAFOOD\n                       Rp35.000\nTotal 35.000');
  assert.deepEqual(items(read), [{ name: 'NASI GORENG SPECIAL SEAFOOD', qty: 1, total: 35000 }]);
});

test('109 a member discount inside the item list belongs to the item above', () => {
  const read = readReceiptText('RESTO\n27/09/2026\nBurger                  Rp50.000\nMember Discount         -Rp10.000\nMineral Water            Rp10.000\nTotal 50.000');
  assert.deepEqual(items(read), [{ name: 'Burger', qty: 1, total: 50000, discount: 10000 }, { name: 'Mineral Water', qty: 1, total: 10000 }]);
  assert.equal(read.discount, 0);
  assert.equal(checkReceipt(read).matches, true);
});

test('109b the same words as the last line before the summary are a bill discount', () => {
  const read = readReceiptText('RESTO\n27/09/2026\nBurger 50.000\nMineral Water 10.000\nDiskon Member -10.000\nTotal 50.000');
  assert.equal(read.items.some(i => i.discount), false);
  assert.equal(read.discount, 10000);
});

test('110 a voucher after the subtotal is a bill discount, not the last item\'s', () => {
  const read = readReceiptText('RESTO\n27/09/2026\nNasi Goreng 50.000\nEs Teh 30.000\nSubtotal                 Rp80.000\nVoucher                  -Rp10.000\nTotal                     Rp70.000');
  assert.equal(read.items.some(i => i.discount), false);
  assert.equal(read.discount, 10000);
  assert.equal(read.charges.find(c => c.label === 'Voucher')?.type, 'voucher');
});

test('111 thermal retail: brand, company, outlet, variant, SKU, included PPN, footer', () => {
  const read = readReceiptText('MR D.I.Y.\nPT DAYA INDAH ANUGERAH\nDEPOK TOWN SQUARE\nJl. Margonda Raya No. 1\n27/09/2026 14:02\nAUTO FOLD UMBRELLA\nDB024 - 12/60\n9038568     1 X 91,500    91,500\nTISSUE BASAH                20,000\nTotal                    111,500\nDebit                    111,500\nPPN INCLUDED              11,050\nTerima kasih\nCustomer care WA 0812 3456 7890\nwww.mrdiy.com');
  assert.equal(read.merchant, 'MR D.I.Y.');
  assert.equal(read.legalEntity, 'PT DAYA INDAH ANUGERAH');
  assert.equal(read.branch, 'DEPOK TOWN SQUARE');
  assert.deepEqual(read.items.map(i => [i.name, i.qty, i.price, i.total, i.variant, i.sku]), [['AUTO FOLD UMBRELLA', 1, 91500, 91500, 'DB024 - 12/60', '9038568'], ['TISSUE BASAH', 1, 20000, 20000, undefined, undefined]]);
  assert.equal(read.payment, 'debit');
  const check = checkReceipt(read);
  assert.equal(check.total, 111500);
  assert.ok(check.included.includes('tax'), 'PPN included is not added on top');
  assert.equal(check.matches, true);
});

test('merchant: payment brands and addresses are never the shop; noise before the name is skipped', () => {
  assert.equal(readReceiptText('QRIS\nKOPI KENANGAN\nJl. Sudirman No. 3\n27/09/2026\nKopi 20.000\nTotal 20.000').merchant.toUpperCase(), 'KOPI KENANGAN');
  assert.equal(readReceiptText('0 ERA\nWARUNG KOPI NUSANTARA\nJl. Melati No. 12\nKopi 18.000').merchant, 'WARUNG KOPI NUSANTARA');
});

test('a variant with O/0 side by side (an OCR swap) is kept as printed but marked for checking', () => {
  const read = readReceiptText('TOKO\n27/09/2026\nAUTO FOLD UMBRELLA\nDB0O24 - 12/60\n9038568     1 X 91,500    91,500\nTotal 91,500');
  assert.equal(read.items[0].variant, 'DB0O24 - 12/60');
  assert.equal(read.items[0].variantUnsure, true);
  assert.equal(readReceiptText('TOKO\n27/09/2026\nAUTO FOLD UMBRELLA\nDB024 - 12/60\n9038568     1 X 91,500    91,500\nTotal 91,500').items[0].variantUnsure, undefined);
});

test('the saved receipt and Split Bill keep the notes, variant, SKU, company and outlet', async () => {
  const { buildReceiptSnapshot } = await import('../lib/receipt-snapshot.ts');
  const { splitFromReceipt } = await import('../lib/split-bill.ts');
  const read = readReceiptText('MR D.I.Y.\nPT DAYA INDAH ANUGERAH\nDEPOK TOWN SQUARE\n27/09/2026 14:02\nAUTO FOLD UMBRELLA\nDB024 - 12/60\n9038568     1 X 91,500    91,500\nTotal 91,500');
  const zero = { discount: 0, tax: 0, service: 0, delivery: 0, fee: 0, rounding: 0 }, on = { discount: true, tax: true, service: true, delivery: true, fee: true, rounding: true };
  const snap = buildReceiptSnapshot({ read, merchant: read.merchant, date: read.date, time: read.time, payment: 'debit', total: 91500, subtotal: 0, charges: zero, counted: on,
    items: [{ ...read.items[0] }, { name: 'Es Teh Jumbo', qty: 3, price: 10000, modifiers: ['1 hangat 2 ice'] }] });
  assert.equal(snap.legalEntity, 'PT DAYA INDAH ANUGERAH');
  assert.equal(snap.branch, 'DEPOK TOWN SQUARE');
  assert.deepEqual([snap.items[0].variant, snap.items[0].sku, snap.items[1].modifiers], ['DB024 - 12/60', '9038568', ['1 hangat 2 ice']]);
  const split = splitFromReceipt(snap, p => p + '1');
  assert.deepEqual(split.items.map(i => i.note), ['DB024 - 12/60', '1 hangat 2 ice']);
  assert.equal(split.items[1].qty * split.items[1].price, 30000, 'notes never change the money');
});

test('a note right before the summary ("kurang manis") belongs to the last item (found by the held-out set)', () => {
  const read = readReceiptText('MARTABAK\n30/09/2026\nMARTABAK MANIS\nKEJU COKLAT SUSU\n65.000\nTeh Tarik   12.000\nkurang manis\nSubtotal   77.000\nPromo   -7.000\nTotal   70.000');
  assert.deepEqual(items(read), [{ name: 'MARTABAK MANIS KEJU COKLAT SUSU', qty: 1, total: 65000 }, { name: 'Teh Tarik', qty: 1, total: 12000, modifiers: ['kurang manis'] }]);
});
