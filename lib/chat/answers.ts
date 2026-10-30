/**
 * 8.3 (chat v3) — answers the chat works out itself from the person's data:
 *
 *   - Uang bebas now ("uang bebasku berapa", "duit gue tinggal berapa") and the daily allowance to payday
 *     ("sehari boleh jajan berapa");
 *   - saving sums ("nabung 500rb sebulan kapan dapet 10jt", "mau 12jt dalam 6 bulan, sebulan berapa",
 *     "nabung 20rb sehari setahun dapet berapa"), carried on by "kalau 1jt per bulan?";
 *   - the share of one kind of spending ("berapa persen pengeluaran buat makan"), spending per category ("rincian
 *     pengeluaran bulan ini"), where to cut ("harus hemat di mana") and the health score from Insight;
 *   - one debt, receivable, goal, wish-list item, recurring bill or office claim by its name ("cicilan hp sisa
 *     berapa", "dimas kapan bayar", "laptop baru kurang berapa", "netflix kapan bayar", "klaim taksi udah cair?"),
 *     the nearest bill, and "kalau dimas?" after one of them.
 *
 * Each answer is a card; nothing is recorded.
 */
import { metrics } from '../accounting.ts';
import { categoryBreakdown, DEBT_GROUP } from '../category-analytics.ts';
import { analyzeFinances } from '../advisor.ts';
import { readPeriod, spendingShare } from '../catat/ask.ts';
import { committedAmount } from '../finance-control.ts';
import { findAmounts, walletsIn, type QuickContext } from '../quick-entry.ts';
import type { Data } from '../types';
import { vo } from './fun.ts';
import type { Voice } from './voice.ts';

type AnswerData = Pick<Data, 'wallets' | 'transactions' | 'budgets' | 'categories' | 'funds' | 'debts' | 'receivables' | 'claims'> & Partial<Pick<Data, 'recurring' | 'wishlist' | 'drafts' | 'plannedTransactions'>>;
export type AnswerCtx = { data: AnswerData; today: string; salaryDay: number; cycle: { start: string; end: string }; quick: QuickContext };
type Line = { label: string; value: string; tone?: 'up' | 'down' | 'good' | 'warn' };
export type Answer = {
  intent: 'summary' | 'question' | 'calc' | 'module' | 'tips' | 'payday';
  title: string; text: string; hero?: { label: string; value: string; note?: string; tone?: 'good' | 'warn' | 'info' };
  stats?: Line[]; lines?: { label: string; value: string }[]; bars?: { label: string; value: string; ratio: number; note?: string }[];
  open?: { view: string; label: string }; chips?: string[]; why?: string;
  /** What a follow-up ("kalau 1jt per bulan?", "kalau dimas?") builds on. */
  saving?: Saving; item?: string;
};
export type Saving = { rate?: number; unit?: Unit; target?: number; months?: number };
type Unit = 'day' | 'week' | 'month';

