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
/** 9.6 Each with its own picture (they all looked the same as 🔥). */
export const BADGES: { days: number; name: string; xp: number; emoji: string }[] = [
  { days: 3, name: 'Mulai Membara', xp: 50, emoji: '🔥' }, { days: 7, name: 'Seminggu Nyala', xp: 100, emoji: '⚡' }, { days: 14, name: 'Dua Minggu Panas', xp: 150, emoji: '💥' },
  { days: 30, name: 'Sebulan Penuh', xp: 300, emoji: '🎆' }, { days: 50, name: 'Setengah Abad', xp: 500, emoji: '🌋' }, { days: 100, name: 'Seratus Hari', xp: 1000, emoji: '☄️' },
  { days: 200, name: 'Dua Ratus Hari', xp: 2000, emoji: '🌟' }, { days: 365, name: 'Setahun Legenda', xp: 3650, emoji: '👑' },
];

// ——— 9.5 More badges (achievements), in four tiers ———
export type Tier = 'perunggu' | 'perak' | 'emas' | 'legenda';
export const TIERS: Record<Tier, { name: string; xp: number }> = { perunggu: { name: 'Perunggu', xp: 50 }, perak: { name: 'Perak', xp: 100 }, emas: { name: 'Emas', xp: 250 }, legenda: { name: 'Legenda', xp: 500 } };
export type GameStats = { missions: number; fullDays: number; challenges: number; checkins: number; scans: number; scanDay: string; quickDays: number; quickDay: string; early: number; late: number; shields: number; comebacks: number; sharedBest: number; weekends: number; /** 9.6 mini games */ spins: number; coinBest: number; coinGames: number };
export const emptyStats = (): GameStats => ({ missions: 0, fullDays: 0, challenges: 0, checkins: 0, scans: 0, scanDay: '', quickDays: 0, quickDay: '', early: 0, late: 0, shields: 0, comebacks: 0, sharedBest: 0, weekends: 0, spins: 0, coinBest: 0, coinGames: 0 });
export type Achievement = { id: string; group: string; name: string; desc: string; emoji: string; tier: Tier; target: number; value: (s: Pick<GameState, 'days' | 'stats'>) => number };
const ach = (id: string, group: string, name: string, desc: string, emoji: string, tier: Tier, target: number, value: Achievement['value']): Achievement => ({ id, group, name, desc, emoji, tier, target, value });
const st = (k: keyof GameStats) => (s: Pick<GameState, 'stats'>) => Number(s.stats?.[k] || 0);
export const ACHIEVEMENTS: Achievement[] = [
  ach('hari10', 'Rajin', '10 Hari Nyala', 'Total 10 hari apimu nyala, tidak harus berturut-turut', '✏️', 'perunggu', 10, s => s.days.length),
  ach('hari50', 'Rajin', '50 Hari Nyala', 'Total 50 hari apimu nyala', '📝', 'perak', 50, s => s.days.length),
  ach('hari100', 'Rajin', '100 Hari Nyala', 'Total 100 hari apimu nyala', '📚', 'emas', 100, s => s.days.length),
  ach('hari365', 'Rajin', '365 Hari Nyala', 'Total 365 hari apimu nyala', '🎓', 'legenda', 365, s => s.days.length),
  ach('misi1', 'Misi', 'Misi Pertama', 'Selesaikan 1 misi harian', '🎯', 'perunggu', 1, st('missions')),
  ach('misi30', 'Misi', 'Pemburu Misi', 'Selesaikan 30 misi harian', '🎯', 'perak', 30, st('missions')),
  ach('misi100', 'Misi', 'Raja Misi', 'Selesaikan 100 misi harian', '💎', 'emas', 100, st('missions')),
  ach('tuntas7', 'Misi', 'Tuntas Seminggu', 'Tuntaskan ketiga misi harian di 7 hari', '🎉', 'perak', 7, st('fullDays')),
  ach('tantang1', 'Tantangan', 'Penantang', 'Menangkan 1 tantangan mingguan', '🏆', 'perunggu', 1, st('challenges')),
  ach('tantang5', 'Tantangan', 'Jagoan Mingguan', 'Menangkan 5 tantangan mingguan', '🚀', 'perak', 5, st('challenges')),
  ach('tantang12', 'Tantangan', 'Juara Musim', 'Menangkan 12 tantangan mingguan', '💎', 'emas', 12, st('challenges')),
  ach('pagi', 'Kebiasaan', 'Burung Pagi', 'Catat transaksi sebelum jam 7 pagi', '☕', 'perunggu', 1, st('early')),
  ach('malam', 'Kebiasaan', 'Kalong Malam', 'Catat transaksi jam 10 malam ke atas', '🌙', 'perunggu', 1, st('late')),
  ach('aman7', 'Kebiasaan', 'Hari Hemat', 'Ketuk "Hari ini aman" di 7 hari tanpa transaksi', '✅', 'perak', 7, st('checkins')),
  ach('scan5', 'Kebiasaan', 'Juru Scan', 'Catat dari scan struk di 5 hari berbeda', '📸', 'perak', 5, st('scans')),
  ach('otomatis10', 'Kebiasaan', 'Teman Asisten', 'Pakai Catat otomatis atau chat di 10 hari berbeda', '🤖', 'perak', 10, st('quickDays')),
  ach('weekend4', 'Kebiasaan', 'Akhir Pekan Rajin', 'Nyalakan api Sabtu dan Minggu di 4 minggu', '🎈', 'emas', 4, st('weekends')),
  ach('perisai', 'Bertahan', 'Diselamatkan Perisai', 'Perisai Api menyelamatkan apimu', '🛡️', 'perunggu', 1, st('shields')),
  ach('bangkit', 'Bertahan', 'Bangkit Lagi', 'Nyalakan api lagi setelah sempat padam', '🔁', 'perunggu', 1, st('comebacks')),
  ach('bareng3', 'Bareng', 'Kompak 3 Hari', 'Api bareng di Ruang Bersama nyala 3 hari berturut-turut', '🤝', 'perunggu', 3, st('sharedBest')),
  ach('bareng7', 'Bareng', 'Seminggu Kompak', 'Api bareng nyala 7 hari berturut-turut', '🤝', 'perak', 7, st('sharedBest')),
  ach('bareng30', 'Bareng', 'Sebulan Kompak', 'Api bareng nyala 30 hari berturut-turut', '🏠', 'emas', 30, st('sharedBest')),
  ach('roda7', 'Mini game', 'Roda Keberuntungan', 'Putar Roda Harian di 7 hari', '🎡', 'perak', 7, st('spins')),
  ach('koin30', 'Mini game', 'Tangan Cepat', 'Skor 30 di Tangkap Koin', '🪙', 'perunggu', 30, st('coinBest')),
  ach('koin80', 'Mini game', 'Raja Koin', 'Skor 80 di Tangkap Koin', '👑', 'emas', 80, st('coinBest')),
];
/** The streak badges' tiers (for the look). */
export const streakTier = (days: number): Tier => days >= 100 ? 'legenda' : days >= 30 ? 'emas' : days >= 7 ? 'perak' : 'perunggu';
export const BADGE_TOTAL = BADGES.length + ACHIEVEMENTS.length;
/** The groups in the order the Arena shows them. */
export const BADGE_GROUPS: { id: string; emoji: string; hint: string }[] = [
  { id: 'Api', emoji: '🔥', hint: 'Api nyala berturut-turut' }, { id: 'Rajin', emoji: '✏️', hint: 'Total hari apimu nyala' },
  { id: 'Misi', emoji: '🎯', hint: 'Misi harian' }, { id: 'Tantangan', emoji: '🏆', hint: 'Tantangan mingguan' },
  { id: 'Kebiasaan', emoji: '🌟', hint: 'Cara kamu mencatat' }, { id: 'Bertahan', emoji: '🛡️', hint: 'Jatuh bangun' }, { id: 'Bareng', emoji: '🤝', hint: 'Api bareng di Ruang Bersama' },
  { id: 'Mini game', emoji: '🎮', hint: 'Putar Roda & Tangkap Koin' },
];
export type BadgeView = { id: string; group: string; name: string; desc: string; emoji: string; tier: Tier; target: number; value: number; got: string | null; xp: number };
/** Every badge (the streak ones and the rest) with how far the person is, for the Arena. */
export function badgeList(s: Pick<GameState, 'days' | 'frozen' | 'stats' | 'achievements' | 'badges' | 'best'>, today: string): BadgeView[] {
  const run = Math.max(s.best, streakOf(s.days, s.frozen, today).current);
  const api: BadgeView[] = BADGES.map(b => ({ id: `api${b.days}`, group: 'Api', name: b.name, desc: `Api nyala ${b.days} hari berturut-turut`, emoji: b.emoji, tier: streakTier(b.days), target: b.days, value: Math.min(run, b.days), got: s.badges.includes(b.days) ? 'ya' : null, xp: b.xp }));
  const rest: BadgeView[] = ACHIEVEMENTS.map(a => ({ id: a.id, group: a.group, name: a.name, desc: a.desc, emoji: a.emoji, tier: a.tier, target: a.target, value: Math.min(a.target, a.value(s)), got: s.achievements?.[a.id] || null, xp: TIERS[a.tier].xp }));
  return [...api, ...rest];
}
/** The locked badge closest to being reached (for "Hampir dapat"). */
export const nearestBadge = (list: BadgeView[]) => list.filter(b => !b.got && b.value > 0).sort((a, b) => b.value / b.target - a.value / a.target || a.target - b.target)[0] || null;

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
  /** 9.5 Recorded before 07.00 / at 22.00 or later (for the badges). */ early?: boolean; late?: boolean;
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
  /** 9.5 Counters for the badges, and the badges unlocked (id → day). */ stats: GameStats; achievements: Record<string, string>;
  /** 9.6 Putar Roda (the day it was spun) and Tangkap Koin (XP earned today, best score). */ spinDay: string; coinDay: string; coinXp: number; coinBest: number;
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
  | { kind: 'xp'; amount: number; reason: string }
  | { kind: 'achievements'; items: { id: string; name: string; emoji: string; tier: Tier; desc: string; xp: number }[] };
