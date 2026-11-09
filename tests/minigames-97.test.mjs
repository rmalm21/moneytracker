import test from 'node:test';
import assert from 'node:assert/strict';
import { BILL, BILL_POINTS, BOMB, COLS, KINDS, MATCH_BILLS, MATCH_STAR, PIECES, ROWS, clearOnce, countBills, endBonus, fall, findGroups, findMove, hammer, hasMove, matchStars, newBoard, playMove, seeded, shuffle, validSwap } from '../lib/match3.ts';
import { ROUND_MIX, SCENARIOS, SHOP_MISSIONS, dealRound, scoreRound, shopMission, shopMissionDone, shopStars, verdict } from '../lib/belanja.ts';
import { ARCADE, MAX_SHIELDS, SCRATCH_PRIZES, SPIN_PRIZES, advance, addDays, arcadeResult, arcadeXpLeft, canScratch, emptyState, goldenSpin, matchMission, scratchCard, scratchGrid, scratchIndex, spinIndex, spinRun, spinWheel } from '../lib/game.ts';

// 9.7 mini games: Cocok Cuan (match-3 with money pieces), Belanja Bijak (buy or skip with a week's money), Gosok Berhadiah.
const T = '2026-11-08';
const ctx = (seed = 7) => ({ rand: seeded(seed), id: 1 });
/** A board from rows of kind numbers (a letter for a special: h, v, a = area, b = bomb; t = tagihan). */
function board(rows) {
  let id = 1;
  return rows.map(line => line.split(' ').map(x => {
    if (x === '.') return null;
    if (x === 'b') return { id: id++, kind: BOMB, special: 'bomb' };
    if (x === 't') return { id: id++, kind: BILL };
    const kind = Number(x[0]), sp = { h: 'h', v: 'v', a: 'area' }[x[1]];
    return { id: id++, kind, ...(sp ? { special: sp } : {}) };
  }));
}

test('9.7 Cocok Cuan: a new board has no lines, has a move, and is the same for the same seed', () => {
  for (let s = 1; s <= 40; s++) {
    const b = newBoard(ctx(s));
    assert.equal(b.length, ROWS); assert.equal(b[0].length, COLS);
    assert.equal(findGroups(b).length, 0); assert.ok(hasMove(b)); assert.ok(findMove(b));
    assert.ok(b.flat().every(t => t && t.kind >= 0 && t.kind < KINDS));
  }
  assert.deepEqual(newBoard(ctx(3)).flat().map(t => t.kind), newBoard(ctx(3)).flat().map(t => t.kind));
  assert.equal(PIECES.length, KINDS);
});

test('9.7 Cocok Cuan: lines, an L joins into one group, swaps that make nothing are refused', () => {
  const b = board([
    '0 1 2 3',
    '0 2 3 1',
    '0 0 0 2',
    '3 1 2 3',
  ]);
  const g = findGroups(b);
  assert.equal(g.length, 1); assert.equal(g[0].cells.length, 5); assert.equal(g[0].kind, 0); // the L is one group
  const flat = board(['0 1 0 3', '2 0 3 1', '1 2 1 2']);
  assert.equal(findGroups(flat).length, 0);
  assert.equal(validSwap(flat, [0, 1], [1, 1]), true); // 0 drops into the top row: 0 0 0
  assert.equal(validSwap(flat, [2, 0], [2, 1]), false);
  assert.equal(validSwap(flat, [0, 0], [2, 0]), false); // not next to each other
});

test('9.7 Cocok Cuan: four makes a petir, an L makes a ledakan, five makes a Bom Cuan', () => {
  const four = clearOnce(board(['0 0 0 0 1', '1 2 3 4 2', '2 3 4 1 3']), ctx(), 1, [[0, 1], [1, 1]]);
  assert.equal(four.created.length, 1); assert.equal(four.created[0].tile.special, 'h'); assert.deepEqual(four.created[0].cell, [0, 1]);
  assert.equal(four.points, 4 * 10 + 30);
  const ell = clearOnce(board(['0 1 2 3', '0 2 3 1', '0 0 0 2', '3 1 2 3']), ctx(), 1);
  assert.equal(ell.created[0].tile.special, 'area');
  const five = clearOnce(board(['0 0 0 0 0', '1 2 3 4 2', '2 3 4 1 3']), ctx(), 1);
  assert.equal(five.created[0].tile.kind, BOMB); assert.equal(five.created[0].tile.special, 'bomb');
  // A petir in a line takes its whole row with it.
  const fired = clearOnce(board(['1 2 3 4 5', '0 0h 0 3 2', '4 5 1 2 3']), ctx(), 1);
  assert.ok(fired.fired.includes('h')); assert.equal(fired.cleared.length, 5);
  // A chain is worth more: the same clearing at chain 2 doubles the per-piece points.
  assert.equal(clearOnce(board(['0 0 0 1', '1 2 3 4']), ctx(), 2).points, 3 * 10 * 2);
});