const rp = (n: number) => `${n < 0 ? '−' : ''}Rp${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 86_400_000);
const dm = (iso: string) => D(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthYear = (today: string, months: number) => { const d = D(today); d.setUTCMonth(d.getUTCMonth() + months); return d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const pct = (n: number) => `${Math.round(n * 100)}%`;
const lower = (s: string) => s.toLocaleLowerCase('id-ID');
/** "20 bulan (1 tahun 8 bulan)". */
const monthsText = (n: number) => n >= 12 ? `${n} bulan (${Math.floor(n / 12)} tahun${n % 12 ? ` ${n % 12} bulan` : ''})` : `${n} bulan`;

/** The data with every list the app keeps (some callers pass only the ones the chat reads). */
const full = (data: AnswerData): Data => ({ recurring: [], wishlist: [], drafts: [], plannedTransactions: [], categorizationRules: [], financialNotes: [], cycleSnapshots: [], ...data });
/** Uang bebas, as Beranda counts it, and the days to payday. */
export function moneyNow(ctx: AnswerCtx) {
  const m = metrics(full(ctx.data), ctx.cycle.start, ctx.cycle.end, ctx.salaryDay, new Date(`${ctx.today}T12:00:00`));
  const left = Math.max(1, daysBetween(ctx.today, ctx.cycle.end)), passed = Math.max(1, daysBetween(ctx.cycle.start, ctx.today) + 1);
  const balance = ctx.data.wallets.filter(w => !w.isArchived).reduce((n, w) => n + (w.cachedBalance || 0), 0);
  return { m, free: m.free, left, passed, daily: m.free / left, pace: m.expenses / passed, balance };
}

/* ------------------------------------------------------------------ Uang bebas and the daily allowance */

/** Asked about the money left: "uang bebas" always; "duit gue tinggal" only with a question (else it is venting). */
const FREE = /\buang(?:ku|mu|nya)?\s+(?:(?:aku|gue|saya|kamu)\s+)?(?:(?:bebas|siap\s+pakai|nganggur)(?:ku|mu|nya)?|yang\s+bebas|(?:yang\s+)?(?:bisa|boleh)\s+(?:(?:aku|gue|saya|kamu)\s+)?(?:di|ku)?(?:pakai|pake|dipakai|dipake)|yang\s+(?:bener|benar)(?:[-\s](?:bener|benar)|2)?\s+(?:bebas|bisa)|yang\s+belum\s+ada\s+tujuan\w*)\b|\b(?:sisa|tinggal)\s+uang(?:ku|mu)?\b(?=.*\b(?:berapa|brp|apa)\b)|\buang(?:ku|mu)?\s+(?:aku|gue|saya|kamu)?\s*(?:tinggal|sisa|masih)\b(?=.*\b(?:berapa|brp|apa)\b)|\b(?:masih\s+)?punya\s+uang\s+berapa\b|\bmasih\s+(?:punya|ada)\s+(?:uang|berapa\s+uang)\b(?=.*\b(?:berapa|brp|apa)\b)|\bmasih\s+ada\s+berapa\s+uang\b|\byang\s+bisa\s+(?:ku|di)?(?:pakai|pake|dipakai)\s+(?:sampai|sampe)\s+gajian\b|\bsisa\s+uang\s+yang\s+bisa\b/;
const NOT_FREE = /\b(?:itu\s+apa|apa\s+itu|artinya|maksudnya|dihitung|ngitung|hitungnya|rumus|akhir\s+(?:bulan|siklus)|pas\s+gajian|saat\s+gajian|waktu\s+gajian|perkiraan|prediksi|proyeksi)\b/;
const DAILY = /\b(?:jatah|budget|limit|batas|uang|anggaran)\s+(?:harian|per\s*hari|perhari|sehari)\b|\b(?:jatah|budget|limit)\s+(?:jajan\s+)?harian\b|\b(?:sehari|per\s*hari|perhari|per\s+harinya|perharinya|tiap\s+hari)\b.{0,30}\b(?:boleh|bisa|aman|maksimal|maks|limit|jatah)\b|\b(?:boleh|bisa)\s+(?:jajan|belanja|habis|habisin|keluar|pakai|pake)\s+berapa\s+(?:sehari|per\s*hari)\b|\b(?:sampai|sampe)\s+gajian\b.{0,20}\bsehari\s+berapa\b|\bsehari\s+(?:aman|maksimal|maks)\b|\bmaksimal\s+(?:habisin|ngabisin|belanja|keluar)\s+berapa\b|\bsehari\s+habisin\s+berapa\b/;

function freeMoney(ctx: AnswerCtx, v: Voice): Answer {
  const n = moneyNow(ctx), reserved = Math.max(0, n.m.reserved || 0);
  return {
    intent: 'summary', title: 'Uang bebas',
    text: vo(v, {
      santai: `Uang bebasmu sekarang ${rp(n.free)}. Itu saldo yang belum disisihkan buat tujuan dan tagihan sampai gajian. Biar cukup ${n.left} hari lagi, sehari sekitar ${rp(n.daily)}.`,
      sopan: `Uang bebas Anda saat ini ${rp(n.free)}, yaitu saldo yang belum disisihkan untuk tujuan dan tagihan hingga gajian. Agar cukup ${n.left} hari lagi, sekitar ${rp(n.daily)} per hari.`,
      gaul: `Uang bebas lo sekarang ${rp(n.free)}. Biar aman ${n.left} hari ke gajian, sehari ±${rp(n.daily)}.`,
      singkat: `Uang bebas ${rp(n.free)}.`,
      barbar: `Uang bebas lo tinggal ${rp(n.free)}, anjir. ${n.left} hari lagi gajian, sehari jangan lewat ${rp(n.daily)}.`,
    }),
    hero: { label: 'Uang bebas sekarang', value: rp(n.free), note: `≈ ${rp(n.daily)}/hari · ${n.left} hari ke gajian`, tone: n.free > 0 ? 'good' : 'warn' },
    stats: [{ label: 'Total saldo', value: rp(n.balance) }, ...(reserved ? [{ label: 'Disisihkan', value: rp(reserved) }] : []), { label: 'Jatah per hari', value: rp(Math.max(0, n.daily)) }],
    why: 'Uang bebas dihitung sama seperti di Beranda: saldo dompet yang bisa dipakai, dikurangi uang yang disisihkan untuk tujuan dan tagihan sampai gajian.',
    chips: ['sehari boleh jajan berapa', 'ringkasan bulan ini'], open: { view: 'dashboard', label: 'Buka Beranda' },
  };
}
function dailyAllowance(ctx: AnswerCtx, v: Voice): Answer {
  const n = moneyNow(ctx), daily = Math.max(0, n.daily), tight = daily < n.pace;
  return {
    intent: 'payday', title: 'Jatah harian',
    text: vo(v, {
      santai: `Biar cukup sampai gajian (${n.left} hari lagi), sehari maksimal sekitar ${rp(daily)}. ${tight ? `Rata-rata belanjamu ${rp(n.pace)}/hari, jadi perlu direm sedikit.` : `Rata-rata belanjamu ${rp(n.pace)}/hari, masih aman.`}`,
      sopan: `Agar cukup hingga gajian (${n.left} hari lagi), batas harian Anda sekitar ${rp(daily)}. Rata-rata pengeluaran Anda ${rp(n.pace)} per hari.`,
      gaul: `Sampai gajian ${n.left} hari lagi, sehari max ${rp(daily)}. ${tight ? 'Rem dikit ya.' : 'Masih aman.'}`,
      singkat: `Jatah ${rp(daily)}/hari, ${n.left} hari ke gajian.`,
      barbar: `Sehari max ${rp(daily)}, jangan kalap. ${n.left} hari lagi gajian, bego kalau sampai minus.`,
    }),
    hero: { label: 'Jatah per hari', value: rp(daily), note: `${n.left} hari ke gajian`, tone: tight ? 'warn' : 'good' },
    stats: [{ label: 'Uang bebas', value: rp(n.free) }, { label: 'Rata-rata belanja', value: `${rp(n.pace)}/hari`, tone: tight ? 'warn' : 'good' }],
    why: `Jatah harian adalah uang bebas ${rp(n.free)} dibagi ${n.left} hari sampai gajian.`,
    chips: ['uang bebasku berapa', 'kasih tips hemat'],
  };
}

/* ------------------------------------------------------------------ Saving sums */

const SAVE_WORD = /\b(?:nabung|menabung|nyisihin|nyisihkan|menyisihkan|sisihkan|sisihin|nyimpen|nyimpan|simpan|ngumpulin|mengumpulkan|kumpulin|terkumpul|kekumpul|ngumpul|target|punya|dapet|dapat|jadi|tiap\s+bulan)\b/;
const SAVE_ASK = /\b(?:berapa\p{L}*|brp\p{L}*|brapa\p{L}*|brpa\p{L}*|kapan|lama|gimana)\b|\?/u;
const NUMBER_WORDS: Record<string, number> = { se: 1, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, setengah: 0.5, seperempat: 0.25 };
/** "sejuta", "setengah juta", "dua juta", "seratus ribu": amounts written in words, as digits. */
const wordAmounts = (t: string) => t
  .replace(/\b(se|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|setengah|seperempat)\s*(juta|jt)\b/g, (_, n, __) => `${NUMBER_WORDS[n] * 1000}rb`)
  .replace(/\b(se|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)\s*ratus\s*(?:ribu|rb)\b/g, (_, n) => `${NUMBER_WORDS[n] * 100}rb`)
  .replace(/\bseratus\b(?=\s*(?:ribu|rb)\b)/g, '100').replace(/\bsejuta\b/g, '1000rb');
const UNIT_AFTER: [RegExp, Unit][] = [[/^\s*(?:per\s*bulan|perbulan|sebulan|tiap\s+bulan|setiap\s+bulan|\/\s*(?:bulan|bln)|per\s+bln|bulanan)\b/, 'month'], [/^\s*(?:per\s*hari|perhari|sehari|tiap\s+hari|setiap\s+hari|\/\s*hari)\b/, 'day'], [/^\s*(?:per\s*minggu|perminggu|seminggu|tiap\s+minggu|setiap\s+minggu|\/\s*minggu)\b/, 'week']];
const UNIT_BEFORE: [RegExp, Unit][] = [[/(?:per\s*bulan|perbulan|sebulan|tiap\s+bulan|setiap\s+bulan)\s+(?:\p{L}+\s+)?$/u, 'month'], [/(?:per\s*hari|perhari|sehari|tiap\s+hari|setiap\s+hari)\s+(?:\p{L}+\s+)?$/u, 'day'], [/(?:per\s*minggu|seminggu|tiap\s+minggu)\s+(?:\p{L}+\s+)?$/u, 'week']];
const MONTH_NAMES = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
const PER_MONTH: Record<Unit, number> = { day: 30, week: 52 / 12, month: 1 };

/** The amounts in a message, each with its rate unit when it has one ("500rb per bulan"), and the durations. */
function quantities(t: string, today: string) {
  const amounts = findAmounts(t).filter(a => a.value > 0).map(a => {
    const at = t.indexOf(a.text), after = t.slice(at + a.text.length), before = t.slice(0, at);
    const unit = UNIT_AFTER.find(([re]) => re.test(after))?.[1] || UNIT_BEFORE.find(([re]) => re.test(before))?.[1];
    return { value: a.value, unit, text: a.text, at, end: at + a.text.length + (unit ? (after.match(UNIT_AFTER.find(([re]) => re.test(after))?.[0] || /^$/)?.[0].length || 0) : 0) };
  });
  // Durations not taken by a rate: "dalam 6 bulan", "selama 2 tahun", "setahun", "bulan maret".
  let rest = t;
  for (const a of amounts) { const unitAfter = UNIT_AFTER.find(([re]) => re.test(t.slice(a.at + a.text.length))); rest = rest.replace(a.text + (unitAfter ? t.slice(a.at + a.text.length).match(unitAfter[0])![0] : ''), ' # '); }
  rest = rest.replace(/\b(?:sebulan|seminggu|sehari)\s+(?=(?:\p{L}+\s+)?#)/gu, ' ');
  let months: number | undefined, days: number | undefined;
  const dur = rest.match(/\b(\d+(?:[.,]\d+)?|se|satu|dua|tiga|empat|lima|enam)\s*(tahun|thn|bulan|bln|minggu|hari)\b/);
  if (dur) {
    const words: Record<string, number> = { se: 1, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6 };
    const n = words[dur[1]] ?? Number(dur[1].replace(',', '.')), unit = dur[2];
    if (/^(?:tahun|thn)$/.test(unit)) months = n * 12; else if (/^(?:bulan|bln)$/.test(unit)) months = n; else if (unit === 'minggu') days = n * 7; else days = n;
  } else {
    const until = rest.match(new RegExp(`\\b(?:bulan\\s+)?(${MONTH_NAMES.join('|')})\\b`));
    if (until && /\b(?:target|sampai|sampe|di|pas|bulan)\b/.test(rest)) { const now = Number(today.slice(5, 7)) - 1, at = MONTH_NAMES.indexOf(until[1]); months = ((at - now + 12) % 12) || 12; }
  }
  return { amounts, months, days };
}
export function readSaving(text: string, today: string, v: Voice, last?: Saving): Answer | null {
  // Words of address before it ("min, kalau 1jt per bulan?") are not part of the sum.
  const t = wordAmounts(text.replace(/^(?:(?:eh|ehh|min|bot|kak|halo|hai|bang|bro|sis|cek|mau\s+tanya)\s*[,!:.]?\s+)+/, ''));
  const q = quantities(t, today);
  let rate = q.amounts.find(a => a.unit), target = q.amounts.find(a => !a.unit);
  let s: Saving = { ...(rate ? { rate: rate.value, unit: rate.unit } : {}), ...(target ? { target: target.value } : {}), ...(q.months ? { months: q.months } : q.days ? { months: q.days / 30 } : {}) };
  const follow = last && /^(?:kalau|kalo|klo|kl|terus|trus|gimana\s+kalau|gimana\s+kalo|misal|misalnya)\b/.test(t) && t.split(' ').length <= 7;
  if (follow && last) {
    // "kalau 1jt per bulan?" / "kalo sejuta?": a new rate for the same target; "kalau 9 bulan?": a new duration.
    if (!rate && target && last.rate !== undefined && last.target !== undefined) { rate = { ...target, unit: last.unit }; target = undefined; s = { rate: rate.value, unit: last.unit }; }
    s = { ...last, ...s };
  } else {
    if (!SAVE_WORD.test(t) || !SAVE_ASK.test(t)) return null;
    if (q.amounts.length === 0 || q.amounts.length > 2) return null;
  }
  const out = (title: string, text: string, hero: Answer['hero'], lines: { label: string; value: string }[], why: string): Answer => ({ intent: 'calc', title, text, hero, lines, why, saving: s, chips: ['kalau 1jt per bulan?', 'bikin tujuan dana'] });
  if (s.rate !== undefined && s.unit && s.target !== undefined && s.months === undefined) {
    const perMonth = s.rate * PER_MONTH[s.unit], months = Math.ceil(s.target / perMonth - 1e-9);
    const unitWord = { day: 'hari', week: 'minggu', month: 'bulan' }[s.unit];
    return out('Hitung nabung', vo(v, {
      santai: `Kalau nabung ${rp(s.rate)} per ${unitWord}, ${rp(s.target)} terkumpul dalam ${monthsText(months)}, sekitar ${monthYear(today, months)}.`,
      sopan: `Dengan menabung ${rp(s.rate)} per ${unitWord}, ${rp(s.target)} akan terkumpul dalam ${monthsText(months)}, sekitar ${monthYear(today, months)}.`,
      gaul: `Nabung ${rp(s.rate)}/${unitWord}, ${rp(s.target)} kekumpul ${monthsText(months)} lagi, kira-kira ${monthYear(today, months)}.`,
      singkat: `${monthsText(months)} (${monthYear(today, months)}).`,
      barbar: `Nabung ${rp(s.rate)}/${unitWord} doang, ${rp(s.target)} baru kekumpul ${monthsText(months)} lagi (${monthYear(today, months)}). Sabar, jangan jajan mulu.`,
    }), { label: 'Lama menabung', value: monthsText(months), note: `sekitar ${monthYear(today, months)}`, tone: 'info' },
    [{ label: 'Target', value: rp(s.target) }, { label: `Nabung per ${unitWord}`, value: rp(s.rate) }], `${rp(s.target)} dibagi ${rp(perMonth)} per bulan = ${(s.target / perMonth).toLocaleString('id-ID', { maximumFractionDigits: 1 })}, dibulatkan ke atas jadi ${months} bulan.`);
  }
  if (s.target !== undefined && s.months && s.rate === undefined) {
    const perMonth = Math.ceil(s.target / s.months), perDay = Math.ceil(s.target / (s.months * 30));
    return out('Hitung nabung', vo(v, {
      santai: `Biar dapat ${rp(s.target)} dalam ${monthsText(Math.round(s.months))}, sisihkan ${rp(perMonth)} per bulan (sekitar ${rp(perDay)} sehari).`,
      sopan: `Untuk mengumpulkan ${rp(s.target)} dalam ${monthsText(Math.round(s.months))}, sisihkan ${rp(perMonth)} per bulan (sekitar ${rp(perDay)} per hari).`,
      gaul: `${rp(s.target)} dalam ${Math.round(s.months)} bulan? Sisihin ${rp(perMonth)}/bulan, ±${rp(perDay)} sehari.`,
      singkat: `${rp(perMonth)}/bulan.`,
      barbar: `Mau ${rp(s.target)} dalam ${Math.round(s.months)} bulan? Sisihin ${rp(perMonth)} tiap bulan, jangan bolong, anjir.`,
    }), { label: 'Nabung per bulan', value: rp(perMonth), note: `±${rp(perDay)}/hari`, tone: 'info' },
    [{ label: 'Target', value: rp(s.target) }, { label: 'Waktu', value: monthsText(Math.round(s.months)) }], `${rp(s.target)} dibagi ${Math.round(s.months)} bulan, dibulatkan ke atas.`);
  }
  if (s.rate !== undefined && s.unit && (s.months || q.days)) {
    const periods = s.unit === 'month' ? (s.months || 0) : s.unit === 'week' ? (q.days ? q.days / 7 : (s.months || 0) * 52 / 12) : (q.days || ((s.months || 0) === 12 ? 365 : (s.months || 0) * 30));
    const total = s.rate * Math.round(periods), span = q.days ? `${q.days} hari` : monthsText(Math.round(s.months || 0));
    const unitWord = { day: 'hari', week: 'minggu', month: 'bulan' }[s.unit];
    return out('Hitung nabung', vo(v, {
      santai: `Nabung ${rp(s.rate)} per ${unitWord} selama ${span}, jadinya ${rp(total)}.`,
      sopan: `Menabung ${rp(s.rate)} per ${unitWord} selama ${span} menghasilkan ${rp(total)}.`,
      gaul: `${rp(s.rate)}/${unitWord} × ${span} = ${rp(total)}.`,
      singkat: `${rp(total)}.`,
      barbar: `${rp(s.rate)}/${unitWord} selama ${span} jadi ${rp(total)}. Lumayan kan, asal ga jajan.`,
    }), { label: 'Terkumpul', value: rp(total), note: span, tone: 'good' }, [{ label: `Nabung per ${unitWord}`, value: rp(s.rate) }, { label: 'Selama', value: span }], `${rp(s.rate)} × ${Math.round(periods)} ${unitWord}.`);
  }
  return null;
}

/* ------------------------------------------------------------------ Shares, categories, cutting back, health */

const PERCENT = /\b(?:berapa\s+persen|persen(?:tase)?|porsi|proporsi)\b/;
const BREAKDOWN = /\b(?:per\s+kategori|rincian|rinciin|breakdown|dibagi\s+per|lari\s+ke\s+mana|ke\s+mana\s+aja|habis\s+(?:buat|untuk)\s+apa\s+(?:aja|saja)|abis\s+(?:buat|untuk)\s+apa|kategori\s+(?:apa\s+|mana\s+)?(?:yang\s+)?(?:paling|ter)\s*(?:boros|besar|gede|banyak)|kategori\s+paling\s+\p{L}+|pos\s+(?:pengeluaran\s+)?(?:terbesar|paling\s+\p{L}+)|pos\s+pengeluaran)\b/u;
const CUT = /\b(?:hemat|ngirit|irit|dikurangi|dikurangin|ngurangin|kurangin|kurangi|dipotong|potong|pangkas|dipangkas|kupangkas|dihemat)\b/;
const CUT_ASK = /\b(?:di\s*mana|dimana|mana|apa|bagian|mulai|kategori|pos|yang\s+mana|saran)\b/;
const SCORE = /\b(?:skor|nilai|rapor|kesehatan)\b.{0,30}\b(?:keuangan|finansial)\w*\b|\b(?:keuangan|finansial)\w*\b.{0,25}\b(?:sehat|skor|nilai|rapor)\b|\bsehat\b.{0,25}\bkeuangan\w*\b|\bfinancial\s+health\b|\bnilai\s+finansial\b/;
const NEEDS = new Set(['expense.tagihan', 'expense.biaya-keuangan', 'expense.pendidikan', 'expense.kesehatan', DEBT_GROUP.id, 'uncategorized']);

function periodOf(t: string, ctx: AnswerCtx) {
  const p = readPeriod(t, ctx.today, ctx.salaryDay);
  return p ? { start: p.start, end: p.end, label: p.label, said: p.said } : { start: ctx.cycle.start, end: ctx.cycle.end, label: 'siklus ini', said: '' };
}
/** Spending per main category, as Beranda and Laporan count it (debt payments without a category: "Bayar utang"). */
function byCategory(ctx: AnswerCtx, start: string, end: string) {
  return categoryBreakdown(ctx.data.transactions.filter(t => t.date >= start && t.date < end && t.date <= ctx.today), ctx.data.categories).map(c => ({ id: c.id, name: c.name, amount: c.amount }));
}
function share(t: string, ctx: AnswerCtx, v: Voice): Answer | null {
  const p = periodOf(t, ctx);
  const phrase = t.replace(p.said, ' ').replace(/\b(?:berapa|persen(?:tase)?|porsi|proporsi|dari|total|semua|seluruh|pengeluaran\p{L}*|nyedot|ngambil|ambil|bagian|tuh|itu)\b/gu, ' ').replace(/[?]/g, ' ');
  const s = spendingShare(phrase, ctx.quick, p);
  if (!s || !s.total) return null;
  const ratio = s.part / s.total;
  return {
    intent: 'question', title: `Porsi ${s.name}`,
    text: vo(v, {
      santai: `${s.name} ${pct(ratio)} dari pengeluaran ${p.label}: ${rp(s.part)} dari ${rp(s.total)}.`,
      sopan: `${s.name} mengambil ${pct(ratio)} dari pengeluaran ${p.label}, yaitu ${rp(s.part)} dari ${rp(s.total)}.`,
      gaul: `${s.name} nyedot ${pct(ratio)} pengeluaran ${p.label} (${rp(s.part)} dari ${rp(s.total)}).`,
      singkat: `${pct(ratio)} (${rp(s.part)} dari ${rp(s.total)}).`,
      barbar: `${s.name} makan ${pct(ratio)} duit lo ${p.label}, ${rp(s.part)} dari ${rp(s.total)}. ${ratio >= .3 ? 'Gila, kebanyakan.' : 'Masih wajar lah.'}`,
    }),
    bars: [{ label: s.name, value: rp(s.part), ratio, note: pct(ratio) }], why: `${rp(s.part)} dibagi seluruh pengeluaran ${p.label} ${rp(s.total)}.`, chips: ['rincian pengeluaran bulan ini'],
  };
}
function breakdown(t: string, ctx: AnswerCtx, v: Voice): Answer | null {
  const p = periodOf(t, ctx), list = byCategory(ctx, p.start, p.end), total = list.reduce((n, c) => n + c.amount, 0);
  if (!total) return { intent: 'question', title: 'Rincian pengeluaran', text: `Belum ada pengeluaran ${p.label}.` };
  const top = list[0];
  return {
    intent: 'question', title: `Rincian pengeluaran ${p.label}`,
    text: vo(v, {
      santai: `Pengeluaran ${p.label} ${rp(total)}. Paling besar di ${top.name}: ${rp(top.amount)} (${pct(top.amount / total)}).`,
      sopan: `Total pengeluaran ${p.label} ${rp(total)}. Porsi terbesar ${top.name} sebesar ${rp(top.amount)} (${pct(top.amount / total)}).`,
      gaul: `${p.label.charAt(0).toUpperCase() + p.label.slice(1)} keluar ${rp(total)}, paling gede ${top.name} ${rp(top.amount)}.`,
      singkat: `${top.name} ${rp(top.amount)} (${pct(top.amount / total)}).`,
      barbar: `${p.label.charAt(0).toUpperCase() + p.label.slice(1)} lo ngabisin ${rp(total)}, paling banyak buat ${top.name} ${rp(top.amount)}. Hadeh.`,
    }),
    hero: { label: `Total ${p.label}`, value: rp(total), tone: 'info' },
    bars: list.slice(0, 6).map(c => ({ label: c.name, value: rp(c.amount), ratio: c.amount / total, note: pct(c.amount / total) })),
    why: 'Pengeluaran dijumlah per kategori utama; transaksi yang dibagi ke beberapa kategori dihitung per bagiannya.', open: { view: 'report', label: 'Buka Laporan' }, chips: ['harus hemat di mana', 'kalau bulan lalu?'],
  };
}
function cutBack(ctx: AnswerCtx, v: Voice): Answer {
  // Needs by their name too (a category of one's own like "Sewa Kos" or "Cicilan").
  const list = byCategory(ctx, ctx.cycle.start, ctx.cycle.end).filter(c => !NEEDS.has(c.id) && !/\b(?:sewa|kos|kost|kontrakan|tagihan|listrik|air|internet|cicilan|utang|pajak|asuransi|pendidikan|sekolah|kuliah|kesehatan|obat|dokter|zakat)\b/i.test(c.name)).slice(0, 3);
  if (!list.length) return { intent: 'tips', title: 'Mau hemat di mana', text: 'Belum ada pengeluaran siklus ini yang bisa dibandingkan.' };
  const first = list[0];
  return {
    intent: 'tips', title: 'Paling bisa dihemat',
    text: vo(v, {
      santai: `Mulai dari ${first.name}: siklus ini ${rp(first.amount)}. Potong 20% saja sudah hemat ${rp(first.amount * .2)}.${list[1] ? ` Berikutnya ${list[1].name} (${rp(list[1].amount)}).` : ''}`,
      sopan: `Kategori yang paling memungkinkan dihemat adalah ${first.name} (${rp(first.amount)} siklus ini). Pengurangan 20% menghemat sekitar ${rp(first.amount * .2)}.${list[1] ? ` Selanjutnya ${list[1].name} (${rp(list[1].amount)}).` : ''}`,
      gaul: `Paling gampang potong ${first.name}, siklus ini ${rp(first.amount)}. Kurangin 20% aja udah hemat ${rp(first.amount * .2)}.`,
      singkat: `${first.name}: hemat 20% = ${rp(first.amount * .2)}.`,
      barbar: `${first.name} lo ${rp(first.amount)} siklus ini, anjir. Potong 20% aja udah hemat ${rp(first.amount * .2)}.${list[1] ? ` Terus ${list[1].name} juga, ${rp(list[1].amount)}.` : ''}`,
    }),
    lines: list.map(c => ({ label: c.name, value: `${rp(c.amount)} · hemat 20% = ${rp(c.amount * .2)}` })),
    why: 'Yang dihitung pengeluaran siklus ini di luar kebutuhan tetap (tagihan, biaya bank, pendidikan, kesehatan).', chips: ['kasih tips hemat', 'rincian pengeluaran bulan ini'],
  };
}
function health(ctx: AnswerCtx, v: Voice): Answer {
  const n = moneyNow(ctx);
  const advice = analyzeFinances({ data: full(ctx.data), history: ctx.data.transactions, today: ctx.today, salaryDay: ctx.salaryDay, monthlySalary: 0, warnPercent: 80, stat: { free: n.m.free, reserved: n.m.reserved, netWorth: n.m.netWorth, liabilities: n.m.liabilities }, committed: committedAmount(full(ctx.data), ctx.today, ctx.cycle.end, {}), profile: null });
  const label = advice.score >= 75 ? 'Sehat' : advice.score >= 55 ? 'Cukup sehat' : advice.score >= 40 ? 'Perlu perhatian' : 'Rawan';
  const weak = [...advice.parts].sort((a, b) => a.score - b.score)[0];
  return {
    intent: 'summary', title: 'Skor kesehatan keuangan',
    text: vo(v, {
      santai: `Skor kesehatan keuanganmu ${advice.score} dari 100 (${label}). Yang paling perlu dirapikan: ${weak.label.toLowerCase()} (${weak.value}).`,
      sopan: `Skor kesehatan keuangan Anda ${advice.score} dari 100 (${label}). Aspek yang paling perlu diperhatikan: ${weak.label.toLowerCase()} (${weak.value}).`,
      gaul: `Skor keuangan lo ${advice.score}/100, ${label.toLowerCase()}. PR-nya di ${weak.label.toLowerCase()}.`,
      singkat: `${advice.score}/100 (${label}).`,
      barbar: `Skor lo ${advice.score}/100, ${label.toLowerCase()}. ${advice.score >= 75 ? 'Tumben bener, anjir.' : `Benerin tuh ${weak.label.toLowerCase()}.`}`,
    }),
    hero: { label: 'Skor kesehatan', value: `${advice.score}/100`, note: label, tone: advice.score >= 75 ? 'good' : advice.score >= 55 ? 'info' : 'warn' },
    lines: advice.parts.map(p => ({ label: p.label, value: `${Math.round(p.score)}/100 · ${p.value}` })),
    why: 'Skornya sama dengan di Insight: gabungan rasio menabung, dana darurat, beban cicilan, disiplin anggaran, bekal sampai gajian, dan arah pengeluaran.', open: { view: 'advisor', label: 'Buka Insight' }, chips: ['harus hemat di mana', 'ringkasan bulan ini'],
  };
}

/* ------------------------------------------------------------------ One item by its name */

const GENERIC = new Set(['cicilan', 'pinjaman', 'utang', 'hutang', 'kak', 'kakak', 'bang', 'mas', 'mbak', 'dana', 'tabungan', 'target', 'baru', 'makan', 'beli', 'bayar', 'uang', 'klien', 'meeting', 'buat', 'untuk', 'lari', 'lainnya', 'tagihan', 'langganan', 'klaim', 'dinas']);
const ITEM_ASK = /\b(?:berapa|kapan|gimana|seberapa|sisa|tinggal|kurang|udah|sudah|belum|blm|masih|ada|progress|progres|persen|persentase|status|harga(?:nya)?|nilainya|totalnya|sebulan|per\s+bulan|jatuh\s+tempo|cair|lunas|kelar|beres|kebeli|tercapai|kekumpul|terkumpul|ditabung|nunggak|balikin|janji)\b|\?|^(?:piutang|utang|hutang|cicilan|tabungan|klaim|reimburse|progress|sisa)\b/;
type Item = { kind: 'debt' | 'receivable' | 'fund' | 'wish' | 'recurring' | 'claim'; id: string; keys: string[]; name: string };
function items(data: AnswerData): Item[] {
  const words = (s: string) => lower(s).split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2 && !GENERIC.has(w));
  return [
    ...data.debts.filter(d => d.status !== 'paid' && d.outstandingAmount > 0).map(d => ({ kind: 'debt' as const, id: d.id, name: d.name, keys: [...words(d.name), ...words(d.provider || '')] })),
    ...data.receivables.filter(r => r.status !== 'paid' && r.remainingAmount > 0).map(r => ({ kind: 'receivable' as const, id: r.id, name: r.person, keys: words(r.person) })),
    ...data.funds.filter(f => !f.isArchived).map(f => ({ kind: 'fund' as const, id: f.id, name: f.name, keys: f.kind === 'emergency' ? ['darurat'] : words(f.name) })),
    ...(data.wishlist || []).filter(w => w.status === 'active').map(w => ({ kind: 'wish' as const, id: w.id, name: w.name, keys: words(w.name) })),
    ...(data.recurring || []).filter(r => r.active).map(r => ({ kind: 'recurring' as const, id: r.id, name: r.name, keys: words(r.name) })),
    ...(data.claims || []).filter(c => c.status !== 'paid' && c.status !== 'rejected').map(c => ({ kind: 'claim' as const, id: c.id, name: c.name, keys: words(c.name) })),
  ].filter(i => i.keys.length);
}
const HINT: Record<Item['kind'], RegExp> = {
  debt: /\b(?:utang|hutang|cicilan|pinjaman|kredit|lunas|kelar|beres|tanggungan)\b/, receivable: /\b(?:piutang|belum\s+bayar|balikin|minjem|pinjem|nunggak|dipinjam|janji)\b/,
  fund: /\b(?:tabungan|target|dana|tercapai|kekumpul|terkumpul|progress|progres|persen|kebeli)\b/, wish: /\b(?:wish\s?list|incaran|harga|ditabung)\b/,
  recurring: /\b(?:langganan|tagihan|jatuh\s+tempo|tanggal\s+berapa|sebulan|per\s+bulan|ditagih)\b/, claim: /\b(?:klaim|reimburse|reimbursement|cair)\b/,
};
/** Words that ask, not name: what is left after them should be the item's own name. */
const ITEM_STOP = new Set('aku gue gw saya kamu lo ku mu nya yang yg ke di dari buat untuk lagi udah sudah masih aja saja dong sih ya nih deh kak min bot kapan berapa gimana apa siapa total semua semuanya sisa sisanya tinggal kurang harga harganya jadi bisa mau pengen uang duit utang hutang cicilan cicilannya tabungan target dana tercapai kekumpul terkumpul progress progres persen persentase kebeli wishlist wish list incaran barang ditabung langganan tagihan jatuh tempo tanggal sebulan bulan per ditagih klaim reimburse cair dibayar piutang belum bayar balikin minjem pinjem nunggak dipinjam janji lunas kelar beres tanggungan isinya nilainya status kalau kalo terus trus seberapa ada nyampe sampai sampe capai mencapai kekejar dapet dapat punya baru udh blm brp tuh dulu cek'.split(' '));
function findItem(t: string, data: AnswerData, prefer?: string) {
  const list = t.split(/[^\p{L}\p{N}]+/u).filter(Boolean), words = new Set(list);
  let best: { item: Item; score: number } | null = null;
  for (const item of items(data)) {
    const hit = item.keys.filter(k => words.has(k)).length;
    if (!hit) continue;
    // "liburan bali" is not "Liburan Jepang": with part of a name matched, another name word left over means another item.
    if (hit < item.keys.length && list.some(w => w.length >= 3 && !ITEM_STOP.has(w) && !GENERIC.has(w) && !item.keys.includes(w))) continue;
    const score = hit + (HINT[item.kind].test(t) ? .5 : 0) + (prefer === item.kind ? .25 : 0);
    if (!best || score > best.score) best = { item, score };
  }
  return best?.item || null;
}
function itemAnswer(item: Item, ctx: AnswerCtx, v: Voice): Answer {
  const { data, today } = ctx, you = vo(v, { santai: 'kamu', sopan: 'Anda', gaul: 'lo', singkat: 'kamu', barbar: 'lo' });
  if (item.kind === 'debt') {
    const d = data.debts.find(x => x.id === item.id)!, months = d.installmentAmount > 0 ? Math.ceil(d.outstandingAmount / d.installmentAmount) : 0;
    const who = d.provider && lower(d.provider) !== lower(d.name) ? ` (${d.provider})` : '';
    return { intent: 'module', item: item.kind, title: d.name, text: `Sisa ${d.name}${who} ${rp(d.outstandingAmount)} dari ${rp(d.originalAmount)}. ${months ? `Cicilan ${rp(d.installmentAmount)}/bulan, lunas sekitar ${monthsText(months)} lagi (${monthYear(today, months)}).` : 'Belum ada cicilan rutin, jadi belum ada perkiraan lunas.'}${d.dueDate ? ` Jatuh tempo berikutnya ${dm(d.dueDate)}.` : ''}`,
      hero: { label: 'Sisa utang', value: rp(d.outstandingAmount), note: months ? `lunas ±${monthYear(today, months)}` : undefined, tone: 'warn' }, open: { view: 'debts', label: 'Buka Utang' }, chips: ['total utang aku berapa'] };
  }
  if (item.kind === 'receivable') {
    const r = data.receivables.find(x => x.id === item.id)!;
    return { intent: 'module', item: item.kind, title: `Piutang ${r.person}`, text: `${r.person} masih utang ${rp(r.remainingAmount)} ke ${you}${r.description ? ` (${r.description})` : ''}${r.originalAmount !== r.remainingAmount ? `, dari ${rp(r.originalAmount)}` : ''}. ${r.dueDate ? `Janji bayar ${dm(r.dueDate)}${r.dueDate < today ? ', sudah lewat' : ''}.` : 'Belum ada tanggal janji bayar.'}`,
      hero: { label: 'Belum dibayar', value: rp(r.remainingAmount), note: r.dueDate ? `janji ${dm(r.dueDate)}` : undefined, tone: 'info' }, open: { view: 'receivables', label: 'Buka Piutang' }, chips: ['siapa aja yang belum bayar'] };
  }
  if (item.kind === 'fund') {
    const f = data.funds.find(x => x.id === item.id)!, left = Math.max(0, f.targetAmount - f.currentAmount), ratio = f.targetAmount ? f.currentAmount / f.targetAmount : 0;
    const months = f.monthlyContribution > 0 && left > 0 ? Math.ceil(left / f.monthlyContribution) : 0;
    return { intent: 'module', item: item.kind, title: f.name, text: `${f.name}: terkumpul ${rp(f.currentAmount)} dari ${rp(f.targetAmount)} (${pct(ratio)}). ${left ? `Kurang ${rp(left)}.` : 'Sudah tercapai! 🎉'}${months ? ` Dengan ${rp(f.monthlyContribution)}/bulan, tercapai sekitar ${monthsText(months)} lagi (${monthYear(today, months)}).` : ''}${f.targetDate ? ` Targetnya ${D(f.targetDate).toLocaleDateString('id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' })}.` : ''}`,
      hero: { label: 'Terkumpul', value: rp(f.currentAmount), note: `${pct(ratio)} dari ${rp(f.targetAmount)}`, tone: 'good' }, bars: [{ label: f.name, value: pct(ratio), ratio: Math.min(1, ratio) }], open: { view: 'funds', label: 'Buka Tujuan' } };
  }
  if (item.kind === 'wish') {
    const w = (data.wishlist || []).find(x => x.id === item.id)!, left = Math.max(0, w.price - (w.saved || 0));
    return { intent: 'module', item: item.kind, title: w.name, text: `${w.name} ${rp(w.price)}. ${w.saved ? `Sudah ditabung ${rp(w.saved)}, kurang ${rp(left)}.` : `Belum ada yang ditabung (Rp0), kurang ${rp(left)}.`}`,
      hero: { label: 'Kurang', value: rp(left), note: `dari ${rp(w.price)}`, tone: 'info' }, open: { view: 'wishlist', label: 'Buka Wish list' } };
  }
  if (item.kind === 'recurring') {
    const r = (data.recurring || []).find(x => x.id === item.id)!, every = { weekly: 'minggu', monthly: 'bulan', yearly: 'tahun' }[r.frequency], days = daysBetween(today, r.nextDate);
    return { intent: 'module', item: item.kind, title: r.name, text: `${r.name} ${rp(r.amount)} per ${every}, berikutnya ${dm(r.nextDate)}${days >= 0 ? ` (${days === 0 ? 'hari ini' : days === 1 ? 'besok' : `${days} hari lagi`})` : ''}.`,
      hero: { label: 'Berikutnya', value: dm(r.nextDate), note: rp(r.amount), tone: 'info' }, open: { view: 'recurring', label: 'Buka Transaksi rutin' } };
  }
  const c = data.claims.find(x => x.id === item.id)!, state = { draft: 'masih draf, belum diajukan', submitted: 'sudah diajukan, belum cair', waiting: 'masih menunggu, belum cair', approved: 'sudah disetujui, belum cair', paid: 'sudah cair', rejected: 'ditolak' }[c.status];
  return { intent: 'module', item: item.kind, title: `Klaim ${c.name}`, text: `Klaim ${c.name} ${rp(c.remainingAmount)}: ${state}.${c.expectedPaymentDate ? ` Perkiraan cair ${dm(c.expectedPaymentDate)}.` : ''}`,
    hero: { label: 'Belum cair', value: rp(c.remainingAmount), note: c.expectedPaymentDate ? `perkiraan ${dm(c.expectedPaymentDate)}` : undefined, tone: 'info' }, open: { view: 'claims', label: 'Buka Klaim' } };
}
const NEAREST = /\b(?:tagihan|bayaran|cicilan|jatuh\s+tempo)\b.{0,20}\b(?:terdekat|paling\s+(?:deket|dekat)|duluan|berikutnya|selanjutnya)\b|\byang\s+harus\s+dibayar\s+(?:duluan|dulu|pertama)\b/;
const WISH_ALL = /\b(?:wish\s?list|barang\s+incaran|incaran)\b.{0,20}\b(?:apa|isinya|aja|saja)\b/;
const CLAIM_TOTAL = /\b(?:total|semua)\b.{0,20}\bklaim\b|\bklaim\b.{0,25}\b(?:yang\s+)?belum\s+(?:cair|balik|dibayar)\b.{0,15}\b(?:total|berapa)|\buang\s+klaim\b/;
function nearestBill(ctx: AnswerCtx, v: Voice): Answer | null {
  const { data, today } = ctx;
  const due = [...(data.recurring || []).filter(r => r.active && r.type === 'expense' && r.nextDate >= today).map(r => ({ name: r.name, date: r.nextDate, amount: r.amount })),
    ...data.debts.filter(d => d.status !== 'paid' && d.dueDate && d.dueDate >= today).map(d => ({ name: d.name, date: d.dueDate, amount: d.installmentAmount || d.outstandingAmount }))].sort((a, b) => a.date.localeCompare(b.date));
  if (!due.length) return null;
  const first = due[0], days = daysBetween(today, first.date);
  return { intent: 'module', title: 'Tagihan terdekat', text: vo(v, {
    santai: `Paling dekat ${first.name} ${rp(first.amount)}, ${dm(first.date)} (${days === 0 ? 'hari ini' : `${days} hari lagi`}).`, sopan: `Tagihan terdekat adalah ${first.name} sebesar ${rp(first.amount)} pada ${dm(first.date)}.`,
    gaul: `Yang paling deket ${first.name} ${rp(first.amount)}, ${dm(first.date)}.`, singkat: `${first.name} ${rp(first.amount)}, ${dm(first.date)}.`, barbar: `${first.name} ${rp(first.amount)} tanggal ${dm(first.date)}, jangan sampe lupa bayar, anjir.` }),
    lines: due.slice(0, 5).map(x => ({ label: `${x.name} · ${dm(x.date)}`, value: rp(x.amount) })), open: { view: 'upcoming', label: 'Buka Mendatang' } };
}
export function readItem(t: string, ctx: AnswerCtx, v: Voice, lastItem?: string): Answer | null {
  if (findAmounts(t).some(a => a.marked || a.value >= 1000)) return null;
  if (NEAREST.test(t)) return nearestBill(ctx, v);
  if (WISH_ALL.test(t)) {
    const list = (ctx.data.wishlist || []).filter(w => w.status === 'active');
    if (list.length) return { intent: 'module', title: 'Wish list', text: `Ada ${list.length} barang incaran: ${list.map(w => w.name).join(', ')}.`, lines: list.map(w => ({ label: w.name, value: `${rp(w.price)} · kurang ${rp(Math.max(0, w.price - (w.saved || 0)))}` })), open: { view: 'wishlist', label: 'Buka Wish list' } };
  }
  if (CLAIM_TOTAL.test(t)) {
    const open = (ctx.data.claims || []).filter(c => c.status !== 'paid' && c.status !== 'rejected' && c.remainingAmount > 0);
    if (open.length) return { intent: 'module', title: 'Klaim belum cair', text: `${open.length} klaim belum cair, totalnya ${rp(open.reduce((n, c) => n + c.remainingAmount, 0))}.`, lines: open.map(c => ({ label: c.name, value: rp(c.remainingAmount) })), open: { view: 'claims', label: 'Buka Klaim' } };
  }
  // "dana darurat cukup berapa bulan" is about months of spending (the module answers it), not the fund's balance.
  if (/\bdarurat\b/.test(t) && /\b(?:cukup|tahan|bertahan|aman)\b/.test(t)) return null;
  // Right after one item, a short message naming another is the same question about it ("laptop baru?", "kalau dimas?").
  const follow = lastItem && (t.split(' ').length <= 3 || t.split(' ').length <= 5 && /^(?:kalau|kalo|klo|kl|terus|trus|yang|yg|gimana|kalau\s+yang|kalo\s+yang)\b/.test(t));
  if (!follow && !ITEM_ASK.test(t)) return null;
  const item = findItem(t, ctx.data, lastItem);
  if (item) return itemAnswer(item, ctx, v);
  // "liburan bali kapan kekumpul" with no such goal: say so, and offer to make one.
  const goal = /\bkapan\b/.test(t) ? t.match(/^(?:target\s+|tabungan\s+)?([\p{L}\s]{3,30}?)\s+(?:kapan\s+)?(?:kekumpul|terkumpul|tercapai|kebeli)\b/u)?.[1]?.replace(/\b(?:kapan|udah|sudah|aku|gue|saya|eh|yang|yg|nih|sih)\b/g, '').replace(/\s{2,}/g, ' ').trim() : '';
  if (goal && goal.length >= 3 && goal.split(' ').length <= 3) return { intent: 'module', title: 'Tujuan dana', text: `Belum ada tujuan dana “${goal}”. Mau kubuatkan? Bilang targetnya, misalnya “target ${goal} 5jt”.`, chips: [`target ${goal} 5jt`, 'progres target tabungan'], open: { view: 'funds', label: 'Buka Tujuan' } };
  return null;
}

/* ------------------------------------------------------------------ Wallet balances */

const BALANCE_WORD = /\b(?:saldo|isi|isinya|sisa|tinggal|masih|ada|uang|duit)\b/;
const SPEND_WORD = /\b(?:pengeluaran\p{L}*|habis|abis|keluar|belanja|bayar|beli|jajan|transaksi|kali|pakai|pake|buat|untuk|masuk|pemasukan)\b/u;
const ALL_WALLETS = /\b(?:saldo|isi|duit|uang)\b.{0,20}\bsemua\s+(?:dompet|rekening|akun|tabungan)\b|\bsemua\s+(?:dompet|rekening)\b.{0,15}\b(?:berapa|totalnya|isinya)\b|^saldo\s+(?:aku|gue|saya)?\s*(?:semua(?:nya)?\s*)?(?:berapa)?$/;
/** "isi jago berapa", "gopay aku sisa berapa", "uang cash berapa": one wallet's balance; "saldo semua dompet": all. */
function walletBalance(t: string, ctx: AnswerCtx, v: Voice): Answer | null {
  // "saldo gopay berapa", "total uang di semua dompet": Catat otomatis answers those (with its card), as before.
  if (/\bsaldo\b|^total\b/.test(t) || SPEND_WORD.test(t) || readPeriod(t, ctx.today, ctx.salaryDay)) return null;
  const live = ctx.data.wallets.filter(w => !w.isArchived);
  const named = walletsIn(` ${t} `, ctx.quick.wallets)[0], w = named && live.find(x => x.id === named.id);
  if (w && BALANCE_WORD.test(t)) return { intent: 'question', title: `Saldo ${w.name}`, text: vo(v, { santai: `Saldo ${w.name} sekarang ${rp(w.cachedBalance)}.`, sopan: `Saldo ${w.name} saat ini ${rp(w.cachedBalance)}.`, gaul: `${w.name} lo isinya ${rp(w.cachedBalance)}.`, singkat: `${w.name}: ${rp(w.cachedBalance)}.`, barbar: `${w.name} lo tinggal ${rp(w.cachedBalance)}, jaga baik-baik.` }), hero: { label: w.name, value: rp(w.cachedBalance) }, open: { view: 'wallets', label: 'Buka Dompet' }, chips: ['saldo semua dompet berapa'] };
  if (!w && ALL_WALLETS.test(t)) {
    const total = live.reduce((n, x) => n + x.cachedBalance, 0), shown = [...live].filter(x => x.cachedBalance).sort((a, b) => b.cachedBalance - a.cachedBalance);
    return { intent: 'question', title: 'Saldo semua dompet', text: `Total saldo di ${live.length} dompet: ${rp(total)}.`, hero: { label: 'Total saldo', value: rp(total) }, lines: shown.slice(0, 6).map(x => ({ label: x.name, value: rp(x.cachedBalance) })), open: { view: 'wallets', label: 'Buka Dompet' }, chips: ['uang bebasku berapa'] };
  }
  return null;
}

/* ------------------------------------------------------------------ All of them */

/** The v3 answer for a message without an amount, or null. Order matters: specific before general. */
export function readAnswer(t: string, ctx: AnswerCtx, v: Voice, memory: { item?: string } = {}): Answer | null {
  // A price or sum is a record or a calculation; "skor brp dari 100" or "tanggal 5" are not money.
  if (findAmounts(t).some(a => a.marked || a.value >= 1000)) return null;
  const item = readItem(t, ctx, v, memory.item);
  if (item) return item;
  const balance = walletBalance(t, ctx, v);
  if (balance) return balance;
  if (SCORE.test(t)) return health(ctx, v);
  if (PERCENT.test(t)) { const s = share(t, ctx, v); if (s) return s; }
  if (BREAKDOWN.test(t) && !/\b(?:anggaran|budget)\b/.test(t)) return breakdown(t, ctx, v);
  if (CUT.test(t) && CUT_ASK.test(t) && !/\b(?:tips|cara)\b/.test(t) && !/\bhemat\s+(?:ga|gak|nggak|ngga|enggak)\b/.test(t)) return cutBack(ctx, v);
  if (DAILY.test(t) && !NOT_FREE.test(t)) return dailyAllowance(ctx, v);
  if (FREE.test(t) && !NOT_FREE.test(t)) return freeMoney(ctx, v);
  return null;
}