export type Observation = {
  today: string; hour: number; seed: string;
  /** Where the transactions were seen (the person's uid, or space:{id}) and how many they recorded there today. */
  root: string; recordedToday: number;
  /** Tapped "Hari ini aman" now. */ checkin?: boolean;
  /** Only the first time: the days they recorded anything before (from their own records). */ history?: string[];
  mission: Omit<MissionCtx, 'created'>;
  /** Only in Pribadi: this week and last week from the records, and the habits to pick a challenge from. */ week?: WeekRaw; lastWeek?: WeekRaw; habits?: Habits;
  /** 9.5 The longest api bareng streak running now in any of their spaces. */ shared?: number;
};
export const emptyState = (): GameState => ({ v: 1, days: [], checkins: [], frozen: [], shields: 0, shieldDay: '', best: 0, badges: [], xp: 0, xpDay: '', xpToday: 0, txDay: '', txCounted: {}, missionDay: '', missionIds: [], missionsDone: [], missionBonus: false, week: '', challenge: null, challengeDone: false, challengeLost: false, seenLevel: 1, lostRun: 0, lostDay: '', stats: emptyStats(), achievements: {}, spinDay: '', coinDay: '', coinXp: 0, coinBest: 0 });
const keep = (list: string[], n: number) => [...new Set(list)].sort().slice(-n);

