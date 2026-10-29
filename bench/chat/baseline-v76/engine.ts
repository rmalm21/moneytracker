/**
 * Asisten chat: one message in, one reply out, all on the device. What Catat otomatis reads (records, sharing, math,
 * questions, changes to recent records, menus) is handed to it unchanged; the chat adds what a one-shot box cannot do:
 *
 *   - a conversation: "jadi 45rb", "pakai jago", "kemarin", "kategorinya jajan", "bagi 2 sama rina" change the record
 *     still waiting; once saved, the amount or day of the last record is changed (with a confirmation card);
 *     "kalau bulan lalu?" / "kalau transport?" ask the last question again; "kalau dibagi 4?" carries a calculation on;
 *   - asking back: a record missing its amount, wallet, category or date is asked for in the chat, with choices, and a
 *     short answer ("jajan", "gopay", "kemarin") fills it in;
 *   - a calculator, a summary of the period, "aman nggak beli …?", tips from the person's own records;
 *   - four ways of talking (lib/chat/voice.ts), greetings, help, templates;
 *   - a trained intent model (NLP.js, lib/chat/model.ts) for sentences the rules do not catch, and phrases learned from
 *     the person: a message not understood, followed by one that is, is remembered (on this device).
 *
 * The caller passes the data and keeps the memory; `inspect` is Catat otomatis' reading of a sentence.
 */
import { budgetCurrent, countedBudgets, expenseAllocations, metrics, transactionExpense, transactionIncome } from '../../../lib/accounting.ts';
import { readPeriod } from '../../../lib/catat/ask.ts';
import { suggestCategory } from '../../../lib/categorize.ts';
import { findAmounts, walletsIn, type QuickContext } from '../../../lib/quick-entry.ts';
import type { Data } from '../../../lib/types';
import { calculate, calcText } from './calc.ts';
import type { ChatModelIntent } from './corpus.ts';
import type { AskField, Inspection } from './inspect.ts';
import { say as V, you, yours, type Voice } from './voice.ts';

export type ChatData = Pick<Data, 'wallets' | 'transactions' | 'budgets' | 'categories' | 'funds' | 'debts' | 'receivables' | 'claims'>;
export type ChatContext = {
  data: ChatData; today: string; salaryDay: number; cycle: { start: string; end: string };
  quick: QuickContext; inspect: (text: string) => Inspection;
  /** The trained intent model (absent in plain tests: the rules alone). */
  classify?: (text: string) => Promise<{ intent: ChatModelIntent; score: number } | null>;
  name?: string; hour?: number; voice?: Voice;
  /** Phrases learned from this person: what they wrote → the message that meant it. */
  learned?: Record<string, string>;
};
export type ChatMemory = {
  /** The last sentence handed to Catat otomatis to record, and whether it was saved. */
  plan?: { text: string; status: 'pending' | 'saved' | 'dismissed' };
  /** The last question answered, for "kalau bulan lalu?". */
  question?: string;
  /** The last calculated number, for "kalau dibagi 4?". */
  number?: number;
  /** What the last reply was: a follow-up belongs to it. */
  last?: 'record' | 'question' | 'calc' | 'say';
  /** The field the assistant just asked for, and the choices it gave. */
  asking?: { field: AskField; choices: string[] };
  /** The last message that was not understood (to learn from the next one). */
  unknown?: string;
};
export type SayLine = { label: string; value: string; tone?: 'up' | 'down' | 'warn' | 'good' };
export type ChatReply =
  /** Read by Catat otomatis: cards to save, an answer, a change to a record. `intro` is said before the card. */
  | { kind: 'plan'; text: string; intro?: string; chips?: string[] }
  | { kind: 'say'; text: string; title?: string; lines?: SayLine[]; chips?: string[]; tone?: 'good' | 'warn' | 'info'; note?: string };
export type ChatIntent = 'greet' | 'thanks' | 'ack' | 'help' | 'examples' | 'about' | 'voice' | 'edit' | 'fill' | 'cancel' | 'undo' | 'followup' | 'calc' | 'summary' | 'afford' | 'tips' | 'plan' | 'question' | 'unknown';
export type ChatResult = {
  intent: ChatIntent; reply: ChatReply; memory: ChatMemory;
  /** The record waiting to be saved is dropped. */ dismiss?: boolean;
  /** The person asked for another way of talking. */ setVoice?: Voice;
  /** A phrase to remember: `phrase` (as written before) means `as`. */ learn?: { phrase: string; as: string };
  /** Which part decided: the rules, the trained model, or a learned phrase. */ by?: 'rules' | 'model' | 'learned';
};

