import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { findTimes, resolveTime, readNumberWords } from '../lib/catat/temporal.ts';
import { catchTemporalBugs } from '../lib/catat/bug-catcher.ts';
import { ctx as base } from '../bench/quick/fixtures-v31dev.mjs';

const T = '2026-10-15', Y = '2026-10-14';
const at = now => ({ ...base, now });
const one = (text, now = '15:00') => { const p = parseQuickPlan(text, at(now)); assert.equal(p.actions.length, 1, `${text}: ${p.actions.length} actions`); return p.actions[0]; };
const f = a => ({ kind: a.result.kind, amount: a.result.amount, date: a.result.preset.date, time: a.result.preset.time, wallet: a.result.preset.walletId, description: a.result.preset.description, merchant: a.result.preset.merchant, person: a.result.person });
const time = (text, now) => one(text, now).result.preset.time;

test('real failure: "beli ayam dbesto 12k jam 1" — the time phrase never stays in the description', () => {
  const x = f(one('beli ayam dbesto 12k jam 1'));
  assert.deepEqual([x.kind, x.description, x.merchant, x.amount, x.time], ['expense', 'Ayam', "D'Besto", 12000, '13:00']);
  for (const v of [x.description, x.merchant, x.person]) assert.ok(!/jam/i.test(v || ''));
});
test('core: "beli kopi di cotti coffee 19k jam set 12" → Kopi · Cotti Coffee · 19.000 · 11:30', () => {
  const x = f(one('beli kopi di cotti coffee 19k jam set 12'));
  assert.deepEqual([x.description, x.merchant, x.amount, x.time], ['Kopi', 'Cotti Coffee', 19000, '11:30']);
});

