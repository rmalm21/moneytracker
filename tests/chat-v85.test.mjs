import test from 'node:test';
import assert from 'node:assert/strict';
import { chatReply } from '../lib/chat/engine.ts';
import { debtPerson } from '../lib/chat/answers.ts';
import { inspect } from '../lib/chat/inspect.ts';
import { v3Ctx } from '../bench/v83/state.mjs';

// 8.5 — chat memory past one message: the record, the list and the question answered lately are still meant after
// light talk ("makasih", "wkwk"), and "dia" is also the person a debt is owed to. Catat otomatis knows the same debts
// and receivables as the chat here, as in the app.
const d = v3Ctx.data;
const quick = { ...v3Ctx.quick, debts: d.debts.map(x => ({ id: x.id, name: x.name, provider: x.provider, outstandingAmount: x.outstandingAmount })), receivables: d.receivables.map(r => ({ id: r.id, person: r.person, description: r.description, remainingAmount: r.remainingAmount, date: r.date, originalAmount: r.originalAmount })) };
const ctx = { ...v3Ctx, quick, inspect: t => inspect(t, quick), voice: 'santai' };
async function talk(...turns) {
  let memory = {}, r;
  for (const say of turns) { r = await chatReply(say, memory, ctx); memory = r.memory; }
  return r;
}
const said = r => r.reply.kind === 'say' ? [r.reply.title, r.reply.text].filter(Boolean).join(' ') : r.reply.text;
const card = r => r.reply.kind === 'plan' ? ctx.inspect(r.reply.text) : null;

test('8.5 the record answered is still meant after light talk, up to three messages on', async () => {
  const r = await talk('piutang aku siapa aja', 'yang paling lama siapa?', 'makasih', 'dia kapan bayar?');
  assert.match(said(r), /Dimas janji bayar/);
  const wk = await talk('budi masih utang berapa', 'wkwk', 'udah lunas belum?');
  assert.match(said(wk), /Belum lunas\. Budi/);
  // A new question in between changes the subject: "berapa?" is not about Budi any more.
  const moved = await talk('budi masih utang berapa', 'pengeluaran bulan ini berapa', 'udah lunas belum?');
  assert.doesNotMatch(said(moved), /Budi/);
  // Too long ago: four light messages on, it is not meant any more.
  const old = await talk('budi masih utang berapa', 'makasih', 'wkwk', 'oke', 'udah lunas belum?');
  assert.doesNotMatch(said(old), /Belum lunas\. Budi/);
});

test('8.5 the list stays while its records are talked about; "totalnya?" is the whole list', async () => {
  const r = await talk('piutang aku siapa aja', 'yang paling lama siapa?', 'dia kapan bayar?', 'kalau yang paling besar?');
  assert.match(said(r), /Yang paling besar Dimas/);
  const total = await talk('piutang aku siapa aja', 'yang paling lama siapa?', 'dia kapan bayar?', 'totalnya?');
  assert.match(said(total), /Totalnya Rp400\.000 dari 3 piutang/);
});

test('8.5 a question is still meant after "makasih": "rinciannya dong"', async () => {
  const r = await talk('pengeluaran bulan ini berapa', 'makasih', 'rinciannya dong');
  assert.match(said(r), /Rincian pengeluaran bulan ini/);
  const after = await talk('pengeluaran bulan ini berapa', 'makasih', 'kalau bulan lalu?', 'wkwk', 'yang paling besar apa?');
  assert.match(said(after), /bulan lalu/i);
});

test('8.5 "dia" is the person a debt is owed to, also inside a record ("bayar ke dia 500rb")', async () => {
  const when = await talk('utang ke kak rina sisa berapa', 'oke', 'dia kapan harus dibayar?');
  assert.match(said(when), /Pinjaman Kak Rina/);
  const pay = await talk('utang ke kak rina sisa berapa', 'pengeluaran minggu ini', 'bayar ke dia 500rb pake jago');
  assert.equal(card(pay).kind, 'debt_payment');
  assert.equal(card(pay).total, 500000);
  const more = await talk('utang ke kak rina sisa berapa', 'dia ngasih pinjaman lagi 300rb');
  assert.equal(card(more).kind, 'debt_new');
  assert.match(String(card(more).person), /Kak Rina/);
  const back = await talk('budi masih utang berapa', 'oke', 'dia bayar 50rb ke jago');
  assert.equal(card(back).kind, 'receivable_payment');
  assert.match(String(card(back).person), /Budi/);
  // A lender is not "dia": after Cicilan HP (Kredivo) the person talked about before stays.
  assert.equal(debtPerson({ name: 'Cicilan HP', provider: 'Kredivo' }), '');
  assert.equal(debtPerson({ name: 'Pinjaman Kak Rina', provider: 'Kak Rina' }), 'kak rina');
  assert.equal(debtPerson({ name: 'Utang ke Bowo', provider: '' }), 'bowo');
  assert.equal(debtPerson({ name: 'KPR', provider: 'BTN' }), '');
});

test('8.5 a word naming another kind of record is not about the one answered', async () => {
  const r = await talk('utang ke kak rina sisa berapa', 'piutangnya berapa');
  assert.doesNotMatch(said(r), /Pinjaman Kak Rina/);
});
