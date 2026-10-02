import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { readRelation } from '../lib/catat/relations.ts';
import { catchRelationBugs, catchSegmentBugs } from '../lib/catat/bug-catcher.ts';
import { ctx } from '../bench/quick/fixtures-v32dev.mjs';

const T = '2026-10-15', Y = '2026-10-14';
const plan = text => parseQuickPlan(text, ctx);
const one = text => { const p = plan(text); assert.equal(p.actions.length, 1, `${text}: ${p.actions.length} aksi`); return p.actions[0]; };

test('V3.2 required: "atuy ngutang 12k" → piutang Atuy (Atuy berutang ke kamu)', () => {
  const a = one('atuy ngutang 12k');
  assert.equal(a.result.kind, 'receivable_new'); assert.equal(a.result.person, 'Atuy'); assert.equal(a.result.amount, 12000);
  assert.equal(a.relation.node.debtor, 'Atuy'); assert.equal(a.relation.node.creditor, 'user');
  assert.ok(a.evidence.some(e => /Atuy dikenali sebagai orang yang berutang karena namanya muncul sebelum kata “ngutang”/.test(e)));
  assert.equal(a.review, false);
});

test('V3.2 required: "atuy ngutang 12k buat ngedate" → purpose Ngedate, never the person', () => {
  const a = one('atuy ngutang 12k buat ngedate');
  assert.equal(a.result.kind, 'receivable_new'); assert.equal(a.result.person, 'Atuy'); assert.equal(a.result.purpose, 'Ngedate');
  assert.equal(a.result.preset.description, 'Ngedate');
  assert.equal(a.fields.purpose.status, 'likely');
  assert.ok(a.checks.some(c => c.code === 'PERSON_SWALLOWED_BY_PURPOSE'), 'the V3.1 reading put "Ngedate" in the person');
});

test('V3.2 required: dates attach to the relationship ("atuy ngutang 12k kmrn", "kmrn atuy bayar utang 12k")', () => {
  const a = one('atuy ngutang 12k kmrn');
  assert.equal(a.result.kind, 'receivable_new'); assert.equal(a.result.date, Y);
  const b = one('kmrn atuy bayar utang 12k');
  assert.equal(b.result.kind, 'receivable_payment'); assert.equal(b.result.person, 'Atuy'); assert.equal(b.result.date, Y);
  assert.ok(b.checks.some(c => c.code === 'REPAYMENT_AS_NEW_RECEIVABLE'), 'V3.1 read it as paying your own debt');
  // No receivable of Atuy on record: not linked to someone else's, and said so.
  assert.equal(b.result.preset.receivableId, undefined); assert.equal(b.fields.link.status, 'missing');
});

test('V3.2 required: "gue ngutang 12k ke aldi" / "ngutang 12k ke aldi" → utang ke Aldi', () => {
  for (const text of ['gue ngutang 12k ke aldi', 'ngutang 12k ke aldi']) {
    const a = one(text);
    assert.equal(a.result.kind, 'debt_new', text); assert.equal(a.result.person, 'Aldi', text); assert.equal(a.relation.node.debtor, 'user');
  }
  assert.equal(one('gue ngutang 12k ke aldi').relation.subject.party, 'user');
  assert.equal(one('ngutang 12k ke aldi').relation.subject.implicit, true);
});

test('V3.2 required: "ngutang ke aldi" asks only the amount', () => {
  const a = one('ngutang ke aldi');
  assert.equal(a.result.kind, 'debt_new'); assert.equal(a.result.person, 'Aldi'); assert.equal(a.ask.field, 'amount');
  assert.equal(a.fields.person.status, 'verified');
});

