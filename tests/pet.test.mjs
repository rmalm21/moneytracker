import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCESSORIES, CARE, CARE_GAP, MEALS_A_DAY, MEAL_GAP, MONEY_TIPS, NEEDS, PETS, PET_KINDS, PLAY_EVERY, adopt, care, feed, mealWait, asleep, cleanName, collectEgg, eggReady, emptyPet, growthFor, hematScore, levelOf, moodOf, needsAt, pet, petEmoji, petTip, play, readTip, rename, stageOf, syncPet, unlocked, wear } from '../lib/pet.ts';

// 9.8 Pet next to the chat button: six pets with a name, needs of their own, growth, accessories, mood, tips.
const H = 3_600_000, T0 = Date.UTC(2026, 10, 9, 5, 0); // 12:00 in Jakarta
const hourOf = ms => new Date(ms + 7 * H).getUTCHours();
const sig = (extra = {}) => ({ today: '2026-11-09', recordedToday: 0, lit: false, missions: 10, games: 4, xp: 500, now: T0, ...extra });

test('9.8 six pets, each with its own food, its own need and its own special', () => {
  assert.deepEqual(PET_KINDS, ['kucing', 'anjing', 'hantu', 'ayam', 'elang', 'tokek']);
  assert.equal(new Set(PET_KINDS.map(k => PETS[k].needs[1])).size, 6, 'every pet has a need of its own');
  assert.equal(new Set(PET_KINDS.map(k => PETS[k].food.emoji)).size, 6);
  assert.equal(new Set(PET_KINDS.map(k => PETS[k].special.name)).size, 6);
  assert.equal(new Set(PET_KINDS.map(k => PETS[k].voice)).size, 6);
  for (const k of PET_KINDS) { assert.equal(PETS[k].needs[0], 'kenyang'); assert.equal(PETS[k].needs[2], 'senang'); assert.ok(NEEDS[PETS[k].needs[1]]); }
  assert.equal(cleanName('  Si   Belang Kesayangan Banget  ', 'kucing'), 'Si Belang Kesaya');
  assert.equal(cleanName('   ', 'anjing'), 'Bruno');
});

test('9.8 adopting, naming, switching (each pet keeps its own name and growth)', () => {
  let s = adopt(emptyPet(), 'kucing', 'Mochi', T0, '2026-11-09');
  assert.equal(s.active, 'kucing'); assert.equal(s.pets.kucing.name, 'Mochi'); assert.equal(s.pets.kucing.growth, 0);
  s = rename(s, 'kucing', 'Mochi Gembul'); assert.equal(s.pets.kucing.name, 'Mochi Gembul');
  s.pets.kucing.growth = 300;
  s = adopt(s, 'tokek', '', T0, '2026-11-09'); assert.equal(s.active, 'tokek'); assert.equal(s.pets.tokek.name, 'Toki');
  s = adopt(s, 'kucing', '', T0 + H, '2026-11-09'); assert.equal(s.pets.kucing.name, 'Mochi Gembul'); assert.equal(s.pets.kucing.growth, 300);
});

test('9.8 needs go down with time, slower while asleep; the gecko is thrifty when spending is low', () => {
  const s = adopt(emptyPet(), 'kucing', 'Mochi', T0, '2026-11-09'), r = s.pets.kucing;
  const later = needsAt(r, T0 + 5 * H, hourOf);
  assert.equal(later.kenyang, 80 - 15); assert.equal(later.manja, 80 - 25); assert.equal(later.senang, 80 - 15);
  // 23:00–06:00 asleep: a third as fast.
  const night = { ...r, at: Date.UTC(2026, 10, 9, 17, 0) }; // 00:00 in Jakarta
  assert.equal(needsAt(night, night.at + 3 * H, hourOf).kenyang, 77);
  assert.equal(asleep('kucing', 2), true); assert.equal(asleep('kucing', 12), false);
  assert.equal(asleep('hantu', 12), true); assert.equal(asleep('hantu', 2), false); // the owl sleeps by day
  assert.equal(needsAt(r, T0 + 10 * 86_400_000, hourOf).kenyang, 0); // long away
  assert.deepEqual([hematScore(0, 100), hematScore(50, 100), hematScore(100, 100), hematScore(150, 100), hematScore(300, 100)], [100, 75, 50, 25, 0]);
  const g = adopt(emptyPet(), 'tokek', '', T0, '2026-11-09').pets.tokek;
  assert.equal(needsAt(g, T0 + H, hourOf, 90).hemat, 90);
});