/** A copy to change (an older saved state gets the newer fields). */
const copyState = (p: GameState): GameState => ({ ...emptyState(), ...p, txCounted: { ...(p.txCounted || {}) }, stats: { ...emptyStats(), ...(p.stats || {}) }, achievements: { ...(p.achievements || {}) } });
const addXp = (s: GameState, today: string, xp: number) => { if (s.xpDay !== today) { s.xpDay = today; s.xpToday = 0; } s.xp += xp; s.xpToday += xp; };

// ——— 9.6 Mini games ———
/** Putar Roda Harian: once a day, after today's flame is lit. The wheel's eight prizes, in order around it. */
export const SPIN_PRIZES: { id: string; label: string; xp: number; shield?: boolean; weight: number }[] = [
  { id: 'xp10', label: '+10', xp: 10, weight: 20 }, { id: 'xp25', label: '+25', xp: 25, weight: 12 }, { id: 'perisai', label: 'Perisai', xp: 0, shield: true, weight: 10 },
  { id: 'xp15', label: '+15', xp: 15, weight: 18 }, { id: 'xp50', label: '+50', xp: 50, weight: 8 }, { id: 'xp20', label: '+20', xp: 20, weight: 16 },
  { id: 'xp100', label: '+100', xp: 100, weight: 4 }, { id: 'xp30', label: '+30', xp: 30, weight: 12 },
];
/** The prize of a day is fixed (spinning again on another phone, or after reloading, lands on the same one). */
export function spinIndex(seed: string, day: string) {
  let n = hash(`${seed}:${day}:roda`) % 100;
  for (let i = 0; i < SPIN_PRIZES.length; i++) { n -= SPIN_PRIZES[i].weight; if (n < 0) return i; }
  return 0;
}
export const canSpin = (s: Pick<GameState, 'days' | 'spinDay'>, today: string) => s.days.includes(today) && s.spinDay !== today;
/** Spins the wheel: XP, or a perisai (+50 XP when the hand is already full). Null when it cannot be spun today. */
export function spinWheel(previous: GameState, today: string, seed: string): { state: GameState; index: number; xp: number; shield: boolean } | null {
  if (!canSpin(previous, today)) return null;
  const s = copyState(previous), index = spinIndex(seed, today), prize = SPIN_PRIZES[index];
  s.spinDay = today; s.stats.spins++;
  let xp = prize.xp, shield = false;
  if (prize.shield) { if (s.shields < MAX_SHIELDS) { s.shields++; shield = true; } else xp = 50; }
  addXp(s, today, xp);
  return { state: s, index, xp, shield };
}
/** Tangkap Koin: 30 seconds; XP is a third of the score, at most 30 a day (the game can be played as often as wanted). */
export const COIN_SECONDS = 30, COIN_XP_CAP = 30;
export const coinXpLeft = (s: Pick<GameState, 'coinDay' | 'coinXp'>, today: string) => Math.max(0, COIN_XP_CAP - (s.coinDay === today ? s.coinXp || 0 : 0));
export function coinResult(previous: GameState, today: string, score: number): { state: GameState; xp: number; record: boolean; best: number } {
  const s = copyState(previous), points = Math.max(0, Math.floor(score));
  const xp = Math.min(coinXpLeft(previous, today), Math.floor(points / 3));
  if (s.coinDay !== today) { s.coinDay = today; s.coinXp = 0; }
  s.coinXp += xp; addXp(s, today, xp);
  const record = points > (previous.coinBest || 0) && points > 0;
  s.coinBest = Math.max(previous.coinBest || 0, points); s.stats.coinBest = Math.max(s.stats.coinBest, points); s.stats.coinGames++;
  return { state: s, xp, record, best: s.coinBest };
}

