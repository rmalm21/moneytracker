/**
 * 10.6 Asisten chat 5.0 — what the master prompt for the financial assistant asked that the rules before did not do.
 * Each reader takes a whole kind of sentence, not one sentence: a simulation ("kalau…", "misalnya…", "andai…"), a wish
 * without a price, a total said in surprise, a feeling about money, a sum to work out, a feature asked about, a friend
 * paying back without an amount, and a record said without its amount (asked for, then finished by the next message).
 *
 * None of them records anything: a record is always a card the person saves with Simpan. What they answer is worked out
 * here from the person's own records (the same numbers as Beranda), never guessed.
 */
import { transactionExpense } from '../accounting.ts';
import { readPeriod } from '../catat/ask.ts';
import { amountWords, findAmounts, walletsIn } from '../quick-entry.ts';
import type { LedgerTx } from '../types';
import type { ChatContext, ChatIntent, ChatMemory, ChatReply, SayLine } from './engine.ts';
import { vo } from './fun.ts';
import type { Voice } from './voice.ts';

/** What the engine knows of this pay cycle (lib/chat/engine.ts `money`). */
export type Facts = { free: number; daily: number; left: number; pace: number; income: number; expenses: number };
/** An answer said in the chat, or a sentence for Catat otomatis (a card to save, never saved here). */
export type Out =
  | { intent: ChatIntent; reply: Extract<ChatReply, { kind: 'say' }>; memory?: Partial<ChatMemory> }
  | { plan: string; intro?: string; intent?: ChatIntent; memory?: Partial<ChatMemory> };

