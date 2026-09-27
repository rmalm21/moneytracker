import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReceipt, detectReceiptType, netItems, readReceiptDate, readReceiptText } from '../lib/receipt.ts';

test('the grand total is never the cash paid, the change, the subtotal, a receipt number or a phone number', () => {
  const read = readReceiptText(`TOKO MAJU
Telp 0812345678
No. Struk 230927183922
Kopi 20.000
Roti 30.000
Subtotal 50.000
PB1 10% 5.000
TOTAL 55.000
TUNAI 100.000
KEMBALI 45.000`);
  const check = checkReceipt(read);
  assert.equal(check.total, 55000);
  assert.equal(read.subtotal, 50000); assert.equal(read.paid, 100000); assert.equal(read.change, 45000);
  assert.equal(read.identifiers.receiptNo, '230927183922');
  assert.ok(!read.items.some(item => [230927183922, 812345678].includes(item.total)));
});

test('payment: total, cash tendered and change are kept apart', () => {
  const read = readReceiptText('WARUNG\nNasi Uduk 72.500\nTOTAL 72.500\nCASH 100.000\nCHANGE 27.500');
  assert.deepEqual([checkReceipt(read).total, read.payment, read.paid, read.change], [72500, 'cash', 100000, 27500]);
});

test('PPN already inside the total is not added again (DPP + PPN = total)', () => {
  const read = readReceiptText('MINIMARKET\nSabun 40.000\nSusu 60.000\nTOTAL 100.000\nDPP 90.909\nPPN 9.091\nTUNAI 100.000');
  const check = checkReceipt(read);
  assert.equal(check.total, 100000); assert.ok(check.matches); assert.ok(check.included.includes('tax'));
});

test('quantity × unit price = line amount', () => {
  const read = readReceiptText('ES TEH\n2 x 15.000 30.000\nTOTAL 30.000');
  assert.deepEqual(read.items.map(i => [i.name, i.qty, i.price, i.total, i.unitPrinted]), [['ES TEH', 2, 15000, 30000, true]]);
  // "2 AQUA 10.000": the unit price is not printed; it is only derived and marked so.
  const aqua = readReceiptText('2 AQUA 10.000\nTOTAL 10.000');
  assert.equal(aqua.items[0].qty, 2); assert.equal(aqua.items[0].unitPrinted, false);
});

test('cashback is information, not a discount: cash out stays the amount paid', () => {
  const read = readReceiptText('TEH TARIK\nTeh 60.000\nRoti 40.000\nTotal paid 100.000\nCashback 10.000');
  assert.equal(read.discount, 0); assert.equal(read.cashback, 10000);
  assert.equal(checkReceipt(read).total, 100000);
  assert.ok(read.charges.some(c => c.type === 'cashback' && c.amount === 10000));
});

test('an item name printed over two lines stays one item', () => {
  const read = readReceiptText('RM PADANG\n26/09/2026 13:05\nAYAM GEPREK\nSAMBAL MATAH 32.000\nTEH TAWAR 5.000\nTOTAL 37.000');
  assert.deepEqual(read.items.map(i => [i.name, i.total]), [['AYAM GEPREK SAMBAL MATAH', 32000], ['TEH TAWAR', 5000]]);
  assert.ok(checkReceipt(read).matches);
  // The same when the price has a line of its own.
  const alone = readReceiptText('RM PADANG\nAYAM GEPREK\nSAMBAL MATAH\n32.000\nTOTAL 32.000');
  assert.equal(alone.items.length, 1);
});

test('notes under an item belong to it; a paid add-on stays its own line', () => {
  const read = readReceiptText('KOPI SENJA\nCAFFE LATTE 32.000\nNO ICE\nLESS SUGAR\n+ EXTRA SHOT 6.000\nCROISSANT 24.000\nTotal 62.000');
  assert.deepEqual(read.items.map(i => i.name), ['CAFFE LATTE', 'EXTRA SHOT', 'CROISSANT']);
  assert.deepEqual(read.items[0].modifiers, ['NO ICE', 'LESS SUGAR']);
  assert.equal(read.items[1].addOnOf, 'CAFFE LATTE');
  assert.ok(checkReceipt(read).matches);
});

