import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { readMath, readShare, readAllocation, readParts, lineAmounts } from '../lib/catat/math.ts';
import { ctx, C } from '../bench/quick/fixtures-v68state.mjs';

const one = text => { const p = parseQuickPlan(text, ctx); assert.equal(p.actions.length, 1, `${text}: ${p.actions.length} aksi`); return p.actions[0]; };
const sharesOf = a => a.result.split.participants.map(p => [p.isMe ? 'me' : p.name, a.result.split.shares[p.id]]);
const linesOf = a => (a.result.preset.splits || []).map(l => [l.subcategoryId || l.categoryId, l.amount]);
const parent = id => ctx.categories.find(c => c.id === id)?.parentId || id;

test('V4 math: words left to right, symbols with precedence, rounded to whole rupiah at the end', () => {
  assert.equal(readMath('128181 dibagi 3 dikali 2').notes[0].value, 85454);
  assert.equal(readMath('128181 dibagi 3 dikali 2 ditambah 5000 dikurangi 2000').notes[0].value, 88454);
  assert.equal(readMath('makan (50rb+30rb)/2').notes[0].value, 40000);
  assert.equal(readMath('kopi 22rb x 4').notes[0].value, 88000);
  assert.equal(readMath('jajan 3 x 7500').notes[0].value, 22500);
  assert.equal(readMath('parkir 5rb, 2 kali').notes[0].value, 10000);
  assert.equal(readMath('1/4 dari 400rb buat pulsa').notes[0].value, 100000);
  assert.equal(readMath('makan 80rb pajak 10%').notes[0].value, 8000);
  assert.equal(one('128181 dibagi 3 dikali 2').result.amount, 85454);
  assert.equal(one('makan (50rb+30rb)/2').result.calc, 'Rp80.000 ÷ 2');
});

test('V4 math: what is not arithmetic stays as written', () => {
  for (const t of ['kopi 2 gelas 36rb', 'beli kaos xl 80rb', 'makan kurang lebih 50rb', 'kali ini makan 40rb', 'nonton xxi 2 orang 100rb', 'laundry 3kg 21rb'])
    assert.equal(readMath(t).notes.length, 0, t);
  // Still missing, not a minus; instalments are one payment each.
  assert.equal(readMath('bensin 30rb kurang 5rb lagi').notes.length, 0);
  assert.equal(readMath('cicilan hp 3 kali 500rb').notes.length, 0);
  assert.equal(one('cicilan hp 3 kali 500rb').result.amount, 500000);
  // Only a spending is divided: a salary "dibagi 3 pos" stays the salary.
  assert.equal(one('gaji 5jt dibagi 3 pos').result.amount, 5000000);
});

test('V4 amounts: a decimal million and a count after it are never joined ("1.5jt 2 bulan")', () => {
  assert.equal(one('bayar kos 1.5jt 2 bulan').result.amount, 1500000);
  assert.equal(one('kos 1,5jt 2 bulan').result.amount, 1500000);
  assert.equal(one('gaji 2jt200').result.amount, 2200000);
  assert.equal(one('laptop 7jt5').result.amount, 7500000);
});

test('V4 sharing: "hokben 162.003 dibagi2 sama ferdi" is a Split Bill; your part is one tap away', () => {
  const a = one('hokben 162.003 dibagi2 sama ferdi');
  assert.equal(a.result.amount, 162003);
  assert.deepEqual(sharesOf(a), [['me', 81002], ['Ferdi', 81001]]);
  assert.equal(a.result.operation.type, 'SPLIT');
  assert.deepEqual(a.mutation.relationshipChanges.map(c => [c.label, c.after]), [['Piutang Ferdi', 81001]]);
  const mine = a.alternatives.find(x => /Bagianku saja/.test(x.label));
  assert.equal(mine.result.amount, 81002); assert.equal(mine.result.split, undefined);
  assert.deepEqual(sharesOf(one('kado 300rb 50:50 sama rina')), [['me', 150000], ['Rina', 150000]]);
  assert.deepEqual(sharesOf(one('grab 45rb dibagi 3 sama tasya dan bima')), [['me', 15000], ['Tasya', 15000], ['Bima', 15000]]);
});

