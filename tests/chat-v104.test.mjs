import test from 'node:test';
import assert from 'node:assert/strict';
import { chatReply } from '../lib/chat/engine.ts';
import { understand } from '../lib/chat/understand.ts';
import { chatFeature } from '../lib/chat/feature.ts';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { parseQuickText } from '../lib/quick-entry.ts';
import { asli, bench, categoryNames } from '../bench/v102/state.mjs';

/** A conversation on an account, the rules alone (no trained model). */
async function talk(acc, ...steps) {
  let memory = {}, last = null;
  for (const s of steps) { last = await chatReply(s, memory, { ...acc, voice: 'santai' }); memory = last.memory; }
  return last;
}
const card = (acc, text) => parseQuickPlan(text, acc.quick).actions.map(a => a.result);
const shown = r => [r.reply.title, r.reply.text, ...(r.reply.lines || []).map(l => `${l.label} ${l.value}`)].filter(Boolean).join(' ');

test('10.4: a story in several parts — what was bought and its category come from the part with the amount', () => {
  for (const acc of [bench, asli]) {
    for (const [text, name] of [['duh hari ini ribet bgt, abis meeting langsung cabut, sempet beli soto 27rb pk jenius', 'Soto'], ['anak kos sebelah ngajak keluar, ujung2nya aku beli soto 19rb dr jenius wkwk', 'Soto']]) {
      const r = parseQuickText(text, acc.quick);
      assert.equal(r.preset.description, name, text);
      assert.ok(categoryNames(acc, r.preset.categoryId, r.preset.subcategoryId).includes('Makan & Minum'), text);
    }
    // Nothing named in the part with the amount: the rest of the sentence still says it.
    assert.equal(parseQuickText('makan siang sama klien, 150rb pake jago', acc.quick).preset.description, 'Makan Siang Klien');
  }
});

test('10.4: amounts — a correction inside one message, "sejeti", "IDR", a word doubled with "2"', () => {
  for (const acc of [bench, asli]) {
    const fixed = card(acc, 'soto 35rb eh bentar, 30rb ding')[0];
    assert.equal(fixed.amount, 30000); assert.equal(fixed.preset.description, 'Soto'); assert.equal(fixed.preset.merchant, undefined);
    assert.equal(card(acc, 'gorengan 18rb, koreksi jadi 15rb')[0].amount, 15000);
    assert.equal(card(acc, 'keluar sejeti beli tol')[0].amount, 1000000);
    const idr = card(acc, 'IDR 45.000 utk pertalite')[0];
    assert.equal(idr.amount, 45000); assert.ok(categoryNames(acc, idr.preset.categoryId, idr.preset.subcategoryId).includes('Transportasi'));
    const kopi = card(acc, 'ngopi2 35rb dri jenius')[0];
    assert.ok(categoryNames(acc, kopi.preset.categoryId, kopi.preset.subcategoryId).includes('Makan & Minum'));
  }
});

test('10.4: "sisihin 300rb ke rekening mandiri" sends the money to Mandiri', () => {
  for (const acc of [bench, asli]) {
    const r = parseQuickText('sisihin 300rb ke rekening mandiri', acc.quick);
    assert.equal(r.kind, 'transfer');
    assert.equal(acc.data.wallets.find(w => w.id === r.preset.destinationWalletId)?.name, 'Mandiri');
  }
});

test('10.4: questions — per day, a total without "berapa", "kpn terakhir", the dearest of a week', async () => {
  for (const acc of [bench, asli]) {
    assert.match(shown(await talk(acc, 'pekan ini makan minum per harinya rata2 brp')), /per hari/);
    const total = await talk(acc, 'total bayar pk jago bulan kemarin');
    assert.equal(total.intent, 'question'); assert.match(total.reply.text, /berapa$/);
    assert.equal((await talk(acc, 'kpn terakhir aku ngopi')).intent, 'question');
    assert.equal((await talk(acc, 'pekan lalu transaksi paling mahal apa')).reply.text, 'pengeluaran terbesar pekan lalu');
    // "pos pengeluaran terbesar" is a category, not one purchase.
    assert.notEqual(understand('pos pengeluaran terbesar minggu lalu'), 'pengeluaran terbesar minggu lalu');
  }
});

test('10.4: follow-ups — another wallet in place of the first, spans written short', async () => {
  for (const acc of [bench, asli]) {
    assert.equal((await talk(acc, 'saldo jago berapa', 'kalau gopay?')).reply.text, 'saldo gopay berapa');
    assert.equal((await talk(acc, 'brp duit jajan bln ini', 'trs kemaren gmn')).reply.text, 'brp duit jajan kemarin');
  }
});

test('10.4: not a record — enough for something, English chit-chat, advice and wishes', async () => {
  for (const acc of [bench, asli]) {
    assert.equal((await talk(acc, 'budget 80rb dapet kamera ga ya')).intent, 'afford');
    assert.notEqual((await talk(acc, 'kasih trik ngatur gaji dong')).intent, 'plan');
    assert.notEqual((await talk(acc, 'i want to buy a house next year')).intent, 'plan');
    // English without money words is no question about records.
    assert.notEqual(understand('is my budget ok'), 'budget ok berapa');
    assert.notEqual(understand('how are you'), 'how are you berapa');
  }
});

test('10.4: what the model reads — English pronouns left out, a word doubled with "2" read twice', () => {
  assert.equal(chatFeature('thank you'), 'makasih');
  assert.equal(chatFeature('check my budgets'), 'check budgets');
  assert.equal(chatFeature('tebak2an angka yuk'), 'tebak tebakan angka yuk');
  assert.equal(chatFeature('kopi 2rb'), 'kopi qnominal');
});