const lower = (s: string) => s.toLocaleLowerCase('id-ID');
const rp = (n: number) => `${n < 0 ? '−' : ''}Rp${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;
export const clean = (s: string) => lower(s).replace(/\s+/g, ' ').replace(/[!?.…]+$/g, '').trim();
const FILLER = /\s+(?:aja|saja|deh|dong|ya|yah|sih|kok|nih|tuh|ajah|aj)$/;
const unfill = (s: string) => { let t = s.trim(); for (let i = 0; i < 3; i++) t = t.replace(FILLER, ''); return t.trim(); };
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 86_400_000);
const dm = (iso: string) => D(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------------ Templates */

export type TemplateGroup = { key: string; title: string; hint: string; items: string[] };
/** Everything the chat can do, as messages to tap (the empty chat, the suggestion strip, "Contoh", and help). */
export const TEMPLATES: TemplateGroup[] = [
  { key: 'catat', title: 'Catat', hint: 'Pengeluaran, pemasukan, transfer', items: ['makan siang 35rb pakai {ewallet}', 'gaji 8,5jt masuk {bank}', 'transfer 500rb dari {bank} ke {to}', 'kopi 22rb, parkir 5rb, bensin 30rb'] },
  { key: 'patungan', title: 'Patungan', hint: 'Split Bill, utang, piutang', items: ['hokben 162.003 dibagi2 sama ferdi', 'makan 100rb aku 60rb ferdi 40rb', 'listrik 450rb sepertiga buat kosan sebelah', 'ferdi bayarin makan 90rb, aku hutang setengah'] },
  { key: 'kategori', title: 'Bagi kategori', hint: 'Satu belanja, beberapa keperluan', items: ['hokben 162.003 dibagi 2, satu buat gue, satu traktir teman', 'belanja 200rb, 150rb buat makan, sisanya sabun'] },
  { key: 'hitung', title: 'Hitung', hint: 'Kalkulator di dalam chat', items: ['hitung 128181 dibagi 3 dikali 2', 'berapa 15% dari 2,5jt', 'diskon 50% makan 80rb'] },
  { key: 'tanya', title: 'Tanya', hint: 'Dijawab dari catatanmu', items: ['pengeluaran bulan ini berapa', 'kapan terakhir isi bensin', 'saldo semua dompet berapa', 'sisa anggaran makan berapa'] },
  { key: 'saran', title: 'Ringkasan & saran', hint: 'Kondisi keuanganmu', items: ['ringkasan bulan ini', 'aman nggak beli sepatu 500rb?', 'kasih tips hemat'] },
  { key: 'ubah', title: 'Ubah & batal', hint: 'Setelah mencatat', items: ['jadi 45rb', 'pakai {other}', 'kemarin', 'batalin yang tadi'] },
  { key: 'rencana', title: 'Rencana', hint: 'Anggaran, pengingat, rutin', items: ['anggaran makan 2jt', 'ingatkan bayar listrik tgl 20', 'bayar wifi 300rb tiap tanggal 5'] },
];

/** The templates with this person's own wallets in them ("pakai gopay" only works when there is a GoPay). */
export function templatesFor(wallets: QuickContext['wallets']): TemplateGroup[] {
  const live = wallets.filter(w => !w.isArchived), name = (w?: { name: string }) => lower(w?.name || '');
  const ewallet = live.find(w => w.type === 'ewallet' || /gopay|ovo|dana|shopee|linkaja/i.test(w.name)) || live[0];
  const bank = live.find(w => w.type === 'bank' || /bca|bri|bni|mandiri|jago|jenius|seabank|blu|bank/i.test(w.name)) || live.find(w => w !== ewallet) || live[0];
  const to = live.find(w => w !== bank && (w.type === 'savings' || /tabungan|simpan/i.test(w.name))) || live.find(w => w !== bank) || bank;
  const other = live.find(w => w !== ewallet) || ewallet;
  const fill = (t: string) => t.replace('{ewallet}', name(ewallet) || 'gopay').replace('{bank}', name(bank) || 'bca').replace('{to}', name(to) || 'tabungan').replace('{other}', name(other) || 'tunai');
  return TEMPLATES.map(g => ({ ...g, items: g.items.map(fill) }));
}

/* ------------------------------------------------------------------ Rules */

const GREET = /^(?:halo+|hal+o|hai+|hay|hi+|hello|helo|hey|hei|pagi|siang|sore|malam|met (?:pagi|siang|sore|malam)|selamat (?:pagi|siang|sore|malam)|assalamu.?alaikum|asw|permisi|p|yo)(?:\s+(?:min|kak|bro|sis|bot|asisten|dompet|ajaib|semua|apa kabar))*$/;
const THANKS = /^(?:makasih+|makasi|mksh|maksih|terima ?kasih|trims|thanks|thank you|thx|tq|ty|nuhun|suwun|tengkyu)\b/;
const ACK = /^(?:ok(?:e|ay|ey)?|okk+|sip+|siap|mantap|mantul|good|nice|keren|baik|oke deh|okedeh|ya|iya|yoi|noted|wkwk+|haha+|hehe+|hihi|👍|🙏)$/;
const HELP = /^(?:bantuan|help|tolong|menu|fitur|panduan|cara ?pakai|caranya)$|\b(?:bisa apa(?: aja| saja)?|bisa ngapain|ngapain aja|bisa bantu apa|apa (?:aja|saja) yang bisa|fitur(?:nya|mu)? apa|apa (?:aja|saja) fitur(?:nya|mu)?|cara (?:pakai|make|makenya|pakainya|menggunakan)(?! \p{L}+ (?:\d|rp)))\b/u;
const ABOUT = /\b(?:kamu siapa|siapa kamu|kamu itu apa|kamu apa|ini apa|ini siapa)\b/;
const EXAMPLES = /^(?:contoh(?:nya)?|template|kasih contoh|minta contoh|ide)(?:\s+(?:dong|lagi|chat|kalimat))*$/;
const VOICE_WORDS: [RegExp, Voice][] = [[/\b(?:formal|baku|sopan|anda)\b/, 'sopan'], [/\b(?:lo[- ]?gue|lu[- ]?gue|gue[- ]?lo|gaul)\b/, 'gaul'], [/\b(?:singkat|pendek|ringkas|to the point)\b/, 'singkat'], [/\b(?:santai|kayak temen|jangan kaku|ga kaku|nggak kaku|biasa aja)\b/, 'santai']];
const VOICE_TALK = /\b(?:bahasa|gaya|ngomong|jawab(?:nya)?|ngobrol|bicara|pakai|pake)\b/;

function partOfDay(hour = 12) { return hour < 11 ? 'pagi' : hour < 15 ? 'siang' : hour < 18 ? 'sore' : 'malam'; }

const DATE_PHRASE = String.raw`(?:kemarin|kemaren|kmrn|kmarin|kmren|tadi pagi|tadi siang|tadi sore|tadi malam|semalam|hari ini|besok|lusa|(?:\d+ )?hari lalu|minggu lalu|(?:tgl|tanggal) \d{1,2}(?:[/-]\d{1,2})?|\d{1,2}[/-]\d{1,2}|(?:hari )?(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu)(?: kemarin| lalu)?)`;
const DATE_ONLY = new RegExp(String.raw`^(?:eh,?\s+)?(?:itu\s+|tanggalnya\s+|harinya\s+|jadi\s+|ganti\s+|ubah\s+|pindah(?:in)? ke\s+)?(${DATE_PHRASE})$`);
const DATE_ANY = new RegExp(String.raw`\b${DATE_PHRASE}\b`, 'g');
const WALLET_EDIT = /^(?:eh,?\s+)?(?:pakai|pake|pk|via|lewat|dari|bayar(?:nya)?\s+(?:pakai|pake|via|dari)|ganti\s+(?:ke|jadi)|dompet(?:nya)?)\s+(.+)$/;
const CATEGORY_EDIT = /^(?:eh,?\s+)?(?:kategori(?:nya)?|masuk(?:in|kan)?(?:\s+ke)?(?:\s+kategori)?|masukkan ke|jadi kategori|ganti kategori(?:nya)?(?:\s+(?:jadi|ke))?|ubah kategori(?:nya)?(?:\s+(?:jadi|ke))?)\s+(.+)$/;
const AMOUNT_LEAD = /^(?:eh,?\s+|eh\s+salah,?\s+)?(?:ganti|ubah|jadiin|jadi(?:nya)?|bukan|salah|harusnya|seharusnya|koreksi|maksudnya|maksudku|yang bener|yg bener|benernya|nominalnya|totalnya)\b/;
const SPLIT_EDIT = /^(?:(?:di)?bagi(?:2| dua| tiga| empat| rata| \d)|patungan|split|bagi rata|50:50)\b/;
const CANCEL = /^(?:batal(?:in|kan)?|ga jadi|gak jadi|nggak jadi|ngga jadi|enggak jadi|gajadi|gk jadi|cancel|ga usah|gak usah|nggak usah|gausah|skip|lewati|hapus aja|jangan(?: dicatat)?)(?:\s+(?:deh|aja|dulu|ya))*$/;
const UNDO = /\b(?:batal(?:in|kan)?|hapus(?:in)?|undo|delete|cancel|tarik)\b.*\b(?:barusan|tadi|terakhir|sebelumnya|td)\b/;
const FOLLOW = /^(?:kalau|kalo|klo|kl|trus|terus|lalu|gimana|bagaimana|yg|yang|kalau yang|kalo yang|kalo buat|kalau buat|kalo untuk|kalau untuk|kalo di|kalau di|terus kalau|trus kalo)\s+(.+)$/;
const FRAME = /\b(?:berapa|brp|brapa|total|totalnya|pengeluaran(?:ku|nya)?|pemasukan(?:ku|nya)?|belanja(?:ku)?|habis(?:nya)?|keluar(?:nya)?|uang(?:ku)?|buat|untuk|utk|di|aku|saya|gue|ku|sih|ya|aja|dong|yang|yg|udah|sudah|selama|dalam|sampai|sampe)\b/g;
const CALC_LEAD = /^(?:hitung(?:in|kan)?|itung(?:in)?|berapa(?:kah)?|brp|brapa|kalkulator|kalkulasi|calc)\s+/;
const CALC_TAIL = /\s*(?:=|berapa|brp|ya|sih|hasilnya|jadinya|jadi berapa|itu)?\s*$/;
const CALC_AGAIN = /^(?:kalau|kalo|klo|terus|trus|lalu)?\s*((?:di)?bagi|(?:di)?kali|(?:di)?tambah|(?:di)?kurang(?:i)?|plus|minus|x|\*|\/|\+|-|÷|×)\s*(.+)$/;
const CALC_WORDS = /\b(?:dikali|dibagi|ditambah|dikurangi?|kali|bagi|tambah|kurang|plus|minus|persen|dari|setengah|separuh|sepertiga|seperempat|ribu|rebu|juta|miliar|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|puluh|ratus|belas)\b/g;
const AFFORD = /\b(?:boleh|bisa|aman|sanggup|cukup|mampu|kuat|oke|ok)\b.*\b(?:beli|beliin|jajan|belanja|ambil|checkout|co|bayar|nonton|makan|liburan|traktir|top ?up|langganan|sewa)\b|\b(?:kalau|kalo|klo)\s+(?:beli|checkout|ambil|liburan|nonton)\b.*\b(?:aman|boleh|bisa|cukup)\b|\b(?:mau|pengen|pingin|ingin)\s+(?:beli|ambil|checkout)\b.*\b(?:aman|boleh|bisa|gimana|ga|gak|nggak|enggak)\b/;
const TIPS = /\b(?:tips|tip|saran|kasih saran|cara hemat|biar hemat|gimana (?:caranya )?hemat|supaya hemat|ngirit|irit|nabung|menabung|boros)\b/;
const SUMMARY = /\b(?:ringkasan|rangkuman|rekap|ikhtisar|kondisi keuangan|keadaan keuangan|status keuangan|keuangan(?:ku)? (?:gimana|bagaimana)|(?:gimana|bagaimana) keuangan(?:ku)?|cashflow|arus kas|aman (?:(?:ga|gak|nggak|enggak|tidak) )?(?:sampai|sampe) gajian|cukup (?:(?:ga|gak|nggak|enggak|tidak) )?(?:uang|duit)(?:ku)? (?:sampai|sampe) gajian)\b/;
const LEARNABLE = new Set<ChatIntent>(['summary', 'tips', 'help', 'examples', 'about', 'greet', 'thanks']);

/** The sentence with its amount replaced (the first amount written), or the amount added. */
function withAmount(text: string, amount: string) {
  const t = lower(text), a = findAmounts(t).find(x => x.value > 0);
  if (!a) return `${text} ${amount}`;
  return `${text.slice(0, a.index)}${amount}${text.slice(a.index + a.text.length)}`;
}
/** The sentence with its wallet replaced, or "pakai X" added. */
function withWallet(text: string, wallet: string, ctx: QuickContext) {
  const t = lower(text), w = walletsIn(t, ctx.wallets)[0];
  if (!w) return `${text} pakai ${wallet}`;
  return `${text.slice(0, w.at)}${wallet}${text.slice(w.at + w.word.length)}`;
}
const withDate = (text: string, date: string) => `${lower(text).replace(DATE_ANY, ' ').replace(/\s{2,}/g, ' ').trim()} ${date}`;
const withCategory = (text: string, category: string) => `${lower(text).replace(/\s+(?:kategori|masuk kategori)\s+.+$/, '').trim()} kategori ${lower(category)}`;

/** The last question with a new period and/or subject ("berapa pengeluaran makan bulan ini" + "transport" → "… transport bulan ini"). */
export function askAgain(last: string, rest: string, today: string, salaryDay: number): string {
  const p0 = readPeriod(lower(last), today, salaryDay), p1 = readPeriod(lower(rest), today, salaryDay);
  let q = lower(last);
  const subject = unfill(lower(rest).replace(p1?.said || '\u0000', ' ').replace(/^(?:yang|yg|buat|untuk|utk|di)\s+/, '').replace(/\s{2,}/g, ' ').trim());
  if (p1) q = p0 ? q.replace(p0.said, p1.said) : `${q} ${p1.said}`;
  if (subject && !/^(?:itu|ini|nya)$/.test(subject)) {
    const period = p1?.said || p0?.said || '';
    const body = period ? q.replace(period, ' ') : q;
    const old = body.replace(FRAME, ' ').replace(/[?]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (old) q = q.replace(new RegExp(`\\b${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), subject);
    else q = period ? q.replace(period, `untuk ${subject} ${period}`) : `${q} untuk ${subject}`;
  }
  return q.replace(/\s{2,}/g, ' ').trim();
}

