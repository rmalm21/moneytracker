import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { catchBugs } from '../lib/catat/bug-catcher.ts';
import { resolveBoundaries } from '../lib/catat/entities.ts';
import { ctx } from '../bench/quick/fixtures-v30dev.mjs';

const one = text => { const p = parseQuickPlan(text, ctx); assert.equal(p.actions.length, 1, `${text}: ${p.actions.length} actions`); return p.actions[0]; };
const fields = a => ({ kind: a.result.kind, amount: a.result.amount, date: a.result.preset.date, wallet: a.result.preset.walletId, to: a.result.preset.destinationWalletId, description: a.result.preset.description, merchant: a.result.preset.merchant, person: a.result.person });
const KEMARIN = '2026-09-25';

// Permanent real-failure regressions (never delete).
test('real failure: "mie ayam di bedeng 12k" — merchant not duplicated into the description', () => {
  const f = fields(one('mie ayam di bedeng 12k'));
  assert.deepEqual([f.kind, f.description, f.merchant, f.amount], ['expense', 'Mie Ayam', 'Bedeng', 12000]);
  assert.notEqual(f.description, 'Mie Ayam Bedeng');
});
test('real failure: "kemarin beli susu di b1 piot 7,7k krom" — the wallet does not disappear in the merchant', () => {
  const f = fields(one('kemarin beli susu di b1 piot 7,7k krom'));
  assert.deepEqual([f.kind, f.description, f.merchant, f.amount, f.wallet, f.date], ['expense', 'Susu', 'B1 Piot', 7700, 'krom', KEMARIN]);
  assert.notEqual(f.merchant, 'B1 Piot Krom');
});

test('required: implicit and explicit wallet, multi-word and numeric merchants, wallet before the amount, "dari" wallet', () => {
  assert.deepEqual(Object.values((({ description, merchant, amount, wallet }) => ({ description, merchant, amount, wallet }))(fields(one('kopi fore 25k jago')))), ['Kopi', 'Fore', 25000, 'jago']);
  assert.deepEqual([fields(one('kopi di fore 25k pake jago')).merchant, fields(one('kopi di fore 25k pake jago')).wallet], ['Fore', 'jago']);
  const fm = fields(one('susu di family mart 20k krom')); assert.deepEqual([fm.description, fm.merchant, fm.amount, fm.wallet], ['Susu', 'Family Mart', 20000, 'krom']);
  const sp = fields(one('kopi di 7 speed 18k jago')); assert.deepEqual([sp.merchant, sp.amount, sp.wallet], ['7 Speed', 18000, 'jago']);
  const wb = fields(one('makan di bedeng krom 12k')); assert.deepEqual([wb.merchant, wb.wallet, wb.amount], ['Bedeng', 'krom', 12000]);
  const dr = fields(one('makan di bedeng 12k dari krom')); assert.deepEqual([dr.merchant, dr.wallet], ['Bedeng', 'krom']);
});

test('required: corrections of the place and the wallet', () => {
  assert.equal(fields(one('susu di b1 8k eh di piot')).merchant, 'Piot');
  assert.equal(fields(one('makan 25k jago eh krom')).wallet, 'krom');
  assert.equal(fields(one('susu 8k bukan di b1, di piot')).merchant, 'Piot');
  assert.equal(fields(one('talangin budi 40rb eh aldi')).person, 'Aldi');
});

test('required: person vs wallet, wallet destination, lending direction', () => {
  const p = fields(one('transfer 100k dari jago ke budi'));
  assert.deepEqual([p.kind, p.wallet, p.to ?? null, p.person], ['expense', 'jago', null, 'Budi']);
  const t = fields(one('transfer 100k dari jago ke mandiri'));
  assert.deepEqual([t.kind, t.wallet, t.to, t.person], ['transfer', 'jago', 'mandiri', undefined]);
  const inn = fields(one('budi minjemin aku 100k')); assert.deepEqual([inn.kind, inn.person], ['debt_new', 'Budi']);
  const out = fields(one('aku minjemin budi 100k')); assert.deepEqual([out.kind, out.person], ['receivable_new', 'Budi']);
});

test('required: two actions stay isolated (no merchant or wallet leakage)', () => {
  const p = parseQuickPlan('mie ayam di bedeng 12k krom terus kopi fore 25k jago', ctx);
  assert.equal(p.actions.length, 2);
  const [a, b] = p.actions.map(fields);
  assert.deepEqual([a.description, a.merchant, a.amount, a.wallet], ['Mie Ayam', 'Bedeng', 12000, 'krom']);
  assert.deepEqual([b.description, b.merchant, b.amount, b.wallet], ['Kopi', 'Fore', 25000, 'jago']);
});

