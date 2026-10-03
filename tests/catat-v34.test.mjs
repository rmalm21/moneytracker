import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseQuickPlanV3 } from '../lib/catat/v3.ts';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { aliasProblem, applyChanges, checkPersonal, compile, decay, learnFromChoice, learnFromSave, learnOverrides, personalize, readTeach, teach, withStatus, THRESHOLDS } from '../lib/catat/personal.ts';
import { clearSession, rememberSaved, sessionView, SESSION_TTL_MS } from '../lib/catat/session.ts';
import { ctx as base } from '../bench/quick/fixtures-v33state.mjs';

const T0 = Date.parse('2026-10-15T08:00:00Z');
const lexOf = (...rows) => rows.reduce((lex, [raw, label, type, targetId]) => { const r = teach(lex, raw, label, type, targetId, base, T0); assert.equal(r.problem, null, `${raw}: ${r.problem}`); return applyChanges(lex, r.changes); }, { on: true, aliases: {} });
const LEX = lexOf(['besto', "D'Besto", 'merchant'], ['piot', 'B1 Piot', 'merchant'], ['kak tio', 'Muhammad Tio', 'person'], ['kntor', 'Kantor', 'place'], ['jg', 'Jago', 'wallet', 'jago'], ['prkr', 'parkir', 'abbr']);
/** `null` = cold (no Kamus Pribadi, no session). */
const read = (text, personal = { lexicon: LEX }, ctx = base) => parseQuickPlanV3(text, ctx, 'auto', personal ?? undefined);
const one = async (text, personal, ctx) => { const p = await read(text, personal, ctx); assert.equal(p.actions.length, 1, `${text}: ${p.actions.length} aksi`); return { p, a: p.actions[0], r: p.actions[0].result }; };
const sessionWith = (o) => ({ people: [], txIds: [], ageMs: 60_000, ...o });