/* ------------------------------------------------------------------ Money overview */

function periodOf(text: string, ctx: ChatContext) {
  const p = readPeriod(lower(text), ctx.today, ctx.salaryDay);
  return p ? { start: p.start, end: p.end, label: p.label } : { ...ctx.cycle, label: `periode gaji ini (${dm(ctx.cycle.start)}–${dm(new Date(D(ctx.cycle.end).getTime() - 864e5).toISOString().slice(0, 10))})` };
}
function categoryTotals(ctx: ChatContext, start: string, end: string) {
  const byParent = new Map<string, number>();
  for (const t of ctx.data.transactions) {
    if (t.date < start || t.date >= end) continue;
    for (const l of expenseAllocations(t)) { const c = ctx.data.categories.find(x => x.id === l.categoryId); const id = c?.parentId || c?.id || ''; byParent.set(id, (byParent.get(id) || 0) + l.amount); }
  }
  return [...byParent.entries()].map(([id, amount]) => ({ id, name: ctx.data.categories.find(c => c.id === id)?.name || 'Tanpa kategori', amount })).sort((a, b) => b.amount - a.amount);
}
function budgetsNow(ctx: ChatContext) {
  const asOf = new Date(`${ctx.today}T12:00:00`);
  return countedBudgets(ctx.data.budgets.filter(b => b.active)).map(b => { const c = budgetCurrent(b, ctx.data.transactions, ctx.data.categories, asOf, ctx.salaryDay); return { name: b.name, categoryId: b.categoryId, ...c, used: c.available > 0 ? c.spent / c.available : 0 }; }).sort((a, b) => b.used - a.used);
}
function money(ctx: ChatContext) {
  const m = metrics(ctx.data as Data, ctx.cycle.start, ctx.cycle.end, ctx.salaryDay, new Date(`${ctx.today}T12:00:00`));
  const left = Math.max(1, daysBetween(ctx.today, ctx.cycle.end)), passed = Math.max(1, daysBetween(ctx.cycle.start, ctx.today) + 1);
  return { free: m.free, income: m.income, expenses: m.expenses, left, passed, daily: m.free / left, pace: m.expenses / passed };
}