test('Bug Catcher: an injected parse that swallowed a known wallet is caught and repaired', () => {
  const { parse, warnings } = catchBugs({ kind: 'expense', description: 'Susu', merchant: 'B1 Piot Krom' }, 'beli susu di b1 piot 7,7k krom', ctx);
  assert.ok(warnings.some(w => w.code === 'KNOWN_WALLET_SWALLOWED_BY_MERCHANT'));
  assert.equal(parse.merchant, 'B1 Piot'); assert.equal(parse.walletId, 'krom');
});
test('Bug Catcher: merchant duplicated in the description, money and date inside entities, wallet as person', () => {
  const dup = catchBugs({ kind: 'expense', description: 'Mie Ayam Bedeng', merchant: 'Bedeng' }, 'mie ayam di bedeng 12k', ctx);
  assert.ok(dup.warnings.some(w => w.code === 'MERCHANT_DUPLICATED_IN_DESCRIPTION')); assert.equal(dup.parse.description, 'Mie Ayam');
  const money = catchBugs({ kind: 'expense', merchant: 'B1 Piot 7,7k' }, 'susu di b1 piot 7,7k', ctx);
  assert.equal(money.parse.merchant, 'B1 Piot'); assert.ok(money.warnings.some(w => w.code === 'AMOUNT_INSIDE_ENTITY'));
  const date = catchBugs({ kind: 'expense', description: 'Kemarin Beli Susu' }, 'kemarin beli susu 8rb', ctx);
  assert.equal(date.parse.description, 'Susu');
  const person = catchBugs({ kind: 'transfer', walletId: 'mandiri', person: 'Jago' }, 'transfer ke jago 100rb dari mandiri', ctx);
  assert.equal(person.parse.person, undefined); assert.equal(person.parse.destinationWalletId, 'jago');
  const unused = catchBugs({ kind: 'expense', description: 'Makan' }, 'makan 20rb krom', ctx);
  assert.equal(unused.parse.walletId, 'krom'); assert.ok(unused.warnings.some(w => w.code === 'UNASSIGNED_KNOWN_WALLET'));
  const frag = catchBugs({ kind: 'expense', description: 'Susu Family', merchant: 'Mart' }, 'susu family mart 20k', ctx);
  assert.equal(frag.parse.merchant, 'Family Mart'); assert.equal(frag.parse.description, 'Susu');
});
test('Bug Catcher leaves a clean parse alone', () => {
  const r = catchBugs({ kind: 'expense', description: 'Susu', merchant: 'B1 Piot', walletId: 'krom' }, 'beli susu di b1 piot 7,7k krom', ctx);
  assert.equal(r.changed, false); assert.equal(r.warnings.length, 0);
});

test('metamorphic: adding a date or "pake" changes only that field', () => {
  const base = fields(one('beli susu di b1 piot 7,7k krom'));
  const dated = fields(one('kemarin beli susu di b1 piot 7,7k krom'));
  const pake = fields(one('beli susu di b1 piot 7,7k pake krom'));
  assert.deepEqual({ ...dated, date: base.date }, base);
  assert.equal(dated.date, KEMARIN);
  assert.deepEqual(pake, base);
});
test('paraphrases of one sentence keep the same entities', () => {
  for (const t of ['mie ayam di bedeng 12k', 'beli mie ayam di bedeng 12rb', '12k mie ayam di bedeng']) {
    const f = fields(one(t)); assert.equal(f.description, 'Mie Ayam', t); assert.equal(f.merchant, 'Bedeng', t); assert.equal(f.amount, 12000, t);
  }
});

