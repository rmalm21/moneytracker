import test from 'node:test';
import assert from 'node:assert/strict';
import { readReceiptText } from '../lib/receipt.ts';
import { buildIntelligence, findDuplicate, fuseReadings, fuseValues, mergeReceiptReads, normalizeMerchant, readRegionValue, reconcile, reconcileAmounts, regionFor } from '../lib/receipt-intel.ts';

/** An OCR pass from text: every line gets a row box (30 px apart), as if read from the same straightened photo. */
function pass(id, text, confidence = 85) {
  const lines = text.split('\n').map((t, i) => ({ text: t, confidence, box: { x: 20, y: 20 + i * 30, width: 400, height: 22 }, tokens: t.split(/\s+/).map((w, j) => ({ text: w, confidence, box: { x: 20 + j * 80, y: 20 + i * 30, width: 70, height: 22 } })) }));
  return { id, variant: 'even', psm: '6', lines, confidence, text, read: readReceiptText(text) };
}

test('consensus: two of three readings agree → that value, trusted more than any single reading', () => {
  const fused = fuseValues([{ value: 129360, weight: 1, passId: 'a' }, { value: 129360, weight: 1, passId: 'b' }, { value: 129380, weight: 1, passId: 'c' }]);
  assert.equal(fused.value, 129360); assert.equal(fused.status, 'agreed'); assert.deepEqual(fused.alternatives, [129380]);
  assert.equal(fuseValues([{ value: 129380, weight: 1, passId: 'c' }]).status, 'single');
});

test('conflict: three different readings → no silent pick', () => {
  const fused = fuseValues([{ value: 129360, weight: 1, passId: 'a' }, { value: 129380, weight: 1, passId: 'b' }, { value: 129860, weight: 1, passId: 'c' }]);
  assert.equal(fused.status, 'conflict'); assert.equal(fused.alternatives.length, 2);
});

test('a conflicting total is settled by arithmetic only when exactly one reading adds up', () => {
  const body = 'WARUNG\nNasi 100.000\nTeh 12.000\nSUBTOTAL 112.000\nSERVICE 5% 5.600\nPB1 10% 11.760\n';
  const fused = fuseReadings([pass('a', `${body}TOTAL 129.380`), pass('b', `${body}TOTAL 129.860`), pass('c', `${body}TOTAL 129.360`, 70)]);
  assert.equal(fused.read.total, 129360);
  assert.ok(fused.votes.resolved.includes('total'));
  const intel = buildIntelligence(fused.read, { votes: fused.votes });
  assert.equal(intel.grandTotal.status, 'verified');
  assert.equal(intel.reconciliation.state, 'RECONCILED');
});

test('an item read differently in two passes is resolved by the subtotal (16.000, not 15.000)', () => {
  const fused = fuseReadings([pass('a', 'Nasi 25.000\nTeh 15.000\nSUBTOTAL 41.000\nTOTAL 41.000'), pass('b', 'Nasi 25.000\nTeh 16.000\nSUBTOTAL 41.000\nTOTAL 41.000')]);
  assert.deepEqual(fused.read.items.map(i => i.total), [25000, 16000]);
  assert.ok(fused.votes.resolved.includes('item:1'));
  const intel = buildIntelligence(fused.read, { votes: fused.votes, itemBox: fused.itemBox });
  assert.equal(intel.items[1].amount.status, 'verified');
  assert.ok(intel.items[1].amount.evidence.box, 'the item keeps where it was read');
});

test('quantity × unit price corrects a misread line total when the subtotal proves it (5.200 → 6.200)', () => {
  const read = readReceiptText('KOPI 2 x 3.100 5.200\nSUBTOTAL 6.200\nTOTAL 6.200');
  assert.equal(read.items[0].total, 6200);
  assert.ok(read.fixes?.length);
});

test('when several corrections would add up, nothing is corrected and the items are marked for checking', () => {
  const fused = fuseReadings([pass('a', 'Nasi 10.000\nAyam 20.000\nTOTAL 31.000'), pass('b', 'Nasi 11.000\nAyam 21.000\nTOTAL 31.000')]);
  assert.equal(fused.votes.resolved.length, 0);
  const intel = buildIntelligence(fused.read, { votes: fused.votes });
  assert.deepEqual(intel.items.map(i => i.amount.status), ['check', 'check']);
  assert.ok(intel.issues.some(i => i.field === 'item:0' && /kemungkinan lain/.test(i.message)));
});

