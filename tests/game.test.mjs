import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, canSpin, COIN_XP_CAP, coinResult, coinXpLeft, SPIN_PRIZES, spinIndex, spinWheel, advance, addDays, BADGE_GROUPS, BADGE_TOTAL, BADGES, badgeList, challengeFor, nearestBadge, spaceDays, TIERS, challengeProgress, challengesFor, emptyState, flameOf, levelOf, localDay, longestRun, missionsFor, mondayOf, sharedDays, sharedStreak, streakOf, weekCtx, xpForLevel } from '../lib/game.ts';

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

test('9.5 api bareng counts only what is done in that space', () => {
  // Days recorded in the space and check-ins tapped there; sorted, no repeats, the last 60, only real dates.
  assert.deepEqual(spaceDays(['2026-11-07'], ['2026-11-08', '2026-11-07'], ['2026-11-06']), ['2026-11-06', '2026-11-07', '2026-11-08']);
  assert.deepEqual(spaceDays([], [], ['x', '']), []);
  assert.equal(spaceDays(run('2026-08-01', 70), []).length, 60);
  // A space check-in does not light the Pribadi flame: only o.checkin (Pribadi) does.
  const s = { ...emptyState(), days: run('2026-11-01', 7), missionDay: T, missionIds: [] };
  assert.equal(advance(s, obs()).state.days.includes(T), false);
  // Recording in a space still lights the Pribadi flame (root of the space, same streak).
  assert.equal(advance(s, obs({ root: 'space:s1', recordedToday: 1 })).state.days.includes(T), true);
});

test('9.5 more badges: 33 in four tiers, by group, unlocked once with XP, quiet on the first look', () => {
  assert.equal(BADGE_TOTAL, 33); assert.equal(ACHIEVEMENTS.length, 25);
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, 25);
  assert.ok(ACHIEVEMENTS.every(a => BADGE_GROUPS.some(g => g.id === a.group) && TIERS[a.tier]));
  // The first look gives the badges already earned without a party.
  const first = advance(null, obs({ history: run('2026-10-20', 20) }));
  assert.ok(first.state.achievements.hari10); assert.equal(first.events.some(e => e.kind === 'achievements'), false);
  // First mission done → "Misi Pertama" (+50 XP), told together with others reached at the same moment.
  const s = { ...emptyState(), days: run('2026-11-01', 7), missionDay: T, missionIds: ['catat2'], missionsDone: [], stats: { ...emptyState().stats } };
  const r = advance(s, obs({ recordedToday: 2, mission: { ...mission, early: true } }));
  const ev = r.events.find(e => e.kind === 'achievements');
  assert.ok(ev, 'badges event'); assert.deepEqual(ev.items.map(x => x.id).sort(), ['misi1', 'pagi']);
  assert.equal(ev.items.find(x => x.id === 'misi1').xp, 50);
  assert.ok(r.state.achievements.misi1 === T && r.state.achievements.pagi === T);
  // Not again.
  assert.equal(advance(r.state, obs({ recordedToday: 3, mission: { ...mission, early: true } })).events.some(e => e.kind === 'achievements'), false);
  // Shields used, a comeback, a checkin-day count.
  const saved = advance({ ...emptyState(), days: run('2026-11-01', 6), shields: 1, missionDay: T, missionIds: [] }, obs({ recordedToday: 1 }));
  assert.equal(saved.state.stats.shields, 1); assert.ok(saved.state.achievements.perisai);
  const back = advance({ ...emptyState(), days: ['2026-11-01'], lostRun: 4, lostDay: '2026-11-01', missionDay: T, missionIds: [] }, obs({ checkin: true }));
  assert.equal(back.state.stats.comebacks, 1); assert.equal(back.state.stats.checkins, 1); assert.ok(back.state.achievements.bangkit);
  // Api bareng streak counted from the spaces.
  assert.equal(advance(s, obs({ shared: 7 })).state.stats.sharedBest, 7);
  // An old 9.4 state (no stats) keeps working.
  const old = { ...emptyState() }; delete old.stats; delete old.achievements;
  assert.equal(advance(old, obs({ recordedToday: 1 })).state.stats.missions, 0);
});

