// Catat otomatis V2.5: relations between actions, money vs. relationship, minimal clarification (spec 107–127),
// plus paraphrases so the rules are not tied to one sentence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { ctx } from '../bench/quick/fixtures-v25.mjs';

const plan = text => parseQuickPlan(text, ctx);
const rows = text => plan(text).actions.map(a => ({ kind: a.result.kind, amount: a.result.amount, wallet: a.result.preset.walletId || null, to: a.result.preset.destinationWalletId || null, date: a.result.preset.date || a.result.date, person: a.result.person || null }));
const KEMARIN = '2026-09-25';

test('107 mixed: two expenses and a transfer, each with its own wallet', () => {
  assert.deepEqual(rows('makan 25rb pake Jago, parkir 5rb cash, transfer 100rb dari Jenius ke Mandiri').map(r => [r.kind, r.amount, r.wallet, r.to]),
    [['expense', 25000, 'jago', null], ['expense', 5000, 'cash', null], ['transfer', 100000, 'jenius', 'mandiri']]);
});
test('108 "dua-duanya kemarin" dates both and is not an action', () => {
  const p = plan('makan 25rb dan parkir 5rb, dua-duanya kemarin');
  assert.deepEqual(p.actions.map(a => a.result.date), [KEMARIN, KEMARIN]);
  assert.equal(p.relations.filter(r => r.type === 'shared_date').length, 2);
});
test('109 local override: "tapi makan cash" changes only makan', () => {
  assert.deepEqual(rows('makan 25rb dan parkir 5rb pake Jago, tapi makan cash').map(r => r.wallet), ['cash', 'jago']);
});
test('110 the later amount wins and the correction is kept as provenance', () => {
  const p = plan('makan 30rb eh 35rb');
  assert.equal(p.actions[0].result.amount, 35000);
  assert.ok(p.relations.some(r => r.type === 'correction_of' && /30rb.*35rb/.test(r.note)));
});
test('111 "bukan pengeluaran, transfer dari Jago" turns it into one transfer', () => {
  assert.deepEqual(rows('100rb ke Mandiri, eh bukan pengeluaran, transfer dari Jago').map(r => [r.kind, r.amount, r.wallet, r.to]), [['transfer', 100000, 'jago', 'mandiri']]);
});
test('112 "eh ga jadi" leaves nothing to save', () => {
  for (const text of ['makan 25rb, eh ga jadi', 'catat parkir 5rb, ga jadi deh', 'transfer 50rb dari jago ke bca, eh gak jadi']) {
    const p = plan(text);
    assert.equal(p.actions.length, 0, text); assert.equal(p.cancelled.length, 1, text);
  }
  assert.deepEqual(rows('makan 25rb, parkir 5rb, yang parkir ga jadi').map(r => r.amount), [25000]);
});
test('113 "yang bensin pake Mandiri" gives Mandiri to bensin only', () => {
  const r = rows('makan 25rb sama bensin 80rb. yang bensin pake Mandiri');
  assert.equal(r[1].wallet, 'mandiri'); assert.notEqual(r[0].wallet, 'mandiri');
});
test('114 ordinal references', () => {
  assert.deepEqual(rows('makan 25rb sama parkir 5rb. yang pertama Jago, yang kedua cash').map(r => r.wallet), ['jago', 'cash']);
});
test('115/116 lending direction, with paraphrases', () => {
  for (const t of ['Budi minjemin aku 100rb', 'gue minjem 100rb dari Budi', 'dipinjemin Budi 100rb']) assert.deepEqual(rows(t).map(r => [r.kind, r.person]), [['debt_new', 'Budi']], t);
  for (const t of ['aku minjemin Budi 100rb', 'gue kasih pinjem Budi 100rb', 'ngasih pinjaman ke Budi 100rb']) assert.deepEqual(rows(t).map(r => [r.kind, r.person]), [['receivable_new', 'Budi']], t);
});
test('117 talangan + "dia utang ke gue" is one money movement and one receivable', () => {
  for (const t of ['gue talangin Aldi makan 40rb pake Jago, catat dia utang ke gue', 'bayarin makan Aldi 40rb pake Jago, jadi dia utang ke gue', 'talangin Aldi 40rb, jadi Aldi utang gue 40rb']) {
    const p = plan(t);
    assert.deepEqual(p.actions.map(a => [a.result.kind, a.result.amount, a.result.person]), [['receivable_new', 40000, 'Aldi']], t);
  }
  assert.ok(plan('talangin Aldi 40rb, jadi Aldi utang gue 40rb').relations.some(r => r.type === 'consequence_of'));
  for (const t of ['Budi gue bayarin dulu 40k', '40rb gue talangin buat Rani', 'bayarin Budi dulu 40rb']) assert.equal(rows(t)[0].kind, 'receivable_new', t);
});
test('118/119 debt matching: the named debt, never the other; unclear → asked', () => {
  const sure = plan('bayar utang motor 500rb').actions[0];
  assert.equal(sure.result.preset.debtId, 'dm');
  const open = plan('bayar utang 500rb').actions[0];
  assert.equal(open.result.preset.debtId, undefined);
  assert.equal(open.ask?.field, 'link');
  assert.match(open.ask.question, /Utang Motor atau Utang Laptop/);
  // A debt's name word with other words and no debt word is spending, not a payment of that debt.
  assert.equal(plan('udah bayar servis motor 300rb').actions[0].result.kind, 'expense');
});
test('120 a claim paid out matches the claim by its name', () => {
  const a = plan('claim makan kemarin cair 120rb').actions[0];
  assert.equal(a.result.kind, 'claim_payment'); assert.equal(a.result.preset.claimId, 'cm');
  assert.equal(plan('claim cair 120rb').actions[0].ask?.field, 'link');
});
test('121 transfer without a source asks only for the source and keeps the rest', () => {
  const a = plan('transfer 100rb ke Jago').actions[0];
  assert.equal(a.result.preset.walletId, undefined);
  assert.equal(a.result.preset.destinationWalletId, 'jago');
  assert.deepEqual(a.ask, { field: 'wallet', question: 'Rp100.000 ke Jago dari dompet mana?', choices: ctx.wallets.map(w => w.id).filter(id => id !== 'jago') });
});
test('122 "senin kemarin" resolves and keeps its words', () => {
  const a = plan('bensin 80rb senin kemarin').actions[0];
  assert.equal(a.result.date, '2026-09-21'); assert.match(a.fields.date.note, /senin kemarin/);
});
test('123 money slang', () => {
  const amount = t => plan(t).actions[0].result.amount;
  assert.deepEqual(['beli tas 1.5jt', 'beli tas 1,5jt', 'beli kaos 350rbu', 'beli hp 1500k', 'beli kulkas 2jt200', 'beli tv 2jt5', 'beli lemari 2 juta 200'].map(amount), [1_500_000, 1_500_000, 350_000, 1_500_000, 2_200_000, 2_500_000, 2_200_000]);
});
test('124 numbers that are not money', () => {
  const a = plan('makan 2 orang jam 7 malam 50rb').actions[0];
  assert.equal(a.result.amount, 50000); assert.equal(a.result.preset.time, '19:00');
  assert.equal(plan('2 kopi 20rb').actions[0].result.amount, 20000);
  const each = plan('2 kopi masing-masing 20rb').actions[0];
  assert.equal(each.result.amount, 40000); assert.equal(each.fields.amount.status, 'likely');
});
test('125–127 future, reminder and recurring are not spending done', () => {
  assert.equal(plan('besok beli bensin 100rb').actions[0].result.kind, 'plan_new');
  assert.equal(plan('mau bayar servis motor 300rb').actions[0].result.kind, 'plan_new');
  assert.notEqual(plan('ingetin besok bayar wifi 121rb').actions[0].result.kind, 'expense');
  assert.equal(plan('setiap tanggal 5 spotify 30rb').actions[0].result.kind, 'recurring_new');
});
test('scoped corrections change only the entry they name', () => {
  assert.deepEqual(rows('makan 25rb dan bensin 80rb, yang bensin 75 ternyata').map(r => r.amount), [25000, 75000]);
  assert.deepEqual(rows('kopi 20rb terus parkir 5rb, eh parkirnya 4rb').map(r => r.amount), [20000, 4000]);
});
test('context does not leak: a salary wallet stays with the salary', () => {
  assert.deepEqual(rows('gaji 6jt masuk Jenius, terus makan 25rb').map(r => r.wallet), ['jenius', null]);
});
test('"yang tadi" with two entries before it is asked, not guessed', () => {
  const p = plan('makan 25rb dan bensin 80rb, yang tadi pake jago');
  assert.ok(p.actions.every(a => a.fields.wallet?.status === 'check'));
  assert.ok(p.unresolved.some(u => /makan atau bensin/.test(u)));
});
test('a date at the end of a "sama" pair covers both', () => {
  assert.deepEqual(rows('makan 25rb sama parkir 5rb kemarin').map(r => r.date), [KEMARIN, KEMARIN]);
  assert.deepEqual(rows('makan kemarin 25rb, parkir tadi pagi 5rb').map(r => r.date), [KEMARIN, '2026-09-26']);
});
test('a transfer fee stays separate from the amount', () => {
  const a = plan('transfer 100rb dari jago ke mandiri kena admin 2.500').actions[0];
  assert.equal(a.result.amount, 100000); assert.equal(a.result.preset.transferFee, 2500);
});
test('"Budi 100rb" and "saldo 500rb" ask for the one missing thing', () => {
  assert.equal(plan('Budi 100rb').actions[0].ask?.field, 'kind');
  const b = plan('saldo 500rb').actions[0];
  assert.equal(b.result.kind, 'balance'); assert.equal(b.ask?.field, 'wallet');
});
test('simple sentences stay simple: no question, no relation, fast', () => {
  for (const t of ['makan 25rb pake Jago', 'gaji 6jt', 'bensin 80rb pake Jago']) {
    const started = performance.now(), p = plan(t);
    assert.equal(p.actions.length, 1, t); assert.equal(p.actions[0].ask, undefined, t);
    assert.ok(performance.now() - started < 200, t);
  }
});
test('the trace says what happened, step by step', () => {
  const p = plan('makan 25rb dan bensin 80rb, yang bensin pake Mandiri, dua-duanya kemarin');
  assert.ok(p.trace.some(l => l.startsWith('klausa:')));
  assert.ok(p.relations.some(r => r.type === 'refers_to' && r.to === p.actions[1].id));
  assert.deepEqual(p.actions.map(a => a.result.date), [KEMARIN, KEMARIN]);
});