const lower = (s: string) => s.toLocaleLowerCase('id-ID');
const rp = (n: number) => `${n < 0 ? '−' : ''}Rp${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;
const cap = (s: string) => s ? s[0].toLocaleUpperCase('id-ID') + s.slice(1) : s;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const amountsOf = (t: string) => findAmounts(amountWords(lower(t))).filter(a => a.value > 0);
const a0 = (list: { value: number }[]) => list[0]?.value || 0;
const pct = (x: number, digits = 1) => `${(Math.round(x * 100 * 10 ** digits) / 10 ** digits).toLocaleString('id-ID')}%`;
/** An amount as Catat otomatis reads it back ("35rb", "1,5jt", "rp12.500"). */
export function amountWord(n: number) {
  n = Math.round(n);
  return n % 1_000_000 === 0 ? `${n / 1_000_000}jt` : n % 100_000 === 0 && n >= 1_000_000 ? `${String(n / 1_000_000).replace('.', ',')}jt` : n % 1000 === 0 ? `${n / 1000}rb` : `rp${n.toLocaleString('id-ID')}`;
}
const short = (n: number) => n >= 1_000_000 ? `${(Math.round(n / 100_000) / 10).toLocaleString('id-ID')} jt` : n >= 1000 ? `${Math.round(n / 1000).toLocaleString('id-ID')} rb` : rp(n);
const say = (intent: ChatIntent, reply: Omit<Extract<ChatReply, { kind: 'say' }>, 'kind'>, memory?: Partial<ChatMemory>): Out => ({ intent, reply: { kind: 'say', ...reply }, ...(memory ? { memory } : {}) });

const PAST = /\b(?:tadi|td|barusan|udah|udh|sudah|dah|kemarin|kemaren|kmrn|abis|habis|tadinya|semalam|semalem|lusa\s+kemarin)\b/;
const DATE_AHEAD = /\b(?:besok|bsk|lusa|nanti|ntar|minggu\s+depan|pekan\s+depan|bulan\s+depan|tahun\s+depan|tgl\s*\d+|tanggal\s*\d+|akhir\s+bulan|awal\s+bulan|pas\s+gajian|abis\s+gajian|habis\s+gajian)\b/;
const LATER = /\b(?:tahun\s+depan|bulan\s+depan|nanti|suatu\s+hari|someday|kapan[-\s]kapan|akhir\s+tahun|tahun\s+ini)\b/;
const SAVING = /\b(?:nabung|menabung|tabung|nyisihin|sisihin|sisihkan|nyisain|celengan|ngumpulin|ngumpulkan)\b/;
const ME = /\b(?:aku|gue|gua|gw|guwe|saya|ane|w|ku)\b/;

/* ------------------------------------------------------------------ The person's records */

/** The last salary: the newest income in a category named Gaji (not overtime, bonus or allowance). */
export function lastSalary(ctx: ChatContext): number {
  const cat = (id?: string | null) => ctx.data.categories.find(c => c.id === id);
  const salary = ctx.data.transactions.filter(t => {
    if (t.type !== 'income') return false;
    const main = cat(t.categoryId), sub = cat(t.subcategoryId);
    return /^gaji\b|\bgaji\s+(?:bulanan|pokok)\b|^salary$/i.test(sub?.name || '') || /^gaji$/i.test(main?.name || '') && (!sub || /bulanan|pokok/i.test(sub.name));
  }).sort((a, b) => b.date.localeCompare(a.date));
  return salary[0]?.amount || 0;
}
const daysBefore = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
/** Spending on a thing ("kopi", "jajan", "rokok") over the last `days` days: by category name or by what was written. */
function spentOn(ctx: ChatContext, thing: string, days: number) {
  const from = daysBefore(ctx.today, days), re = new RegExp(`\\b${esc(lower(thing))}`, 'i');
  const ids = new Set(ctx.data.categories.filter(c => re.test(lower(c.name))).map(c => c.id));
  let total = 0, count = 0;
  for (const t of ctx.data.transactions) {
    if (t.type !== 'expense' || t.date < from || t.date > ctx.today) continue;
    if (ids.has(t.subcategoryId || '') || ids.has(t.categoryId || '') || re.test(lower(`${t.description ?? ''} ${t.merchant ?? ''}`))) { total += transactionExpense(t); count++; }
  }
  return { total, count, from };
}
/** What was spent in a span of days (end not included). */
function spentBetween(txs: LedgerTx[], start: string, end: string) {
  let total = 0, count = 0;
  for (const t of txs) { if (t.date < start || t.date >= end) continue; const s = transactionExpense(t); if (s > 0) { total += s; count++; } }
  return { total, count };
}

/* ------------------------------------------------------------------ Simulations: "kalau…", "misalnya…", "andai…" */

const WHATIF = /^(?:(?:eh|terus|trus|nah|oke|ok|btw|bro|min|kak|tapi|tp)\s*,?\s+)*(?:kalau|kalo|klo|kl|misal(?:nya|kan)?|andai(?:kan|nya)?|seandainya|umpama(?:nya|kan)?|semisal(?:nya|kan)?|anggap(?:lah|\s+aja)?|bayangin|coba\s+bayangin|(?:gimana|gmn|bagaimana)\s+(?:kalau|kalo|klo|kl|jika|misal))\b/;
const SPAN_DAYS: [RegExp, number, string][] = [
  [/\b(?:setahun|1\s*tahun|satu\s+tahun|per\s*tahun|tiap\s+tahun)\b/, 365, 'setahun'], [/\b(?:sebulan|1\s*bulan|satu\s+bulan|per\s*bulan|tiap\s+bulan)\b/, 30, 'sebulan'],
  [/\b(?:seminggu|sepekan|1\s*minggu|satu\s+minggu|per\s*minggu|tiap\s+minggu)\b/, 7, 'seminggu'],
];
const UNIT = /\b(?:sehari|per\s*hari|tiap\s+hari|setiap\s+hari|perhari)\b/;
const NOT_BUY = /\b(?:nggak|gak|ga|g|tidak|tdk|ngga|enggak|engga|kagak|tanpa|stop|berhenti|skip|libur)\s+(?:beli|jajan|ngopi|minum|makan|pesan|pesen|order|ngerokok|merokok|nge-?gojek|gofood|grabfood|belanja|checkout|nonton)?\s*([\p{L}]+(?:\s+[\p{L}]+)?)?/u;
const CUT = /\b(?:kurangin|ngurangin|kurangi|mengurangi|hemat(?:in)?|potong)\s+(?:jajan|ngopi|kopi|makan|belanja|rokok|jajannya|pengeluaran|gofood|ojol)?/;
const BUY_VERB = /\b(?:beli|bayar|jajan|belanja|checkout|co|ambil|pesan|pesen|order|keluar(?:in)?|pake|pakai|habisin|abisin|ngeluarin)\b/;

function freeAfter(facts: Facts, amount: number, v: Voice, what: string) {
  const after = facts.free - amount, daily = after / Math.max(1, facts.left);
  const text = vo(v, {
    santai: after >= 0 ? `Kalau ${what} ${rp(amount)}, uang bebasmu tinggal ${rp(after)} (sekarang ${rp(facts.free)}). Sisa ${facts.left} hari sampai gajian, jadi jatahnya sekitar ${rp(daily)}/hari. Ini cuma simulasi, nggak kucatat.` : `Kalau ${what} ${rp(amount)}, uang bebasmu kurang ${rp(-after)} (sekarang cuma ${rp(facts.free)}). Mending tunggu gajian atau sisihkan dulu. Ini cuma simulasi, nggak kucatat.`,
    sopan: after >= 0 ? `Bila ${what} ${rp(amount)}, uang bebas Anda tersisa ${rp(after)} (saat ini ${rp(facts.free)}), atau sekitar ${rp(daily)}/hari untuk ${facts.left} hari ke gajian. Ini hanya simulasi dan tidak dicatat.` : `Bila ${what} ${rp(amount)}, uang bebas Anda kurang ${rp(-after)} (saat ini ${rp(facts.free)}). Ini hanya simulasi dan tidak dicatat.`,
    gaul: after >= 0 ? `Kalo ${what} ${rp(amount)}, duit bebas lo sisa ${rp(after)} (sekarang ${rp(facts.free)}), ±${rp(daily)}/hari sampe gajian. Cuma simulasi, gak gue catet.` : `Kalo ${what} ${rp(amount)}, duit bebas lo minus ${rp(-after)} (sekarang ${rp(facts.free)}). Tahan dulu, bro. Cuma simulasi, gak gue catet.`,
    singkat: after >= 0 ? `Sisa uang bebas ${rp(after)} (±${rp(daily)}/hari). Tidak dicatat.` : `Kurang ${rp(-after)}. Tidak dicatat.`,
  });
  return { after, text, hero: { label: 'Sisa uang bebas', value: rp(after), note: `${facts.left} hari ke gajian`, tone: after >= 0 ? 'good' as const : 'warn' as const }, stats: [{ label: 'Uang bebas sekarang', value: rp(facts.free) }, { label: `Setelah ${what}`, value: rp(after), tone: after >= 0 ? 'good' as const : 'warn' as const }] };
}

/** "kalau gue beli headset 400rb sisa duit gue berapa", "misalnya gaji naik 10 persen", "andai nggak beli kopi sebulan",
 * "kalau besok top up 100rb gimana", "gimana kalau kurangin jajan 10rb sehari": worked out, never recorded. */
export function readWhatIf(t: string, ctx: ChatContext, v: Voice, facts: Facts): Out | null {
  if (!WHATIF.test(t)) return null;
  // "kalau ga salah tadi bayar listrik 300rb": "if I'm not wrong", a record; "kalo tadi pagi beli…" tells what happened.
  if (/^(?:kalau|kalo|klo|kl)\s+(?:ga|gak|nggak|ngga|enggak|tidak|tdk|g)\s+salah\b/.test(t)) return null;
  if (PAST.test(t.replace(/\bjadi(?:nya)?\b/g, ' ')) && !NOT_BUY.test(t) && !/\b(?:sisa|tersisa|berapa|brp|gimana|aman|cukup)\b/.test(t)) return null;
  // Saving sums ("kalau nabung 500rb sebulan…") have their own reader (lib/chat/answers.ts readSaving).
  if (SAVING.test(t) && !CUT.test(t)) return null;
  const body = t.replace(WHATIF, ' ').replace(/\s+/g, ' ').trim(), amounts = amountsOf(body);
  // A pay rise or cut: "gaji gue naik 10 persen", "kalau gaji naik 500rb".
  const raise = body.match(/\b(?:gaji|gajian|penghasilan|pendapatan|income|pemasukan)(?:ku|mu|nya)?\b.*?\b(naik|nambah|bertambah|turun|dipotong|berkurang|dikurangi)\b(?:\s+(?:jadi\s+)?)?(?:(\d+(?:[.,]\d+)?)\s*(?:%|persen))?/);
  if (raise) {
    const base = lastSalary(ctx) || facts.income;
    if (!base) return say('calc', { card: 'calc', title: 'Simulasi gaji', text: vo(v, { santai: 'Aku belum nemu catatan gajimu, jadi belum bisa kuhitung. Sebut aja gajinya, misalnya “kalau gaji 6jt naik 10%”.', sopan: 'Catatan gaji Anda belum ditemukan. Silakan sebutkan nominalnya, misalnya “kalau gaji 6jt naik 10%”.', gaul: 'Gue belum nemu catatan gaji lo. Sebut aja, misal “kalau gaji 6jt naik 10%”.', singkat: 'Sebut gajinya dulu, misalnya “gaji 6jt naik 10%”.' }) });
    const up = !/turun|dipotong|berkurang|dikurangi/.test(raise[1]), p = raise[2] ? Number(raise[2].replace(',', '.')) / 100 : 0;
    const delta = p ? base * p : amounts.find(a => a.value !== base)?.value || 0;
    if (!delta) return null;
    const next = base + (up ? delta : -delta);
    const text = vo(v, {
      santai: `Gaji terakhirmu ${rp(base)}. Kalau ${up ? 'naik' : 'turun'} ${p ? `${pct(p, 0)}` : rp(delta)}, jadi ${rp(next)} (${up ? '+' : '−'}${rp(delta)} sebulan). ${up ? `Kalau tambahannya langsung ditabung, setahun kekumpul ${rp(delta * 12)}.` : `Biar aman, pengeluaran bulanan perlu turun sekitar ${rp(delta)}.`} Ini simulasi, nggak kucatat.`,
      sopan: `Gaji terakhir Anda ${rp(base)}. Bila ${up ? 'naik' : 'turun'} ${p ? pct(p, 0) : rp(delta)}, menjadi ${rp(next)} (${up ? '+' : '−'}${rp(delta)} per bulan).${up ? ` Bila selisihnya ditabung, terkumpul ${rp(delta * 12)} dalam setahun.` : ''} Ini simulasi dan tidak dicatat.`,
      gaul: `Gaji terakhir lo ${rp(base)}. Kalo ${up ? 'naik' : 'turun'} ${p ? pct(p, 0) : rp(delta)}, jadi ${rp(next)} (${up ? '+' : '−'}${rp(delta)}/bulan). ${up ? `Tabung aja tambahannya, setahun dapet ${rp(delta * 12)}.` : `Kudu ngerem ±${rp(delta)}/bulan.`} Cuma simulasi.`,
      singkat: `${rp(base)} → ${rp(next)} (${up ? '+' : '−'}${rp(delta)}/bulan).`,
    });
    return say('calc', { card: 'calc', title: 'Simulasi gaji', text, hero: { label: 'Gaji jadi', value: rp(next), note: `${up ? '+' : '−'}${rp(delta)} per bulan`, tone: up ? 'good' : 'warn' }, stats: [{ label: 'Gaji terakhir', value: rp(base) }, { label: up ? 'Tambahan setahun' : 'Berkurang setahun', value: rp(delta * 12) }], tone: 'info', chips: ['bantu atur gaji gue', 'berapa yang harus gue sisihin tiap bulan?'], why: `Gaji terakhir diambil dari pemasukan terbaru berkategori Gaji. ${p ? `${pct(p, 0)} × ${rp(base)} = ${rp(delta)}.` : ''}` }, { last: 'calc', number: next });
  }
  // Spending cut by an amount a day: "kurangin jajan 10rb sehari".
  if (CUT.test(body) && amounts.length === 1) {
    const a = amounts[0].value, perDay = UNIT.test(body) ? a : /\b(?:seminggu|per\s*minggu|tiap\s+minggu)\b/.test(body) ? a / 7 : /\b(?:sebulan|per\s*bulan|tiap\s+bulan)\b/.test(body) ? a / 30 : a;
    const week = perDay * 7, month = perDay * 30, year = perDay * 365;
    return say('calc', { card: 'calc', title: 'Kalau dikurangi', text: vo(v, {
      santai: `Hemat ${rp(perDay)} sehari itu lumayan: ${rp(week)} seminggu, ${rp(month)} sebulan, ${rp(year)} setahun. Mau dijadiin target tabungan?`,
      sopan: `Penghematan ${rp(perDay)} per hari setara ${rp(week)} per minggu, ${rp(month)} per bulan, dan ${rp(year)} per tahun.`,
      gaul: `Ngirit ${rp(perDay)}/hari = ${rp(week)} seminggu, ${rp(month)} sebulan, ${rp(year)} setahun. Gas jadiin tabungan?`,
      singkat: `${rp(week)}/minggu · ${rp(month)}/bulan · ${rp(year)}/tahun.`,
    }), hero: { label: 'Hemat sebulan', value: rp(month), tone: 'good' }, stats: [{ label: 'Seminggu', value: rp(week) }, { label: 'Setahun', value: rp(year) }], tone: 'info', chips: [`target tabungan ${amountWord(month * 12)}`, 'kasih tips hemat'] }, { last: 'calc', number: month });
  }
  // Not buying something for a while: "andai gue nggak beli kopi selama sebulan".
  const skip = body.match(NOT_BUY);
  if (skip && !amounts.length && skip[1] && !/^(?:jadi|usah|bisa|ada|punya|apa|apa2|apa-apa)\b/.test(skip[1])) {
    const verbThing: Record<string, string> = { ngerokok: 'rokok', merokok: 'rokok', ngopi: 'kopi', jajan: 'jajan', nonton: 'nonton', gofood: 'gofood', grabfood: 'grabfood', belanja: 'belanja', 'nge-gojek': 'gojek', ngegojek: 'gojek' };
    const verb = body.match(/\b(ngerokok|merokok|ngopi|jajan|nonton|gofood|grabfood|belanja|nge-?gojek)\b/)?.[1];
    const tail = skip[1].replace(/\b(?:lagi|selama|sama\s+sekali|dulu|dong|ya|sih|deh|nih|tiap|setiap|seminggu|sebulan|setahun|sepekan|hemat|berapa|brp|bisa|jadi|kira-kira)\b.*$/, '').trim();
    const thing = tail || (verb ? verbThing[verb.replace('-', '')] || verb : '');
    if (!thing) return null;
    const span = SPAN_DAYS.find(([re]) => re.test(body)) || SPAN_DAYS[1];
    const seen = spentOn(ctx, thing, 30);
    if (!seen.count) return say('calc', { card: 'calc', title: `Tanpa ${thing}`, text: vo(v, { santai: `Di 30 hari terakhir belum ada catatan ${thing}, jadi belum ada yang bisa dihemat dari situ. Kalau biasanya beli ${thing} tapi belum dicatat, catat dulu beberapa kali biar kelihatan polanya.`, sopan: `Dalam 30 hari terakhir belum ada catatan ${thing}, sehingga penghematannya belum dapat dihitung.`, gaul: `30 hari terakhir gak ada catatan ${thing}, jadi gak ada yang dihemat. Catet dulu kalo emang suka beli.`, singkat: `Belum ada catatan ${thing} 30 hari terakhir.` }) });
    const saved = seen.total / 30 * span[1];
    return say('calc', { card: 'calc', title: `Tanpa ${thing} ${span[2]}`, text: vo(v, {
      santai: `30 hari terakhir kamu ${seen.count} kali beli ${thing}, total ${rp(seen.total)}. Kalau ${span[2]} nggak beli, kira-kira hemat ${rp(saved)}. Ini simulasi dari catatanmu, nggak ada yang kucatat.`,
      sopan: `Dalam 30 hari terakhir tercatat ${seen.count} kali pembelian ${thing}, total ${rp(seen.total)}. Tanpa ${thing} ${span[2]}, perkiraan penghematannya ${rp(saved)}.`,
      gaul: `30 hari terakhir lo ${seen.count}x beli ${thing}, total ${rp(seen.total)}. Stop ${span[2]} = hemat ±${rp(saved)}. Simulasi doang.`,
      singkat: `Hemat ±${rp(saved)} ${span[2]} (dari ${rp(seen.total)}/30 hari).`,
    }), hero: { label: `Hemat ${span[2]}`, value: rp(saved), tone: 'good' }, stats: [{ label: `${cap(thing)} 30 hari terakhir`, value: rp(seen.total) }, { label: 'Berapa kali', value: `${seen.count}×` }], tone: 'info', chips: ['kasih tips hemat', `pengeluaran ${thing} bulan ini`], why: `Pengeluaran ${thing} dari ${seen.from} sampai hari ini dibagi 30 hari, dikali ${span[1]} hari.` }, { last: 'calc', number: saved });
  }
  if (!amounts.length) return null;
  const a = amounts[0].value;
  // So much each day (week, month) for a while: "misal jajan boba 25rb tiap hari seminggu habis berapa", "misalkan tiap
  // minggu jajan 50rb, sebulan abis berapa" (four weeks in a month, 52 in a year).
  const per = /\b(?:sehari|per\s*hari|tiap\s+hari|setiap\s+hari|perhari)\b/.test(body) ? 1 : /\b(?:per\s*minggu|tiap\s+minggu|setiap\s+minggu|seminggu\s+sekali|perminggu)\b/.test(body) ? 7 : /\b(?:per\s*bulan|tiap\s+bulan|setiap\s+bulan|sebulan\s+sekali|perbulan)\b/.test(body) ? 30 : 0;
  const rest = body.replace(/\b(?:sehari|per\s*hari|tiap\s+hari|setiap\s+hari|perhari|per\s*minggu|tiap\s+minggu|setiap\s+minggu|seminggu\s+sekali|perminggu|per\s*bulan|tiap\s+bulan|setiap\s+bulan|sebulan\s+sekali|perbulan)\b/g, ' ');
  const span = SPAN_DAYS.find(([re]) => re.test(rest)), nDays = rest.match(/\b(\d{1,3})\s*(hari|minggu|pekan|bulan)\b/);
  if (per && (span || nDays) && amounts.length === 1) {
    const days = nDays ? Number(nDays[1]) * (nDays[2] === 'hari' ? 1 : nDays[2] === 'bulan' ? 30 : 7) : span![1], label = nDays ? `${nDays[1]} ${nDays[2]}` : span![2];
    const times = per === 1 ? days : per === 7 ? (days === 365 ? 52 : days === 30 ? 4 : Math.round(days / 7)) : (days === 365 ? 12 : Math.max(1, Math.round(days / 30)));
    const each = a0(amounts), total = each * times, unit = per === 1 ? 'hari' : per === 7 ? 'minggu' : 'bulan';
    return say('calc', { card: 'calc', title: `Kalau tiap ${unit}`, text: vo(v, { santai: `${rp(each)} tiap ${unit} selama ${label} (${times}×) jadi ${rp(total)}. Itu ${facts.free > 0 ? `${pct(total / facts.free, 0)} dari uang bebasmu sekarang (${rp(facts.free)})` : 'di luar uang bebasmu yang sekarang habis'}. Cuma simulasi, nggak kucatat.`, sopan: `${rp(each)} per ${unit} selama ${label} (${times}×) menjadi ${rp(total)}. Ini simulasi dan tidak dicatat.`, gaul: `${rp(each)} tiap ${unit} ${label} (${times}×) = ${rp(total)}. Simulasi doang, gak gue catet.`, singkat: `${rp(total)}.` }), hero: { label: `Total ${label}`, value: rp(total) }, tone: 'info', chips: ['kasih tips hemat'], why: `${rp(each)} × ${times} = ${rp(total)}.` }, { last: 'calc', number: total });
  }
  // A top-up or transfer between one's own wallets: the free money stays.
  if (/\b(?:top\s?up|topup|isi\s+saldo|transfer|tf|pindahin|pindah|tarik\s+tunai|narik)\b/.test(body) && !/\b(?:ke|buat|untuk)\s+(?!gopay|ovo|dana|shopeepay|jago|bca|bri|mandiri|bni|jenius|krom|cash|tunai)\p{L}+\b.*\b(?:bayar|beli)\b/u.test(body)) {
    return say('calc', { card: 'calc', title: 'Kalau dipindah', text: vo(v, {
      santai: `Top up atau transfer antar dompetmu cuma mindahin saldo, jadi uang bebasmu tetap ${rp(facts.free)}. Dompet asal berkurang ${rp(a)}, dompet tujuan nambah ${rp(a)}. Ini masih rencana, jadi belum kucatat. Kalau udah dilakukan, bilang misalnya “top up gopay ${amountWord(a)} dari jago”.`,
      sopan: `Top up atau transfer antardompet hanya memindahkan saldo, sehingga uang bebas Anda tetap ${rp(facts.free)}. Karena masih rencana, belum saya catat.`,
      gaul: `Top up mah cuma mindahin saldo, duit bebas lo tetep ${rp(facts.free)}. Masih rencana, gak gue catet. Kalo udah, bilang aja “top up gopay ${amountWord(a)} dari jago”.`,
      singkat: `Uang bebas tetap ${rp(facts.free)}. Belum dicatat.`,
    }), hero: { label: 'Uang bebas', value: rp(facts.free), note: 'tidak berubah', tone: 'good' }, tone: 'info', chips: [`top up gopay ${amountWord(a)} dari jago`, 'saldo semua dompet berapa'] });
  }
  // Money that would come in: "seandainya bonus gue 2jt", "kalau dapet thr 3jt".
  if (/\b(?:bonus|thr|gaji|gajian|dapet|dapat|terima|cuan|untung|menang|hadiah|warisan|cashback|komisi|insentif)\b/.test(body) && !BUY_VERB.test(body)) {
    const next = facts.free + a;
    return say('calc', { card: 'calc', title: 'Kalau dapat uang', text: vo(v, {
      santai: `Kalau dapat ${rp(a)}, uang bebasmu jadi ${rp(next)}. Saran: sisihin dulu sebagian (misalnya ${rp(a * 0.5)} ke tabungan atau Dana Darurat), baru sisanya dipakai. Ini masih andai-andai, jadi belum kucatat.`,
      sopan: `Bila menerima ${rp(a)}, uang bebas Anda menjadi ${rp(next)}. Disarankan menyisihkan sebagian terlebih dahulu. Ini masih perkiraan dan belum dicatat.`,
      gaul: `Kalo dapet ${rp(a)}, duit bebas lo jadi ${rp(next)}. Tabung setengahnya dulu (${rp(a * 0.5)}), baru sisanya buat senang-senang. Masih andai-andai, gak gue catet.`,
      singkat: `Uang bebas jadi ${rp(next)}. Belum dicatat.`,
    }), hero: { label: 'Uang bebas jadi', value: rp(next), tone: 'good' }, tone: 'info', chips: ['bantu atur gaji gue', 'berapa yang harus gue sisihin tiap bulan?'] }, { last: 'calc', number: next });
  }
  // A purchase: what the free money would be after it.
  if (BUY_VERB.test(body) || /\b(?:sisa|tersisa|tinggal|masih)\b/.test(body)) {
    const thing = body.replace(/\b(?:hari|minggu|bulan|tahun)\s+(?:ini|depan)\b|\b(?:besok|lusa|nanti|aman|ga|gak|nggak|kah|apa|enggak|gimana|gmn)\b/g, ' ').replace(/\b(?:aku|gue|gua|gw|saya|ane|w|beli|bayar|jajan|belanja|checkout|ambil|pesan|pesen|order|pake|pakai|terus|trus|sisa|tersisa|tinggal|masih|duit|uang|berapa|brp|jadi|gimana|ya|dong|sih|deh|nih)\b/g, ' ').replace(amounts[0].text, ' ').replace(/[?,.!]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
    const f = freeAfter(facts, a, v, thing ? `beli ${thing}` : 'keluar');
    return say('afford', { card: 'afford', title: thing ? `Kalau beli ${thing}` : 'Simulasi', text: f.text, hero: f.hero, stats: f.stats, tone: f.after >= 0 ? 'info' : 'warn', chips: [`catat beli ${thing || 'barang'} ${amountWord(a)}`, 'kasih tips hemat'] }, { last: 'calc', number: f.after });
  }
  return null;
}

/* ------------------------------------------------------------------ Wishes and plans */

const WISH = /\b(?:pengen|pengin|pingin|kepengen|kepingin|ingin|pgn|mau|lagi\s+pengen)\b(?:\s+(?:banget|bgt|sih|deh|nih|juga|sekali|bngt))*\s+(?:beli|ganti|punya|borong|ngeborong|beliin|upgrade|nambah|ambil|checkout|co)\b/;
const HYPERBOLE = /\b(?:semua|semuanya|seisi|isi)\s+(?:isi\s+)?(?:mall|mal|toko|dunia|indomaret|alfamart|shopee|tokopedia|tokped|pasar|supermarket|online\s?shop)\b|\bborong\s+semua\b/;
function wishThing(t: string) {
  const m = t.match(/\b(?:beli|ganti|punya|borong|ngeborong|beliin|upgrade|nambah|ambil|checkout)\s+(.+)$/);
  return (m?.[1] || '').replace(/\b(?:lagi|dong|nih|sih|deh|ya|yah|banget|bgt|baru|yang|yg|itu|ini|gitu|sekarang|aja|juga|gue|gw|aku|wkwk\w*|haha\w*)\b/g, ' ').replace(/[?.!,]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
}
/** "gue pengen beli sepatu lagi", "pengen banget ganti hp", "rasanya pengen beli semua isi mall": a wish, not spending. */
export function readWish(t: string, ctx: ChatContext, v: Voice, facts: Facts): Out | null {
  if (!WISH.test(t) || amountsOf(t).length || PAST.test(t) || LATER.test(t) || DATE_AHEAD.test(t)) return null;
  if (/\b(?:catat|catet|catetin|catatin|masukin|tambahin|tambah)\b.*\b(?:wish\s?list|keinginan|impian)\b/.test(t)) return null;
  if (HYPERBOLE.test(t)) return say('banter', { card: 'talk', text: vo(v, {
    santai: `Hahaha, siapa yang nggak pengen 😆 Tapi dompetnya protes nih: uang bebasmu sekarang ${rp(facts.free)}, sekitar ${rp(facts.daily)}/hari sampai gajian. Pilih satu yang paling pengen, masukin Wish list, nanti kita cek kapan aman belinya.`,
    sopan: `Keinginan yang wajar. Saat ini uang bebas Anda ${rp(facts.free)} (sekitar ${rp(facts.daily)}/hari sampai gajian). Sebaiknya pilih satu yang paling diinginkan dan masukkan ke Wish list.`,
    gaul: `WKWK sama, bro. Tapi realitanya duit bebas lo ${rp(facts.free)}, ±${rp(facts.daily)}/hari sampe gajian. Pilih satu aja, masukin Wish list dulu.`,
    singkat: `Uang bebas ${rp(facts.free)}. Pilih satu, masukkan Wish list.`,
  }), chips: ['buka wishlist', 'kasih tips hemat'] });
  const thing = wishThing(t) || 'barang itu';
  if (/^(?:dompet|rekening|rek|kategori|anggaran|budget|target|tujuan|pengingat|reminder|transaksi|catatan|akun|kartu|tema|pin|password|fitur|wishlist|wish\s?list)\b/.test(thing)) return null;
  return say('goal', { card: 'goal', title: `Pengen ${thing}`, text: vo(v, {
    santai: `Pengen ${thing}? Wajar kok. Uang bebasmu sekarang ${rp(facts.free)} (±${rp(facts.daily)}/hari sampai gajian). Harganya kira-kira berapa? Bilang misalnya “aman nggak beli ${thing} 500rb?”, nanti kucek. Biar nggak impulsif, bisa juga masuk Wish list dulu.`,
    sopan: `Ingin membeli ${thing}? Uang bebas Anda saat ini ${rp(facts.free)}. Berapa kira-kira harganya? Saya bisa memeriksa apakah aman, atau memasukkannya ke Wish list terlebih dahulu.`,
    gaul: `Pengen ${thing}? Santai. Duit bebas lo ${rp(facts.free)} (±${rp(facts.daily)}/hari). Harganya berapa? Bilang aja “aman gak beli ${thing} 500rb?”, gue cek. Atau masukin Wish list dulu biar gak kalap.`,
    singkat: `Uang bebas ${rp(facts.free)}. Harganya berapa?`,
  }), hero: { label: 'Uang bebas sekarang', value: rp(facts.free), note: `±${rp(facts.daily)}/hari`, tone: facts.free > 0 ? 'good' : 'warn' }, chips: [`aman nggak beli ${thing} 500rb?`, `masukin wishlist ${thing}`, 'kasih tips hemat'] }, { item: thing });
}

/** "gue mau beli HP 5 juta" (no date, not bought yet): a plan to think through, not spending. "Tapi yang 4 juta juga
 * bagus" changes the price; "kalau nabung 500rb tiap bulan?" is then worked out from it (readSaving, with `saving`). */
export function readPlannedBuy(t: string, ctx: ChatContext, v: Voice, facts: Facts, memory: ChatMemory): Out | null {
  const amounts = amountsOf(t);
  const again = memory.want && amounts.length === 1 && t.split(' ').length <= 9 && /^(?:(?:tapi|tp|eh|kalau|kalo|klo|atau|ato|terus|trus)\s+)*(?:(?:yang|yg)\s+)/.test(t) && !BUY_VERB.test(t.replace(/^(?:\S+\s+){0,3}/, ''));
  const fresh = !again && amounts.length === 1 && !SAVING.test(t) && !/\bpunya\s+(?:duit|uang|dana|tabungan)?\s*(?:rp\.?\s*)?\d/.test(t) && /\b(?:mau|pengen|pengin|pingin|kepengen|ingin|rencana(?:nya)?|berencana|niat(?:nya)?|planning)\s+(?:beli|ganti|ambil|ngambil|upgrade|punya)\b|\b(?:ngincer|ngincar|naksir|ngidam|ngiler)\s+\p{L}/u.test(t) && !PAST.test(t) && !DATE_AHEAD.test(t);
  if (!again && !fresh) return null;
  if (fresh && amounts[0].value < 300_000 && !/\b(?:ngincer|ngincar|naksir|ngidam|ngiler)\b/.test(t)) {
    const a = amounts[0].value, what = wishThing(t.replace(amounts[0].text, ' ')) || 'itu', ok = facts.free >= a;
    return say('afford', { card: 'afford', text: vo(v, {
      santai: `Oke, mau beli ${what} ${rp(a)}. ${ok ? `Aman, uang bebasmu masih ${rp(facts.free)}.` : `Hati-hati, uang bebasmu tinggal ${rp(facts.free)}.`} Belum kucatat karena belum kebeli. Kalau udah, ketuk tombol di bawah.`,
      sopan: `Baik, rencana membeli ${what} ${rp(a)}. ${ok ? `Uang bebas Anda ${rp(facts.free)}, masih aman.` : `Uang bebas Anda tinggal ${rp(facts.free)}.`} Belum dicatat karena belum terjadi.`,
      gaul: `Sip, mau beli ${what} ${rp(a)}. ${ok ? `Aman, duit bebas lo ${rp(facts.free)}.` : `Duit bebas lo tinggal ${rp(facts.free)}, hati-hati.`} Belum gue catet, kalo udah kebeli tap tombol di bawah.`,
      singkat: `${ok ? 'Aman' : 'Mepet'}. Belum dicatat.`,
    }), chips: [`beli ${what} ${amountWord(a)}`, 'kasih tips hemat'] }, { item: what });
  }
  const price = amounts[0].value, eyed = t.replace(amounts[0].text, ' ').match(/\b(?:ngincer|ngincar|naksir|ngidam|ngiler)\s+(.+)$/)?.[1];
  const thing = again ? memory.want!.thing : wishThing(eyed ? `beli ${eyed}` : t.replace(amounts[0].text, ' ')) || 'barang itu';
  const ok = facts.free >= price, months = [3, 6, 12].map(n => ({ n, per: Math.ceil(price / n / 1000) * 1000 }));
  const lead = again ? vo(v, { santai: `Oke, yang ${rp(price)}.`, sopan: `Baik, yang ${rp(price)}.`, gaul: `Oke, yang ${rp(price)}.`, singkat: `${rp(price)}:` }) : vo(v, { santai: `${cap(thing)} ${rp(price)} ya.`, sopan: `${cap(thing)} seharga ${rp(price)}.`, gaul: `${cap(thing)} ${rp(price)}, noted.`, singkat: `${cap(thing)} ${rp(price)}:` });
  const text = `${lead} ${vo(v, {
    santai: ok ? `Uang bebasmu sekarang ${rp(facts.free)}, jadi kebeli, tapi sisanya tinggal ${rp(facts.free - price)} sampai gajian.` : `Uang bebasmu sekarang ${rp(facts.free)}, masih kurang ${rp(price - facts.free)}.`,
    sopan: ok ? `Uang bebas Anda ${rp(facts.free)}, cukup, dengan sisa ${rp(facts.free - price)} sampai gajian.` : `Uang bebas Anda ${rp(facts.free)}, masih kurang ${rp(price - facts.free)}.`,
    gaul: ok ? `Duit bebas lo ${rp(facts.free)}, kebeli sih, tapi sisa ${rp(facts.free - price)} doang sampe gajian.` : `Duit bebas lo ${rp(facts.free)}, kurang ${rp(price - facts.free)}.`,
    singkat: ok ? `Cukup, sisa ${rp(facts.free - price)}.` : `Kurang ${rp(price - facts.free)}.`,
  })} ${vo(v, { santai: `Kalau mau nabung dulu: ${months.map(m => `${m.n} bulan ${rp(m.per)}/bln`).join(', ')}. Belum kucatat apa-apa.`, sopan: `Bila menabung dahulu: ${months.map(m => `${m.n} bulan ${rp(m.per)}/bulan`).join(', ')}. Belum ada yang dicatat.`, gaul: `Mau nabung dulu? ${months.map(m => `${m.n} bln ${rp(m.per)}`).join(', ')}. Belum gue catet apa-apa.`, singkat: months.map(m => `${m.n} bln ${rp(m.per)}`).join(' · ') })}`;
  return say('goal', { card: 'goal', title: `Rencana beli ${thing}`, text, hero: { label: 'Harga', value: rp(price), note: ok ? 'uang bebas cukup' : `kurang ${rp(price - facts.free)}`, tone: ok ? 'good' : 'warn' }, stats: months.map(m => ({ label: `Nabung ${m.n} bulan`, value: `${rp(m.per)}/bln` })), tone: 'info', chips: ['kalau nabung 500rb tiap bulan?', `bikin tujuan dana ${thing} ${amountWord(price)}`, `masukin wishlist ${thing} ${amountWord(price)}`] },
    { want: { thing, price }, saving: { target: price }, item: thing });
}

/* ------------------------------------------------------------------ Totals said in surprise, and money that came back */

const EXCLAIM = /^(?:(?:buset|busett|busyet|gila|gile|gilak|anjir|anjay|anjrit|astaga|astagfirullah|astaghfirullah|waduh|wadaw|wah|weh|duh|aduh|parah|ya\s+ampun|yaampun|ampun|edan|mampus|alamak|omg|wtf|anjim|njir|cuy)\b[\s,!.]*)+/;
const SPENT_VERB = /\b(?:abis|habis|keluar|kepake|kepakai|terpakai|ludes|boncos|tekor|ngabisin|ngeluarin|jebol|bocor)\b/;
/** "buset abis 200rb hari ini", "gila minggu ini udah keluar sejuta lebih": a total said in surprise. What is recorded for
 * that span is told, and what may be missing; nothing is recorded from it. */
export function readSpentTotal(t: string, ctx: ChatContext, v: Voice): Out | null {
  const amounts = amountsOf(t);
  if (amounts.length !== 1 || !SPENT_VERB.test(t)) return null;
  const period = readPeriod(t, ctx.today, ctx.salaryDay);
  if (!period || !(EXCLAIM.test(t) || /\b(?:lebih|an|lebihan|udah|sudah|dah|kayaknya|sepertinya|kira-kira|kira2|kurang\s+lebih|sekitar|hampir|nyaris)\b/.test(t))) return null;
  const ins = ctx.inspect(t);
  if (ins.reading === 'record' && (ins.categoryId || ins.subcategoryId)) return null;
  const said = amounts[0].value, end = period.end > ctx.today ? daysBefore(ctx.today, -1) : period.end;
  const got = spentBetween(ctx.data.transactions, period.start, end), gap = said - got.total;
  const text = vo(v, {
    santai: `Yang tercatat ${period.label}: ${rp(got.total)} dari ${got.count} catatan. ${gap > 0 ? `Berarti ada sekitar ${rp(gap)} yang belum dicatat. Mau dicatat? Tulis rinciannya, misalnya “makan 50rb, bensin 30rb”.` : 'Udah cocok sama catatanmu, aman.'}`,
    sopan: `Tercatat ${period.label}: ${rp(got.total)} dari ${got.count} transaksi. ${gap > 0 ? `Ada sekitar ${rp(gap)} yang belum tercatat. Silakan tulis rinciannya bila ingin dicatat.` : 'Sudah sesuai dengan catatan Anda.'}`,
    gaul: `Yang kecatet ${period.label}: ${rp(got.total)} (${got.count} catatan). ${gap > 0 ? `Ada ±${rp(gap)} yang belum lo catet. Tulis aja rinciannya, misal “makan 50rb, bensin 30rb”.` : 'Udah pas sama catatan lo.'}`,
    singkat: `Tercatat ${rp(got.total)}${gap > 0 ? `, kurang ${rp(gap)}` : ''}.`,
  });
  return say('summary', { card: 'summary', title: `Pengeluaran ${period.label}`, text, hero: { label: `Tercatat ${period.label}`, value: rp(got.total), note: `${got.count} catatan` }, ...(gap > 0 ? { stats: [{ label: 'Kamu bilang', value: rp(said) }, { label: 'Belum tercatat', value: rp(gap), tone: 'warn' as const }] } : {}), chips: [`rincian pengeluaran ${period.label}`, 'catat pengeluaran'] }, { question: `pengeluaran ${period.label} berapa`, last: 'question' });
}
/** "tadi salah transfer terus uangnya balik": nothing changed, nothing to record. */
export function readReturned(t: string, v: Voice): Out | null {
  if (amountsOf(t).length || !/\b(?:salah\s+(?:transfer|tf|kirim|bayar|top\s?up)|kirim\s+salah|transfer\s+salah|kesalahan\s+transfer|refund\s+penuh|dibatalin|dibatalkan|batal)\b/.test(t) || !/\b(?:balik|kembali|dikembaliin|dikembalikan|dibalikin|balikin|refund|direfund|masuk\s+lagi|udah\s+balik)\b/.test(t)) return null;
  return say('clarify', { card: 'talk', text: vo(v, {
    santai: 'Kalau uangnya udah balik utuh, saldo kamu nggak berubah, jadi nggak perlu dicatat apa-apa. Tapi kalau transfer yang salah itu sempat kecatat, hapus aja catatannya biar saldonya cocok. Kalau baliknya kurang (kena biaya), catat selisihnya sebagai biaya admin.',
    sopan: 'Bila dananya sudah kembali utuh, saldo tidak berubah sehingga tidak perlu dicatat. Bila transfer tersebut sempat tercatat, silakan hapus catatannya. Bila kembali kurang, catat selisihnya sebagai biaya admin.',
    gaul: 'Kalo duitnya udah balik full, saldo lo gak berubah, gak usah dicatet. Kalo transfernya sempet kecatet, hapus aja. Kalo baliknya kurang, catet selisihnya jadi biaya admin.',
    singkat: 'Uang balik utuh = tidak perlu dicatat. Kalau sempat tercatat, hapus.',
  }), chips: ['hapus transaksi terakhir', 'biaya admin 2500'] });
}
/** "gua kagak jadi beli sepatu" with no amount and nothing waiting: nothing recorded. */
export function readSkipped(t: string, v: Voice): Out | null {
  const m = t.match(/\b(?:nggak|gak|ga|g|kagak|tidak|tdk|ngga|enggak|engga|batal|urung|cancel)\s+(?:jadi\s+)?(?:beli|belanja|checkout|co|ambil|pesan|pesen|order|bayar)\s+(.+)$/);
  if (!m || amountsOf(t).length || !/\bjadi\b|\bbatal\b|\bcancel\b|\burung\b/.test(t)) return null;
  const thing = m[1].replace(/\b(?:deh|dong|ya|sih|nih|aja|kok|wkwk\w*|soalnya.*|karena.*|krn.*)\b/g, ' ').replace(/[?.!,]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
  return say('cancel', { card: 'talk', text: vo(v, {
    santai: `Oke, ${thing || 'itu'} nggak jadi dibeli, jadi nggak ada yang kucatat. Keren bisa nahan diri 👍`,
    sopan: `Baik, ${thing || 'pembelian itu'} tidak jadi, jadi tidak ada yang dicatat.`,
    gaul: `Sip, ${thing || 'itu'} batal, gak gue catet apa-apa. Mantap bisa nahan 👍`,
    singkat: 'Oke, tidak dicatat.',
  }), chips: ['kasih tips hemat'] });
}

/* ------------------------------------------------------------------ Feelings about money */

/** Money feelings: joy (saved, a debt paid off), regret, never enough, envy, fear for later, prices, dreaming of riches. */
export function readFeeling(t: string, ctx: ChatContext, v: Voice, facts: Facts): Out | null {
  if (amountsOf(t).length || /\?\s*$/.test(t) && /\b(?:berapa|gimana|kapan|cara)\b/.test(t)) return null;
  const debtsLeft = (ctx.data.debts || []).filter(d => d.status !== 'paid' && d.outstandingAmount > 0);
  const saved = facts.income - facts.expenses;
  if (/\b(?:berhasil|sukses|akhirnya|alhamdulillah|yes|yeay|bisa)\b.*\b(?:nabung|menabung|hemat|nyisihin|sisihin|tabungan\s+(?:nambah|naik))\b/.test(t) && !/\b(?:gimana|caranya|cara|biar|supaya|nggak|gak|ga|belum)\b/.test(t)) {
    return say('smalltalk', { card: 'talk', text: vo(v, {
      santai: `Mantap, selamat! 🎉 Nahan diri itu nggak gampang. ${saved > 0 ? `Periode ini pemasukanmu masih lebih ${rp(saved)} dari pengeluaran.` : ''} Biar makin semangat, simpan ke Tujuan dana supaya kelihatan progresnya.`.replace(/\s+/g, ' '),
      sopan: `Selamat, pencapaian yang baik. ${saved > 0 ? `Periode ini pemasukan Anda lebih ${rp(saved)} dari pengeluaran.` : ''} Simpan ke Tujuan dana agar progresnya terlihat.`.replace(/\s+/g, ' '),
      gaul: `Keren parah, selamat! 🎉 ${saved > 0 ? `Periode ini lo masih surplus ${rp(saved)}.` : ''} Masukin ke Tujuan dana biar keliatan progresnya.`.replace(/\s+/g, ' '),
      singkat: `Selamat!${saved > 0 ? ` Surplus ${rp(saved)}.` : ''}`,
    }), chips: ['isi tujuan dana', 'ringkasan bulan ini'] }, { topic: 'mood' });
  }
  if (/\b(?:utang|hutang|cicilan|pinjaman|kredit|paylater)\b(?:\s+\p{L}+){0,3}\s+(?:udah\s+|sudah\s+|akhirnya\s+)?(?:lunas|kelar|beres|selesai|tuntas)\b|\b(?:lunas|ngelunasin|melunasi)\b.*\b(?:utang|hutang|cicilan)\b/u.test(t) && /\b(?:seneng|senang|lega|akhirnya|alhamdulillah|yes|yeay|bahagia|puas|plong|bangga|asik|asyik)\b/.test(t)) {
    return say('smalltalk', { card: 'talk', text: vo(v, {
      santai: `Selamat, lega banget pasti! 🎉 ${debtsLeft.length ? `Di aplikasi masih ada ${debtsLeft.length} utang (${debtsLeft.map(d => `${d.name} ${rp(d.outstandingAmount)}`).join(', ')}). Kalau pelunasannya belum dicatat, bilang misalnya “lunasin ${lower(debtsLeft[0].name)}” biar sisanya ikut nol.` : 'Semua utang di aplikasi sudah nol.'}`,
      sopan: `Selamat, tentu melegakan. ${debtsLeft.length ? `Masih tercatat ${debtsLeft.length} utang (${debtsLeft.map(d => `${d.name} ${rp(d.outstandingAmount)}`).join(', ')}). Bila pelunasannya belum dicatat, silakan sampaikan.` : 'Seluruh utang di aplikasi sudah lunas.'}`,
      gaul: `Mantap, plong dong! 🎉 ${debtsLeft.length ? `Di aplikasi masih ada ${debtsLeft.map(d => `${d.name} ${rp(d.outstandingAmount)}`).join(', ')}. Belum dicatet lunasnya? Bilang “lunasin ${lower(debtsLeft[0].name)}”.` : 'Utang di aplikasi udah nol semua.'}`,
      singkat: `Selamat!${debtsLeft.length ? ` Masih tercatat: ${debtsLeft.map(d => d.name).join(', ')}.` : ''}`,
    }), chips: debtsLeft.length ? [`lunasin ${lower(debtsLeft[0].name)}`, 'utang gue berapa'] : ['ringkasan bulan ini'] }, { topic: 'mood' });
  }
  if (/\b(?:nyesel|nyesal|menyesal|nyesek|kecewa|rugi)\b.*\b(?:beli|belanja|bayar|checkout|co|ambil|order|pesan|borong|ngeborong|kalap|jajan|diskonan|flash\s*sale)\b|\b(?:beli|belanja)\b.*\b(?:nyesel|menyesal|nyesal)\b/.test(t)) {
    return say('curhat', { card: 'talk', text: vo(v, {
      santai: 'Wajar kok nyesel, semua orang pernah 🤗 Yang penting jadi pelajaran. Kalau barangnya masih bisa diretur atau dijual lagi, lumayan balik modal. Ke depannya coba aturan 24 jam: masukin Wish list dulu, kalau besoknya masih pengen baru beli.',
      sopan: 'Penyesalan itu wajar. Bila barangnya masih bisa dikembalikan atau dijual kembali, itu bisa membantu. Ke depan, coba tunda 24 jam dengan memasukkannya ke Wish list terlebih dahulu.',
      gaul: 'Santai, semua pernah 🤗 Kalo masih bisa retur atau dijual lagi, lumayan. Next time pake aturan 24 jam: masukin Wish list dulu, besok masih pengen baru beli.',
      singkat: 'Wajar. Coba aturan 24 jam lewat Wish list.',
    }), chips: ['kasih tips hemat', 'buka wishlist'] }, { topic: 'curhat', curhat: 1 });
  }
  if (!/\b(?:sedih|stres|stress|pusing|galau|bete|kesel|nangis|depresi)\b/.test(t) && /\b(?:gaji|gajian|duit|uang|penghasilan|pendapatan|pemasukan)\b(?:ku|mu|nya)?(?:\s+\p{L}+){0,3}\s+(?:(?:nggak|gak|ga|tidak|tdk|ngga|enggak)\s+(?:pernah|juga|bakal|akan)\s+cukup|kurang|nggak\s+cukup|gak\s+cukup|ga\s+cukup|tidak\s+cukup|pas-?pasan|abis\s+terus|habis\s+terus|cepet\s+abis|cepat\s+habis|numpang\s+lewat|selalu\s+kurang|kurang\s+terus)\b/u.test(t)) {
    return say('curhat', { card: 'talk', text: vo(v, {
      santai: `Capek ya rasanya 🤗 Dari catatanmu periode ini: masuk ${rp(facts.income)}, keluar ${rp(facts.expenses)}${facts.income ? ` (${pct(facts.expenses / facts.income, 0)} dari pemasukan)` : ''}. Coba kita lihat bagian mana yang paling bisa dikecilin, pelan-pelan aja.`,
      sopan: `Itu memang melelahkan. Periode ini pemasukan Anda ${rp(facts.income)} dan pengeluaran ${rp(facts.expenses)}. Mari kita lihat pos yang paling mungkin dikurangi.`,
      gaul: `Relate banget 🤗 Periode ini masuk ${rp(facts.income)}, keluar ${rp(facts.expenses)}. Yuk cek pos mana yang paling bisa dirampingin.`,
      singkat: `Masuk ${rp(facts.income)}, keluar ${rp(facts.expenses)}.`,
    }), chips: ['pengeluaran terbesar bulan ini', 'bantu atur gaji gue', 'kasih tips hemat'] }, { topic: 'curhat', curhat: 1 });
  }
  if (/\b(?:iri|insecure|minder|ngiri)\b/.test(t) && /\b(?:orang|temen|teman|mereka|dia|liat|lihat)\b/.test(t)) {
    return say('curhat', { card: 'talk', text: vo(v, {
      santai: 'Wajar banget ngerasa gitu 🤗 Yang kelihatan di luar sering cuma bagian bagusnya. Fokus ke progresmu sendiri: tiap bulan sedikit lebih baik dari bulan lalu itu udah menang.',
      sopan: 'Perasaan itu wajar. Yang terlihat dari luar sering kali hanya sebagian. Fokuslah pada kemajuan Anda sendiri dari bulan ke bulan.',
      gaul: 'Wajar, bro 🤗 Yang lo liat cuma highlight-nya orang. Fokus ke progres lo sendiri, sedikit-sedikit juga menang.',
      singkat: 'Wajar. Fokus ke progres sendiri.',
    }), chips: ['ringkasan bulan ini', 'bikin tujuan dana'] }, { topic: 'curhat', curhat: 1 });
  }
  if (/\b(?:takut|khawatir|kuatir|cemas|was-was|parno|overthinking)\b/.test(t) && /\b(?:uang|duit|masa\s+depan|pensiun|tua|nggak\s+cukup|gak\s+cukup|ga\s+cukup|kekurangan|bangkrut|miskin)\b|\b(?:gak|ga|nggak|ngga|tidak|tdk)\s+(?:bisa|sanggup|mampu|kuat)\s+(?:bayar|nutup|lunasin)\b/.test(t)) {
    const emergency = (ctx.data.funds || []).find(f => f.kind === 'emergency' || /darurat/i.test(f.name));
    return say('curhat', { card: 'talk', text: vo(v, {
      santai: `Perasaan itu wajar, dan bagusnya kamu udah mikirin dari sekarang 🤗 Langkah pertama yang paling ngebantu: dana darurat 3–6 kali pengeluaran bulanan.${emergency ? ` Dana Daruratmu sekarang ${rp(emergency.currentAmount)} dari target ${rp(emergency.targetAmount)}.` : ''} Sedikit tapi rutin lebih kuat daripada banyak tapi sekali.`,
      sopan: `Kekhawatiran itu wajar. Langkah awal yang membantu adalah dana darurat sebesar 3–6 kali pengeluaran bulanan.${emergency ? ` Saat ini ${emergency.name} berisi ${rp(emergency.currentAmount)} dari target ${rp(emergency.targetAmount)}.` : ''}`,
      gaul: `Wajar kok 🤗 Mulai dari dana darurat 3–6x pengeluaran bulanan.${emergency ? ` Dana darurat lo sekarang ${rp(emergency.currentAmount)} dari ${rp(emergency.targetAmount)}.` : ''} Dikit-dikit asal rutin.`,
      singkat: `Mulai dari dana darurat 3–6× pengeluaran bulanan.${emergency ? ` Sekarang ${rp(emergency.currentAmount)}.` : ''}`,
    }), chips: [emergency ? `isi ${lower(emergency.name)} 100rb` : 'bikin tujuan dana darurat', 'kasih tips hemat'] }, { topic: 'curhat', curhat: 1 });
  }
  if (/\benak(?:nya|\s+kali|\s+banget|\s+ya)?\b.*\b(?:punya|jadi)\s+(?:uang|duit|harta)\b|\b(?:pengen|pengin|mau|ingin)(?:\s+(?:banget|bgt|sih|deh|juga))*\s+(?:jadi\s+)?(?:orang\s+)?(?:kaya|sultan|crazy\s+rich|tajir|konglomerat|miliarder|milyarder|horang\s+kaya)\b|\b(?:andai|seandainya|kalau|kalo|coba)\b.*\b(?:kaya\s+raya|sultan|crazy\s+rich|tajir|konglomerat|miliarder|milyarder|horang\s+kaya)\b/.test(t)) {
    return say('banter', { card: 'talk', text: vo(v, {
      santai: 'Enak banget pasti, bisa jajan tanpa lihat harga 😆 Tapi jalan ke sana biasanya lewat hal yang ngebosenin: catat rutin, tabung rutin. Mau kubantu bikin target pertamanya?',
      sopan: 'Tentu menyenangkan. Biasanya jalannya dimulai dari mencatat dan menabung secara rutin. Mau saya bantu membuat target pertama?',
      gaul: 'Enak lah, jajan gak liat harga 😆 Tapi jalannya ya nabung rutin. Mau gue bantu bikin target pertama?',
      singkat: 'Mulai dari target tabungan pertama?',
    }), chips: ['bikin tujuan dana', 'kasih tips hemat'] }, { offer: 'bikin tujuan dana' });
  }
  if (/\b(?:harga|biaya\s+hidup|kebutuhan\s+pokok|sembako|serba)\b.*\b(?:mahal|naik|melambung|gila|parah|selangit)|\b(?:makin|tambah|semakin|terlalu)\s+(?:[a-z]+\s+)?mahal|\b(?:mahal|naik)\s+(?:banget|bgt|semua|terus|parah)\b.*\b(?:harga|makanan|bensin|sembako|beras|cabe|cabai|minyak)\b|\b(?:makanan|sembako|bensin|beras)\b.*\b(?:mahal|naik)\b/.test(t)) {
    const word = t.match(/\b(bensin|bbm|pertalite|pertamax|solar|listrik|token|air|pulsa|kuota|internet|sewa|kos|kost|ongkir|ojol|tol|parkir|rokok|kopi)\b/)?.[1];
    const named = word ? ctx.data.categories.find(c => new RegExp(`\\b${word === 'bbm' || word === 'pertalite' || word === 'pertamax' || word === 'solar' ? 'bensin' : word === 'token' ? 'listrik' : word === 'kost' ? 'kos' : word}`, 'i').test(c.name)) : undefined;
    const food = named || ctx.data.categories.find(c => !c.parentId && /makan/i.test(c.name));
    const now = food ? spentBetween(ctx.data.transactions.filter(x => x.categoryId === food.id || x.subcategoryId === food.id), ctx.cycle.start, daysBefore(ctx.today, -1)).total : 0;
    const help = named && !/makan|kopi/i.test(named.name) ? vo(v, { santai: `Coba pasang anggaran ${named.name} biar kelihatan kalau mulai bengkak, dan cari cara ngiritnya (gabung perjalanan, paket bulanan, bandingin harga).`, sopan: `Pasang anggaran ${named.name} agar kenaikannya terpantau.`, gaul: `Pasang anggaran ${named.name} biar ketahuan kalo bengkak.`, singkat: `Pasang anggaran ${named.name}.` }) : '';
    return say('curhat', { card: 'talk', text: vo(v, {
      santai: `Iya, kerasa banget ya ${food && now ? `Periode ini ${food.name} kamu udah ${rp(now)}.` : ''} ${help || 'Yang biasanya ngebantu: masak sendiri beberapa kali seminggu, bawa bekal, dan pasang anggaran makan biar ada batasnya.'}`.replace(/\s+/g, ' '),
      sopan: `Memang terasa. ${food && now ? `Periode ini pengeluaran ${food.name} Anda ${rp(now)}.` : ''} Memasak sendiri, membawa bekal, dan memasang anggaran makan dapat membantu.`.replace(/\s+/g, ' '),
      gaul: `Bener, gila sih harganya ${food && now ? `Periode ini ${food.name} lo udah ${rp(now)}.` : ''} Masak sendiri, bawa bekal, pasang anggaran makan.`.replace(/\s+/g, ' '),
      singkat: `${food && now ? `${food.name}: ${rp(now)}. ` : ''}Pasang anggaran makan.`,
    }), chips: [named && !/makan|kopi/i.test(named.name) ? `anggaran ${lower(named.name)} 500rb` : 'budget makan masih berapa', 'kasih tips hemat'] }, { topic: 'curhat', curhat: 1 });
  }
  // Working hard and the savings not growing ("kerja mulu tapi saldo gitu-gitu aja").
  if (/\b(?:kerja|kerjaan|lembur|banting\s+tulang)\b/.test(t) && /\b(?:tabungan|saldo|duit|uang|gaji|rekening)(?:ku|mu|nya)?\b/.test(t) && /\b(?:gitu-gitu|gini-gini|gitu2|gini2|segitu|segini|(?:nggak|gak|ga|tidak|tdk|ngga)\s+(?:nambah|naik|bertambah|berubah)|stuck|mentok|jalan\s+di\s+tempat)\b/.test(t)) {
    return say('curhat', { card: 'talk', text: vo(v, {
      santai: `Capek ya, kerja terus tapi tabungannya nggak gerak 🤗 Periode ini masuk ${rp(facts.income)}, keluar ${rp(facts.expenses)}${facts.income > facts.expenses ? `, jadi sebenarnya masih ada lebih ${rp(facts.income - facts.expenses)}. Coba langsung pindahin sebagian ke Tujuan dana pas gajian, biar nggak kepakai.` : '. Kita cek pos mana yang paling bisa dikecilin, ya.'}`,
      sopan: `Itu memang melelahkan. Periode ini pemasukan ${rp(facts.income)} dan pengeluaran ${rp(facts.expenses)}. Menyisihkan di awal gajian ke Tujuan dana dapat membantu.`,
      gaul: `Relate 🤗 Periode ini masuk ${rp(facts.income)}, keluar ${rp(facts.expenses)}. Pindahin sebagian ke Tujuan dana pas gajian biar gak kepake.`,
      singkat: `Masuk ${rp(facts.income)}, keluar ${rp(facts.expenses)}.`,
    }), chips: ['bantu atur gaji gue', 'pengeluaran terbesar bulan ini'] }, { topic: 'curhat', curhat: 1 });
  }
  return null;
}

/* ------------------------------------------------------------------ Sums to work out */

const AMT_RE = String.raw`(?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k|jt|juta|m|miliar)?`;
/** "gaji 6,5 juta, pengeluaran 4 juta, berapa persen bisa ditabung", "berapa persen 750rb dari 5jt", "punya 2 juta dan
 * masih 20 hari sampai gajian", "sepatu 500rb diskon 20% terus diskon lagi 10%": worked out, not recorded. */
export function readMoneyMath(t0: string, v: Voice): Out | null {
  const t = amountWords(lower(t0)), amounts = findAmounts(t).filter(a => a.value > 0);
  // A share of one amount in another: "berapa persen 750rb dari 5jt", "pengeluaran 3,2jt dari gaji 8jt itu berapa persen".
  const dari = t.search(/\bdari\b/);
  if (dari > 0 && amounts.length === 2 && /\b(?:berapa|brp)\s*(?:persen|%)|\bpersen(?:nya|tase)?\b|\bpersentase\b/.test(t) && amounts[0].index < dari && amounts[1].index > dari) {
    const a = amounts[0].value, b = amounts[1].value;
    if (a > 0 && b > 0) return say('calc', { card: 'calc', title: 'Persentase', text: `${rp(a)} itu ${pct(a / b)} dari ${rp(b)}.`, hero: { label: `${rp(a)} dari ${rp(b)}`, value: pct(a / b) }, tone: 'info', why: `${rp(a)} ÷ ${rp(b)} × 100 = ${pct(a / b, 2)}.` }, { last: 'calc', number: Math.round(a / b * 1000) / 10 });
  }
  // How much of the income is left to save.
  const inc = t.match(new RegExp(String.raw`\b(?:gaji|gajian|penghasilan|pendapatan|pemasukan|income|salary)(?:\s+(?:aku|gue|gw|saya|ku|nya))?\s+(${AMT_RE})`, 'u'));
  const out = t.match(new RegExp(String.raw`\b(?:pengeluaran|keluar|biaya\s+hidup|habis|abis|belanja|expense|kebutuhan|kepake|kepakai|terpakai|dipake|dipakai|kepotong)(?:\s+(?:aku|gue|gw|saya|ku|nya|bulanan|sebulan))?\s+(${AMT_RE})`, 'u'));
  if (inc && out && /\b(?:persen|%|berapa|brp|sisa|tabung|nabung|bisa|sisain|saving)\b/.test(t)) {
    const a = findAmounts(inc[1])[0]?.value || 0, b = findAmounts(out[1])[0]?.value || 0;
    if (a > 0 && b >= 0 && a !== b) {
      const left = a - b, rate = left / a;
      return say('calc', { card: 'calc', title: 'Bisa ditabung', text: vo(v, {
        santai: left >= 0 ? `Yang kepakai ${pct(b / a)} dari penghasilan. Sisa ${rp(left)} dari ${rp(a)}, jadi bisa nabung ${pct(rate)}. ${rate >= 0.2 ? 'Udah di atas 20%, bagus banget!' : 'Patokan umum 20%; coba naikin pelan-pelan.'}` : `Pengeluaran lebih besar ${rp(-left)} dari penghasilan. Perlu dikurangi dulu sebelum bisa nabung.`,
        sopan: left >= 0 ? `Terpakai ${pct(b / a)} dari penghasilan. Sisa ${rp(left)} dari ${rp(a)}, atau ${pct(rate)} yang dapat ditabung.` : `Pengeluaran melebihi penghasilan sebesar ${rp(-left)}.`,
        gaul: left >= 0 ? `Kepake ${pct(b / a)}. Sisa ${rp(left)} dari ${rp(a)}, berarti lo bisa nabung ${pct(rate)}. ${rate >= 0.2 ? 'Mantap, udah lewat 20%!' : 'Target umum 20%, naikin pelan-pelan.'}` : `Tekor ${rp(-left)}, bro. Kurangin dulu pengeluarannya.`,
        singkat: left >= 0 ? `Terpakai ${pct(b / a)}, sisa ${pct(rate)} (${rp(left)}).` : `Minus ${rp(-left)}.`,
      }), hero: { label: 'Bisa ditabung', value: pct(rate), note: rp(left), tone: left >= 0 ? 'good' : 'warn' }, stats: [{ label: 'Penghasilan', value: rp(a) }, { label: 'Pengeluaran', value: rp(b) }], tone: 'info', why: `(${rp(a)} − ${rp(b)}) ÷ ${rp(a)} = ${pct(rate, 2)}.` }, { last: 'calc', number: left });
    }
  }
  // Money for each day until payday.
  const days = t.match(/\b(\d{1,3}|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas)\s*(?:hari|hr)\b/);
  if (amounts.length >= 1 && days && /\b(?:punya|tinggal|sisa|masih\s+ada|pegang|ada)\b/.test(t) && /\b(?:gajian|gaji|sampai|sampe|hingga|lagi)\b/.test(t) && !BUY_VERB.test(t)) {
    const n = /^\d+$/.test(days[1]) ? Number(days[1]) : ({ dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11 } as Record<string, number>)[days[1]];
    const a = amounts.find(x => !new RegExp(`^${esc(String(n))}\\b`).test(x.text.trim()))?.value || 0;
    if (n > 0 && a > 0) {
      const per = Math.floor(a / n);
      return say('calc', { card: 'calc', title: 'Jatah per hari', text: vo(v, {
        santai: `${rp(a)} buat ${n} hari berarti maksimal ${rp(per)} sehari. Sisihin sedikit buat yang mendadak, jadi amannya sekitar ${rp(Math.floor(per * 0.9 / 1000) * 1000)} sehari.`,
        sopan: `${rp(a)} untuk ${n} hari setara ${rp(per)} per hari. Sisakan sedikit untuk keperluan mendadak.`,
        gaul: `${rp(a)} buat ${n} hari = ${rp(per)}/hari max. Sisain dikit buat darurat ya.`,
        singkat: `${rp(per)}/hari.`,
      }), hero: { label: 'Per hari', value: rp(per), note: `${n} hari` }, tone: 'info', why: `${rp(a)} ÷ ${n} hari = ${rp(per)}.` }, { last: 'calc', number: per });
    }
  }
  // Discounts one after another, with no purchase said ("beli …" is a record: Catat otomatis works it out on the card).
  const cuts = [...t.matchAll(/\bdiskon(?:nya)?\s+(?:lagi\s+)?(\d+(?:[.,]\d+)?)\s*(?:%|persen)/g)].map(m => Number(m[1].replace(',', '.')) / 100);
  if (cuts.length >= 2 && amounts.length >= 1 && !/\b(?:beli|bayar|tadi|barusan|abis|habis|udah|sudah|kemarin)\b/.test(t)) {
    const base = amounts[0].value, final = cuts.reduce((p, c) => p * (1 - c), base), thing = t.slice(0, amounts[0].index).replace(/\b(?:harga(?:nya)?|kalau|kalo|misal)\b/g, ' ').trim().split(/\s+/).slice(-2).join(' ');
    return say('calc', { card: 'calc', title: 'Harga setelah diskon', text: vo(v, {
      santai: `${rp(base)} diskon ${cuts.map(c => pct(c, 0)).join(' lalu ')} jadi ${rp(final)}. Hematnya ${rp(base - final)} (total ${pct(1 - final / base)}, bukan ${pct(cuts.reduce((a, b) => a + b, 0), 0)}, karena diskon kedua dihitung dari harga yang udah turun).`,
      sopan: `${rp(base)} dengan diskon ${cuts.map(c => pct(c, 0)).join(' lalu ')} menjadi ${rp(final)}. Penghematan ${rp(base - final)} (${pct(1 - final / base)}).`,
      gaul: `${rp(base)} diskon ${cuts.map(c => pct(c, 0)).join(' terus ')} = ${rp(final)}. Hemat ${rp(base - final)} (${pct(1 - final / base)}, bukan ${pct(cuts.reduce((a, b) => a + b, 0), 0)}).`,
      singkat: `${rp(final)} (hemat ${rp(base - final)}).`,
    }), hero: { label: 'Harga akhir', value: rp(final), note: `hemat ${rp(base - final)}`, tone: 'good' }, tone: 'info', chips: ['catat', 'kalau diskon 50%?'], why: `${rp(base)} ${cuts.map(c => `× ${(1 - c).toLocaleString('id-ID')}`).join(' ')} = ${rp(final)}.` }, { last: 'calc', number: final, calcPlan: `${thing ? `beli ${thing}` : 'belanja'} ${amountWord(final)}` });
  }
  return null;
}

/* ------------------------------------------------------------------ Features */

const CAPABILITY: [RegExp, string, string, string][] = [
  [/\bpiutang\b|\b(?:orang|temen|teman)\s+(?:yang\s+)?(?:utang|minjem|pinjam)\b/, 'Piutang: uang yang dipinjam orang darimu, lengkap dengan sisa dan tanggal janji bayar.', 'budi pinjam 100rb', 'receivables'],
  [/\b(?:utang|hutang|pinjaman|cicilan|kredit|paylater)\b/, 'Utang: pinjaman, cicilan, sampai paylater, berikut sisa dan pembayarannya.', 'pinjam ke kak rina 500rb', 'debts'],
  [/\b(?:anggaran|budget|budgeting|limit)\b/, 'Anggaran per kategori: aku kasih tahu sisa dan jatah harian tiap kamu mencatat.', 'anggaran makan 1,5jt', 'budgets'],
  [/\b(?:tujuan|target|tabungan|nabung|dana\s+darurat)\b/, 'Tujuan dana: target tabungan dengan tenggat dan progresnya.', 'target liburan 5jt', 'funds'],
  [/\b(?:wish\s?list|keinginan|impian)\b/, 'Wish list: barang yang pengen dibeli, biar nggak impulsif.', 'masukin wishlist sepatu 500rb', 'wishlist'],
  [/\b(?:transfer|pindah\s+saldo|pindahin|top\s?up)\b/, 'Transfer antar dompet, termasuk top up dan biaya admin.', 'transfer 200rb dari jago ke gopay', 'wallets'],
  [/\b(?:struk|scan|foto\s+struk|nota)\b/, 'Scan struk dari Catat otomatis, dibaca langsung di HP.', 'buka transaksi', 'transactions'],
  [/\b(?:mutasi|impor|import|rekening\s+koran)\b/, 'Impor mutasi bank atau e-wallet (CSV, Excel, PDF) ke Perlu Dikonfirmasi.', 'buka transaksi', 'transactions'],
  [/\b(?:split\s?bill|patungan|bagi\s+tagihan|bagi\s+bill)\b/, 'Split Bill: bagi tagihan bareng teman, piutangnya tercatat otomatis.', 'buka split bill', 'splitbill'],
  [/\b(?:rutin|langganan|berulang|tiap\s+bulan)\b/, 'Transaksi rutin dan langganan yang tercatat sendiri tiap jadwalnya.', 'langganan netflix 54rb tiap tanggal 5', 'recurring'],
  [/\b(?:pengingat|ingetin|ngingetin|reminder|notif)\b/, 'Pengingat dan rencana pembayaran.', 'ingetin bayar listrik tanggal 20', 'upcoming'],
  [/\b(?:laporan|rekap|report|analisis|grafik)\b/, 'Laporan, rekap bulanan, dan analisis per kategori.', 'ringkasan bulan ini', 'report'],
  [/\b(?:kategori)\b/, 'Kategori dan subkategori sendiri.', 'buka kategori', 'categories'],
  [/\b(?:catat|catet|nyatet|pengeluaran|pemasukan|transaksi)\b/, 'Catat pengeluaran, pemasukan, dan transfer cukup dengan kalimat biasa.', 'makan siang 35rb pakai gopay', 'transactions'],
];
/** "bisa catetin utang nggak?", "bisa bikin anggaran ga sih": yes, what it is, and an example. */
export function readCapability(t: string, v: Voice): Out | null {
  if (!/^(?:(?:emang|apa|kamu|lu|lo|elu|kau|km|kmu|dompet\s+ajaib|aplikasi\s+ini|app\s+ini|di\s+sini|disini)\s+)*(?:bisa|bs|bisakah|dapat|dapet)\s+(?:catet|catat|catetin|catatin|nyatet|nyatat|bikin|buat|bikinin|atur|ngatur|pasang|hitung|ngitung|itung|scan|impor|import|bagi|split|ingetin|ngingetin|simpan|nyimpen|lacak|pantau|transfer|pindahin|top\s?up)\b/.test(t)) return null;
  if (amountsOf(t).length) return null;
  if (!/\b(?:ga|gak|nggak|ngga|enggak|engga|tidak|kah|nggk|gk|g|ya|nih|sih|dong)\s*\??\s*$|\?\s*$/.test(t)) return null;
  const hit = CAPABILITY.find(([re]) => re.test(t));
  if (!hit) return null;
  const [, what, example, view] = hit;
  return say('help', { card: 'help', title: 'Bisa!', text: vo(v, {
    santai: `Bisa! ${what} Coba tulis misalnya “${example}”, nanti kusiapin kartunya buat kamu cek dan simpan.`,
    sopan: `Bisa. ${what} Contohnya: “${example}”. Saya siapkan kartunya untuk Anda periksa dan simpan.`,
    gaul: `Bisa dong! ${what} Ketik aja misal “${example}”, gue siapin kartunya.`,
    singkat: `Bisa. Contoh: “${example}”.`,
  }), chips: [example, 'bisa apa aja?'], open: { view, label: 'Buka menunya' } });
}

/** "bisa catetin makan 20rb ga": yes, and its card. */
export function readCanRecord(t: string, v: Voice): Out | null {
  const m = t.match(/^(?:(?:min|bot|kak|eh)\s*,?\s+)?(?:bisa|bs|bisakah|boleh)\s+(?:tolong\s+)?(?:catet|catat|catetin|catatin|nyatet|nyatetin|masukin|input|inputin|tambahin)(?:\s+(?:dong|ya))?\s+(.+?)\s*(?:(?:ga|gak|nggak|ngga|enggak|engga|kah|nggk|gk|g|ya|dong|nih|sih)\s*)*\??$/);
  if (!m || !amountsOf(m[1]).length) return null;
  return { plan: m[1], intro: vo(v, { santai: 'Bisa dong. Ini kartunya, cek dulu lalu Simpan.', sopan: 'Bisa. Berikut kartunya, silakan periksa lalu Simpan.', gaul: 'Bisa lah. Nih kartunya, cek terus Simpan.', singkat: 'Bisa. Cek lalu Simpan.' }) };
}

/** "uang gue paling banyak ada di mana?": the wallet with the most money. */
export function readBiggestWallet(t: string, ctx: ChatContext, v: Voice): Out | null {
  if (!/\b(?:uang|duit|saldo|dana)(?:ku|mu|nya)?\b.*\b(?:paling\s+(?:banyak|gede|besar)|terbanyak|terbesar)\b|\b(?:dompet|rekening|wallet|akun)\b.*\b(?:paling\s+(?:banyak|gede|besar|tebel|tebal|gendut)|terbanyak)\b.*\b(?:mana|apa|yang\s+mana)\b|\b(?:dompet|rekening|wallet)\s+(?:mana|apa)\b.*\b(?:paling\s+(?:banyak|gede|besar|tebel|tebal)|terbanyak)\b|\bpaling\s+(?:banyak|gede)\b.*\b(?:uang|duit|saldo)\b.*\b(?:mana|dimana|di\s+mana)\b/.test(t)) return null;
  const live = ctx.data.wallets.filter(w => !w.isArchived && (w.cachedBalance || 0) > 0).sort((a, b) => b.cachedBalance - a.cachedBalance);
  if (!live.length) return say('question', { card: 'summary', text: vo(v, { santai: 'Semua dompetmu lagi kosong nih.', sopan: 'Seluruh dompet Anda saat ini kosong.', gaul: 'Dompet lo kosong semua, bro.', singkat: 'Semua dompet kosong.' }) });
  const total = live.reduce((n, w) => n + w.cachedBalance, 0), top = live[0];
  return say('question', { card: 'summary', title: 'Uang paling banyak', text: vo(v, {
    santai: `Paling banyak di ${top.name}: ${rp(top.cachedBalance)}, sekitar ${pct(top.cachedBalance / total, 0)} dari semua saldomu (${rp(total)}).`,
    sopan: `Saldo terbesar ada di ${top.name}: ${rp(top.cachedBalance)}, sekitar ${pct(top.cachedBalance / total, 0)} dari total ${rp(total)}.`,
    gaul: `Paling tebel di ${top.name}: ${rp(top.cachedBalance)} (${pct(top.cachedBalance / total, 0)} dari total ${rp(total)}).`,
    singkat: `${top.name}: ${rp(top.cachedBalance)}.`,
  }), hero: { label: top.name, value: rp(top.cachedBalance), note: `${pct(top.cachedBalance / total, 0)} dari total`, tone: 'good' }, lines: live.slice(0, 5).map(w => ({ label: w.name, value: rp(w.cachedBalance) })), open: { view: 'wallets', label: 'Buka Dompet' } }, { walletTalk: top.name });
}

/** "pindahin 500 ribu ke tabungan" when "tabungan" is no wallet: into which goal, or which savings wallet? */
export function readToSavings(t: string, ctx: ChatContext, v: Voice): Out | null {
  if (!/\b(?:pindahin|pindah|masukin|masukkan|taruh|naruh|simpen|simpan|setor|transfer|tf|kirim|alokasiin)\b.*\bke\s+(?:tabungan|celengan|simpanan)\b/.test(t)) return null;
  const a = amountsOf(t)[0];
  if (walletsIn(t, ctx.quick.wallets).some(w => /tabungan|celengan|simpanan/i.test(w.name))) return null;
  const funds = (ctx.data.funds || []).filter(f => !f.isArchived), saveWallets = ctx.data.wallets.filter(w => !w.isArchived && (w.type === 'savings' || w.group === 'savings'));
  const amt = a ? amountWord(a.value) : '100rb';
  return say('clarify', { card: 'talk', text: vo(v, {
    santai: `Ke tabungan yang mana nih?${funds.length ? ` Tujuan danamu: ${funds.map(f => f.name).join(', ')}.` : ''}${saveWallets.length ? ` Dompet tabungan: ${saveWallets.map(w => w.name).join(', ')}.` : ''} Pilih di bawah ya, nanti kusiapin kartunya.`,
    sopan: `Ke tabungan yang mana?${funds.length ? ` Tujuan dana Anda: ${funds.map(f => f.name).join(', ')}.` : ''}${saveWallets.length ? ` Dompet tabungan: ${saveWallets.map(w => w.name).join(', ')}.` : ''}`,
    gaul: `Tabungan yang mana, bro?${funds.length ? ` Ada ${funds.map(f => f.name).join(', ')}.` : ''}${saveWallets.length ? ` Dompet tabungan: ${saveWallets.map(w => w.name).join(', ')}.` : ''}`,
    singkat: `Tabungan yang mana?${funds.length ? ` ${funds.map(f => f.name).join(', ')}.` : ''}`,
  }), chips: [...funds.slice(0, 3).map(f => `nabung ${amt} ke ${lower(f.name)}`), ...saveWallets.slice(0, 2).map(w => `transfer ${amt} ke ${lower(w.name)}`)] });
}

/** "gue mau pisahin duit buat kuliah": a goal (Tujuan dana) or a pocket, offered to set up. */
export function readSetAside(t: string, ctx: ChatContext, v: Voice): Out | null {
  const m = t.match(/\b(?:pisahin|misahin|pisahkan|memisahkan|alokasiin|alokasikan|nyisihin\s+khusus|pisah)\s+(?:duit|uang|dana|tabungan)?\s*(?:buat|untuk|utk|bwt|khusus)\s+(.+)$/);
  if (!m || amountsOf(t).length) return null;
  const goal = m[1].replace(/\b(?:dong|ya|nih|sih|deh|aja|nanti|nantinya|ke\s+depan)\b/g, ' ').replace(/[?.!,]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
  if (!goal) return null;
  const fund = (ctx.data.funds || []).find(f => !f.isArchived && lower(f.name).includes(goal.split(' ')[0]));
  if (fund) return say('goal', { card: 'goal', title: fund.name, text: vo(v, {
    santai: `Udah ada Tujuan dana ${fund.name}: ${rp(fund.currentAmount)} dari ${rp(fund.targetAmount)}. Mau diisi sekarang?`,
    sopan: `Tujuan dana ${fund.name} sudah ada: ${rp(fund.currentAmount)} dari ${rp(fund.targetAmount)}.`,
    gaul: `${fund.name} udah ada: ${rp(fund.currentAmount)} dari ${rp(fund.targetAmount)}. Isi sekarang?`,
    singkat: `${fund.name}: ${rp(fund.currentAmount)} / ${rp(fund.targetAmount)}.`,
  }), chips: [`nabung 200rb ke ${lower(fund.name)}`], open: { view: 'funds', label: 'Buka Tujuan dana' } });
  return say('goal', { card: 'goal', title: `Dana ${goal}`, text: vo(v, {
    santai: `Ide bagus! Paling rapi pakai Tujuan dana “${cap(goal)}”: kasih target dan tenggat, nanti kelihatan harus nyisihin berapa tiap bulan. Kalau uangnya mau dipisah di rekening sendiri, bisa juga pakai kantong (dompet tabungan) yang ditautkan. Targetnya berapa?`,
    sopan: `Ide yang baik. Gunakan Tujuan dana “${cap(goal)}” dengan target dan tenggat, sehingga sisihan bulanan terlihat. Dana juga dapat dipisahkan dalam kantong (dompet tabungan) yang ditautkan.`,
    gaul: `Mantap! Bikin Tujuan dana “${cap(goal)}” aja, kasih target sama tenggat, nanti keliatan nyisihin berapa per bulan. Mau dipisah rekening? Pake kantong (dompet tabungan).`,
    singkat: `Pakai Tujuan dana “${cap(goal)}”.`,
  }), chips: [`bikin tujuan dana ${goal}`, `target ${goal} 10jt`], open: { view: 'funds', label: 'Buka Tujuan dana', target: 'new' } });
}

/** "bantu atur gaji gue": 50/30/20 on the last salary, with what this cycle actually went to. */
export function readSalaryPlan(t: string, ctx: ChatContext, v: Voice, facts: Facts): Out | null {
  if (!/\b(?:atur|ngatur|aturin|bagi|bagiin|bagi2|alokasi\p{L}*|manage|kelola|ngelola|mengelola|susun|nyusun)\b(?:\s+\p{L}+)?\s+(?:gaji|gajian|penghasilan|pendapatan|duit\s+bulanan|uang\s+bulanan)\b/u.test(t) || amountsOf(t).length) return null;
  const base = lastSalary(ctx) || facts.income;
  if (!base) return null;
  const need = base * 0.5, want = base * 0.3, save = base * 0.2;
  const text = vo(v, {
    santai: `Dari gaji terakhirmu ${rp(base)}, pakai patokan 50/30/20: kebutuhan (kos, makan, transport, tagihan) ${rp(need)}, keinginan (nongkrong, hobi) ${rp(want)}, tabungan & bayar utang ${rp(save)}. Sisihin yang 20% di awal pas gajian, biar nggak kepake. Periode ini pengeluaranmu ${rp(facts.expenses)}${facts.income ? ` (${pct(facts.expenses / facts.income, 0)} dari pemasukan)` : ''}.`,
    sopan: `Dari gaji terakhir ${rp(base)}, dengan patokan 50/30/20: kebutuhan ${rp(need)}, keinginan ${rp(want)}, tabungan dan cicilan ${rp(save)}. Sisihkan 20% di awal saat gajian.`,
    gaul: `Gaji terakhir lo ${rp(base)}. Pake 50/30/20: kebutuhan ${rp(need)}, senang-senang ${rp(want)}, tabungan + utang ${rp(save)}. Tabungannya potong duluan pas gajian.`,
    singkat: `Kebutuhan ${rp(need)} · keinginan ${rp(want)} · tabungan ${rp(save)}.`,
  });
  return say('tips', { card: 'tips', title: 'Atur gaji 50/30/20', text, bars: [{ label: 'Kebutuhan 50%', value: rp(need), ratio: 0.5 }, { label: 'Keinginan 30%', value: rp(want), ratio: 0.3 }, { label: 'Tabungan 20%', value: rp(save), ratio: 0.2, tone: 'good' }], tone: 'info', chips: [`anggaran makan ${amountWord(Math.round(need * 0.4 / 50000) * 50000)}`, 'berapa yang harus gue sisihin tiap bulan?', 'pengeluaran terbesar bulan ini'], why: '50/30/20 adalah patokan umum: setengah untuk kebutuhan, 30% keinginan, 20% tabungan atau pelunasan utang. Gaji diambil dari pemasukan terbaru berkategori Gaji.' });
}

const monthsUntil = (today: string, date: string) => { const [y1, m1, d1] = today.split('-').map(Number), [y2, m2, d2] = date.split('-').map(Number); return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + (d2 >= d1 ? 0 : -1)); };
/** "berapa yang harus gue sisihin tiap bulan?": per goal, what is left divided by the months to its date. */
export function readMonthlySetAside(t: string, ctx: ChatContext, v: Voice): Out | null {
  if (!/\b(?:berapa|brp|brapa)\b/.test(t) || !/\b(?:sisihin|sisihkan|nyisihin|nyisain|tabung|nabung|menabung|simpan|nyimpen|kumpulin)\b/.test(t) || !/\b(?:tiap|per|setiap|sebulan|perbulan)\s*bulan\b|\bsebulan(?:nya)?\b|\bbulanan\b/.test(t) || amountsOf(t).length) return null;
  const funds = (ctx.data.funds || []).filter(f => !f.isArchived && f.targetAmount > f.currentAmount);
  if (!funds.length) return null;
  const rows = funds.map(f => {
    const left = f.targetAmount - f.currentAmount, months = f.targetDate ? monthsUntil(ctx.today, f.targetDate) : 0;
    return { f, left, months, per: months ? Math.ceil(left / months / 1000) * 1000 : 0 };
  });
  const dated = rows.filter(r => r.per), total = dated.reduce((n, r) => n + r.per, 0);
  const line = (r: typeof rows[number]): SayLine => ({ label: r.f.name, value: r.per ? `${rp(r.per)}/bln` : 'tanpa tenggat', ...(r.per ? {} : { tone: 'warn' as const }) });
  return say('goal', { card: 'goal', title: 'Sisihan per bulan', text: vo(v, {
    santai: `${dated.length ? `Biar ${dated.map(r => r.f.name).join(' dan ')} kekejar tepat waktu, sisihin total ${rp(total)} tiap bulan (${dated.map(r => `${r.f.name} ${rp(r.per)} selama ${r.months} bulan`).join(', ')}).` : ''}${rows.some(r => !r.per) ? ` ${rows.filter(r => !r.per).map(r => r.f.name).join(', ')} belum punya tenggat; kasih tanggal biar bisa kuhitung.` : ''}`.trim(),
    sopan: `${dated.length ? `Agar ${dated.map(r => r.f.name).join(' dan ')} tercapai tepat waktu, sisihkan total ${rp(total)} per bulan.` : ''}${rows.some(r => !r.per) ? ` ${rows.filter(r => !r.per).map(r => r.f.name).join(', ')} belum memiliki tenggat.` : ''}`.trim(),
    gaul: `${dated.length ? `Biar ${dated.map(r => r.f.name).join(' & ')} kekejar, sisihin ${rp(total)}/bulan.` : ''}${rows.some(r => !r.per) ? ` ${rows.filter(r => !r.per).map(r => r.f.name).join(', ')} belum ada tenggat.` : ''}`.trim(),
    singkat: dated.length ? `${rp(total)}/bulan.` : 'Belum ada tujuan dengan tenggat.',
  }), ...(dated.length ? { hero: { label: 'Total per bulan', value: rp(total) } } : {}), lines: rows.map(line), open: { view: 'funds', label: 'Buka Tujuan dana' }, chips: rows.slice(0, 2).map(r => `nabung ${amountWord(r.per || 100000)} ke ${lower(r.f.name)}`), why: 'Sisa target (target dikurangi yang sudah terkumpul) dibagi jumlah bulan sampai tanggal targetnya, dibulatkan ke atas ke ribuan.' });
}

/** "hapus yang kemarin", "hapus transaksi tanggal 12": which one, when there are several that day. */
export function readDeleteByDay(t: string, ctx: ChatContext, v: Voice): Out | null {
  const m = t.match(/^(?:tolong\s+)?(?:hapus|apus|delete|buang|batalin)(?:in|kan)?\s+(?:(?:yang|yg|transaksi|catatan)\s+){0,2}(kemarin|kemaren|kmrn|kemarin\s+lusa|(?:tgl|tanggal)\s*(\d{1,2}))$/);
  if (!m) return null;
  const day = m[2] ? `${ctx.today.slice(0, 8)}${String(Number(m[2])).padStart(2, '0')}` : /lusa/.test(m[1]) ? daysBefore(ctx.today, 2) : daysBefore(ctx.today, 1);
  const label = m[2] ? `tanggal ${Number(m[2])}` : /lusa/.test(m[1]) ? 'kemarin lusa' : 'kemarin';
  const list = ctx.data.transactions.filter(x => x.date === day && ['expense', 'income', 'transfer'].includes(x.type)).slice(0, 6);
  if (!list.length) return say('clarify', { card: 'talk', text: vo(v, { santai: `Nggak ada catatan ${label}. Mungkin maksudnya yang barusan? Bilang “hapus transaksi terakhir”.`, sopan: `Tidak ada catatan ${label}.`, gaul: `Gak ada catatan ${label}. Maksudnya yang barusan? Bilang “hapus transaksi terakhir”.`, singkat: `Tidak ada catatan ${label}.` }), chips: ['hapus transaksi terakhir'] });
  const name = (x: LedgerTx) => x.description || ctx.data.categories.find(c => c.id === (x.subcategoryId || x.categoryId))?.name || x.type;
  return say('clarify', { card: 'talk', title: `Catatan ${label}`, text: vo(v, {
    santai: `Yang mana? ${cap(label)} ada ${list.length} catatan. Pilih yang mau dihapus, nanti kusiapin kartunya buat kamu konfirmasi.`,
    sopan: `Yang mana? Ada ${list.length} catatan ${label}. Silakan pilih yang ingin dihapus.`,
    gaul: `Yang mana nih? ${cap(label)} ada ${list.length} catatan, pilih satu.`,
    singkat: `Pilih yang mana (${list.length} catatan).`,
  }), lines: list.map(x => ({ label: name(x), value: rp(x.amount) })), chips: list.slice(0, 4).map(x => `hapus ${lower(name(x))} ${rp(x.amount).replace(/^Rp/, '').replace(/\./g, '')} ${label}`) });
}

/* ------------------------------------------------------------------ A friend paying back, without an amount */

const FRACTION: [RegExp, number, string][] = [
  [/\b(?:setengah|separuh|separo|1\/2)\b/, 0.5, 'setengah'], [/\bsepertiga\b|\b1\/3\b/, 1 / 3, 'sepertiga'], [/\bseperempat\b|\b1\/4\b/, 0.25, 'seperempat'],
];
/** "budi udah bayar utangnya", "dimas baru balikin setengah utangnya", "temen gue bayar utangnya": a Piutang paid back.
 * A known person: the rest they owe (or the part said), on a card to check. Not named: who, with their amounts. */
export function readPaidBack(t: string, ctx: ChatContext, v: Voice): Out | null {
  if (amountsOf(t).length) return null;
  const m = t.match(/^(?:(?:eh|oh|nah|alhamdulillah|akhirnya|btw)\s*,?\s+)*(?:si\s+)?([\p{L}]+(?:\s+[\p{L}]+){0,2}?)\s+(?:(?:udah|udh|sudah|dah|baru|akhirnya|barusan|tadi|td)\s+)*(?:bayar|bayarin|balikin|ngembaliin|kembaliin|mengembalikan|ngembalikan|lunasin|ngelunasin|melunasi|nyicil|transfer\s+balik|tf\s+balik|ganti|gantiin|nyetor|nyerahin)\s+(.*)\b(?:utang|hutang|pinjaman|duit|uang|kasbon|piutang)(?:nya)?\b(.*)$/u)
    || t.match(/^(?:(?:eh|oh|nah|alhamdulillah|akhirnya|btw)\s*,?\s+)*(?:si\s+)?([\p{L}]+)\s+(?:(?:udah|udh|sudah|dah|baru|akhirnya|barusan|tadi|td)\s+)+(?:bayar|balikin|ngembaliin|kembaliin|lunasin|lunas|transfer\s+balik|tf\s+balik|nyicil)()((?:\s+(?:setengah|separuh|semua|semuanya|sebagian|full|dong|nih|kok|tuh|ya))*)\s*$/u);
  if (!m) return null;
  const who = m[1].trim(), rest = `${m[2]} ${m[3]}`;
  if (ME.test(who) && who.split(' ').length === 1 || /^(?:aku|gue|gua|gw|saya|ane)\b/.test(who)) return null;
  const open = (ctx.data.receivables || []).filter(r => r.status !== 'paid' && r.remainingAmount > 0);
  if (!open.length) return null;
  const frac = FRACTION.find(([re]) => re.test(rest)), part = frac ? frac[1] : 1, some = /\b(?:sebagian|dikit|sedikit|separo|nyicil)\b/.test(rest) && !frac;
  // Without the word for the debt, only someone who owes ("dimas udah bayar"); anyone else is not this.
  if (!/\b(?:utang|hutang|pinjaman|duit|uang|kasbon|piutang)/.test(t) && !open.some(r => lower(r.person).split(/\s+/).some(w => w.length >= 3 && new RegExp(`\\b${esc(w)}\\b`).test(lower(who))))) return null;
  const person = open.find(r => lower(r.person).split(/\s+/).some(w => w.length >= 3 && new RegExp(`\\b${esc(w)}\\b`).test(lower(who))));
  if (person) {
    if (some) return say('clarify', { card: 'talk', text: vo(v, { santai: `${person.person} bayar berapa? Sisa piutangnya ${rp(person.remainingAmount)}.`, sopan: `Berapa yang dibayar ${person.person}? Sisa piutangnya ${rp(person.remainingAmount)}.`, gaul: `${person.person} bayar berapa? Sisanya ${rp(person.remainingAmount)}.`, singkat: `Berapa? Sisa ${rp(person.remainingAmount)}.` }), chips: [`${lower(person.person)} bayar utang ${amountWord(Math.round(person.remainingAmount / 2))}`, `${lower(person.person)} bayar utang ${amountWord(person.remainingAmount)}`] }, { person: lower(person.person) });
    const amount = Math.round(person.remainingAmount * part);
    const intro = vo(v, {
      santai: frac ? `${frac[2] === 'setengah' ? 'Setengah' : cap(frac[2])} dari sisa ${rp(person.remainingAmount)} = ${rp(amount)}. Sisanya nanti ${rp(person.remainingAmount - amount)}. Udah pas? Kalau beda, bilang nominalnya.` : `${person.person} lunasin semua sisa piutangnya, ${rp(amount)}. Kalau cuma sebagian, bilang nominalnya ya.`,
      sopan: frac ? `${cap(frac[2])} dari sisa ${rp(person.remainingAmount)} adalah ${rp(amount)}. Silakan periksa sebelum menyimpan.` : `${person.person} melunasi sisa piutang ${rp(amount)}. Bila hanya sebagian, sampaikan nominalnya.`,
      gaul: frac ? `${cap(frac[2])} dari ${rp(person.remainingAmount)} = ${rp(amount)}, sisa ${rp(person.remainingAmount - amount)}. Cek dulu ya.` : `${person.person} lunas ${rp(amount)}. Kalo cuma sebagian, bilang nominalnya.`,
      singkat: `${rp(amount)} dari sisa ${rp(person.remainingAmount)}.`,
    });
    return { plan: `${lower(person.person)} bayar utang ${amountWord(amount)}`, intro, memory: { person: lower(person.person) } };
  }
  // Someone not in the list, or not named ("temen gue"): who?
  const named = !/^(?:temen|teman|kawan|kwn|tmn|dia|doi|orang|orangnya|si\s+dia|sobat|bestie|sahabat)\b/.test(who);
  return say('clarify', { card: 'talk', text: vo(v, {
    santai: `${named ? `${cap(who)} belum ada di daftar piutangmu. ` : ''}Siapa yang bayar? Yang masih utang ke kamu: ${open.map(r => `${r.person} ${rp(r.remainingAmount)}`).join(', ')}.`,
    sopan: `${named ? `${cap(who)} belum tercatat sebagai piutang. ` : ''}Siapa yang membayar? Piutang yang masih berjalan: ${open.map(r => `${r.person} ${rp(r.remainingAmount)}`).join(', ')}.`,
    gaul: `${named ? `${cap(who)} gak ada di daftar piutang lo. ` : ''}Siapa yang bayar? Yang masih utang: ${open.map(r => `${r.person} ${rp(r.remainingAmount)}`).join(', ')}.`,
    singkat: `Siapa? ${open.map(r => `${r.person} ${rp(r.remainingAmount)}`).join(', ')}.`,
  }), chips: open.slice(0, 4).map(r => `${lower(r.person)} bayar utang ${amountWord(Math.round(r.remainingAmount * part))}`) });
}

/** "gue udah bayar utang ke kak rina", "lunasin cicilan hp": one's own debt paid, without an amount. All of it for "lunas";
 * otherwise how much, with the instalment and the whole rest to tap. */
export function readPaidDebt(t: string, ctx: ChatContext, v: Voice): Out | null {
  if (amountsOf(t).length) return null;
  const m = t.match(/^(?:(?:aku|gue|gua|gw|saya|ane)\s+)?(?:(?:udah|udh|sudah|dah|baru|barusan|tadi|td|akhirnya)\s+)*(bayar|nyicil|cicil|angsur|lunasin|ngelunasin|melunasi|nyetor)\s+(?:(?:utang|hutang|cicilan|pinjaman|kredit|tagihan)\s+)?(?:ke\s+|sama\s+|buat\s+)?(.+)$/)
    || (() => { const o = t.match(/^(?:utang|hutang|cicilan|pinjaman|kredit)\s+(?:ke\s+|sama\s+)?(.+?)\s+(?:(?:udah|udh|sudah|dah|baru|akhirnya|barusan)\s+)*(?:(?:aku|gue|gua|gw|saya)\s+)?(lunasin|lunas|bayar|cicil|nyicil|beres|kelar)\b/); return o ? [o[0], o[2], o[1]] as unknown as RegExpMatchArray : null; })();
  if (!m) return null;
  const said = m[2].replace(/\b(?:dong|ya|nih|sih|deh|aja|tadi|kemarin|bulan\s+ini)\b/g, ' ').replace(/[?.!,]/g, ' ').replace(/\s+/g, ' ').trim();
  const debts = (ctx.data.debts || []).filter(d => d.status !== 'paid' && d.outstandingAmount > 0);
  const hit = debts.filter(d => [d.name, d.provider].some(n => n && lower(n).split(/\s+/).filter(w => w.length >= 2 && !/^(?:cicilan|pinjaman|utang|hutang|kredit)$/.test(w)).some(w => new RegExp(`\\b${esc(w)}\\b`).test(said))));
  if (hit.length !== 1) return null;
  const d = hit[0], all = /lunas/.test(m[1]) || /\b(?:lunas|semua|semuanya|full|sampai\s+habis)\b/.test(t);
  if (all) return { plan: `bayar utang ${lower(d.name)} ${amountWord(d.outstandingAmount)}`, intro: vo(v, { santai: `Lunas semua sisa ${d.name}, ${rp(d.outstandingAmount)}. Udah pas? Pilih dompetnya, lalu Simpan.`, sopan: `Pelunasan sisa ${d.name} sebesar ${rp(d.outstandingAmount)}. Silakan periksa lalu Simpan.`, gaul: `Lunasin ${d.name}, ${rp(d.outstandingAmount)}. Cek dulu, terus Simpan.`, singkat: `${d.name}: ${rp(d.outstandingAmount)}.` }) };
  const chips = [...new Set([d.installmentAmount > 0 ? amountWord(d.installmentAmount) : '', amountWord(d.outstandingAmount)].filter(Boolean))].map(a => `bayar utang ${lower(d.name)} ${a}`);
  return say('clarify', { card: 'talk', text: vo(v, { santai: `Bayar ${d.name} berapa? Sisanya sekarang ${rp(d.outstandingAmount)}.`, sopan: `Berapa pembayaran ${d.name}? Sisa saat ini ${rp(d.outstandingAmount)}.`, gaul: `Bayar ${d.name} berapa? Sisa ${rp(d.outstandingAmount)}.`, singkat: `Berapa? Sisa ${rp(d.outstandingAmount)}.` }), chips });
}

/* ------------------------------------------------------------------ A record said without its amount */

const RECORD_CUE = /\b(?:tadi|td|tdi|barusan|abis|habis|udah|udh|sudah|dah|kemarin|kemaren|kmrn|beli|bayar|byr|catet|catat|catetin|catatin|masukin|masukkan|tambahin|tambahkan|isi|top\s?up|topup|pindahin|pindah|oper|operin|geser|alihin|transfer|tf|kirim|kirimin|transferin|tfin|gajian|dapet|dapat|terima|nerima|tarik|setor|setorin)\b/;
/** Words that say a record happened or is to be made, without naming what it was. */
const BARE = /\b(?:aku|gue|gua|gw|saya|ane|w|tadi|td|tdi|barusan|abis|habis|udah|udh|sudah|dah|kemarin|kemaren|kmrn|nih|dong|ya|deh|sih|tolong|tlg|makan|minum|ngopi|jajan|belanja|lagi|juga|aja)\b/g;
const DOING = /\b(?:beli|bayar|byr|catet|catat|catetin|catatin|masukin|masukkan|tambahin|tambahkan|isi|top\s?up|topup|pindahin|pindah|oper|operin|geser|alihin|transfer|transferin|tfin|tf|kirim|kirimin|tarik|setor|setorin)\b/;
/** "masukin uang lembur ke mandiri", "pindahin uang dari BRI ke Mandiri", "gue tadi makan ayam geprek": a record without
 * its amount. Asked for; the next message ("750rb") finishes it with every other word kept. */
export function readNoAmount(raw: string, t: string, ctx: ChatContext, v: Voice): Out | null {
  const words = t.split(' ').length;
  if (amountsOf(t).length || words < 2 || words > 12 || /\?\s*$/.test(raw) || /\b(?:berapa|brp|brapa|kapan|apa|apakah|gimana|gmn|bagaimana|siapa|kenapa|knp|cara|caranya|bisa|boleh|pengen|pengin|pingin|ingin|mau|mo|rencana|nanti|besok|kalau|kalo|klo|misal|andai)\b/.test(t)) return null;
  // Asking about records, not making one: totals, periods, budgets, whether money is enough, sharing a bill.
  if (/\b(?:total|jumlah|pengeluaran|pemasukan|rincian|rekap|ringkasan|laporan|riwayat|saldo|sisa|budget|anggaran|limit|batas|cukup|lama|tanggal|patungan|bagi|split|kebanyakan|terlalu|boros|hemat|irit|terakhir|biasanya|rata-rata|rata2|ada|punya)\b/.test(t) || /\b(?:ga|gak|nggak|ngga|enggak|kah|nggk|gk|belum|blm|belom)\s*$/.test(t)) return null;
  // "uang jajan gw udh abis": money run out, not something bought.
  if (/\b(?:uang|duit|saldo|dana|gaji|tabungan|jatah)\b.*\b(?:abis|habis|ludes|tipis|menipis|kosong|tekor|minus)\b/.test(t)) return null;
  // Telling why ("soalnya duit abis buat bayar kos") is part of a talk, not a record to fill in.
  if (/^(?:soalnya|karena|karna|krn|gara-gara|gara2|abisnya|habisnya|makanya)\b/.test(t)) return null;
  const span = readPeriod(t, ctx.today, ctx.salaryDay);
  if (span && span.start < daysBefore(ctx.today, 1)) return null;
  if (!RECORD_CUE.test(t)) return null;
  const said = raw.replace(/[.!?]+$/, '').trim(), probe = ctx.inspect(`${said} 10rb`);
  if (probe.reading !== 'record') return null;
  const wallets = walletsIn(t, ctx.quick.wallets);
  // Spending needs what it was for ("makan ayam geprek", "bayar parkir"), not only that something was eaten ("udah makan").
  const named = t.replace(BARE, ' ').replace(/[.,!?]/g, ' ').trim().length > 0;
  const ok = probe.kind === 'transfer' ? wallets.length >= 1 : probe.kind === 'income' ? Boolean(probe.categoryId || probe.subcategoryId || wallets.length) : probe.kind === 'expense' ? Boolean(probe.categoryId || probe.subcategoryId) && (named || DOING.test(t)) && !/^(?:(?:aku|gue|gua|gw|saya)\s+)?lagi\b/.test(t) : false;
  if (!ok) return null;
  const kind = probe.kind === 'income' ? 'income' : probe.kind === 'expense' ? 'expense' : 'any';
  const ask = probe.kind === 'transfer' ? vo(v, { santai: 'Berapa yang dipindah?', sopan: 'Berapa nominal yang dipindahkan?', gaul: 'Berapa yang dipindah?', singkat: 'Berapa?' })
    : probe.kind === 'income' ? vo(v, { santai: 'Berapa yang masuk?', sopan: 'Berapa nominal yang diterima?', gaul: 'Masuk berapa?', singkat: 'Berapa?' })
    : vo(v, { santai: 'Habis berapa?', sopan: 'Berapa nominalnya?', gaul: 'Abis berapa?', singkat: 'Berapa?' });
  // The person's usual amounts for the same thing, to tap.
  const chips = usualAmounts(ctx, probe.kind === 'transfer' ? undefined : probe.subcategoryId || probe.categoryId, probe.kind === 'income' ? 'income' : probe.kind === 'expense' ? 'expense' : 'transfer');
  return say('clarify', { card: 'talk', text: ask, ...(chips.length ? { chips } : {}) }, { start: { kind, item: said } });
}
/** The amounts the person recorded lately for a category (newest first, distinct), as chips ("8,5jt"). */
export function usualAmounts(ctx: ChatContext, categoryId: string | undefined | null, type: string) {
  if (!categoryId) return [];
  const cat = ctx.data.categories.find(c => c.id === categoryId), parent = cat?.parentId;
  // The same subcategory; else, for a subcategory, its main category recorded without one ("Gaji" for "Gaji Bulanan").
  const same = (x: LedgerTx) => x.subcategoryId === categoryId || !parent && x.categoryId === categoryId;
  const near = (x: LedgerTx) => Boolean(parent) && x.categoryId === parent && !x.subcategoryId;
  const txs = [...ctx.data.transactions].filter(x => x.type === type).sort((a, b) => b.date.localeCompare(a.date));
  const pool = txs.some(same) ? txs.filter(same) : txs.filter(near);
  const seen: string[] = [];
  for (const x of pool) {
    const w = amountWord(x.amount); if (!seen.includes(w)) seen.push(w);
    if (seen.length >= 3) break;
  }
  return seen;
}

/* ------------------------------------------------------------------ A budget, spent in thought */

/** "budget makan sisa berapa" → "kalau gue pake 100rb?" → "terus besok 75 ribu lagi": what the budget would have left. */
export function readBudgetWhatIf(t: string, ctx: ChatContext, v: Voice, memory: ChatMemory, current: (categoryText: string) => { name: string; remaining: number } | null): Out | null {
  const amounts = amountsOf(t);
  if (amounts.length !== 1 || t.split(' ').length > 9) return null;
  const sim = memory.budgetSim, asked = memory.question && /\b(?:budget|anggaran|limit)\b/.test(lower(memory.question)) ? memory.question : '';
  if (!sim && !asked) return null;
  const follow = /^(?:(?:terus|trus|lalu|nah|eh|oke|ok|tapi|tp)\s*,?\s+)*(?:(?:kalau|kalo|klo|kl|misal(?:nya)?|andai|gimana\s+kalau|gimana\s+kalo)\s+)?(?:(?:aku|gue|gua|gw|saya)\s+)?(?:(?:pake|pakai|pakek|beli|jajan|keluar(?:in)?|abisin|habisin|belanja|makan|tambah|nambah|ngabisin)\s+)?/.test(t)
    && (sim ? /\b(?:lagi|terus|trus|tambah|kalau|kalo|klo|besok|lusa|nanti)\b/.test(t) : /\b(?:kalau|kalo|klo|kl|misal|andai|gimana)\b/.test(t));
  if (!follow) return null;
  const base = sim || (() => { const b = current(asked); return b ? { name: b.name, left: b.remaining, used: 0 } : null; })();
  if (!base) return null;
  const used = (sim && /\b(?:lagi|terus|trus|tambah|nambah)\b/.test(t) ? base.used : 0) + amounts[0].value, after = base.left - used;
  return say('budget', { card: 'budget', title: `Anggaran ${base.name}`, text: vo(v, {
    santai: after >= 0 ? `Kalau dipakai ${rp(used)}${used !== amounts[0].value ? ' (total)' : ''}, sisa anggaran ${base.name} jadi ${rp(after)} dari ${rp(base.left)}. Ini simulasi, belum kucatat.` : `Kalau dipakai ${rp(used)}, anggaran ${base.name} jebol ${rp(-after)}. Ini simulasi, belum kucatat.`,
    sopan: after >= 0 ? `Bila terpakai ${rp(used)}, sisa anggaran ${base.name} menjadi ${rp(after)} dari ${rp(base.left)}. Ini simulasi dan belum dicatat.` : `Bila terpakai ${rp(used)}, anggaran ${base.name} terlampaui ${rp(-after)}.`,
    gaul: after >= 0 ? `Kalo kepake ${rp(used)}, sisa anggaran ${base.name} jadi ${rp(after)}. Simulasi doang, belum gue catet.` : `Kalo kepake ${rp(used)}, anggaran ${base.name} jebol ${rp(-after)}.`,
    singkat: `Sisa ${rp(after)}.`,
  }), hero: { label: `Sisa anggaran ${base.name}`, value: rp(after), note: `dari ${rp(base.left)}`, tone: after >= 0 ? 'good' : 'warn' }, tone: after >= 0 ? 'info' : 'warn', chips: [`catat makan ${amountWord(amounts[0].value)}`, 'cek semua anggaran'] }, { budgetSim: { name: base.name, left: base.left, used }, last: 'calc', number: after });
}