test('item discounts, bill discounts, vouchers and shipping discounts keep their meaning', () => {
  const read = readReceiptText('SWALAYAN\nBURGER 50.000\nDISC BURGER -10.000\nKENTANG 20.000\nSUBTOTAL 60.000\nMEMBER DISC -5.000\nVOUCHER 3.000\nDiskon Ongkos Kirim 2.000\nOngkir 2.000\nTOTAL 52.000');
  assert.equal(read.items[0].discount, 10000);
  assert.equal(read.discount, 10000, 'bill-level only: member 5.000 + voucher 3.000 + shipping 2.000');
  assert.deepEqual(read.charges.filter(c => c.key === 'discount').map(c => c.type), ['discount', 'voucher', 'shipping_discount']);
  assert.ok(checkReceipt(read).matches);
  // Split Bill gets the burger at its net price.
  assert.deepEqual(netItems(read.items).map(i => [i.name, i.qty, i.price]), [['BURGER', 1, 40000], ['KENTANG', 1, 20000]]);
});

test('a receipt number is not money, a date is not three prices', () => {
  const read = readReceiptText('TOKO\nNO TRX 230927183922\n27/09/2026\nSabun 12.000\nTOTAL 12.000');
  assert.deepEqual(read.items.map(i => i.total), [12000]);
  assert.equal(read.date, '2026-09-27');
  assert.ok(!read.items.some(i => [27, 9, 2026].includes(i.total)));
});

test('dates follow the real calendar and the Indonesian day/month order', () => {
  assert.equal(readReceiptDate('31/02/2026'), '');
  assert.equal(readReceiptDate('29/02/2025'), '');
  assert.equal(readReceiptDate('29/02/2028'), '2028-02-29');
  assert.equal(readReceiptDate('09/10/2026'), '2026-10-09');
  assert.equal(readReceiptDate('27.09.26'), '2026-09-27');
  assert.equal(readReceiptDate('27 SEPT 2026'), '2026-09-27');
  assert.equal(readReceiptDate('2026-09-27'), '2026-09-27');
  const read = readReceiptText('TOKO\n31/02/2026 10:00\nSabun 12.000\nTOTAL 12.000');
  assert.equal(read.date, '');
});

test('a promo in the footer is not the payment method', () => {
  const read = readReceiptText('SWALAYAN\nBeras 72.000\nTOTAL BAYAR 72.000\nDEBIT BCA 72.000\nPROMO GOPAY CASHBACK 20%\nTerima kasih');
  assert.equal(read.payment, 'debit');
});

test('a difference is reported, never filled with an invented item', () => {
  const read = readReceiptText('WARUNG\nNasi 50.000\nAyam 33.000\nTOTAL 100.000');
  const check = checkReceipt(read);
  assert.equal(read.items.length, 2);
  assert.equal(check.matches, false);
  assert.match(check.notes.join(' '), /selisih Rp17\.000/);
});

test('fuel: litres × price per litre must give the total', () => {
  const read = readReceiptText('SPBU 34.123.45\nWaktu: 19/09/2026 07:22\nNama Produk PERTAMAX\nHarga/Liter Rp 12.900\nVolume 4,92 L\nTotal Harga Rp 63.468\nCASH Rp 70.000\nKembali Rp 6.532');
  assert.equal(read.receiptType, 'fuel');
  assert.deepEqual(read.fuel, { product: 'PERTAMAX', liters: 4.92, pricePerLiter: 12900, matches: true });
  assert.deepEqual(read.items.map(i => [i.name, i.total]), [['PERTAMAX', 63468]]);
  assert.equal(checkReceipt(read).total, 63468);
  assert.equal(read.identifiers.station, '34.123.45');
});

test('parking details are read when printed', () => {
  const read = readReceiptText('PARKIR MAL\nMasuk : 22/09/2026 10:05\nKeluar : 22/09/2026 13:40\nDurasi : 3 jam 35 mnt\nTarif Mobil 10.000\nTOTAL 10.000');
  assert.equal(read.receiptType, 'parking');
  assert.deepEqual([read.parking.entry, read.parking.exit], ['10:05', '13:40']);
});