test('9.8 recording makes it happy (not its food), the flame walks the dog, missions and games, Arena XP makes it grow', () => {
  let s = syncPet(emptyPet(), sig(), hourOf).state; // nothing adopted yet: what is there counts as seen
  s = adopt(s, 'anjing', 'Bruno', T0, '2026-11-09');
  let r = syncPet(s, sig({ recordedToday: 2, lit: true, xp: 560, now: T0 + H }), hourOf);
  assert.deepEqual(r.events.map(e => e.kind), ['recorded', 'walk', 'level']);
  assert.equal(r.events[0].n, 2);
  const dog = r.state.pets.anjing;
  assert.equal(dog.needs.kenyang, 77); // recording is not food: only time moved it
  assert.equal(dog.needs.senang, 77 + 10); assert.equal(dog.needs.jalan, 100);
  assert.equal(dog.growth, 6 + 60); // 3 a record + the XP earned since
  // Again: nothing twice.
  assert.deepEqual(syncPet(r.state, sig({ recordedToday: 2, lit: true, xp: 560, now: T0 + 2 * H }), hourOf).events, []);
  // A new day starts the count again.
  assert.equal(syncPet(r.state, sig({ today: '2026-11-10', recordedToday: 1, now: T0 + 24 * H }), hourOf).events[0].n, 1);
  // No transaction for days: it only gets hungry, never more than that (and feeding is a tap away).
  const away = syncPet(r.state, sig({ today: '2026-11-12', recordedToday: 0, now: T0 + 72 * H }), hourOf).state.pets.anjing;
  assert.equal(needsAt(away, T0 + 72 * H, hourOf).kenyang, 0);
  assert.equal(feed(syncPet(r.state, sig({ today: '2026-11-12', now: T0 + 72 * H }), hourOf).state, T0 + 72 * H, '2026-11-12', hourOf).ok, true);
  // The chicken likes missions, the eagle mini games.
  let c = adopt(r.state, 'ayam', 'Ciko', T0, '2026-11-09'); c.pets.ayam.needs.rajin = 10;
  assert.equal(syncPet(c, sig({ recordedToday: 2, lit: true, missions: 12, xp: 560, now: T0 + H }), hourOf).state.pets.ayam.needs.rajin, 78 - 2);
  let e = adopt(r.state, 'elang', 'Kilat', T0, '2026-11-09'); e.pets.elang.needs.terbang = 0;
  assert.equal(syncPet(e, sig({ recordedToday: 2, lit: true, games: 5, xp: 560, now: T0 }), hourOf).state.pets.elang.needs.terbang, 30);
});