test('9.7 Cocok Cuan: a moved Bom Cuan takes every piece of the other kind; two bombs take the board', () => {
  const b = board(['b 1 2 1', '2 3 1 4', '1 4 3 2']);
  const step = clearOnce(b, ctx(), 1, [[0, 0], [0, 1]]);
  assert.ok(step.fired.includes('bomb'));
  assert.equal(step.byKind[1], 4); // every 1 on the board
  const both = clearOnce(board(['b b 2', '2 3 1']), ctx(), 1, [[0, 0], [0, 1]]);
  assert.equal(both.cleared.length, 6);
  assert.equal(validSwap(b, [0, 0], [1, 0]), true); // moving a bomb always counts
});

test('9.7 Cocok Cuan: pieces fall, new ones fill the top, a move plays out the same for the same seed', () => {
  const holes = board(['0 1 2', '. 2 .', '3 . 1']);
  const after = fall(holes, ctx());
  assert.ok(after.flat().every(Boolean));
  assert.equal(after[2][0].kind, 3); assert.equal(after[1][0].kind, 0); // what was there drops down, in order
  const run = seed => { const c = ctx(seed); let b = newBoard(c), total = 0; for (let i = 0; i < 10; i++) { const m = findMove(b); const r = playMove(b, c, ...m); total += r.points; b = r.board; assert.ok(hasMove(b)); assert.equal(findGroups(b).length, 0); } return total; };
  assert.equal(run(11), run(11));
  assert.ok(run(11) > 0);
  assert.equal(playMove(board(['0 1 0 3', '2 0 3 1', '1 2 1 2']), ctx(), [2, 0], [2, 1]), null);
  const shuffled = shuffle(board(['0 1 2', '1 2 0', '2 0 1']), ctx());
  assert.ok(hasMove(shuffled)); assert.equal(findGroups(shuffled).length, 0);
});

test('9.7 Cocok Cuan: stars, the daily mission, XP per 150 points up to 25 a day', () => {
  assert.deepEqual([0, 1799, 1800, 3000, 4199, 4200].map(matchStars), [0, 0, 1, 2, 2, 3]);
  assert.deepEqual([...MATCH_STAR], [1800, 3000, 4200]);
  assert.equal(matchMission('u1', T).id, matchMission('u1', T).id);
  const ids = new Set(Array.from({ length: 60 }, (_, i) => matchMission(`u${i}`, T).id));
  assert.ok(ids.has('bom') && ids.has('rantai4') && ids.has('kumpul0') && ids.has('tagihan8'));
  const s = { ...emptyState(), xp: 10 };
  const a = arcadeResult(s, T, 'match', 1600, { mission: true });
  assert.deepEqual([a.xp, a.missionXp, a.record, a.best, a.state.xp], [15, 5, true, 1600, 25]);
  assert.equal(arcadeXpLeft(a.state, 'match', T), ARCADE.match.cap - 15);
  const b = arcadeResult(a.state, T, 'match', 3000, { mission: true }); assert.equal(b.missionXp, 0); assert.equal(b.xp, 10); // the cap, the bonus once a day
  const c = arcadeResult(b.state, T, 'match', 5000); assert.equal(c.xp, 0); assert.equal(c.record, true);
  assert.deepEqual(c.top, [5000, 3000, 1600]); assert.equal(c.state.stats.matchBest, 5000);
  assert.equal(arcadeXpLeft(c.state, 'match', addDays(T, 1)), 25);
  assert.equal(arcadeXpLeft(c.state, 'shop', T), ARCADE.shop.cap); // each game has its own cap
  const r = advance({ ...c.state, missionDay: T, missionIds: [] }, { today: T, hour: 14, seed: 'u1', root: 'u1', recordedToday: 0, mission: { visited: [] } });
  assert.ok(r.state.achievements.cuan4k);
});

