/**
 * 9.8 Pet: a little friend that sits next to the chat button. Six to pick from (kucing, anjing, burung hantu, ayam,
 * elang, tokek), each with a name you give it, its own special move, and its own needs:
 *  - Kenyang (every pet, its own food): you feed it yourself (Kasih makan, up to 4 meals a day, 2 hours apart). It
 *    does not depend on recording: a day without transactions is fine. It never dies; a need only goes down to 0.
 *  - Senang fills when you play with it (hold), a little when you pet it (tap) or record a transaction.
 *  - One need of its own, each with a way to fill it right there: the cat wants petting (Manja), the dog its walk
 *    (Jalan: Ajak jalan, or the flame lit today), the owl knowledge (Ilmu: a tip read), the chicken diligence (Rajin:
 *    Ajak mengais, or missions done), the eagle flight (Terbang: its flight, or a mini game played), the gecko thrift
 *    (Hemat, today's spending against the usual; a day without spending is the best).
 * Needs go down with time (slower while it sleeps). The pet grows with the Arena XP earned while it is yours and with
 * care: levels, four stages (Bayi, Remaja, Dewasa, Legenda) and accessories. Pure: the screen keeps the time and the
 * state (users/{uid}/game/pet).
 */
export type PetKind = 'kucing' | 'anjing' | 'hantu' | 'ayam' | 'elang' | 'tokek';
export type NeedId = 'kenyang' | 'senang' | 'manja' | 'jalan' | 'ilmu' | 'rajin' | 'terbang' | 'hemat';
export type PetVoice = 'meow' | 'bark' | 'hoot' | 'cluck' | 'screech' | 'tokek';
export type PetInfo = {
  kind: PetKind; species: string; name: string; emoji: [string, string, string, string]; food: { emoji: string; name: string };
  needs: [NeedId, NeedId, NeedId]; special: { name: string; emoji: string; text: string }; voice: PetVoice; sound: string; trait: string;
  /** Hours it sleeps (local time): [from, to). The owl sleeps by day. */ sleep: [number, number];
};
export const PETS: Record<PetKind, PetInfo> = {
  kucing: { kind: 'kucing', species: 'Kucing', name: 'Oyen', emoji: ['🐱', '🐈', '🐈', '🐈‍⬛'], food: { emoji: '🐟', name: 'ikan' }, needs: ['kenyang', 'manja', 'senang'],
    special: { name: 'Kejar Benang', emoji: '🧶', text: 'Tahan buat main: dia kejar benang, jejak kakinya bertebaran, terus mendengkur.' }, voice: 'meow', sound: 'meong', trait: 'Manja, suka dielus', sleep: [23, 6] },
  anjing: { kind: 'anjing', species: 'Anjing', name: 'Bruno', emoji: ['🐶', '🐕', '🐕', '🐕‍🦺'], food: { emoji: '🦴', name: 'tulang' }, needs: ['kenyang', 'jalan', 'senang'],
    special: { name: 'Tangkap Bola', emoji: '🎾', text: 'Tahan buat main: bola dilempar, dia lompat menangkap sambil goyang ekor.' }, voice: 'bark', sound: 'guk', trait: 'Setia, pengin jalan tiap hari', sleep: [23, 6] },
  hantu: { kind: 'hantu', species: 'Burung hantu', name: 'Huhu', emoji: ['🦉', '🦉', '🦉', '🦉'], food: { emoji: '🦗', name: 'jangkrik' }, needs: ['kenyang', 'ilmu', 'senang'],
    special: { name: 'Mata Malam', emoji: '🌙', text: 'Tahan buat main: kepalanya muter, bintang dan bulan berputar. Malam hari matanya bersinar.' }, voice: 'hoot', sound: 'huhu', trait: 'Bijak, doyan tips', sleep: [11, 14] },
  ayam: { kind: 'ayam', species: 'Ayam', name: 'Ciko', emoji: ['🐣', '🐥', '🐔', '🐓'], food: { emoji: '🌽', name: 'jagung' }, needs: ['kenyang', 'rajin', 'senang'],
    special: { name: 'Telur Emas', emoji: '🥚', text: 'Tahan buat main: bulunya beterbangan. Kalau semua kebutuhannya terpenuhi, tiap hari ada telur emas buat dikumpulkan.' }, voice: 'cluck', sound: 'petok', trait: 'Rajin, bangun pagi', sleep: [22, 5] },
  elang: { kind: 'elang', species: 'Elang', name: 'Kilat', emoji: ['🦅', '🦅', '🦅', '🦅'], food: { emoji: '🍖', name: 'daging' }, needs: ['kenyang', 'terbang', 'senang'],
    special: { name: 'Terbang Tinggi', emoji: '🌪️', text: 'Tahan buat main: dia terbang memutar keliling layar lalu mendarat lagi.' }, voice: 'screech', sound: 'kiak', trait: 'Gagah, suka tantangan', sleep: [23, 6] },
  tokek: { kind: 'tokek', species: 'Tokek', name: 'Toki', emoji: ['🦎', '🦎', '🦎', '🦎'], food: { emoji: '🦟', name: 'nyamuk' }, needs: ['kenyang', 'hemat', 'senang'],
    special: { name: 'Kamuflase', emoji: '🌈', text: 'Tahan buat main: warnanya berganti-ganti, lidahnya nangkap nyamuk, terus bunyi tok-kek!' }, voice: 'tokek', sound: 'tok-kek', trait: 'Kalem, senang kalau kamu hemat', sleep: [23, 6] },
};
export const PET_KINDS = Object.keys(PETS) as PetKind[];
export const NEEDS: Record<NeedId, { name: string; emoji: string; hint: string; perHour: number }> = {
  kenyang: { name: 'Kenyang', emoji: '🍽️', hint: 'Ketuk Kasih makan, sampai 4× sehari', perHour: 3 },
  senang: { name: 'Senang', emoji: '😊', hint: 'Tahan pet-nya buat main, ketuk buat elus', perHour: 3 },
  manja: { name: 'Manja', emoji: '🤗', hint: 'Ketuk buat elus. Kucing gampang kangen', perHour: 5 },
  jalan: { name: 'Jalan-jalan', emoji: '🦮', hint: 'Ketuk Ajak jalan, atau nyalakan api hari ini', perHour: 3 },
  ilmu: { name: 'Ilmu', emoji: '📖', hint: 'Baca tips darinya', perHour: 2 },
  rajin: { name: 'Rajin', emoji: '🎯', hint: 'Ketuk Ajak mengais, atau selesaikan misi harian', perHour: 2 },
  terbang: { name: 'Terbang', emoji: '🪶', hint: 'Tahan buat terbang, atau main mini game di Arena', perHour: 3 },
  hemat: { name: 'Hemat', emoji: '🐷', hint: 'Pengeluaran hari ini di bawah biasanya (tanpa pengeluaran paling bagus)', perHour: 0 },
};

