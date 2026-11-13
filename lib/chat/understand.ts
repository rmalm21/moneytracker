/**
 * 8.3 (chat v3) — a message made readable before the rules see it, without touching what the intent model reads:
 *
 *   - words of address around a question: "bot, saldo gopay berapa", "min uang bebas brp", "sisa anggaran kak";
 *   - English and mixed sentences: "how much did i spend this month", "spending gue minggu ini", "my balance";
 *   - Javanese, Sundanese and Betawi: "duitku kari piro", "pengeluaran abdi bulan ieu sabaraha", "aye punya duit berape";
 *   - shorthand the chat did not know ("brpa", "mggu", "ane", "aq"), "-ku" on money words ("gopayku" → "gopay aku");
 *   - misspelled money words in a question ("pengeluarn", "sldo", "anggran"): one letter off (two for long words),
 *     corrected only to the words below, never when the word is a real one ("beras", "jatuh", "kemari", "bukan").
 *
 * Only messages without an amount are read this way: a record ("kak tio ngutang 25k", "makan di SRPN Coffee 30k")
 * goes to Catat otomatis exactly as typed. A message with nothing to change comes back exactly as typed too.
 */
import { findAmounts } from '../quick-entry.ts';

const lower = (s: string) => s.toLocaleLowerCase('id-ID');

