import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeInsightV3 } from '../lib/insight-v3/index.ts';
import { ask } from '../lib/insight-v3/ask.ts';
import { briefView, cashflowView, changesView, dataView, explainView, firstSentence, heroView, priorityView, progressView, questionsView } from '../lib/insight-v3/view.ts';
import { money, moneyFull, percent, signedMoney, signedPercent } from '../lib/insight-v3/format.ts';
import { cases } from '../bench/insight/cases.mjs';
import { addDays, makeUser } from '../bench/insight/scenarios.mjs';

const run = (id, edit) => { const { input } = makeUser(cases.find(c => c.id === id).options); edit?.(input); return { input, r: analyzeInsightV3(input) }; };
const claim = (id, amount, d) => ({ id, name: 'Dinas', amount, remainingAmount: amount, sourceWalletId: 'bca', submissionDate: d, expectedPaymentDate: '', paidDate: '', status: 'submitted', description: '', notes: '' });
const ids = ['stable', 'delivery-frequency', 'goals-pressure', 'claims-aging', 'debt-paydown', 'budget-pressure', 'new-user', 'income-drop'];
const jargon = /\b(tekanan|momentum|likuiditas|regime|MAD|p75|z-score|baseline|driver)\b/i;

test('format: short in summaries, full in details, Indonesian decimals', () => {
  assert.equal(moneyFull(12_500_000), 'Rp12.500.000');
  assert.equal(money(12_500_000), 'Rp12,5 jt');
  assert.equal(money(870_000), 'Rp870 rb');
  assert.equal(money(-870_000).startsWith('−'), true);
  assert.equal(signedMoney(363_000), '+Rp363 rb');
  assert.equal(percent(0.17), '17%');
  assert.equal(percent(0.069, 1), '6,9%');
  assert.equal(signedPercent(-0.2), '−20%');
});

test('first sentence never cuts inside a rupiah amount', () => {
  assert.equal(firstSentence('Dari Rp12.000.000 menjadi Rp6.000.000. Bagus.'), 'Dari Rp12.000.000 menjadi Rp6.000.000.');
  assert.equal(firstSentence('Tanpa titik'), 'Tanpa titik');
});

test('hero: one score, one direction, at most two things to watch, plain words only', () => {
  for (const id of ids) {
    const { r } = run(id), h = heroView(r);
    assert.equal(h.score, r.v25.hero.score, id);
    assert.ok(h.watch.length <= 2, id);
    assert.ok(['Sehat', 'Cukup sehat', 'Perlu perhatian', 'Rawan'].includes(h.label), id);
    const visible = [h.statement, h.momentum.label, h.momentum.line, ...h.watch.map(w => w.label), ...h.allPressures.map(p => `${p.label} ${p.levelText}`)].join(' ');
    assert.doesNotMatch(visible, jargon, `${id}: ${visible}`);
  }
});

test('stable finances are quiet', () => {
  const { r } = run('stable');
  assert.equal(heroView(r).statement, 'Keuangan relatif stabil.');
  assert.equal(changesView(r).top.length, 0);
  assert.equal(changesView(r).quiet, true);
});

test('what changed: max 3 with one badge each; priority: max 3 and never repeats a story shown above', () => {
  for (const id of ids) {
    const { r } = run(id), ch = changesView(r), pv = priorityView(r);
    assert.ok(ch.top.length <= 3, id);
    for (const c of ch.top) { assert.ok(c.title && c.driver, id); assert.ok(!c.badge || typeof c.badge === 'string', id); assert.doesNotMatch(c.driver, /Rp\d+\.$/, `${id}: cut amount "${c.driver}"`); }
    assert.ok(pv.top.length <= 3, id);
    const shown = new Set(ch.top.map(c => c.signature));
    for (const p of pv.top) { assert.ok(!shown.has(p.signature), `${id}: ${p.title} repeated`); assert.ok(p.pinKey, id); assert.doesNotMatch(p.why, /Rp\d+\.$/, `${id}: cut amount "${p.why}"`); }
    const prog = progressView(r, r.v25.context.today || addDays('2026-01-01', 0), shown);
    for (const p of prog.top) assert.ok(!shown.has(p.key), `${id}: progress repeats ${p.title}`);
  }
});

test('pinning works for signal rows too (not only advisor findings)', () => {
  const { r } = run('goals-pressure');
  const pv = priorityView(r, { limit: 99 });
  if (pv.top.length < 2) return;
  const last = pv.top[pv.top.length - 1];
  assert.equal(priorityView(r, { pinned: [last.pinKey], limit: 99 }).top[0].signature, last.signature);
});

test('brief: 2–4 lines, plain words', () => {
  for (const id of ids) {
    const lines = briefView(analyzeInsightV3(makeUser(cases.find(c => c.id === id).options).input));
    assert.ok(lines.length <= 4, id);
    for (const l of lines) assert.doesNotMatch(l.text, /tekanan utama/i, id);
  }
});

test('Ask suggestions fit the data and are all understood by the unchanged Ask engine', () => {
  const plain = run('stable');
  assert.ok(!questionsView(plain.r).some(q => /klaim/i.test(q)), 'no claims question without claims');
  const withClaim = run('stable', input => input.data.claims.push(claim('c1', 1_400_000, addDays(input.today, -5))));
  assert.ok(questionsView(withClaim.r).some(q => /klaim/i.test(q)));
  for (const id of ids) {
    const { r } = run(id), qs = questionsView(r);
    assert.ok(qs.length >= 3 && qs.length <= 4, `${id}: ${qs.length}`);
    for (const q of qs) { assert.doesNotMatch(q, /\bgue\b/i, q); assert.notEqual(ask(q, r).intent, 'UNKNOWN', `${id}: "${q}" not understood`); }
  }
  assert.equal(ask('siapa presiden indonesia', plain.r).intent, 'UNKNOWN');
});

test('cashflow answers "safe until payday?" first; claim cases are labelled', () => {
  for (const id of ids) {
    const { r } = run(id), c = cashflowView(r);
    assert.ok(['Aman sampai gajian', 'Mepet, kurang dari seminggu belanja', 'Bisa minus sebelum gajian'].includes(c.status.text), id);
    assert.equal(c.lowest.balance, r.scenarios.base.lowest.balance, id);
  }
});

test('explain this cycle: fixed 7-step order', () => {
  const steps = explainView(run('goals-pressure').r).map(s => s.title);
  assert.deepEqual(steps, ['Keseluruhan', 'Pemasukan', 'Pengeluaran', 'Uang sampai gajian', 'Kewajiban', 'Kemajuan', 'Yang perlu diperhatikan']);
});

test('data tab: plain summary', () => {
  const d = dataView(run('stable').r);
  assert.ok(d.headline && d.rows.length);
});

test('the view layer never computes money and never writes', () => {
  const src = readFileSync(new URL('../lib/insight-v3/view.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /firestore|saveRecord|saveProfile|setDoc|fetch\(/);
  const ui = ['hero', 'brief', 'stories', 'deep', 'section'].map(f => readFileSync(new URL(`../components/insight/${f}.tsx`, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(ui, /saveRecord|setDoc|deleteDoc|fetch\(/);
  assert.doesNotMatch(ui, />[^<]*\b(Tekanan|Momentum|Likuiditas)\b[^<]*</, 'engine words leak into visible text');
});