export type PetRec = { kind: PetKind; name: string; needs: Record<NeedId, number>; at: number; growth: number; acc: string | null; eggs: number; eggDay: string; born: string };
export type PetState = {
  v: 1; active: PetKind | null; pets: Partial<Record<PetKind, PetRec>>;
  /** What was already counted (so nothing is given twice, also across phones). */ seenTx: { day: string; n: number }; litDay: string; missionsSeen: number; gamesSeen: number; xpSeen: number;
  elus: { hour: string; n: number }; playAt: number; tipsRead: number; /** Meals given today and when the last one was. */ meals: { day: string; n: number; at: number }; careAt: number;
};
export const emptyPet = (): PetState => ({ v: 1, active: null, pets: {}, seenTx: { day: '', n: 0 }, litDay: '', missionsSeen: -1, gamesSeen: -1, xpSeen: -1, elus: { hour: '', n: 0 }, playAt: 0, tipsRead: 0, meals: { day: '', n: 0, at: 0 }, careAt: 0 });
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n * 10) / 10));
const copy = (s: PetState): PetState => ({ ...emptyPet(), ...s, seenTx: { ...emptyPet().seenTx, ...(s.seenTx || {}) }, elus: { ...emptyPet().elus, ...(s.elus || {}) }, meals: { ...emptyPet().meals, ...(s.meals || {}) },
  pets: Object.fromEntries(Object.entries(s.pets || {}).map(([k, r]) => [k, { ...r!, needs: { ...r!.needs } }])) });