/** Applies one moment to the state: new lit day, perisai used or earned, XP, badges, level, missions, the challenge. */
export function advance(previous: GameState | null, o: Observation): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const s: GameState = previous ? copyState(previous) : emptyState();
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
        s.shields -= missed.length; s.frozen = keep([...s.frozen, ...missed], 60); if (!first) s.stats.shields += missed.length;
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
    if (checkin) s.stats.checkins++;
    if (st.current === 1 && s.lostRun > 0) { s.stats.comebacks++; s.lostRun = 0; }
    if (new Date(D(o.today)).getUTCDay() === 0 && s.days.includes(prevDay(o.today))) s.stats.weekends++;
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
  // Habits for the badges: days with Catat otomatis / scan, an early or late entry, the api bareng streak.
  if (o.mission.quick && s.stats.quickDay !== o.today) { s.stats.quickDay = o.today; s.stats.quickDays++; }
  if (o.mission.scan && s.stats.scanDay !== o.today) { s.stats.scanDay = o.today; s.stats.scans++; }
  if (o.mission.early) s.stats.early = Math.max(1, s.stats.early);
  if (o.mission.late) s.stats.late = Math.max(1, s.stats.late);
  if (o.shared && o.shared > s.stats.sharedBest) s.stats.sharedBest = o.shared;
  // Missions of the day.
  if (s.missionDay !== o.today) { s.missionDay = o.today; s.missionIds = missionsFor(o.seed, o.today, o.hour); s.missionsDone = []; s.missionBonus = false; }
  const ctx: MissionCtx = { ...o.mission, created: Object.values(s.txCounted).reduce((n, v) => n + v, 0) };
  for (const id of s.missionIds) {
    const m = missionById(id); if (!m || s.missionsDone.includes(id) || !m.done(ctx)) continue;
    s.missionsDone = [...s.missionsDone, id]; s.stats.missions++; give(m.xp, m.title, true); events.push({ kind: 'mission', id, title: m.title, xp: m.xp });
  }
  if (!s.missionBonus && s.missionIds.length && s.missionIds.every(id => s.missionsDone.includes(id))) { s.missionBonus = true; s.stats.fullDays++; give(MISSION_BONUS, 'Semua misi', true); events.push({ kind: 'missions-all', xp: MISSION_BONUS }); }
  // The weekly challenge (only where the person's own records are seen).
  if (o.week && o.habits) {
    const week = mondayOf(o.today);
    if (s.week !== week) {
      // Last week's challenge that is decided at the end of the week.
      if (s.challenge && s.challenge.endOfWeek && !s.challengeDone && !s.challengeLost && o.lastWeek && s.week === addDays(week, -7)) {
        const p = challengeProgress(s.challenge, weekCtx(s.days, s.week, addDays(s.week, 7), o.lastWeek), true);
        if (p.won) { s.stats.challenges++; give(s.challenge.xp, 'Tantangan minggu lalu', true); events.push({ kind: 'challenge', title: s.challenge.title, xp: s.challenge.xp }); }
      }
      const dayIndex = daysBetween(week, o.today), litBefore = s.days.filter(d => d >= week && d < o.today).length;
      s.week = week; s.challenge = challengeFor(o.seed, week, o.habits, { dayIndex, litBefore }); s.challengeDone = false; s.challengeLost = false;
    }
    if (s.challenge && !s.challengeDone && !s.challengeLost) {
      const p = challengeProgress(s.challenge, weekCtx(s.days, week, o.today, o.week), false);
      if (p.won) { s.challengeDone = true; s.stats.challenges++; give(s.challenge.xp, 'Tantangan mingguan', true); events.push({ kind: 'challenge', title: s.challenge.title, xp: s.challenge.xp }); }
      else if (p.lost) s.challengeLost = true;
    }
  }
  // 9.5 Badges reached now (quietly on the very first look; several at once are told together).
  const unlocked = ACHIEVEMENTS.filter(a => !s.achievements[a.id] && a.value(s) >= a.target);
  if (unlocked.length) {
    for (const a of unlocked) { s.achievements = { ...s.achievements, [a.id]: o.today }; if (!first) give(TIERS[a.tier].xp, `Lencana ${a.name}`, true); }
    if (!first) events.push({ kind: 'achievements', items: unlocked.map(a => ({ id: a.id, name: a.name, emoji: a.emoji, tier: a.tier, desc: a.desc, xp: TIERS[a.tier].xp })) });
  }
  // Level up (said once per level).
  const lv = levelOf(s.xp);
  if (lv.level > s.seenLevel) { s.seenLevel = lv.level; if (previous) events.push({ kind: 'level', level: lv.level, title: lv.title, emoji: lv.emoji }); }
  return { state: s, events };
}

