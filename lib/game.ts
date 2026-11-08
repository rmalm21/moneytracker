/**
 * 9.4 Arena Catat: the recording streak ("api"), Perisai Api (streak freezes), badges, XP and levels, three daily
 * missions and one weekly challenge. Pure rules with no Firebase in them (tests/game.test.mjs); the app keeps the
 * state in users/{uid}/game/state and shows it on Beranda (components/game/*).
 *
 * A day is "lit" when the person recorded at least one transaction that day, or tapped "Hari ini aman" (nothing to
 * record), so an honest day without spending never breaks the streak and nobody needs to make up a transaction.
 * XP for recording is capped per day for the same reason.
 */

// ——— Days (YYYY-MM-DD, calendar arithmetic in UTC) ———
const D = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => iso(D(day) + n * 864e5);
export const prevDay = (day: string) => addDays(day, -1);
export const daysBetween = (a: string, b: string) => Math.round((D(b) - D(a)) / 864e5);
/** Monday of the week the day is in (weeks run Senin–Minggu). */
export const mondayOf = (day: string) => addDays(day, -((new Date(D(day)).getUTCDay() + 6) % 7));
/** The local calendar day of a moment, in the person's time zone. */
export function localDay(ms: number, timeZone = 'Asia/Jakarta') {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }
  catch { return iso(ms + 7 * 36e5); }
}

// ——— Streak ———
export type Streak = { current: number; litToday: boolean; atRisk: boolean; runStart: string | null };
/** Lit days in the run that ends today (or yesterday while today is not lit yet). A day saved by a perisai keeps the
 * run going but does not add to it. */
export function streakOf(days: Iterable<string>, frozen: Iterable<string>, today: string): Streak {
  const lit = new Set(days), ice = new Set(frozen), on = (d: string) => lit.has(d) || ice.has(d);
  const litToday = lit.has(today);
  let current = 0, d = litToday ? today : prevDay(today), start: string | null = null;
  for (let i = 0; i < 4000 && on(d); i++) { if (lit.has(d)) current++; start = d; d = prevDay(d); }
  return { current, litToday, atRisk: !litToday && current > 0, runStart: current ? start : null };
}
/** The longest run (lit days) in a history. */
export function longestRun(days: Iterable<string>, frozen: Iterable<string> = []) {
  const lit = new Set(days), ice = new Set(frozen), all = [...new Set([...lit, ...ice])].sort();
  let best = 0, run = 0, last = '';
  for (const d of all) { run = last && daysBetween(last, d) === 1 ? run : 0; if (lit.has(d)) run++; best = Math.max(best, run); last = d; }
  return best;
}

// ——— Looks: the flame grows with the streak ———
export type FlameTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const FLAMES: { tier: FlameTier; from: number; name: string }[] = [
  { tier: 0, from: 0, name: 'Api padam' }, { tier: 1, from: 1, name: 'Percikan' }, { tier: 2, from: 3, name: 'Api Menyala' },
  { tier: 3, from: 7, name: 'Api Membara' }, { tier: 4, from: 14, name: 'Api Biru' }, { tier: 5, from: 30, name: 'Api Ungu' },
  { tier: 6, from: 100, name: 'Api Legenda' },
];
export const flameOf = (streak: number) => [...FLAMES].reverse().find(f => streak >= f.from)!;
export const nextFlame = (streak: number) => FLAMES.find(f => f.from > streak) || null;

// ——— Badges ———
export const BADGES: { days: number; name: string; xp: number }[] = [
  { days: 3, name: 'Mulai Membara', xp: 50 }, { days: 7, name: 'Seminggu Nyala', xp: 100 }, { days: 14, name: 'Dua Minggu Panas', xp: 150 },
  { days: 30, name: 'Sebulan Penuh', xp: 300 }, { days: 50, name: 'Setengah Abad', xp: 500 }, { days: 100, name: 'Seratus Hari', xp: 1000 },
  { days: 200, name: 'Dua Ratus Hari', xp: 2000 }, { days: 365, name: 'Setahun Legenda', xp: 3650 },
];