test('9.8 levels, four stages, accessories (the newest one worn when it is earned)', () => {
  assert.deepEqual([0, 24, 25, 100, 225, 900, 2500].map(levelOf), [1, 1, 2, 3, 4, 7, 11]);
  assert.equal(growthFor(levelOf(900)), 900);
  assert.deepEqual([1, 3, 4, 6, 7, 10, 11, 20].map(stageOf), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(petEmoji({ kind: 'ayam', growth: 0 }), '🐣'); assert.equal(petEmoji({ kind: 'ayam', growth: 2500 }), '🐓');
  assert.deepEqual(unlocked(6).map(a => a.id), ['pita', 'syal', 'kacamata']);
  let s = adopt(emptyPet(), 'kucing', 'Mochi', T0, '2026-11-09'); s = syncPet(s, sig(), hourOf).state;
  const up = syncPet(s, sig({ xp: 500 + 230 }), hourOf);
  const ev = up.events.find(x => x.kind === 'level');
  assert.equal(ev.level, 4); assert.equal(ev.stageUp, true); assert.equal(ev.acc, 'syal'); assert.equal(up.state.pets.kucing.acc, 'syal');
  assert.equal(wear(up.state, 'mahkota').pets.kucing.acc, 'syal'); // not earned yet
  assert.equal(wear(up.state, 'pita').pets.kucing.acc, 'pita');
  assert.equal(wear(up.state, null).pets.kucing.acc, null);
  assert.equal(ACCESSORIES.at(-1).level, 11);
});

test('9.8 petting (15 an hour count), playing (once every 20 minutes), tips, the golden egg', () => {
  let s = adopt(emptyPet(), 'kucing', 'Mochi', T0, '2026-11-09');
  let n = 0; for (let k = 0; k < 20; k++) { const r = pet(s, T0, '2026-11-09T12', hourOf); s = r.state; if (r.counted) n++; }
  assert.equal(n, 15); assert.equal(s.pets.kucing.needs.manja, 100); assert.equal(s.pets.kucing.growth, 15);
  assert.equal(pet(s, T0 + H, '2026-11-09T13', hourOf).counted, true);
  const p1 = play(s, T0, hourOf); assert.equal(p1.counted, true); assert.equal(p1.state.pets.kucing.needs.senang, 100);
  assert.equal(play(p1.state, T0 + PLAY_EVERY - 1, hourOf).counted, false);
  assert.equal(play(p1.state, T0 + PLAY_EVERY, hourOf).counted, true);
  // Petting a dog makes it happy instead.
  const d = pet(adopt(emptyPet(), 'anjing', '', T0, '2026-11-09'), T0, 'h', hourOf).state.pets.anjing;
  assert.equal(d.needs.senang, 85); assert.equal(d.needs.manja, 80);
  // The owl learns from tips.
  let o = adopt(emptyPet(), 'hantu', '', T0, '2026-11-09'); o.pets.hantu.needs.ilmu = 20;
  o = readTip(o, T0, hourOf); assert.equal(o.pets.hantu.needs.ilmu, 45); assert.equal(o.tipsRead, 1);
  // The chicken lays a golden egg once a day when all its needs are 60+.
  let c = adopt(emptyPet(), 'ayam', '', T0, '2026-11-09'); const ch = c.pets.ayam;
  assert.equal(eggReady(ch, ch.needs, '2026-11-09'), true);
  assert.equal(eggReady(ch, { ...ch.needs, rajin: 50 }, '2026-11-09'), false);
  c = collectEgg(c, '2026-11-09'); assert.equal(c.pets.ayam.eggs, 1);
  assert.equal(eggReady(c.pets.ayam, c.pets.ayam.needs, '2026-11-09'), false);
  assert.equal(collectEgg(c, '2026-11-09').pets.ayam.eggs, 1);
});

test('9.8 feeding is up to you: 4 meals a day, 2 hours apart, not when full; the dog and chicken have their own care', () => {
  let s = adopt(emptyPet(), 'kucing', 'Mochi', T0, '2026-11-09'); s.pets.kucing.needs.kenyang = 20;
  let r = feed(s, T0, '2026-11-09', hourOf); assert.equal(r.ok, true); assert.equal(r.state.pets.kucing.needs.kenyang, 55); assert.equal(r.state.meals.n, 1);
  const soon = feed(r.state, T0 + H, '2026-11-09', hourOf); assert.equal(soon.ok, false); assert.equal(soon.reason, 'wait'); assert.equal(soon.waitMs, H);
  assert.equal(mealWait(r.state, T0 + H, '2026-11-09'), H);
  s = r.state; for (let k = 1; k < MEALS_A_DAY; k++) { s.pets.kucing.needs.kenyang = 10; s.pets.kucing.at = T0 + k * MEAL_GAP; s = feed(s, T0 + k * MEAL_GAP, '2026-11-09', hourOf).state; }
  assert.equal(s.meals.n, MEALS_A_DAY);
  s.pets.kucing.needs.kenyang = 10; s.pets.kucing.at = T0 + 9 * H;
  assert.equal(feed(s, T0 + 9 * H, '2026-11-09', hourOf).reason, 'limit');
  assert.equal(feed(s, T0 + 20 * H, '2026-11-10', hourOf).ok, true); // a new day
  const full = adopt(emptyPet(), 'kucing', '', T0, '2026-11-09'); full.pets.kucing.needs.kenyang = 97;
  assert.equal(feed(full, T0, '2026-11-09', hourOf).reason, 'full');
  // Ajak jalan (dog), Ajak mengais (chicken): +40 once every 3 hours. The cat has none (petting is its care).
  let d = adopt(emptyPet(), 'anjing', '', T0, '2026-11-09'); d.pets.anjing.needs.jalan = 20;
  const w = care(d, T0, hourOf); assert.equal(w.ok, true); assert.equal(w.state.pets.anjing.needs.jalan, 60);
  assert.equal(care(w.state, T0 + CARE_GAP - 1, hourOf).ok, false); assert.equal(care(w.state, T0 + CARE_GAP, hourOf).ok, true);
  assert.equal(care(adopt(emptyPet(), 'kucing', '', T0, '2026-11-09'), T0, hourOf).ok, false);
  assert.deepEqual(Object.keys(CARE), ['anjing', 'ayam']);
  // The eagle's flight is its own care.
  const e = adopt(emptyPet(), 'elang', '', T0, '2026-11-09'); e.pets.elang.needs.terbang = 10;
  assert.equal(play(e, T0, hourOf).state.pets.elang.needs.terbang, 40);
});

test('9.8 mood and what it says', () => {
  const r = adopt(emptyPet(), 'kucing', 'Mochi', T0, '2026-11-09').pets.kucing;
  assert.equal(moodOf(r, r.needs, 12).id, 'senang');
  assert.equal(moodOf(r, r.needs, 2).id, 'tidur');
  assert.equal(moodOf(r, { ...r.needs, kenyang: 10 }, 12).id, 'lapar');
  assert.match(moodOf(r, { ...r.needs, manja: 10 }, 12).text, /dielus/);
  assert.equal(moodOf(r, { ...r.needs, kenyang: 30, manja: 30, senang: 30 }, 12).id, 'sedih');
  const c = { hour: 13, recordedToday: 0, litToday: false, streak: 5, missionsLeft: 3, spinReady: false, scratchReady: false, index: 3 };
  assert.match(petTip(r, r.needs, c).text, /Jangan lupa dicatat.*Meong!/);
  assert.match(petTip(r, { ...r.needs, kenyang: 30 }, c).text, /laper.*ikan/);
  assert.match(moodOf(r, { ...r.needs, kenyang: 10 }, 12).text, /Kasih ikan/);
  assert.match(petTip(r, r.needs, { ...c, recordedToday: 1, litToday: true, spinReady: true }).text, /Roda/);
  assert.equal(petTip(r, r.needs, { ...c, recordedToday: 1, litToday: true }).kind, 'tip');
  assert.equal(petTip(r, r.needs, { ...c, recordedToday: 1, litToday: true }).text, MONEY_TIPS[3]);
  const owl = adopt(emptyPet(), 'hantu', '', T0, '2026-11-09').pets.hantu;
  assert.match(petTip(owl, owl.needs, { ...c, recordedToday: 1, litToday: true }).text, /^Tips bijak/);
  assert.ok(MONEY_TIPS.length >= 30);
});
