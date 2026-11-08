import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, addDays, BADGES, challengeFor, challengeProgress, challengesFor, emptyState, flameOf, levelOf, localDay, longestRun, missionsFor, mondayOf, sharedDays, sharedStreak, streakOf, weekCtx, xpForLevel } from '../lib/game.ts';

// 9.4 Arena Catat — the recording streak, perisai, badges, XP, missions, weekly challenge, api bareng.
const T = '2026-11-08'; // a Sunday
const mission = { categorized: false, withNotes: false, quick: false, scan: false, morning: false, adjust: false, visited: [] };
const obs = (extra = {}) => ({ today: T, hour: 14, seed: 'u1', root: 'u1', recordedToday: 0, mission, ...extra });
const run = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i));

test('9.4 dates and streak', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(mondayOf(T), '2026-11-02');
  assert.equal(mondayOf('2026-11-02'), '2026-11-02');
  assert.equal(localDay(Date.UTC(2026, 10, 7, 18, 30), 'Asia/Jakarta'), '2026-11-08');
  assert.deepEqual(streakOf(run('2026-11-01', 8), [], T), { current: 8, litToday: true, atRisk: false, runStart: '2026-11-01' });
  const notYet = streakOf(run('2026-11-01', 7), [], T);
  assert.equal(notYet.current, 7); assert.equal(notYet.atRisk, true);
  assert.equal(streakOf(run('2026-11-01', 6), [], T).current, 0); // yesterday missed
  // A day saved by a perisai keeps the run going but does not count.
  assert.equal(streakOf([...run('2026-11-01', 5), '2026-11-07', T], ['2026-11-06'], T).current, 7);
  assert.equal(longestRun(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07']), 3);
});

test('9.4 looks: flame tiers and levels', () => {
  assert.equal(flameOf(0).name, 'Api padam'); assert.equal(flameOf(2).name, 'Percikan'); assert.equal(flameOf(7).name, 'Api Membara');
  assert.equal(flameOf(30).name, 'Api Ungu'); assert.equal(flameOf(120).name, 'Api Legenda');
  assert.deepEqual([1, 2, 3, 4, 5].map(xpForLevel), [0, 100, 300, 600, 1000]);
  assert.equal(levelOf(0).level, 1); assert.equal(levelOf(99).level, 1); assert.equal(levelOf(100).level, 2);
  assert.equal(levelOf(0).title, 'Pencatat Pemula'); assert.equal(levelOf(1000).title, 'Pengelola Uang');
  assert.match(levelOf(xpForLevel(12)).title, /Legenda Keuangan ★2/);
});

test('9.4 first look: streak from history, opening bonus, a perisai, no badge party', () => {
  const { state, events } = advance(null, obs({ history: run('2026-10-29', 10) }));
  assert.equal(state.best, 10); assert.deepEqual(state.badges, [3, 7]);
  assert.equal(state.xp, 50); assert.equal(state.shields, 1);
  assert.deepEqual(events.map(e => e.kind), ['welcome', 'lit'].filter(k => k === 'welcome'));
  assert.equal(events[0].streak, 10);
});

test('9.4 lighting today: by recording or by "Hari ini aman", once, XP capped', () => {
  let { state } = advance(null, obs({ history: run('2026-11-01', 7) }));
  let r = advance(state, obs({ recordedToday: 2 }));
  assert.ok(r.state.days.includes(T));
  const lit = r.events.find(e => e.kind === 'lit');
  assert.equal(lit.streak, 8); assert.equal(lit.xp, 20 + 16 + 20);
  r = advance(r.state, obs({ recordedToday: 9 })); // more recorded: only up to 5 count
  assert.ok(!r.events.some(e => e.kind === 'lit'));
  assert.equal(r.state.txCounted.u1, 5);
  const xp = r.state.xp; r = advance(r.state, obs({ recordedToday: 12 })); assert.equal(r.state.xp, xp);
  // In a space the same day: no more XP once 5 are counted in total.
  r = advance(r.state, obs({ root: 'space:s1', recordedToday: 3 })); assert.equal(r.state.xp, xp);
  // Check-in on a quiet day.
  const quiet = advance(advance(null, obs({ history: run('2026-11-01', 7) })).state, obs({ checkin: true }));
  assert.ok(quiet.state.checkins.includes(T)); assert.equal(quiet.events.find(e => e.kind === 'lit').checkin, true);
});

test('9.4 perisai: earned every 7 days (max 2), used for missed days, else the flame goes out once', () => {
  // Day 7 earns one.
  let r = advance(advance(null, obs({ today: '2026-11-07', history: run('2026-11-01', 6) })).state, obs({ today: '2026-11-07', recordedToday: 1 }));
  assert.ok(r.events.some(e => e.kind === 'shield-earned')); assert.equal(r.state.shields, 2);
  // Two missed days, two perisai: saved.
  const saved = advance(r.state, obs({ today: '2026-11-10' }));
  assert.equal(saved.events.find(e => e.kind === 'shield-used').days.length, 2);
  assert.equal(saved.state.shields, 0);
  assert.equal(streakOf(saved.state.days, saved.state.frozen, '2026-11-10').current, 7);
  // Three missed days with two perisai: gone (said once).
  const gone = advance(r.state, obs({ today: '2026-11-11' }));
  assert.equal(gone.events.find(e => e.kind === 'broken').was, 7);
  assert.ok(!advance(gone.state, obs({ today: '2026-11-11' })).events.some(e => e.kind === 'broken'));
});

test('9.4 badges and level up are told once', () => {
  let { state } = advance(null, obs({ today: '2026-11-03', history: ['2026-11-01'] }));
  let r = advance(state, obs({ today: '2026-11-02', recordedToday: 1 }));
  r = advance(r.state, obs({ today: '2026-11-03', recordedToday: 1 }));
  const badge = r.events.find(e => e.kind === 'badge');
  assert.equal(badge.days, 3); assert.equal(badge.name, BADGES[0].name);
  r = advance(r.state, obs({ today: '2026-11-03', recordedToday: 2 }));
  assert.ok(!r.events.some(e => e.kind === 'badge'));
  const s = { ...emptyState(), xp: 95, seenLevel: 1, missionDay: T, missionIds: [] };
  const up = advance(s, obs({ recordedToday: 1 }));
  assert.equal(up.events.find(e => e.kind === 'level').level, 2);
});

test('9.4 missions: three a day (two recording, one exploring), stable, done once, bonus for all', () => {
  const ids = missionsFor('u1', T, 9);
  assert.equal(ids.length, 3); assert.deepEqual(missionsFor('u1', T, 9), ids);
  assert.notDeepEqual(missionsFor('u2', T, 9).join() + missionsFor('u1', '2026-11-09', 9).join(), ids.join() + ids.join());
  // Accounts whose names only differ a little still get different missions.
  assert.ok(new Set(['demo-tes', 'demo-dina', 'demo-bejo', 'demo-ana'].map(u => missionsFor(u, T, 9).join())).size >= 3);
  assert.ok(!missionsFor('u1', T, 15).includes('pagi'));
  const s = { ...emptyState(), missionDay: T, missionIds: ['catat2', 'otomatis', 'anggaran'], xpDay: T };
  let r = advance(s, obs({ recordedToday: 2, mission: { ...mission, quick: true } }));
  assert.deepEqual(r.events.filter(e => e.kind === 'mission').map(e => e.id), ['catat2', 'otomatis']);
  r = advance(r.state, obs({ recordedToday: 2, mission: { ...mission, quick: true, visited: ['budgets'] } }));
  assert.deepEqual(r.events.filter(e => e.kind === 'mission' || e.kind === 'missions-all').map(e => e.kind), ['mission', 'missions-all']);
  assert.ok(!advance(r.state, obs({ recordedToday: 2, mission: { ...mission, quick: true, visited: ['budgets'] } })).events.some(e => e.kind === 'mission'));
});

test('9.4 weekly challenge: from habits, progress, won at once or at the end of the week', () => {
  const habits = { weeklyRecorded: 20, lastWeekSpent: 900000, topCategory: { id: 'kopi', name: 'Kopi', perWeek: 5 } };
  const list = challengesFor(habits).map(c => c.id);
  assert.deepEqual(list, ['api7', 'tanpajajan2', 'catat15', 'batas:kopi', 'hemat']);
  assert.equal(challengesFor({ weeklyRecorded: 2, lastWeekSpent: 0, topCategory: null }).length, 2);
  // Picked on Sunday after one lit day: only what is still possible.
  const late = challengesFor(habits, { dayIndex: 6, litBefore: 1 });
  assert.deepEqual(late.map(c => c.id), ['api7']); assert.equal(late[0].target, 2); assert.match(late[0].title, /Nyalakan api 2 hari/);
  assert.equal(late[0].xp, 60);
  assert.equal(challengeFor('u1', '2026-11-02', habits, { dayIndex: 5, litBefore: 2 }), null); // Sabtu: a new one on Senin
  assert.deepEqual(challengesFor(habits, { dayIndex: 3, litBefore: 3 }).map(c => c.id), ['api7', 'tanpajajan2', 'catat15', 'batas:kopi', 'hemat']);
  assert.equal(challengesFor(habits, { dayIndex: 3, litBefore: 3 })[0].title, 'Jaga api nyala sampai Minggu');
  const kopi = challengesFor(habits).find(c => c.categoryId === 'kopi');
  assert.equal(kopi.target, 4); assert.match(kopi.title, /Maksimal 4× Kopi/);
  const raw = { recorded: 9, spent: 300000, spendDays: ['2026-11-02', '2026-11-04'], categoryCount: { kopi: 3 } };
  const w = weekCtx(run('2026-11-02', 6), '2026-11-02', T, raw);
  assert.equal(w.litDays, 6); assert.equal(w.noSpendDays, 4);
  assert.deepEqual(challengeProgress(kopi, w, false), { value: 3, won: false, lost: false });
  assert.equal(challengeProgress(kopi, w, true).won, true);
  assert.equal(challengeProgress(kopi, { ...w, categoryCount: { kopi: 5 } }, false).lost, true);
  assert.equal(challengeProgress(kopi, { ...w, litDays: 3 }, true).won, false);
  assert.ok(challengesFor(habits).some(c => c.id === challengeFor('u1', '2026-11-02', habits)?.id));
  // Won during the week (2 quiet days) gives the XP once.
  const s = { ...emptyState(), week: '2026-11-02', challenge: challengesFor(habits)[1], days: run('2026-11-02', 6), missionDay: T, missionIds: [] };
  const r = advance(s, obs({ week: raw, habits }));
  assert.equal(r.events.filter(e => e.kind === 'challenge').length, 1); assert.equal(r.state.challengeDone, true);
});

test('9.4 api bareng: a day counts only when every member was lit', () => {
  const tes = run('2026-11-01', 8), dina = [...run('2026-11-01', 7)];
  const s = sharedStreak({ tes, dina }, ['tes', 'dina'], T);
  assert.equal(s.current, 7); assert.equal(s.litToday, false); assert.equal(s.atRisk, true);
  assert.deepEqual(s.members, [{ id: 'tes', litToday: true }, { id: 'dina', litToday: false }]);
  assert.equal(sharedStreak({ tes, dina: [...dina, T] }, ['tes', 'dina'], T).current, 8);
  assert.equal(sharedStreak({ tes }, ['tes'], T).current, 0); // alone is not "bareng"
  assert.deepEqual(sharedDays({ days: ['2026-11-01'], frozen: ['2026-11-02'] }), ['2026-11-01', '2026-11-02']);
});
