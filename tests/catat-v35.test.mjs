import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseQuickPlanV3 } from '../lib/catat/v3.ts';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { composeSlots, findCategory, slotNotes } from '../lib/catat/compose.ts';
import { applyChanges, teach } from '../lib/catat/personal.ts';
import { ctx } from '../bench/quick/fixtures-v35state.mjs';
import { cases as dev } from '../bench/quick/fixtures-v35dev.mjs';
import { cases as adv } from '../bench/quick/fixtures-v35adv.mjs';

const T0 = Date.parse('2026-10-15T08:00:00Z');
const low = s => String(s ?? '').toLocaleLowerCase('id-ID');
const read = (text, personal) => parseQuickPlanV3(text, ctx, 'auto', personal);
const sub = r => r.preset.subcategoryId || r.preset.categoryId;
const parentOf = id => ctx.categories.find(c => c.id === id)?.parentId;
const lexOf = (...rows) => rows.reduce((lex, [raw, label, type, targetId]) => { const r = teach(lex, raw, label, type, targetId, ctx, T0); assert.equal(r.problem, null, `${raw}: ${r.problem}`); return applyChanges(lex, r.changes); }, { on: true, aliases: {} });

/** The fields the benchmark scores, from one entry. */
function fields(a) {
  const r = a.result, p = r.preset;
  return { kind: r.kind, amount: r.amount, description: low(p.description), merchant: low(p.merchant), wallet: p.walletId || '', to: p.destinationWalletId || '', person: low(r.person), date: r.date, cat: sub(r) || '',
    details: (r.details || []).map(i => low(i.name)), purpose: low(r.purpose), people: low((p.notes || '').match(/Bersama: ([^·]+)/)?.[1]?.trim()),
    explicit: a.fields.category?.status === 'verified' && /^disebut/.test(a.fields.category.note || '') ? sub(r) : '' };
}
function expectEntry(a, e, label) {
  assert.ok(a, `${label}: entri tidak ada`);
  const f = fields(a);
  for (const [k, v] of Object.entries(e)) {
    if (k === 'noDetails') { assert.deepEqual(f.details, [], `${label}: rincian palsu`); continue; }
    if (k === 'noMerchant') { assert.equal(f.merchant, '', `${label}: tempat palsu`); continue; }
    if (k.startsWith('not')) { const key = k[3].toLowerCase() + k.slice(4); assert.notEqual(f[key], v, `${label}: ${key}`); continue; }
    if (k === 'details') { assert.deepEqual(f.details, v.map(low), `${label}: rincian`); continue; }
    if (k === 'people') { assert.equal(f.people, v.map(low).join(', '), `${label}: orang`); continue; }
    if (k === 'cat' || k === 'explicit') { assert.ok(f[k] === v || parentOf(f[k]) === v, `${label}: ${k} ${f[k]} ≠ ${v}`); continue; }
    assert.equal(f[k], typeof v === 'string' && !['kind', 'wallet', 'to', 'date'].includes(k) ? low(v) : v, `${label}: ${k}`);
  }
}
async function check(c) {
  const p = await read(c.text);
  const list = c.expect.actions || [c.expect];
  assert.equal(p.actions.length, list.length, `${c.id} “${c.text}”: ${p.actions.length} entri`);
  list.forEach((e, i) => expectEntry(p.actions[i], e, `${c.id} “${c.text}” #${i + 1}`));
  return p;
}

// ——— §136–145 required tests, word order, properties, style, items, people, multi-event (development set A) ———
for (const c of dev) test(`V3.5 ${c.group} ${c.id}: ${c.text}`, () => check(c));
// ——— §146–150 adversarial collisions and the engines the composer must leave alone (set C) ———
for (const c of adv) test(`V3.5 adversarial ${c.id}: ${c.text}`, () => check(c));