test('smart AM/PM at 15:00, 08:00 and 20:00 (nearest plausible past)', () => {
  for (const [t, want] of [['kopi 20k jam 1', '13:00'], ['kopi 20k jam 2', '14:00'], ['kopi 20k jam 3', '15:00'], ['kopi 20k jam 10', '10:00'], ['kopi 20k jam 7', '07:00'], ['kopi 20k jam set 2', '13:30'], ['kopi 20k jam set 3', '14:30'], ['kopi 20k jam setengah 3', '14:30'], ['kopi 20k jam 3 lewat 10', '15:10']]) assert.equal(time(t, '15:00'), want, t);
  for (const [t, want] of [['kopi 20k jam 7', '07:00'], ['kopi 20k jam 6', '06:00'], ['kopi 20k jam set 8', '07:30'], ['kopi 20k jam 6 lewat 10', '06:10']]) assert.equal(time(t, '08:00'), want, t);
  for (const [t, want] of [['makan 30k jam 7', '19:00'], ['makan 30k jam 6', '18:00'], ['makan 30k jam set 8', '19:30'], ['makan 30k jam 7 lewat 10', '19:10']]) assert.equal(time(t, '20:00'), want, t);
  // A clear inference is not asked about.
  assert.equal(one('kopi 20k jam 1').fields.time.status, 'likely');
});
test('explicit daypart wins (no inference); a fixed clock still to come today is moved to yesterday and marked', () => {
  const ahead = one('kopi 20k jam 7 malam', '15:00'); assert.equal(ahead.result.preset.date, Y); assert.equal(ahead.fields.time.status, 'check');
  for (const [t, want] of [['kopi 20k jam 1 pagi', '01:00'], ['kopi 20k jam 1 siang', '13:00'], ['kopi 20k jam 3 sore', '15:00'], ['kopi 20k jam 7 malam', '19:00'], ['kopi 20k jam set 3 sore', '14:30'], ['kopi 20k jam tiga sore', '15:00']]) {
    const a = one(t, '21:00'); assert.equal(a.result.preset.time, want, t); assert.equal(a.fields.time.status, 'verified', t);
  }
});
test('formats: colon, dot, space, compact after a marker, lewat/lwt, words, kurang', () => {
  for (const [t, want] of [['kopi 20k jam 12', '12:00'], ['kopi 20k jam 12:10', '12:10'], ['kopi 20k jam 12.10', '12:10'], ['kopi 20k jam 12 10', '12:10'], ['kopi 19k jam 1200', '12:00'], ['kopi 20k jam 12 lewat 10', '12:10'], ['kopi 20k jam 12 lwt 10', '12:10'], ['kopi 20k jam dua belas lewat sepuluh', '12:10'], ['kopi 20k jam 3 kurang seperempat', '14:45'], ['makan 30k jam2', '14:00']]) assert.equal(time(t), want, t);
});
test('Indonesian half hours: "setengah satu" is base 12:30, "set 12" base 11:30, "setengah dua" base 01:30', () => {
  const base12 = t => { const e = findTimes(t)[0]; return `${e.hour}:${String(e.minute).padStart(2, '0')}`; };
  assert.equal(base12('jam setengah satu'), '12:30'); assert.equal(base12('jam set 1'), '12:30'); assert.equal(base12('jam set satu'), '12:30');
  assert.equal(base12('jam setngh 1'), '12:30'); assert.equal(base12('jam set 12'), '11:30'); assert.equal(base12('jam set 2'), '1:30'); assert.equal(base12('jam setengah tiga'), '2:30');
});
test('number words come from one normalizer', () => {
  assert.deepEqual(['tiga', 'dua belas', 'lima belas', 'dua puluh lima', 'sepuluh', 'sebelas', 'seperempat', '7'].map(w => readNumberWords(w)?.value), [3, 12, 15, 25, 10, 11, 15, 7]);
});
test('dates: kemarin variants, tgl/tanggal/tnggl with or without a space', () => {
  for (const t of ['kemarin kopi 20k', 'kemaren kopi 20k', 'kmrn kopi 20k', 'kmrin kopi 20k']) assert.equal(one(t).result.preset.date, Y, t);
  for (const t of ['tgl 2 makan 20k', 'tgl2 makan 20k', 'tanggal 2 makan 20k', 'tnggl 2 makan 20k']) assert.equal(one(t).result.preset.date, '2026-10-02', t);
  const d = f(one('kmrin beli susu 7k')); assert.equal(d.description, 'Susu');
});
test('date + time: the named date is locked first, then the clock is placed on it', () => {
  assert.deepEqual([f(one('kmrin jam set 3 sore beli kopi 19k')).date, f(one('kmrin jam set 3 sore beli kopi 19k')).time], [Y, '14:30']);
  assert.deepEqual([f(one('tgl 2 jam 12.10 makan 20k')).date, f(one('tgl 2 jam 12.10 makan 20k')).time], ['2026-10-02', '12:10']);
  assert.deepEqual([f(one('tanggal 2 jam set satu kopi 20k')).date, f(one('tanggal 2 jam set satu kopi 20k')).time], ['2026-10-02', '12:30']);
  assert.deepEqual([f(one('kemaren jam tiga lewat 5 sore kopi 20k')).date, f(one('kemaren jam tiga lewat 5 sore kopi 20k')).time], [Y, '15:05']);
  const k = f(one('kemarin beli kopi 20k jam 1')); assert.deepEqual([k.date, k.time], [Y, '13:00']);
  // A named other day has no reference clock: two everyday readings stay to check, never a confident guess.
  const amb = one('kemarin kopi 20k jam 8'); assert.equal(amb.fields.time.status, 'check'); assert.equal(amb.result.preset.date, Y);
});
test('time vs money: amounts are never taken by the clock, a bare 4-digit number is not a time', () => {
  const m = f(one('kopi 12000 jago')); assert.deepEqual([m.amount, m.wallet, m.time], [12000, 'jago', undefined]);
  const c = f(one('kopi 19k jam 1200')); assert.deepEqual([c.amount, c.time], [19000, '12:00']);
  const q = f(one('beli 2 kopi 20k jam 7')); assert.deepEqual([q.amount, q.time], [20000, '07:00']);
  assert.equal(f(one('susu 7,7k jam 1')).amount, 7700);
  assert.equal(f(one('beli air 1200')).time, undefined);
  assert.equal(f(one('beli jam tangan 200rb')).time, undefined);
  const d = f(one('tgl 2 beli susu 7k')); assert.deepEqual([d.amount, d.date], [7000, '2026-10-02']);
});
test('future language: "nanti … jam 7" at 15:00 is 19:00; "besok … jam 8" stays on tomorrow', () => {
  assert.equal(time('nanti bayar 20k jam 7'), '19:00');
  const b = one('besok bayar makan 30k jam 8'); assert.equal(b.result.preset.date, '2026-10-16');
});
test('corrections and negations of times and dates', () => {
  assert.equal(time('kopi 20k jam 1 eh jam 2'), '14:00');
  assert.equal(time('kopi jam 3 sore eh jam set 3 sore 20k'), '14:30');
  assert.equal(one('kemarin makan 20k eh hari ini').result.preset.date, T);
  assert.equal(one('tgl 2, eh tgl 3 kopi 20k').result.preset.date, '2026-10-03');
  assert.equal(time('kopi 20k bukan jam 1, jam 2'), '14:00');
  assert.equal(one('bukan kemarin, hari ini kopi 20k').result.preset.date, T);
  assert.equal(one('bukan tgl 2, tgl 3 kopi 20k').result.preset.date, '2026-10-03');
  const c = f(one('ayam dbesto 12k jam 1 eh jam 2')); assert.deepEqual([c.description, c.merchant, c.time], ['Ayam', "D'Besto", '14:00']);
});
test('multi-action: no temporal leakage; a shared date re-places each clock; a leading time covers "sama"', () => {
  const iso = parseQuickPlan('kopi 20k jam 10 terus makan 30k jam 1', at('15:00')).actions.map(a => a.result.preset.time);
  assert.deepEqual(iso, ['10:00', '13:00']);
  const shared = parseQuickPlan('kemarin kopi 20k jam 8 terus makan 30k jam 12', at('15:00')).actions;
  assert.deepEqual(shared.map(a => a.result.preset.date), [Y, Y]); assert.equal(shared[1].result.preset.time, '12:00');
  assert.deepEqual(parseQuickPlan('jam 8 beli kopi 20k sama roti 10k', at('15:00')).actions.map(a => a.result.preset.time), ['08:00', '08:00']);
  assert.deepEqual(parseQuickPlan('kopi 20k jam 8 terus makan 30k', at('15:00')).actions.map(a => a.result.preset.time), ['08:00', undefined]);
});
test('cross-midnight: an implicit date may move to yesterday with "tadi"; "hari ini" never moves', () => {
  const late = f(one('tadi makan 30k jam 11', '00:30')); assert.deepEqual([late.date, late.time], [Y, '23:00']);
  const noon = f(one('tadi makan 30k jam 12', '00:30')); assert.deepEqual([noon.date, noon.time], [T, '00:00']);
  assert.equal(f(one('tadi kopi 20k jam setengah satu', '01:00')).time, '00:30');
  const today = one('hari ini makan 30k jam 11', '00:30'); assert.equal(today.result.preset.date, T); assert.equal(today.fields.time.status, 'check');
});
test('metamorphic: adding a time phrase changes only the time', () => {
  const pairs = [['kopi di cotti 19k krom', 'kopi di cotti 19k krom jam 1'], ['kemarin kopi 19k', 'kemarin kopi 19k jam 12:10'], ['kopi di cotti 19k jam 12', 'kopi di cotti 19k jam 12 lewat 10'], ['beli ayam dbesto 12k', 'beli ayam dbesto 12k jam 1']];
  for (const [a, b] of pairs) {
    const x = f(one(a)), y = f(one(b));
    assert.deepEqual({ ...y, time: undefined }, { ...x, time: undefined }, `${a} → ${b}`);
    assert.ok(y.time, b);
  }
  assert.equal(f(one('kopi di cotti 19k krom jam 1')).time, '13:00');
});
test('property: for many sentences × time phrases, money/merchant/wallet/description never change and no phrase leaks', () => {
  // Written late in the evening so every phrase is a time already past today.
  const late = t => one(t, '23:30');
  const sentences = ['beli kopi di cotti coffee 19k', 'ayam dbesto 12k krom', 'susu di family mart 20k jago', 'makan di bedeng 12k dari krom', 'kemarin beli susu di b1 piot 7,7k krom'];
  const phrases = ['jam 1', 'jam satu', 'jm 1', 'jam 12.10', 'jam 1200', 'jam set 3 sore', 'jam setengah 2', 'jam 7 lewat 10', 'jam 12 lwt 10', 'pukul 1945'];
  for (const s of sentences) {
    const x = f(late(s));
    for (const p of phrases) {
      const y = f(late(`${s} ${p}`));
      assert.deepEqual([y.amount, y.merchant, y.wallet, y.description, y.date], [x.amount, x.merchant, x.wallet, x.description, x.date], `${s} + ${p}`);
      for (const v of [y.description, y.merchant, y.person]) assert.ok(!/\b(jam|jm|pukul|lewat|lwt|setengah|set)\b/i.test(v || ''), `${s} + ${p}: ${v}`);
      assert.match(y.time, /^([01]\d|2[0-3]):[0-5]\d$/);
    }
  }
});
test('invalid clocks are never accepted', () => {
  for (const t of ['kopi 20k jam 12:75', 'kopi 20k jam 2599', 'kopi 20k jam 25.00']) assert.equal(one(t).result.preset.time, undefined, t);
});
test('temporal Bug Catcher: leaked phrases are removed from free-text fields; a time without a time phrase is dropped', () => {
  const leak = catchTemporalBugs({ kind: 'expense', description: 'Ayam Dbesto Jam 1', merchant: 'Cotti Jam 12:10', time: '13:00' }, ['jam 1', 'jam 12:10'], true, true);
  assert.equal(leak.parse.description, 'Ayam Dbesto'); assert.equal(leak.parse.merchant, 'Cotti');
  assert.ok(leak.warnings.some(w => w.code === 'TEMPORAL_SPAN_LEAKED_INTO_DESCRIPTION')); assert.ok(leak.warnings.some(w => w.code === 'TEMPORAL_SPAN_LEAKED_INTO_MERCHANT'));
  const money = catchTemporalBugs({ kind: 'expense', time: '12:00' }, [], false, true);
  assert.equal(money.parse.time, undefined); assert.ok(money.warnings.some(w => w.code === 'MONEY_MISCLASSIFIED_AS_TIME'));
  const invalid = catchTemporalBugs({ kind: 'expense', time: '12:75' }, ['jam 12:75'], true, true);
  assert.equal(invalid.parse.time, undefined);
  const ignored = catchTemporalBugs({ kind: 'expense' }, ['jam 1'], true, true);
  assert.ok(ignored.warnings.some(w => w.code === 'EXPLICIT_TIME_IGNORED'));
});
test('no time in the text: the time stays unset (the app keeps using the moment it is saved)', () => {
  assert.equal(one('beli kopi 19k').result.preset.time, undefined);
  assert.equal(one('tgl 2 beli kopi 19k').result.preset.time, undefined);
});
test('resolver: a named far date uses everyday hours; daypart and 24h are fixed', () => {
  const e = findTimes('jam 1')[0];
  assert.equal(resolveTime(e, { today: T, now: '15:00', date: '2026-10-02', dateLocked: true, future: false }).time, '13:00');
  assert.equal(resolveTime(findTimes('jam 19:30')[0], { today: T, now: '08:00', date: T, dateLocked: false, future: false }).status, 'check'); // still to come today
  assert.equal(resolveTime(findTimes('jam 19:30')[0], { today: T, now: '20:00', date: T, dateLocked: false, future: false }).status, 'verified');
});