test('V3.2 required: three actions without joining words, each with its own date', () => {
  const p = plan('ayam dbesto 13k kmrin parkir 2k di kantor hri ini atuy bayar utang 12k');
  assert.equal(p.actions.length, 3);
  const [x, y, z] = p.actions.map(a => a.result);
  assert.deepEqual([x.kind, x.amount, x.preset.description, x.preset.merchant, x.date], ['expense', 13000, 'Ayam', "D'Besto", Y]);
  assert.deepEqual([y.kind, y.amount, y.preset.description, y.preset.merchant, y.date], ['expense', 2000, 'Parkir', 'Kantor', T]);
  assert.deepEqual([z.kind, z.amount, z.person, z.date], ['receivable_payment', 12000, 'Atuy', T]);
  assert.ok(p.trace.some(t => /dipotong sebelum “parkir”/.test(t)) && p.trace.some(t => /dipotong sebelum “atuy”/.test(t)));
});

test('V3.2 direction: minjem / minjemin / possession / third party', () => {
  const cases = [
    ['gue minjem dari budi 50k', 'debt_new'], ['budi minjem 50k', 'receivable_new'], ['gue minjemin budi 50k', 'receivable_new'],
    ['budi minjemin gue 50k', 'debt_new'], ['utang gue ke budi 12k', 'debt_new'], ['utang atuy ke gue 12k', 'receivable_new'],
  ];
  for (const [text, kind] of cases) assert.equal(one(text).result.kind, kind, text);
  const third = plan('atuy ngutang 12k ke aldi');
  assert.equal(third.actions.length, 0);
  assert.ok(third.warnings.some(w => /utang Atuy ke Aldi, bukan utang atau piutangmu/.test(w)));
  const fromWallet = one('atuy ngutang 12k dari jago');
  assert.equal(fromWallet.result.kind, 'receivable_new'); assert.equal(fromWallet.result.preset.walletId, 'jago'); assert.equal(fromWallet.result.person, 'Atuy');
});

test('V3.2 repayment links only when safe: one record → linked, several → asked, never a new debt', () => {
  const s = one('sinta bayar utang 50k');
  assert.equal(s.result.kind, 'receivable_payment'); assert.equal(s.result.preset.receivableId, 'r1');
  const d = one('dina bayar utang 20k');
  assert.equal(d.result.kind, 'receivable_payment'); assert.equal(d.result.preset.receivableId, undefined);
  assert.equal(d.ask.field, 'link'); assert.deepEqual(d.ask.choices, ['r2', 'r3']);
  const g = one('gue bayar utang ke aldi 20k');
  assert.equal(g.result.kind, 'debt_payment'); assert.equal(g.result.preset.debtId, 'd2');
});

test('V3.2 segmentation: splits on anchors, never on charges, counts or purpose', () => {
  const kinds = text => plan(text).actions.map(a => [a.result.kind, a.result.amount, a.result.preset.walletId || '', a.result.person || '', a.result.date]);
  assert.deepEqual(kinds('kopi 20k jago bensin 80k krom'), [['expense', 20000, 'jago', '', T], ['expense', 80000, 'krom', '', T]]);
  assert.deepEqual(kinds('makan 25k parkir 3k').map(x => x[1]), [25000, 3000]);
  assert.deepEqual(kinds('atuy ngutang 12k budi ngutang 20k').map(x => x[3]), ['Atuy', 'Budi']);
  assert.deepEqual(kinds('atuy bayar utang 12k budi bayar utang 5k').map(x => x[0]), ['receivable_payment', 'receivable_payment']);
  assert.deepEqual(kinds('kmrn kopi 20k hari ini bensin 80k').map(x => x[4]), [Y, T]);
  assert.equal(plan('makan 100k pajak 10k').actions.length, 1);
  assert.equal(plan('beli 2 ayam 20k').actions.length, 1);
  assert.equal(plan('atuy ngutang 12k buat makan').actions.length, 1);
});

