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
import { metrics, transactionExpense, transactionIncome } from '../accounting.ts';
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
  /** 8.4 The one record answered ("dia kapan bayar?", "buat apa dulu?" are about it next). */
  about?: ItemRef;
};
export type ItemRef = { kind: 'debt' | 'receivable' | 'fund' | 'wish' | 'recurring' | 'claim'; id: string };
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
  return p ? { start: p.start, end: p.end, label: p.label, said: p.said, prev: p.prev } : { start: ctx.cycle.start, end: ctx.cycle.end, label: 'siklus ini', said: '', prev: undefined as { start: string; end: string; label: string } | undefined };
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
/**
 * 8.4 Asked right after a spending total ("pengeluaran bulan ini berapa" → "yang paling besar apa?" / "kenapa banyak
 * banget"): the period comes from that question. The biggest: the main category and the single biggest spending. Why so
 * much: the categories it went to, and what grew most against the same days of the period before.
 */
export function spendingMore(kind: 'biggest' | 'why' | 'compare', asked: string, ctx: AnswerCtx, v: Voice): Answer | null {
  if (kind === 'compare') return compareTotals(asked, ctx, v);
  const p = periodOf(asked, ctx), list = byCategory(ctx, p.start, p.end), total = list.reduce((n, c) => n + c.amount, 0);
  if (!total) return { intent: 'question', title: kind === 'why' ? 'Kenapa segitu' : 'Paling besar', text: `Belum ada pengeluaran ${p.label}.` };
  const [top, second] = list, bars = list.slice(0, 5).map(c => ({ label: c.name, value: rp(c.amount), ratio: c.amount / total, note: pct(c.amount / total) }));
  if (kind === 'biggest') {
    const big = ctx.data.transactions.filter(x => x.date >= p.start && x.date < p.end && x.date <= ctx.today).map(x => ({ x, spent: transactionExpense(x) })).filter(y => y.spent > 0).sort((a, b) => b.spent - a.spent)[0];
    const what = big ? (big.x.merchant || big.x.description || ctx.data.categories.find(c => c.id === (big.x.subcategoryId || big.x.categoryId))?.name || 'Tanpa nama') : '';
    const one = big ? ` Transaksi terbesarnya ${what} ${rp(big.spent)} (${dm(big.x.date)}).` : '';
    return {
      intent: 'question', title: `Paling besar ${p.label}`,
      text: vo(v, {
        santai: `Paling banyak ${p.label} buat ${top.name}: ${rp(top.amount)} (${pct(top.amount / total)} dari ${rp(total)}).${one}`,
        sopan: `Porsi terbesar ${p.label} adalah ${top.name} sebesar ${rp(top.amount)} (${pct(top.amount / total)} dari ${rp(total)}).${one}`,
        gaul: `Paling gede ${p.label} ${top.name}, ${rp(top.amount)} (${pct(top.amount / total)}).${one}`,
        singkat: `${top.name} ${rp(top.amount)} (${pct(top.amount / total)}).${one}`,
        barbar: `Paling banyak lo buang ${p.label} buat ${top.name}, ${rp(top.amount)} (${pct(top.amount / total)}).${one}`,
      }),
      hero: { label: top.name, value: rp(top.amount), note: `${pct(top.amount / total)} dari ${rp(total)}`, tone: 'info' }, bars,
      why: 'Pengeluaran dijumlah per kategori utama; transaksi terbesar dicari dari semua pengeluaran di periode itu.', open: { view: 'report', label: 'Buka Laporan' }, chips: ['harus hemat di mana', 'kalau bulan lalu?'],
    };
  }
  const b = before(p, ctx.today), prev = b ? byCategory(ctx, b.start, b.end) : [], then = new Map(prev.map(c => [c.id, c.amount])), was = prev.reduce((n, c) => n + c.amount, 0);
  const grew = list.map(c => ({ ...c, up: c.amount - (then.get(c.id) || 0) })).filter(c => c.up > 0).sort((x, y) => y.up - x.up)[0];
  const parts = second ? `${top.name} ${rp(top.amount)} dan ${second.name} ${rp(second.amount)}` : `${top.name} ${rp(top.amount)}`;
  const share = second ? pct((top.amount + second.amount) / total) : pct(top.amount / total);
  const growth = b && was && grew ? ` Dibanding ${b.label}, yang paling naik ${grew.name} (+${rp(grew.up)}).` : '';
  return {
    intent: 'question', title: `Kenapa ${p.label} segitu`,
    text: vo(v, {
      santai: `Pengeluaran ${p.label} ${rp(total)}, ${share} di antaranya ${parts}.${growth}`,
      sopan: `Dari pengeluaran ${p.label} sebesar ${rp(total)}, ${share} berasal dari ${parts}.${growth}`,
      gaul: `${p.label.charAt(0).toUpperCase() + p.label.slice(1)} keluar ${rp(total)}, ${share}-nya ke ${parts}.${growth}`,
      singkat: `${parts} (${share}).${growth}`,
      barbar: `Duit ${p.label} ${rp(total)}, ${share}-nya kesedot ${parts}. Pantes.${growth}`,
    }),
    hero: { label: `Total ${p.label}`, value: rp(total), tone: 'info' }, bars,
    why: b ? `Pengeluaran dijumlah per kategori utama, lalu dibandingkan dengan ${b.label}.` : 'Pengeluaran dijumlah per kategori utama.', open: { view: 'report', label: 'Buka Laporan' }, chips: ['harus hemat di mana', 'kasih tips hemat'],
  };
}
/** The period before, cut to the same number of days when this one is not over yet ("1–15 Sep" for this month). */
function before(p: { start: string; end: string; prev?: { start: string; end: string; label: string } }, today: string) {
  if (!p.prev) return null;
  const day = (iso: string, n: number) => { const d = D(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const upTo = day(today, 1), running = p.end > upTo;
  const end = running ? [day(p.prev.start, daysBetween(p.start, upTo)), p.prev.end].sort()[0] : p.prev.end, last = day(end, -1);
  const label = !running ? p.prev.label : p.prev.start === last ? dm(last) : p.prev.start.slice(0, 7) === last.slice(0, 7) ? `${Number(p.prev.start.slice(8))}–${dm(last)}` : `${dm(p.prev.start)}–${dm(last)}`;
  return { start: p.prev.start, end, label, running, nowEnd: running ? upTo : p.end };
}
/** 8.4 "dibanding sebelumnya gimana?" after a total: the same days of the period before when this one is not over yet. */
function compareTotals(asked: string, ctx: AnswerCtx, v: Voice): Answer | null {
  const p = periodOf(asked, ctx), b = before(p, ctx.today);
  if (!b) return null;
  const income = /\b(?:pemasukan|penghasilan|pendapatan|gaji|income|masuk)\b/.test(asked) && !/\b(?:pengeluaran|keluar|belanja|habis|abis)\b/.test(asked);
  const running = b.running, prevLabel = b.label;
  const sum = (start: string, end: string) => ctx.data.transactions.filter(x => x.date >= start && x.date < end && x.date <= ctx.today).reduce((n, x) => n + (income ? transactionIncome(x) : transactionExpense(x)), 0);
  const now = sum(p.start, b.nowEnd), was = sum(b.start, b.end), diff = now - was;
  const ratio = was ? Math.abs(diff) / was : 0, what = income ? 'Pemasukan' : 'Pengeluaran';
  const word = diff === 0 ? 'sama' : income ? (diff > 0 ? 'naik' : 'turun') : (diff > 0 ? 'lebih boros' : 'lebih hemat');
  const amount = diff === 0 ? '' : ` ${rp(Math.abs(diff))}${was ? ` (${pct(ratio)})` : ''}`;
  return {
    intent: 'question', title: `${p.label.charAt(0).toUpperCase() + p.label.slice(1)} vs ${prevLabel}`,
    text: vo(v, {
      santai: `${what} ${p.label} ${rp(now)}, ${word}${amount} dibanding ${prevLabel} (${rp(was)}).`,
      sopan: `${what} ${p.label} ${rp(now)}, ${word}${amount} dibandingkan ${prevLabel} (${rp(was)}).`,
      gaul: `${what} ${p.label} ${rp(now)}, ${word}${amount} dari ${prevLabel} (${rp(was)}).`,
      singkat: `${rp(now)} vs ${rp(was)}: ${word}${amount}.`,
      barbar: `${what} ${p.label} ${rp(now)}, ${word}${amount} dari ${prevLabel} (${rp(was)}).${!income && diff > 0 ? ' Rem, bos.' : ''}`,
    }),
    stats: [{ label: p.label.charAt(0).toUpperCase() + p.label.slice(1), value: rp(now) }, { label: prevLabel, value: rp(was) }, { label: 'Selisih', value: `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${rp(Math.abs(diff))}`, tone: diff === 0 ? undefined : (diff > 0) === income ? 'good' : 'warn' }],
    why: running ? `${p.label} belum selesai, jadi dibandingkan dengan hari yang sama di periode sebelumnya (${prevLabel}).` : `${p.label} dibandingkan dengan ${prevLabel}.`, chips: ['yang paling besar apa?', 'rinciannya dong'],
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
    return { intent: 'module', item: item.kind, about: { kind: item.kind, id: item.id }, title: d.name, text: `Sisa ${d.name}${who} ${rp(d.outstandingAmount)} dari ${rp(d.originalAmount)}. ${months ? `Cicilan ${rp(d.installmentAmount)}/bulan, lunas sekitar ${monthsText(months)} lagi (${monthYear(today, months)}).` : 'Belum ada cicilan rutin, jadi belum ada perkiraan lunas.'}${d.dueDate ? ` Jatuh tempo berikutnya ${dm(d.dueDate)}.` : ''}`,
      hero: { label: 'Sisa utang', value: rp(d.outstandingAmount), note: months ? `lunas ±${monthYear(today, months)}` : undefined, tone: 'warn' }, open: { view: 'debts', label: 'Buka Utang' }, chips: ['total utang aku berapa'] };
  }
  if (item.kind === 'receivable') {
    const r = data.receivables.find(x => x.id === item.id)!;
    return { intent: 'module', item: item.kind, about: { kind: item.kind, id: item.id }, title: `Piutang ${r.person}`, text: `${r.person} masih utang ${rp(r.remainingAmount)} ke ${you}${r.description ? ` (${r.description})` : ''}${r.originalAmount !== r.remainingAmount ? `, dari ${rp(r.originalAmount)}` : ''}. ${r.dueDate ? `Janji bayar ${dm(r.dueDate)}${r.dueDate < today ? ', sudah lewat' : ''}.` : 'Belum ada tanggal janji bayar.'}`,
      hero: { label: 'Belum dibayar', value: rp(r.remainingAmount), note: r.dueDate ? `janji ${dm(r.dueDate)}` : undefined, tone: 'info' }, open: { view: 'receivables', label: 'Buka Piutang' }, chips: ['siapa aja yang belum bayar'] };
  }
  if (item.kind === 'fund') {
    const f = data.funds.find(x => x.id === item.id)!, left = Math.max(0, f.targetAmount - f.currentAmount), ratio = f.targetAmount ? f.currentAmount / f.targetAmount : 0;
    const months = f.monthlyContribution > 0 && left > 0 ? Math.ceil(left / f.monthlyContribution) : 0;
    return { intent: 'module', item: item.kind, about: { kind: item.kind, id: item.id }, title: f.name, text: `${f.name}: terkumpul ${rp(f.currentAmount)} dari ${rp(f.targetAmount)} (${pct(ratio)}). ${left ? `Kurang ${rp(left)}.` : 'Sudah tercapai! 🎉'}${months ? ` Dengan ${rp(f.monthlyContribution)}/bulan, tercapai sekitar ${monthsText(months)} lagi (${monthYear(today, months)}).` : ''}${f.targetDate ? ` Targetnya ${D(f.targetDate).toLocaleDateString('id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' })}.` : ''}`,
      hero: { label: 'Terkumpul', value: rp(f.currentAmount), note: `${pct(ratio)} dari ${rp(f.targetAmount)}`, tone: 'good' }, bars: [{ label: f.name, value: pct(ratio), ratio: Math.min(1, ratio) }], open: { view: 'funds', label: 'Buka Tujuan' } };
  }
  if (item.kind === 'wish') {
    const w = (data.wishlist || []).find(x => x.id === item.id)!, left = Math.max(0, w.price - (w.saved || 0));
    return { intent: 'module', item: item.kind, about: { kind: item.kind, id: item.id }, title: w.name, text: `${w.name} ${rp(w.price)}. ${w.saved ? `Sudah ditabung ${rp(w.saved)}, kurang ${rp(left)}.` : `Belum ada yang ditabung (Rp0), kurang ${rp(left)}.`}`,
      hero: { label: 'Kurang', value: rp(left), note: `dari ${rp(w.price)}`, tone: 'info' }, open: { view: 'wishlist', label: 'Buka Wish list' } };
  }
  if (item.kind === 'recurring') {
    const r = (data.recurring || []).find(x => x.id === item.id)!, every = { weekly: 'minggu', monthly: 'bulan', yearly: 'tahun' }[r.frequency], days = daysBetween(today, r.nextDate);
    return { intent: 'module', item: item.kind, about: { kind: item.kind, id: item.id }, title: r.name, text: `${r.name} ${rp(r.amount)} per ${every}, berikutnya ${dm(r.nextDate)}${days >= 0 ? ` (${days === 0 ? 'hari ini' : days === 1 ? 'besok' : `${days} hari lagi`})` : ''}.`,
      hero: { label: 'Berikutnya', value: dm(r.nextDate), note: rp(r.amount), tone: 'info' }, open: { view: 'recurring', label: 'Buka Transaksi rutin' } };
  }
  const c = data.claims.find(x => x.id === item.id)!, state = { draft: 'masih draf, belum diajukan', submitted: 'sudah diajukan, belum cair', waiting: 'masih menunggu, belum cair', approved: 'sudah disetujui, belum cair', paid: 'sudah cair', rejected: 'ditolak' }[c.status];
  return { intent: 'module', item: item.kind, about: { kind: item.kind, id: item.id }, title: `Klaim ${c.name}`, text: `Klaim ${c.name} ${rp(c.remainingAmount)}: ${state}.${c.expectedPaymentDate ? ` Perkiraan cair ${dm(c.expectedPaymentDate)}.` : ''}`,
    hero: { label: 'Belum cair', value: rp(c.remainingAmount), note: c.expectedPaymentDate ? `perkiraan ${dm(c.expectedPaymentDate)}` : undefined, tone: 'info' }, open: { view: 'claims', label: 'Buka Klaim' } };
}
const NEAREST = /\b(?:tagihan|bayaran|cicilan|jatuh\s+tempo)\b.{0,20}\b(?:terdekat|paling\s+(?:deket|dekat)|duluan|berikutnya|selanjutnya)\b|\byang\s+harus\s+dibayar\s+(?:duluan|dulu|pertama)\b/;
const WISH_ALL = /\b(?:wish\s?list|barang\s+incaran|incaran)\b.{0,20}\b(?:apa|isinya|aja|saja)\b/;
const CLAIM_TOTAL = /\b(?:total|semua)\b.{0,20}\bklaim\b|\bklaim\b.{0,25}\b(?:yang\s+)?belum\s+(?:cair|balik|dibayar)\b.{0,15}\b(?:total|berapa)|\buang\s+klaim\b/;
function nearestBill(ctx: AnswerCtx, v: Voice): Answer | null {
  const { data, today } = ctx;
  const due = [...(data.recurring || []).filter(r => r.active && r.type === 'expense' && r.nextDate >= today).map(r => ({ name: r.name, date: r.nextDate, amount: r.amount, ref: { kind: 'recurring' as const, id: r.id } })),
    ...data.debts.filter(d => d.status !== 'paid' && d.dueDate && d.dueDate >= today).map(d => ({ name: d.name, date: d.dueDate, amount: d.installmentAmount || d.outstandingAmount, ref: { kind: 'debt' as const, id: d.id } }))].sort((a, b) => a.date.localeCompare(b.date));
  if (!due.length) return null;
  const first = due[0], days = daysBetween(today, first.date);
  return { intent: 'module', about: first.ref, title: 'Tagihan terdekat', text: vo(v, {
    santai: `Paling dekat ${first.name} ${rp(first.amount)}, ${dm(first.date)} (${days === 0 ? 'hari ini' : `${days} hari lagi`}).`, sopan: `Tagihan terdekat adalah ${first.name} sebesar ${rp(first.amount)} pada ${dm(first.date)}.`,
    gaul: `Yang paling deket ${first.name} ${rp(first.amount)}, ${dm(first.date)}.`, singkat: `${first.name} ${rp(first.amount)}, ${dm(first.date)}.`, barbar: `${first.name} ${rp(first.amount)} tanggal ${dm(first.date)}, jangan sampe lupa bayar, anjir.` }),
    lines: due.slice(0, 5).map(x => ({ label: `${x.name} · ${dm(x.date)}`, value: rp(x.amount) })), open: { view: 'upcoming', label: 'Buka Mendatang' } };
}
/**
 * 8.4 A short question right after one record was answered is about that record: "dia kapan bayar?", "jatuh temponya
 * kapan?", "udah lunas belum?", "buat apa dulu?", "berapa nominalnya", "sisa berapa bulan lagi". Anything naming
 * something else is not (null), so "kapan gajian" after a receivable is still its own question.
 */
/** 8.5 Whom a debt is owed to, when it is a person ("Pinjaman Kak Rina" → "kak rina"): "dia" can then mean them. A lender (Kredivo, a bank, a card) is not. */
const LENDER = /\b(?:cicilan|angsuran|kredit|paylater|kredivo|akulaku|spaylater|gopaylater|atome|indodana|home\s*credit|kredit\s*pintar|adakami|easycash|julo|kartu|cc|bank|bca|bri|bni|bsi|mandiri|btn|cimb|danamon|permata|jago|jenius|seabank|blu|pegadaian|koperasi|kpr|leasing|adira|fif|wom|bpr|pinjol|shopee|tokopedia|gopay|ovo|dana|kantor|perusahaan|pt|cv)\b/iu;
const KIN_OR_ADDRESS = /^(?:pak|bapak|bu|ibu|mas|mbak|mba|kak|kaka|bang|abang|om|tante|aa|cak|ning|dek|adek|neng|koh|cik|ci|teh|teteh|mama|mamah|papa|papah|ayah|bunda|nenek|kakek|paman|bibi|budhe|bude|pakde|bulek)\b/iu;
export function debtPerson(d: { name: string; provider?: string }, people: string[] = []): string {
  const who = (d.provider || '').trim() || (d.name.match(/^(?:pinjaman|pinjam|pinjem|utang|hutang|minjem)\s+(?:ke|dari|sama)?\s*(.+)$/iu)?.[1] || '').trim();
  if (!who || LENDER.test(who) || who.split(/\s+/).length > 3) return '';
  const low = who.toLocaleLowerCase('id-ID');
  if (KIN_OR_ADDRESS.test(who) || people.includes(low) || /^\p{Lu}\p{Ll}+$/u.test(who)) return low;
  return '';
}
const ABOUT_WORDS = new Set('dia doi dianya itu tuh ini yang yg udah sudah dah belum blm belom lunas bayar dibayar bayarnya dibalikin balikin dikembaliin kembaliin ngembaliin cair cairnya kapan berapa brp brapa tanggal tanggalnya tgl jatuh tempo temponya jatuhtemponya janji janjinya janjiin sisa sisanya lagi bulan buat untuk apa dulu nominal nominalnya jumlah jumlahnya totalnya ya sih dong kah gimana harus musti mesti kira kira2 kira-kira deh nih kok emang memang pinjem pinjam minjem minjam ngutang utang utangnya hutang hutangnya keperluan keperluannya ngapain dipake dipakai kelar beres lunasnya siapa orangnya namanya nya kali terakhir masih tadi aku gue gua saya ke sama piutang piutangnya cicilan cicilannya klaim klaimnya tagihan tagihannya'.split(' '));
/** 8.5 A word naming the kind of record: the question is about that record only when it is that kind ("piutangnya" after a debt is not). */
const KIND_WORDS: Record<string, ItemRef['kind'][]> = { piutang: ['receivable'], piutangnya: ['receivable'], cicilan: ['debt', 'recurring'], cicilannya: ['debt', 'recurring'], klaim: ['claim'], klaimnya: ['claim'], tagihan: ['debt', 'recurring'], tagihannya: ['debt', 'recurring'] };
const WHEN = /\b(?:kapan|tanggal\p{L}*|tgl|jatuh\s*tempo\p{L}*|tempo\p{L}*|deadline|janji\p{L}*)\b/u;
const PAID = /\b(?:lunas\p{L}*|dibayar|bayar\p{L}*|balikin|dibalikin|kembaliin|dikembaliin|cair\p{L}*|kelar|beres)\b/u;
const WHAT_FOR = /\b(?:buat|untuk)\s+apa\b|\bkeperluan\p{L}*|\bngapain\b|\bdipak[ea]i?\s+apa\b/u;
const HOW_MUCH = /\b(?:berapa|brp|brapa|nominal\p{L}*|jumlah\p{L}*|total\p{L}*|sisa\p{L}*)\b/u;
export function aboutItem(t: string, ref: ItemRef, ctx: AnswerCtx, v: Voice): Answer | null {
  const words = t.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 8 || words.some(w => !ABOUT_WORDS.has(w) && !/^\d+$/.test(w))) return null;
  if (words.some(w => KIND_WORDS[w] && !KIND_WORDS[w].includes(ref.kind))) return null;
  const { data, today } = ctx, base = { intent: 'module' as const, about: ref, item: ref.kind };
  const when = WHEN.test(t) || /\bkapan\b/.test(t), paid = !when && PAID.test(t), whatFor = WHAT_FOR.test(t), months = HOW_MUCH.test(t) && /\bbulan\b/.test(t), much = HOW_MUCH.test(t);
  const days = (iso: string) => { const n = daysBetween(today, iso); return n === 0 ? 'hari ini' : n === 1 ? 'besok' : n > 0 ? `${n} hari lagi` : `lewat ${-n} hari`; };
  if (ref.kind === 'receivable') {
    const r = data.receivables.find(x => x.id === ref.id); if (!r) return null;
    const done = r.status === 'paid' || r.remainingAmount <= 0, paidSoFar = r.originalAmount - r.remainingAmount;
    const hero = { label: done ? 'Sudah lunas' : 'Belum dibayar', value: rp(r.remainingAmount), note: r.dueDate ? `janji ${dm(r.dueDate)}` : undefined, tone: 'info' as const };
    const open = { view: 'receivables', label: 'Buka Piutang' };
    if (when) return { ...base, title: `Janji bayar ${r.person}`, text: done ? `${r.person} sudah lunas.` : r.dueDate ? `${r.person} janji bayar ${dm(r.dueDate)} (${days(r.dueDate)}). Masih ${rp(r.remainingAmount)}.` : `${r.person} belum ada tanggal janji bayar. Masih ${rp(r.remainingAmount)}. Kalau sudah janji, isi tanggalnya di Piutang biar diingatkan.`, hero, open };
    if (paid) return { ...base, title: `Piutang ${r.person}`, text: done ? `Sudah lunas, ${r.person} sudah bayar semua ${rp(r.originalAmount)}.` : `Belum lunas. ${r.person} masih utang ${rp(r.remainingAmount)}${paidSoFar > 0 ? ` (sudah dibayar ${rp(paidSoFar)} dari ${rp(r.originalAmount)})` : ''}.`, hero, open };
    if (whatFor) return { ...base, title: `Piutang ${r.person}`, text: r.description ? `Waktu itu buat ${r.description}, ${rp(r.originalAmount)} (${dm(r.date)}).` : `Nggak ada keterangannya. ${r.person} pinjam ${rp(r.originalAmount)} tanggal ${dm(r.date)}.`, hero, open };
    if (much) return { ...base, title: `Piutang ${r.person}`, text: `${r.person} masih utang ${rp(r.remainingAmount)}${r.originalAmount !== r.remainingAmount ? ` dari ${rp(r.originalAmount)}` : ''}.`, hero, open };
    return null;
  }
  if (ref.kind === 'debt') {
    const d = data.debts.find(x => x.id === ref.id); if (!d) return null;
    const left = d.installmentAmount > 0 ? Math.ceil(d.outstandingAmount / d.installmentAmount) : 0, done = d.status === 'paid' || d.outstandingAmount <= 0;
    const hero = { label: 'Sisa utang', value: rp(d.outstandingAmount), note: d.dueDate ? `jatuh tempo ${dm(d.dueDate)}` : undefined, tone: 'warn' as const }, open = { view: 'debts', label: 'Buka Utang' };
    if (when) return { ...base, title: d.name, text: done ? `${d.name} sudah lunas.` : d.dueDate ? `Jatuh tempo ${d.name} berikutnya ${dm(d.dueDate)} (${days(d.dueDate)})${d.installmentAmount ? `, ${rp(d.installmentAmount)}` : ''}.` : `${d.name} belum ada tanggal jatuh tempo. Sisanya ${rp(d.outstandingAmount)}.`, hero, open };
    if (months) return { ...base, title: d.name, text: left ? `Sisa ${left} bulan lagi (${rp(d.installmentAmount)}/bulan), lunas sekitar ${monthYear(today, left)}.` : `Belum ada cicilan rutin, jadi belum bisa dihitung berapa bulan lagi. Sisanya ${rp(d.outstandingAmount)}.`, hero, open };
    if (paid) return { ...base, title: d.name, text: done ? `${d.name} sudah lunas.` : `Belum lunas, sisa ${rp(d.outstandingAmount)} dari ${rp(d.originalAmount)}.`, hero, open };
    if (whatFor) return { ...base, title: d.name, text: d.notes ? `${d.name}: ${d.notes}.` : `${d.name}${d.provider && lower(d.provider) !== lower(d.name) ? ` di ${d.provider}` : ''}, ${rp(d.originalAmount)}. Nggak ada catatan lain.`, hero, open };
    if (much) return { ...base, title: d.name, text: `Sisa ${d.name} ${rp(d.outstandingAmount)} dari ${rp(d.originalAmount)}.`, hero, open };
    return null;
  }
  if (ref.kind === 'recurring') {
    const r = (data.recurring || []).find(x => x.id === ref.id); if (!r) return null;
    const hero = { label: 'Berikutnya', value: dm(r.nextDate), note: rp(r.amount), tone: 'info' as const }, open = { view: 'recurring', label: 'Buka Transaksi rutin' };
    if (when) return { ...base, title: r.name, text: `${r.name} berikutnya ${dm(r.nextDate)} (${days(r.nextDate)}).`, hero, open };
    if (much) return { ...base, title: r.name, text: `${r.name} ${rp(r.amount)}, dibayar ${dm(r.nextDate)}.`, hero, open };
    return null;
  }
  if (ref.kind === 'claim') {
    const c = data.claims.find(x => x.id === ref.id); if (!c) return null;
    const hero = { label: 'Belum cair', value: rp(c.remainingAmount), note: c.expectedPaymentDate ? `perkiraan ${dm(c.expectedPaymentDate)}` : undefined, tone: 'info' as const }, open = { view: 'claims', label: 'Buka Klaim' };
    if (when) return { ...base, title: `Klaim ${c.name}`, text: c.status === 'paid' ? `Klaim ${c.name} sudah cair.` : c.expectedPaymentDate ? `Perkiraan cair ${dm(c.expectedPaymentDate)} (${days(c.expectedPaymentDate)}).` : 'Belum ada perkiraan tanggal cairnya.', hero, open };
    if (paid) return { ...base, title: `Klaim ${c.name}`, text: c.status === 'paid' ? `Sudah cair.` : `Belum cair, masih ${rp(c.remainingAmount)}.`, hero, open };
    if (whatFor) return { ...base, title: `Klaim ${c.name}`, text: c.description ? `${c.description}, ${rp(c.amount)}.` : `Klaim ${c.name} ${rp(c.amount)}.`, hero, open };
    if (much) return { ...base, title: `Klaim ${c.name}`, text: `Klaim ${c.name} ${rp(c.remainingAmount)}${c.amount !== c.remainingAmount ? ` dari ${rp(c.amount)}` : ''}.`, hero, open };
    return null;
  }
  if (ref.kind === 'fund') {
    const f = data.funds.find(x => x.id === ref.id); if (!f) return null;
    const left = Math.max(0, f.targetAmount - f.currentAmount), hero = { label: 'Terkumpul', value: rp(f.currentAmount), note: `dari ${rp(f.targetAmount)}`, tone: 'good' as const }, open = { view: 'funds', label: 'Buka Tujuan' };
    if (when) { const m = f.monthlyContribution > 0 && left > 0 ? Math.ceil(left / f.monthlyContribution) : 0; return { ...base, title: f.name, text: !left ? `${f.name} sudah tercapai!` : m ? `Dengan ${rp(f.monthlyContribution)}/bulan, tercapai sekitar ${monthYear(today, m)}.` : f.targetDate ? `Targetnya ${dm(f.targetDate)}; kurang ${rp(left)}.` : `Belum ada setoran rutin atau tanggal target. Kurang ${rp(left)}.`, hero, open }; }
    if (much) return { ...base, title: f.name, text: `${f.name} terkumpul ${rp(f.currentAmount)} dari ${rp(f.targetAmount)}, kurang ${rp(left)}.`, hero, open };
    return null;
  }
  return null;
}
/**
 * 8.4 Right after a list (piutang, utang, klaim, rutin, tujuan, wish list), a short question picks from it: "yang
 * paling lama siapa?", "yang paling besar?", "yang paling dekat?", "totalnya?", "ada berapa?".
 */