test('§136 the exact user example: one expense, details in notes, never in the description', async () => {
  const p = await read('Nongkrong 77k di kongsi tiam krom beli Teh Tarik dan Snack Platter');
  const r = p.actions[0].result;
  assert.equal(r.preset.description, 'Nongkrong');
  assert.equal(r.preset.merchant, 'Kongsi Tiam');
  assert.equal(r.preset.walletId, 'krom');
  assert.equal(r.preset.notes, 'Rincian: Teh Tarik, Snack Platter');
  assert.deepEqual(r.details.map(i => i.name), ['Teh Tarik', 'Snack Platter']);
  assert.equal(r.preset.receipt, undefined, 'item tanpa harga bukan struk');
  assert.ok(p.actions[0].evidence.some(e => e === 'Teh Tarik dan Snack Platter dibaca sebagai rincian pembelian.'), '"Kenapa?" menyebut rincian');
  assert.ok(p.trace.some(l => /V3\.5 slot #1: ACTIVITY “Nongkrong” · AMOUNT 77000 · PLACE “Kongsi Tiam” · WALLET krom · ITEM_DETAIL “Teh Tarik” · ITEM_DETAIL “Snack Platter” · CATEGORY Nongkrong & Hiburan › Nongkrong/.test(l)), 'trace slot');
  assert.ok(p.trace.some(l => /^V3\.5 komposisi/.test(l)), 'trace developer');
});

test('§138 explicit category: maps to the existing one, never category_new, never the description', async () => {
  const p = await read('77k nongkrong di kongsi tiam krom masuk ke kategori hiburan');
  const a = p.actions[0];
  assert.equal(a.result.kind, 'expense');
  assert.equal(a.result.preset.categoryId, 'fun');
  assert.equal(a.result.preset.subcategoryId, 'hang', 'subkategori dari aktivitas tetap di dalam induk yang disebut');
  assert.equal(a.fields.category.status, 'verified');
  assert.doesNotMatch(a.result.preset.description, /kategori|hiburan/i);
  const other = await read('nongkrong 77k di kongsi tiam krom masuk ke kategori belanja');
  assert.equal(other.actions[0].result.preset.categoryId, 'shop', 'kategori yang disebut menang atas tebakan');
  assert.equal(other.actions[0].result.preset.subcategoryId, null);
});

test('explicit category that does not exist: asked, never created', async () => {
  const p = await read('nongkrong 77k di kongsi tiam krom masuk ke kategori xyz');
  const a = p.actions[0];
  assert.equal(a.result.kind, 'expense');
  assert.equal(a.fields.category.status, 'check');
  assert.ok(a.review);
  assert.ok(a.warnings.some(w => /“xyz” belum ada/.test(w)));
  assert.ok(!ctx.categories.some(c => /xyz/i.test(c.name)));
});

test('item prices that add up become the receipt; prices that do not stay a warning, the total is what is saved', async () => {
  const ok = (await read('nongkrong 77k di kongsi tiam krom beli teh tarik 25k dan snack platter 52k')).actions;
  assert.equal(ok.length, 1);
  assert.deepEqual(ok[0].result.preset.receipt.items.map(i => [i.name, i.total]), [['Teh Tarik', 25000], ['Snack Platter', 52000]]);
  assert.equal(ok[0].result.preset.receipt.total, 77000);
  const off = (await read('nongkrong 77k di kongsi tiam krom beli teh tarik 25k dan snack platter 50k')).actions;
  assert.equal(off.length, 1);
  assert.equal(off[0].result.amount, 77000);
  assert.equal(off[0].result.preset.receipt, undefined);
  assert.ok(off[0].warnings.some(w => /75\.000 tidak sama dengan total 77\.000/.test(w)));
});

test('§152–154 properties: detail, date and explicit category change only their own slot', async () => {
  const core = r => [r.amount, r.preset.walletId, r.preset.merchant, r.preset.description];
  const base = (await read('nongkrong 77k di kongsi tiam krom')).actions[0].result;
  for (const t of ['nongkrong 77k di kongsi tiam krom beli teh tarik', 'kemarin nongkrong 77k di kongsi tiam krom', 'nongkrong 77k di kongsi tiam krom kategori hiburan', 'nongkrong 77k di kongsi tiam krom beli teh tarik buat meeting', 'nongkrong 77k di kongsi tiam bareng andi krom']) {
    const r = (await read(t)).actions[0].result;
    assert.deepEqual(core(r), core(base), t);
    assert.equal(sub(r), sub(base), `${t}: kategori`);
  }
  const y = (await read('kemarin nongkrong 77k di kongsi tiam krom')).actions[0].result;
  assert.equal(y.date, '2026-10-14');
});

test('§151 every safe order of the same spans reads the same event', async () => {
  const orders = ['nongkrong 77k di kongsi tiam krom', '77k nongkrong di kongsi tiam krom', 'krom 77k nongkrong di kongsi tiam', 'di kongsi tiam nongkrong 77k pake krom', 'nongkrong di kongsi tiam 77k krom', 'pake krom nongkrong 77k di kongsi tiam', 'nongkrong di kongsi tiam pake krom 77k', 'krom 77k nongkrong kongsi tiam'];
  const sig = r => JSON.stringify([r.kind, r.amount, r.preset.walletId, r.preset.merchant, r.preset.description, sub(r)]);
  const want = sig((await read(orders[0])).actions[0].result);
  for (const t of orders) { const p = await read(t); assert.equal(p.actions.length, 1, t); assert.equal(sig(p.actions[0].result), want, t); }
});

test('§135 case does not change the reading', async () => {
  const a = (await read('NONGKRONG 77K DI KONGSI TIAM KROM BELI TEH TARIK DAN SNACK PLATTER')).actions[0].result;
  const b = (await read('nongkrong 77k di kongsi tiam krom beli teh tarik dan snack platter')).actions[0].result;
  assert.deepEqual([a.amount, a.preset.walletId, low(a.preset.merchant), low(a.preset.description), sub(a), a.details.map(i => low(i.name))], [b.amount, b.preset.walletId, low(b.preset.merchant), low(b.preset.description), sub(b), b.details.map(i => low(i.name))]);
});

test('Personal Lexicon composes with the slots: "srpn 25k di besto jago beli ayam dan teh"', async () => {
  const lex = lexOf(['besto', "D'Besto", 'merchant']);
  const r = (await read('srpn 25k di besto jago beli ayam dan teh', { lexicon: lex })).actions[0].result;
  assert.equal(r.preset.description, 'Sarapan');
  assert.equal(r.preset.merchant, "D'Besto");
  assert.equal(r.preset.walletId, 'jago');
  assert.deepEqual(r.details.map(i => i.name), ['Ayam', 'Teh']);
});

test('composer: hands-off sentences and plain sentences are not recomposed', () => {
  for (const t of ['aldi ngutang 50k buat nongkrong', 'tf 200k dr jago ke krom buat nongkrong', 'budget nongkrong 500k', 'nabung 300k buat liburan', 'gaji masuk 5jt jenius', 'makan 25k jago', 'beli kopi 25k di cotti', 'buat kategori hiburan baru'])
    assert.equal(composeSlots(t, ctx), null, t);
});

test('composer Bug Catcher: details never attach to an entry that is not a spending; the plain reading stays', () => {
  const p = parseQuickPlan('nongkrong 77k beli teh tarik buat besok', ctx);
  assert.equal(p.actions[0].result.kind, 'plan_new');
  assert.equal(p.actions[0].result.details, undefined);
  assert.ok(p.trace.some(l => /V3\.5 komposisi ditolak: rincian di entri bukan belanja/.test(l)));
});

test('an item with its own price is its own spending, not a detail ("beli rokok 30k")', async () => {
  const p = await read('nongkrong 77k di kongsi tiam beli rokok 30k sama jago');
  assert.equal(p.actions.length, 2);
  assert.deepEqual(p.actions.map(a => a.result.amount), [77000, 30000]);
  assert.ok(p.actions.every(a => !a.result.details));
});

test('findCategory resolves only existing categories; slotNotes is short', () => {
  assert.equal(findCategory('hiburan', ctx.categories).categoryId, 'fun');
  assert.equal(findCategory('hiburan > nongkrong', ctx.categories).subcategoryId, 'hang');
  assert.equal(findCategory('hiburan nongkrong', ctx.categories).subcategoryId, 'hang');
  assert.equal(findCategory('bioskop', ctx.categories).subcategoryId, 'cinema');
  assert.equal(findCategory('xyz', ctx.categories), null);
  assert.equal(slotNotes({ items: [{ name: 'Teh Tarik', qty: 2 }, { name: 'Roti' }], purpose: 'meeting' }), 'Rincian: 2 Teh Tarik, Roti · Keperluan: meeting');
});

test('§166–167 local only: no network, no storage, no cloud model in the composer', () => {
  const src = readFileSync(new URL('../lib/catat/compose.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|firebase|gemini|openai|anthropic|localStorage|indexedDB/i);
});
