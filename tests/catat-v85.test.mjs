import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { v3Ctx } from '../bench/v83/state.mjs';

// 8.5 — names said with a word of address, and the loan said by the lender.
const ctx = v3Ctx.quick;
const read = text => { const a = parseQuickPlan(text, ctx).actions[0]; return { kind: a.result.kind, person: a.result.person, name: a.result.name, desc: a.result.preset.description, merchant: a.result.preset.merchant, record: a.result.preset.receivableId || a.result.preset.debtId || '' }; };

test('8.5 a word of address and a name are one person, shown whole', () => {
  assert.equal(read('kasbon pak rt 300rb').person, 'Pak RT');
  assert.equal(read('td dipinjem mas agus 50rb').person, 'Mas Agus');
  assert.equal(read('bu ani pinjem 100rb').person, 'Bu Ani');
  const om = read('pinjem 1jt ke om heru');
  assert.equal(om.person, 'Om Heru');
  assert.equal(om.name, 'Pinjaman Om Heru');
  assert.equal(read('minjem ke bu kos 500rb').person, 'Bu Kos');
  // The word of address no longer ends up in the description.
  assert.equal(read('bu ani pinjem 100rb').desc, undefined);
});
test('8.5 someone with a record keeps the record\'s name; a word of address alone stays a person', () => {
  const sinta = read('pak sinta bayar 100rb');
  assert.equal(sinta.kind, 'receivable_payment');
  assert.equal(sinta.record, 'r1');
  assert.equal(sinta.person, 'Sinta');
  assert.equal(read('kirim 50rb ke kak dina').person, 'Dina');
  assert.equal(read('mama pinjem 100rb').person, 'Mama');
  assert.equal(read('pinjem ke ibu 200rb').person, 'Ibu');
});
test('8.5 a place named after someone, gold and tea are not people', () => {
  assert.equal(read('beli mas antam 1jt').desc, 'Mas Antam');
  assert.equal(read('teh pucuk 5rb').desc, 'Teh Pucuk');
  assert.equal(read('sate di pak kumis kemarin 30rb').person, undefined);
});
test('8.5 "hen ngasih pinjaman 100rb" is a loan to the user, with or without a word of address', () => {
  for (const [text, who] of [['hen ngasih pinjaman 100rb', 'Hen'], ['om hen ngasih pinjaman 100rb', 'Om Hen']]) {
    const r = read(text);
    assert.equal(r.kind, 'debt_new', text);
    assert.equal(r.person, who, text);
  }
  // Money sent by someone is still money in.
  assert.equal(read('dika transfer 100rb').kind, 'income');
});
