import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { ctx, C } from '../bench/quick/fixtures-v68state.mjs';

const plan = text => parseQuickPlan(text, ctx);
const one = text => { const p = plan(text); assert.equal(p.actions.length, 1, `${text}: ${p.actions.length} aksi`); return p.actions[0]; };
const amounts = text => plan(text).actions.map(a => [a.result.kind, a.result.amount, a.result.preset.walletId || '']);

test('7.9 amounts: one amount in two parts, Javanese, how many, a weighed price, buy N get M', () => {
  assert.equal(one('laptop 2jt 350rb').result.amount, 2350000);
  assert.equal(one('tuku sego 15ewu, bayar cash').result.amount, 15000);
  assert.equal(one('dua kopi @18rb').result.amount, 36000);
  assert.deepEqual(amounts('nasgor 18rb tiga, es teh 5rb dua').map(x => x[1]), [54000, 10000]);
  assert.equal(plan('beras 2,5 kg, sekilo 16rb, telur 28rb').actions[0].result.amount, 40000);
  assert.equal(one('beli 3 gratis 1, harga 20rb per buah').result.amount, 60000);
  // A price with its unit after a count stays the total (as before).
  assert.equal(one('nasi padang 25rb 2 bungkus').result.amount, 25000);
});
test('7.9 plain numbers in a list are thousands to confirm; a model number or a single price stays as it was', () => {
  const p = plan('kopi 25, makan 30');
  assert.deepEqual(p.actions.map(a => a.result.amount), [25000, 30000]);
  assert.ok(p.actions.every(a => a.fields.amount.status === 'check' && a.result.inferredAmount));
  assert.ok(p.confirm);
  assert.equal(plan('iphone 15').actions.length, 0);
  assert.equal(one('parkir 750').result.amount, 750);
  // A wallet between the items keeps its own item (no thousands rewrite across it).
  assert.deepEqual(amounts('kopi 20 jago bensin 80 krom').map(x => x[2]), ['jago', 'krom']);
});
test('7.9 one price worked out: discount with a cap, discounts in a row, charges, a price that includes tax', () => {
  assert.equal(one('diskon 20% maksimal 30rb dari belanja 200rb').result.amount, 170000);
  assert.equal(one('100rb diskon 20% terus 10%').result.amount, 72000);
  assert.equal(one('200rb pajak 10% service 5%').result.amount, 230000);
  assert.equal(one('makan 150rb service 5% pajak 10%').result.amount, 172500);
  assert.equal(one('subtotal 200rb, diskon 10%, service 5%, pajak 10% setelah service').result.amount, 207900);
  assert.equal(one('harga sudah termasuk pajak 10%, total 110rb').result.amount, 110000);
});
test('7.9 money that did not go out: the change given back, a cashback to come, the rest of a price in instalments', () => {
  const a = one('beli nasi 23rb, kasih 50rb');
  assert.equal(a.result.amount, 23000); assert.match(a.result.preset.notes, /kembalian Rp27\.000/);
  assert.deepEqual(amounts('belanja 100rb, nanti cashback 10rb'), [['expense', 100000, '']]);
  assert.deepEqual(amounts('laptop 8jt, dp 2jt dari mandiri, sisanya nyicil'), [['expense', 2000000, 'mandiri']]);
  assert.equal(plan('catat makan 30rb sama parkir 5rb, tapi parkirnya jangan dulu').actions.length, 1);
});
test('7.9 paid two ways, an instalment split, a refund, office claims, money from a person', () => {
  assert.deepEqual(amounts('belanja 150rb, tunai 50rb sisanya jago'), [['expense', 50000, 'cash'], ['expense', 100000, 'jago']]);
  const gap = plan('total belanja 150rb, tunai 50rb, jago 80rb');
  assert.deepEqual(gap.actions.map(a => a.result.amount), [50000, 80000]); assert.ok(gap.actions.every(a => a.review));
  assert.deepEqual(amounts('bayar cicilan 450rb, pokok 400rb bunga 50rb').map(x => x.slice(0, 2)), [['debt_payment', 400000], ['expense', 50000]]);
  assert.deepEqual(amounts('belanja 200rb, satu barang dibalikin, refund 50rb ke jago'), [['income', 50000, 'jago']]);
  assert.equal(one('bayar makan meeting 180rb dari jago, nanti diganti kantor').result.kind, 'claim_new');
  assert.equal(one('kantor baru ganti 150rb dari klaim 180rb').result.kind, 'claim_payment');
  assert.equal(one('mama kirim 200rb').result.kind, 'income');
  assert.equal(one('tagihan dika 100rb, baru bayar 40rb').result.kind, 'receivable_payment');
  // Not a name: interjections and question words stay what they were.
  assert.equal(one('huft bayar listrik 300rb').result.kind, 'expense');
});
test('7.9 sharing without names: your part, and what you paid for the others', () => {
  assert.equal(one('makan 200rb bagi rata berempat termasuk gue').result.amount, 50000);
  const paid = plan('gue bayar 600rb buat berempat, bagi rata').actions;
  assert.deepEqual(paid.map(a => [a.result.kind, a.result.amount]), [['expense', 150000], ['receivable_new', 450000]]);
  assert.deepEqual(amounts('makan 200rb bagi rata ke empat teman, gue nggak ikut'), [['receivable_new', 200000, '']]);
  const bill = one('Bill 180rb. Gue 80rb, Dika 60rb, Bimo 40rb. Gue bayar semua dari Jago.');
  assert.equal(bill.result.preset.walletId, 'jago'); assert.equal(bill.result.split.participants.length, 3);
});
test('7.9 the person\'s note, a category named, a budget raised by an amount, items paid at once, new words', () => {
  const n = one('kopi 25rb pakai jago, catatannya lembur');
  assert.equal(n.result.kind, 'expense'); assert.equal(n.result.note, 'Lembur'); assert.match(n.result.preset.notes, /Lembur/);
  assert.equal(one('kopi 30rb, masukin hiburan aja').result.preset.categoryId, 'expense.nongkrong-hiburan');
  const b = parseQuickPlan('budget makan naikin 200rb', { ...ctx, budgets: [{ id: 'b1', name: 'Makan & Minum', categoryId: 'expense.makan-minum', subcategoryId: null, subcategoryIds: [], amount: 1000000, active: true, cycleType: 'salary' }] }).actions[0];
  assert.equal(b.result.amount, 1200000);
  assert.equal(one('di warung beli roti 12rb sama susu 8rb, bayarnya barengan pake tunai').result.amount, 20000);
  assert.equal(one('tabung gas 20rb').result.kind, 'expense');
  assert.equal(one('makan lembur 20rb').result.kind, 'expense');
  for (const [w, cat] of [['rendang', 'expense.makan-minum'], ['martabak telur', C('Jajan')], ['coklat panas', C('Kopi & Minuman')], ['jeruk', C('Bahan Makanan')], ['es jeruk', C('Kopi & Minuman')]]) {
    const r = one(`${w} 20rb`).result; assert.ok([r.preset.subcategoryId, r.preset.categoryId].includes(cat), w);
  }
  assert.notEqual(one('dokter hewan 150rb').result.preset.categoryId, 'expense.kesehatan');
});