test('V3.2 pronouns, corrections and negations', () => {
  const p = plan('atuy ngutang 12k terus dia bayar 5k');
  assert.deepEqual(p.actions.map(a => [a.result.kind, a.result.person]), [['receivable_new', 'Atuy'], ['receivable_payment', 'Atuy']]);
  const lone = one('dia ngutang 12k');
  assert.equal(lone.result.kind, 'receivable_new'); assert.equal(lone.fields.person.status, 'missing');
  assert.equal(one('atuy ngutang 12k eh 15k').result.amount, 15000);
  assert.equal(one('atuy ngutang 12k eh budi').result.person, 'Budi');
  assert.equal(one('gue ngutang ke aldi eh ke budi 20k').result.person, 'Budi');
  assert.equal(one('bukan atuy, budi ngutang 12k').result.person, 'Budi');
  const neg = one('atuy bukan ngutang, dia bayar utang 12k');
  assert.deepEqual([neg.result.kind, neg.result.person], ['receivable_payment', 'Atuy']);
});

test('V3.2 Bug Catcher: relationship classes', () => {
  const rel = text => readRelation(text, ctx);
  const codes = (before, text) => catchRelationBugs(before, rel(text)).map(w => w.code);
  assert.ok(codes({ kind: 'debt_new' }, 'aku bayar utang ke aldi 12k').includes('REPAYMENT_AS_NEW_DEBT'));
  assert.ok(codes({ kind: 'receivable_new' }, 'atuy bayar utang 12k').includes('REPAYMENT_AS_NEW_RECEIVABLE'));
  assert.ok(codes({ kind: 'debt_new', person: 'Atuy' }, 'atuy ngutang 12k').includes('THIRD_PERSON_SUBJECT_IGNORED'));
  assert.ok(codes({ kind: 'receivable_new' }, 'aku ngutang 12k ke aldi').includes('USER_SUBJECT_IGNORED'));
  assert.ok(codes({ kind: 'receivable_new', person: 'Aku' }, 'aku ngutang 12k ke aldi').includes('USER_SUBJECT_IGNORED'));
  assert.ok(codes({ kind: 'debt_new' }, 'ngutang 12k ke aldi').length === 0);
  assert.ok(codes({ kind: 'receivable_new', person: 'Aldi' }, 'ngutang 12k ke aldi').includes('DEBT_RECEIVABLE_DIRECTION_MISMATCH'));
  assert.ok(codes({ kind: 'expense' }, 'atuy ngutang 12k').includes('SUBJECT_DIRECTION_MISMATCH'));
  assert.ok(codes({ kind: 'receivable_new', person: 'Ngedate' }, 'atuy ngutang 12k buat ngedate').includes('PERSON_SWALLOWED_BY_PURPOSE'));
  assert.ok(codes({ kind: 'receivable_new', person: 'Ngedate', description: 'Atuy' }, 'atuy ngutang 12k buat ngedate').includes('PURPOSE_SWALLOWED_BY_PERSON'));
  assert.equal(rel('pinjam 500rb'), null, 'nothing to add: the grammar reading stands');
  assert.equal(rel('atuy ngutang 12k ke aldi').thirdParty, true);
});

test('V3.2 Bug Catcher: unsplit multi-action classes', () => {
  const codes = catchSegmentBugs('kopi 20k bensin 80k', 'Kopi Bensin', 2, 2).map(w => w.code);
  assert.deepEqual(codes, ['MULTIPLE_FINANCIAL_ANCHORS_IN_ONE_ACTION', 'LIKELY_UNSPLIT_MULTI_ACTION']);
  assert.deepEqual(catchSegmentBugs('makan 100k pajak 10k', 'Makan Pajak', 2, 1), []);
});

test('V3.2 one money movement per lend/repay (no duplicate money)', () => {
  for (const text of ['atuy ngutang 12k buat makan', 'atuy bayar utang 12k', 'gue minjemin budi 50k dari jago']) {
    const amounts = plan(text).actions.map(a => a.result.amount);
    assert.equal(amounts.length, 1, text);
  }
});