test('an item only one pass read is added when it is the one thing that makes the receipt add up', () => {
  const fused = fuseReadings([pass('a', 'Nasi 30.000\nTOTAL 42.000'), pass('b', 'Nasi 30.000\nEs Teh 12.000\nTOTAL 42.000', 60)]);
  assert.deepEqual(fused.read.items.map(i => i.name), ['Nasi', 'Es Teh']);
});

test('reconciliation states', () => {
  assert.equal(reconcileAmounts({ total: 50000, computed: 50000, hasParts: true }).state, 'RECONCILED');
  assert.equal(reconcileAmounts({ total: 50000, computed: 49950, hasParts: true }).state, 'MINOR_DIFFERENCE');
  const off = reconcileAmounts({ total: 100000, computed: 83000, hasParts: true });
  assert.equal(off.state, 'UNRECONCILED'); assert.equal(off.difference, 17000); assert.match(off.message, /Selisih Rp17\.000/);
  assert.equal(reconcileAmounts({ total: 50000, computed: 0, hasParts: false }).state, 'INSUFFICIENT_DATA');
  assert.equal(reconcile(readReceiptText('Nasi 50.000\nAyam 33.000\nTOTAL 100.000')).state, 'UNRECONCILED');
  assert.equal(reconcile(readReceiptText('TOTAL 72.500\nCASH 100.000\nCHANGE 27.500')).state, 'RECONCILED');
});

test('the review asks only about what is uncertain; a clean receipt has no issues', () => {
  const intel = buildIntelligence(readReceiptText('WARUNG BU SRI\n21/09/2026 12:41\nNasi 30.000\nTeh 5.000\nSUBTOTAL 35.000\nPB1 10% 3.500\nTOTAL 38.500\nTUNAI 50.000\nKEMBALI 11.500'));
  assert.equal(intel.headline, 'Struk berhasil dibaca.');
  assert.deepEqual(intel.issues, []);
  assert.equal(intel.grandTotal.status, 'verified');
  assert.ok(intel.grandTotal.why.some(w => /bayar dikurangi kembalian/.test(w)));
  assert.equal(intel.engineVersion, 2);
});

test('total first: a receipt whose items cannot be read still gives a usable total', () => {
  const intel = buildIntelligence(readReceiptText('TOKO\n@#$ %^&\nTOTAL 45.000\nTUNAI 50.000\nKEMBALI 5.000'));
  assert.equal(intel.grandTotal.value, 45000); assert.equal(intel.grandTotal.status, 'verified');
  assert.equal(intel.headline, 'Total berhasil dibaca, tetapi item belum dikenali.');
  const none = buildIntelligence(readReceiptText(''));
  assert.equal(none.headline, 'Struk tidak ditemukan.'); assert.equal(none.grandTotal.status, 'missing');
});

test('a merchant recorded before is recognised despite an OCR slip, the raw reading is kept', () => {
  assert.deepEqual(normalizeMerchant('WARUNG SEDERHANA RAS4', ['Warung Sederhana Rasa']), { value: 'Warung Sederhana Rasa', matched: true });
  assert.equal(normalizeMerchant('TOKO BARU', ['Warung Sederhana Rasa']).matched, false);
  const intel = buildIntelligence(readReceiptText('H0KBEN\nChicken Teriyaki 45.000\nTOTAL 45.000'));
  assert.equal(intel.merchant.value, 'HokBen'); assert.equal(intel.merchant.raw, 'H0KBEN'); assert.equal(intel.merchant.status, 'verified');
});