test('9.7 Cocok Cuan: tagihan sit still, are paid off next to a match, the Palu and the end bonus', () => {
  for (let s = 1; s <= 30; s++) {
    const b = newBoard(ctx(s), ROWS, COLS, MATCH_BILLS);
    assert.equal(countBills(b), MATCH_BILLS); assert.ok(b.slice(0, 2).flat().every(t => t.kind !== BILL)); // not in the top two rows
    assert.equal(findGroups(b).length, 0); assert.ok(hasMove(b));
  }
  const b = board(['0 1 2 3', 't 0 0 1', '2 3 4 5']);
  assert.equal(validSwap(b, [1, 0], [0, 0]), false); // a tagihan cannot be moved
  const step = clearOnce(board(['1 2 3 4', '0 0 0 t', '2 3 4 5']), ctx(), 1);
  assert.equal(step.bills, 1); assert.equal(step.points, 3 * 10 + BILL_POINTS); assert.equal(step.board[1][3], null);
  assert.equal(findGroups(board(['t t t', '0 1 2'])).length, 0); // tagihan never match each other
  // A Petir takes a tagihan in its row.
  assert.equal(clearOnce(board(['1 2 3 4 5', '0 0h 0 3 t', '4 5 1 2 3']), ctx(), 1).bills, 1);
  // The Palu: one piece (a special goes off; a tagihan is paid off).
  const h = hammer(board(['0 1 2', '3 t 4', '5 0 1']), [1, 1]);
  assert.equal(h.bills, 1); assert.equal(h.cleared.length, 1);
  assert.equal(hammer(board(['0 1h 2', '3 4 5']), [0, 1]).cleared.length, 3);
  // The end bonus: the specials left go off (none: nothing happens).
  assert.equal(endBonus(board(['0 1 2', '3 4 5'])), null);
  const eb = endBonus(board(['0 1v 2', '3 4 5', '0 1 2']));
  assert.ok(eb.fired.includes('v')); assert.equal(eb.cleared.length, 3);
  // New tagihan now and then, never more than three on the board.
  const c = { rand: seeded(5), id: 1, billRate: 1 }, empty = Array.from({ length: 4 }, () => Array(4).fill(null));
  assert.equal(countBills(fall(empty, c)), 3);
  // A Bom Cuan never takes a tagihan as "the most common kind".
  const bomb = clearOnce(board(['b 1 t t', 't t t 2', '1 2 1 3']), ctx(), 1, [[0, 0], [0, 1]]);
  assert.equal(bomb.byKind[1], 3);
});

test('9.7 Belanja Bijak: five scenarios, a new hand each round, urgent and extra money', () => {
  assert.equal(SCENARIOS.length, 5);
  for (const sc of SCENARIOS) {
    assert.deepEqual(['need', 'want', 'trap', 'urgent', 'bonus'].map(k => sc.items.filter(x => x.kind === k).length), [6, 6, 5, 2, 2], sc.id);
    assert.equal(new Set(sc.items.map(x => x.id)).size, sc.items.length);
    for (let s = 1; s <= 40; s++) {
      const r = dealRound(seeded(s), sc.id);
      assert.equal(r.cards.length, 13);
      for (const k of Object.keys(ROUND_MIX)) assert.equal(r.cards.filter(c => c.kind === k).length, ROUND_MIX[k]);
      assert.ok(['need', 'want'].includes(r.cards[0].kind));
      assert.ok(r.cards.findIndex(c => c.kind === 'urgent') >= 6, 'urgent in the second half');
      assert.equal(scoreRound(sc, r.cards, r.cards.map(c => c.kind === 'need')).score, 100, `${sc.id}/${s}: needs only is perfect`);
    }
  }
  const hands = new Set(Array.from({ length: 20 }, (_, s) => dealRound(seeded(s + 1), 'kos').cards.map(c => c.id).sort().join()));
  assert.ok(hands.size > 15, 'different hands');
});

