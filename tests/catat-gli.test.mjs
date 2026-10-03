import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseQuickPlanV3 } from '../lib/catat/v3.ts';
import { parseQuickPlan, generalSpelling } from '../lib/quick-plan.ts';
import { compileLanguagePack, GENERAL_LANGUAGE_VERSION, inspectGeneralLanguage, normalizeGeneral, protectedWords, shorthandVariants } from '../lib/catat/language.ts';
import { aliasProblem, applyChanges, teach } from '../lib/catat/personal.ts';
import { ctx as base } from '../bench/quick/fixtures-v33state.mjs';

const T0 = Date.parse('2026-10-15T08:00:00Z');
const cold = (text, ctx = base) => parseQuickPlanV3(text, ctx);
const one = async (text, personal, ctx = base) => { const p = await parseQuickPlanV3(text, ctx, 'auto', personal); assert.equal(p.actions.length, 1, `${text}: ${p.actions.length} aksi`); return { p, r: p.actions[0].result }; };
const sub = r => r.preset.subcategoryId || r.preset.categoryId;
const lexOf = (...rows) => rows.reduce((lex, [raw, label, type, targetId]) => { const r = teach(lex, raw, label, type, targetId, base, T0); assert.equal(r.problem, null, `${raw}: ${r.problem}`); return applyChanges(lex, r.changes); }, { on: true, aliases: {} });

// ——— §80 required regression cases (fresh account: empty Kamus Pribadi) ———
const REQUIRED = [
  ['mkn 25k jago', { kind: 'expense', amount: 25000, wallet: 'jago', description: 'Makan' }],
  ['jjn 15k krom', { kind: 'expense', amount: 15000, wallet: 'krom', description: 'Jajan' }],
  ['prkr 5k cash', { kind: 'expense', amount: 5000, wallet: 'cash', description: 'Parkir' }],
  ['bnsn 80k jago', { kind: 'expense', amount: 80000, wallet: 'jago', description: 'Bensin' }],
  ['kmrn mkn 30k jago', { kind: 'expense', amount: 30000, wallet: 'jago', date: '2026-10-14' }],
  ['td ngopi 20k krom', { kind: 'expense', amount: 20000, wallet: 'krom', description: 'Ngopi' }],
  ['gue ngutang 100k ke aldi', { kind: 'debt_new', amount: 100000, person: 'Aldi' }],
  ['aldi ngutang 100k', { kind: 'receivable_new', amount: 100000, person: 'Aldi' }],
  ['aldi balikin 50k', { kind: 'receivable_payment', amount: 50000, person: 'Aldi' }],
  ['tf 500k jago ke mandiri', { kind: 'transfer', amount: 500000, wallet: 'jago', to: 'mandiri' }],
  ['topup gopay 100k dr jago', { kind: 'transfer', amount: 100000, wallet: 'jago', to: 'gopay' }],
  ['gaji msk 6,3jt jenius', { kind: 'income', amount: 6300000, wallet: 'jenius' }],
  ['claim cair 350k mandiri', { kind: 'claim_payment', amount: 350000, wallet: 'mandiri' }],
  ['budget mkn 1,5jt', { kind: 'budget', amount: 1500000 }],
  ['nabung 300k buat kuliah', { amount: 300000 }],
];
for (const [text, e] of REQUIRED) test(`§80 ${text}`, async () => {
  const { r } = await one(text);
  const got = { kind: r.kind, amount: r.amount, wallet: r.preset.walletId, to: r.preset.destinationWalletId, person: r.person, date: r.date, description: r.preset.description };
  for (const [k, v] of Object.entries(e)) assert.equal(got[k], v, `${text}: ${k}`);
});