// ——— Levels ———
const TITLES: { name: string; emoji: string }[] = [
  { name: 'Pencatat Pemula', emoji: '🌱' }, { name: 'Pencatat Harian', emoji: '✏️' }, { name: 'Pencatat Rajin', emoji: '📝' },
  { name: 'Penjaga Kas', emoji: '💰' }, { name: 'Pengelola Uang', emoji: '💼' }, { name: 'Ahli Anggaran', emoji: '📊' },
  { name: 'Jago Hemat', emoji: '🎯' }, { name: 'Master Dompet', emoji: '💎' }, { name: 'Sultan Keuangan', emoji: '🏆' },
  { name: 'Legenda Keuangan', emoji: '🚀' },
];
/** XP needed to reach a level: 0, 100, 300, 600, 1000, 1500, … */
export const xpForLevel = (level: number) => 50 * (level - 1) * level;
export function levelOf(xp: number) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const t = TITLES[Math.min(level, TITLES.length) - 1], extra = level - TITLES.length;
  const from = xpForLevel(level), to = xpForLevel(level + 1);
  return { level, title: extra > 0 ? `${t.name} ★${extra}` : t.name, emoji: extra > 0 ? '⭐' : t.emoji, from, to, progress: (xp - from) / (to - from) };
}
export const titleOfLevel = (level: number) => levelOf(xpForLevel(level));