test('money formats: decimals are not thousands', () => {
  assert.deepEqual(readReceiptText('Kopi 12.50\nTOTAL 12.50').items, []);
  assert.equal(readReceiptText('Kopi IDR 25,000\nTOTAL IDR 25,000').total, 25000);
  assert.equal(readReceiptText('Kopi 25.OOO\nTOTAL 25.000').items[0].total, 25000);
});

test('every field remembers its line, and lines are sorted into zones', () => {
  const text = 'WARUNG BU SRI\nJl. Melati 5\n21/09/2026 12:41\nNasi 30.000\nTeh 5.000\nSUBTOTAL 35.000\nPB1 10% 3.500\nTOTAL 38.500\nTUNAI 50.000\nKEMBALI 11.500\nTerima kasih';
  const read = readReceiptText(text);
  assert.deepEqual(read.sources.total, [7]); assert.deepEqual(read.sources.merchant, [0]); assert.deepEqual(read.sources.date, [2]); assert.deepEqual(read.sources.tax, [6]);
  assert.deepEqual(read.items.map(i => i.lines), [[3], [4]]);
  const zones = Object.fromEntries(read.layout.map(l => [l.line, l.zone]));
  assert.deepEqual([zones[0], zones[3], zones[6], zones[8], zones[10]], ['header', 'items', 'summary', 'payment', 'footer']);
});

test('a split amount ("450" / "000") is joined back', () => {
  const read = readReceiptText('SNEAKER PUTIH 42\n450\n000\nTOTAL\n450\n000');
  assert.equal(read.items[0]?.total, 450000);
});

test('the kind of receipt is recognised from its words', () => {
  assert.equal(detectReceiptType('PESANAN ANTAR\nOngkos kirim 9.000\nBiaya layanan 2.000'), 'food_delivery');
  assert.equal(detectReceiptType('Subtotal Produk 75.000\nAsuransi Pengiriman 1.500'), 'marketplace');
  assert.equal(detectReceiptType('APOTEK SEHAT\nParacetamol 500mg tablet'), 'pharmacy');
  assert.equal(detectReceiptType('WARUNG MAKAN\nNasi goreng\nPB1 10%\nMeja 4'), 'restaurant');
  assert.equal(detectReceiptType(''), 'unknown');
});

test('a missing item is not "repaired" by changing two other prices', () => {
  // ES TEH's line could not be read as an item (no name); the other prices must stay as printed.
  const read = readReceiptText('WARUNG\nNASI GORENG 2 x 25.000 50.000\n— 2x 6.000 12.000\nAYAM BAKAR 32.000\nKOPI SUSU 18.000\nSUBTOTAL 112.000\nTOTAL 112.000');
  assert.equal(read.fixes, undefined);
  assert.ok(read.items.some(i => i.total === 32000) && read.items.some(i => i.total === 18000));
});

test('shipping insurance is a fee, an order code is not a discount, one misread fee digit is repaired only when unique', () => {
  const market = readReceiptText('Kabel 45.000\nSubtotal Produk 45.000\nOngkos Kirim 12.000\nAsuransi Pengiriman 1.500\nTotal Tagihan 58.500');
  assert.deepEqual([market.delivery, market.fee], [12000, 1500]);
  const code = readReceiptText('KOPI\nOrder HA-2231\nLatte 32.000\nTotal 32.000');
  assert.equal(code.discount, 0);
  const fee = readReceiptText('Bakmi 74.000\nSubtotal 74.000\nOngkos kirim 9.000\nBiaya kemasan 3.008\nTotal 86.000');
  assert.equal(fee.fee, 3000); assert.match(fee.fixes.join(' '), /3\.008/);
});

test('change printed without a payment word means cash', () => {
  const read = readReceiptText('SPBU\nTotal Harga Rp 63.468\nRp 70.000\nKembali Rp 6.532');
  assert.equal(readReceiptText('Kopi 20.000\nTOTAL 20.000\nBAYAR 50.000\nKEMBALI 30.000').payment, 'cash');
  assert.equal(readReceiptText('Kopi 20.000\nTOTAL 20.000\nQRIS 20.000').payment, 'qris');
  void read;
});
