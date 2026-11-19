import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, advanceSpaceFire, emptySpaceFire, MAX_SHIELDS, readSpaceFire, sameSpaceFire, SPACE_START_SHIELDS, spaceFireView } from '../lib/game.ts';

// 10.3.3 Perisai bareng — the api bareng flame of a Ruang Bersama can be saved by the space's own perisai.
const T = '2026-11-20';
const run = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i));
const ids = ['a', 'b'];
const without = (list, ...days) => list.filter(d => !days.includes(d));

test('one perisai to start with; a missed day is covered and the flame keeps going', () => {
  assert.equal(emptySpaceFire().shields, SPACE_START_SHIELDS);
  const a = run('2026-11-10', 11), b = without(a, '2026-11-15'); // b forgot the 15th; both lit today
  const v = spaceFireView(null, { a, b }, ids, T);
  assert.equal(v.litToday, true);
  assert.equal(v.current, 10); // 11 days, the covered one keeps the run but does not count
  assert.deepEqual(v.saved, ['2026-11-15']);
  assert.equal(v.state.checked, '2026-11-19');
  assert.ok(v.events.some(e => e.kind === 'shield-used' && e.days[0] === '2026-11-15'));
});

test('without a perisai the flame goes out, as before', () => {
  const a = run('2026-11-10', 11), b = without(a, '2026-11-15');
  const v = spaceFireView({ ...emptySpaceFire(), shields: 0 }, { a, b }, ids, T);
  assert.equal(v.current, 5); // 16th–20th, lit today
  assert.deepEqual(v.saved, []);
  assert.equal(v.state.lostRun, 5);
  assert.ok(v.events.some(e => e.kind === 'broken' && e.was === 5));
});

test('two missed days need two perisai (all or nothing)', () => {
  const a = run('2026-11-01', 20), b = without(a, '2026-11-14', '2026-11-15');
  const one = spaceFireView({ ...emptySpaceFire(), shields: 1, checked: '2026-11-13', run: 3, since: '2026-11-11' }, { a, b }, ids, T);
  assert.equal(one.state.lostRun, 3); assert.equal(one.state.shields, 1); // not spent on a gap it cannot cover
  assert.equal(one.current, 5);
  // Seven lit days from the 1st bring the second perisai, so both days are covered.
  const v = spaceFireView(null, { a, b }, ids, T);
  assert.deepEqual(v.saved, ['2026-11-14', '2026-11-15']);
  assert.equal(v.current, 18);
  assert.equal(v.shields, 1); // both spent on the 14th–15th, then the 14th lit day (the 16th) brought one back
});

test('a perisai every 7 days lit together, at most 2, once a day; today counts once everyone is lit', () => {
  const a = run('2026-11-14', 7), b = run('2026-11-14', 6); // the 7th day (today) only a so far
  let v = spaceFireView(null, { a, b }, ids, T);
  assert.equal(v.current, 6); assert.equal(v.atRisk, true); assert.equal(v.shields, 1);
  v = spaceFireView(v.state, { a, b: [...b, T] }, ids, T);
  assert.equal(v.current, 7); assert.equal(v.shields, 2);
  assert.ok(v.events.some(e => e.kind === 'shield-earned' && e.day === T));
  // Looked at again today and tomorrow: not twice.
  const again = spaceFireView(v.state, { a, b: [...b, T] }, ids, T);
  assert.equal(again.shields, 2); assert.equal(again.events.length, 0);
  const tomorrow = spaceFireView({ ...v.state, shields: 1 }, { a, b: [...b, T] }, ids, addDays(T, 1));
  assert.equal(tomorrow.shields, 1); assert.equal(tomorrow.current, 7);
  // A full hand stays full.
  const long = run('2026-10-01', 51);
  assert.equal(spaceFireView(null, { a: long, b: long }, ids, T).shields, MAX_SHIELDS);
});

test('moved on day by day, it gives the same as all at once', () => {
  const a = run('2026-10-20', 32), b = without(a, '2026-10-29', '2026-11-08', '2026-11-09');
  const once = spaceFireView(null, { a, b }, ids, T);
  let s = null;
  for (let d = '2026-10-21'; d <= T; d = addDays(d, 1)) {
    const seen = x => x.filter(day => day <= d);
    s = advanceSpaceFire(s, { a: seen(a), b: seen(b) }, ids, d).state;
  }
  assert.deepEqual(spaceFireView(s, { a, b }, ids, T).current, once.current);
  assert.deepEqual(readSpaceFire(s), readSpaceFire(once.state));
});

test('the run is kept beyond the 60 days each member keeps, and a new member does not put it out', () => {
  const s = { ...emptySpaceFire(), checked: addDays(T, -1), run: 120, since: addDays(T, -120), best: 120 };
  const v = spaceFireView(s, { a: [T], b: [T] }, ids, T);
  assert.equal(v.current, 121);
  // Cici joins today with no days before: the flame waits for her today (yesterday was already looked at).
  const c = spaceFireView(s, { a: [T], b: [T], c: [] }, ['a', 'b', 'c'], T);
  assert.equal(c.current, 120); assert.equal(c.atRisk, true);
  assert.equal(spaceFireView(s, { a: [T], b: [T], c: [T] }, ['a', 'b', 'c'], T).current, 121);
});

test('alone is not "bareng"; nothing moves', () => {
  const v = spaceFireView(null, { a: run('2026-11-01', 20) }, ['a'], T);
  assert.equal(v.current, 0); assert.equal(v.state.checked, '');
});

test('a saved copy is read back safely and compared without the extras', () => {
  assert.equal(readSpaceFire(null), null);
  const r = readSpaceFire({ shields: 9, frozen: ['2026-11-01', 'x', 3], run: -2, checked: 'kemarin', at: { seconds: 1 }, by: 'a' });
  assert.deepEqual(r, { ...emptySpaceFire(), shields: MAX_SHIELDS, frozen: ['2026-11-01'], run: 0 });
  assert.ok(sameSpaceFire({ ...emptySpaceFire(), at: 1, by: 'a' }, emptySpaceFire()));
  assert.ok(!sameSpaceFire(emptySpaceFire(), { ...emptySpaceFire(), shields: 0 }));
});

test('a day is judged only from 03:00 the next morning (members in other time zones)', () => {
  const Y = addDays(T, -1), a = run('2026-11-10', 10), b = run('2026-11-10', 9); // b has not lit the 19th yet (an hour behind)
  const s = { ...emptySpaceFire(), shields: 0, checked: addDays(T, -2), run: 9, since: '2026-11-10', best: 9 };
  // 00:30 on the 20th: the 19th is not over for everyone, so the flame is still on and nothing is saved for good.
  const early = spaceFireView(s, { a, b }, ids, T, 0);
  assert.equal(early.state.checked, addDays(T, -2)); assert.equal(early.current, 9); assert.equal(early.events.length, 0);
  // b lights the 19th before their midnight: it counts.
  assert.equal(spaceFireView(s, { a, b: [...b, Y] }, ids, T, 1).current, 10);
  // From 03:00 the 19th is judged: lit by both, or the end of the run without a perisai.
  assert.equal(spaceFireView(s, { a, b: [...b, Y] }, ids, T, 3).state.checked, Y);
  const late = spaceFireView(s, { a, b }, ids, T, 3);
  assert.equal(late.current, 0); assert.equal(late.state.lostRun, 9);
});
