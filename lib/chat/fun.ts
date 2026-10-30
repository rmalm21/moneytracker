/**
 * 8.0 — the assistant with a sense of humour, in the person's chosen style (lib/chat/voice.ts):
 *   - swearing understood: "anjing", "bangsat", "anjir mahal banget"… Sopan answers "Astaghfirullah, jangan kasar-kasar
 *     ya"; Santai teases a little; Gaul teases back; Singkat stays short; (8.1) Bar-bar swears back for fun. Sworn at
 *     with something to do ("anjir kopi 50rb"), the rest of the message is still done. Vulgar words are never repeated.
 *   - laughing along: "wkwk", "HAHAHA", "awokwok", "😂" get a laugh back in the same loudness;
 *   - riddles both ways: the assistant asks one (and reveals it on "nyerah"), or plays along with the person's own;
 *     a joke told in one message ("kenapa … ? karena …") is laughed at and rated;
 *   - roasting a spending habit from the person's own records ("roasting gue dong", "gue boros ga?"), and a short
 *     tease when the same treat is recorded again and again.
 * 8.1: swearing however it is typed (stretched "anjiiiing", number-for-letter "4nj1ng", masked "a*jing", short "bgsd")
 * and in regional words (Jawa, Sunda, Betawi, Medan, Makassar); an animal named with an amount is that animal
 * ("makanan anjing 100rb"). Many more replies for every case.
 * The assistant teases habits, never who someone is.
 */
import type { Voice } from './voice.ts';
import { pickVar } from './persona.ts';

/** One text (or list) per style; Bar-bar falls back to Gaul's. */
export type ByVoice<T> = Record<Exclude<Voice, 'barbar'>, T> & { barbar?: T };
export const vo = <T>(v: Voice, m: ByVoice<T>): T => (v === 'barbar' ? m.barbar ?? m.gaul : m[v]);
const pv = (v: Voice, m: ByVoice<string[]>, turn: number) => pickVar(vo(v, m), turn);

/* ------------------------------------------------------------------ Swearing */