/** English phrases → the Indonesian the rules read. Longest first. */
const ENGLISH_PHRASES: [RegExp, string][] = [
  [/\bhow much (?:did|do) i spend on\b/g, 'pengeluaran'], [/\bwhat did i spend\b/g, 'pengeluaran'],
  [/\bhow much (?:did i spend|i spent|i spend|have i spent)\b/g, 'pengeluaran'], [/\bwhat'?s my total spending\b|\bwhats my total spending\b/g, 'pengeluaran'],
  [/\bhow much money do i have left\b|\bhow much (?:money )?(?:do i have|have i got) left\b|\bmoney left\b|\b(?:my )?free money\b|\bhow much is my free money\b/g, 'uang bebas'],
  [/\bhow much is left in my (\p{L}+) budget\b/gu, 'sisa anggaran $1'], [/\bbudget (\p{L}+) left\b/gu, 'sisa anggaran $1'],
  [/\bhow much is my balance\b|\bwhat'?s my balance\b|\bwhats my balance\b|\bmy balance\b/g, 'saldo'], [/\bmy (\p{L}+) balance\b/gu, 'saldo $1'],
  [/\bwho owes me(?: money)?\b/g, 'siapa yang belum bayar'], [/\bhow much do i owe\b|\b(?:my )?total debt\b|\bmy debt\b/g, 'total utang'],
  [/\bdaily (?:budget|limit|allowance)\b/g, 'jatah harian'],
  [/\b(?:total )?(?:spending|spendings|expenses|expense|spend)\b/g, 'pengeluaran'], [/\bincome\b/g, 'pemasukan'], [/\bbalance\b/g, 'saldo'], [/\bdebt\b/g, 'utang'],
  [/\bthis month\b/g, 'bulan ini'], [/\blast month\b/g, 'bulan lalu'], [/\bthis week\b/g, 'minggu ini'], [/\blast week\b/g, 'minggu lalu'], [/\byesterday\b/g, 'kemarin'], [/\btoday\b/g, 'hari ini'],
  [/\bwhere (?:did|does|has|do) (?:all )?my money (?:go|gone|went)\b|\bwhere(?:'s| is) my money going\b/g, 'rincian pengeluaran'],
  [/\bcoffee\b/g, 'kopi'], [/\bfood\b/g, 'makan'], [/\bhow many times\b/g, 'berapa kali'], [/\bhow much\b/g, 'berapa'],
];
/** Javanese, Sundanese and Betawi words → Indonesian. */
const REGIONAL: [RegExp, string][] = [
  // Javanese
  [/\bsing (?:iso|isa|bisa) (?:dienggo|dinggo|dipakai|dipake)\b|\bsik (?:iso|isa) (?:dienggo|dinggo)\b/g, 'yang bisa dipakai'],
  [/\bsasi (?:iki|niki)\b/g, 'bulan ini'], [/\bsasi (?:wingi|kepungkur|kemarin)\b/g, 'bulan lalu'], [/\bwingi\b/g, 'kemarin'],
  [/\b(?:duwitku|dhuwitku|duitku)\b/g, 'uang aku'], [/\b(?:duwit|dhuwit)\b/g, 'uang'], [/\bkari (piro|pira|pinten)\b/g, 'sisa $1'], [/\bisih\b/g, 'masih'],
  [/\b(?:ngentekke|ngentekne|ngentekno|entek|telas)\b/g, 'habis'], [/\b(?:piro|pira|pinten)\b/g, 'berapa'], [/\bmangan\b/g, 'makan'], [/\bkula\b/g, 'aku'], [/\bwis\b/g, 'udah'],
  // Sundanese
  [/\bbulan ieu\b/g, 'bulan ini'], [/\bkamari\b/g, 'kemarin'], [/\bbeak\b/g, 'habis'], [/\bsabaraha\b/g, 'berapa'], [/\bsesa\b/g, 'sisa'], [/\bartos\b/g, 'uang'], [/\babdi\b/g, 'aku'],
  // Betawi
  [/\bberape\b/g, 'berapa'], [/\baye\b/g, 'aku'], [/\budeh\b/g, 'udah'], [/\bkagak\b/g, 'gak'], [/\bente\b/g, 'kamu'], [/\bnyang\b/g, 'yang'], [/\baje\b/g, 'aja'], [/\bgimane\b/g, 'gimana'], [/\bkenape\b/g, 'kenapa'], [/\bpegimane\b/g, 'gimana'],
];
/** English is read only when the message has English in it. */
const ENGLISH = /\b(?:how|where|what'?s|whats|my|spend|spent|spending|spendings|expenses?|balance|income|owes?|debt|yesterday|today|this (?:month|week)|last (?:month|week)|coffee|daily|free money|money left|budget \p{L}+ left)\b/u;
const ENGLISH_LEFT = /\b(?:my|the|is|are|did|do|i|me|on|in|for|bro|please)\b/g;
const SHORT: Record<string, string> = { msh: 'masih', masi: 'masih', tlg: 'tolong', tolongin: 'tolong', brpa: 'berapa', berapaan: 'berapa', brapah: 'berapa', berapah: 'berapa', brpaan: 'berapa', mggu: 'minggu', mgu: 'minggu', ane: 'aku', aq: 'aku', gua: 'gue', w: 'aku', kluar: 'keluar', klwr: 'keluar', kmaren: 'kemarin', kmrin: 'kemarin', anggran: 'anggaran', bajet: 'budget', budjet: 'budget', bujet: 'budget', tabungn: 'tabungan' };
/** "gopayku" → "gopay aku": money words with -ku/-mu. */
const OWNED = 'saldo|gopay|jago|ovo|jenius|mandiri|bca|bri|bni|krom|tunai|cash|tabungan|utang|hutang|piutang|cicilan|pinjaman|anggaran|budget|hp|kos|wishlist|list|bebas|pakai|harian|darurat|incaran|keuangan|kredivo|tagihan|langganan|nganggur';
const OWN = new RegExp(`\\b(${OWNED})(ku|mu)\\b`, 'g');
/** "jagonya", "cicilannya", "uang bebasnya": the -nya of a money word says nothing more. */
const NYA = new RegExp(`\\b(${OWNED}|uang|duit|pengeluaran|pemasukan|gaji|gajian)nya\\b`, 'g');

/** Money words a misspelling is corrected to. */
const TARGETS = ['pengeluaran', 'pemasukan', 'anggaran', 'tabungan', 'transportasi', 'kemarin', 'berapa', 'minggu', 'saldo', 'bebas', 'cicilan', 'langganan', 'tagihan', 'piutang', 'gajian', 'harian', 'bulan'];
/** Real words one letter away from a target: never "corrected". */
const REAL = new Set(['beras', 'bekas', 'bebal', 'salto', 'kemari', 'bukan', 'bulat', 'bulu', 'jatuh', 'berapi', 'hampir', 'tagihin', 'harian', 'gajian', 'minggir', 'mingguan', 'buka', 'bula', 'buah', 'bebek', 'pemasukkan']);
/** Optimal string alignment distance (a swapped pair of letters counts once), stopping early past `max`. */
function distance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      best = Math.min(best, d[i][j]);
    }
    if (best > max) return max + 1;
  }
  return d[a.length][b.length];
}
function corrected(w: string) {
  if (w.length < 4 || REAL.has(w) || TARGETS.includes(w)) return w;
  // "pengeluaranku", "tabunganmu": a money word with its owner, not a misspelling.
  if (TARGETS.some(target => w.startsWith(target) && /^(?:ku|mu|nya)$/.test(w.slice(target.length)))) return w;
  // "pemasukkan" is a spelling people use; it reads as "pemasukan".
  if (w === 'pemasukkan') return 'pemasukan';
  let best = '', bestD = 9;
  for (const target of TARGETS) {
    const max = target.length >= 9 ? 2 : 1;
    if (w[0] !== target[0] && !(w[1] === target[0] && w[0] === target[1])) continue;
    const dd = distance(w, target, max);
    if (dd <= max && dd < bestD) { best = target; bestD = dd; }
  }
  return best || w;
}

/** Words of address before and after a question ("bot,", "min", "kak", "halo,", "cek", "mau tanya,"). */
const LEAD = /^(?:(?:eh|ehh|halo|hallo|hai|hi|hello|permisi|oi|woi|min|admin|bot|kak|kakak|bang|bro|sis|gan|mas|mbak|mba|cek(?:\s+dulu)?|mau tanya|tanya dong|tanya)\s*[,!:.]?\s+)+/;
/** What is left must be a question about money for the words of address to go ("hai hai dompet ajaib" stays a greeting). */
const ASKS = /\b(?:berapa|brp|apa|kapan|gimana|siapa|mana|seberapa|aja|saja|uang|duit|saldo|pengeluaran|pemasukan|anggaran|budget|utang|hutang|piutang|tabungan|cicilan|tagihan|langganan|nabung|total|sisa|rincian|breakdown|persen|persentase|porsi|progress|progres|skor|sehat|keuangan|hemat|transaksi|klaim|reimburse|jatah|isi|incaran|wishlist|darurat)\b|\?|\d/;
const TAIL = /\s+(?:kak|kakak|min|bot|bro|sis|gan|bang)\s*([?!.]*)$/;

/** 10.0 "can i afford a 2 million phone", "is it safe to buy a 1.5 million bag" → "aman nggak beli hp 2jt". */
const AFFORD_EN = /^(?:hey\s+|hi\s+)?(?:can\s+i\s+afford|is\s+it\s+(?:safe|ok|okay|fine|wise)\s+to\s+buy|should\s+i\s+buy|could\s+i\s+buy)\s+(?:a\s+|an\s+|the\s+|this\s+)?(.+?)[?!.\s]*$/;
const EN_ITEMS: [RegExp, string][] = [[/\b(?:phone|smartphone|cellphone)\b/, 'hp'], [/\bbag\b/, 'tas'], [/\bshoes\b/, 'sepatu'], [/\bwatch\b/, 'jam tangan'], [/\bmotorbike|motorcycle\b/, 'motor'], [/\bcar\b/, 'mobil'], [/\bbike\b/, 'sepeda'], [/\bfridge\b/, 'kulkas'], [/\bholiday|vacation|trip\b/, 'liburan']];
function affordEnglish(base: string) {
  const m = base.match(AFFORD_EN); if (!m) return null;
  let rest = ` ${m[1]} `;
  rest = rest.replace(/(\d+(?:[.,]\d+)?)\s*(?:million|mio|m)\b/g, (_x, n: string) => `${n.replace('.', ',')}jt`).replace(/(\d+(?:[.,]\d+)?)\s*(?:thousand|k)\b/g, (_x, n: string) => `${n.replace('.', ',')}rb`);
  for (const [re, to] of EN_ITEMS) rest = rest.replace(re, to);
  return `aman nggak beli ${rest.replace(/\b(?:for|worth|that\s+costs|costing|at|of)\b/g, ' ').replace(/\s{2,}/g, ' ').trim()}`;
}
/** 10.0 "pengeluaran paling boros apa ya", "kategori yg paling nyedot duit apa": the biggest spending. */
const MOST_SPENT = /\bpaling\s+(?:boros|nyedot|menyedot|menguras|ngabisin|ngabisin\s+(?:duit|uang)|banyak\s+makan\s+(?:duit|uang)|bikin\s+(?:boncos|bokek))\b/;
export function understand(input: string): string {
  const typed = input.trim(), base = lower(typed);
  const english = affordEnglish(base);
  if (english) return english;
  // "kategori paling boros" is answered per category further on; the rest asks for the biggest spending.
  if (MOST_SPENT.test(base) && !/\b(?:kategori|hari\s+apa|hari\s+(?:apa\s+)?yang|tanggal|minggu\s+(?:apa|mana|ke)|bulan\s+(?:apa|mana)|jam|kapan)\b/.test(base) && !findAmounts(base).some(a => a.value > 0)) {
    const period = base.match(/\b(hari ini|kemarin|minggu ini|minggu lalu|bulan lalu|bulan kemarin|tahun ini)\b/)?.[1];
    return `pengeluaran terbesar ${period || 'bulan ini'}`;
  }
  // "kategori yg paling nyedot duit apa": the category spent most on.
  if (MOST_SPENT.test(base) && /\bkategori\b/.test(base) && !/\bkategori\s+paling\s+boros\b/.test(base) && !findAmounts(base).some(a => a.value > 0)) {
    const period = base.match(/\b(hari ini|kemarin|minggu ini|minggu lalu|bulan lalu|bulan kemarin|tahun ini)\b/)?.[1];
    return `kategori paling boros ${period || 'bulan ini'}`;
  }
  // "sehari biasanya keluar duit brp": the average a day.
  if (/\b(?:sehari|per\s*hari|perhari)\s+(?:(?:aku|gue|gw|w|saya|ku)\s+)?(?:biasanya\s+|rata[- ]?rata\s+)?(?:keluar|kluar|abis|habis|ngeluarin|ngabisin|belanja|pengeluaran)\b|\b(?:biasanya|rata[- ]?rata)\s+(?:sehari|per\s*hari)\s+(?:keluar|abis|habis|ngeluarin|belanja)\b/.test(base) && /\b(?:berapa|brp|brapa|brpa|berapaan)\b/.test(base) && !findAmounts(base).some(a => a.value > 0) && !/\b(?:boleh|bisa|aman|jatah|biar|supaya|agar|sampai|sampe)\b/.test(base))
    return 'rata-rata pengeluaran per hari berapa';
  // "boleh jajan brp hari ini": the daily allowance, not a purchase.
  if (/\b(?:boleh|bisa|aman)\s+(?:jajan|belanja|keluar|ngeluarin|habisin|ngabisin|pakai|pake)\s+(?:berapa|brp|brapa|brpa)\b/.test(base) && !findAmounts(base).some(a => a.value > 0)) return 'jatah harian berapa';
  // "duit aye berape sekarang", "uang gw brp": how much is free to spend.
  if (/^(?:(?:cek|kak|min|bro|sis)\s+)?(?:uang|duit|duwit|dhuwit|artos)(?:ku|\s+(?:aku|gue|gw|w|saya|aye|ane|abdi|ku))\s+(?:sekarang\s+|skrg\s+)?(?:berapa|brp|brapa|berape|piro|sabaraha|brpa)(?:\s+(?:sekarang|skrg|ya|sih|nih|deh|kak|min))*\s*\??$/.test(base))
    return 'uang bebas berapa';
  // "ganti jd 40rb": the change the edit rules read ("ganti jadi 40rb").
  if (findAmounts(base).some(a => a.value > 0)) return typed.replace(/\b((?:ubah|ganti|edit|koreksi|benerin|bener)(?:in)?)\s+(?:jd|jdi)\b/gi, '$1 jadi');
  // Emoji say nothing to the rules; words of address go before anything else is read ("income last month kak").
  const plain = base.replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!/\p{L}|\d/u.test(plain)) return typed;
  let s = ` ${plain} `;
  const untailed = s.trim().replace(TAIL, '$1').trim(), bare = untailed.replace(LEAD, '').trim();
  if (untailed.split(' ').length >= 2) s = ` ${untailed} `;
  if (bare && bare !== s.trim() && ASKS.test(bare)) s = ` ${bare} `;
  if (ENGLISH.test(s)) {
    // A message in English without an amount is a question ("my gopay balance", "spending yesterday").
    for (const [re, to] of ENGLISH_PHRASES) s = s.replace(re, to);
    s = s.replace(ENGLISH_LEFT, ' ');
    if (!/\b(?:berapa|siapa|apa|kapan)\b/.test(s)) s = `${s.replace(/[?]/g, ' ')} berapa`;
  }
  for (const [re, to] of REGIONAL) s = s.replace(re, to);
  // Whole words only ("w" alone is "aku"; "w/" is not).
  s = s.replace(/(?<=^|\s)\p{L}+(?=$|[\s?!.,])/gu, w => SHORT[w] ?? w);
  // 10.0 "cek budget makan masih aman gak": how much is left of that budget.
  s = s.replace(/(?:\b(?:tolong|coba|bantu)\s+)?\b(?:cek\s+)?(?:budget|anggaran|bujet)\s+(\p{L}+)\s+(?:(?:aku|gue|gw|ku|saya)\s+)?(?:(?:masih|msh)\s+(?:aman|ada|sisa|cukup)|aman)\b(?:\s+(?:ga|gak|nggak|ngga|enggak|tidak|kah|ya|nih|sih|ngga sih|gak sih))*/gu, 'sisa anggaran $1 berapa');
  // -ku/-nya only in a question: "rian udah lunasin utangnya" (a record) keeps its "-nya".
  if (/\b(?:berapa\p{L}*|brp\p{L}*|brapa\p{L}*|brpa|apa|kapan|kpn|gimana|gmn|siapa|mana|seberapa|aja|saja|isinya|persentase|progress|progres|sisa|tinggal|masih|total|semua|semuanya|cek|dulu)\b|\?/u.test(s)) s = s.replace(OWN, '$1 aku').replace(NYA, '$1');
  s = s.replace(/\p{L}+/gu, corrected);
  s = s.replace(/\s{2,}/g, ' ').trim();
  const stripped = s.replace(LEAD, '').replace(TAIL, '$1').trim();
  if (stripped && stripped !== s && ASKS.test(stripped) && stripped.split(' ').length >= (/^cek\b/.test(s) ? 1 : 2)) s = stripped;
  return s === base.replace(/\s{2,}/g, ' ').trim() ? typed : s;
}
