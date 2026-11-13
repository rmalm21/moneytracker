/**
 * 10.0 Asisten 3.0 — a word after a record is saved from the chat, only when there is something worth saying, in the
 * person's chosen way of talking (Santai teases a little, Sopan reminds politely, Singkat keeps to one line, Gaul
 * teases, Bar-bar roasts the habit, never the person):
 *   - praised: giving (sedekah, zakat, infak, donasi), saving (nabung, tujuan dana, investasi), paying off a debt, money in;
 *   - scolded: the same treat again and again (jajan, kopi, boba… five or more this pay cycle, or three today);
 *   - warned: a big expense (from Rp1.000.000, or a quarter of what is still free to spend, or more than is free), and a
 *     budget that is nearly used up or went over;
 *   - nothing for an everyday record (bensin, parkir, pulsa…).
 * The person can switch it off in the chat settings ("Komentar setelah mencatat"). The engine (`commentOnSaved` in
 * engine.ts) gathers the facts; this file only decides and words it.
 */
import { pickVar } from './persona.ts';
import type { Voice } from './voice.ts';

export type CommentFacts = {
  kind: 'income' | 'expense' | 'debt' | 'saving' | 'other';
  amount: number;
  /** The record's own words (the card's sentence, lower case). */ text: string;
  /** The treat's word ("jajan", "kopi") when it is one, and how often this pay cycle / today (this one included). */
  treat?: string; treatCount: number; todayCount: number; treatTotal: number;
  generous: boolean;
  /** The budget this expense falls in, after it (`spent`) and before it (`before`). */ budget?: { name: string; spent: number; before: number; limit: number; warnAt: number };
  /** Still free to spend this pay cycle, after it. */ free: number;
};
export type Comment = { text: string; tone: 'good' | 'warn'; chips: string[]; offer?: string };