test('V4 sharing: paid by someone else → no wallet of yours, your part is a debt to them', () => {
  for (const text of ['rina yang bayar makan 100rb, dibagi 2', 'ferdi bayarin makan 90rb, aku hutang setengah']) {
    const a = one(text), sp = a.result.split, payer = sp.participants.find(p => p.id === sp.payerId);
    assert.ok(payer && !payer.isMe, text);
    assert.equal(a.result.preset.walletId, '', text);
    assert.equal(a.mutation.moneyMovements.length, 0, text);
    assert.deepEqual(a.mutation.relationshipChanges.map(c => c.kind), ['debt'], text);
  }
});

test('V4 sharing: written parts ("aku 60rb ferdi 40rb") are kept as written', () => {
  const a = one('makan 100rb aku 60rb ferdi 40rb');
  assert.equal(a.result.split.method, 'amount');
  assert.deepEqual(sharesOf(a), [['me', 60000], ['Ferdi', 40000]]);
  assert.equal(readParts('makan 100rb aku 60rb ferdi 30rb', ctx, 100000), null, 'parts that do not add up are not a split');
  assert.equal(readParts('makan 100rb ferdi 60rb rina 40rb', ctx, 100000), null, 'you must be in it');
});

test('V4 sharing: no names → your share; a count without a dividing word only offers it', () => {
  const taxi = one('taksi 90rb bagi tiga');
  assert.equal(taxi.result.amount, 30000); assert.equal(taxi.result.split, undefined);
  assert.ok(taxi.alternatives.some(x => x.result.amount === 90000));
  const five = one('makan 300rb kita berlima');
  assert.equal(five.result.amount, 300000);
  assert.equal(five.alternatives.find(x => /Bagianku saja/.test(x.label))?.result.amount, 60000);
  assert.equal(readShare('makan berdua 80rb aku yang traktir', ctx, 80000), null, 'treating someone is not sharing');
});

test('V4 purposes: one purchase on several categories, adding up exactly', () => {
  const a = one('hokben 162.003 dibagi 2, satu untuk gue expense makan biasa, satu lagi entertain/traktir teman/sedekah');
  const lines = linesOf(a);
  assert.deepEqual(lines.map(l => l[1]), [81002, 81001]);
  assert.equal(parent(lines[0][0]), 'expense.makan-minum');
  assert.equal(parent(lines[1][0]), 'expense.sosial-sedekah');
  assert.ok(a.alternatives.some(x => x.label === 'Satu kategori saja' && !x.result.preset.splits.length));
  assert.deepEqual(linesOf(one('belanja bulanan 500rb, 60% bahan makanan 40% kebutuhan rumah')), [[C('Bahan Makanan'), 300000], [C('Kebutuhan Rumah'), 200000]]);
  assert.deepEqual(linesOf(one('belanja 200rb, 150rb buat makan, sisanya sabun')).map(([c, n]) => [parent(c), n]), [['expense.makan-minum', 150000], ['expense.rumah-kebutuhan', 50000]]);
  assert.deepEqual(linesOf(one('bensin 100rb, 30rb nya buat kantor')).map(([c, n]) => [parent(c), n]), [[parent(C('Bensin')), 70000], ['expense.kerja', 30000]]);
});

test('V4 purposes: a name shared by two categories is not matched by its name ("Makan" in Travel and Reimbursement)', () => {
  const lines = linesOf(one('belanja 200rb, 150rb buat makan, sisanya sabun'));
  assert.notEqual(parent(lines[0][0]), 'expense.travel-liburan');
});

test('V4 purposes: lines always add up to the total', () => {
  for (const total of [162003, 100000, 99999, 1001]) {
    const halves = readAllocation(`makan ${total} dibagi 2, satu buat aku, satu sedekah`, total);
    assert.equal(lineAmounts(halves.lines, total).reduce((n, x) => n + x, 0), total);
    const pct = readAllocation(`belanja ${total} 33% bahan makanan 67% sabun`, total);
    assert.equal(lineAmounts(pct.lines, total).reduce((n, x) => n + x, 0), total);
  }
});