export type ListRef = { kind: ItemRef['kind']; ids: string[] };
const LIST_WORDS = /^(?:yang|yg|paling|palin|ter\p{L}+|lama|dulu|duluan|awal|baru|akhir|besar|gede|banyak|mahal|kecil|dikit|sedikit|murah|dekat|deket|cepet|cepat|siapa|apa|mana|berapa|brp|total\p{L}*|semua\p{L}*|jumlah\p{L}*|ada|orang|item|biji|buah|ya|sih|dong|nih|tuh|itu|kalau|kalo|klo|jatuh|tempo|utang\p{L}*|hutang\p{L}*|nominal\p{L}*|nya|kira|kira2|kah|gitu|aja|saja|belum|blm|belom|bayar|dibayar|lunas|nunggak|nyicil|udah|sudah|masih|ngutang|minjem|pinjem)$/u;
export function fromList(t: string, list: ListRef, ctx: AnswerCtx, v: Voice): Answer | null {
  const words = t.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 7 || !words.every(w => LIST_WORDS.test(w))) return null;
  const { data } = ctx;
  type Row = { id: string; name: string; amount: number; since?: string; due?: string };
  const rows: Row[] = list.ids.map((id): Row | null => {
    if (list.kind === 'receivable') { const r = data.receivables.find(x => x.id === id); return r ? { id, name: r.person, amount: r.remainingAmount, since: r.date, due: r.dueDate } : null; }
    if (list.kind === 'debt') { const d = data.debts.find(x => x.id === id); return d ? { id, name: d.name || d.provider, amount: d.outstandingAmount, due: d.dueDate } : null; }
    if (list.kind === 'claim') { const c = data.claims.find(x => x.id === id); return c ? { id, name: c.name, amount: c.remainingAmount || c.amount, since: c.submissionDate, due: c.expectedPaymentDate } : null; }
    if (list.kind === 'recurring') { const r = (data.recurring || []).find(x => x.id === id); return r ? { id, name: r.name, amount: r.amount, due: r.nextDate } : null; }
    if (list.kind === 'fund') { const f = data.funds.find(x => x.id === id); return f ? { id, name: f.name, amount: f.currentAmount, due: f.targetDate } : null; }
    const w = (data.wishlist || []).find(x => x.id === id); return w ? { id, name: w.name, amount: w.price } : null;
  }).filter((r): r is Row => Boolean(r));
  if (!rows.length) return null;
  const total = rows.reduce((n, r) => n + r.amount, 0);
  if (/\b(?:total\p{L}*|semua\p{L}*|jumlah\p{L}*)\b/u.test(t) && !/\b(?:paling|ter\p{L}+)\b/u.test(t)) return { intent: 'module', title: 'Totalnya', text: `Totalnya ${rp(total)} dari ${rows.length} ${list.kind === 'receivable' ? 'piutang' : list.kind === 'debt' ? 'utang' : list.kind === 'claim' ? 'klaim' : 'catatan'}.`, hero: { label: 'Total', value: rp(total) }, lines: rows.slice(0, 6).map(r => ({ label: r.name, value: rp(r.amount) })) };
  if (/\bada\s+berapa\b|\bberapa\s+(?:orang|item|biji|buah)\b/.test(t)) return { intent: 'module', title: 'Jumlahnya', text: `Ada ${rows.length}${list.kind === 'receivable' ? ` (${[...new Set(rows.map(r => r.name))].length} orang)` : ''}, totalnya ${rp(total)}.`, lines: rows.slice(0, 6).map(r => ({ label: r.name, value: rp(r.amount) })) };
  const by = (f: (a: Row, b: Row) => number, keep: (r: Row) => boolean = () => true) => rows.filter(keep).sort(f)[0];
  const pick = /\b(?:paling|ter)\s*(?:lama|dulu|awal)\b|\bterlama\b/.test(t) ? { row: by((a, b) => (a.since || '9').localeCompare(b.since || '9'), r => Boolean(r.since)), lead: (r: Row) => `Yang paling lama ${r.name}, sejak ${dm(r.since!)}.` }
    : /\b(?:paling|ter)\s*(?:baru|akhir)\b|\bterbaru\b|\bterakhir\b/.test(t) ? { row: by((a, b) => (b.since || '').localeCompare(a.since || ''), r => Boolean(r.since)), lead: (r: Row) => `Yang paling baru ${r.name}, ${dm(r.since!)}.` }
    : /\b(?:paling|ter)\s*(?:dekat|deket|cepet|cepat)\b|\bterdekat\b|\bduluan\b/.test(t) ? { row: by((a, b) => (a.due || '9').localeCompare(b.due || '9'), r => Boolean(r.due)), lead: (r: Row) => `Yang paling dekat ${r.name}, ${dm(r.due!)}.` }
    : /\b(?:paling|ter)\s*(?:kecil|dikit|sedikit|murah)\b|\bterkecil\b/.test(t) ? { row: by((a, b) => a.amount - b.amount), lead: (r: Row) => `Yang paling kecil ${r.name}, ${rp(r.amount)}.` }
    : /\b(?:paling|ter)\s*(?:besar|gede|banyak|mahal)\b|\bterbesar\b/.test(t) ? { row: by((a, b) => b.amount - a.amount), lead: (r: Row) => `Yang paling besar ${r.name}, ${rp(r.amount)}.` } : null;
  if (!pick) return null;
  if (!pick.row) return { intent: 'module', title: 'Belum ada datanya', text: 'Tanggalnya belum diisi di catatan-catatan itu, jadi belum bisa kuurutkan.' };
  const item = items(data).find(x => x.kind === list.kind && x.id === pick.row!.id);
  const detail = item ? itemAnswer(item, ctx, v) : null;
  return { ...(detail || { intent: 'module' as const, title: pick.row.name, text: '' }), about: { kind: list.kind, id: pick.row.id }, item: list.kind, text: `${pick.lead(pick.row)}${detail ? ` ${detail.text}` : ''}` };
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
