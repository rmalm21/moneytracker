/**
 * Catat otomatis — General Language Intelligence (language pack v1.0).
 *
 * How Indonesians actually type, for every account, before any personal memory:
 *
 *   raw text
 *     → safe text cleanup      punctuation between a word and an amount ("makan:25k"), word+amount compounds
 *                              ("makan25k"), emoji, laughter and politeness fillers ("wkwk", "catetin …")
 *     → curated dictionaries   chat abbreviations, slang, typos, temporal and action words (exact, conventional)
 *     → productive shorthand   unseen vowel-dropped / letter-dropped forms of known canonical words
 *                              ("srapn", "pnglrn", "lstrk"), compiled once from the canonical vocabulary, with
 *                              collision analysis; used only in a money context and never on a protected word
 *     → Financial Grammar      (lib/quick-plan.ts) → Temporal Engine → entities → Kamus Pribadi → state → Bug Catcher
 *
 * Normalization may change the FORM of a word, never the financial meaning: amounts, dates, wallets, people,
 * places and direction words are never rewritten. Known entities (wallets, people, places, categories, the
 * person's own aliases, names written in capitals, a word before "store / cafe / coffee …") are protected.
 * Every change is recorded (raw → normalized, class, tier) for the developer trace and "Kenapa?".
 *
 * Shorthand maps to canonical WORDS; the category engine (lib/categorize.ts) decides categories from those words.
 */
import { conceptWords } from '../categorize.ts';
import { findAmounts, knownPlaces, type QuickContext } from '../quick-entry.ts';

export const GENERAL_LANGUAGE_VERSION = '1.0';

export type NormClass = 'COMMON_ABBREVIATION' | 'COMMON_SLANG' | 'COMMON_TYPO' | 'COMMON_PHONETIC_VARIANT' | 'TEMPORAL_SHORTHAND' | 'ACTION_SYNONYM' | 'PRODUCTIVE_SHORTHAND' | 'REPEATED_LETTERS' | 'FILLER' | 'COMMAND_FILLER' | 'PUNCTUATION' | 'COMPOUND_SPLIT';
export type NormTier = 'EXACT' | 'COMMON' | 'CONTEXTUAL';
export type Normalization = { raw: string; normalized: string; type: NormClass; tier: NormTier };

// ——— Curated dictionaries (exact, conventional; one family per table) ———