function summary(text: string, ctx: ChatContext, v: Voice): ChatReply {
  const p = periodOf(text, ctx);
  const txs = ctx.data.transactions.filter(t => t.date >= p.start && t.date < p.end);
  const income = txs.reduce((n, t) => n + transactionIncome(t), 0), spent = txs.reduce((n, t) => n + transactionExpense(t), 0);
  const top = categoryTotals(ctx, p.start, p.end).slice(0, 3), m = money(ctx), warn = budgetsNow(ctx).filter(b => b.used >= 0.8).slice(0, 3);
  const lines: SayLine[] = [
    { label: 'Pemasukan', value: rp(income), tone: 'up' }, { label: 'Pengeluaran', value: rp(spent), tone: 'down' },
    { label: 'Selisih', value: rp(income - spent), tone: income - spent >= 0 ? 'good' : 'warn' },
    { label: 'Uang bebas sekarang', value: rp(m.free) }, { label: `Jatah harian (${m.left} hari ke gajian)`, value: rp(m.daily) },
  ];
  const parts = [V.summaryLead(v, p.label, txs.length)];
  if (top.length && spent) parts.push(V.summaryTop(v, top.map(c => `${c.name} ${rp(c.amount)} (${Math.round(c.amount / spent * 100)}%)`).join(', ')));
  if (warn.length) parts.push(V.summaryWarn(v, warn.map(b => `${b.name} ${Math.round(b.used * 100)}%`).join(', ')));
  return { kind: 'say', title: 'Ringkasan', text: parts.join(' '), lines, tone: warn.some(b => b.used >= 1) || m.free <= 0 ? 'warn' : 'info', chips: ['pengeluaran terbesar bulan ini', 'kasih tips hemat', 'sisa anggaran makan berapa'] };
}

