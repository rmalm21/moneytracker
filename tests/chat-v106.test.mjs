import test from 'node:test';
import assert from 'node:assert/strict';
import { chatReply } from '../lib/chat/engine.ts';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { asli, bench, categoryNames } from '../bench/v102/state.mjs';

/** A conversation on an account, the rules alone (no trained model). */
async function talk(acc, ...steps) {
  let memory = {}, last = null;
  for (const s of steps) { last = await chatReply(s, memory, { ...acc, voice: 'santai' }); memory = last.memory; }
  return last;
}
const card = (acc, text) => parseQuickPlan(text, acc.quick).actions.map(a => a.result);
const shown = r => [r.reply.title, r.reply.text, r.reply.hero?.value, ...(r.reply.lines || []).map(l => `${l.label} ${l.value}`)].filter(Boolean).join(' ');
const isCard = r => r.reply.kind === 'plan';

test('10.6 Catat: days back in words, "rebu", a count in words, the category of what it was for', () => {
  for (const acc of [bench, asli]) {
    const day = n => { const d = new Date(`${acc.today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
    assert.equal(card(acc, 'parkir 3rb empat hari yang lalu')[0].preset.date, day(4));
    assert.equal(card(acc, 'jajan 12rb sepekan lalu')[0].preset.date, day(7));
    assert.equal(card(acc, 'jajan 12rb dua minggu lalu')[0].preset.date, day(14));
    assert.equal(card(acc, 'beli es teh lima rebu')[0].amount, 5000);
    assert.equal(card(acc, 'beli dua gelas masing-masing 8rb')[0].amount, 16000);
    const bensin = card(acc, 'potong saldo gopay 30rb buat bensin')[0];
    assert.ok(categoryNames(acc, bensin.preset.categoryId, bensin.preset.subcategoryId).includes('Transportasi'));
    const gift = card(acc, 'kasih 5rb ke pengemis')[0];
    assert.ok(categoryNames(acc, gift.preset.categoryId, gift.preset.subcategoryId).includes('Sosial & Sedekah'));
    // A bare number between two wallets is thousands, to be checked.
    const tf = parseQuickPlan('tf dr jago ke gopay 150', acc.quick).actions[0];
    assert.equal(tf.result.amount, 150000); assert.equal(tf.fields.amount.status, 'check');
  }
});

test('10.6 Catat: money back, paid for others, a cash fee, a cashback, two wallets, the rest of a debt', () => {
  for (const acc of [bench, asli]) {
    assert.deepEqual(card(acc, 'beli celana 250rb dikembaliin 50rb').map(r => [r.kind, r.amount]), [['expense', 200000]]);
    assert.deepEqual(card(acc, 'gue bayarin dulu 120rb, nanti tono ganti 80rb').map(r => [r.kind, r.amount]), [['expense', 40000], ['receivable_new', 80000]]);
    assert.deepEqual(card(acc, 'makan bertiga 180rb gue talangin semua').map(r => [r.kind, r.amount]), [['expense', 60000], ['receivable_new', 120000]]);
    const atm = card(acc, 'tarik tunai 400rb dari jago kena biaya admin 6500');
    assert.equal(atm.length, 1); assert.equal(atm[0].kind, 'transfer'); assert.equal(atm[0].preset.transferFee, 6500);
    assert.deepEqual(card(acc, 'beli makan 40rb dapet cashback 8rb').map(r => [r.kind, r.amount]), [['expense', 40000], ['income', 8000]]);
    assert.deepEqual(card(acc, 'beli tas 400rb, 300rb pake jago 100rb pake gopay').map(r => r.amount), [300000, 100000]);
    const debt = card(acc, 'bayar cicilan 300rb dari total utang 2 juta');
    assert.deepEqual(debt.map(r => [r.kind, r.amount]), [['debt_payment', 300000]]);
    // Said for each of the others, the one left without a wallet is asked, not filled in.
    const each = parseQuickPlan('makan 20rb pakai cash, kopi 15rb pakai cash, bensin 40rb', acc.quick).actions;
    assert.equal(each[2].result.preset.walletId, undefined); assert.equal(each[2].fields.wallet.status, 'check');
    // "150rb buat sepatu" with "Sepatu lari" on the wish list is shoes bought.
    assert.equal(card(acc, 'seratus ribu buat sepatu')[0].kind, 'expense');
  }
});

test('10.6 chat: simulations, wishes and plans are worked out, never a card', async () => {
  for (const acc of [bench, asli]) {
    const buy = await talk(acc, 'kalau gue beli jaket 300rb sisa duit gue berapa');
    assert.ok(!isCard(buy)); assert.match(shown(buy), /uang bebas/i);
    const raise = await talk(acc, 'misalnya gaji naik 20 persen');
    assert.ok(!isCard(raise)); assert.match(shown(raise), /Rp10\.200\.000/);
    const daily = await talk(acc, 'kalo jajan cilok 10rb tiap hari sebulan');
    assert.ok(!isCard(daily)); assert.match(shown(daily), /Rp300\.000/);
    assert.ok(!isCard(await talk(acc, 'pengen banget beli sepatu baru')));
    const plan = await talk(acc, 'gue mau beli laptop 6jt', 'tapi yang 3 juta juga oke', 'kalau nabung 500rb tiap bulan?');
    assert.ok(!isCard(plan)); assert.match(shown(plan), /6 bulan/);
    // "kalau ga salah" is "if I'm not wrong": still a record.
    assert.ok(isCard(await talk(acc, 'kalau ga salah tadi bayar parkir 5rb')));
  }
});

test('10.6 chat: a record without its amount is asked, then finished; a friend paying back; a debt paid', async () => {
  for (const acc of [bench, asli]) {
    const asked = await talk(acc, 'tolong masukin uang lembur ke jago');
    assert.ok(!isCard(asked)); assert.match(asked.reply.text, /\?/);
    const done = await talk(acc, 'tolong masukin uang lembur ke jago', '400rb');
    assert.ok(isCard(done)); assert.equal(card(acc, done.reply.text)[0].amount, 400000);
    const half = await talk(acc, 'dimas baru balikin separuh utangnya');
    assert.ok(isCard(half)); assert.deepEqual(card(acc, half.reply.text).map(r => [r.kind, r.amount]), [['receivable_payment', 125000]]);
    const who = await talk(acc, 'temen gue udah ngembaliin duitnya');
    assert.ok(!isCard(who)); assert.ok(who.reply.chips.some(c => /budi/.test(c)));
    // Asking about records is not a record without its amount.
    assert.ok(!/Habis berapa/.test(shown(await talk(acc, 'total makan siang bulan ini'))));
    assert.ok(!/Habis berapa/.test(shown(await talk(acc, 'gue udah makan'))));
  }
});

test('10.6 chat: sums, features and feelings', async () => {
  for (const acc of [bench, asli]) {
    assert.match(shown(await talk(acc, 'gaji 5jt, pengeluaran 4jt, bisa nabung berapa persen')), /20%/);
    assert.match(shown(await talk(acc, '300rb itu berapa persen dari 1,5jt')), /20%/);
    assert.match(shown(await talk(acc, 'tas 400rb diskon 10% terus diskon lagi 10%')), /Rp324\.000/);
    assert.match(shown(await talk(acc, 'saldo paling gede ada di dompet mana')), /Jago/);
    const can = await talk(acc, 'bisa catat piutang ga');
    assert.ok(!isCard(can)); assert.match(can.reply.text, /^Bisa/);
    assert.match(shown(await talk(acc, 'bantu atur gaji dong')), /50\/30\/20/);
    const joy = await talk(acc, 'akhirnya bisa nabung juga bulan ini');
    assert.ok(!isCard(joy)); assert.match(joy.reply.text, /selamat|mantap/i);
    assert.ok(!isCard(await talk(acc, 'nyesel banget beli jaket kemarin')));
    const sim = await talk(acc, 'budget makan sisa berapa', 'kalau gue pake 13.500?');
    assert.match(shown(sim), /Rp400\.000/);
  }
});