// ——— Required tests (spec 98–112) ———
test('98 merchant alias: "ayam besto 13k jago" → Ayam · D\'Besto · 13.000 · Jago', async () => {
  const { a, r } = await one('ayam besto 13k jago');
  assert.equal(r.preset.description, 'Ayam'); assert.equal(r.preset.merchant, "D'Besto"); assert.equal(r.amount, 13000); assert.equal(r.preset.walletId, 'jago');
  assert.ok(a.evidence.some(e => /D'Besto dipilih karena sebelumnya kamu menyimpan “besto”/.test(e)));
});
test('99 "susu piot 7,7k krom" → Susu · B1 Piot · 7.700 · Krom', async () => {
  const { r } = await one('susu piot 7,7k krom');
  assert.equal(r.preset.description, 'Susu'); assert.equal(r.preset.merchant, 'B1 Piot'); assert.equal(r.amount, 7700); assert.equal(r.preset.walletId, 'krom');
});
test('100 person alias: "kak tio ngutang 20k" → piutang Muhammad Tio 20.000 (no "Kak Tio" person)', async () => {
  const { a, r } = await one('kak tio ngutang 20k');
  assert.equal(r.kind, 'receivable_new'); assert.equal(r.person, 'Muhammad Tio'); assert.equal(r.amount, 20000);
  assert.ok(a.evidence.some(e => /dikenali sebagai Muhammad Tio dari Kamus Pribadi/.test(e)));
});
test('101 explicit wallet wins over history: "kopi cotti 19k krom" stays Krom', async () => {
  const ctx = { ...base, history: [...base.history, ...Array.from({ length: 6 }, (_, i) => ({ type: 'expense', description: 'Kopi', merchant: 'Cotti Coffee', categoryId: 'food', subcategoryId: 'drink', date: `2026-10-0${i + 1}`, walletId: 'jago' }))] };
  const { r } = await one('kopi cotti 19k krom', { lexicon: LEX }, ctx);
  assert.equal(r.preset.walletId, 'krom'); assert.equal(r.preset.merchant, 'Cotti Coffee');
});
test('102 debt direction from the sentence: "gue ngutang 20k ke atuy" is a debt to Atuy (Atuy usually owes)', async () => {
  const lex = lexOf(['atuy', 'Atuy', 'person']);
  const { r } = await one('gue ngutang 20k ke atuy', { lexicon: lex });
  assert.equal(r.kind, 'debt_new'); assert.equal(r.person, 'Atuy'); assert.equal(r.amount, 20000);
});
test('103 amount never from history: "kopi cotti" has no amount', async () => {
  const p = await read('kopi cotti');
  assert.ok(p.actions.every(a => !a.result.amount));
});
test('104 time unchanged by memory: "jam 1" readings are identical cold and warm', async () => {
  for (const t of ['parkir 2k kntor jam 1', 'ayam besto 13k jam 7', 'susu piot 7k tadi jam 1 siang']) {
    const cold = await read(t, null), warm = await read(t);
    assert.deepEqual(warm.actions.map(a => [a.result.date, a.result.preset.time || '', a.result.amount]), cold.actions.map(a => [a.result.date, a.result.preset.time || '', a.result.amount]), t);
  }
});
test('105 session: "dia bayar 5k" right after "atuy ngutang 20k" → Atuy repayment', async () => {
  const { a, r } = await one('dia bayar 5k', { lexicon: LEX, session: sessionWith({ people: ['Atuy'] }) });
  assert.equal(r.kind, 'receivable_payment'); assert.equal(r.preset.receivableId, 'ra'); assert.equal(r.amount, 5000);
  assert.ok(a.evidence.some(e => /orang yang baru saja kamu catat/.test(e)));
});
test('106 session ambiguity: Atuy and Budi just noted → "dia bayar 5k" asks who', async () => {
  const p = await read('dia bayar 5k', { lexicon: LEX, session: sessionWith({ people: ['Atuy', 'Budi'] }) });
  assert.equal(p.personal.asks.length, 1); assert.match(p.personal.asks[0].question, /Atuy atau Budi/);
  assert.ok(p.actions.every(a => a.result.kind !== 'receivable_payment'));
  const answered = await read('dia bayar 5k', { lexicon: LEX, session: sessionWith({ people: ['Atuy', 'Budi'] }), choose: { dia: 'Atuy' } });
  assert.equal(answered.actions[0].result.kind, 'receivable_payment'); assert.equal(answered.actions[0].result.preset.receivableId, 'ra');
});
test('107 stale session: after 30 minutes "dia" is not resolved', async () => {
  clearSession();
  rememberSaved('uidA', [{ person: 'Atuy', relation: { kind: 'receivable', id: 'ra', person: 'Atuy' } }], T0);
  assert.deepEqual(sessionView('uidA', T0 + 60_000).people, ['Atuy']);
  assert.equal(sessionView('uidA', T0 + SESSION_TTL_MS + 1000), undefined);
  const p = await read('dia bayar 5k', { lexicon: LEX, session: sessionView('uidA', T0 + SESSION_TTL_MS + 1000) });
  assert.ok(p.actions.every(a => a.result.kind !== 'receivable_payment' && a.result.preset.receivableId !== 'ra'));
});
test('108 cross-input update: "yang tadi jadi 21k" right after saving Kopi Cotti updates that entry (no new entry)', async () => {
  const cold = await read('yang tadi jadi 21k', null);
  assert.ok(cold.actions[0].result.operation?.candidates?.length > 1 || !cold.actions[0].result.operation?.target, 'cold asks which one');
  const { r } = await one('yang tadi jadi 21k', { lexicon: LEX, session: sessionWith({ txIds: ['t1'] }) });
  assert.equal(r.kind, 'tx_update'); assert.equal(r.operation.target.id, 't1'); assert.equal(r.amount, 21000);
});
test('109 reset: an empty Kamus Pribadi reads exactly like the general engine', async () => {
  for (const t of ['ayam besto 13k jago', 'kak tio ngutang 20k', 'parkir 2k kntor', 'transfer 100rb jago ke mandiri']) {
    const cold = await read(t, null), reset = await read(t, { lexicon: { on: true, aliases: {} } });
    assert.deepEqual(reset.actions.map(a => [a.result.kind, a.result.amount, a.result.preset.merchant || '', a.result.person || '', a.result.preset.walletId || '']), cold.actions.map(a => [a.result.kind, a.result.amount, a.result.preset.merchant || '', a.result.person || '', a.result.preset.walletId || '']), t);
  }
});
test('110 disable: a turned-off alias is not used; personalization off uses the general engine only', async () => {
  const besto = Object.values(LEX.aliases).find(a => a.key === 'besto');
  const off = applyChanges(LEX, { [besto.id]: withStatus({ ...besto, off: true }) });
  const { r } = await one('ayam besto 13k jago', { lexicon: off });
  assert.notEqual(r.preset.merchant, "D'Besto");
  const { r: r2 } = await one('susu piot 7k krom', { lexicon: { ...LEX, on: false } });
  assert.notEqual(r2.preset.merchant, 'B1 Piot');
});
test('111 account switch: user B never sees user A session or words', async () => {
  clearSession();
  rememberSaved('uidA', [{ person: 'Atuy', txId: 't1' }], T0);
  assert.equal(sessionView('uidB', T0 + 1000), undefined);
  assert.equal(sessionView('uidA', T0 + 2000), undefined, 'switching user drops the session');
  const lexB = { on: true, aliases: {} };
  const { r } = await one('susu piot 7k krom', { lexicon: lexB });
  assert.notEqual(r.preset.merchant, 'B1 Piot');
  // The compiled dictionary follows the lexicon object (no stale cache from another account).
  assert.equal(compile(LEX, base).byKey.has('piot'), true); assert.equal(compile(lexB, base).byKey.has('piot'), false);
});
test('112 offline: reading with the cached dictionary needs no network (pure, synchronous)', () => {
  const src = readFileSync(new URL('../lib/catat/personal.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /fetch\(|from ['"][^'"]*(firebase|firestore|gemini|openai|anthropic)|XMLHttpRequest|navigator\.onLine/i);
  const { plan } = personalize('ayam besto 13k jago', base, 'auto', { lexicon: LEX });
  assert.equal(plan.actions[0].result.preset.merchant, "D'Besto");
});

// ——— Safety ———
test('protected words, numbers and wallet names cannot become aliases', () => {
  for (const [w, type] of [['k', 'merchant'], ['jam', 'merchant'], ['ke', 'person'], ['bayar', 'merchant'], ['20', 'merchant'], ['20k', 'merchant'], ['krom', 'merchant'], ['jago', 'person'], ['ngutang', 'abbr'], ['kemarin', 'place']]) assert.ok(aliasProblem(w, type, base), `${w} as ${type} should be refused`);
  assert.equal(aliasProblem('jg', 'wallet', base), null);
  assert.equal(aliasProblem('besto', 'merchant', base), null);
});
test('Bug Catcher: memory may not change amount, date, time, wallet or direction', () => {
  const mk = (kind, amount, walletId, extra = {}) => ({ actions: [{ result: { kind, amount, date: '2026-10-15', person: '', preset: { walletId, time: '', ...extra.preset } }, fields: { wallet: { status: extra.walletStatus || 'verified' } } }] });
  const span = [{ type: 'merchant', raw: 'besto', label: "D'Besto" }];
  assert.deepEqual(checkPersonal(mk('expense', 13000, 'jago'), mk('expense', 13000, 'jago'), span), []);
  assert.equal(checkPersonal(mk('expense', 13000, 'jago'), mk('expense', 19000, 'jago'), span)[0].code, 'PERSONALIZATION_CHANGED_AMOUNT');
  assert.equal(checkPersonal(mk('expense', 13000, 'krom'), mk('expense', 13000, 'jago'), span)[0].code, 'PERSONALIZATION_CHANGED_EXPLICIT_WALLET');
  assert.equal(checkPersonal(mk('debt_new', 20000, ''), mk('receivable_new', 20000, ''), span)[0].code, 'PERSONALIZATION_CHANGED_DEBT_DIRECTION');
  const tf = (w, d) => ({ actions: [{ result: { kind: 'transfer', amount: 1, date: 'x', preset: { walletId: w, destinationWalletId: d } }, fields: {} }] });
  assert.ok(checkPersonal(tf('jago', 'mandiri'), tf('mandiri', 'jago'), span).some(c => c.code === 'PERSONALIZATION_CHANGED_TRANSFER_DIRECTION'));
});
test('a word read as a configured wallet stays a wallet even if memory says it is a place', async () => {
  // "krom" cannot be stored as a place at all; a place alias for another word never moves the wallet.
  assert.ok(aliasProblem('krom', 'place', base));
  const lex = lexOf(['mkn', 'makan', 'abbr']);
  const { r } = await one('mkn 20k pake krom', { lexicon: lex });
  assert.equal(r.preset.walletId, 'krom'); assert.equal(r.amount, 20000);
});
test('correction in the sentence wins: "besto maksud gue Best Meat" reads Best Meat for this sentence', async () => {
  const p = await read('ayam besto 13k, besto maksud gue Best Meat');
  assert.equal(p.actions.length, 1); assert.equal(p.actions[0].result.preset.merchant, 'Best Meat'); assert.equal(p.actions[0].result.amount, 13000);
  const changes = learnOverrides(LEX, p.personal.overrides, base, T0);
  const old = Object.values(changes).find(a => a.label === "D'Besto"), fresh = Object.values(changes).find(a => a.label === 'Best Meat');
  assert.equal(old.reject, 1); assert.equal(fresh.status, 'candidate');
});
test('collision: two meanings for one word are asked, the answer counts', async () => {
  const lex = applyChanges(LEX, Object.fromEntries(Object.entries(teach({ on: true, aliases: {} }, 'besto', 'Best Meat', 'merchant', undefined, base, T0).changes)));
  const p = await read('ayam besto 13k jago', { lexicon: lex });
  assert.equal(p.personal.asks.length, 1); assert.match(p.personal.asks[0].question, /D'Besto atau Best Meat/);
  assert.notEqual(p.actions[0].result.preset.merchant, "D'Besto"); assert.notEqual(p.actions[0].result.preset.merchant, 'Best Meat');
  const pick = p.personal.asks[0].choices.find(c => c.label === "D'Besto");
  const answered = await read('ayam besto 13k jago', { lexicon: lex, choose: { besto: pick.id } });
  assert.equal(answered.actions[0].result.preset.merchant, "D'Besto");
  const changes = learnFromChoice(lex, p.personal.asks[0], pick.id, T0);
  assert.equal(changes[pick.id].correct, 1);
});
test('people are never merged by look-alike names (Adi ≠ Aldi, Tio ≠ Tiyo, Rama ≠ Rahma)', async () => {
  const lex = lexOf(['adi', 'Adi Saputra', 'person'], ['tio', 'Muhammad Tio', 'person'], ['rama', 'Rama Putra', 'person']);
  for (const [t, wrong] of [['aldi ngutang 20k', 'Adi Saputra'], ['tiyo ngutang 20k', 'Muhammad Tio'], ['rahma ngutang 20k', 'Rama Putra']]) {
    const p = await read(t, { lexicon: lex });
    assert.ok(p.actions.every(a => a.result.person !== wrong), `${t} → ${p.actions[0]?.result.person}`);
  }
});
test('Barber King is not Burger King', async () => {
  const p = await read('cukur 50k barber king jago', { lexicon: LEX });
  assert.ok(p.actions.every(a => a.result.preset.merchant !== 'Burger King'));
});
test('one-typo matching only for well-learned place words', async () => {
  const { a, r } = await one('ayam bestoo 15k jago');
  assert.equal(r.preset.merchant, "D'Besto"); assert.ok(a.evidence.some(e => /Periksa kalau keliru/.test(e)));
});

// ——— Learning lifecycle ———
const facts = (o) => ({ text: 'ayam besto 13k jago', kind: 'expense', parsed: {}, saved: {}, ...o });
test('passive learning: one correction is a candidate (not used); two make it provisional; four learned', async () => {
  let lex = { on: true, aliases: {} };
  const once = learnFromSave(lex, [facts({ parsed: { merchant: '' }, saved: { merchant: "D'Besto" } })], base, [], T0);
  lex = applyChanges(lex, once);
  const a1 = Object.values(lex.aliases)[0];
  assert.equal(a1.key, 'besto'); assert.equal(a1.status, 'candidate');
  assert.notEqual((await read('ayam besto 13k jago', { lexicon: lex })).actions[0].result.preset.merchant, "D'Besto", 'a candidate is never used');
  lex = applyChanges(lex, learnFromSave(lex, [facts({ saved: { merchant: "D'Besto" } })], base, [], T0 + 1));
  assert.equal(Object.values(lex.aliases)[0].status, 'provisional');
  assert.equal((await read('ayam besto 13k jago', { lexicon: lex })).actions[0].result.preset.merchant, "D'Besto");
  lex = applyChanges(lex, learnFromSave(lex, [facts({ saved: { merchant: "D'Besto" } }), facts({ saved: { merchant: "D'Besto" } })], base, [], T0 + 2));
  assert.equal(Object.values(lex.aliases)[0].status, 'learned');
});
test('rejection: a used alias changed back twice is turned off', () => {
  let lex = LEX;
  const besto = Object.values(lex.aliases).find(a => a.key === 'besto');
  const span = { aliasId: besto.id, raw: 'besto', label: "D'Besto", type: 'merchant', how: 'exact', status: 'learned' };
  lex = applyChanges(lex, learnFromSave(lex, [facts({ used: [span], saved: { merchant: 'Best Meat' } })], base, [], T0));
  assert.equal(lex.aliases[besto.id].status, 'provisional');
  lex = applyChanges(lex, learnFromSave(lex, [facts({ used: [span], saved: { merchant: 'Best Meat' } })], base, [], T0 + 1));
  assert.equal(lex.aliases[besto.id].status, 'disabled');
});
test('no self-reinforcement and not every edit teaches: amounts, untouched cold readings and typos teach nothing', () => {
  assert.deepEqual(learnFromSave({ on: true, aliases: {} }, [facts({ parsed: { merchant: 'Cotti Coffee' }, saved: { merchant: 'Cotti Coffee' } })], base), {});
  assert.deepEqual(learnFromSave({ on: true, aliases: {} }, [{ text: 'kopi 30k', kind: 'expense', parsed: {}, saved: {} }], base), {});
  assert.deepEqual(learnFromSave({ on: false, aliases: {} }, [facts({ saved: { merchant: "D'Besto" } })], base), {}, 'personalization off learns nothing');
});
test('person correction only towards someone already known, saved by contact id', () => {
  const contacts = [{ id: 'c9', name: 'Muhammad Tio' }];
  const changes = learnFromSave({ on: true, aliases: {} }, [{ text: 'kak tio ngutang 20k', kind: 'receivable_new', parsed: { person: 'Tio' }, saved: { person: 'Muhammad Tio' } }], base, contacts, T0);
  const a = Object.values(changes)[0];
  assert.equal(a.key, 'kak tio'); assert.equal(a.targetId, 'sp:c9'); assert.equal(a.type, 'person');
  assert.deepEqual(learnFromSave({ on: true, aliases: {} }, [{ text: 'zaki ngutang 20k', kind: 'receivable_new', parsed: { person: 'Zaki' }, saved: { person: 'Zaki Unknown' } }], base, contacts, T0), {});
});
test('a renamed wallet or contact keeps its aliases; a deleted one is reported, never used', async () => {
  const renamed = { ...base, wallets: base.wallets.map(w => w.id === 'jago' ? { ...w, name: 'Bank Jago' } : w) };
  const { r } = await one('ayam besto 13k jg', { lexicon: LEX }, renamed);
  assert.equal(r.preset.walletId, 'jago');
  const gone = { ...base, wallets: base.wallets.filter(w => w.id !== 'jago') };
  const p = await read('ayam besto 13k jg', { lexicon: LEX }, gone);
  assert.ok(p.personal.rejected.some(x => x.code === 'ORPHANED_PERSONAL_ALIAS'));
  assert.ok(p.actions.every(a => a.result.preset.walletId !== 'jago'));
  const lex = lexOf(['bos', 'Budi Santoso', 'person', 'sp:c1']);
  const { r: r2 } = await one('bos ngutang 20k', { lexicon: lex, contacts: [{ id: 'c1', name: 'Budi Santoso Putra' }] });
  assert.equal(r2.person, 'Budi Santoso Putra');
});
test('a wallet alias needs strong evidence; a weak one is never used', async () => {
  let lex = { on: true, aliases: {} };
  const w = { id: 'wallet_x', alias: 'mand', key: 'mand', type: 'wallet', label: 'Mandiri', targetId: 'mandiri', source: 'correction', confirm: 0, correct: 2, reject: 0, created: T0, updated: T0 };
  lex = applyChanges(lex, { wallet_x: withStatus(w) });
  assert.equal(lex.aliases.wallet_x.status, 'candidate');
  const p = await read('makan 20k mand', { lexicon: lex });
  assert.ok(p.actions.every(a => a.result.preset.walletId !== 'mandiri' || a.fields.wallet?.status !== 'verified'));
});
test('explicit teaching: "ingat besto itu D\'Besto", "piot itu B1 Piot"; "kopi itu enak" teaches nothing', () => {
  assert.deepEqual(['raw', 'label', 'type'].map(k => readTeach("ingat besto itu D'Besto", base)[k]), ['besto', "D'Besto", 'merchant']);
  assert.equal(readTeach('piot itu B1 Piot', base).label, 'B1 Piot');
  assert.equal(readTeach('kak tio itu Muhammad Tio', base).type, 'person');
  assert.equal(readTeach('kntor itu kantor', base).type, 'place');
  assert.equal(readTeach('mkn itu makan', base).type, 'abbr');
  assert.equal(readTeach('jg itu Jago', base).type, 'wallet');
  assert.equal(readTeach('kopi itu enak', base), null);
  assert.equal(readTeach('yang tadi itu 20k', base), null);
  assert.ok(readTeach('ingat k itu ribu', base).problem);
});
test('teaching a new meaning for the same word retires the old one', () => {
  const r = teach(LEX, 'besto', 'Best Meat', 'merchant', undefined, base, T0);
  const old = Object.values(r.changes).find(a => a.label === "D'Besto");
  assert.equal(old.status, 'disabled');
});
test('decay: old weak candidates fade; explicit aliases stay', () => {
  const day = 86_400_000;
  const cand = withStatus({ id: 'merchant_a', alias: 'x', key: 'xyz', type: 'merchant', label: 'XYZ', source: 'correction', confirm: 0, correct: 1, reject: 0, created: T0, updated: T0 });
  const lex = { on: true, aliases: { ...LEX.aliases, merchant_a: cand } };
  const changes = decay(lex, T0 + (THRESHOLDS.candidateDays + 1) * day);
  assert.equal(changes.merchant_a, null);
  assert.ok(Object.keys(changes).every(id => id === 'merchant_a'));
});
test('sisanya: the remaining balance of the record just paid, never a guessed amount', async () => {
  const ctx = { ...base, receivables: base.receivables.map(r => r.id === 'ra' ? { ...r, remainingAmount: 7000 } : r) };
  const { r } = await one('sisanya besok', { lexicon: LEX, session: sessionWith({ people: ['Atuy'], relation: { kind: 'receivable', id: 'ra', person: 'Atuy' } }) }, ctx);
  assert.equal(r.kind, 'plan_new'); assert.equal(r.amount, 7000); assert.equal(r.date, '2026-10-16');
  const cold = await read('sisanya besok', { lexicon: LEX }, ctx);
  assert.ok(cold.actions.every(a => a.result.kind !== 'plan_new' || !a.result.amount));
});
test('general fix: a known person with a two-word name is read whole', () => {
  const ctx = { ...base, receivables: [...base.receivables, { id: 'rt', person: 'Muhammad Tio', description: '', remainingAmount: 30000, originalAmount: 30000, date: '2026-10-10' }] };
  assert.equal(parseQuickPlan('muhammad tio ngutang 20k', ctx).actions[0].result.person, 'Muhammad Tio');
  assert.equal(parseQuickPlan('gue ngutang 20k ke muhammad tio', ctx).actions[0].result.person, 'Muhammad Tio');
});
test('alias ids are safe Firestore field names; the store writes per entry', () => {
  for (const id of Object.keys(LEX.aliases)) assert.match(id, /^[a-z]+_[0-9a-z]+$/);
  const src = readFileSync(new URL('../lib/firestore.ts', import.meta.url), 'utf8');
  assert.match(src, /personalLexicon\.aliases\.\$\{id\}/);
});
test('performance: warm reading stays fast with a large dictionary', async () => {
  let lex = { on: true, aliases: {} };
  for (let i = 0; i < 300; i++) lex = applyChanges(lex, teach(lex, `toko${i}x`, `Toko Nomor ${i}`, 'merchant', undefined, base, T0).changes);
  lex = applyChanges(lex, teach(lex, 'besto', "D'Besto", 'merchant', undefined, base, T0).changes);
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) personalize('ayam besto 13k jago', base, 'auto', { lexicon: lex });
  const ms = (performance.now() - t0) / 20;
  assert.ok(ms < 60, `${ms.toFixed(1)} ms`);
});