/** Chat abbreviations of everyday and money words. */
export const commonAbbreviations: Record<string, string> = {
  mkn: 'makan', mkan: 'makan', maem: 'makan', mam: 'makan', mnm: 'minum', minm: 'minum', mnum: 'minum', maksi: 'makan siang', makmal: 'makan malam',
  blnj: 'belanja', blanja: 'belanja', blnja: 'belanja', blj: 'belanja', bnsn: 'bensin', bensn: 'bensin', bnsin: 'bensin', bensi: 'bensin',
  prkr: 'parkir', prkir: 'parkir', parkr: 'parkir', pkir: 'parkir', jjn: 'jajan', jjan: 'jajan', jajn: 'jajan', srpn: 'sarapan', ongkr: 'ongkir',
  kntr: 'kantor', kntor: 'kantor', byr: 'bayar', bayr: 'bayar', bayarr: 'bayar', trf: 'transfer', trnsfer: 'transfer', transfr: 'transfer', trsf: 'transfer',
  dpt: 'dapat', dpet: 'dapat', msk: 'masuk', adm: 'admin', disc: 'diskon', svc: 'servis', tlp: 'telepon', hp: 'hp', brp: 'berapa',
};
/** Function words and pronouns as typed in chat. */
export const commonSlang: Record<string, string> = {
  pake: 'pakai', pakek: 'pakai', pk: 'pakai', dr: 'dari', gw: 'aku', gue: 'aku', gua: 'aku', w: 'aku', sy: 'saya',
  ntar: 'nanti', ntr: 'nanti', udh: 'sudah', udah: 'sudah', sdh: 'sudah', blm: 'belum', belom: 'belum', dgn: 'dengan', dg: 'dengan', jg: 'juga',
  trs: 'terus', trus: 'terus', krn: 'karena', karna: 'karena', lsg: 'langsung', tp: 'tapi', tpi: 'tapi', lg: 'lagi', tdk: 'tidak',
  yg: 'yang', utk: 'untuk', untk: 'untuk', bwt: 'buat', sm: 'sama', sma: 'sama', sblm: 'sebelum', stlh: 'setelah', jln: 'jalan',
  ingetin: 'ingetin', ingatin: 'ingetin', inget: 'ingetin', tlg: 'tolong', bls: 'balas', bgt: 'banget', gpp: 'tidak apa',
};
/** Common misspellings of money words (only exact forms). */
export const safeTypos: Record<string, string> = {
  tranfer: 'transfer', trasfer: 'transfer', trasnfer: 'transfer', transfre: 'transfer', mkaan: 'makan', makaan: 'makan', parkri: 'parkir', besin: 'bensin',
  utng: 'utang', htang: 'hutang', bayra: 'bayar', blanaj: 'belanja', ongkri: 'ongkir', cashbak: 'cashback', diksn: 'diskon',
};
/** Time words: the Temporal Engine stays the authority; these only restore its words. */
export const temporalAliases: Record<string, string> = {
  kemaren: 'kemarin', kmaren: 'kemarin', kmrin: 'kemarin', kmren: 'kemarin', kmrn: 'kemarin', kmarin: 'kemarin', kemrin: 'kemarin',
  td: 'tadi', tdi: 'tadi', skrg: 'sekarang', skg: 'sekarang', skrang: 'sekarang', skrng: 'sekarang', hri: 'hari', hr: 'hari',
  pg: 'pagi', mlm: 'malam', malem: 'malam', mlem: 'malam', bsk: 'besok', bln: 'bulan', thn: 'tahun', mgg: 'minggu', dpn: 'depan', dpan: 'depan',
};
/** Ways of saying "buy / order" whose verb is not the thing bought ("pesen gofood" → the description is GoFood). */
export const actionAliases: Record<string, string> = { pesen: 'beli', pesenin: 'beli', orderin: 'beli', checkout: 'beli', checkoutin: 'beli', beliin: 'beli', order: 'beli', lemburan: 'lembur', transferin: 'transfer', tfin: 'tf' };
/** Multi-word phrases, longest first. */
export const phraseAliases: [RegExp, string][] = [
  [/\bsetor (?:cash|kas)\b/g, 'setor tunai'], [/\btarik (?:cash|kas)\b/g, 'tarik tunai'], [/\bambil cash\b/g, 'tarik tunai'],
  [/\bminggu dpn\b|\bmingdep\b/g, 'minggu depan'], [/\bbulan dpn\b|\bbln dpn\b/g, 'bulan depan'], [/\bhari ni\b/g, 'hari ini'],
  [/\bongkos kirim(?:an)?\b/g, 'ongkir'], [/\bcash back\b/g, 'cashback'],
];
/** Words that carry no financial meaning in a note ("makan 25k jago wkwk"). Removed only as whole words. */
const FILLER = /(?<![\p{L}\p{N}])(?:wk(?:wk)+|w?k?wkwk\w*|(?:ha){2,}h?|(?:he){2,}h?|(?:hi){2,}h?|anjir|anjay|jir|dong|deh|nih|sih|lho|loh|kok)(?![\p{L}\p{N}])/giu;
/** "catetin …", "tolong catat …", "masukin …" at the start: a request to note, not a word of the note. */
const COMMAND = /^\s*(?:tolong\s+|coba\s+)?(?:catetin|catatin|catetkan|catatkan|catet|catat|masukin|masukkan|note|record)(?:\s+(?:dong|ya|yah|aja))?\s+(?=\S)/i;
/** "… ama temen", "… bareng keluarga": who it was with is not what was bought. */
const COMPANION = /\s+(?:sama|ama|dengan|dgn|bareng|bareng2|bersama)\s+(?:temen2?|teman(?:-teman)?|kawan2?|pacar|ayang|keluarga|anak2?|istri|suami|ortu|kolega|tim)\b(?=\s|$|,)/gi;