function afford(text: string, ctx: ChatContext, v: Voice): ChatReply | null {
  const t = lower(text), a = findAmounts(t).find(x => x.value > 0);
  if (!a) return null;
  const item = t.replace(a.text, ' ').replace(/\b(?:aku|saya|gue|gw|boleh|bisa|aman|sanggup|cukup|mampu|kuat|ga|gak|nggak|enggak|tidak|kah|nih|sih|ya|dong|mau|pengen|pingin|ingin|kalau|kalo|klo|harga(?:nya)?|seharga|yang|yg|buat|untuk|oke|ok|gimana|duitku|uangku|duit|uang)\b/g, ' ').replace(/[?!.,]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const thing = item.replace(/\b(?:beli|beliin|membeli|jajan|belanja|ambil|checkout|co|bayar)\b/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const m = money(ctx), after = m.free - a.value, dailyAfter = after / m.left;
  const guess = suggestCategory({ text: item, item, amount: a.value, type: 'expense' }, { categories: ctx.data.categories, history: [] });
  const catId = guess?.subcategoryId || guess?.categoryId, cat = ctx.data.categories.find(c => c.id === catId);
  const parent = cat?.parentId ? ctx.data.categories.find(c => c.id === cat.parentId) : cat;
  const budget = parent ? budgetsNow(ctx).find(b => b.categoryId === parent.id) : undefined;
  const lines: SayLine[] = [
    { label: 'Harga', value: rp(a.value) }, { label: 'Uang bebas sekarang', value: rp(m.free) },
    { label: 'Sisa setelah beli', value: rp(after), tone: after < 0 ? 'warn' : 'good' },
    { label: `Jatah harian (${m.left} hari ke gajian)`, value: `${rp(m.daily)} → ${rp(Math.max(0, dailyAfter))}`, tone: dailyAfter < m.pace ? 'warn' : 'good' },
  ];
  if (budget) lines.push({ label: `Sisa anggaran ${budget.name}`, value: rp(budget.remaining), tone: a.value > budget.remaining ? 'warn' : 'good' });
  let verdict: string, tone: 'good' | 'warn';
  if (after < 0) { verdict = V.affordNo(v, rp(m.free), rp(-after), thing || 'ini'); tone = 'warn'; }
  else if (dailyAfter < m.pace) { verdict = V.affordTight(v, rp(dailyAfter), m.left, rp(m.pace)); tone = 'warn'; }
  else { verdict = V.affordOk(v, rp(after), rp(dailyAfter)); tone = 'good'; }
  if (budget && a.value > budget.remaining) verdict += V.affordBudget(v, budget.name, rp(budget.remaining));
  return { kind: 'say', title: thing ? `Beli ${thing}?` : 'Boleh beli?', text: verdict, lines, tone, chips: ['ringkasan bulan ini', 'kasih tips hemat'], note: V.affordNote(v) || undefined };
}

function tips(ctx: ChatContext, v: Voice): ChatReply {
  const m = money(ctx), top = categoryTotals(ctx, ctx.cycle.start, ctx.cycle.end), budgets = budgetsNow(ctx);
  const out: string[] = [];
  const cycleTx = ctx.data.transactions.filter(t => t.date >= ctx.cycle.start && t.date < ctx.cycle.end);
  const hasBudget = (id: string) => ctx.data.budgets.some(b => b.active && b.categoryId === id);
  if (top[0] && m.expenses) out.push(`${top[0].name} paling besar periode ini: ${rp(top[0].amount)} (${Math.round(top[0].amount / m.expenses * 100)}% ${yours(v, 'pengeluaran')}).${hasBudget(top[0].id) ? '' : ' Pasang anggaran untuknya supaya ada batasnya.'}`);
  const over = budgets.find(b => b.used >= 1), close = budgets.find(b => b.used >= 0.8 && b.used < 1);
  if (over) out.push(`Anggaran ${over.name} sudah lewat ${rp(-over.remaining)}. Tahan dulu belanja di sana sampai periode baru.`);
  else if (close) out.push(`Anggaran ${close.name} sudah terpakai ${Math.round(close.used * 100)}%, sisa ${rp(close.remaining)}.`);
  const small = cycleTx.filter(t => t.type === 'expense' && t.amount <= 30000);
  if (small.length >= 5) out.push(`Ada ${small.length} jajan kecil (≤ Rp30.000) dengan total ${rp(small.reduce((n, t) => n + t.amount, 0))}. Kecil-kecil, tapi kalau dikumpulkan terasa.`);
  out.push(m.free > 0 ? `Supaya cukup sampai gajian, usahakan belanja tidak lebih dari ${rp(m.daily)} per hari.` : `Uang bebas ${you(v)} sedang habis. Prioritaskan kebutuhan pokok dan tagihan dulu.`);
  if (out.length < 3) out.push('Sisihkan tabungan di awal setelah gajian, bukan dari sisa di akhir bulan.');
  return { kind: 'say', title: 'Tips', text: V.tipsLead(v), lines: out.slice(0, 4).map((s, i) => ({ label: `${i + 1}`, value: s })), tone: 'info', chips: ['ringkasan bulan ini', 'aman nggak beli sepatu 500rb?'] };
}

function calcReply(c: NonNullable<ReturnType<typeof calculate>>, again: boolean, v: Voice): ChatReply {
  return { kind: 'say', title: 'Hitungan', text: `${c.expression} = ${calcText(c)}`, tone: 'info', chips: [again ? 'kalau dibagi 2?' : 'kalau dibagi 3?', ...(c.money && c.value > 0 ? [`keluar ${calcText(c)}`] : [])], note: c.money && Math.abs(c.value - Math.round(c.value)) > 1e-6 ? V.calcNote(v) : undefined };
}
const helpReply = (v: Voice, t: TemplateGroup[]): ChatReply => ({ kind: 'say', title: 'Yang bisa kubantu', text: V.helpLead(v), lines: t.slice(0, 7).map(g => ({ label: g.title, value: `“${g.items[0]}”` })), chips: ['contoh', 'ringkasan bulan ini', 'ganti gaya bahasa'] });
const examplesReply = (v: Voice, t: TemplateGroup[]): ChatReply => ({ kind: 'say', title: 'Coba salah satu', text: V.examplesLead(v), chips: t.filter(g => g.key !== 'ubah').flatMap(g => g.items.slice(0, 1)).concat(t[1].items[1], t[3].items[1]) });
const unknownReply = (v: Voice, t: TemplateGroup[], unanswered = false): ChatReply => ({ kind: 'say', text: unanswered ? V.unanswered(v) : V.unknown(v), chips: unanswered ? ['pengeluaran bulan ini berapa', 'kapan terakhir isi bensin', 'saldo semua dompet berapa', 'ringkasan bulan ini'] : [t[0].items[0], 'pengeluaran bulan ini berapa', 'hitung 15% dari 2,5jt', 'bisa apa aja?'] });
const VOICE_CHIPS = ['gaya santai', 'gaya sopan', 'gaya singkat', 'gaya gaul'];

/* ------------------------------------------------------------------ The reply */

export async function chatReply(input: string, memory: ChatMemory, ctx: ChatContext, depth = 0): Promise<ChatResult> {
  const raw = input.trim(), t = clean(raw), v: Voice = ctx.voice || 'santai', tpl = templatesFor(ctx.quick.wallets);
  const mem: ChatMemory = { ...memory, asking: undefined };
  const learnedAs = depth === 0 ? ctx.learned?.[t] : undefined;
  if (learnedAs) {
    const r = await chatReply(learnedAs, memory, ctx, 1);
    const note = V.learned(v, raw);
    if (r.reply.kind === 'say' && note) r.reply = { ...r.reply, note: [note, r.reply.note].filter(Boolean).join(' ') };
    return { ...r, by: 'learned' };
  }
  const result = await decide();
  // A message not understood, then one that is: the first is remembered as the second (only for meanings without amounts).
  if (depth === 0 && memory.unknown && result.intent !== 'unknown' && LEARNABLE.has(result.intent) && clean(memory.unknown) !== t) result.learn = { phrase: clean(memory.unknown), as: raw };
  if (result.intent !== 'unknown') result.memory = { ...result.memory, unknown: undefined };
  return result;

  async function decide(): Promise<ChatResult> {
    const sayR = (intent: ChatIntent, reply: ChatReply, next: ChatMemory = mem, by: ChatResult['by'] = 'rules'): ChatResult => ({ intent, reply, memory: { ...next, last: next.last === memory.last && intent !== 'calc' ? 'say' : next.last }, by });
    /** A sentence for Catat otomatis: a record (confirmed, or with one thing asked back) or a question. */
    const plan = (text: string, opts: { did?: string; intent?: ChatIntent; intro?: string } = {}): ChatResult => {
      const ins = ctx.inspect(text);
      if (ins.reading === 'question') return { intent: opts.intent && opts.intent !== 'plan' ? opts.intent : 'question', reply: { kind: 'plan', text }, memory: { ...mem, question: text, last: 'question' }, by: 'rules' };
      const next: ChatMemory = { ...mem, plan: { text, status: 'pending' }, last: 'record' };
      let intro = opts.intro ?? (opts.did ? V.edited(v, opts.did) : V.confirm(v, (ins.count || 1) > 1));
      let chips: string[] | undefined;
      if (ins.ask && !opts.intro) {
        const lead = opts.did ? `${cap(opts.did)}. ${V.askLead(v)}` : '';
        intro = `${lead}${V.ask(v, ins.ask.field)}`; chips = ins.ask.choices; next.asking = ins.ask;
      }
      return { intent: opts.intent || 'plan', reply: { kind: 'plan', text, intro: intro || undefined, ...(chips?.length ? { chips } : {}) }, memory: next, by: 'rules' };
    };
    const pending = mem.plan?.status === 'pending' ? mem.plan : undefined, saved = mem.plan?.status === 'saved' ? mem.plan : undefined;
    const name = ctx.name ? ` ${ctx.name}` : '';

    if (!t) return sayR('unknown', unknownReply(v, tpl));
    if (GREET.test(t)) return sayR('greet', { kind: 'say', text: V.greet(v, partOfDay(ctx.hour), name), chips: [tpl[0].items[0], 'ringkasan bulan ini', 'bisa apa aja?'] });
    if (THANKS.test(t)) return sayR('thanks', { kind: 'say', text: V.thanks(v), chips: ['ringkasan bulan ini'] });
    if (ACK.test(t)) return sayR('ack', { kind: 'say', text: pending ? V.ackPending(v) : V.ack(v) });
    if (ABOUT.test(t)) return sayR('about', { kind: 'say', text: V.about(v), chips: ['bisa apa aja?'] });
    if (HELP.test(t)) return sayR('help', helpReply(v, tpl));
    if (EXAMPLES.test(t)) return sayR('examples', examplesReply(v, tpl));
    // Another way of talking: "pakai bahasa formal", "gaya gaul", "jawab singkat aja".
    if (/^gaya\s+/.test(t) || VOICE_TALK.test(t) && VOICE_WORDS.some(([re]) => re.test(t)) && t.split(' ').length <= 7 && !findAmounts(t).length) {
      const picked = VOICE_WORDS.find(([re]) => re.test(t))?.[1];
      if (picked) return { intent: 'voice', reply: { kind: 'say', text: V.voiceSet(picked) }, memory: mem, setVoice: picked, by: 'rules' };
      if (/\bgaya bahasa\b|\bganti gaya\b/.test(t)) return sayR('voice', { kind: 'say', text: V.voiceAsk(v), chips: VOICE_CHIPS });
    }

    // The record being made: cancelled, filled in, or changed by a short follow-up.
    if (pending && CANCEL.test(t)) return { intent: 'cancel', reply: { kind: 'say', text: V.cancel(v) }, memory: { ...mem, plan: { ...pending, status: 'dismissed' } }, dismiss: true, by: 'rules' };
    if (UNDO.test(t) || saved && CANCEL.test(t)) return plan('hapus transaksi terakhir', { intro: V.undoIntro(v), intent: 'undo' });
    const asking = memory.asking;
    if (pending && asking && t.split(' ').length <= 4) {
      const amount = findAmounts(t).find(a => a.value > 0) || (/^\d[\d.]*$/.test(t) ? { text: t, value: Number(t.replace(/\./g, '')) } : undefined);
      const w = walletsIn(t, ctx.quick.wallets)[0], date = t.match(DATE_ONLY);
      if (asking.field === 'amount' && amount) return plan(withAmount(pending.text, amount.text), { did: V.editAmount(v, rp(amount.value)), intent: 'fill' });
      if (asking.field === 'wallet' && w) return plan(/^(?:transfer|tf|kirim|pindah)/.test(lower(pending.text)) ? `${pending.text} dari ${lower(w.name)}` : withWallet(pending.text, lower(w.name), ctx.quick), { did: V.editWallet(v, w.name), intent: 'fill' });
      if (asking.field === 'to' && w) return plan(`${pending.text} ke ${lower(w.name)}`, { did: V.editWallet(v, w.name), intent: 'fill' });
      if (asking.field === 'date' && date) return plan(withDate(pending.text, date[1]), { did: V.editDate(v, date[1]), intent: 'fill' });
      if (asking.field === 'category' && !amount && !date && /\p{L}/u.test(t) && !CANCEL.test(t)) {
        const cat = unfill(t.replace(/^(?:kategori(?:nya)?|masuk(?:in)?(?:\s+ke)?)\s+/, ''));
        return plan(withCategory(pending.text, cat), { did: V.editCategory(v, cat), intent: 'fill' });
      }
    }
    const target = pending || saved;
    if (target) {
      const words = t.split(' ').length;
      const date = t.match(DATE_ONLY), wallet = t.match(WALLET_EDIT), category = t.match(CATEGORY_EDIT);
      const amount = words <= 6 ? findAmounts(t).find(a => a.value > 0) : undefined;
      const rest = amount ? unfill(t.replace(amount.text, ' ').replace(AMOUNT_LEAD, ' ').replace(/[,.]/g, ' ')).replace(/\b(?:aja|saja|deh|dong|ya|kok|rb|ribu|jt|juta|k)\b/g, '').trim() : 'x';
      const onlyAmount = Boolean(amount) && (AMOUNT_LEAD.test(t) || words <= 2) && !/\p{L}{3,}/u.test(rest);
      const pickedWallet = wallet ? walletsIn(unfill(wallet[1]), ctx.quick.wallets)[0] : undefined;
      if (pending) {
        if (onlyAmount) return plan(withAmount(pending.text, amount!.text), { did: V.editAmount(v, rp(amount!.value)), intent: 'edit' });
        if (pickedWallet) return plan(withWallet(pending.text, lower(pickedWallet.name), ctx.quick), { did: V.editWallet(v, pickedWallet.name), intent: 'edit' });
        if (wallet && !findAmounts(t).length && unfill(wallet[1]).split(' ').length <= 2) return sayR('edit', { kind: 'say', text: V.walletMissing(v, unfill(wallet[1])), chips: ctx.quick.wallets.filter(w => !w.isArchived).slice(0, 5).map(w => `pakai ${lower(w.name)}`) });
        if (date) return plan(withDate(pending.text, date[1]), { did: V.editDate(v, date[1]), intent: 'edit' });
        if (category) return plan(withCategory(pending.text, unfill(category[1])), { did: V.editCategory(v, unfill(category[1])), intent: 'edit' });
        if (SPLIT_EDIT.test(t)) return plan(`${pending.text} ${t}`, { did: V.editSplit(v), intent: 'edit' });
      } else if (saved) {
        if (onlyAmount) return plan(`ubah transaksi terakhir jadi ${amount!.text}`, { intro: V.savedAmount(v, rp(amount!.value)), intent: 'edit' });
        if (date) return plan(`ubah transaksi terakhir jadi ${date[1]}`, { intro: V.savedDate(v, date[1]), intent: 'edit' });
        if (pickedWallet || category) return sayR('edit', { kind: 'say', text: V.savedOther(v, pickedWallet ? 'Dompet' : 'Kategori'), chips: ['buka transaksi'] });
      }
    }

    // A calculation carried on: "kalau dibagi 4?".
    const again = mem.number !== undefined && mem.last === 'calc' ? t.match(CALC_AGAIN) : null;
    if (again) { const c = calculate(`${mem.number!.toLocaleString('id-ID', { maximumFractionDigits: 6 })} ${again[1]} ${again[2]}`); if (c) return sayR('calc', calcReply(c, true, v), { ...mem, number: c.value, last: 'calc' }); }
    // The last question again, with a new period or subject.
    if (mem.question && (mem.last === 'question' || readPeriod(t, ctx.today, ctx.salaryDay))) {
      const f = t.match(FOLLOW), onlyPeriod = readPeriod(t, ctx.today, ctx.salaryDay);
      const rest = f ? f[1] : onlyPeriod && unfill(t.replace(onlyPeriod.said, ' ')).replace(/\s/g, '') === '' ? t : '';
      if (rest && ctx.inspect(t).reading !== 'record' && !findAmounts(t).some(a => a.marked)) {
        const q = askAgain(mem.question, rest, ctx.today, ctx.salaryDay);
        if (q !== lower(mem.question)) return { intent: 'followup', reply: { kind: 'plan', text: q }, memory: { ...mem, question: q, last: 'question' }, by: 'rules' };
      }
    }
    // Calculator.
    const lead = CALC_LEAD.test(t), body = t.replace(CALC_LEAD, '').replace(CALC_TAIL, '');
    const c = calculate(body);
    if (c && (lead || !/\p{L}{3,}/u.test(body.replace(CALC_WORDS, '')))) return sayR('calc', calcReply(c, false, v), { ...mem, number: c.value, last: 'calc' });

    if (/^(?:buka|lihat|liat|ke|pergi ke|masuk ke)\s+/.test(t)) return plan(raw);
    if (AFFORD.test(t)) { const r = afford(raw, ctx, v); return sayR('afford', r || { kind: 'say', text: V.needPrice(v) }); }
    if (TIPS.test(t) && !findAmounts(t).some(a => a.value > 0)) return sayR('tips', tips(ctx, v));
    if (SUMMARY.test(t)) return sayR('summary', summary(t, ctx, v));

    const ins = ctx.inspect(raw);
    if (ins.reading === 'record' || ins.reading === 'question') return plan(raw);

    // The trained model, for what the rules did not catch.
    const guess = ctx.classify ? await ctx.classify(raw) : null;
    const sure = guess && guess.score >= 0.6 ? guess.intent : null;
    const byModel = (intent: ChatIntent, reply: ChatReply, next: ChatMemory = mem) => sayR(intent, reply, next, 'model');
    switch (sure) {
      case 'greet': return byModel('greet', { kind: 'say', text: V.greet(v, partOfDay(ctx.hour), name), chips: ['ringkasan bulan ini', 'bisa apa aja?'] });
      case 'thanks': return byModel('thanks', { kind: 'say', text: V.thanks(v) });
      case 'help': return byModel('help', helpReply(v, tpl));
      case 'about': return byModel('about', { kind: 'say', text: V.about(v), chips: ['bisa apa aja?'] });
      case 'examples': return byModel('examples', examplesReply(v, tpl));
      case 'summary': return byModel('summary', summary(t, ctx, v));
      case 'tips': return byModel('tips', tips(ctx, v));
      case 'afford': return byModel('afford', afford(raw, ctx, v) || { kind: 'say', text: V.needPrice(v) });
      case 'style': return byModel('voice', { kind: 'say', text: V.voiceAsk(v), chips: VOICE_CHIPS });
      case 'undo': return { ...plan('hapus transaksi terakhir', { intro: V.undoIntro(v), intent: 'undo' }), by: 'model' };
      case 'cancel': if (pending) return { intent: 'cancel', reply: { kind: 'say', text: V.cancel(v) }, memory: { ...mem, plan: { ...pending, status: 'dismissed' } }, dismiss: true, by: 'model' }; break;
    }
    if (findAmounts(t).some(a => a.value > 0)) return plan(raw);
    return { intent: 'unknown', reply: unknownReply(v, tpl, ins.reading === 'unanswered'), memory: { ...mem, unknown: raw }, by: 'rules' };
  }
}
