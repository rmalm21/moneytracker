/**
 * 10.3 Sentences for the pembaca kalimat (lib/catat/tagger.ts), written by the app itself with the answer for every word:
 * AMT amount · WAL the wallet paid from (or money came into) · WTO the wallet a transfer goes to · ITEM what · PLACE
 * where · DATE when · PERSON someone · O anything else.
 *
 * Its own word lists. Wallet misspellings are made by random slips of a wallet's name (a letter dropped, doubled,
 * swapped, a vowel changed, the vowels dropped), and words that only look like a wallet ("es krim" next to Krom, "jenis",
 * "sabun mandi", "jagung") are written where things go, so the tagger learns the place, not the spelling.
 *
 * None of the held-out test words (bench/v103: the held-out word lists and hand-written sentences, apart from words the
 * dev side has too, the wallet names and numbers) and none of the benchmark's misspellings (dev or held-out) is used:
 * a sentence with one is dropped, and `assertClean` stops the build if one gets through.
 */
import { LEX } from '../bench/v103/gen.mjs';
import { cases as handDev } from '../bench/v103/hand-dev.mjs';
import { cases as handHeld } from '../bench/v103/hand-heldout.mjs';
import { editDistance } from '../lib/catat/tagger.ts';

export function random(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
const words = s => String(s).toLocaleLowerCase('id-ID').split(/[^\p{L}\p{N}.,-]+/u).map(w => w.replace(/^[.,-]+|[.,-]+$/g, '')).filter(Boolean);

// ── What the account can have ────────────────────────────────────────────────
export const WALLET_POOL = ['GoPay', 'OVO', 'ShopeePay', 'LinkAja', 'Jago', 'Bank Jago', 'Jenius', 'Mandiri', 'BCA', 'BRI', 'BNI', 'Krom', 'SeaBank', 'Blu', 'Cash', 'Tunai', 'CIMB', 'Permata', 'Flip', 'Allo', 'Neo'];
const mainWord = name => { const parts = name.toLocaleLowerCase('id-ID').split(/\s+/).filter(p => p !== 'bank'); return parts.join(''); };

// ── Word lists (this file's own) ─────────────────────────────────────────────
const ITEMS = ['kopi', 'americano', 'latte', 'matcha', 'teh tarik', 'es buah', 'nasi kucing', 'nasi kebuli', 'pempek', 'tekwan', 'rawon', 'gudeg', 'tahu tek', 'mie aceh', 'roti canai', 'croissant', 'kue lapis', 'klepon', 'popcorn', 'keripik', 'cokelat', 'yogurt', 'sereal', 'kecap', 'saus', 'mentega', 'tepung', 'ikan', 'daging', 'tempe', 'tahu', 'pampers', 'popok', 'pembalut', 'sikat gigi', 'lampu', 'kabel', 'baterai', 'charger', 'earphone', 'mouse', 'keyboard', 'flashdisk', 'tinta printer', 'kertas', 'map', 'sewa lapangan', 'tiket museum', 'sewa sepeda', 'servis ac', 'sedot wc', 'materai', 'pasfoto', 'vaksin', 'kacamata', 'softlens', 'kopi susu', 'teh manis', 'ayam penyet', 'ayam goreng', 'gado gado', 'ketoprak', 'batagor', 'cireng', 'seblak', 'mie goreng', 'mie rebus', 'indomie', 'bubur', 'donat', 'pisang goreng', 'martabak telor', 'pizza', 'burger', 'kebab', 'sushi', 'ramen', 'dimsum', 'boba', 'es krim', 'rujak', 'buah', 'telur', 'gula', 'minyak goreng', 'susu', 'sabun', 'sabun mandi', 'pasta gigi', 'tisu', 'deterjen', 'galon', 'pulsa', 'wifi', 'bensin', 'solar', 'parkir', 'tol', 'ojek', 'ojol', 'grab', 'gojek', 'taksi', 'krl', 'busway', 'tiket pesawat', 'servis motor', 'tambal ban', 'obat', 'vitamin', 'periksa gigi', 'cek darah', 'potong rambut', 'skincare', 'parfum', 'kaos', 'kemeja', 'sepatu', 'tas', 'jaket', 'kaus kaki', 'buku', 'pulpen', 'print', 'jilid', 'les', 'kursus', 'spp', 'spotify', 'game', 'voucher game', 'nonton', 'bioskop', 'futsal', 'badminton', 'gym', 'renang', 'kado', 'sumbangan', 'zakat', 'sedekah', 'arisan', 'iuran', 'kos', 'listrik', 'jagung', 'krim', 'kroket', 'mandi'];
/** Real words one slip away from a common wallet name, as things bought (they stay what they are). */
const LOOKALIKE = ['es krim', 'krim wajah', 'krim kocok', 'roti krem', 'krem sup', 'obat kram', 'koyo kram', 'uang jaga', 'jaga malam', 'jaga parkir', 'sabun mandi', 'mandi bola', 'alat mandi', 'ikan tuna', 'roti tuna', 'case hp', 'hash brown', 'lampu neon', 'blue band', 'les genius', 'kroket', 'jagung'];
const ENGLISH = ['lunch', 'dinner', 'coffee', 'snack', 'haircut', 'laundry', 'movie', 'drinks', 'dessert'];
const PLACES = ['warteg', 'kantin', 'pasar', 'indomaret', 'alfamidi', 'lawson', 'familymart', 'starbucks', 'mcd', 'burger king', 'pizza hut', 'solaria', 'richeese', 'gacoan', 'mixue', 'chatime', 'fore', 'point coffee', 'tomoro', 'shopee', 'blibli', 'tiktok shop', 'pom bensin', 'spbu', 'apotek', 'klinik', 'rumah sakit', 'salon', 'barbershop', 'gramedia', 'ace hardware', 'ikea', 'giant', 'hypermart', 'transmart', 'lotte mart', 'mall', 'bandara', 'kampus', 'kantor'];
const INCOME = ['gaji', 'bonus', 'hasil jualan', 'hasil ngojek', 'fee', 'honor', 'royalti', 'cashback', 'refund', 'dividen', 'transferan ortu', 'hadiah', 'angpao'];
const PEOPLE = ['andi', 'budi', 'citra', 'dewi', 'eko', 'fajar', 'gita', 'hana', 'indra', 'joko', 'kiki', 'lina', 'mira', 'nanda', 'putri', 'reza', 'sinta', 'tono', 'umar', 'wati', 'zaki', 'ibu', 'adek', 'kakak', 'pacar', 'temen'];
const DATES = ['kemarin', 'kmrn', 'tadi', 'tadi pagi', 'tadi siang', 'tadi sore', 'tadi malam', 'semalam', 'barusan', 'pagi ini', 'hari ini', 'senin', 'selasa', 'kamis', 'jumat', 'sabtu', 'tgl 3', 'tgl 20', '2 hari lalu', '4 hari lalu', 'kemarin sore', 'kemarin malam'];
const LEADS = ['pake', 'pakai', 'via', 'lewat', 'dari', 'bayar pake', 'pakai saldo', 'pake saldo', 'debit', 'tf', 'dibayar pake'];
const FILLERS = ['eh', 'btw', 'tadi', 'barusan', 'gue', 'aku', 'saya', 'gw', 'wah', 'aduh', 'yah', 'oke', 'nah', 'jadi', 'tolong catat', 'catat', 'catet'];
const TAILS = ['ya', 'yaa', 'dong', 'wkwk', 'wkwkwk', 'hahaha', 'huhu', 'mantap', 'sip', 'aja', 'kak', 'min', 'tolong', 'pls'];
const BUY = ['beli', 'bayar', 'jajan', 'abis', 'habis', 'keluar', 'belanja', 'pesen', 'order', 'checkout', 'isi'];
const TVERB = ['transfer', 'tf', 'pindahin', 'top up', 'topup', 'isi saldo', 'narik', 'tarik', 'nabung'];
const NUMWORDS = [['sepuluh ribu', 10000], ['lima puluh ribu', 50000], ['sejuta', 1000000], ['seribu', 1000], ['dua ribu', 2000], ['enam puluh ribu', 60000]];
const SLANG = [['ceban', 10000], ['goceng', 5000], ['gocap', 50000], ['seceng', 1000], ['gopek', 500], ['sejuta', 1000000]];

function amount(rnd) {
  const r = rnd();
  if (r < 0.1) return pick(rnd, NUMWORDS)[0];
  if (r < 0.17) return pick(rnd, SLANG)[0];
  const n = pick(rnd, [3, 4, 5, 7, 8, 10, 12, 13, 15, 17, 19, 21, 23, 24, 26, 28, 33, 38, 42, 48, 50, 58, 64, 70, 85, 90, 99, 100, 125, 135, 200, 250, 300, 350, 450, 500, 750]);
  const big = rnd() < 0.15, jt = pick(rnd, ['1', '1,5', '2', '2,5', '3', '4', '7,5', '10']);
  if (big) return pick(rnd, [`${jt}jt`, `${jt} juta`, `${jt}jt`, `Rp${jt}jt`]);
  return pick(rnd, [`${n}rb`, `${n}k`, `${n} ribu`, `${n}.000`, `Rp${n}.000`, `rp ${n}rb`, `Rp ${n}.000`, `${n}rb`, `${n}ribu`, `${n} rb`, `Rp.${n}.000`]);
}

/** A slip in a wallet's name, the way thumbs make them. */
export function slip(rnd, word) {
  const vowels = 'aiueo', at = 1 + Math.floor(rnd() * Math.max(1, word.length - 1)), op = rnd();
  if (word.length < 3) return word + word.at(-1);
  if (op < 0.2) return word.slice(0, at) + word.slice(at + 1);                                 // a letter dropped
  if (op < 0.4) return word.slice(0, at) + word[at - 1] + word.slice(at);                      // a letter doubled
  if (op < 0.55 && at < word.length - 1) return word.slice(0, at) + word[at + 1] + word[at] + word.slice(at + 2); // two swapped
  if (op < 0.75) { const i = [...word].findIndex((c, k) => k >= at && vowels.includes(c)); if (i > 0) return word.slice(0, i) + pick(rnd, [...vowels].filter(v => v !== word[i])) + word.slice(i + 1); }
  if (op < 0.85 && word.length >= 5) return word[0] + word.slice(1).replace(/[aiueo]/, '');      // a vowel left out
  return word + pick(rnd, ['s', 'h', 'y', word.at(-1)]);                                         // one more at the end
}

/** One sentence: pieces of [text, tag]. */
function sentence(rnd, account) {
  const wal = () => { const name = pick(rnd, account); const w = mainWord(name); return rnd() < 0.3 ? slip(rnd, w) : pick(rnd, [w, w, name.toLocaleLowerCase('id-ID')]); };
  const item = () => { const r = rnd(); return r < 0.12 ? pick(rnd, ENGLISH) : r < 0.2 ? pick(rnd, LOOKALIKE) : pick(rnd, ITEMS); };
  const lead = () => rnd() < 0.55 ? [[pick(rnd, LEADS), 'O']] : [];
  const opt = (p, x) => rnd() < p ? x : [];
  const W = [wal(), 'WAL'], A = [amount(rnd), 'AMT'], I = [item(), 'ITEM'], D = [pick(rnd, DATES), 'DATE'], P = [pick(rnd, PLACES), 'PLACE'], F = [pick(rnd, FILLERS), 'O'], T = [pick(rnd, TAILS), 'O'];
  const r = rnd();
  let s;
  if (r < 0.42) {           // spending, any order
    const shapes = [
      [I, A, ...lead(), W], [...lead(), W, I, A], [A, I, ...lead(), W], [I, ...lead(), W, A], [W, I, A], [I, W, A], [A, W, I],
      [[pick(rnd, BUY), 'O'], I, A, ...lead(), W], [I, A, ...lead(), W, D], [D, I, A, ...lead(), W], [I, D, A, W], [W, A, I, D],
    ];
    s = [...opt(0.2, [F]), ...pick(rnd, shapes), ...opt(0.2, [T])];
  } else if (r < 0.55) {    // with a place
    const shapes = [[I, ['di', 'O'], P, A, ...lead(), W], [P, I, A, W], [P, A, ...lead(), W], [[pick(rnd, BUY), 'O'], I, ['di', 'O'], P, A, ...lead(), W], [W, P, A], [I, A, ['di', 'O'], P, ...lead(), W], [P, W, A]];
    s = [...opt(0.15, [F]), ...pick(rnd, shapes), ...opt(0.15, [T])];
  } else if (r < 0.66) {    // between own wallets
    let to = wal(); const from = W[0]; while (mainWord(to) === mainWord(from)) to = wal();
    const O = [to, 'WTO'], V = [pick(rnd, TVERB), 'O'];
    const shapes = [[V, A, ['dari', 'O'], W, ['ke', 'O'], O], [V, A, W, ['ke', 'O'], O], [W, ['ke', 'O'], O, A], [V, O, A, ['dari', 'O'], W], [V, O, A, ...lead(), W], [A, ['dari', 'O'], W, ['ke', 'O'], O], [V, ['dari', 'O'], W, ['ke', 'O'], O, A], [V, ['ke', 'O'], O, A, ['dari', 'O'], W]];
    s = [...opt(0.1, [F]), ...pick(rnd, shapes), ...opt(0.1, [T])];
  } else if (r < 0.76) {    // money in
    const S = [pick(rnd, INCOME), 'ITEM'];
    const shapes = [[S, A, ['masuk', 'O'], W], [S, A, ['ke', 'O'], W], [['dapet', 'O'], S, A, ['di', 'O'], W], [W, ['masuk', 'O'], S, A], [S, ['masuk', 'O'], W, A], [['terima', 'O'], S, A, W], [S, A, W]];
    s = [...pick(rnd, shapes), ...opt(0.1, [T])];
  } else if (r < 0.86) {    // someone else
    const Pp = [pick(rnd, PEOPLE), 'PERSON'];
    const shapes = [[I, ['buat', 'O'], Pp, A, ...lead(), W], [['bayarin', 'O'], I, Pp, A, W], [['traktir', 'O'], Pp, I, A, W], [I, ['sama', 'O'], Pp, A, W], [Pp, ['bayar', 'O'], I, A], [['patungan', 'O'], I, ['sama', 'O'], Pp, A, W], [['minjemin', 'O'], Pp, A, ...lead(), W], [Pp, ['ngembaliin', 'O'], A, ['ke', 'O'], W]];
    s = pick(rnd, shapes);
  } else if (r < 0.93) {    // two things
    const I2 = [item(), 'ITEM'], A2 = [amount(rnd), 'AMT'];
    s = pick(rnd, [[I, A, ['sama', 'O'], I2, A2, ...lead(), W], [I, A, I2, A2, W], [W, I, A, ['dan', 'O'], I2, A2], [I, A, ['terus', 'O'], I2, A2, ...lead(), W]]);
  } else {                  // no wallet at all (a word that only looks like one stays what it is)
    const L = [pick(rnd, LOOKALIKE), 'ITEM'];
    s = pick(rnd, [[I, A], [A, I], [[pick(rnd, BUY), 'O'], I, A], [I, A, D], [I, ['di', 'O'], P, A], [D, I, A], [L, A], [L, A, ...lead(), W], [L, A, W], [A, L], [L, ['di', 'O'], P, A]]);
  }
  const out = [];
  for (const [text, tag] of s) for (const w of words(text)) out.push([w, tag]);
  return out;
}

/** The words the corpus must not use (see the top of this file). */
export function forbidden() {
  const walk = (x, out) => { if (typeof x === 'string') words(x).forEach(w => out.add(w)); else if (typeof x === 'function') walk(x(7), out); else if (Array.isArray(x)) x.forEach(v => walk(v, out)); else if (x && typeof x === 'object') Object.entries(x).forEach(([k, v]) => { walk(k, out); walk(v, out); }); return out; };
  const held = walk(LEX.heldout, new Set()), dev = walk(LEX.dev, new Set());
  handHeld.forEach(c => walk(c.text, held)); handDev.forEach(c => walk(c.text, dev));
  const wallets = new Set(['gopay', 'jago', 'jenius', 'mandiri', 'bri', 'krom', 'cash', 'tunai']);
  // Numbers and amounts in the usual spellings (25rb, 25k, 2jt, 25.000) are on both sides by design; unusual ones are not.
  const out = new Set([...held].filter(w => !dev.has(w) && !wallets.has(w) && !/^\d[\d.,]*(?:rb|ribu|k|jt|juta)?$/.test(w)));
  // Every misspelling the benchmark uses, on either side: the tagger must meet them for the first time in the test.
  for (const list of [LEX.dev.typos, LEX.heldout.typos]) Object.values(list).flat().forEach(w => out.add(w));
  for (const c of [...handDev, ...handHeld]) for (const w of [c.want.clean || [], ...(c.want.records || []).map(r => r.clean || [])].flat()) if (!wallets.has(w) && /^\p{L}{3,}$/u.test(w) && [...wallets].some(x => editDistance(w, x) <= 2)) out.add(w);
  for (const w of ['transprot', 'jajann', 'trasnportasi', 'bensinn', 'mkn']) out.add(w);
  return out;
}

/** `n` sentences, each with the account (wallet names) it was written for. */
export function makeCorpus(seed, n) {
  const rnd = random(seed), bad = forbidden(), out = [];
  let dropped = 0; const why = {};
  while (out.length < n) {
    const size = 3 + Math.floor(rnd() * 5), account = [];
    while (account.length < size) { const w = pick(rnd, WALLET_POOL); if (!account.some(a => mainWord(a) === mainWord(w))) account.push(w); }
    // Words that only look like a wallet are written next to that wallet's account now and then.
    if (rnd() < 0.3) for (const w of ['Krom', 'Jenius', 'Mandiri', 'Jago', 'Tunai', 'Neo', 'Blu']) if (!account.includes(w)) account.push(w);
    const s = sentence(rnd, account);
    if (s.some(([w]) => bad.has(w))) { dropped++; for (const [w] of s) if (bad.has(w)) why[w] = (why[w] || 0) + 1; continue; }
    out.push({ account, tokens: s });
  }
  return { sentences: out, dropped, why };
}

/** Stops the build when a held-out word or a benchmark misspelling is in the corpus. */
export function assertClean(sentences) {
  const bad = forbidden(), hits = new Set();
  for (const s of sentences) for (const [w] of s.tokens) if (bad.has(w)) hits.add(w);
  if (hits.size) throw new Error(`Korpus memuat kata uji tersembunyi: ${[...hits].slice(0, 20).join(', ')}`);
  return bad.size;
}