const MOVES_TO_PERSON = /\b(?:ngutang|utang|hutang|ngutangin|minjem|pinjem|pinjam|minjam|minjemin|pinjemin|balikin|dibalikin|ngembaliin|nyicil|cicil|lunasin|bayarin|dibayarin|talangin|nalangin|kasih|ngasih|kirim|transfer|tf|patungan|split|bagi)\b/i;
/** Everything curated, as one lookup (for the grammar's own word pass and for the "already general" check). */
export const CURATED: Record<string, string> = { ...commonAbbreviations, ...commonSlang, ...safeTypos, ...temporalAliases };
const curatedClass = (w: string): NormClass => w in commonAbbreviations ? 'COMMON_ABBREVIATION' : w in temporalAliases ? 'TEMPORAL_SHORTHAND' : w in safeTypos ? 'COMMON_TYPO' : 'COMMON_SLANG';
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
/** The curated general reading of one word, or undefined. */
export const curatedReading = (word: string) => has(CURATED, word) ? CURATED[word] : undefined;

// ——— Canonical vocabulary (what shorthand may expand to) ———

const VOCAB = `
makan minum sarapan jajan jajanan cemilan camilan kopi ngopi teh susu roti nasi bakso ayam bebek ikan sayur buah gorengan martabak
minuman makanan warteg warung kantin katering snack dessert minimarket supermarket restoran restoran
bensin parkir transport transportasi kereta pesawat tiket travel taksi angkot ojek bus tol bengkel servis service oli ban motor mobil
belanja bulanan sabun sampo pakaian baju celana sepatu sandal tas kaos jaket skincare kosmetik elektronik perabot peralatan
listrik internet tagihan pulsa kuota token laundry sewa kontrakan kosan gas galon iuran sampah keamanan
kesehatan dokter klinik apotek obat vitamin rumah sakit asuransi gigi
pendidikan sekolah kuliah kampus kursus buku semester seminar
hiburan nonton bioskop konser karaoke game langganan liburan hotel penginapan wisata
pengeluaran pemasukan penghasilan pendapatan transfer pembayaran pembelian penjualan anggaran tabungan simpanan investasi
cicilan angsuran utang hutang piutang pinjaman tagihan klaim reimburse penggantian kantor dinas perjalanan
gaji gajian lembur bonus komisi honor freelance proyek refund cashback diskon potongan ongkir admin biaya
setoran tarikan saldo rekening dompet tunai cash kartu kredit debit
bayar beli kirim terima dapat masuk keluar pindah tarik setor isi lunas sisa rencana jadwal rutin
pulang pergi berangkat kemarin besok sekarang malam siang sore pagi minggu bulan tahun depan
darurat pernikahan kendaraan rumah keluarga hadiah donasi sedekah zakat infak arisan
`;
export const CANONICAL: string[] = [...new Set(VOCAB.split(/\s+/).filter(w => w.length >= 4))];

/** Indonesian function words that a generated variant must never take the place of. */
const FUNCTION_WORDS = new Set(`ada aja akan aku apa atau bagi baru bisa buat dan dari dia doi itu ini jadi juga kalau kami kamu kan karena ke kita lagi lalu mau masih mereka nanti oleh pada para pas per saja sama sampai saya sudah supaya tapi terus untuk yang yg dengan tanpa antara atas bawah dalam luar sini situ sana sih deh dong nih tuh kok lah pun mana kapan siapa gimana kenapa berapa belum tidak bukan jangan cuma hanya semua tiap setiap banyak sedikit lain sendiri bareng`.split(/\s+/));

/**
 * Real words that look like a shortened money word ("kota" ≈ kuota, "kamus" ≈ kampus, "seolah" ≈ sekolah): a
 * generated form that is a real word is never used. With the category engine's words and the built-in place names.
 */
const REAL_WORDS = `kota kuta kamus kurus kusus khusus kelar klar tuna sing sang trim trik krim lemur lebur iran pakan seolah tarian
plang baya karak krak sepat taikan klim huang song ring king kong wing ting bang bing dong ding lang ling tang tong gang`.split(/\s+/);
let realWords: Set<string> | null = null;
const isRealWord = (w: string) => (realWords ||= new Set([...REAL_WORDS, ...conceptWords(), ...[...knownPlaces({ history: [], merchants: [] }).keys()].flatMap(p => p.split(/\s+/))])).has(w);