// ——— Daily missions ———
export type MissionCtx = {
  /** Transactions recorded today (all places counted). */ created: number;
  /** Every income/expense recorded today has a category. */ categorized: boolean;
  /** One of today's has something in Catatan. */ withNotes: boolean;
  /** Recorded with Catat otomatis or the chat. */ quick: boolean;
  /** Recorded from a scanned receipt. */ scan: boolean;
  /** Recorded before 12.00. */ morning: boolean;
  /** A balance matched (Cocokkan saldo / penyesuaian). */ adjust: boolean;
  /** Menus opened today. */ visited: string[];
};
export type Mission = { id: string; title: string; hint: string; xp: number; kind: 'record' | 'explore'; target?: number; count?: (c: MissionCtx) => number; done: (c: MissionCtx) => boolean };
export const MISSIONS: Mission[] = [
  { id: 'catat2', title: 'Catat 2 transaksi', hint: 'Apa saja: jajan, ongkos, gaji masuk', xp: 30, kind: 'record', target: 2, count: c => c.created, done: c => c.created >= 2 },
  { id: 'catat3', title: 'Catat 3 transaksi', hint: 'Sekalian yang kecil-kecil, parkir juga dihitung', xp: 40, kind: 'record', target: 3, count: c => c.created, done: c => c.created >= 3 },
  { id: 'kategori', title: 'Semua catatan hari ini berkategori', hint: 'Catat minimal 1 dan pastikan semuanya punya kategori', xp: 30, kind: 'record', done: c => c.created > 0 && c.categorized },
  { id: 'catatan', title: 'Isi kolom Catatan di 1 transaksi', hint: 'Misalnya "traktir temen" atau "buat arisan"', xp: 25, kind: 'record', done: c => c.withNotes },
  { id: 'otomatis', title: 'Catat pakai Catat otomatis atau chat', hint: 'Ketik saja "kopi 18rb pakai gopay"', xp: 30, kind: 'record', done: c => c.quick },
  { id: 'pagi', title: 'Catat sebelum jam 12 siang', hint: 'Sarapan atau ongkos berangkat juga boleh', xp: 25, kind: 'record', done: c => c.morning },
  { id: 'scan', title: 'Scan 1 struk belanja', hint: 'Tombol + → Scan struk', xp: 40, kind: 'record', done: c => c.scan },
  { id: 'anggaran', title: 'Intip halaman Anggaran', hint: 'Lihat sisa jatah bulan ini', xp: 20, kind: 'explore', done: c => c.visited.includes('budgets') },
  { id: 'insight', title: 'Buka Insight', hint: 'Cari tahu pola belanjamu', xp: 20, kind: 'explore', done: c => c.visited.includes('advisor') },
  { id: 'dompet', title: 'Cek saldo di menu Dompet', hint: 'Pastikan angkanya masih cocok', xp: 20, kind: 'explore', done: c => c.visited.includes('wallets') },
  { id: 'cocokkan', title: 'Cocokkan saldo 1 dompet', hint: 'Dompet → pilih dompet → Cocokkan saldo', xp: 30, kind: 'explore', done: c => c.adjust },
];
export const MISSION_BONUS = 50;
/** A small stable hash, so everyone gets their own missions (and the same ones on every device). */
export function hash(text: string) {
  let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  // Final mix (murmur3 fmix32), so names that only differ a little still get different picks.
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
function pick<T>(list: T[], n: number, seed: string): T[] {
  return [...list].map((x, i) => ({ x, k: hash(`${seed}:${i}`) })).sort((a, b) => a.k - b.k).slice(0, n).map(v => v.x);
}
/** Today's three missions: two about recording, one to look around. "Before 12" is left out when it is already late. */
export function missionsFor(seed: string, day: string, hour: number): string[] {
  const record = MISSIONS.filter(m => m.kind === 'record' && !(m.id === 'pagi' && hour >= 10)), explore = MISSIONS.filter(m => m.kind === 'explore');
  return [...pick(record, 2, `${seed}:${day}:r`), ...pick(explore, 1, `${seed}:${day}:e`)].map(m => m.id);
}
export const missionById = (id: string) => MISSIONS.find(m => m.id === id);

// ——— Weekly challenge ———
/** What the records say about a week (from the person's own transactions). */
export type WeekRaw = {
  /** Transactions recorded that week. */ recorded: number;
  /** Spending that week. */ spent: number;
  /** Days of that week with any spending. */ spendDays: string[];
  /** Times each spending category was used that week (by id). */ categoryCount: Record<string, number>;
};
export type WeekCtx = WeekRaw & {
  /** Lit days of the week up to today. */ litDays: number;
  /** Days of the week before today that were lit and had no spending. */ noSpendDays: number;
};
/** A week seen on a given day: the lit days from the state, the rest from the records. */
export function weekCtx(days: string[], monday: string, today: string, raw: WeekRaw): WeekCtx {
  const sunday = addDays(monday, 6), last = today < sunday ? today : sunday, spend = new Set(raw.spendDays);
  const lit = days.filter(d => d >= monday && d <= last);
  return { ...raw, litDays: lit.length, noSpendDays: lit.filter(d => d < today && !spend.has(d)).length };
}
export type Habits = { weeklyRecorded: number; lastWeekSpent: number; topCategory: { id: string; name: string; perWeek: number } | null };
export type Challenge = { id: string; title: string; hint: string; xp: number; target: number; endOfWeek: boolean; categoryId?: string; lower?: boolean };
export const CHALLENGE_XP = 200;
/** The challenges this person can do, from their own habits. */
/** Where in the week a challenge is picked: days already gone (Senin = 0) and how many of them were lit. A challenge
 * picked mid-week (a new person, or the first look of the week on Kamis) must still be possible. */
export type WeekStart = { dayIndex: number; litBefore: number };
export function challengesFor(h: Habits, at: WeekStart = { dayIndex: 0, litBefore: 0 }): Challenge[] {
  const left = 7 - at.dayIndex, fullWeek = at.litBefore === at.dayIndex, nyala = at.litBefore + left;
  const out: Challenge[] = [
    fullWeek
      ? { id: 'api7', title: at.dayIndex ? `Jaga api nyala sampai Minggu` : 'Nyalakan api 7 hari penuh', hint: 'Catat atau cek-in setiap hari sampai Minggu', xp: CHALLENGE_XP, target: 7, endOfWeek: false }
      : { id: 'api7', title: `Nyalakan api ${nyala} hari minggu ini`, hint: 'Catat atau cek-in setiap hari sampai Minggu', xp: Math.max(50, Math.round(CHALLENGE_XP * nyala / 70) * 10), target: nyala, endOfWeek: false },
  ];
  if (at.dayIndex <= 4) out.push({ id: 'tanpajajan2', title: '2 hari tanpa pengeluaran', hint: 'Hari tetap harus nyala (ketuk "Hari ini aman")', xp: CHALLENGE_XP, target: 2, endOfWeek: false });
  if (h.weeklyRecorded >= 10 && at.dayIndex <= 3) out.push({ id: 'catat15', title: 'Catat 15 transaksi minggu ini', hint: 'Termasuk yang kecil-kecil', xp: CHALLENGE_XP, target: 15, endOfWeek: false });
  if (at.litBefore + left < 5) return out;
  if (h.topCategory && h.topCategory.perWeek >= 3) {
    const target = Math.max(1, Math.floor(h.topCategory.perWeek) - 1);
    out.push({ id: `batas:${h.topCategory.id}`, title: `Maksimal ${target}× ${h.topCategory.name} minggu ini`, hint: `Biasanya ${Math.round(h.topCategory.perWeek)}× seminggu. Api tetap harus nyala minimal 5 hari.`, xp: CHALLENGE_XP, target, endOfWeek: true, categoryId: h.topCategory.id, lower: true });
  }
  if (h.lastWeekSpent > 0) out.push({ id: 'hemat', title: 'Belanja lebih hemat dari minggu lalu', hint: 'Api tetap harus nyala minimal 5 hari supaya adil', xp: CHALLENGE_XP, target: h.lastWeekSpent, endOfWeek: true, lower: true });
  return out;
}
/** This week's challenge, or none when less than 3 days are left (a new one starts on Senin). */
export function challengeFor(seed: string, week: string, h: Habits, at?: WeekStart): Challenge | null {
  if (at && at.dayIndex >= 5) return null;
  const list = challengesFor(h, at);
  return list[hash(`${seed}:${week}:c`) % list.length];
}
/** How far a challenge is (value against target), and whether it is won or already lost this week. */
export function challengeProgress(c: Challenge, w: WeekCtx, weekOver = false): { value: number; won: boolean; lost: boolean } {
  const fair = w.litDays >= 5;
  if (c.id === 'api7') return { value: w.litDays, won: w.litDays >= c.target, lost: false };
  if (c.id === 'tanpajajan2') return { value: w.noSpendDays, won: w.noSpendDays >= 2, lost: false };
  if (c.id === 'catat15') return { value: w.recorded, won: w.recorded >= 15, lost: false };
  if (c.id === 'hemat') return { value: w.spent, won: weekOver && fair && w.spent < c.target, lost: w.spent >= c.target || (weekOver && !fair) };
  if (c.categoryId) { const n = w.categoryCount[c.categoryId] || 0; return { value: n, won: weekOver && fair && n <= c.target, lost: n > c.target || (weekOver && !fair) }; }
  return { value: 0, won: false, lost: false };
}

// ——— The state and how a moment changes it ———
export type GameState = {
  v: 1;
  /** Lit days, oldest first (kept 400). */ days: string[];
  /** Days lit by "Hari ini aman" (kept 60). */ checkins: string[];
  /** Missed days a perisai covered (kept 60). */ frozen: string[];
  shields: number; shieldDay: string;
  best: number; badges: number[];
  xp: number; xpDay: string; xpToday: number;
  /** Transactions credited today, per place (Pribadi or a space). */ txDay: string; txCounted: Record<string, number>;
  missionDay: string; missionIds: string[]; missionsDone: string[]; missionBonus: boolean;
  week: string; challenge: Challenge | null; challengeDone: boolean; challengeLost: boolean;
  seenLevel: number; lostRun: number; lostDay: string;
};
export const MAX_SHIELDS = 2, TX_XP = 10, TX_CAP = 5, LIT_XP = 20;
export type GameEvent =
  | { kind: 'welcome'; streak: number; xp: number; shields: number }
  | { kind: 'lit'; streak: number; xp: number; checkin: boolean }
  | { kind: 'badge'; days: number; name: string; xp: number }
  | { kind: 'shield-earned'; shields: number }
  | { kind: 'shield-full'; xp: number }
  | { kind: 'shield-used'; days: string[]; streak: number }
  | { kind: 'broken'; was: number; best: number }
  | { kind: 'level'; level: number; title: string; emoji: string }
  | { kind: 'mission'; id: string; title: string; xp: number }
  | { kind: 'missions-all'; xp: number }
  | { kind: 'challenge'; title: string; xp: number }
  | { kind: 'xp'; amount: number; reason: string };
export type Observation = {
  today: string; hour: number; seed: string;
  /** Where the transactions were seen (the person's uid, or space:{id}) and how many they recorded there today. */
  root: string; recordedToday: number;
  /** Tapped "Hari ini aman" now. */ checkin?: boolean;
  /** Only the first time: the days they recorded anything before (from their own records). */ history?: string[];
  mission: Omit<MissionCtx, 'created'>;
  /** Only in Pribadi: this week and last week from the records, and the habits to pick a challenge from. */ week?: WeekRaw; lastWeek?: WeekRaw; habits?: Habits;
};
export const emptyState = (): GameState => ({ v: 1, days: [], checkins: [], frozen: [], shields: 0, shieldDay: '', best: 0, badges: [], xp: 0, xpDay: '', xpToday: 0, txDay: '', txCounted: {}, missionDay: '', missionIds: [], missionsDone: [], missionBonus: false, week: '', challenge: null, challengeDone: false, challengeLost: false, seenLevel: 1, lostRun: 0, lostDay: '' });
const keep = (list: string[], n: number) => [...new Set(list)].sort().slice(-n);

/** Applies one moment to the state: new lit day, perisai used or earned, XP, badges, level, missions, the challenge. */
export function advance(previous: GameState | null, o: Observation): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const s: GameState = previous ? { ...emptyState(), ...previous, txCounted: { ...(previous.txCounted || {}) } } : emptyState();
  const give = (amount: number, reason: string, quiet = false) => { if (amount <= 0) return; s.xp += amount; s.xpToday += amount; if (!quiet) events.push({ kind: 'xp', amount, reason }); };
  if (s.xpDay !== o.today) { s.xpDay = o.today; s.xpToday = 0; }
  // First time: the streak comes from what they recorded before, with an opening bonus and a perisai to start with.
  const first = !previous;
  if (first) {
    const history = (o.history || []).filter(d => d <= o.today);
    s.days = keep(history, 400);
    s.best = longestRun(s.days);
    s.badges = BADGES.filter(b => s.best >= b.days).map(b => b.days);
    s.xp = Math.min(500, 5 * new Set(history).size);
    s.shields = 1; s.shieldDay = '';
  }
  // Missed days since the last lit one: a perisai each (when there are enough), otherwise the flame goes out. On the
  // very first look this happens quietly (the welcome already says where the streak stands).
  {
    const lit = new Set(s.days), ice = new Set(s.frozen), on = (d: string) => lit.has(d) || ice.has(d);
    const missed: string[] = []; let d = prevDay(o.today);
    while (!on(d) && missed.length <= MAX_SHIELDS) { missed.push(d); d = prevDay(d); }
    const before = streakOf(s.days, s.frozen, addDays(d, 1)).current; // the run that ended on day d
    if (missed.length && before > 0) {
      if (missed.length <= s.shields) {
        s.shields -= missed.length; s.frozen = keep([...s.frozen, ...missed], 60);
        if (!first) events.push({ kind: 'shield-used', days: missed.reverse(), streak: before });
      } else if (s.lostDay !== d) {
        s.lostRun = before; s.lostDay = d;
        if (!first) events.push({ kind: 'broken', was: before, best: Math.max(s.best, before) });
      }
    }
  }
  if (first) { s.seenLevel = levelOf(s.xp).level; events.push({ kind: 'welcome', streak: streakOf(s.days, s.frozen, o.today).current, xp: s.xp, shields: s.shields }); }
  // Recording today (per place, capped) and "Hari ini aman".
  if (s.txDay !== o.today) { s.txDay = o.today; s.txCounted = {}; }
  const counted = s.txCounted[o.root] || 0, now = Math.min(TX_CAP, o.recordedToday);
  const totalBefore = Object.values(s.txCounted).reduce((n, v) => n + v, 0);
  let txXp = 0;
  if (now > counted) { s.txCounted[o.root] = now; const room = Math.max(0, TX_CAP - totalBefore), add = Math.min(room, now - counted); txXp = add * TX_XP; if (add) give(txXp, `${add} transaksi dicatat`, true); }
  const wasLit = s.days.includes(o.today), checkin = Boolean(o.checkin) && !wasLit;
  if (!wasLit && (o.recordedToday > 0 || checkin)) {
    s.days = keep([...s.days, o.today], 400);
    if (checkin) s.checkins = keep([...s.checkins, o.today], 60);
    const st = streakOf(s.days, s.frozen, o.today), bonus = LIT_XP + 2 * Math.min(30, st.current);
    give(bonus, 'Api nyala', true);
    events.push({ kind: 'lit', streak: st.current, xp: bonus + txXp, checkin });
    // A perisai every 7 days in a row (at most 2; a full hand turns into XP).
    if (st.current % 7 === 0 && s.shieldDay !== o.today) {
      s.shieldDay = o.today;
      if (s.shields < MAX_SHIELDS) { s.shields++; events.push({ kind: 'shield-earned', shields: s.shields }); }
      else { give(50, 'Perisai penuh', true); events.push({ kind: 'shield-full', xp: 50 }); }
    }
    if (st.current > s.best) s.best = st.current;
    for (const b of BADGES) if (s.best >= b.days && !s.badges.includes(b.days)) { s.badges = [...s.badges, b.days]; give(b.xp, `Lencana ${b.name}`, true); events.push({ kind: 'badge', days: b.days, name: b.name, xp: b.xp }); }
  }
  // Missions of the day.
  if (s.missionDay !== o.today) { s.missionDay = o.today; s.missionIds = missionsFor(o.seed, o.today, o.hour); s.missionsDone = []; s.missionBonus = false; }
  const ctx: MissionCtx = { ...o.mission, created: Object.values(s.txCounted).reduce((n, v) => n + v, 0) };
  for (const id of s.missionIds) {
    const m = missionById(id); if (!m || s.missionsDone.includes(id) || !m.done(ctx)) continue;
    s.missionsDone = [...s.missionsDone, id]; give(m.xp, m.title, true); events.push({ kind: 'mission', id, title: m.title, xp: m.xp });
  }
  if (!s.missionBonus && s.missionIds.length && s.missionIds.every(id => s.missionsDone.includes(id))) { s.missionBonus = true; give(MISSION_BONUS, 'Semua misi', true); events.push({ kind: 'missions-all', xp: MISSION_BONUS }); }
  // The weekly challenge (only where the person's own records are seen).
  if (o.week && o.habits) {
    const week = mondayOf(o.today);
    if (s.week !== week) {
      // Last week's challenge that is decided at the end of the week.
      if (s.challenge && s.challenge.endOfWeek && !s.challengeDone && !s.challengeLost && o.lastWeek && s.week === addDays(week, -7)) {
        const p = challengeProgress(s.challenge, weekCtx(s.days, s.week, addDays(s.week, 7), o.lastWeek), true);
        if (p.won) { give(s.challenge.xp, 'Tantangan minggu lalu', true); events.push({ kind: 'challenge', title: s.challenge.title, xp: s.challenge.xp }); }
      }
      const dayIndex = daysBetween(week, o.today), litBefore = s.days.filter(d => d >= week && d < o.today).length;
      s.week = week; s.challenge = challengeFor(o.seed, week, o.habits, { dayIndex, litBefore }); s.challengeDone = false; s.challengeLost = false;
    }
    if (s.challenge && !s.challengeDone && !s.challengeLost) {
      const p = challengeProgress(s.challenge, weekCtx(s.days, week, o.today, o.week), false);
      if (p.won) { s.challengeDone = true; give(s.challenge.xp, 'Tantangan mingguan', true); events.push({ kind: 'challenge', title: s.challenge.title, xp: s.challenge.xp }); }
      else if (p.lost) s.challengeLost = true;
    }
  }
  // Level up (said once per level).
  const lv = levelOf(s.xp);
  if (lv.level > s.seenLevel) { s.seenLevel = lv.level; if (previous) events.push({ kind: 'level', level: lv.level, title: lv.title, emoji: lv.emoji }); }
  return { state: s, events };
}

// ——— Api bareng (a Ruang Bersama) ———
/** The space's flame: a day counts when every member's own flame was lit (or saved by a perisai) that day. */
export function sharedStreak(memberDays: Record<string, string[]>, memberIds: string[], today: string) {
  const sets = memberIds.map(id => new Set(memberDays[id] || []));
  const all = (d: string) => sets.length > 1 && sets.every(x => x.has(d));
  const litToday = all(today);
  let current = 0, d = litToday ? today : prevDay(today);
  for (let i = 0; i < 4000 && all(d); i++) { current++; d = prevDay(d); }
  return { current, litToday, atRisk: !litToday && current > 0, members: memberIds.map((id, i) => ({ id, litToday: sets[i].has(today) })) };
}
/** The days a member shares with their spaces: lit or saved, the last 60. */
export const sharedDays = (s: Pick<GameState, 'days' | 'frozen'>) => keep([...s.days, ...s.frozen], 60);