const fullNeeds = (): Record<NeedId, number> => ({ kenyang: 80, senang: 80, manja: 80, jalan: 80, ilmu: 80, rajin: 80, terbang: 80, hemat: 70 });
export const cleanName = (text: string, kind: PetKind) => (text || '').replace(/\s+/g, ' ').trim().slice(0, 16) || PETS[kind].name;

// ——— Growth: levels, stages, accessories ———
export const levelOf = (growth: number) => 1 + Math.floor(Math.sqrt(Math.max(0, growth) / 25));
export const growthFor = (level: number) => 25 * (level - 1) ** 2;
export const STAGES = [{ name: 'Bayi', from: 1 }, { name: 'Remaja', from: 4 }, { name: 'Dewasa', from: 7 }, { name: 'Legenda', from: 11 }] as const;
export const stageOf = (level: number) => { let k = 0; STAGES.forEach((s, i) => { if (level >= s.from) k = i; }); return k; };
export const ACCESSORIES = [
  { id: 'pita', name: 'Pita', emoji: '🎀', level: 2 }, { id: 'syal', name: 'Syal', emoji: '🧣', level: 4 }, { id: 'kacamata', name: 'Kacamata', emoji: '🕶️', level: 6 },
  { id: 'topi', name: 'Topi', emoji: '🎩', level: 8 }, { id: 'mahkota', name: 'Mahkota', emoji: '👑', level: 11 },
] as const;
export const unlocked = (level: number) => ACCESSORIES.filter(a => level >= a.level);
export const petEmoji = (rec: Pick<PetRec, 'kind' | 'growth'>) => PETS[rec.kind].emoji[stageOf(levelOf(rec.growth))];

// ——— Time ———
export function asleep(kind: PetKind, hour: number) { const [a, b] = PETS[kind].sleep; return a < b ? hour >= a && hour < b : hour >= a || hour < b; }
/** The needs now: down with the hours since the last look (a third as fast while asleep), the gecko's thrift as given. */
export function needsAt(rec: PetRec, now: number, hourOf: (ms: number) => number, hemat?: number): Record<NeedId, number> {
  const out = { ...rec.needs };
  // Hours awake and asleep since the last look (counted per quarter hour); a week away empties everything.
  let awake = 0, slept = 0;
  if (now - rec.at > 7 * 86_400_000) awake = 1e6;
  else for (let t = rec.at; t < now; t += 15 * 60 * 1000) { const h = Math.min(15 * 60 * 1000, now - t) / 3_600_000; if (asleep(rec.kind, hourOf(t))) slept += h; else awake += h; }
  for (const id of PETS[rec.kind].needs) if (NEEDS[id].perHour) out[id] = clamp(out[id] - NEEDS[id].perHour * (awake + slept / 3));
  if (hemat !== undefined && PETS[rec.kind].needs.includes('hemat')) out.hemat = clamp(hemat);
  return out;
}
/** The gecko's thrift (0–100): today's spending against the usual day (the last 30 days). */
export function hematScore(todaySpent: number, usualDay: number) {
  if (usualDay <= 0) return todaySpent > 0 ? 50 : 80;
  const r = todaySpent / usualDay;
  return clamp(r <= 1 ? 100 - 50 * r : 50 - 50 * (r - 1));
}