// ——— Productive families (unseen forms come from the mechanism, not a list) ———
for (const [canonical, forms, cat] of [
  ['Sarapan', ['srpn', 'srpan', 'srapn', 'sarapn', 'sarpan'], 'food'],
  ['Makan', ['mkn', 'mkan', 'makn', 'makannn'], 'food'],
  ['Parkir', ['prkr', 'prkir', 'parkr', 'pakir'], 'park'],
  ['Bensin', ['bnsn', 'bensn', 'bnsin', 'bensinn'], 'fuel'],
  ['Belanja', ['blnj', 'blnja', 'blanja', 'blnjaa'], 'shop'],
]) test(`family ${canonical}: ${forms.join(', ')}`, async () => {
  for (const f of forms) { const { r } = await one(`${f} 20k jago`); assert.equal(r.preset.description, canonical, f); assert.equal(r.amount, 20000, f); assert.equal(r.preset.walletId, 'jago', f); assert.ok([cat, base.categories.find(c => c.id === cat)?.parentId].includes(sub(r)) || sub(r) === cat, `${f}: ${sub(r)}`); }
});
test('the shorthand generator: vowel dropping, a missing letter, distinctiveness', () => {
  const v = shorthandVariants('sarapan');
  for (const f of ['srpn', 'srapn', 'sarapn', 'sarpan', 'srpan']) assert.ok(v.includes(f), f);
  assert.ok(!shorthandVariants('kantor').includes('kat'), 'a 3-letter form only as the full consonant skeleton of a short word');
  assert.ok(shorthandVariants('pengeluaran').every(v => v.length >= 6), 'at least half of the word stays');
  assert.ok(!shorthandVariants('kuota').includes('kota'), 'half of a vowel pair is not shorthand');
  const p = compileLanguagePack();
  for (const [form, word] of [['pnglrn', 'pengeluaran'], ['lstrk', 'listrik'], ['tghn', 'tagihan'], ['trnsfr', 'transfer'], ['plng', 'pulang'], ['tbngn', 'tabungan'], ['kreta', 'kereta']]) assert.equal(p.variants.get(form), word, form);
  assert.ok(p.ambiguous.has('cmln'), 'cemilan / camilan: ambiguous, never used');
  assert.equal(p.variants.get('cmln'), undefined);
});
test('real words are never read as shorthand: kota, krim, kamus, tuna, seolah, tarian', () => {
  const p = compileLanguagePack();
  for (const w of ['kota', 'krim', 'kamus', 'tuna', 'seolah', 'tarian', 'kurus', 'plang']) assert.equal(p.variants.get(w), undefined, w);
});

// ——— Combination with the Kamus Pribadi ———
test('"kmrn srpn 22rb trus prkr 5k pake jg" with a personal jg = Jago: two entries, yesterday, Jago', async () => {
  const lex = lexOf(['jg', 'Jago', 'wallet', 'jago']);
  const p = await parseQuickPlanV3('kmrn srpn 22rb trus prkr 5k pake jg', base, 'auto', { lexicon: lex });
  assert.equal(p.actions.length, 2);
  const [a, b] = p.actions.map(x => x.result);
  assert.equal(a.preset.description, 'Sarapan'); assert.equal(a.amount, 22000); assert.equal(a.date, '2026-10-14');
  assert.equal(b.preset.description, 'Parkir'); assert.equal(b.amount, 5000); assert.equal(b.date, '2026-10-14');
  assert.equal(b.preset.walletId, 'jago');
});
test('"kmrn srpn besto 18k jago": general shorthand + personal merchant together', async () => {
  const lex = lexOf(['besto', "D'Besto", 'merchant']);
  const { r } = await one('kmrn srpn besto 18k jago', { lexicon: lex });
  assert.equal(r.preset.description, 'Sarapan'); assert.equal(r.preset.merchant, "D'Besto"); assert.equal(r.amount, 18000); assert.equal(r.date, '2026-10-14'); assert.equal(r.preset.walletId, 'jago');
});
test('a word the person taught is never respelled by the general layer ("srpn" taught as a place)', async () => {
  const lex = lexOf(['srpn', 'Serpong', 'place']);
  const { r } = await one('makan 30k di srpn', { lexicon: lex });
  assert.equal(r.preset.merchant, 'Serpong'); assert.equal(r.preset.description, 'Makan');
});
test('general shorthand is not taught as a personal abbreviation (productive forms included)', () => {
  assert.equal(generalSpelling('mkn'), 'makan');
  assert.equal(generalSpelling('srapn'), 'sarapan');
  assert.match(aliasProblem('srapn', 'abbr', base) || '', /sudah dikenali/);
});