test('9.7 Belanja Bijak: the score, traps said yes to, debt, the 50/30/20 report, stars, verdicts', () => {
  const sc = SCENARIOS[0], pick = ids => ids.map(id => sc.items.find(x => x.id === id));
  // Needs only, with the urgent thing and extra money: perfect, money kept aside.
  const cards = pick(['galon', 'boba', 'laundry', 'kiriman', 'sepatu', 'token', 'obat', 'makan', 'topup']);
  const wise = scoreRound(sc, cards, cards.map(c => c.kind === 'need'));
  assert.equal(wise.score, 100); assert.equal(wise.income, 40_000); assert.equal(wise.total, 240_000);
  assert.equal(wise.left, 240_000 - 130_000 - 15_000); assert.ok(wise.urgentPaid); assert.equal(wise.debt, 0);
  assert.deepEqual(wise.split, { needs: Math.round(145 / 240 * 100), wants: 0, saved: Math.round(95 / 240 * 100) });
  assert.equal(wise.good, wise.decisions); assert.equal(wise.stars, 3);
  // A trap first eats the money: needs blocked, the urgent thing becomes a debt.
  const bad = pick(['sepatu', 'galon', 'laundry', 'token', 'ban']);
  const r = scoreRound(sc, bad, bad.map(() => true));
  assert.deepEqual(r.blocked.map(b => b.id), ['token']); assert.equal(r.needsGot, 2); assert.equal(r.trapsBought.length, 1);
  assert.equal(r.urgentPaid, false); assert.equal(r.debt, 25_000); assert.equal(r.left, 0);
  assert.ok(r.tips[0].includes('ngutang')); assert.ok(r.score < 40);
  // A trap said yes to counts even when the money ran out.
  const late = pick(['galon', 'laundry', 'token', 'makan', 'angkot', 'sabun', 'sepatu']);
  const lr = scoreRound(sc, late, late.map(() => true));
  assert.deepEqual(lr.blocked.map(b => b.id), ['sepatu']); assert.equal(lr.trapsBought.length, 1);
  assert.deepEqual([0, 59, 60, 80, 94, 95, 100].map(shopStars), [0, 0, 1, 2, 2, 3, 3]);
  assert.equal(verdict(sc.items.find(x => x.id === 'sepatu'), false).tone, 'good');
  assert.equal(verdict(sc.items.find(x => x.id === 'galon'), false).tone, 'bad');
  assert.equal(verdict(sc.items.find(x => x.id === 'boba'), true).tone, 'ok');
  assert.equal(verdict(sc.items.find(x => x.id === 'ban'), true, false).tone, 'bad');
});

test('9.7 Belanja Bijak: the daily mission, XP is the score / 5 up to 20 a day', () => {
  assert.equal(shopMission('u1', T).id, shopMission('u1', T).id);
  const seen = new Set(Array.from({ length: 80 }, (_, k) => shopMission(`u${k}`, T).id));
  assert.equal(seen.size, SHOP_MISSIONS.length);
  const sc = SCENARIOS[0], cards = sc.items.filter(x => ['galon', 'laundry', 'token', 'makan', 'obat', 'sepatu'].includes(x.id));
  const wise = scoreRound(sc, cards, cards.map(c => c.kind === 'need')), greedy = scoreRound(sc, cards, cards.map(() => true));
  for (const m of SHOP_MISSIONS) assert.equal(shopMissionDone(m, wise), m.id === 'sisa30' ? wise.left >= wise.total * .3 : true, m.id);
  assert.equal(shopMissionDone(SHOP_MISSIONS[0], greedy), false);
  const a = arcadeResult({ ...emptyState() }, T, 'shop', 85, { mission: true });
  assert.deepEqual([a.xp, a.missionXp, a.best, a.state.stats.shopBest], [20, 3, 85, 85]);
  const b = arcadeResult(a.state, T, 'shop', 95); assert.equal(b.xp, 0); assert.equal(b.record, true);
  const r = advance({ ...b.state, missionDay: T, missionIds: [] }, { today: T, hour: 14, seed: 'u1', root: 'u1', recordedToday: 0, mission: { visited: [] } });
  assert.ok(r.state.achievements.bijak90);
});