// ——— Mood ———
export type Mood = { id: 'tidur' | 'lapar' | 'kangen' | 'sedih' | 'senang' | 'biasa'; text: string; emoji: string };
export function moodOf(rec: PetRec, needs: Record<NeedId, number>, hour: number): Mood {
  const info = PETS[rec.kind], own = info.needs[1];
  if (asleep(rec.kind, hour)) return { id: 'tidur', text: `${rec.name} lagi tidur. Sst…`, emoji: '💤' };
  if (needs.kenyang < 25) return { id: 'lapar', text: `${rec.name} laper. Kasih ${info.food.name} yuk!`, emoji: info.food.emoji };
  if (needs[own] < 25) return { id: 'kangen', text: ownLow(rec, own), emoji: NEEDS[own].emoji };
  const avg = info.needs.reduce((n, id) => n + needs[id], 0) / 3;
  if (avg < 40) return { id: 'sedih', text: `${rec.name} lagi kurang semangat. Ajak main yuk.`, emoji: '🥺' };
  if (avg >= 70) return { id: 'senang', text: `${rec.name} lagi senang banget!`, emoji: '💖' };
  return { id: 'biasa', text: `${rec.name} santai aja.`, emoji: '🙂' };
}
function ownLow(rec: PetRec, need: NeedId) {
  const n = rec.name;
  return need === 'manja' ? `${n} ngambek, pengin dielus.` : need === 'jalan' ? `${n} nungguin diajak jalan.`
    : need === 'ilmu' ? `${n} bosan. Baca tips darinya yuk.` : need === 'rajin' ? `${n} pengin diajak mengais.`
    : need === 'terbang' ? `${n} pengin terbang. Tahan dia sebentar yuk!` : `${n} cemas, pengeluaran hari ini lagi tinggi.`;
}

// ——— What happens ———
export type PetEvent = { kind: 'recorded'; n: number } | { kind: 'walk' } | { kind: 'missions'; n: number } | { kind: 'games'; n: number } | { kind: 'level'; level: number; stage: number; stageUp: boolean; acc: string | null } | { kind: 'adopt' };
/** Signals from the rest of the app (the Arena's state). */
export type PetSignals = { today: string; recordedToday: number; lit: boolean; missions: number; games: number; xp: number; now: number };

/** Brings the needs up to now and adds what happened since the last look. */
export function syncPet(previous: PetState, sig: PetSignals, hourOf: (ms: number) => number, hemat?: number): { state: PetState; events: PetEvent[] } {
  const s = copy(previous), events: PetEvent[] = [];
  const rec = s.active ? s.pets[s.active] : undefined;
  // First look: what is there now counts as seen.
  if (s.missionsSeen < 0) s.missionsSeen = sig.missions;
  if (s.gamesSeen < 0) s.gamesSeen = sig.games;
  if (s.xpSeen < 0) s.xpSeen = sig.xp;
  if (s.seenTx.day !== sig.today) s.seenTx = { day: sig.today, n: 0 };
  if (!rec) { s.seenTx.n = sig.recordedToday; s.missionsSeen = sig.missions; s.gamesSeen = sig.games; s.xpSeen = sig.xp; if (sig.lit) s.litDay = sig.today; return { state: s, events }; }
  const before = levelOf(rec.growth);
  rec.needs = needsAt(rec, sig.now, hourOf, hemat); rec.at = sig.now;
  // A transaction recorded makes it happy (it is not its food: feeding is up to you).
  const txNew = Math.max(0, sig.recordedToday - s.seenTx.n);
  if (txNew) { rec.needs.senang = clamp(rec.needs.senang + 5 * txNew); rec.growth += 3 * txNew; s.seenTx.n = sig.recordedToday; events.push({ kind: 'recorded', n: txNew }); }
  if (sig.lit && s.litDay !== sig.today) { s.litDay = sig.today; if (PETS[rec.kind].needs.includes('jalan')) { rec.needs.jalan = 100; events.push({ kind: 'walk' }); } }
  const mNew = Math.max(0, sig.missions - s.missionsSeen); s.missionsSeen = Math.max(s.missionsSeen, sig.missions);
  if (mNew && PETS[rec.kind].needs.includes('rajin')) { rec.needs.rajin = clamp(rec.needs.rajin + 34 * mNew); events.push({ kind: 'missions', n: mNew }); }
  const gNew = Math.max(0, sig.games - s.gamesSeen); s.gamesSeen = Math.max(s.gamesSeen, sig.games);
  if (gNew && PETS[rec.kind].needs.includes('terbang')) { rec.needs.terbang = clamp(rec.needs.terbang + 30 * gNew); events.push({ kind: 'games', n: gNew }); }
  const xpNew = Math.max(0, sig.xp - s.xpSeen); s.xpSeen = Math.max(s.xpSeen, sig.xp); rec.growth += xpNew;
  levelEvent(rec, before, events);
  return { state: s, events };
}
function levelEvent(rec: PetRec, before: number, events: PetEvent[]) {
  const after = levelOf(rec.growth); if (after <= before) return;
  const gained = ACCESSORIES.filter(a => a.level > before && a.level <= after).pop() || null;
  if (gained) rec.acc = gained.id;
  events.push({ kind: 'level', level: after, stage: stageOf(after), stageUp: stageOf(after) > stageOf(before), acc: gained?.id || null });
}
const active = (s: PetState) => (s.active ? s.pets[s.active] : undefined);