// ——— Adversarial: entity protection ———
test('SRPN Coffee, MKN Store, BBM Cafe, Ceban Cafe stay names', async () => {
  let { r } = await one('makan di SRPN Coffee 30k jago'); assert.equal(r.preset.merchant, 'Srpn Coffee'); assert.equal(r.preset.description, 'Makan');
  ({ r } = await one('belanja di MKN Store 100k jago')); assert.equal(r.preset.merchant, 'Mkn Store'); assert.equal(r.amount, 100000);
  ({ r } = await one('ngopi di BBM Cafe 25k jago')); assert.equal(r.preset.merchant, 'Bbm Cafe'); assert.notEqual(sub(r), 'fuel');
  ({ r } = await one('makan di Ceban Cafe 25k jago')); assert.equal(r.preset.merchant, 'Ceban Cafe'); assert.equal(r.amount, 25000);
});
test('a person called "Mkn" stays Mkn; Adi is not Aldi', async () => {
  let { r } = await one('Mkn ngutang 50k'); assert.equal(r.kind, 'receivable_new'); assert.equal(r.person, 'Mkn');
  ({ r } = await one('Adi ngutang 50k')); assert.equal(r.person, 'Adi');
});
test('pronouns are never protected as names ("dia utang ke gue" still reads gue = aku)', () => {
  const g = protectedWords('gue talangin Aldi makan 40rb, catat dia utang ke gue', base);
  assert.ok(!g.has('gue') && !g.has('dia')); assert.ok(g.has('aldi'));
});

// ——— Mobile typing and fillers ———
test('mobile typing: "mkn:25k", "makan, 25k", "makan25k", emoji, wkwk, catetin, ama temen', async () => {
  for (const t of ['mkn:25k jago', 'makan, 25k jago', 'makan25k jago', 'makan 25k 😋 jago', 'makan 25k jago wkwk', 'catetin makan 25k jago', 'makan 25k ama temen jago']) {
    const { r } = await one(t); assert.equal(r.preset.description, 'Makan', t); assert.equal(r.amount, 25000, t); assert.equal(r.preset.walletId, 'jago', t);
  }
});
test('"transferin" is a transfer; "gaji ditransfer" stays income (direction never changes)', async () => {
  let { r } = await one('transferin 500rb ke mandiri dr jago'); assert.equal(r.kind, 'transfer'); assert.equal(r.preset.walletId, 'jago'); assert.equal(r.preset.destinationWalletId, 'mandiri');
  ({ r } = await one('gaji ditransfer 5jt ke jenius')); assert.equal(r.kind, 'income');
});

// ——— Meaning preserved, trace recorded ———
test('normalization changes form, never amounts, dates, wallets or names; raw text kept with notes', () => {
  const g = normalizeGeneral('kmrn srapn 22rb wkwk trus prkr5k pake jago', base);
  assert.equal(g.text, 'kemarin sarapan 22rb terus parkir 5k pakai jago');
  assert.deepEqual(g.notes.map(n => n.type), ['FILLER', 'COMPOUND_SPLIT', 'TEMPORAL_SHORTHAND', 'PRODUCTIVE_SHORTHAND', 'COMMON_SLANG', 'COMMON_ABBREVIATION', 'COMMON_SLANG']);
  assert.equal(g.version, GENERAL_LANGUAGE_VERSION);
  const p = parseQuickPlan('srapn 22rb jago', base);
  assert.equal(p.sourceText, 'srapn 22rb jago');
  assert.deepEqual(p.language.notes.map(n => [n.raw, n.normalized, n.tier]), [['srapn', 'sarapan', 'CONTEXTUAL']]);
  assert.ok(p.trace[0].startsWith('Bahasa umum v1.0'));
});
test('productive shorthand only in a money context; canonical sentences are untouched', () => {
  assert.equal(normalizeGeneral('srapn', base).text, 'srapn');
  for (const t of ['beli es krim di mixue 16rb gopay', 'sewa sepeda di taman kota 12rb cash', 'beli kamus 85rb jago', 'maaf telat bayar 50k']) assert.equal(normalizeGeneral(t, base).notes.length, 0, t);
});
test('dev inspect tool lists every change', () => {
  assert.deepEqual(inspectGeneralLanguage('mkn:25k jago'), ['mkn: → mkn (PUNCTUATION, EXACT)', 'mkn → makan (COMMON_ABBREVIATION, COMMON)']);
});
test('offline and private: the language layer has no network, storage or AI calls', () => {
  const src = readFileSync(new URL('../lib/catat/language.ts', import.meta.url), 'utf8');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'firebase', 'localStorage', 'gemini', 'openai', 'anthropic', 'import(']) assert.ok(!src.toLowerCase().includes(bad.toLowerCase()), bad);
});
test('fresh account vs personalization off: same general reading', async () => {
  const a = await cold('srapn 22rb jago');
  const b = await parseQuickPlanV3('srapn 22rb jago', base, 'auto', { lexicon: { on: false, aliases: lexOf(['besto', "D'Besto", 'merchant']).aliases } });
  assert.equal(a.actions[0].result.preset.description, 'Sarapan'); assert.equal(b.actions[0].result.preset.description, 'Sarapan');
});