test('invariants: a selected wallet token is never merchant text; amount and date spans never sit inside a merchant', () => {
  const sentences = ['kemarin beli susu di b1 piot 7,7k krom', 'susu di family mart 20k krom', 'makan di bedeng krom 12k', 'kopi di 7 speed 18k jago', 'sate di pak kumis kemarin 30rb', 'martabak di pak joko 40rb go pay', 'roti indomaret 12k krom'];
  for (const t of sentences) for (const a of parseQuickPlan(t, ctx).actions) {
    const merchant = (a.result.preset.merchant || '').toLowerCase();
    const wallet = ctx.wallets.find(w => w.id === a.result.preset.walletId);
    if (wallet) assert.ok(!merchant.split(/\s+/).includes(wallet.name.toLowerCase()), `${t}: wallet in merchant`);
    assert.ok(!/\d+(?:[.,]\d+)?\s*(?:k|rb|jt)\b/.test(merchant), `${t}: amount in merchant`);
    assert.ok(!/\b(kemarin|tadi|besok)\b/.test(merchant), `${t}: date in merchant`);
    // One token, one role: the merchant's words are not repeated in the description.
    const desc = (a.result.preset.description || '').toLowerCase();
    if (merchant) assert.ok(!desc.endsWith(merchant), `${t}: merchant duplicated in description`);
  }
});
test('invariants: a cancelled action does not persist, and one money movement is never duplicated', () => {
  const p = parseQuickPlan('makan di bedeng 12k, eh ga jadi', ctx);
  assert.equal(p.actions.length, 0);
  const q = parseQuickPlan('talangin aldi makan 45k jago, jadi aldi utang ke aku 45k', ctx);
  assert.equal(q.actions.filter(a => a.result.amount === 45000).length, 1);
});
test('resolver keeps the rejected greedy span in its trace', () => {
  const r = resolveBoundaries({ text: 'beli susu di b1 piot 7,7k krom', amount: { index: 21, text: '7,7k' }, wallets: [{ id: 'krom', name: 'Krom', at: 26, word: 'krom' }], dates: [], flow: 'expense', knownPlaces: new Map() });
  assert.equal(r.merchant.value, 'B1 Piot');
  assert.ok(r.rejected.some(x => x.text === 'B1 Piot Krom' && /dompet/.test(x.reason)));
  assert.ok(r.nodes.some(n => n.selectedType === 'WALLET' && n.linkedRecord === 'krom'));
});
test('a plain two-digit number is money only next to a wallet or a paying verb, and is always marked to check', () => {
  const a = one('bensin 80 krom');
  assert.equal(a.result.amount, 80); assert.equal(a.fields.amount.status, 'check'); assert.deepEqual(a.options.amount, [80, 80000]);
  assert.equal(parseQuickPlan('iphone 15', ctx).actions.length, 0);
});
test('a person after "bayar" or "dari" that is not in the records is marked to check (never a silent guess)', () => {
  const a = one('bayar laundry 30rb');
  assert.notEqual(a.result.person, 'Laundry');
  const b = one('dapet 150rb dari aldi');
  assert.equal(b.result.person, 'Aldi'); assert.equal(b.fields.person.status, 'check');
});

test('V3 consensus: NLP.js rescues typos of configured entities, the grammar re-reads and validates them', async () => {
  const { parseQuickPlanV3 } = await import('../lib/catat/v3.ts');
  const wallet = (await parseQuickPlanV3('bensin 40rb mandri', ctx)).actions[0];
  assert.equal(wallet.result.preset.walletId, 'mandiri'); assert.equal(wallet.fields.wallet.status, 'likely');
  const place = (await parseQuickPlanV3('susu di famili mart 21k jago', ctx)).actions[0];
  assert.equal(place.result.preset.merchant, 'Family Mart'); assert.equal(place.result.preset.description, 'Susu');
  const transfer = (await parseQuickPlanV3('trf 300rb dr jago ke mandri', ctx)).actions[0];
  assert.deepEqual([transfer.result.kind, transfer.result.preset.walletId, transfer.result.preset.destinationWalletId], ['transfer', 'jago', 'mandiri']);
});
test('V3 consensus: a similar-looking name two edits away is not respelled ("barber king" is not Burger King)', async () => {
  const { parseQuickPlanV3 } = await import('../lib/catat/v3.ts');
  const a = (await parseQuickPlanV3('cukur di barber king 35k cash', ctx)).actions[0];
  assert.equal(a.result.preset.merchant, 'Barber King');
});
test('V3 consensus: NLP.js never changes the amount or the direction decided by the grammar', async () => {
  const { parseQuickPlanV3 } = await import('../lib/catat/v3.ts');
  for (const [text, kind, amount] of [['budi minjemin aku 100k', 'debt_new', 100000], ['aku minjemin budi 100k', 'receivable_new', 100000], ['kemarin beli susu di b1 piot 7,7k krom', 'expense', 7700]]) {
    const [g] = parseQuickPlan(text, ctx).actions, [v] = (await parseQuickPlanV3(text, ctx)).actions;
    assert.equal(v.result.kind, kind, text); assert.equal(v.result.amount, amount, text); assert.equal(v.result.kind, g.result.kind, text); assert.equal(v.result.amount, g.result.amount, text);
  }
});