const VOWEL = /[aiueo]/;
/** Shorthand forms of one canonical word: vowels dropped (all or some), or one inner letter missing. */
export function shorthandVariants(word: string): string[] {
  const out = new Set<string>();
  const vowels = [...word].map((c, i) => (i > 0 && VOWEL.test(c) ? i : -1)).filter(i => i >= 0).slice(0, 7);
  for (let mask = 1; mask < 1 << vowels.length; mask++) {
    const drop = new Set(vowels.filter((_, k) => mask & (1 << k)));
    // Half of a vowel pair is not shorthand: "kuota" → "kota", "tunai" → "tuna", "siang" → "sang" are other words.
    if ([...drop].some(i => (VOWEL.test(word[i - 1] || '') && !drop.has(i - 1)) || (VOWEL.test(word[i + 1] || '') && !drop.has(i + 1)))) continue;
    out.add([...word].filter((_, i) => !drop.has(i)).join(''));
  }
  if (word.length >= 6) for (let i = 1; i < word.length - 1; i++) if (!VOWEL.test(word[i]) && word[i] !== word[i - 1]) out.add(word.slice(0, i) + word.slice(i + 1));
  return [...out].filter(v => {
    if (v === word || v.length < 3 || v.length < Math.ceil(word.length * 0.5)) return false;
    // A three-letter form only as the full consonant skeleton of a short word ("mkn", "mnm", "aym").
    if (v.length === 3) return word.length <= 6 && !VOWEL.test(v.slice(1));
    return [...v].filter(c => !VOWEL.test(c)).length >= 2;
  });
}

type Compiled = { variants: Map<string, string>; ambiguous: Map<string, string[]>; size: number };
let compiled: Compiled | null = null;
/** variant → canonical, built once; a form shared by two canonical words is ambiguous and never used. */
export function compileLanguagePack(vocab: string[] = CANONICAL): Compiled {
  if (compiled && vocab === CANONICAL) return compiled;
  const all = new Map<string, Set<string>>();
  const blocked = new Set([...vocab, ...FUNCTION_WORDS, ...Object.keys(CURATED), ...Object.values(CURATED).flatMap(v => v.split(' '))]);
  for (const w of vocab) for (const v of shorthandVariants(w)) { if (blocked.has(v) || isRealWord(v)) continue; (all.get(v) || all.set(v, new Set()).get(v)!).add(w); }
  const variants = new Map<string, string>(), ambiguous = new Map<string, string[]>();
  for (const [v, set] of all) { if (set.size === 1) variants.set(v, [...set][0]); else ambiguous.set(v, [...set]); }
  const value = { variants, ambiguous, size: all.size };
  if (vocab === CANONICAL) compiled = value;
  return value;
}

// ——— Entity protection ———

const PRONOUN = new Set('aku saya gue gua gw w dia doi kamu lu lo elu loe beliau mereka kami kita kalian ia'.split(' '));
const BUSINESS_NEXT = /^(store|shop|cafe|kafe|coffee|resto|restoran|mart|bakery|kitchen|official|outlet|grill|bar|house|corner|express|laundry|barber|salon|studio)$/i;
const DEBT_VERB = /^(ngutang|utang|hutang|minjem|pinjem|pinjam|minjam|balikin|ngembaliin|nyicil|cicil|lunasin|ngelunasin|bayarin|talangin|nalangin|dibalikin)$/i;
const PERSON_PREP = /^(ke|dari|dr|sama|ama|sm|buat|untuk|utk)$/i;