test('9.7 Putar Roda: seven days in a row makes Roda Emas (prize ×2)', () => {
  const lit = day => ({ days: [day] });
  let s = { ...emptyState(), xp: 0 };
  for (let k = 0; k < 6; k++) { const day = addDays(T, k); assert.equal(goldenSpin(s, day), false); s = spinWheel({ ...s, ...lit(day), days: [...s.days, day] }, day, 'u1').state; }
  const day7 = addDays(T, 6);
  assert.equal(spinRun(s, day7), 6); assert.equal(goldenSpin(s, day7), true);
  const before = s.xp, r = spinWheel({ ...s, days: [...s.days, day7], shields: MAX_SHIELDS }, day7, 'u1');
  const p = SPIN_PRIZES[spinIndex('u1', day7)];
  assert.equal(r.golden, true); assert.equal(r.xp, p.shield ? 100 : p.xp * 2); assert.equal(r.state.xp, before + r.xp);
  assert.equal(goldenSpin(r.state, addDays(T, 7)), false); // day 8 starts the next seven
  assert.equal(spinRun(r.state, addDays(T, 9)), 0); // a day missed
  assert.ok(r.state.spinDays.length <= 14);
});

test('9.7 Gosok Berhadiah: once a day after all three missions, a fixed prize per day', () => {
  assert.equal(SCRATCH_PRIZES.reduce((n, p) => n + p.weight, 0), 100);
  const done = { ...emptyState(), xp: 100, missionDay: T, missionBonus: true };
  assert.equal(canScratch({ ...done, missionBonus: false }, T), false);
  assert.equal(canScratch({ ...done, missionDay: addDays(T, -1) }, T), false);
  assert.equal(canScratch(done, T), true);
  assert.equal(scratchIndex('u1', T), scratchIndex('u1', T));
  const r = scratchCard(done, T, 'u1');
  const p = SCRATCH_PRIZES[r.index];
  if (!p.shield) assert.equal(r.state.xp, 100 + p.xp);
  assert.equal(r.state.scratchDay, T); assert.equal(r.state.stats.scratches, 1);
  assert.equal(scratchCard(r.state, T, 'u1'), null); // once a day
  assert.equal(scratchCard({ ...emptyState() }, T, 'u1'), null); // missions not done
  // A perisai with a full hand turns into +30 XP.
  const seed = Array.from({ length: 500 }, (_, i) => `s${i}`).find(x => SCRATCH_PRIZES[scratchIndex(x, T)].shield);
  const full = scratchCard({ ...done, shields: MAX_SHIELDS }, T, seed); assert.deepEqual([full.shield, full.xp, full.state.shields], [false, 30, MAX_SHIELDS]);
  const room = scratchCard({ ...done, shields: 0 }, T, seed); assert.deepEqual([room.shield, room.xp, room.state.shields], [true, 0, 1]);
  // Seven days of scratching: "Hoki Terus".
  let s = { ...done };
  for (let i = 0; i < 7; i++) { const day = addDays(T, i); s = scratchCard({ ...s, missionDay: day, missionBonus: true }, day, 'u1').state; }
  const a = advance({ ...s, missionDay: addDays(T, 6), missionIds: [] }, { today: addDays(T, 6), hour: 14, seed: 'u1', root: 'u1', recordedToday: 0, mission: { visited: [] } });
  assert.ok(a.state.achievements.gosok7);
});

test('9.7 Gosok Berhadiah: the 3×3 card has the prize three times and no other three', () => {
  for (let k = 0; k < 60; k++) {
    const seed = `u${k}`, grid = scratchGrid(seed, T), win = scratchIndex(seed, T);
    assert.equal(grid.length, 9);
    assert.equal(grid.filter(x => x === win).length, 3);
    for (let p = 0; p < SCRATCH_PRIZES.length; p++) if (p !== win) assert.ok(grid.filter(x => x === p).length <= 2);
  }
  assert.deepEqual(scratchGrid('u1', T), scratchGrid('u1', T));
  assert.notDeepEqual(scratchGrid('u1', T), scratchGrid('u1', addDays(T, 1)));
  assert.ok(SCRATCH_PRIZES.every(p => p.emoji));
});
