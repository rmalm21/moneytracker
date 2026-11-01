import test from 'node:test';
import assert from 'node:assert/strict';
import { chatReply } from '../lib/chat/engine.ts';
import { withAmount } from '../lib/chat/draft.ts';
import { v3Ctx } from '../bench/v83/state.mjs';

// 8.4 — chat v4: context that carries over (the person, the amount first, the thing after, the record just answered,
// the list just shown, the period just asked) and everyday things.
const ctx = { ...v3Ctx, voice: 'santai' };
async function talk(...turns) {
  let memory = {}, r;
  for (const say of turns) { r = await chatReply(say, memory, ctx); memory = r.memory; }
  return r;
}
const said = r => r.reply.kind === 'say' ? [r.reply.title, r.reply.text, r.reply.hero && `${r.reply.hero.label} ${r.reply.hero.value}`, ...(r.reply.lines || []).map(l => `${l.label} ${l.value}`)].filter(Boolean).join(' ') : r.reply.text;
const card = r => r.reply.kind === 'plan' ? ctx.inspect(r.reply.text) : null;

test('8.4 "516rb piutang": a receivable, with the borrower asked and filled in the next message', async () => {
  const first = await talk('516rb piutang');
  assert.equal(card(first).kind, 'receivable_new');
  assert.equal(card(first).total, 516000);
  assert.equal(first.memory.asking.field, 'borrower');
  for (const [reply, who] of [['yudi', 'yudi'], ['yg minjem nia', 'nia'], ['ke om heru', 'heru']]) {
    const r = await talk('516rb piutang', reply), c = card(r);
    assert.equal(c.kind, 'receivable_new', reply);
    assert.equal(c.total, 516000, reply);
    assert.match(String(c.person).toLowerCase(), new RegExp(who), reply);
  }
  const debt = await talk('ngutang 60rb', 'ke bang ojan');
  assert.equal(card(debt).kind, 'debt_new');
  assert.match(String(card(debt).person).toLowerCase(), /ojan/);
});

test('8.4 a record started with nothing in it: the amount is kept until the thing comes', async () => {
  const start = await talk('catat pengeluaran');
  assert.equal(start.reply.kind, 'say');
  assert.ok(start.memory.start);
  const amount = await talk('catat pengeluaran', '1,2jt');
  assert.match(said(amount), /Rp1\.200\.000/);
  const done = await talk('catat pengeluaran', '1,2jt', 'bensin');
  assert.equal(card(done).kind, 'expense');
  assert.equal(card(done).total, 1200000);
  const income = await talk('catat pemasukan', 'freelance 750rb');
  assert.equal(card(income).kind, 'income');
  // A question in between is still a question.
  const asked = await talk('catat dong', 'saldo gopay berapa?');
  assert.notEqual(card(asked)?.reading, 'record');
});

test('8.4 an amount with a comma is one amount, as an answer and as an edit', async () => {
  assert.equal(card(await talk('tadi beli galon', '1,2jt')).total, 1200000);
  assert.equal(card(await talk('kopi 25rb', '1.250.000')).total, 1250000);
  assert.equal(withAmount('Tadi beli makan siang dong', '1,2jt'), 'Tadi beli makan siang dong 1,2jt');
});

test('8.4 a transfer finished in the next message', async () => {
  const to = card(await talk('transfer 300rb', 'ke gopay'));
  assert.equal(to.kind, 'transfer');
  assert.equal(to.total, 300000);
});

test('8.4 follow-ups to a spending total use its period', async () => {
  assert.match(said(await talk('pengeluaran bulan ini berapa', 'rinciannya dong')), /Tagihan[^]*Rp1\.900\.000/);
  assert.match(said(await talk('pengeluaran bulan ini berapa', 'yang paling besar apa?')), /Tagihan/);
  const compare = said(await talk('pengeluaran bulan ini berapa', 'dibanding sebelumnya gimana?'));
  assert.match(compare, /lebih hemat Rp205\.500 \(5%\)/);
  assert.match(compare, /1–15 Sep/);
  assert.match(said(await talk('pengeluaran minggu ini berapa', 'kenapa banyak banget')), /Tagihan[^]*Makan & Minum/);
  // The old follow-ups stay.
  assert.equal(card(await talk('pengeluaran makan bulan ini berapa', 'kalau transport?')).reading, 'question');
});

test('8.4 a short question about the record just answered', async () => {
  assert.match(said(await talk('dimas masih utang berapa', 'kapan bayarnya?')), /30 Okt/);
  assert.match(said(await talk('budi masih utang berapa', 'dia kapan bayar?')), /belum ada tanggal janji/);
  assert.match(said(await talk('cicilan hp sisa berapa', 'jatuh temponya kapan?')), /20 Okt/);
  assert.match(said(await talk('cicilan hp', 'sisa berapa bulan lagi')), /6 bulan/);
  assert.match(said(await talk('piutang sari berapa', 'udah lunas belum?')), /Belum lunas[^]*Rp50\.000/);
  assert.match(said(await talk('dimas masih utang berapa', 'buat apa dulu?')), /tiket konser/);
  // Something else is its own question.
  assert.doesNotMatch(said(await talk('piutang budi', 'kapan gajian')), /Budi/);
});