/** Lowercased words that must never be rewritten in this sentence: entities the person has, and name-like words. */
export function protectedWords(text: string, ctx: Pick<QuickContext, 'wallets' | 'categories' | 'history' | 'merchants' | 'receivables' | 'debts' | 'people' | 'protectedWords'>): Set<string> {
  const out = new Set<string>((ctx.protectedWords || []).map(w => w.toLocaleLowerCase('id-ID')));
  const low = text.toLocaleLowerCase('id-ID');
  const addName = (name: string) => {
    const n = name.toLocaleLowerCase('id-ID').replace(/\s+/g, ' ').trim();
    if (n.length < 2) return;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'u');
    if (re.test(low)) for (const w of n.split(/[^\p{L}\p{N}]+/u)) if (w) out.add(w);
  };
  for (const w of ctx.wallets) addName(w.name);
  for (const c of ctx.categories) addName(c.name);
  for (const r of ctx.receivables || []) addName(r.person);
  for (const d of ctx.debts || []) { addName(d.provider || ''); }
  for (const p of ctx.people || []) addName(p);
  // Places the person actually has (their history, confirmed places); the built-in chain list is general knowledge.
  for (const m of [...(ctx.merchants || []), ...ctx.history.map(t => t.merchant || '')]) if (m) addName(m);
  const words = [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu)].map(m => ({ w: m[0], at: m.index || 0 }));
  const shouting = text === text.toLocaleUpperCase('id-ID');
  words.forEach((t, i) => {
    const lw = t.w.toLocaleLowerCase('id-ID'), next = words[i + 1]?.w || '', prev = words[i - 1]?.w || '';
    // Pronouns and function words are never names ("dia utang ke gue": "gue" is still "aku").
    if (FUNCTION_WORDS.has(lw) || PRONOUN.has(lw) || has(commonSlang, lw) || has(temporalAliases, lw)) return;
    if (!shouting && t.w.length >= 2 && t.w === t.w.toLocaleUpperCase('id-ID') && /\p{L}/u.test(t.w)) out.add(lw); // "MKN Store", "SRPN"
    if (i > 0 && /^\p{Lu}\p{Ll}/u.test(t.w) && !shouting) out.add(lw); // a name written with a capital, mid-sentence
    if (BUSINESS_NEXT.test(next)) out.add(lw); // "srpn coffee", "bbm cafe"
    if (DEBT_VERB.test(next)) out.add(lw); // "mkn ngutang 50k": the one who borrows
    if (PERSON_PREP.test(prev) && words.some(x => DEBT_VERB.test(x.w))) out.add(lw); // "… ke mkn" in a loan sentence
  });
  return out;
}

// ——— The normalizer ———

const MONEY_CONTEXT = /\b(bayar|beli|belanja|transfer|tf|kirim|terima|dapat|dapet|masuk|keluar|isi|topup|top up|gaji|gajian|ngutang|utang|minjem|pinjem|balikin|cicil|nyicil|lunas|klaim|claim|budget|anggaran|tabung|nabung|rencana)\b/;
const repeatedTail = (w: string) => w.replace(/(\p{L})\1{2,}/gu, '$1');

/**
 * The general reading of a sentence: the text the grammar reads and every change made, in order.
 * Only whole words change; amounts, dates and protected words are left exactly as written.
 */
