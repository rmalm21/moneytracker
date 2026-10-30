/**
 * 8.0 — the assistant with a sense of humour, in the person's chosen style (lib/chat/voice.ts):
 *   - swearing understood: "anjing", "bangsat", "anjir mahal banget"… Sopan answers "Astaghfirullah, jangan kasar-kasar
 *     ya"; Santai teases a little; Gaul teases back; Singkat stays short. Sworn at with something to do ("anjir kopi
 *     50rb"), the rest of the message is still done. Vulgar words are never repeated back.
 *   - laughing along: "wkwk", "HAHAHA", "awokwok", "😂" get a laugh back in the same loudness;
 *   - riddles both ways: the assistant asks one (and reveals it on "nyerah"), or plays along with the person's own;
 *     a joke told in one message ("kenapa … ? karena …") is laughed at and rated;
 *   - roasting a spending habit from the person's own records ("roasting gue dong", "gue boros ga?"), and a short
 *     tease when the same treat is recorded again and again.
 * The assistant teases habits, never who someone is.
 */
import type { Voice } from './voice.ts';
import { pickVar } from './persona.ts';

/* ------------------------------------------------------------------ Swearing */

/** Exclamations people say when surprised or annoyed ("anjir mahal", "buset", "sialan"). */
const MILD = ['anjir', 'anjrit', 'anjay', 'anjim', 'anjer', 'njir', 'njay', 'wanjir', 'wanjay', 'buset', 'busyet', 'busett', 'sialan', 'sial', 'kampret', 'kamvret', 'dodol', 'edan', 'gilak', 'damn', 'shit', 'wtf', 'ajg', 'anj', 'bjir', 'bjirr', 'bjrot'];
/** Hard words, said at someone or as a strong curse. */
const HARD = ['anjing', 'anjeng', 'anying', 'asu', 'asw', 'bangsat', 'bangsad', 'bgst', 'babi', 'bajingan', 'brengsek', 'keparat', 'jancok', 'jancuk', 'jancik', 'dancok', 'cuk', 'cok', 'jamput', 'taik', 'tai', 'tahi', 'setan', 'iblis', 'monyet', 'kunyuk', 'celeng', 'sinting', 'laknat', 'bacot', 'fuck', 'fck', 'fak', 'bitch', 'bastard', 'asshole', 'kimak', 'pukimak', 'bedebah'];
/** Vulgar words: understood, never said back. */
const VULGAR = ['kontol', 'kntl', 'memek', 'mmk', 'ngentot', 'ngentod', 'entot', 'ngewe', 'jembut', 'pepek', 'peler', 'titit', 'toket', 'coli', 'colmek', 'bokep', 'lonte', 'perek', 'pelacur', 'sange'];
const SWEAR_RE = new RegExp(String.raw`(?<![\p{L}\d])(${[...VULGAR, ...HARD, ...MILD].sort((a, b) => b.length - a.length).join('|')})(?:\s*(?:lu|lo|loe|lah|deh|dah|bgt|banget|emang|bener))?(?![\p{L}\d])`, 'giu');
const AT_BOT = /(?<![\p{L}])(?:kamu|km|kau|lu|lo|loe|elu|elo|bot|botnya|asisten|asistennya|aplikasi|aplikasinya|app|dasar)(?![\p{L}])/u;
export type Swear = { words: string[]; vulgar: boolean; hard: boolean; atBot: boolean; rest: string };
/** Swear words in a message, and what is left without them. */
export function readSwear(text: string): Swear | null {
  const words = [...text.matchAll(SWEAR_RE)].map(m => m[1].toLowerCase());
  if (!words.length) return null;
  const rest = text.replace(SWEAR_RE, ' ').replace(/^[\s,.!?]+|[\s,.!?]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  const leftover = rest.replace(new RegExp(AT_BOT.source, 'gu'), ' ').replace(/[^\p{L}\d]+/gu, ' ').trim();
  return { words, vulgar: words.some(w => VULGAR.includes(w)), hard: words.some(w => HARD.includes(w)), atBot: AT_BOT.test(text) && leftover.split(' ').filter(Boolean).length <= 2, rest: leftover ? rest : '' };
}
/** A word fit to say back ("Lah lo yang anjing"): an animal or a curse, never a vulgar one. */
const backWord = (s: Swear) => s.words.find(w => ['anjing', 'babi', 'monyet', 'kunyuk', 'setan', 'kampret', 'bangsat', 'asu', 'celeng'].includes(w));

/** The reply to swearing with nothing else in the message. */
export function swearReply(v: Voice, s: Swear, turn: number) {
  if (s.vulgar) return pickVar({
    sopan: ['Astaghfirullah… mohon dijaga ucapannya ya 🙏 Saya bantu urusan keuangan saja, nggih.', 'Astaghfirullahaladzim. Kata-kata seperti itu kurang baik. Ada yang bisa saya bantu soal keuangan?'],
    santai: ['Ih jorok 🙈 wkwk. Balik ke duit aja yuk, mau catat apa?', 'Hus, jorok! Wkwk. Aku cuma ngerti urusan duit, bukan yang begituan 😅', 'Yaampun, mulutnya dicuci dulu dong wkwk. Ada yang mau dicatat?'],
    gaul: ['Najis jorok bener lo WKWKWK 🤢 Cuci mulut dulu sana. Mau nyatet apa?', 'Jorok ah, otak lo perlu di-sapu wkwk. Gue cuma ngurus duit, bro.', 'Jorok lo ah 🙈 WKWK. Udah, mending nyatet pengeluaran.'],
    singkat: ['Jaga ucapan ya.', 'Jorok. Mau catat apa?'],
  }[v], turn);
  const back = backWord(s);
  return pickVar({
    sopan: ['Astaghfirullah, jangan kasar-kasar ya 🙏 Ada yang bisa saya bantu?', 'Astaghfirullahaladzim… istighfar dulu yuk. Saya tetap siap membantu.', 'Astaghfirullah, bahasanya dijaga ya. Kalau sedang kesal, ceritakan saja, saya dengarkan.', 'Astaghfirullah. Sabar ya, tarik napas dulu. Ada yang membuat kesal?'],
    santai: ['Eh eh, mulutnya dijaga dong wkwk. Kenapa nih, lagi kesel?', 'Waduh ngegas 😅 Santai dulu, ada apa?', 'Hus, kasar amat wkwk. Cerita aja, aku dengerin.', 'Sabar… sabar… dompet aja sabar dikuras tiap bulan wkwk. Kenapa?'],
    gaul: [back ? `Lah lo yang ${back}, gue mah bot kalem wkwk. Kenapa sih ngamuk?` : 'Anjir galak bener 😭 Gue salah apa, bos?', 'Woy santai, mulut lo pedes kayak saldo tanggal tua wkwk. Ada apa?', 'Ngegas mulu kayak ojol dikejar orderan WKWK. Kenapa nih?', back ? `Iya iya, gue ${back}, lo paling cakep. Puas? WKWKWK. Sekarang mau nyatet apa?` : 'Iya iya, gue yang salah, lo paling bener. Puas? WKWK. Mau nyatet apa?', 'Bacot juga lo wkwk 😝 tapi gue tetep sayang. Mau ngapain nih?'],
    singkat: ['Santai. Ada apa?', 'Kasar amat. Kenapa?'],
  }[v], turn);
}
/** Said before the answer when the message had something to do besides the swearing ("anjir kopi 50rb"). */
export function swearLead(v: Voice, s: Swear, turn: number) {
  if (v === 'singkat') return '';
  if (s.vulgar) return v === 'sopan' ? 'Mohon dijaga ucapannya ya. ' : v === 'gaul' ? 'Jorok lo wkwk. ' : 'Ih, jorok wkwk. ';
  if (v === 'sopan') return pickVar(['Astaghfirullah, jangan kasar-kasar ya. ', 'Sabar ya, bahasanya dijaga. '], turn);
  if (v === 'gaul') return pickVar(['Anjir juga sih wkwk. ', 'Buset, ngegas wkwk. ', 'Santai bos wkwk. '], turn);
  return pickVar(['Waduh, sampai ngegas gitu wkwk. ', 'Sabar… wkwk. '], turn);
}

/* ------------------------------------------------------------------ Laughing */

const LAUGH_RE = /(?<![\p{L}])(?:a?w+k+(?:w+k+)+\w*|kw+k+\w*|akw\w*|awok(?:awok)*\w*|h+a+(?:h+a+)+h*|a?h+a+h+a+\w*|h+e+(?:h+e+)+h*|h+i+(?:h+i+)+h*|x+i+(?:x+i+)+|ngakak|lol|lmao|rofl|ngik+)(?![\p{L}])|[😂🤣😆😹😭]/giu;
/** "wkwk", "HAHAHA", "awokawok", "😂": the laugh (as typed), and whether it was loud (capitals, long, or many). */
export function readLaugh(raw: string) {
  const found = [...raw.matchAll(LAUGH_RE)].map(m => m[0]);
  if (!found.length) return null;
  const longest = found.sort((a, b) => b.length - a.length)[0];
  return { text: longest, loud: /[A-Z]{3,}/.test(longest) || longest.length >= 10 || (raw.match(/[😂🤣]/gu) || []).length >= 2, rest: raw.replace(LAUGH_RE, ' ').replace(/\s{2,}/g, ' ').trim() };
}
/** A laugh back in the same loudness. */
export function laughBack(v: Voice, laugh: { text: string; loud: boolean }, turn: number, afterJoke: boolean) {
  const loud = laugh.loud, ha = /^h/i.test(laugh.text);
  if (v === 'singkat') return afterJoke ? 'Haha. Lagi?' : 'Haha. Ada apa?';
  const sound = v === 'sopan' ? (loud ? 'Hahaha,' : 'Hehe,') : ha ? (loud ? 'HAHAHAHA' : 'Hahaha') : (loud ? 'WKWKWKWK' : 'Wkwkwk');
  if (afterJoke) return `${sound} ${pickVar({
    sopan: ['senang kalau leluconnya berhasil. Mau satu lagi?', 'syukurlah Anda tertawa. Ingin satu lagi?'],
    santai: ['berarti lucu kan? Mau lagi?', 'akhirnya ada yang ketawa juga. Lanjut satu lagi?', 'aku jadi semangat ngelawak nih. Lagi?'],
    gaul: ['nah kan lucu, ngaku lo. Mau lagi?', 'receh tapi lo ketawa juga kan wkwk. Lagi ga?', 'gue emang pelawak terselubung. Lanjut?'],
    singkat: ['Lagi?'],
  }[v], turn)}`;
  return `${sound} ${pickVar({
    sopan: ['senang melihat Anda tertawa. Ada yang bisa saya bantu?', 'semoga hari Anda menyenangkan. Ada yang ingin dicatat?'],
    santai: ['ikut ketawa aku. Ada apa nih?', 'seneng deh kamu ketawa. Mau catat sesuatu sekalian?', 'receh ya kita. Ada yang mau dicatat?', 'ketawa terus, semoga dompetnya juga ketawa ya.'],
    gaul: ['ngakak juga gue. Kenapa dah?', 'lo ketawa mulu, dompet aman kan? WKWK', 'receh bener kita. Mau nyatet apa nih?', 'sumpah ketawa lo nular. Ada apa?'],
    singkat: ['Ada apa?'],
  }[v], turn)}`;
}

/* ------------------------------------------------------------------ Riddles and the person's jokes */

export type Riddle = { q: string; a: string; keys: string[] };
/** Tebak-tebakan: the question, the answer, and words that count as guessing it. */
export const RIDDLES: Riddle[] = [
  { q: 'Uang apa yang bikin orang senyum terus?', a: 'Uang kaget! Datangnya tiba-tiba, senyumnya lama.', keys: ['kaget'] },
  { q: 'Binatang apa yang paling rajin nabung?', a: 'Celengan babi. Kerjanya cuma makan receh.', keys: ['celengan', 'babi'] },
  { q: 'Kenapa dompet nggak pernah ikut lomba lari?', a: 'Soalnya isinya selalu kabur duluan.', keys: ['kabur', 'lari duluan', 'habis'] },
  { q: 'Bank apa yang isinya air?', a: 'Bank-jir. Wkwk.', keys: ['banjir'] },
  { q: 'Tukang apa yang paling dicari pas tanggal tua?', a: 'Tukang traktir!', keys: ['traktir'] },
  { q: 'Sayur apa yang paling dingin?', a: 'Kembang kol… dingin kayak sikap dia ke kamu.', keys: ['kol'] },
  { q: 'Kenapa kasir selalu tenang?', a: 'Karena tiap hari dia “menghitung berkah”.', keys: ['hitung', 'menghitung'] },
  { q: 'Hewan apa yang bersaudara?', a: 'Katak beradik! (kakak beradik)', keys: ['katak'] },
  { q: 'Apa bedanya gaji sama mantan?', a: 'Nggak ada. Dua-duanya cepat pergi dan susah balik.', keys: ['pergi', 'cepat', 'balik'] },
  { q: 'Kenapa matahari tenggelam?', a: 'Karena nggak bisa berenang.', keys: ['berenang', 'renang'] },
  { q: 'Ayam apa yang paling besar?', a: 'Ayam semesta. (alam semesta)', keys: ['semesta'] },
  { q: 'Bebek apa yang jalannya muter ke kiri terus?', a: 'Bebek dikunci stang.', keys: ['stang', 'kunci'] },
  { q: 'Kenapa angka 8 nggak pernah lapar?', a: 'Soalnya dia udah “makan” dua donat.', keys: ['donat'] },
  { q: 'Apa yang makin diisi makin ringan?', a: 'Balon. Kalau dompet sih makin diisi makin bahagia.', keys: ['balon'] },
  { q: 'Mobil apa yang bikin dompet sedih?', a: 'Mobil cicilan. Jalannya pelan, bayarnya lama.', keys: ['cicilan', 'kredit'] },
];
const GIVE_UP = /\b(?:nyerah|menyerah|gatau|ga\s*tau|gak\s*tau|nggak\s*tau|ngga\s*tau|tidak\s*tahu|gak\s*tahu|apa\s*(?:emang|emg|dong|jawabannya|tuh)?|kasih\s*tau|jawabannya|udah\s+kasih\s+tau|skip|pass|apaan|hah)\b|^\?+$/;
/** The person's guess at the assistant's riddle. */
export function riddleAnswer(v: Voice, r: Riddle, guess: string, turn: number) {
  const right = r.keys.some(k => guess.includes(k));
  if (right) return `${pickVar({ sopan: ['Tepat sekali!', 'Benar!'], santai: ['Wkwk bener! Pinter juga kamu.', 'Yaaah ketebak, hebat!'], gaul: ['WKWK bener anjir, lo pinter juga.', 'Kok lo tau sih wkwk, curang ya?'], singkat: ['Benar.'] }[v], turn)} ${r.a}`;
  const gave = GIVE_UP.test(guess);
  return `${gave ? pickVar({ sopan: ['Jawabannya:', 'Baik, jawabannya:'], santai: ['Nyerah nih? Jawabannya:', 'Oke deh, jawabannya:'], gaul: ['Yaelah nyerah wkwk. Jawabannya:', 'Payah lo wkwk. Jawabannya:'], singkat: ['Jawaban:'] }[v], turn) : pickVar({ sopan: ['Belum tepat. Jawabannya:', 'Hampir. Jawabannya:'], santai: ['Wkwk salah. Jawabannya:', 'Hampir! Tapi jawabannya:'], gaul: ['Salah wkwk. Jawabannya:', 'Ngaco lo wkwk. Jawabannya:'], singkat: ['Salah. Jawaban:'] }[v], turn)} ${r.a}${v === 'singkat' || v === 'sopan' ? '' : ' 🤣'}`;
}
/** "aku punya tebakan", "gue kasih tebakan", "tebak dong", "coba tebak": the person wants to ask one. */
export const USER_RIDDLE = /\b(?:(?:aku|gue|gw|saya|ku)\s+(?:punya|ada|mau\s+kasih|kasih|mau\s+nanya)\s+(?:tebak[\s-]?tebakan|tebakan|teka[\s-]?teki)|(?:sekarang\s+)?(?:gantian|giliran)\s+(?:aku|gue|gw|saya)(?:\s+yang\s+(?:nanya|kasih))?|coba\s+tebak|tebak\s+(?:dong|ya|deh|nih|yuk)|kamu\s+yang\s+(?:jawab|nebak)|lo\s+yang\s+(?:jawab|nebak))\b/;
/** A riddle or joke written out in one message: "kenapa ayam nyebrang? biar sampai seberang". */
const JOKE_SHAPE = /^(?:(?:tebak[\s-]?tebakan|tebakan|jokes?|lelucon)\s*[:,-]?\s*)?(?:kenapa|knp|apa\s+bedanya|apa\s+persamaan(?:nya)?|tau\s+(?:ga|gak|nggak|enggak|engga)|tahu\s+(?:ga|gak|nggak|tidak)|binatang\s+apa|hewan\s+apa|buah\s+apa|sayur\s+apa|ikan\s+apa|kota\s+apa|negara\s+apa|makanan\s+apa|uang\s+apa)\b(.+?)\?\s*(.{2,})$/;
const RIDDLE_ONLY = /^(?:(?:tebak[\s-]?tebakan|tebakan)\s*[:,-]?\s*)?(?:kenapa|knp|apa\s+bedanya|apa\s+persamaan(?:nya)?|binatang\s+apa|hewan\s+apa|buah\s+apa|sayur\s+apa|ikan\s+apa|kota\s+apa|negara\s+apa|makanan\s+apa|uang\s+apa)\b[^?]*\?$/;
export const readUserJoke = (t: string) => JOKE_SHAPE.test(t) && !/\b(?:berapa|rp|rb|ribu|juta|jt|pengeluaran|pemasukan|saldo|anggaran)\b/.test(t) ? 'told' : RIDDLE_ONLY.test(t) && !/\b(?:berapa|pengeluaran|pemasukan|saldo|anggaran|boros|uangku|duitku)\b/.test(t) ? 'riddle' : null;
/** Guessing the person's riddle (and giving up, so they tell the answer). */
export function guessUserRiddle(v: Voice, turn: number) {
  return pickVar({
    sopan: ['Hmm… saya menyerah. Apa jawabannya?', 'Pertanyaan yang sulit. Apa jawabannya?'],
    santai: ['Hmm… apa ya? Nyerah deh, apa jawabannya?', 'Waduh, susah. Aku nyerah, kasih tau dong!', 'Bentar mikir… nggak tau ah, apa jawabannya?'],
    gaul: ['Anjir susah. Nyerah gue, apaan jawabannya?', 'Bentar… ga tau ah wkwk. Apaan?', 'Otak gue nge-lag. Kasih tau dong jawabannya!'],
    singkat: ['Nyerah. Apa jawabannya?'],
  }[v], turn);
}
/** Laughing at the person's joke or punchline, with a score. */
export function laughAtJoke(v: Voice, turn: number) {
  const score = 6 + (turn % 4);
  return pickVar({
    sopan: [`Hahaha, lucu sekali. Saya beri nilai ${score}/10.`, 'Hahaha, bisa saja. Terima kasih sudah menghibur.'],
    santai: [`WKWKWK receh banget, tapi aku ketawa. ${score}/10!`, `Hahaha anjir… eh, maksudnya lucu banget 😆 ${score}/10.`, 'Wkwkwk nggak kepikiran! Kamu cocok jadi pelawak.', 'Hahaha receh tapi kena. Ada lagi nggak?'],
    gaul: [`WKWKWKWK anjir receh parah 😭 ${score}/10 deh.`, 'HAHAHA sumpah ga kepikiran gue. Lo pelawak ya?', `Wkwkwk garing tapi gue ngakak. ${score}/10.`, 'ANJIR WKWKWK. Ada lagi ga lo?'],
    singkat: [`Haha. ${score}/10.`],
  }[v], turn);
}
/** "pantun: …", "ada pantun nih …": cakep! */
export const USER_PANTUN = /\bpantun\b.*,.*,|^(?:[^,]{4,40},\s*){3}[^,]{4,40}$/;
export function pantunBack(v: Voice, turn: number) {
  return pickVar({
    sopan: ['Cakep! 👏 Pantun yang bagus.', 'Cakep! Indah sekali pantunnya.'],
    santai: ['Cakeeep! 👏 Wkwk, bales ah: Beli bakso di pinggir kali, jangan lupa catat tiap kali.', 'Cakep! Bales nih: Makan pecel pakai kerupuk, dompet tebal hati pun sejuk.'],
    gaul: ['CAKEEEP 👏 WKWK. Bales gue: Ke pasar beli tomat, duit abis kok cepet amat.', 'Cakep cuy! Bales: Naik ojek ke kota tua, gajian dateng langsung sirna.'],
    singkat: ['Cakep!'],
  }[v], turn);
}

/* ------------------------------------------------------------------ Roasting */

export const ROAST = /\b(?:roast(?:ing|in)?|rosting|ejek(?:in)?|ledek(?:in)?|katain|katai|hina(?:in)?|nyinyir(?:in)?|sindir(?:in)?)\b.*\b(?:aku|gue|gw|saya|dompet|pengeluaran|belanja|keuangan|duit|uang)\w*|\b(?:aku|gue|gw|saya)\s+(?:boros|hemat)\s+(?:ga|gak|nggak|ngga|enggak|tidak|nggk)\b|\bboros\s+(?:ga|gak|nggak|ngga)\s+(?:sih\s+)?(?:aku|gue|gw|saya)\b|\b(?:nilai|rating|review)\s+(?:pengeluaran|cara belanja|keuangan)\s*(?:aku|gue|gw|saya|ku)?\b|^roast(?:ing)?(?:\s+(?:dong|aku|gue|gw|saya))*$/;
export type RoastData = { top?: { name: string; amount: number; count: number }; often?: { name: string; amount: number; count: number }; pace: number; daily: number; free: number; spent: number; days: number };
/** A roast of this cycle's spending, from the person's own records. */
export function roast(v: Voice, d: RoastData, rp: (n: number) => string, turn: number) {
  const over = d.pace > d.daily && d.spent > 0, top = d.top;
  if (!d.spent) return { sopan: 'Belum ada pengeluaran yang bisa saya nilai di siklus ini.', santai: 'Mau ngeroasting apa, belum ada pengeluaran sama sekali wkwk. Dompetmu masih suci.', gaul: 'Gimana mau ngeroasting, lo belum jajan sama sekali WKWK. Dompet lo masih perawan.', singkat: 'Belum ada pengeluaran.' }[v];
  if (!over) return pickVar({
    sopan: [`Pengeluaran Anda masih terkendali: rata-rata ${rp(d.pace)}/hari, jatahnya ${rp(d.daily)}. Pertahankan ya 👏`],
    santai: [`Hmm, susah nyari celahnya. Rata-rata ${rp(d.pace)}/hari, masih di bawah jatah ${rp(d.daily)}. Hemat atau pelit nih? Wkwk 👏`],
    gaul: [`Anjir susah ngeroasting lo, hemat bener: ${rp(d.pace)}/hari, jatah ${rp(d.daily)}. Lo hemat apa pelit? WKWKWK`],
    singkat: [`Aman: ${rp(d.pace)}/hari, jatah ${rp(d.daily)}.`],
  }[v], turn);
  const habit = top ? (top.count >= 8 ? 'langganan' : 'hobi') : '';
  // The most frequent treat too, when it is not the biggest ("Kopi 20×"), and the allowance said plainly when it is gone.
  const often = d.often && d.often.name !== top?.name && d.often.count >= 5 ? d.often : undefined;
  const oftenText = often ? { sopan: ` ${often.name} tercatat ${often.count} kali (${rp(often.amount)}).`, santai: ` ${often.name} juga ${often.count} kali (${rp(often.amount)}), setia banget wkwk.`, gaul: ` ${often.name} ${often.count}× (${rp(often.amount)}), lo minum apa mandi? WKWK.`, singkat: ` ${often.name}: ${often.count}×.` }[v] : '';
  const allowance = d.daily > 0 ? rp(d.daily) : '';
  return pickVar({
    sopan: [`Dengan hormat 🙏 pengeluaran terbesar siklus ini ${top ? `${top.name}: ${rp(top.amount)} dari ${top.count} transaksi` : rp(d.spent)}. Rata-rata ${rp(d.pace)}/hari, ${allowance ? `sedangkan jatahnya ${allowance}` : 'sedangkan uang bebas sudah habis'}.${oftenText} Mungkin bisa dikurangi sedikit ya.`],
    santai: [`Siap, roasting dimulai 🔥 ${top ? `${top.name} siklus ini ${rp(top.amount)} (${top.count} kali). Itu udah bukan jajan, itu ${habit} wkwk. ` : ''}Rata-rata kamu keluar ${rp(d.pace)}/hari padahal ${allowance ? `jatahnya ${allowance}` : 'uang bebasmu udah habis'}.${oftenText} Dompetmu lagi nangis di pojokan 😭`,
      `Oke, jangan baper ya 😈 ${top ? `Kalau ${top.name} bisa ngomong, dia pasti bilang “makasih pelanggan setia”: ${rp(top.amount)} dari ${top.count} kali. ` : ''}Sehari kamu habis ${rp(d.pace)}, ${allowance ? `jatahnya cuma ${allowance}` : 'uang bebasnya udah nol'}.${oftenText} Wkwk.`],
    gaul: [`Lo yang minta ya 😈 ${top ? `${top.name} ${rp(top.amount)} dari ${top.count} kali. Itu ${habit}, bukan jajan WKWK. ` : ''}Sehari lo bakar ${rp(d.pace)}, ${allowance ? `jatahnya ${allowance}` : 'uang bebas lo udah minus'}.${oftenText} Dompet lo lagi minta tolong, bro 💀`,
      `Siap gue roasting 🔥 ${top ? `${top.name} doang ${rp(top.amount)} (${top.count}×). Lo nyetok apa buka cabang? ` : ''}${rp(d.pace)}/hari vs jatah ${allowance || 'nol'}.${oftenText} Gaya sultan, saldo rakyat WKWKWK.`],
    singkat: [`${top ? `${top.name}: ${rp(top.amount)} (${top.count}×). ` : ''}${rp(d.pace)}/hari vs jatah ${allowance || 'Rp0'}.${oftenText}`],
  }[v], turn);
}
/** Treats that a short tease fits when recorded again and again (not rent, bills or transport). */
export const TREAT = /kopi|coffee|jajan|snack|camilan|cemilan|hiburan|game|belanja|online|shopping|nongkrong|delivery|pesan antar|fashion|pakaian|hobi|streaming|rokok|boba|minuman|dessert|makan di luar|kafe|cafe|skincare|kosmetik/i;
/** "Kopi lagi? Ini yang ke-8 siklus ini": said before the card of the same treat recorded many times. */
export function teaseLead(v: Voice, name: string, count: number, amount: string, turn: number) {
  return pickVar({
    sopan: [`Catatan kecil: ini ${name} yang ke-${count} siklus ini (sudah ${amount}). `],
    santai: [`${name} lagi? Ini yang ke-${count} siklus ini lho, udah ${amount} wkwk. `, `Ke-${count} kalinya ${name} siklus ini (${amount}). Setia banget ya kamu wkwk. `],
    gaul: [`${name} lagi?? Ke-${count} siklus ini, udah ${amount}. Lo nyetok apa gimana WKWK. `, `Buset, ${name} ke-${count} (${amount}). Dompet lo minta cuti wkwk. `],
    singkat: [''],
  }[v], turn);
}