const rp = (n: number) => `${n < 0 ? '−' : ''}Rp${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;
type Lines = { santai: string[]; sopan: string[]; singkat: string[]; gaul: string[]; barbar: string[] };
const say = (v: Voice, l: Lines, turn: number) => pickVar(l[v] || l.santai, turn);

export const GENEROUS = /\b(?:sedekah|sodaqoh|shodaqoh|donasi|donasiin|zakat|infa[qk]|amal|amal\s+jariyah|sumbangan|nyumbang|menyumbang|wakaf|santunan|yatim|kurban|qurban|berbagi|bantu\s+(?:korban|bencana))\b/;
export const SAVING = /\b(?:nabung|menabung|tabung|tabungan|celengan|investasi|invest|reksa\s*dana|reksadana|deposito|emas|saham|dana\s+darurat|tujuan\s+dana)\b/;
export const DEBT = /\b(?:cicilan|nyicil|bayar\s+(?:utang|hutang|pinjaman|paylater|kartu\s+kredit|cc)|lunas(?:in)?|pelunasan|angsuran)\b/;
/** Treats a tease fits when they come again and again (not rent, bills, fuel or transport). */
export const TREATS: [RegExp, string][] = [
  [/\b(?:jajan|jajanan|cilok|seblak|cimol|pentol|cireng|batagor|siomay|martabak|gorengan|snack|cemilan|camilan|ngemil|es\s+teh|es\s+krim|dessert)\b|jajan/i, 'jajan'],
  [/\b(?:kopi|ngopi|coffee|latte|americano|cappuccino|espresso)\b|kopi/i, 'kopi'],
  [/\b(?:boba|thai\s+tea|milk\s*tea|bubble)\b/i, 'boba'],
  [/\b(?:gofood|grabfood|shopeefood|pesan\s+antar|delivery|fast\s*food)\b|delivery|fast food/i, 'pesan antar'],
  [/\b(?:nongkrong|hangout|kafe|cafe)\b|nongkrong/i, 'nongkrong'],
  [/\b(?:checkout|co|marketplace|shopee|tokopedia|online\s+shop)\b/i, 'belanja online'],
  [/\b(?:rokok|vape|liquid)\b/i, 'rokok'],
];

export function commentFor(f: CommentFacts, v: Voice, turn: number): Comment | null {
  const t = f.text;
  if (f.kind === 'income' && f.amount > 0) {
    const part = Math.round(f.amount * 0.2 / 1000) * 1000;
    return { tone: 'good', chips: ['mau bikin tabungan', 'ringkasan bulan ini'], offer: 'mau bikin tabungan', text: say(v, {
      santai: [`Alhamdulillah, ${rp(f.amount)} masuk! Sebelum kepake, sisihkan dulu sekitar ${rp(part)} (20%) buat nabung ya.`, `Asik, ada pemasukan ${rp(f.amount)}! Biar nggak numpang lewat, nabung dulu ${rp(part)} di awal.`],
      sopan: [`Selamat, ${rp(f.amount)} sudah masuk. Disarankan menyisihkan sekitar ${rp(part)} (20%) untuk tabungan terlebih dahulu.`],
      singkat: [`+${rp(f.amount)}. Sisihkan ${rp(part)} buat nabung.`],
      gaul: [`Wih cair ${rp(f.amount)}! Sisihin ${rp(part)} (20%) buat nabung dulu, baru healing.`, `Mantap, masuk ${rp(f.amount)}! Tabung dulu ${rp(part)} biar nggak numpang lewat doang.`],
      barbar: [`Anjay gajian ${rp(f.amount)}! Tabung dulu ${rp(part)}, jangan langsung lo abisin buat checkout, bos.`, `Cair ${rp(f.amount)}, mantap! Sisihin ${rp(part)} dulu, jangan sampe lo bokek lagi tengah bulan.`],
    }, turn) };
  }
  if (f.kind === 'expense' && f.generous) return { tone: 'good', chips: ['total sedekah bulan ini'], text: say(v, {
    santai: ['MasyaAllah, semoga jadi berkah dan rezekimu makin lancar ya. 🤲', 'Mantap, berbagi itu nggak bikin miskin. Semoga berkah!', 'Keren, semoga dibalas berlipat ya. Sudah kucatat.'],
    sopan: ['Masya Allah, semoga menjadi berkah dan dibalas dengan kebaikan yang berlipat.', 'Semoga menjadi amal yang berkah. Sudah saya catat.'],
    singkat: ['Semoga berkah. 🤲'],
    gaul: ['Keren banget lo, semoga berkah dan rezeki makin lancar! 🤲', 'Mantap, berbagi itu keren. Semoga dibales berlipat ya!'],
    barbar: ['Anjir, baik bener lo. Semoga berkah, bos! 🤲', 'Gila, mulia juga lo ternyata. Semoga rezeki lo makin deres!'],
  }, turn) };
  if (f.kind === 'saving' || f.kind === 'expense' && SAVING.test(t) && !f.treat) return { tone: 'good', chips: ['progres tujuan dana', 'ringkasan bulan ini'], text: say(v, {
    santai: ['Nabung lagi, keren! Konsisten kayak gini yang bikin target cepet kekejar.', 'Mantap, satu langkah lebih dekat ke target. Pertahankan ya!'],
    sopan: ['Bagus sekali, satu langkah lebih dekat ke target Anda.', 'Kebiasaan menabung yang baik. Pertahankan.'],
    singkat: ['Mantap, makin dekat ke target.'],
    gaul: ['Nabung terus, keren lo! Target makin deket nih.', 'Gokil, disiplin banget nabungnya. Lanjutkeun!'],
    barbar: ['Anjay, lo nabung? Gue bangga, sumpah. Terusin, bos!', 'Mantap, akhirnya duit lo nggak cuma jadi jajan. Terusin!'],
  }, turn) };
  if (f.kind === 'debt' || f.kind === 'expense' && DEBT.test(t)) return { tone: 'good', chips: ['utang aku tinggal berapa'], text: say(v, {
    santai: ['Satu cicilan beres, beban makin ringan. Keren!', 'Mantap, utangnya berkurang lagi. Semangat sampai lunas!'],
    sopan: ['Bagus, satu cicilan telah terbayar. Semoga segera lunas.'],
    singkat: ['Cicilan beres. 👍'],
    gaul: ['Cicilan kelar, mantap! Bentar lagi bebas utang nih.', 'Satu beban lepas, keren lo!'],
    barbar: ['Anjir, rajin bayar utang. Gue respect, bos!', 'Mantap, utang lo makin tipis. Lanjut sampe lunas!'],
  }, turn) };
  if (f.kind !== 'expense' || f.amount <= 0) return null;

  // A budget nearly used up, or gone over: said first (it matters more than a tease).
  const b = f.budget;
  // Said once, when this expense crosses the line (not again for every parkir after it).
  const crossedLimit = b && b.limit > 0 && b.before < b.limit && b.spent >= b.limit;
  const crossedWarn = b && b.limit > 0 && b.before / b.limit < (b.warnAt || 0.8) && b.spent / b.limit >= (b.warnAt || 0.8) && b.spent < b.limit;
  if (b && crossedLimit) {
    const over = b.spent - b.limit;
    return { tone: 'warn', chips: [`sisa anggaran ${b.name.toLowerCase()}`, 'kasih tips hemat'], text: say(v, {
      santai: [`Waduh, anggaran ${b.name} udah lewat ${rp(over)} nih. Sisa siklus ini coba direm dulu ya.`],
      sopan: [`Perlu diperhatikan: anggaran ${b.name} sudah terlampaui ${rp(over)}.`],
      singkat: [`Anggaran ${b.name} lewat ${rp(over)}.`],
      gaul: [`Waduh, anggaran ${b.name} jebol ${rp(over)}. Rem dulu, bro!`],
      barbar: [`Anjir, anggaran ${b.name} lo jebol ${rp(over)}! Rem, bos, rem!`],
    }, turn) };
  }
  if (f.treat && (f.treatCount >= 5 || f.todayCount >= 3)) {
    const w = f.treat, n = f.todayCount >= 3 ? f.todayCount : f.treatCount, when = f.todayCount >= 3 ? 'hari ini' : 'siklus ini';
    const nearBudget = b && b.limit > 0 && b.spent / b.limit >= (b.warnAt || 0.8);
    return { tone: 'warn', chips: nearBudget ? [`sisa anggaran ${b!.name.toLowerCase()}`, 'kasih tips hemat'] : [`bikin anggaran ${w}`, `total ${w} bulan ini`], offer: nearBudget ? undefined : `bikin anggaran ${w}`, text: say(v, {
      santai: [`${cap(w)} lagi? Ini yang ke-${n} ${when}, udah ${rp(f.treatTotal)} lho. Mau kubikinin anggaran ${w} biar ada remnya?`, `Ke-${n} kalinya ${w} ${when} (${rp(f.treatTotal)}). Enak sih, tapi dompetmu juga butuh istirahat. Pasang anggaran ${w}, yuk?`],
      sopan: [`Sekadar mengingatkan, ini ${w} yang ke-${n} ${when} (total ${rp(f.treatTotal)}). Ingin saya bantu membuat anggaran ${w}?`],
      singkat: [`${cap(w)} ke-${n} ${when}: ${rp(f.treatTotal)}.`],
      gaul: [`${cap(w)} lagi?? Ke-${n} ${when}, udah ${rp(f.treatTotal)}. Lo nyetok apa gimana WKWK. Bikin anggaran ${w} yuk?`, `Buset, ${w} ke-${n} (${rp(f.treatTotal)}). Dompet lo minta cuti tuh. Pasang anggaran ${w}?`],
      barbar: [`${cap(w)} LAGI? Ke-${n} ${when}, udah ${rp(f.treatTotal)}. Lo mau kaya apa mau kenyang doang, bos? Bikin anggaran ${w} sini.`, `Anjir, ${w} ke-${n} (${rp(f.treatTotal)}). Gue sita dompet lo nih. Pasang anggaran ${w}, buruan!`],
    }, turn) };
  }
  if (b && crossedWarn) {
    const pct = Math.round(b.spent / b.limit * 100), left = b.limit - b.spent;
    return { tone: 'warn', chips: [`sisa anggaran ${b.name.toLowerCase()}`], text: say(v, {
      santai: [`Anggaran ${b.name} udah ${pct}%, sisa ${rp(left)}. Hati-hati ya.`],
      sopan: [`Anggaran ${b.name} sudah terpakai ${pct}%, tersisa ${rp(left)}.`],
      singkat: [`Anggaran ${b.name}: ${pct}%.`],
      gaul: [`Anggaran ${b.name} udah ${pct}%, sisa ${rp(left)}. Pelan-pelan, bro.`],
      barbar: [`Anggaran ${b.name} lo udah ${pct}%, sisa ${rp(left)}. Jangan kalap, bos.`],
    }, turn) };
  }
  // A big one: from Rp1.000.000, or a quarter of what is still free to spend, or more than is free.
  const big = f.amount >= 1_000_000 || f.free > 0 && f.amount >= 0.25 * (f.free + f.amount) && f.amount >= 200_000 || f.free < 0;
  if (big) return { tone: 'warn', chips: ['sisa uang bebas berapa', 'aman nggak sampai gajian'], text: f.free >= 0 ? say(v, {
    santai: [`Lumayan besar nih, ${rp(f.amount)}. Uang bebas siklus ini tinggal ${rp(f.free)}, jadi sisanya diatur pelan-pelan ya.`, `${rp(f.amount)} keluar sekaligus. Semoga memang perlu ya! Uang bebasmu sekarang ${rp(f.free)}.`],
    sopan: [`Pengeluaran yang cukup besar (${rp(f.amount)}). Uang bebas siklus ini tersisa ${rp(f.free)}.`],
    singkat: [`Besar: ${rp(f.amount)}. Uang bebas ${rp(f.free)}.`],
    gaul: [`Gede juga nih, ${rp(f.amount)}. Uang bebas lo tinggal ${rp(f.free)}, atur napas dulu.`],
    barbar: [`Anjir, ${rp(f.amount)} sekali gesek! Uang bebas lo tinggal ${rp(f.free)}, jangan sok sultan, bos.`],
  }, turn) : say(v, {
    santai: [`Hati-hati, uang bebasmu sekarang minus ${rp(-f.free)}. Mungkin perlu ambil dari tabungan atau rem dulu sampai gajian.`],
    sopan: [`Perlu perhatian: uang bebas Anda kini minus ${rp(-f.free)}.`],
    singkat: [`Uang bebas minus ${rp(-f.free)}.`],
    gaul: [`Waduh, uang bebas lo minus ${rp(-f.free)}. Rem total sampe gajian, bro.`],
    barbar: [`Anjir, uang bebas lo minus ${rp(-f.free)}! Puasa jajan sampe gajian, bos.`],
  }, turn) };
  return null;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** After a comment, a short reply ("iya iya maaf", "hehe iya deh", "janji besok nggak lagi"): taken kindly. */
export const AFTER_COMMENT = /^(?:(?:iya+|iy+a|ya+|oke+|ok+|siap|sip|hehe+|wkwk+|haha+|maaf|sorry|sori|janji|duh|aduh|yaudah|ya\s+udah|hmm+|anjir|astaga|waduh|iya\s+deh|iya\s+iya|bener|betul|khilaf|terakhir|besok|nanti|lagi\s+pengen|abisnya|habisnya|soalnya|namanya\s+juga)\b.*)$/;
export function afterComment(v: Voice, turn: number, offer?: string): { text: string; chips: string[] } {
  return { chips: offer ? [offer, 'kasih tips hemat'] : ['kasih tips hemat', 'ringkasan bulan ini'], text: say(v, {
    santai: ['Santai, yang penting sadar. Pelan-pelan aja ngeremnya.', 'Hehe nggak apa-apa, sesekali boleh kok. Yang penting tercatat.'],
    sopan: ['Tidak apa-apa. Yang terpenting sudah tercatat dan disadari.'],
    singkat: ['Oke. Pelan-pelan aja.'],
    gaul: ['Santuy, yang penting sadar diri wkwk. Pelan-pelan direm.', 'Hehe gapapa, sesekali boleh. Asal jangan tiap hari ya.'],
    barbar: ['Yaudah, gue maafin. Tapi besok jangan lagi lo, bos wkwk.', 'Halah, janji doang lo. Yaudah, pelan-pelan direm.'],
  }, turn) };
}