export function normalizeGeneral(input: string, ctx: Pick<QuickContext, 'wallets' | 'categories' | 'history' | 'merchants' | 'receivables' | 'debts' | 'people' | 'protectedWords'>): { text: string; notes: Normalization[]; version: string; guard: Set<string> } {
  const notes: Normalization[] = [];
  let text = input;
  // 1. Safe cleanup: emoji, a request to note, laughter, punctuation between a word and its amount, compounds.
  const noEmoji = text.replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, ' ');
  if (noEmoji !== text) text = noEmoji;
  const cmd = text.match(COMMAND);
  if (cmd) { notes.push({ raw: cmd[0].trim(), normalized: '', type: 'COMMAND_FILLER', tier: 'EXACT' }); text = text.slice(cmd[0].length); }
  text = text.replace(FILLER, m => { notes.push({ raw: m, normalized: '', type: 'FILLER', tier: 'EXACT' }); return ' '; });
  text = text.replace(/(\p{L}+)\s*[:=]\s*(?=(?:rp\.?\s*)?\d)/giu, (m, l: string) => { notes.push({ raw: m.trim(), normalized: l, type: 'PUNCTUATION', tier: 'EXACT' }); return `${l} `; });
  text = text.replace(/(\p{L}{3,})\s*-\s*(?=(?:rp\.?\s*)?(?:\d[\d.,]*\s*(?:k|rb|ribu|jt|juta)\b|\d{4,}))/giu, (m, l: string) => { notes.push({ raw: m.trim(), normalized: l, type: 'PUNCTUATION', tier: 'EXACT' }); return `${l} `; });
  text = text.replace(/(\p{L}{2,})\s*,\s*(?=(?:rp\.?\s*)?\d[\d.,]*\s*(?:k|rb|ribu|jt|juta)?\b)/giu, (m, w: string) => { notes.push({ raw: m.trim(), normalized: w, type: 'PUNCTUATION', tier: 'EXACT' }); return `${w} `; });
  // Not in a loan or a payment to someone: there "sama temen" is the other party ("pinjem 100k sama temen").
  if (!MOVES_TO_PERSON.test(text)) text = text.replace(COMPANION, m => { notes.push({ raw: m.trim(), normalized: '', type: 'FILLER', tier: 'EXACT' }); return ''; });
  const guard = protectedWords(text, ctx);
  const pack = compileLanguagePack();
  const known = (w: string) => CANONICAL.includes(w) || has(CURATED, w) || pack.variants.has(w) || has(actionAliases, w);
  // "makan25k", "mkn25rb": a known word glued to an amount (never a name with digits such as "k24", "b1").
  text = text.replace(/(?<![\p{L}\p{N}])(\p{L}{3,})(\d[\d.,]*\s*(?:k|rb|ribu|jt|juta)\b)/giu, (m, w: string, amt: string) => {
    const lw = w.toLocaleLowerCase('id-ID');
    if (guard.has(lw) || !known(lw)) return m;
    notes.push({ raw: m, normalized: `${w} ${amt}`, type: 'COMPOUND_SPLIT', tier: 'EXACT' });
    return `${w} ${amt}`;
  });
  for (const [re, to] of phraseAliases) text = text.replace(re, m => { if (m.toLocaleLowerCase('id-ID') !== to) notes.push({ raw: m, normalized: to, type: 'TEMPORAL_SHORTHAND', tier: 'COMMON' }); return to; });
  // 2. Words: curated first, then productive shorthand (money context only), each only if not protected.
  const amounts = findAmounts(text);
  const moneyContext = amounts.length > 0 || MONEY_CONTEXT.test(text.toLocaleLowerCase('id-ID'));
  text = text.replace(/(?<![\p{L}\p{N}'’])\p{L}+(?![\p{L}\p{N}'’])/gu, (word, offset: number) => {
    const lw = word.toLocaleLowerCase('id-ID');
    if (guard.has(lw) || amounts.some(a => offset >= a.index && offset < a.index + a.text.length)) return word;
    const swap = (to: string, type: NormClass, tier: NormTier) => { notes.push({ raw: word, normalized: to, type, tier }); return to; };
    if (has(actionAliases, lw)) return swap(actionAliases[lw], 'ACTION_SYNONYM', 'COMMON');
    if (has(CURATED, lw)) return lw === CURATED[lw] ? word : swap(CURATED[lw], curatedClass(lw), 'COMMON');
    if (CANONICAL.includes(lw) || FUNCTION_WORDS.has(lw)) return word;
    // "makannn", "bayarrr": emphasis, when what is left is a known word.
    // "makannn", "bensinn", "blnjaa": emphasis, when what is left is a known word (a doubled letter only when the
    // word as typed is not a word: "maaf", "saat" stay).
    for (const calm of new Set([repeatedTail(lw), lw.replace(/(\p{L})\1+/gu, '$1')])) {
      if (calm === lw || isRealWord(lw)) continue;
      if (CANONICAL.includes(calm) || has(CURATED, calm)) return swap(has(CURATED, calm) ? CURATED[calm] : calm, 'REPEATED_LETTERS', 'COMMON');
      if (moneyContext && pack.variants.has(calm)) return swap(pack.variants.get(calm)!, 'REPEATED_LETTERS', 'CONTEXTUAL');
    }
    if (!moneyContext || lw.length < 3) return word;
    const direct = pack.variants.get(lw);
    if (direct) return swap(direct, 'PRODUCTIVE_SHORTHAND', 'CONTEXTUAL');
    // "srpnnya", "mknnya": the shorthand root with its suffix.
    const m = lw.match(/^(\p{L}{3,}?)(nya)$/u);
    if (m) { const root = has(CURATED, m[1]) ? CURATED[m[1]] : pack.variants.get(m[1]) || (CANONICAL.includes(m[1]) ? m[1] : ''); if (root && root !== m[1]) return swap(`${root}${m[2]}`, 'PRODUCTIVE_SHORTHAND', 'CONTEXTUAL'); }
    return word;
  });
  text = text.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim();
  return { text, notes, version: GENERAL_LANGUAGE_VERSION, guard };
}

/** Developer helper: what the general layer does to one sentence (no entities). */
export function inspectGeneralLanguage(text: string, ctx?: Parameters<typeof normalizeGeneral>[1]) {
  const r = normalizeGeneral(text, ctx || { wallets: [], categories: [], history: [] });
  return r.notes.map(n => `${n.raw} → ${n.normalized || '∅'} (${n.type}, ${n.tier})`);
}

/** Built-in place names are general knowledge; exported for the "unknown token" report. */
export const generalPlaces = () => knownPlaces({ history: [], merchants: [] });