test('9.5 badge list: progress for every badge and the nearest one', () => {
  const s = { ...emptyState(), days: run('2026-11-01', 8), best: 8, badges: [3, 7], stats: { ...emptyState().stats, missions: 25 }, achievements: { misi1: '2026-11-02' } };
  const list = badgeList(s, T);
  assert.equal(list.length, 33);
  const api14 = list.find(b => b.id === 'api14');
  assert.deepEqual([api14.value, api14.target, api14.got, api14.tier], [8, 14, null, 'perak']);
  assert.equal(list.find(b => b.id === 'api7').got, 'ya');
  assert.equal(list.find(b => b.id === 'misi1').got, '2026-11-02');
  assert.equal(list.find(b => b.id === 'misi30').value, 25);
  assert.equal(nearestBadge(list).id, 'misi30'); // 25/30 is the closest
  assert.equal(list.filter(b => b.group === 'Api').length, BADGES.length);
});

test('9.6 streak badges each have their own picture and climb the tiers', () => {
  assert.equal(new Set(BADGES.map(b => b.emoji)).size, BADGES.length);
  const list = badgeList({ ...emptyState() }, T).filter(b => b.group === 'Api');
  assert.deepEqual(list.map(b => b.tier), ['perunggu', 'perak', 'perak', 'emas', 'emas', 'legenda', 'legenda', 'legenda']);
});

test('9.6 Putar Roda: once a day after the flame is lit, a fixed prize per day', () => {
  assert.equal(SPIN_PRIZES.reduce((n, p) => n + p.weight, 0), 100);
  assert.equal(spinIndex('u1', T), spinIndex('u1', T)); // the same day lands on the same prize
  const counts = SPIN_PRIZES.map(() => 0);
  for (let i = 0; i < 2000; i++) counts[spinIndex(`u${i % 37}`, addDays('2026-01-01', i))]++;
  assert.ok(counts.every(n => n > 0)); assert.ok(counts[6] < counts[0]); // +100 is rarer than +10
  const s = { ...emptyState(), days: run('2026-11-01', 7), xp: 100 };
  assert.equal(canSpin(s, T), false); assert.equal(spinWheel(s, T, 'u1'), null); // not lit yet today
  const lit = { ...s, days: [...s.days, T] };
  const r = spinWheel(lit, T, 'u1');
  assert.ok(r); assert.equal(r.state.spinDay, T); assert.equal(r.state.stats.spins, 1);
  const p = SPIN_PRIZES[r.index];
  if (p.shield) assert.ok(r.shield || r.xp === 50); else assert.equal(r.state.xp, 100 + p.xp);
  assert.equal(spinWheel(r.state, T, 'u1'), null); // once a day
  // A perisai prize with a full hand turns into +50 XP.
  const seed = Array.from({ length: 500 }, (_, i) => `s${i}`).find(x => SPIN_PRIZES[spinIndex(x, T)].shield);
  const full = spinWheel({ ...lit, shields: 2 }, T, seed); assert.equal(full.shield, false); assert.equal(full.xp, 50); assert.equal(full.state.shields, 2);
  const room = spinWheel({ ...lit, shields: 0 }, T, seed); assert.equal(room.shield, true); assert.equal(room.state.shields, 1); assert.equal(room.xp, 0);
});

test('9.6 Tangkap Koin: a third of the score in XP, at most 30 a day; best score kept', () => {
  const s = { ...emptyState(), xp: 50 };
  const a = coinResult(s, T, 40);
  assert.deepEqual([a.xp, a.record, a.best, a.state.xp, a.state.coinXp], [13, true, 40, 63, 13]);
  const b = coinResult(a.state, T, 70); assert.equal(b.xp, 17); assert.equal(b.best, 70); assert.equal(coinXpLeft(b.state, T), 0);
  const c = coinResult(b.state, T, 90); assert.equal(c.xp, 0); assert.equal(c.record, true); assert.equal(c.state.coinBest, 90); // XP full, record still counts
  const d = coinResult(c.state, T, 10); assert.equal(d.record, false);
  assert.equal(coinXpLeft(d.state, addDays(T, 1)), COIN_XP_CAP); // a new day
  assert.equal(coinResult(d.state, addDays(T, 1), 30).xp, 10);
  assert.equal(d.state.stats.coinGames, 4); assert.equal(d.state.stats.coinBest, 90);
  // The badges for the mini games come from these counters.
  const r = advance({ ...d.state, missionDay: T, missionIds: [] }, obs());
  assert.ok(r.state.achievements.koin30 && r.state.achievements.koin80);
});
