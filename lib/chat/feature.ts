/**
 * What the chat intent model reads (the same at training, scripts/build-chat-model.mjs, and on the phone,
 * lib/chat/model.ts): lower case, amounts and numbers as one token each, stretched letters shortened ("pagiii",
 * "kakk"), laughter in one spelling, and everyday shorthand and typos written out ("gmn" → "gimana", "brp" → "berapa").
 */
export type ChatModelIntent = 'greet' | 'thanks' | 'help' | 'about' | 'examples' | 'summary' | 'afford' | 'tips' | 'calc' | 'cancel' | 'undo' | 'record' | 'question' | 'style'
  | 'smalltalk' | 'mood' | 'budget' | 'payday' | 'goal'
  | 'joke' | 'banter' | 'angry' | 'curhat' | 'serious' | 'teach' | 'apology'
  /** 10.2 A fix to a card ("kategorinya makan malam"), "kalau bulan lalu?", how to use a feature, a game. */
  | 'fix' | 'followup' | 'howto' | 'game';

const SHORT: Record<string, string> = {
  gw: 'gue', gua: 'gue', gwe: 'gue', ak: 'aku', aq: 'aku', sy: 'saya', km: 'kamu', kmu: 'kamu', lu: 'lo', loe: 'lo', elu: 'lo', elo: 'lo',
  gmn: 'gimana', gmna: 'gimana', gimna: 'gimana', bagaimana: 'gimana', brp: 'berapa', brapa: 'berapa', berpa: 'berapa',
  bgt: 'banget', bngt: 'banget', bgtt: 'banget', yg: 'yang', dgn: 'dengan', dg: 'dengan', krn: 'karena', karna: 'karena',
  tdk: 'gak', ga: 'gak', gk: 'gak', nggak: 'gak', ngga: 'gak', enggak: 'gak', engga: 'gak', kagak: 'gak', tidak: 'gak',
  udh: 'udah', sdh: 'udah', sudah: 'udah', blm: 'belum', blom: 'belum', lg: 'lagi', jg: 'juga', aj: 'aja', ajah: 'aja', saja: 'aja',
  bs: 'bisa', bsa: 'bisa', tp: 'tapi', tpi: 'tapi', trs: 'terus', trus: 'terus', dr: 'dari', utk: 'untuk', bwt: 'buat', sm: 'sama', ama: 'sama',
  kalo: 'kalau', klo: 'kalau', kl: 'kalau', mksd: 'maksud', mksdnya: 'maksudnya', knp: 'kenapa', napa: 'kenapa', gpp: 'gapapa',
  makasi: 'makasih', mksh: 'makasih', makaci: 'makasih', thx: 'makasih', tq: 'makasih', tengkyu: 'makasih', thanks: 'makasih',
  pgn: 'pengen', pingin: 'pengen', pengin: 'pengen', dpt: 'dapat', dapet: 'dapat', bln: 'bulan', mgg: 'minggu', hr: 'hari',
  skrg: 'sekarang', skrng: 'sekarang', donk: 'dong', bnr: 'bener', emg: 'emang', kyk: 'kayak', kek: 'kayak', apaan: 'apa',
  duit: 'uang', doku: 'uang', cuan: 'uang', td: 'tadi', tdi: 'tadi', bsk: 'besok', kmrn: 'kemarin', kmarin: 'kemarin', kemaren: 'kemarin',
  sori: 'maaf', sorry: 'maaf', sory: 'maaf', maap: 'maaf', mf: 'maaf', jgn: 'jangan', gausah: 'gak usah', gajadi: 'gak jadi',
  cape: 'capek', capai: 'capek', bete: 'bete', stress: 'stres', pls: 'tolong', plis: 'tolong', please: 'tolong',
  // 10.0 More of how people type: shorthand, slang and typos of the words the rules read.
  bkin: 'bikin', bkinin: 'bikinin', bikinn: 'bikin', mo: 'mau', mw: 'mau', pngen: 'pengen', pgen: 'pengen', pngn: 'pengen', pengn: 'pengen',
  bajet: 'budget', budjet: 'budget', bujet: 'budget', badget: 'budget', bujed: 'budget', budged: 'budget', anggran: 'anggaran', angaran: 'anggaran', anggarn: 'anggaran',
  batesin: 'batasin', ngebatesin: 'batasin', ngebatasin: 'batasin', ngebatasi: 'batasin', pasangin: 'pasang', masangin: 'pasang', nambahin: 'tambahin',
  kluar: 'keluar', klwr: 'keluar', tabungn: 'tabungan', tbngan: 'tabungan', kmrin: 'kemarin', kmaren: 'kemarin', tgl: 'tanggal', thn: 'tahun', byr: 'bayar',
  gaada: 'gak ada', gada: 'gak ada', kaga: 'gak', kgk: 'gak', jd: 'jadi', jdi: 'jadi', blg: 'bilang', ntar: 'nanti', nnti: 'nanti', bntr: 'bentar',
  krg: 'kurang', lbh: 'lebih', ttg: 'tentang', gimn: 'gimana', gmana: 'gimana', bgmn: 'gimana', dmn: 'di mana', kmn: 'ke mana', ane: 'aku', gwa: 'gue',
  mager: 'males', fulus: 'uang', simpen: 'simpan', kudu: 'harus',
  // 10.2
  malem: 'malam', mlm: 'malam', kategori2: 'kategori', ktgr: 'kategori', ktg: 'kategori', dompt: 'dompet', dmpt: 'dompet', tggl: 'tanggal',
  kpn: 'kapan', kapn: 'kapan', bnyk: 'banyak', byk: 'banyak', sebenernya: 'sebenarnya', sbnrnya: 'sebenarnya', tmpt: 'tempat', ngapain: 'ngapain',
};

/** A word with stretched letters shortened and everyday shorthand written out ("pagiii" → "pagi", "kpn" → "kapan"). */
const word = (w: string) => { const short = w.replace(/(\p{L})\1{2,}/gu, '$1').replace(/([^aeiou\s])\1+$/u, '$1'); return SHORT[short] || short; };
/** 7.8: the same shorthand written out for the chat rules (amounts and punctuation stay as typed). */
export const normalizeWords = (text: string) => text.replace(/\p{L}+/gu, w => /^(?:w+k+)+w*k*$|^(?:h?a+h+)+a*$|^(?:h?e+h+)+e*$/.test(w) ? w : word(w));

/**
 * The words the model reads. 10.2: an amount and a number are read as made-up words ("qnominal", "qangka"), never as
 * real ones: "tebak angka" and "ubah nominalnya" no longer pull every message with a number towards a game or a fix.
 */
export const chatFeature = (text: string) => text.toLocaleLowerCase('id-ID')
  .replace(/(?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k|jt|juta|m)\b/g, ' qnominal ')
  .replace(/\d[\d.,]*/g, ' qangka ')
  .replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  .split(' ').map(w => {
    if (/^(?:w+k+)+w*k*$/.test(w) && w.length > 2) return 'wkwk';
    if (/^(?:h?a+h+)+a*$|^(?:ha){2,}h?$/.test(w)) return 'haha';
    if (/^(?:h?e+h+)+e*$/.test(w)) return 'hehe';
    // "pagiii" → "pagi", "kakk" → "kak", "dongg" → "dong" (doubled vowels inside words stay: "maaf", "saat").
    return word(w);
  }).join(' ');