// ——— Api bareng (a Ruang Bersama) ———
/** The space's flame: a day counts when every member was lit in that space that day (9.5: recorded there, or tapped
 * "Hari ini aman" there; their Pribadi flame does not count). */
export function sharedStreak(memberDays: Record<string, string[]>, memberIds: string[], today: string) {
  const sets = memberIds.map(id => new Set(memberDays[id] || []));
  const all = (d: string) => sets.length > 1 && sets.every(x => x.has(d));
  const litToday = all(today);
  let current = 0, d = litToday ? today : prevDay(today);
  for (let i = 0; i < 4000 && all(d); i++) { current++; d = prevDay(d); }
  return { current, litToday, atRisk: !litToday && current > 0, members: memberIds.map((id, i) => ({ id, litToday: sets[i].has(today) })) };
}
/** The days a member shares with their spaces: lit or saved, the last 60. (Up to 9.4; see spaceDays.) */
export const sharedDays = (s: Pick<GameState, 'days' | 'frozen'>) => keep([...s.days, ...s.frozen], 60);
/** 9.5 A member's days in one space: what they had there, plus the days they recorded there and check-ins tapped
 * there (sorted, no repeats, the last 60). Their Pribadi days never come in here. */
export const spaceDays = (had: string[], recorded: string[], checkins: string[] = []) => keep([...had, ...recorded, ...checkins].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)), 60);