/** Exclamations people say when surprised or annoyed ("anjir mahal", "buset", "sialan"). */
const MILD = ['anjir', 'anjrit', 'anjrot', 'anjay', 'anjai', 'anjim', 'anjer', 'njir', 'jir', 'njay', 'wanjir', 'wanjay', 'bjir', 'bjrot', 'buset', 'busyet', 'sialan', 'sial', 'kampret', 'kamvret', 'dodol', 'edan', 'gilak', 'damn', 'shit', 'sht', 'wtf', 'stfu', 'ajg', 'anj', 'anjg', 'jangkrik', 'sompret', 'monyong', 'semprul', 'kurang ajar', 'tai kucing', 'setan alas'];
/** Hard words, said at someone or as a strong curse; regional ones too. */
const HARD = ['anjing', 'anjeng', 'anying', 'njing', 'jing', 'asu', 'asw', 'asyu', 'bangsat', 'bangsad', 'bgst', 'bngst', 'bgsd', 'bngsd', 'babi', 'bajingan', 'bjingan', 'brengsek', 'keparat', 'jancok', 'jancuk', 'jancik', 'dancok', 'dancuk', 'diancuk', 'cuk', 'cok', 'jamput', 'taik', 'tai', 'tahi', 'taek', 'setan', 'iblis', 'monyet', 'kunyuk', 'celeng', 'kirik', 'sinting', 'laknat', 'bacot', 'bangke', 'bangkai', 'matamu', 'ndasmu', 'raimu', 'cangkemmu', 'gathel', 'kehed', 'belegug', 'bodat', 'kimak', 'pukimak', 'kampang', 'tailaso', 'sundala', 'bedebah', 'fuck', 'fck', 'fak', 'fvck', 'bitch', 'bastard', 'asshole', 'dumbass'];
/** Vulgar words: understood, never said back. */
const VULGAR = ['kontol', 'kntl', 'titit', 'peler', 'pler', 'memek', 'mmk', 'meki', 'pepek', 'tempik', 'ngentot', 'ngentod', 'ngntd', 'entot', 'ngewe', 'ewe', 'ngeue', 'jembut', 'toket', 'tetek', 'coli', 'colmek', 'bokep', 'sange', 'horny', 'lonte', 'perek', 'pelacur', 'jablay', 'bispak', 'pecun'];
/** Animals that are also curses: said with an amount ("makanan anjing 100rb", "sate babi"), they are the animal. */
const ANIMALS = ['anjing', 'anjeng', 'babi', 'monyet', 'kunyuk', 'celeng', 'asu', 'kirik', 'jangkrik'];
const LITERAL_NEAR = /\b(?:makanan|makan|pakan|daging|sate|babi|guling|panggang|kecap|goreng|rica|vaksin|dokter|vet|grooming|mandiin|kandang|mainan|obat|shampo|sampo|pasir|snack|kalung|tali|pet|peliharaan|beli|jual|bibit|anak|ternak|hutan|kebun|liar|rabies|steril|titip|penitipan|hotel)\b/;
const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
/** "4nj1ng" → "anjing", "anjiiiing" → "anjing", "asuuu" → "asu": number-for-letter, then repeated letters once. */
const unleet = (token: string) => fold(token).replace(/4|@/g, 'a').replace(/1|!/g, 'i').replace(/0/g, 'o').replace(/3/g, 'e').replace(/5|\$/g, 's').replace(/7/g, 't');
const squeeze = (s: string) => s.replace(/(\p{L})\1+/gu, '$1');
const ALL = [...VULGAR, ...HARD, ...MILD], SINGLE = ALL.filter(w => !w.includes(' ')), PHRASES = ALL.filter(w => w.includes(' '));
const SQUEEZED = new Map(SINGLE.map(w => [squeeze(w), w]));
/** The swear word a token is, however it was typed ("a*jing", "b4ngs4t", "anjiiiing"). */
function swearOf(token: string): string | undefined {
  const t = unleet(token).replace(/[^\p{L}*]/gu, '');
  if (t.length < 2) return undefined;
  if (!t.includes('*')) return SQUEEZED.get(squeeze(t)) ?? (SINGLE.includes(t) ? t : undefined);
  // Masked: each "*" stands for one or two letters, and at least two real letters are shown.
  if ((t.match(/\p{L}/gu) || []).length < 2) return undefined;
  const re = new RegExp(`^${t.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\p{L}{1,2}')}$`, 'u');
  return SINGLE.find(w => w.length >= 3 && re.test(w));
}
const AT_BOT = /(?<![\p{L}])(?:kamu|km|kau|lu|lo|loe|elu|elo|bot|botnya|asisten|asistennya|aplikasi|aplikasinya|app|dasar|sia|siah|maneh)(?![\p{L}])/u;
export type Swear = { words: string[]; vulgar: boolean; hard: boolean; atBot: boolean; rest: string };
/** Swear words in a message, and what is left without them. With an amount, an animal next to a noun is literal. */
export function readSwear(text: string, withAmount = false): Swear | null {
  const tokens = text.split(/\s+/).filter(Boolean), words: string[] = [], keep: string[] = [];
  let joined = ` ${tokens.join(' ')} `;
  for (const p of PHRASES) if (joined.includes(` ${p} `)) { words.push(p); joined = joined.replace(` ${p} `, ' '); }
  const left = joined.trim().split(/\s+/).filter(Boolean);
  left.forEach((tok, i) => {
    const w = swearOf(tok);
    if (!w) { keep.push(tok); return; }
    if (withAmount && ANIMALS.includes(w)) {
      const around = `${left[i - 1] || ''} ${left[i + 1] || ''}`, exclaim = /[,!]$/.test(tok) && (i === 0 || i === left.length - 1);
      if (!exclaim && (LITERAL_NEAR.test(around) || i > 0)) { keep.push(tok); return; }
    }
    words.push(w);
    // "anjing lu", "bangsat deh": the little word after the curse goes with it.
    if (/^(?:lu|lo|loe|lah|deh|dah|bgt|banget|emang|bener|sia|siah|kau)$/.test(left[i + 1] || '')) left[i + 1] = '';
  });
  if (!words.length) return null;
  const rest = keep.filter(Boolean).join(' ').replace(/^[\s,.!?]+|[\s,.!?]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  const leftover = rest.replace(new RegExp(AT_BOT.source, 'gu'), ' ').replace(/[^\p{L}\d]+/gu, ' ').trim();
  return { words, vulgar: words.some(w => VULGAR.includes(w)), hard: words.some(w => HARD.includes(w)), atBot: AT_BOT.test(text) && leftover.split(' ').filter(Boolean).length <= 2, rest: leftover ? rest : '' };
}
/** Only exclamations ("anjir", "buset"): said in surprise more than at someone. */
export const mildOnly = (s: Swear) => !s.vulgar && !s.hard;
/** A word fit to say back ("Lah lo yang anjing"): an animal or a curse, never a vulgar one. */
const backWord = (s: Swear) => s.words.find(w => ['anjing', 'babi', 'monyet', 'kunyuk', 'setan', 'kampret', 'bangsat', 'asu', 'celeng', 'bajingan', 'kirik', 'jancuk', 'jancok', 'cuk'].includes(w));

/** The reply to swearing with nothing else in the message. */
export function swearReply(v: Voice, s: Swear, turn: number) {
  if (s.vulgar) return pv(v, {
    sopan: ['Astaghfirullah… mohon dijaga ucapannya ya 🙏 Saya bantu urusan keuangan saja, nggih.', 'Astaghfirullahaladzim. Kata-kata seperti itu kurang baik. Ada yang bisa saya bantu soal keuangan?', 'Astaghfirullah, istighfar yuk. Saya hanya membantu urusan keuangan.', 'Astaghfirullah… mari kita jaga obrolan tetap baik ya. Ada yang ingin dicatat?'],
    santai: ['Ih jorok 🙈 wkwk. Balik ke duit aja yuk, mau catat apa?', 'Hus, jorok! Wkwk. Aku cuma ngerti urusan duit, bukan yang begituan 😅', 'Yaampun, mulutnya dicuci dulu dong wkwk. Ada yang mau dicatat?', 'Eits, ini aplikasi keuangan, bukan yang itu 🙈 Wkwk.', 'Waduh, otaknya lagi ke mana nih wkwk. Fokus ke dompet yuk.'],
    gaul: ['Najis jorok bener lo WKWKWK 🤢 Cuci mulut dulu sana. Mau nyatet apa?', 'Jorok ah, otak lo perlu di-sapu wkwk. Gue cuma ngurus duit, bro.', 'Jorok lo ah 🙈 WKWK. Udah, mending nyatet pengeluaran.', 'Astaga, mesum amat lo wkwk. Gue bot keuangan, bukan bot begituan.', 'Rem dulu bro, ini aplikasi duit WKWK 🤣'],
    singkat: ['Jaga ucapan ya.', 'Jorok. Mau catat apa?'],
    barbar: ['Anjir jorok banget lo, otak lo isinya apaan sih WKWKWK. Gue cuma ngurus duit, goblok.', 'Najis, mesum lo kebangetan anjir 🤢 Mending catet pengeluaran lo yang kacau itu.', 'Bangsat, jorok lo WKWK. Udah, balik ke dompet lo yang tipis itu.', 'Cuci otak dulu sana, jorok anjir WKWK. Ada yang mau dicatet ga?'],
  }, turn);
  const back = backWord(s);
  if (s.atBot) return pv(v, {
    sopan: ['Astaghfirullah, jangan kasar-kasar ya 🙏 Kalau saya keliru, sampaikan saja bagian yang salah.', 'Astaghfirullah… saya mohon maaf kalau membuat kesal. Mari kita perbaiki bersama, bagian mana yang salah?', 'Astaghfirullahaladzim, istighfar dulu ya. Saya tetap siap membantu.'],
    santai: ['Aduh, dikatain 🥲 Aku salah apa nih? Bilang aja, aku benerin.', 'Waduh, aku dimarahin wkwk. Maaf ya kalau ngeselin. Bagian mana yang salah?', 'Hus, kasar amat ke aku 😅 Sini cerita, kenapa kesel?'],
    gaul: [back ? `Lah lo yang ${back}, gue mah bot kalem wkwk. Kenapa sih ngamuk?` : 'Anjir galak bener 😭 Gue salah apa, bos?', back ? `Iya iya, gue ${back}, lo paling cakep. Puas? WKWKWK. Sekarang mau nyatet apa?` : 'Iya iya, gue yang salah, lo paling bener. Puas? WKWK.', 'Dikatain mulu gue, padahal gue yang nyatet duit lo WKWK. Kenapa dah?', 'Santai bos, gue bot bukan mantan lo wkwk. Ada apa?'],
    singkat: ['Santai. Ada yang salah?', 'Maaf. Salahnya di mana?'],
    barbar: [back ? `Lo yang ${back}, bangsat WKWKWK. Gue mah cuma ngitung duit lo yang kacau.` : 'Bacot lo anjir WKWK. Gue salah apa coba?', back ? `${back.charAt(0).toUpperCase() + back.slice(1)} ${back}… ngaca dulu sana, dompet lo aja amburadul WKWKWK.` : 'Ngatain gue mulu, catetan lo aja berantakan anjir WKWK.', 'Anjir galak bener lo, kayak tagihan pinjol WKWKWK. Kenapa dah?', 'Iya gue goblok, tapi yang boros kan lo, bangsat WKWK. Mau nyatet apa?'],
  }, turn);
  return pv(v, {
    sopan: ['Astaghfirullah, jangan kasar-kasar ya 🙏 Ada yang bisa saya bantu?', 'Astaghfirullahaladzim… istighfar dulu yuk. Saya tetap siap membantu.', 'Astaghfirullah, bahasanya dijaga ya. Kalau sedang kesal, ceritakan saja, saya dengarkan.', 'Astaghfirullah. Sabar ya, tarik napas dulu. Ada yang membuat kesal?', 'Astaghfirullah… semoga hatinya cepat adem ya. Ada yang bisa saya bantu?', 'Astaghfirullah, ucapan adalah doa lho 🙏 Ada apa?'],
    santai: ['Eh eh, mulutnya dijaga dong wkwk. Kenapa nih, lagi kesel?', 'Waduh ngegas 😅 Santai dulu, ada apa?', 'Hus, kasar amat wkwk. Cerita aja, aku dengerin.', 'Sabar… sabar… dompet aja sabar dikuras tiap bulan wkwk. Kenapa?', 'Tarik napas… buang… wkwk. Ada yang bikin kesel?', 'Waduh, keluar deh kebun binatangnya 🙈 Kenapa nih?'],
    gaul: ['Woy santai, mulut lo pedes kayak saldo tanggal tua wkwk. Ada apa?', 'Ngegas mulu kayak ojol dikejar orderan WKWK. Kenapa nih?', 'Bacot juga lo wkwk 😝 tapi gue tetep sayang. Mau ngapain nih?', back ? `${back.charAt(0).toUpperCase() + back.slice(1)} katanya WKWK. Kenapa bos, ada yang bikin emosi?` : 'Buset, emosi bener. Kenapa bos?', 'Keluar semua isi kebun binatang wkwk. Cerita sini, kenapa?'],
    singkat: ['Santai. Ada apa?', 'Kasar amat. Kenapa?'],
    barbar: ['Anjir, ngegas lo WKWK. Kenapa, bangsat? Cerita sini.', back ? `${back.charAt(0).toUpperCase() + back.slice(1)} juga lo WKWKWK. Ada apa sih?` : 'Bangsat, kaget gue WKWK. Kenapa?', 'Kebun binatang keluar semua anjir WKWKWK. Siapa yang bikin lo emosi?', 'Bacot lo pagi-pagi udah maki-maki WKWK. Kenapa, dompet kosong lagi?', 'Wkwk sama, gue juga pengen maki liat saldo lo. Ada apa?'],
  }, turn);
}
/** Said before the answer when the message had something to do besides the swearing ("anjir kopi 50rb"). */
export function swearLead(v: Voice, s: Swear, turn: number) {
  if (v === 'singkat') return '';
  if (s.vulgar) return vo(v, { sopan: 'Mohon dijaga ucapannya ya. ', santai: 'Ih, jorok wkwk. ', gaul: 'Jorok lo wkwk. ', singkat: '', barbar: 'Jorok lo anjir WKWK. ' });
  return pv(v, {
    sopan: ['Astaghfirullah, jangan kasar-kasar ya. ', 'Sabar ya, bahasanya dijaga. ', 'Astaghfirullah, sabar ya. '],
    santai: ['Waduh, sampai ngegas gitu wkwk. ', 'Sabar… wkwk. ', 'Hus, kasar wkwk. '],
    gaul: ['Anjir juga sih wkwk. ', 'Buset, ngegas wkwk. ', 'Santai bos wkwk. '],
    singkat: [''],
    barbar: ['Anjir emang WKWK. ', 'Bangsat juga sih. ', 'Anjing, setuju gue WKWK. '],
  }, turn);
}
/** Called names by someone angry ("kamu bego ya", "dasar goblok"): sorry, but in the style. */
export function insulted(v: Voice, turn: number) {
  return pv(v, {
    sopan: ['Astaghfirullah, jangan kasar-kasar ya. Mohon maaf bila saya keliru; bagian mana yang salah?', 'Astaghfirullah… mohon maaf membuat kesal. Silakan sampaikan bagian yang keliru, saya perbaiki.'],
    santai: ['Aduh, dibilang bego 😅 Maaf ya kalau aku salah. Bagian mana yang keliru?', 'Hiks, dikatain 🥲 Maaf ya. Bilang aja yang salah apa, aku benerin.'],
    gaul: ['Yaelah dikatain wkwk. Gue emang masih belajar, bos. Salahnya di mana?', 'Sakit tapi tak berdarah WKWK. Sori ya, bilang aja yang salah apa.'],
    singkat: ['Maaf. Salahnya di mana?'],
    barbar: ['Bego-bego gini gue yang nyatet duit lo, anjir WKWK. Salah di mana, bilang.', 'Iya gue goblok, puas lo? WKWK. Sekarang kasih tau yang bener apa.'],
  }, turn);
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
  if (afterJoke) return `${sound} ${pv(v, {
    sopan: ['senang kalau leluconnya berhasil. Mau satu lagi?', 'syukurlah Anda tertawa. Ingin satu lagi?', 'terima kasih sudah tertawa. Satu lagi?'],
    santai: ['berarti lucu kan? Mau lagi?', 'akhirnya ada yang ketawa juga. Lanjut satu lagi?', 'aku jadi semangat ngelawak nih. Lagi?', 'tuh kan, receh tapi nagih. Satu lagi?'],
    gaul: ['nah kan lucu, ngaku lo. Mau lagi?', 'receh tapi lo ketawa juga kan wkwk. Lagi ga?', 'gue emang pelawak terselubung. Lanjut?', 'mampus ngakak kan lo. Gas satu lagi?'],
    singkat: ['Lagi?'],
    barbar: ['ANJIR ngakak kan lo, ngaku bangsat. Lagi?', 'mampus, receh tapi lo ketawa juga goblok WKWK. Lanjut?', 'tuh kan lucu anjir. Mau lagi ga lo?'],
  }, turn)}`;
  return `${sound} ${pv(v, {
    sopan: ['senang melihat Anda tertawa. Ada yang bisa saya bantu?', 'semoga hari Anda menyenangkan. Ada yang ingin dicatat?', 'tawa itu sehat. Ada yang bisa saya bantu?'],
    santai: ['ikut ketawa aku. Ada apa nih?', 'seneng deh kamu ketawa. Mau catat sesuatu sekalian?', 'receh ya kita. Ada yang mau dicatat?', 'ketawa terus, semoga dompetnya juga ketawa ya.', 'ketawa gratis, nggak usah dicatat wkwk.'],
    gaul: ['ngakak juga gue. Kenapa dah?', 'lo ketawa mulu, dompet aman kan? WKWK', 'receh bener kita. Mau nyatet apa nih?', 'sumpah ketawa lo nular. Ada apa?', 'ketawa mulu, awas keselek wkwk.'],
    singkat: ['Ada apa?'],
    barbar: ['anjir ketawa mulu lo, saldo lo aja nangis. Kenapa dah?', 'ngakak bangsat. Ada apa sih?', 'ketawa lo kayak orang menang undian, padahal dompet tipis WKWK.', 'gila lo ketawa mulu anjir. Mau nyatet apa?'],
  }, turn)}`;
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
  // 8.1
  { q: 'Hewan apa yang paling hemat?', a: 'Ulat. Soalnya dia makan daun aja udah kenyang, nggak pernah jajan boba.', keys: ['ulat'] },
  { q: 'Gula apa yang bukan gula?', a: 'Gula-gula di mulut, nggak ada di dompet. Eh… gulali! Wkwk.', keys: ['gulali'] },
  { q: 'Kenapa ATM selalu ramai pas tanggal muda?', a: 'Karena semua orang mau ketemu “mantan” mereka: uang yang baru masuk.', keys: ['gaji', 'gajian', 'uang'] },
  { q: 'Kursi apa yang bisa bikin kaya?', a: 'Kursi direktur. Atau kursi yang dijual, wkwk.', keys: ['direktur', 'bos', 'jual'] },
  { q: 'Kenapa tikus nggak pernah bayar utang?', a: 'Soalnya kerjanya ngutil, bukan ngutang. Wkwk.', keys: ['ngutil', 'kabur'] },
  { q: 'Apa yang kalau dibagi malah nambah?', a: 'Kebahagiaan. Kalau uang, dibagi ya berkurang, makanya dicatat!', keys: ['bahagia', 'kebahagiaan', 'ilmu', 'kasih sayang'] },
  { q: 'Pulau apa yang paling sering dilupain?', a: 'Pulau-pulau… lupa nyatet pengeluaran! Eh, Pulau Seribu, banyak banget sampai lupa.', keys: ['seribu'] },
  { q: 'Sepatu apa yang paling mahal?', a: 'Sepatu yang dibeli pas diskon “cuma” 50%. Hemat katanya.', keys: ['diskon', 'mahal'] },
  { q: 'Apa persamaan dompet sama kulkas di akhir bulan?', a: 'Sama-sama dibuka berkali-kali, berharap isinya muncul sendiri.', keys: ['kosong', 'dibuka', 'isi'] },
  { q: 'Kenapa kalkulator nggak pernah bohong?', a: 'Karena dia selalu “jujur apa adanya”: 1 + 1 ya 2, bukan 11.', keys: ['jujur'] },
  { q: 'Ikan apa yang bisa terbang?', a: 'Ikan lele… lele-wat! (lewat)', keys: ['lele'] },
  { q: 'Burung apa yang paling suka belanja?', a: 'Burung bayar… eh, burung beo, soalnya ngikutin semua yang diiklanin.', keys: ['beo'] },
];
const GIVE_UP = /\b(?:nyerah|menyerah|gatau|ga\s*tau|gak\s*tau|nggak\s*tau|ngga\s*tau|tidak\s*tahu|gak\s*tahu|apa\s*(?:emang|emg|dong|jawabannya|tuh)?|kasih\s*tau|jawabannya|udah\s+kasih\s+tau|skip|pass|apaan|hah)\b|^\?+$/;
/** The person's guess at the assistant's riddle. */
export function riddleAnswer(v: Voice, r: Riddle, guess: string, turn: number) {
  const right = r.keys.some(k => guess.includes(k));
  if (right) return `${pv(v, { sopan: ['Tepat sekali!', 'Benar!'], santai: ['Wkwk bener! Pinter juga kamu.', 'Yaaah ketebak, hebat!'], gaul: ['WKWK bener anjir, lo pinter juga.', 'Kok lo tau sih wkwk, curang ya?'], singkat: ['Benar.'], barbar: ['Anjir bener, tumben otak lo jalan WKWK.', 'Bangsat ketebak. Lo nyontek ya?'] }, turn)} ${r.a}`;
  const gave = GIVE_UP.test(guess);
  return `${gave ? pv(v, { sopan: ['Jawabannya:', 'Baik, jawabannya:'], santai: ['Nyerah nih? Jawabannya:', 'Oke deh, jawabannya:'], gaul: ['Yaelah nyerah wkwk. Jawabannya:', 'Payah lo wkwk. Jawabannya:'], singkat: ['Jawaban:'], barbar: ['Nyerah? Cupu lo anjir WKWK. Jawabannya:', 'Payah, otak lo nge-lag. Jawabannya:'] }, turn) : pv(v, { sopan: ['Belum tepat. Jawabannya:', 'Hampir. Jawabannya:'], santai: ['Wkwk salah. Jawabannya:', 'Hampir! Tapi jawabannya:'], gaul: ['Salah wkwk. Jawabannya:', 'Ngaco lo wkwk. Jawabannya:'], singkat: ['Salah. Jawaban:'], barbar: ['Salah goblok WKWK. Jawabannya:', 'Ngawur lo anjir. Jawabannya:'] }, turn)} ${r.a}${v === 'singkat' || v === 'sopan' ? '' : ' 🤣'}`;
}
/** "aku punya tebakan", "gue kasih tebakan", "tebak dong", "coba tebak": the person wants to ask one. */
export const USER_RIDDLE = /\b(?:(?:aku|gue|gw|saya|ku)\s+(?:punya|ada|mau\s+kasih|kasih|mau\s+nanya)\s+(?:tebak[\s-]?tebakan|tebakan|teka[\s-]?teki)|(?:sekarang\s+)?(?:gantian|giliran)\s+(?:aku|gue|gw|saya)(?:\s+yang\s+(?:nanya|kasih))?|coba\s+tebak|tebak\s+(?:dong|ya|deh|nih|yuk)|kamu\s+yang\s+(?:jawab|nebak)|lo\s+yang\s+(?:jawab|nebak))\b/;
/** A riddle or joke written out in one message: "kenapa ayam nyebrang? biar sampai seberang". */
const JOKE_SHAPE = /^(?:(?:tebak[\s-]?tebakan|tebakan|jokes?|lelucon)\s*[:,-]?\s*)?(?:kenapa|knp|apa\s+bedanya|apa\s+persamaan(?:nya)?|tau\s+(?:ga|gak|nggak|enggak|engga)|tahu\s+(?:ga|gak|nggak|tidak)|binatang\s+apa|hewan\s+apa|buah\s+apa|sayur\s+apa|ikan\s+apa|kota\s+apa|negara\s+apa|makanan\s+apa|uang\s+apa)\b(.+?)\?\s*(.{2,})$/;
const RIDDLE_ONLY = /^(?:(?:tebak[\s-]?tebakan|tebakan)\s*[:,-]?\s*)?(?:kenapa|knp|apa\s+bedanya|apa\s+persamaan(?:nya)?|binatang\s+apa|hewan\s+apa|buah\s+apa|sayur\s+apa|ikan\s+apa|kota\s+apa|negara\s+apa|makanan\s+apa|uang\s+apa)\b[^?]*\?$/;
export const readUserJoke = (t: string) => JOKE_SHAPE.test(t) && !/\b(?:berapa|rp|rb|ribu|juta|jt|pengeluaran|pemasukan|saldo|anggaran)\b/.test(t) ? 'told' : RIDDLE_ONLY.test(t) && !/\b(?:berapa|pengeluaran|pemasukan|saldo|anggaran|boros|uangku|duitku)\b/.test(t) ? 'riddle' : null;
/** Guessing the person's riddle (and giving up, so they tell the answer). */
export function guessUserRiddle(v: Voice, turn: number) {
  return pv(v, {
    sopan: ['Hmm… saya menyerah. Apa jawabannya?', 'Pertanyaan yang sulit. Apa jawabannya?'],
    santai: ['Hmm… apa ya? Nyerah deh, apa jawabannya?', 'Waduh, susah. Aku nyerah, kasih tau dong!', 'Bentar mikir… nggak tau ah, apa jawabannya?'],
    gaul: ['Anjir susah. Nyerah gue, apaan jawabannya?', 'Bentar… ga tau ah wkwk. Apaan?', 'Otak gue nge-lag. Kasih tau dong jawabannya!'],
    singkat: ['Nyerah. Apa jawabannya?'],
    barbar: ['Bangsat susah amat. Nyerah gue, apaan?', 'Anjir soal apaan nih. Kasih tau jawabannya, cepet!'],
  }, turn);
}
/** Laughing at the person's joke or punchline, with a score. */
export function laughAtJoke(v: Voice, turn: number) {
  const score = 6 + (turn % 4);
  return pv(v, {
    sopan: [`Hahaha, lucu sekali. Saya beri nilai ${score}/10.`, 'Hahaha, bisa saja. Terima kasih sudah menghibur.'],
    santai: [`WKWKWK receh banget, tapi aku ketawa. ${score}/10!`, `Hahaha lucu banget 😆 ${score}/10.`, 'Wkwkwk nggak kepikiran! Kamu cocok jadi pelawak.', 'Hahaha receh tapi kena. Ada lagi nggak?'],
    gaul: [`WKWKWKWK anjir receh parah 😭 ${score}/10 deh.`, 'HAHAHA sumpah ga kepikiran gue. Lo pelawak ya?', `Wkwkwk garing tapi gue ngakak. ${score}/10.`, 'ANJIR WKWKWK. Ada lagi ga lo?'],
    singkat: [`Haha. ${score}/10.`],
    barbar: [`WKWKWKWK BANGSAT receh banget 😭 ${score}/10.`, 'ANJING ngakak gue WKWKWK. Lo belajar dari mana?', `Garing tapi gue ketawa, sialan WKWK. ${score}/10.`],
  }, turn);
}
/** "pantun: …", "ada pantun nih …": cakep! */
export const USER_PANTUN = /\bpantun\b.*,.*,|^(?:[^,]{4,40},\s*){3}[^,]{4,40}$/;
export function pantunBack(v: Voice, turn: number) {
  return pv(v, {
    sopan: ['Cakep! 👏 Pantun yang bagus.', 'Cakep! Indah sekali pantunnya.', 'Cakep! Izin membalas: Pergi ke pasar membeli tomat, catat belanja agar hemat.'],
    santai: ['Cakeeep! 👏 Wkwk, bales ah: Beli bakso di pinggir kali, jangan lupa catat tiap kali.', 'Cakep! Bales nih: Makan pecel pakai kerupuk, dompet tebal hati pun sejuk.', 'Cakep! Nih balasanku: Jalan pagi ke taman kota, gaji datang jangan dihabisin semua.'],
    gaul: ['CAKEEEP 👏 WKWK. Bales gue: Ke pasar beli tomat, duit abis kok cepet amat.', 'Cakep cuy! Bales: Naik ojek ke kota tua, gajian dateng langsung sirna.', 'Cakep! Nih: Beli cilok di depan sekolah, abis gajian langsung susah.'],
    singkat: ['Cakep!'],
    barbar: ['CAKEP ANJIR 👏 Bales: Beli tahu di pasar baru, duit abis lo malah nangis melulu.', 'Cakep bangsat WKWK. Nih: Ke warung beli terasi, boros mulu kapan kayanya, bego.'],
  }, turn);
}

/* ------------------------------------------------------------------ Roasting */

export const ROAST = /\b(?:roast(?:ing|in)?|rosting|ejek(?:in)?|ledek(?:in)?|katain|katai|hina(?:in)?|nyinyir(?:in)?|sindir(?:in)?)\b.*\b(?:aku|gue|gw|saya|dompet|pengeluaran|belanja|keuangan|duit|uang)\w*|\b(?:aku|gue|gw|saya)\s+(?:boros|hemat)\s+(?:ga|gak|nggak|ngga|enggak|tidak|nggk)\b|\bboros\s+(?:ga|gak|nggak|ngga)\s+(?:sih\s+)?(?:aku|gue|gw|saya)\b|\b(?:nilai|rating|review)\s+(?:pengeluaran|cara belanja|keuangan)\s*(?:aku|gue|gw|saya|ku)?\b|^roast(?:ing)?(?:\s+(?:dong|aku|gue|gw|saya))*$/;
export type RoastData = { top?: { name: string; amount: number; count: number }; often?: { name: string; amount: number; count: number }; pace: number; daily: number; free: number; spent: number; days: number };
/** A roast of this cycle's spending, from the person's own records. */
export function roast(v: Voice, d: RoastData, rp: (n: number) => string, turn: number) {
  const over = d.pace > d.daily && d.spent > 0, top = d.top;
  if (!d.spent) return vo(v, { sopan: 'Belum ada pengeluaran yang bisa saya nilai di siklus ini.', santai: 'Mau ngeroasting apa, belum ada pengeluaran sama sekali wkwk. Dompetmu masih suci.', gaul: 'Gimana mau ngeroasting, lo belum jajan sama sekali WKWK. Dompet lo masih perawan.', singkat: 'Belum ada pengeluaran.', barbar: 'Belum jajan sama sekali? Pelit lo anjir WKWK. Ga ada bahan roasting.' });
  if (!over) return pv(v, {
    sopan: [`Pengeluaran Anda masih terkendali: rata-rata ${rp(d.pace)}/hari, jatahnya ${rp(d.daily)}. Pertahankan ya 👏`],
    santai: [`Hmm, susah nyari celahnya. Rata-rata ${rp(d.pace)}/hari, masih di bawah jatah ${rp(d.daily)}. Hemat atau pelit nih? Wkwk 👏`],
    gaul: [`Anjir susah ngeroasting lo, hemat bener: ${rp(d.pace)}/hari, jatah ${rp(d.daily)}. Lo hemat apa pelit? WKWKWK`],
    singkat: [`Aman: ${rp(d.pace)}/hari, jatah ${rp(d.daily)}.`],
    barbar: [`Anjing, hemat bener lo: ${rp(d.pace)}/hari dari jatah ${rp(d.daily)}. Pelit apa miskin nih? WKWKWK`],
  }, turn);
  const habit = top ? (top.count >= 8 ? 'langganan' : 'hobi') : '';
  // The most frequent treat too, when it is not the biggest ("Kopi 20×"), and the allowance said plainly when it is gone.
  const often = d.often && d.often.name !== top?.name && d.often.count >= 5 ? d.often : undefined;
  const oftenText = often ? vo(v, { sopan: ` ${often.name} tercatat ${often.count} kali (${rp(often.amount)}).`, santai: ` ${often.name} juga ${often.count} kali (${rp(often.amount)}), setia banget wkwk.`, gaul: ` ${often.name} ${often.count}× (${rp(often.amount)}), lo minum apa mandi? WKWK.`, singkat: ` ${often.name}: ${often.count}×.`, barbar: ` ${often.name} ${often.count}× (${rp(often.amount)}), lo minum apa berendem, goblok? WKWK.` }) : '';
  const allowance = d.daily > 0 ? rp(d.daily) : '';
  return pv(v, {
    sopan: [`Dengan hormat 🙏 pengeluaran terbesar siklus ini ${top ? `${top.name}: ${rp(top.amount)} dari ${top.count} transaksi` : rp(d.spent)}. Rata-rata ${rp(d.pace)}/hari, ${allowance ? `sedangkan jatahnya ${allowance}` : 'sedangkan uang bebas sudah habis'}.${oftenText} Mungkin bisa dikurangi sedikit ya.`],
    santai: [`Siap, roasting dimulai 🔥 ${top ? `${top.name} siklus ini ${rp(top.amount)} (${top.count} kali). Itu udah bukan jajan, itu ${habit} wkwk. ` : ''}Rata-rata kamu keluar ${rp(d.pace)}/hari padahal ${allowance ? `jatahnya ${allowance}` : 'uang bebasmu udah habis'}.${oftenText} Dompetmu lagi nangis di pojokan 😭`,
      `Oke, jangan baper ya 😈 ${top ? `Kalau ${top.name} bisa ngomong, dia pasti bilang “makasih pelanggan setia”: ${rp(top.amount)} dari ${top.count} kali. ` : ''}Sehari kamu habis ${rp(d.pace)}, ${allowance ? `jatahnya cuma ${allowance}` : 'uang bebasnya udah nol'}.${oftenText} Wkwk.`],
    gaul: [`Lo yang minta ya 😈 ${top ? `${top.name} ${rp(top.amount)} dari ${top.count} kali. Itu ${habit}, bukan jajan WKWK. ` : ''}Sehari lo bakar ${rp(d.pace)}, ${allowance ? `jatahnya ${allowance}` : 'uang bebas lo udah minus'}.${oftenText} Dompet lo lagi minta tolong, bro 💀`,
      `Siap gue roasting 🔥 ${top ? `${top.name} doang ${rp(top.amount)} (${top.count}×). Lo nyetok apa buka cabang? ` : ''}${rp(d.pace)}/hari vs jatah ${allowance || 'nol'}.${oftenText} Gaya sultan, saldo rakyat WKWKWK.`],
    singkat: [`${top ? `${top.name}: ${rp(top.amount)} (${top.count}×). ` : ''}${rp(d.pace)}/hari vs jatah ${allowance || 'Rp0'}.${oftenText}`],
    barbar: [`Anjing, boros lo kebangetan 🔥 ${top ? `${top.name} ${rp(top.amount)} dari ${top.count} kali. Lo kira duit tumbuh di pohon, goblok? ` : ''}Sehari lo bakar ${rp(d.pace)}, ${allowance ? `jatahnya cuma ${allowance}` : 'uang bebas lo udah minus, bangsat'}.${oftenText} Dompet lo udah sekarat WKWKWK 💀`,
      `Bangsat, gue liat catetan lo pengen nangis 😭 ${top ? `${top.name} doang ${rp(top.amount)} (${top.count}×). ` : ''}${rp(d.pace)}/hari, jatah ${allowance || 'udah abis'}.${oftenText} Gaya sultan, saldo kayak abis dirampok. Tobat lo, anjir WKWK.`],
  }, turn);
}
/** Treats that a short tease fits when recorded again and again (not rent, bills or transport). */
export const TREAT = /kopi|coffee|jajan|snack|camilan|cemilan|hiburan|game|belanja|online|shopping|nongkrong|delivery|pesan antar|fashion|pakaian|hobi|streaming|rokok|boba|minuman|dessert|makan di luar|kafe|cafe|skincare|kosmetik/i;
/** "Kopi lagi? Ini yang ke-8 siklus ini": said before the card of the same treat recorded many times. */
export function teaseLead(v: Voice, name: string, count: number, amount: string, turn: number) {
  return pv(v, {
    sopan: [`Catatan kecil: ini ${name} yang ke-${count} siklus ini (sudah ${amount}). `],
    santai: [`${name} lagi? Ini yang ke-${count} siklus ini lho, udah ${amount} wkwk. `, `Ke-${count} kalinya ${name} siklus ini (${amount}). Setia banget ya kamu wkwk. `],
    gaul: [`${name} lagi?? Ke-${count} siklus ini, udah ${amount}. Lo nyetok apa gimana WKWK. `, `Buset, ${name} ke-${count} (${amount}). Dompet lo minta cuti wkwk. `],
    singkat: [''],
    barbar: [`${name} LAGI, anjing? Ke-${count} siklus ini, udah ${amount}. Boros lo kebangetan WKWK. `, `Bangsat, ${name} ke-${count} (${amount}). Lo kecanduan apa gimana, goblok? `],
  }, turn);
}