test('duplicates need several signals, never the amount alone', () => {
  const txs = [
    { id: '1', type: 'expense', amount: 25000, date: '2026-09-27', time: '12:10', merchant: 'Warung A', notes: '', tags: [] },
    { id: '2', type: 'expense', amount: 87500, date: '2026-09-27', time: '19:02', merchant: 'HokBen', notes: 'No. struk: 998877', tags: ['struk'] },
  ];
  assert.equal(findDuplicate({ amount: 25000, date: '2026-09-27', merchant: 'Bakso B', type: 'expense' }, txs), null);
  assert.equal(findDuplicate({ amount: 87500, date: '2026-09-27', merchant: 'HokBen', type: 'expense' }, txs)?.tx.id, '2');
  assert.equal(findDuplicate({ amount: 87500, date: '2026-09-28', receiptNo: '998877', type: 'expense' }, txs)?.tx.id, '2');
  assert.equal(findDuplicate({ amount: 87500, date: '2026-10-15', merchant: 'HokBen', type: 'expense' }, txs), null);
});

test('a long receipt in two photos: overlapping items counted once, summary from the last photo', () => {
  const a = readReceiptText('HIPERMARKET\n18/09/2026\nBAWANG 8.900\nTOMAT 7.800\nWORTEL 6.900\nKENTANG 18.500');
  const b = readReceiptText('WORTEL 6.900\nKENTANG 18.500\nTAHU 6.000\nTOTAL 48.100');
  const { read, overlap } = mergeReceiptReads(a, b);
  assert.equal(overlap, 2);
  assert.deepEqual(read.items.map(i => i.name), ['BAWANG', 'TOMAT', 'WORTEL', 'KENTANG', 'TAHU']);
  assert.equal(read.total, 48100); assert.equal(read.date, '2026-09-18');
  assert.equal(reconcile(read).state, 'RECONCILED');
});

test('reading one field again uses only that field\'s region, numbers only for amounts', () => {
  const p = pass('a', 'WARUNG\nNasi 30.000\nTOTAL 30.000');
  const line = p.lines[2];
  const plan = regionFor('total', line.box, line, { width: 460, height: 400 });
  assert.equal(plan.mode, 'number'); assert.equal(plan.psm, '7'); assert.equal(plan.whitelist, '0123456789.,-');
  assert.ok(plan.rect.x > line.tokens[0].box.x + line.tokens[0].box.width - 1, 'the label is left out');
  assert.ok(plan.rect.width * plan.rect.height < 460 * 400 / 20, 'far smaller than the page');
  assert.ok(plan.scale > 1);
  assert.equal(regionFor('merchant', p.lines[0].box, p.lines[0], { width: 460, height: 400 }).mode, 'text');
  assert.equal(regionFor('total', null, null, { width: 460, height: 400 }), null);
  assert.equal(readRegionValue('number', '129.36O'), 129360);
  assert.equal(readRegionValue('number', '12'), null);
  assert.equal(readRegionValue('date', 'Tgl 27/09/2026'), '2026-09-27');
});

test('a long receipt: a row cut in half at the edge of a photo does not break the overlap', () => {
  const a = readReceiptText('HIPERMARKET\nBAWANG 8.900\nTOMAT 7.800\nWORTEL 6.900\nKENTANG 18.500\nTAH# 1.0');
  const b = readReceiptText('KENT4NG 18.5O\nWORTEL 6.900\nKENTANG 18.500\nTAHU 6.000\nTOTAL 48.100');
  const { read } = mergeReceiptReads(a, b);
  assert.deepEqual(read.items.map(i => i.name), ['BAWANG', 'TOMAT', 'WORTEL', 'KENTANG', 'TAHU']);
});

test('one discount read under the item by most passes (or half) and on the bill by the rest: kept under the item, counted once', () => {
  const head = 'Alfamart\nYakult Minuman Susu Fermentasi\n2   12100   24,200\nHydro Coco Minuman Air Kelapa\n2   16000   32000\n';
  const tail = 'Subtotal   4   56,200\nTotal Diskon   -4,000\nTotal   52,200';
  const under = `${head}Disc. -4,000\n${tail}`, apart = `${head}Original 500 mi\nDisc. -4,000\n${tail}`;
  for (const order of [['a', 'b', 'c'], ['c', 'a', 'b'], ['c', 'a']]) {
    const texts = { a: under, b: under, c: apart };
    const fused = fuseReadings(order.map(id => pass(id, texts[id])));
    assert.equal(fused.read.discount, 0);
    assert.equal(fused.read.items.reduce((n, i) => n + (i.discount || 0), 0), 4000);
    assert.equal(fused.read.total, 52200);
  }
});