test('8.4 picking from the list just shown', async () => {
  assert.match(said(await talk('piutang aku siapa aja', 'yang paling lama siapa?')), /Dimas, sejak 28 Sep/);
  assert.match(said(await talk('piutang aku siapa aja', 'totalnya?')), /Rp400\.000/);
  assert.match(said(await talk('klaim kantor apa aja', 'yang paling gede')), /Bandung[^]*Rp420\.000/);
  assert.match(said(await talk('tagihan terdekat', 'berapa?')), /Rp55\.000/);
  // And the one picked can be asked about next.
  assert.match(said(await talk('piutang aku siapa aja', 'yang paling lama siapa?', 'dia kapan bayar?')), /30 Okt/);
});

test('8.4 everyday things', async () => {
  assert.match(said(await talk('tgl brp skrg')), /Kamis, 15 Oktober 2026/);
  assert.match(said(await talk('sekarang hari apa')), /Kamis/);
  assert.match(said(await chatReply('jam berapa sekarang', {}, { ...ctx, hour: 9, minute: 5 })), /jam 09\.05/);
  assert.match(said(await talk('pagi min')), /Selamat pagi/);
  assert.match(said(await talk('good morning')), /pagi/);
  assert.match(said(await talk('bisa export excel?')), /CSV/);
  assert.match(said(await talk('aku lupa pin')), /Lupa PIN\? Keluar & masuk lagi/);
  assert.equal(card(await talk('undo')).kind, 'tx_delete');
  const enough = await talk('gaji aku cukup ga');
  assert.notEqual(card(enough)?.reading, 'record');
  assert.match(said(enough), /gajian/);
  // Data questions that start the same way are still data questions.
  assert.match(said(await talk('hari apa aku paling boros')), /paling boros/);
});

import { trimSurface } from '../lib/chat/engine.ts';
test('8.4 (after the first held-out run) words around a message: "oke,", "kak", capitals', async () => {
  assert.equal(trimSurface('oke, fajar ngutang 2jt ke aku kak'), 'fajar ngutang 2jt ke aku');
  assert.equal(trimSurface('kak hutang 150k'), 'hutang 150k');
  assert.equal(trimSurface('KAK TF 200RB KE GOPAY DARI JAGO DEH'), 'tf 200rb ke gopay dari jago deh');
  // A name after "kak", a short reply and "ke kak" stay.
  for (const text of ['kak tio ngutang 25k', 'oke deh', 'boleh kak', 'pinjem ke kak']) assert.equal(trimSurface(text), text);
  const owed = card(await talk('oke, fajar ngutang 2jt ke aku kak'));
  assert.equal(owed.kind, 'receivable_new');
  assert.match(String(owed.person).toLowerCase(), /fajar/);
  const debt = await talk('kak hutang 150k', 'dari kevin');
  assert.equal(card(debt).kind, 'debt_new');
  assert.match(String(card(debt).person).toLowerCase(), /kevin/);
  assert.match(said(await talk('Kak saldo gopay berapa deh', 'kalau jago?')) + (await talk('Kak saldo gopay berapa deh', 'kalau jago?')).reply.text, /jago/);
});
test('8.4 (after the first held-out run) an amount alone asks what for; a thing without an amount asks how much', async () => {
  assert.match(said(await talk('45 ribu')), /Rp45\.000[^]*Buat apa/);
  assert.equal(card(await talk('45 ribu', 'bensin')).total, 45000);
  const fuel = card(await talk('barusan isi bensin', '45 ribu'));
  assert.equal(fuel.kind, 'expense');
  assert.equal(fuel.total, 45000);
  // Not for a "no", a question, or something that is not money.
  for (const text of ['datanya aman kan ga dikirim', 'makan jangan dulu', 'catatannya lembur', 'gas']) assert.notEqual((await talk(text)).memory.start?.item, text, text);
});

import { parseQuickPlan } from '../lib/quick-plan.ts';
test('8.4 a borrower named after "piutang" / "dipinjem" is sure: the card does not ask again', () => {
  for (const text of ['516rb piutang ke yudi', '516rb dipinjem yudi']) {
    const a = parseQuickPlan(text, ctx.quick).actions[0];
    assert.equal(a.result.person, 'Yudi', text);
    assert.equal(a.fields.person.status, 'verified', text);
  }
});

test('8.4 a card still waiting does not block follow-ups to a list, a record, the date or a new record', async () => {
  assert.match(said(await talk('516rb piutang', 'yudi', 'piutang aku siapa aja', 'yang paling lama siapa?')), /Dimas, sejak 28 Sep/);
  assert.match(said(await talk('kopi 25rb', 'piutang aku siapa aja', 'yang paling lama siapa?', 'dia kapan bayar?')), /30 Okt/);
  assert.match(said(await talk('kopi 25rb', 'tgl brp skrg')), /15 Oktober/);
  assert.equal(card(await talk('kopi 25rb', 'catat pengeluaran', '40rb', 'laundry')).total, 40000);
  // The card is still there to edit.
  assert.equal(card(await talk('kopi 25rb', 'tgl brp skrg', 'jadi 30rb')).total, 30000);
});

test('8.4 with a card waiting, a new thing without an amount starts a new record, and a bare amount still edits the card', async () => {
  const fuel = card(await talk('makan siang 30rb', 'barusan isi bensin', '45 ribu'));
  assert.equal(fuel.subcategoryId, 'expense.transportasi.bensin');
  assert.equal(fuel.total, 45000);
  assert.equal(card(await talk('makan siang 30rb', '45 ribu')).total, 45000);
});