/** Adopts a pet (or comes back to one adopted before: it keeps its name and growth). */
export function adopt(previous: PetState, kind: PetKind, name: string, now: number, today: string): PetState {
  const s = copy(previous), old = s.pets[kind];
  s.pets[kind] = old ? { ...old, name: cleanName(name || old.name, kind), at: now } : { kind, name: cleanName(name, kind), needs: fullNeeds(), at: now, growth: 0, acc: null, eggs: 0, eggDay: '', born: today };
  s.active = kind;
  return s;
}
export function rename(previous: PetState, kind: PetKind, name: string): PetState { const s = copy(previous), r = s.pets[kind]; if (r) r.name = cleanName(name, kind); return s; }
export function wear(previous: PetState, acc: string | null): PetState {
  const s = copy(previous), r = active(s); if (!r) return s;
  if (acc === null || unlocked(levelOf(r.growth)).some(a => a.id === acc)) r.acc = acc;
  return s;
}
/** A tap: petting. The cat's Manja (or anyone's Senang) goes up; at most 15 count an hour. */
export function pet(previous: PetState, now: number, hourKey: string, hourOf: (ms: number) => number): { state: PetState; counted: boolean; events: PetEvent[] } {
  const s = copy(previous), r = active(s), events: PetEvent[] = []; if (!r) return { state: s, counted: false, events };
  if (s.elus.hour !== hourKey) s.elus = { hour: hourKey, n: 0 };
  const counted = s.elus.n < 15; if (!counted) return { state: s, counted, events };
  const before = levelOf(r.growth);
  r.needs = needsAt(r, now, hourOf); r.at = now; s.elus.n++;
  if (PETS[r.kind].needs.includes('manja')) r.needs.manja = clamp(r.needs.manja + 8); else r.needs.senang = clamp(r.needs.senang + 5);
  r.growth += 1; levelEvent(r, before, events);
  return { state: s, counted, events };
}
/** A long press: playing (the pet's special). Senang +25, once every 20 minutes (the show plays anyway). */
export const PLAY_EVERY = 20 * 60 * 1000;
export function play(previous: PetState, now: number, hourOf: (ms: number) => number): { state: PetState; counted: boolean; events: PetEvent[] } {
  const s = copy(previous), r = active(s), events: PetEvent[] = []; if (!r) return { state: s, counted: false, events };
  const counted = now - s.playAt >= PLAY_EVERY; if (!counted) return { state: s, counted, events };
  const before = levelOf(r.growth);
  r.needs = needsAt(r, now, hourOf); r.at = now; s.playAt = now;
  r.needs.senang = clamp(r.needs.senang + 25); if (r.kind === 'kucing') r.needs.manja = clamp(r.needs.manja + 10); if (r.kind === 'elang') r.needs.terbang = clamp(r.needs.terbang + 30);
  r.growth += 3; levelEvent(r, before, events);
  return { state: s, counted, events };
}
/** Feeding (its own food): up to 4 meals a day, 2 hours apart; a full pet (95%+) says no thanks. */
export const MEALS_A_DAY = 4, MEAL_GAP = 2 * 3_600_000;
export type FeedResult = { state: PetState; ok: boolean; reason?: 'full' | 'wait' | 'limit'; waitMs?: number; events: PetEvent[] };
export function feed(previous: PetState, now: number, today: string, hourOf: (ms: number) => number): FeedResult {
  const s = copy(previous), r = active(s), events: PetEvent[] = []; if (!r) return { state: s, ok: false, events };
  if (s.meals.day !== today) s.meals = { day: today, n: 0, at: s.meals.at };
  const needs = needsAt(r, now, hourOf);
  if (needs.kenyang >= 95) return { state: s, ok: false, reason: 'full', events };
  if (s.meals.n >= MEALS_A_DAY) return { state: s, ok: false, reason: 'limit', events };
  if (now - s.meals.at < MEAL_GAP) return { state: s, ok: false, reason: 'wait', waitMs: MEAL_GAP - (now - s.meals.at), events };
  const before = levelOf(r.growth);
  r.needs = needs; r.at = now; r.needs.kenyang = clamp(r.needs.kenyang + 35); r.growth += 5;
  s.meals = { day: today, n: s.meals.n + 1, at: now };
  levelEvent(r, before, events);
  return { state: s, ok: true, events };
}
/** Hours until the next meal can be given (0: now). */
export const mealWait = (s: PetState, now: number, today: string) => (s.meals.day === today && s.meals.n >= MEALS_A_DAY ? Infinity : Math.max(0, MEAL_GAP - (now - (s.meals?.at || 0))));
/** The dog's walk and the chicken's scratching around: their own need +40, once every 3 hours. */
export const CARE: Partial<Record<PetKind, { name: string; emoji: string; need: NeedId; say: string }>> = {
  anjing: { name: 'Ajak jalan', emoji: '🦮', need: 'jalan', say: 'Asik, jalan-jalan!' },
  ayam: { name: 'Ajak mengais', emoji: '🌱', need: 'rajin', say: 'Petok! Nemu biji-bijian.' },
};
export const CARE_GAP = 3 * 3_600_000;
export function care(previous: PetState, now: number, hourOf: (ms: number) => number): { state: PetState; ok: boolean; waitMs?: number; events: PetEvent[] } {
  const s = copy(previous), r = active(s), events: PetEvent[] = [], c = r ? CARE[r.kind] : undefined; if (!r || !c) return { state: s, ok: false, events };
  if (now - (s.careAt || 0) < CARE_GAP) return { state: s, ok: false, waitMs: CARE_GAP - (now - s.careAt), events };
  const before = levelOf(r.growth);
  r.needs = needsAt(r, now, hourOf); r.at = now; s.careAt = now;
  r.needs[c.need] = clamp(r.needs[c.need] + 40); r.growth += 3; levelEvent(r, before, events);
  return { state: s, ok: true, events };
}
/** A tip read: the owl's Ilmu goes up (everyone grows a little). */
export function readTip(previous: PetState, now: number, hourOf: (ms: number) => number): PetState {
  const s = copy(previous), r = active(s); if (!r) return s;
  r.needs = needsAt(r, now, hourOf); r.at = now; s.tipsRead++;
  if (PETS[r.kind].needs.includes('ilmu')) r.needs.ilmu = clamp(r.needs.ilmu + 25);
  r.growth += 1;
  return s;
}
/** The chicken's golden egg: once a day, when all its needs are 60 or more. */
export const eggReady = (rec: PetRec | undefined, needs: Record<NeedId, number>, today: string) => Boolean(rec && rec.kind === 'ayam' && rec.eggDay !== today && PETS.ayam.needs.every(id => needs[id] >= 60));
export function collectEgg(previous: PetState, today: string): PetState { const s = copy(previous), r = active(s); if (r && r.kind === 'ayam' && r.eggDay !== today) { r.eggs++; r.eggDay = today; r.growth += 10; } return s; }

// ——— What it says ———
export const MONEY_TIPS = [
  'Sisihkan tabungan di awal gajian, bukan dari sisa.',
  'Tunggu 24 jam sebelum checkout barang keinginan. Sering kali besoknya udah nggak pengin.',
  'Paylater tetap utang. Hitung total cicilannya dulu sebelum klik.',
  'Jajan kecil yang rutin itu bocor halus. Coba lihat totalnya sebulan.',
  'Dana darurat idealnya 3–6 kali pengeluaran sebulan.',
  'Bawa bekal 2 hari seminggu aja udah kerasa hematnya.',
  'Matikan notifikasi promo biar nggak lapar mata.',
  'Bandingkan harga per satuan, bukan harga per bungkus.',
  'Bayar tagihan rutin di awal bulan biar nggak lupa dan kena denda.',
  'Pisahkan dompet buat kebutuhan dan buat jajan.',
  'Langganan yang jarang dipakai? Mending berhenti dulu.',
  'Untung tinggi, cepat, dan pasti itu ciri investasi bodong.',
  'Pinjol ilegal bunganya mencekik. Hindari ya.',
  'Catat juga pemasukan kecil, misalnya jual barang bekas.',
  'Diskon besar tetap belanja kalau barangnya nggak dibutuhkan.',
  'Pakai aturan 50/30/20: kebutuhan, keinginan, tabungan.',
  'Belanja bulanan pakai daftar, jangan pas lagi lapar.',
  'Bikin target tabungan yang jelas, misalnya buat liburan atau gadget.',
  'Cek ulang pengeluaran minggu ini tiap akhir pekan.',
  'Gratis ongkir dengan minimal belanja sering bikin belanja lebih banyak.',
  'Simpan struk belanja besar buat jaga-jaga garansi.',
  'Kalau ragu beli atau nggak, tanya: aku butuh atau cuma pengin?',
  'Masak sendiri seminggu sekali bisa hemat lumayan.',
  'Naik gaji? Naikkan tabungannya dulu, baru gaya hidupnya.',
  'Utang paling mahal dibayar duluan.',
  'Jangan pinjamkan uang yang kamu sendiri butuh.',
  'Bandingkan dulu di 2–3 toko sebelum beli barang mahal.',
  'Tabungan kecil tapi rutin lebih kuat daripada besar tapi jarang.',
  'Sisakan uang buat hal mendadak sebelum beli keinginan.',
  'Catat transaksi langsung setelah bayar biar nggak lupa.',
];
export type TipCtx = { hour: number; recordedToday: number; litToday: boolean; streak: number; missionsLeft: number; spinReady: boolean; scratchReady: boolean; index: number };
/** What the pet says now: something about today when there is something, a money tip otherwise. */
export function petTip(rec: PetRec, needs: Record<NeedId, number>, c: TipCtx): { text: string; kind: 'today' | 'need' | 'tip' } {
  const info = PETS[rec.kind], say = (t: string) => `${t} ${capital(info.sound)}!`;
  if (needs.kenyang < 40) return { text: say(`Aku laper nih. Kasih ${info.food.name} dong!`), kind: 'need' };
  if (!c.recordedToday && c.hour >= 11) return { text: say('Hari ini ada pengeluaran? Jangan lupa dicatat ya.'), kind: 'today' };
  if (!c.litToday && c.streak > 0 && c.hour >= 18) return { text: say(`Api ${c.streak} harimu tinggal ±${24 - c.hour} jam lagi. Catat atau cek-in yuk.`), kind: 'today' };
  if (c.spinReady) return { text: say('Roda hari ini siap diputar. Cek di kartu Arena!'), kind: 'today' };
  if (c.scratchReady) return { text: say('Misi beres! Kartu Gosok Berhadiah udah kebuka.'), kind: 'today' };
  if (c.missionsLeft > 0 && c.missionsLeft < 3 && c.hour >= 15) return { text: say(`Misi hari ini tinggal ${c.missionsLeft}. Dikit lagi!`), kind: 'today' };
  const own = info.needs[1];
  if (needs[own] < 35 && own !== 'hemat') return { text: ownLow(rec, own), kind: 'need' };
  return { text: `${rec.kind === 'hantu' ? 'Tips bijak: ' : ''}${MONEY_TIPS[Math.abs(c.index) % MONEY_TIPS.length]}`, kind: 'tip' };
}
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
