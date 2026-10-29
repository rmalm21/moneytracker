/**
 * Asisten chat: one message in, one reply out, all on the device. What Catat otomatis reads (records, sharing, math,
 * questions, changes to recent records, menus) is handed to it unchanged; the chat adds what a one-shot box cannot do:
 *
 *   - remembering the conversation: "jadi 45rb", "pakai ovo aja", "kemarin", "kategorinya jajan", "bagi 2 sama rina"
 *     change the record still waiting to be saved; once saved, the amount or day of the last record is changed instead;
 *     "kalau bulan lalu?" / "kalau transport?" ask the last question again with a new period or subject;
 *   - a calculator ("hitung 128181 dibagi 3 dikali 2", "12 x 7", "kalau dibagi 4?");
 *   - a summary of the period, "aman nggak beli sepatu 500rb?", and tips from the person's own records;
 *   - greetings, help and templates to explore with.
 *
 * Pure: the caller passes the data and saves the memory. `read` tells whether Catat otomatis understands a sentence.
 */
import { budgetCurrent, countedBudgets, expenseAllocations, metrics, transactionExpense, transactionIncome } from '../accounting.ts';
import { readPeriod } from '../catat/ask.ts';
import { suggestCategory } from '../categorize.ts';
import { findAmounts, walletsIn, type QuickContext } from '../quick-entry.ts';
import type { Data } from '../types';
import { calculate, calcText } from './calc.ts';

export type ChatData = Pick<Data, 'wallets' | 'transactions' | 'budgets' | 'categories' | 'funds' | 'debts' | 'receivables' | 'claims'>;
/** What Catat otomatis makes of a sentence: something to record or change, a question, or nothing. */
export type Reading = 'record' | 'question' | 'none';
export type ChatContext = {
  data: ChatData; today: string; salaryDay: number; cycle: { start: string; end: string };
  quick: QuickContext; read: (text: string) => Reading; name?: string; hour?: number;
};
export type ChatMemory = {
  /** The last sentence handed to Catat otomatis to record, and whether it was saved. */
  plan?: { text: string; status: 'pending' | 'saved' | 'dismissed' };
  /** The last question answered, for "kalau bulan lalu?". */
  question?: string;
  /** The last calculated number, for "kalau dibagi 4?". */
  number?: number;
  /** What the last reply was: a follow-up belongs to it ("kalau dibagi 4?" after a calculation, "kalau bulan lalu?" after a question). */
  last?: 'record' | 'question' | 'calc' | 'say';
};
export type SayLine = { label: string; value: string; tone?: 'up' | 'down' | 'warn' | 'good' };
export type ChatReply =
  /** Read by Catat otomatis: cards to save, an answer, a change to a record. `intro` is said before the card. */
  | { kind: 'plan'; text: string; intro?: string }
  | { kind: 'say'; text: string; title?: string; lines?: SayLine[]; chips?: string[]; tone?: 'good' | 'warn' | 'info'; note?: string };
export type ChatIntent = 'greet' | 'thanks' | 'ack' | 'help' | 'examples' | 'about' | 'edit' | 'cancel' | 'undo' | 'followup' | 'calc' | 'summary' | 'afford' | 'tips' | 'plan' | 'question' | 'unknown';
export type ChatResult = { intent: ChatIntent; reply: ChatReply; memory: ChatMemory; /** The record waiting to be saved is dropped. */ dismiss?: boolean };

const lower = (s: string) => s.toLocaleLowerCase('id-ID');
const rp = (n: number) => `${n < 0 ? '−' : ''}Rp${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;
const clean = (s: string) => lower(s).replace(/\s+/g, ' ').replace(/[!?.…]+$/g, '').trim();
const FILLER = /\s+(?:aja|saja|deh|dong|ya|yah|sih|kok|nih|tuh|ajah|aj)$/;
const unfill = (s: string) => { let t = s.trim(); for (let i = 0; i < 3; i++) t = t.replace(FILLER, ''); return t.trim(); };
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 86_400_000);
const dm = (iso: string) => D(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/* ------------------------------------------------------------------ Templates */

export type TemplateGroup = { title: string; hint: string; items: string[] };
/** Everything the chat can do, as messages to tap (the empty chat, "Contoh", and help). */
export const TEMPLATES: TemplateGroup[] = [
  { title: 'Catat', hint: 'Pengeluaran, pemasukan, transfer', items: ['makan siang 35rb pakai gopay', 'gaji 8,5jt masuk bca', 'transfer 500rb ke tabungan', 'kopi 22rb, parkir 5rb, bensin 30rb'] },
  { title: 'Patungan', hint: 'Split Bill, utang, piutang', items: ['hokben 162.003 dibagi2 sama ferdi', 'makan 100rb aku 60rb ferdi 40rb', 'listrik 450rb sepertiga buat kosan sebelah', 'ferdi bayarin makan 90rb, aku hutang setengah'] },
  { title: 'Bagi kategori', hint: 'Satu belanja, beberapa keperluan', items: ['hokben 162.003 dibagi 2, satu buat gue, satu traktir teman', 'belanja 200rb, 150rb buat makan, sisanya sabun'] },
  { title: 'Hitung', hint: 'Kalkulator di dalam chat', items: ['hitung 128181 dibagi 3 dikali 2', 'berapa 15% dari 2,5jt', 'diskon 50% makan 80rb'] },
  { title: 'Tanya', hint: 'Dijawab dari catatanmu sendiri', items: ['pengeluaran bulan ini berapa', 'kapan terakhir isi bensin', 'saldo semua dompet berapa', 'sisa anggaran makan berapa'] },
  { title: 'Ringkasan & saran', hint: 'Kondisi keuanganmu', items: ['ringkasan bulan ini', 'aman nggak beli sepatu 500rb?', 'kasih tips hemat'] },
  { title: 'Ubah & batal', hint: 'Setelah mencatat', items: ['jadi 45rb', 'pakai ovo aja', 'kemarin', 'batalin yang tadi'] },
  { title: 'Rencana', hint: 'Anggaran, pengingat, rutin', items: ['anggaran makan 2jt', 'ingatkan bayar listrik tgl 20', 'bayar wifi 300rb tiap tanggal 5'] },
];

/* ------------------------------------------------------------------ Small talk */

const GREET = /^(?:halo+|hal+o|hai+|hay|hi+|hello|helo|hey|hei|pagi|siang|sore|malam|met (?:pagi|siang|sore|malam)|selamat (?:pagi|siang|sore|malam)|assalamu.?alaikum|asw|permisi|p)(?:\s+(?:min|kak|bro|sis|bot|asisten|dompet|ajaib|semua))*$/;
const THANKS = /^(?:makasih+|makasi|mksh|maksih|terima ?kasih|trims|thanks|thank you|thx|tq|ty|nuhun|suwun|tengkyu)\b/;
const ACK = /^(?:ok(?:e|ay|ey)?|okk+|sip+|siap|mantap|mantul|good|nice|keren|baik|oke deh|okedeh|ya|iya|yoi|noted|wkwk+|haha+|hehe+|hihi|👍|🙏)$/;
const HELP = /^(?:bantuan|help|tolong|menu|fitur|panduan|cara ?pakai|caranya)$|\b(?:bisa apa(?: aja| saja)?|bisa ngapain|ngapain aja|bisa bantu apa|apa (?:aja|saja) yang bisa|fitur(?:nya)? apa)\b/;
const ABOUT = /\b(?:kamu siapa|siapa kamu|kamu itu apa|kamu apa|ini apa|ini siapa)\b/;
const EXAMPLES = /^(?:contoh(?:nya)?|template|kasih contoh|minta contoh|ide)(?:\s+(?:dong|lagi|chat|kalimat))*$/;

function partOfDay(hour = 12) { return hour < 11 ? 'pagi' : hour < 15 ? 'siang' : hour < 18 ? 'sore' : 'malam'; }

/* ------------------------------------------------------------------ Changing the record being made */

const DATE_PHRASE = String.raw`(?:kemarin|kemaren|kmrn|kmarin|kmren|tadi pagi|tadi siang|tadi sore|tadi malam|semalam|hari ini|besok|lusa|(?:\d+ )?hari lalu|minggu lalu|(?:tgl|tanggal) \d{1,2}(?:[/-]\d{1,2})?|\d{1,2}[/-]\d{1,2}|(?:hari )?(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu)(?: kemarin| lalu)?)`;
const DATE_ONLY = new RegExp(String.raw`^(?:eh,?\s+)?(?:itu\s+|tanggalnya\s+|harinya\s+|jadi\s+|ganti\s+|ubah\s+)?(${DATE_PHRASE})$`);
const DATE_ANY = new RegExp(String.raw`\b${DATE_PHRASE}\b`, 'g');
const WALLET_EDIT = /^(?:eh,?\s+)?(?:pakai|pake|pk|via|lewat|dari|bayar(?:nya)?\s+(?:pakai|pake|via|dari)|ganti\s+(?:ke|jadi)|dompet(?:nya)?)\s+(.+)$/;
const CATEGORY_EDIT = /^(?:eh,?\s+)?(?:kategori(?:nya)?|masuk(?:in|kan)?(?:\s+ke)?(?:\s+kategori)?|masukkan ke|jadi kategori|ganti kategori(?:nya)?(?:\s+(?:jadi|ke))?|ubah kategori(?:nya)?(?:\s+(?:jadi|ke))?)\s+(.+)$/;
const AMOUNT_EDIT = /^(?:eh,?\s+|eh\s+salah,?\s+)?(?:ganti|ubah|jadiin|jadi(?:nya)?|bukan|salah|harusnya|seharusnya|koreksi|maksudnya|maksudku|yang bener|yg bener|benernya|nominalnya|totalnya)?\b/;
const SPLIT_EDIT = /^(?:(?:di)?bagi(?:2| dua| tiga| empat| rata| \d)|patungan|split|bagi rata|50:50)\b/;
const CANCEL = /^(?:batal(?:in|kan)?|ga jadi|gak jadi|nggak jadi|ngga jadi|enggak jadi|gajadi|gk jadi|cancel|ga usah|gak usah|nggak usah|gausah|skip|lewati|hapus aja|jangan(?: dicatat)?)$/;
const UNDO = /\b(?:batal(?:in|kan)?|hapus(?:in)?|undo|delete|cancel)\b.*\b(?:barusan|tadi|terakhir|sebelumnya|td)\b/;

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
const withCategory = (text: string, category: string) => `${lower(text).replace(/\s+(?:kategori|masuk kategori)\s+.+$/, '').trim()} kategori ${category}`;

/* ------------------------------------------------------------------ Questions asked again */

const FOLLOW = /^(?:kalau|kalo|klo|kl|trus|terus|lalu|gimana|bagaimana|yg|yang|kalau yang|kalo yang|kalo buat|kalau buat|kalo untuk|kalau untuk|kalo di|kalau di|terus kalau|trus kalo)\s+(.+)$/;
const FRAME = /\b(?:berapa|brp|brapa|total|totalnya|pengeluaran(?:ku|nya)?|pemasukan(?:ku|nya)?|belanja(?:ku)?|habis(?:nya)?|keluar(?:nya)?|uang(?:ku)?|buat|untuk|utk|di|aku|saya|gue|ku|sih|ya|aja|dong|yang|yg|udah|sudah|selama|dalam|sampai|sampe)\b/g;

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
  return countedBudgets(ctx.data.budgets.filter(b => b.active)).map(b => { const c = budgetCurrent(b, ctx.data.transactions, ctx.data.categories, asOf, ctx.salaryDay); return { name: b.name, ...c, used: c.available > 0 ? c.spent / c.available : 0 }; }).sort((a, b) => b.used - a.used);
}
function money(ctx: ChatContext) {
  const m = metrics(ctx.data as Data, ctx.cycle.start, ctx.cycle.end, ctx.salaryDay, new Date(`${ctx.today}T12:00:00`));
  const left = Math.max(1, daysBetween(ctx.today, ctx.cycle.end)), passed = Math.max(1, daysBetween(ctx.cycle.start, ctx.today) + 1);
  return { free: m.free, income: m.income, expenses: m.expenses, left, passed, daily: m.free / left, pace: m.expenses / passed };
}

function summary(text: string, ctx: ChatContext): ChatReply {
  const p = periodOf(text, ctx);
  const txs = ctx.data.transactions.filter(t => t.date >= p.start && t.date < p.end);
  const income = txs.reduce((n, t) => n + transactionIncome(t), 0), spent = txs.reduce((n, t) => n + transactionExpense(t), 0);
  const top = categoryTotals(ctx, p.start, p.end).slice(0, 3), m = money(ctx), warn = budgetsNow(ctx).filter(b => b.used >= 0.8).slice(0, 3);
  const lines: SayLine[] = [
    { label: 'Pemasukan', value: rp(income), tone: 'up' }, { label: 'Pengeluaran', value: rp(spent), tone: 'down' },
    { label: 'Selisih', value: rp(income - spent), tone: income - spent >= 0 ? 'good' : 'warn' },
    { label: 'Uang bebas sekarang', value: rp(m.free) }, { label: `Jatah harian (${m.left} hari ke gajian)`, value: rp(m.daily) },
  ];
  const parts = [`Ringkasan ${p.label}: ${txs.length ? `${txs.length} catatan.` : 'belum ada catatan.'}`];
  if (top.length && spent) parts.push(`Paling banyak di ${top.map(c => `${c.name} ${rp(c.amount)} (${Math.round(c.amount / spent * 100)}%)`).join(', ')}.`);
  if (warn.length) parts.push(`Anggaran yang hampir habis: ${warn.map(b => `${b.name} ${Math.round(b.used * 100)}%`).join(', ')}.`);
  return { kind: 'say', title: 'Ringkasan', text: parts.join(' '), lines, tone: warn.some(b => b.used >= 1) || m.free <= 0 ? 'warn' : 'info', chips: ['pengeluaran terbesar bulan ini', 'kasih tips hemat', 'sisa anggaran makan berapa'] };
}

/* ------------------------------------------------------------------ "Boleh beli …?" */

const AFFORD = /\b(?:boleh|bisa|aman|sanggup|cukup|mampu|kuat|oke|ok)\b.*\b(?:beli|beliin|jajan|belanja|ambil|checkout|co|bayar|nonton|makan|liburan|traktir|top ?up|langganan|sewa)\b|\b(?:mau|pengen|pingin|ingin)\s+(?:beli|ambil|checkout)\b.*\b(?:aman|boleh|bisa|gimana|ga|gak|nggak|enggak)\b/;

function afford(text: string, ctx: ChatContext): ChatReply | null {
  const t = lower(text), a = findAmounts(t).find(x => x.value > 0);
  if (!a) return null;
  const item = t.replace(a.text, ' ').replace(/\b(?:aku|saya|gue|gw|boleh|bisa|aman|sanggup|cukup|mampu|kuat|ga|gak|nggak|enggak|tidak|kah|nih|sih|ya|dong|mau|pengen|pingin|ingin|kalau|kalo|klo|harga(?:nya)?|seharga|yang|yg|buat|untuk|oke|ok|gimana|nggak\?)\b/g, ' ').replace(/[?!.,]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const m = money(ctx), after = m.free - a.value, dailyAfter = after / m.left;
  const guess = suggestCategory({ text: item, item, amount: a.value, type: 'expense' }, { categories: ctx.data.categories, history: [] });
  const catId = guess?.subcategoryId || guess?.categoryId, cat = ctx.data.categories.find(c => c.id === catId);
  const parent = cat?.parentId ? ctx.data.categories.find(c => c.id === cat.parentId) : cat;
  const budget = parent ? budgetsNow(ctx).find(b => ctx.data.budgets.find(x => x.name === b.name)?.categoryId === parent.id) : undefined;
  const lines: SayLine[] = [
    { label: 'Harga', value: rp(a.value) }, { label: 'Uang bebas sekarang', value: rp(m.free) },
    { label: 'Sisa setelah beli', value: rp(after), tone: after < 0 ? 'warn' : 'good' },
    { label: `Jatah harian (${m.left} hari ke gajian)`, value: `${rp(m.daily)} → ${rp(Math.max(0, dailyAfter))}`, tone: dailyAfter < m.pace ? 'warn' : 'good' },
  ];
  if (budget) lines.push({ label: `Sisa anggaran ${budget.name}`, value: rp(budget.remaining), tone: a.value > budget.remaining ? 'warn' : 'good' });
  let verdict: string, tone: 'good' | 'warn' | 'info';
  if (after < 0) { verdict = `Belum aman. Uang bebasmu ${rp(m.free)}, kurang ${rp(-after)} untuk ${item.replace(/^(?:beli|beliin)\s+/, '') || 'ini'}. Coba tunggu gajian atau sisihkan dulu sedikit-sedikit.`; tone = 'warn'; }
  else if (dailyAfter < m.pace) { verdict = `Bisa, tapi mepet. Setelah beli, jatahmu ${rp(dailyAfter)}/hari selama ${m.left} hari, lebih kecil dari rata-rata pengeluaranmu ${rp(m.pace)}/hari periode ini.`; tone = 'warn'; }
  else { verdict = `Aman. Setelah beli masih ada ${rp(after)} uang bebas, sekitar ${rp(dailyAfter)}/hari sampai gajian.`; tone = 'good'; }
  if (budget && a.value > budget.remaining) verdict += ` Tapi anggaran ${budget.name} tinggal ${rp(budget.remaining)}.`;
  const thing = item.replace(/\b(?:beli|beliin|membeli|jajan|belanja|ambil|checkout|co|bayar)\b/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return { kind: 'say', title: thing ? `Beli ${thing}?` : 'Boleh beli?', text: verdict, lines, tone, chips: ['ringkasan bulan ini', 'kasih tips hemat'], note: 'Dihitung dari uang bebas dan pengeluaranmu sendiri. Keputusan tetap di tanganmu.' };
}

/* ------------------------------------------------------------------ Tips */

const TIPS = /\b(?:tips|tip|saran|kasih saran|cara hemat|biar hemat|gimana (?:caranya )?hemat|supaya hemat|ngirit|irit|nabung|menabung|boros)\b/;

function tips(ctx: ChatContext): ChatReply {
  const m = money(ctx), top = categoryTotals(ctx, ctx.cycle.start, ctx.cycle.end), budgets = budgetsNow(ctx);
  const out: string[] = [];
  const cycleTx = ctx.data.transactions.filter(t => t.date >= ctx.cycle.start && t.date < ctx.cycle.end);
  const hasBudget = (id: string) => ctx.data.budgets.some(b => b.active && b.categoryId === id);
  if (top[0] && m.expenses) out.push(`${top[0].name} paling besar periode ini: ${rp(top[0].amount)} (${Math.round(top[0].amount / m.expenses * 100)}% pengeluaran).${hasBudget(top[0].id) ? '' : ' Pasang anggaran untuknya supaya ada batasnya.'}`);
  const over = budgets.find(b => b.used >= 1), close = budgets.find(b => b.used >= 0.8 && b.used < 1);
  if (over) out.push(`Anggaran ${over.name} sudah lewat ${rp(-over.remaining)}. Tahan dulu belanja di sana sampai periode baru.`);
  else if (close) out.push(`Anggaran ${close.name} sudah terpakai ${Math.round(close.used * 100)}%, sisa ${rp(close.remaining)}.`);
  const small = cycleTx.filter(t => t.type === 'expense' && t.amount <= 30000);
  if (small.length >= 5) out.push(`Ada ${small.length} jajan kecil (≤ Rp30.000) dengan total ${rp(small.reduce((n, t) => n + t.amount, 0))}. Kecil-kecil, tapi kalau dikumpulkan terasa.`);
  out.push(m.free > 0 ? `Supaya cukup sampai gajian, usahakan belanja tidak lebih dari ${rp(m.daily)} per hari.` : 'Uang bebasmu sedang habis. Prioritaskan kebutuhan pokok dan tagihan dulu.');
  if (out.length < 3) out.push('Sisihkan tabungan di awal setelah gajian, bukan dari sisa di akhir bulan.');
  return { kind: 'say', title: 'Tips dari catatanmu', text: 'Ini yang kulihat dari catatanmu:', lines: out.slice(0, 4).map((s, i) => ({ label: `${i + 1}`, value: s })), tone: 'info', chips: ['ringkasan bulan ini', 'aman nggak beli sepatu 500rb?'] };
}

/* ------------------------------------------------------------------ The reply */

const CALC_LEAD = /^(?:hitung(?:in|kan)?|itung(?:in)?|berapa(?:kah)?|brp|brapa|kalkulator|kalkulasi|calc)\s+/;
const CALC_TAIL = /\s*(?:=|berapa|brp|ya|sih|hasilnya|jadinya|jadi berapa|itu)?\s*$/;
const CALC_AGAIN = /^(?:kalau|kalo|klo|terus|trus|lalu)?\s*((?:di)?bagi|(?:di)?kali|(?:di)?tambah|(?:di)?kurang(?:i)?|plus|minus|x|\*|\/|\+|-|÷|×)\s*(.+)$/;

export function chatReply(input: string, memory: ChatMemory, ctx: ChatContext): ChatResult {
  const raw = input.trim(), t = clean(raw), mem = { ...memory };
  const say = (intent: ChatIntent, reply: ChatReply, next: ChatMemory = mem): ChatResult => ({ intent, reply, memory: { ...next, last: next.last === mem.last && intent !== 'calc' ? 'say' : next.last } });
  const plan = (text: string, intro?: string, intent: ChatIntent = 'plan'): ChatResult => {
    const reading = ctx.read(text);
    if (reading === 'question') return { intent: intent === 'plan' ? 'question' : intent, reply: { kind: 'plan', text, intro }, memory: { ...mem, question: text, last: 'question' } };
    return { intent, reply: { kind: 'plan', text, intro }, memory: { ...mem, plan: { text, status: 'pending' }, last: 'record' } };
  };
  const pending = mem.plan?.status === 'pending' ? mem.plan : undefined, saved = mem.plan?.status === 'saved' ? mem.plan : undefined;
  const name = ctx.name ? ` ${ctx.name}` : '';

  if (!t) return say('unknown', { kind: 'say', text: 'Tulis apa saja: catatan, pertanyaan, atau hitungan.', chips: TEMPLATES[0].items.slice(0, 2) });
  if (GREET.test(t)) return say('greet', { kind: 'say', text: `Selamat ${partOfDay(ctx.hour)}${name}! Mau catat apa, tanya apa, atau hitung apa hari ini?`, chips: ['makan siang 35rb pakai gopay', 'ringkasan bulan ini', 'bisa apa aja?'] });
  if (THANKS.test(t)) return say('thanks', { kind: 'say', text: 'Sama-sama! Kabari lagi kalau ada yang mau dicatat.', chips: ['ringkasan bulan ini'] });
  if (ACK.test(t)) return say('ack', { kind: 'say', text: pending ? 'Oke. Kartu di atas tinggal disimpan, atau bilang kalau ada yang mau diubah.' : 'Siap!' });
  if (ABOUT.test(t)) return say('about', { kind: 'say', text: 'Aku asisten Dompet Ajaib. Semua kubaca dan kuhitung di HP-mu sendiri dari catatanmu, tanpa dikirim ke mana-mana. Aku bisa mencatat, menjawab pertanyaan soal uangmu, menghitung, dan memberi ringkasan.', chips: ['bisa apa aja?'] });
  if (HELP.test(t)) return say('help', { kind: 'say', title: 'Yang bisa kubantu', text: 'Tulis seperti chat biasa. Contohnya:', lines: TEMPLATES.slice(0, 7).map(g => ({ label: g.title, value: `“${g.items[0]}”` })), chips: ['contoh', 'ringkasan bulan ini'], note: 'Ketuk tombol contoh di sebelah kotak ketik untuk lihat semua template.' });
  if (EXAMPLES.test(t)) return say('examples', { kind: 'say', title: 'Coba salah satu', text: 'Ketuk untuk mengirim:', chips: TEMPLATES.flatMap(g => g.items.slice(0, 1)).concat(TEMPLATES[1].items[1], TEMPLATES[3].items[1]) });

  // The record being made: cancelled, or changed by a short follow-up.
  if (pending && CANCEL.test(t)) return { intent: 'cancel', reply: { kind: 'say', text: 'Oke, tidak jadi dicatat.' }, memory: { ...mem, plan: { ...pending, status: 'dismissed' } }, dismiss: true };
  if (UNDO.test(t) || saved && CANCEL.test(t)) return plan('hapus transaksi terakhir', 'Ini catatan terakhir. Yakin dihapus?', 'undo');
  const target = pending || saved;
  if (target) {
    const words = t.split(' ').length;
    const date = t.match(DATE_ONLY), wallet = t.match(WALLET_EDIT), category = t.match(CATEGORY_EDIT);
    const amount = words <= 6 && AMOUNT_EDIT.test(t) ? findAmounts(t).find(a => a.value > 0) : undefined;
    const onlyAmount = amount && !/\p{L}{3,}/u.test(unfill(t.replace(amount.text, ' ').replace(/^(?:eh,?\s+|eh\s+salah,?\s+)?(?:ganti|ubah|jadiin|jadi(?:nya)?|bukan|salah|harusnya|seharusnya|koreksi|maksudnya|maksudku|yang bener|yg bener|benernya|nominalnya|totalnya)\b/, ' ').replace(/[,.]/g, ' ')).replace(/\b(?:aja|saja|deh|dong|ya|kok|rb|ribu|jt|juta|k)\b/g, ''));
    const pickedWallet = wallet ? walletsIn(unfill(wallet[1]), ctx.quick.wallets)[0] : undefined;
    if (pending) {
      if (onlyAmount) return plan(withAmount(pending.text, amount!.text), `Oke, nominalnya kuganti jadi ${rp(amount!.value)}.`, 'edit');
      if (pickedWallet) return plan(withWallet(pending.text, pickedWallet.name.toLocaleLowerCase('id-ID'), ctx.quick), `Oke, pakai ${pickedWallet.name}.`, 'edit');
      if (wallet && !findAmounts(t).length && unfill(wallet[1]).split(' ').length <= 2) {
        const names = ctx.quick.wallets.filter(w => !w.isArchived).map(w => w.name);
        return say('edit', { kind: 'say', text: `Dompet “${unfill(wallet[1])}” belum ada di daftar dompetmu. Pilih salah satu:`, chips: names.slice(0, 5).map(n => `pakai ${n.toLocaleLowerCase('id-ID')}`) });
      }
      if (date) return plan(withDate(pending.text, date[1]), `Oke, tanggalnya ${date[1]}.`, 'edit');
      if (category) return plan(withCategory(pending.text, unfill(category[1])), `Oke, kategorinya ${unfill(category[1])}.`, 'edit');
      if (SPLIT_EDIT.test(t)) return plan(`${pending.text} ${t}`, 'Oke, kubagi.', 'edit');
    } else if (saved) {
      if (onlyAmount) return plan(`ubah transaksi terakhir jadi ${amount!.text}`, `Catatan tadi sudah tersimpan. Kuubah nominalnya jadi ${rp(amount!.value)}?`, 'edit');
      if (date) return plan(`ubah transaksi terakhir jadi ${date[1]}`, `Catatan tadi sudah tersimpan. Kupindah ke ${date[1]}?`, 'edit');
      if (pickedWallet || category) return say('edit', { kind: 'say', text: `Catatan tadi sudah tersimpan. ${pickedWallet ? 'Dompet' : 'Kategori'}nya diubah lewat Transaksi: ketuk catatannya lalu Ubah.`, chips: ['buka transaksi'] });
    }
  }

  // A calculation carried on: "kalau dibagi 4?".
  const again = mem.number !== undefined && mem.last === 'calc' ? t.match(CALC_AGAIN) : null;
  if (again) { const c = calculate(`${mem.number!.toLocaleString('id-ID', { maximumFractionDigits: 6 })} ${again[1]} ${again[2]}`); if (c) return say('calc', calcReply(c, true), { ...mem, number: c.value, last: 'calc' }); }

  // The last question again, with a new period or subject.
  if (mem.question && (mem.last === 'question' || readPeriod(t, ctx.today, ctx.salaryDay))) {
    const f = t.match(FOLLOW), onlyPeriod = readPeriod(t, ctx.today, ctx.salaryDay);
    const rest = f ? f[1] : onlyPeriod && unfill(t.replace(onlyPeriod.said, ' ')).replace(/\s/g, '') === '' ? t : '';
    if (rest && ctx.read(t) !== 'record' && !findAmounts(t).some(a => a.marked)) {
      const q = askAgain(mem.question, rest, ctx.today, ctx.salaryDay);
      if (q !== lower(mem.question)) return { intent: 'followup', reply: { kind: 'plan', text: q }, memory: { ...mem, question: q, last: 'question' } };
    }
  }

  // Calculator.
  const lead = CALC_LEAD.test(t), body = t.replace(CALC_LEAD, '').replace(CALC_TAIL, '');
  const c = calculate(body);
  if (c && (lead || !/\p{L}{3,}/u.test(body.replace(/\b(?:dikali|dibagi|ditambah|dikurangi?|kali|bagi|tambah|kurang|plus|minus|persen|dari|setengah|separuh|sepertiga|seperempat|ribu|rebu|juta|miliar|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|puluh|ratus|belas)\b/g, '')))) return say('calc', calcReply(c, false), { ...mem, number: c.value, last: 'calc' });

  if (/^(?:buka|lihat|liat|ke|pergi ke|masuk ke)\s+/.test(t)) return plan(raw);
  if (AFFORD.test(t)) { const r = afford(raw, ctx); if (r) return say('afford', r); }
  if (TIPS.test(t) && !findAmounts(t).some(a => a.value > 0)) return say('tips', tips(ctx));
  if (/\b(?:ringkasan|rangkuman|rekap|ikhtisar|kondisi keuangan|keadaan keuangan|status keuangan|keuangan(?:ku)? (?:gimana|bagaimana)|(?:gimana|bagaimana) keuangan(?:ku)?|cashflow|arus kas|aman (?:ga|gak|nggak|enggak|tidak )?(?:sampai|sampe) gajian)\b/.test(t)) return say('summary', summary(t, ctx));

  const reading = ctx.read(raw);
  if (reading !== 'none' || findAmounts(t).some(a => a.value > 0)) return plan(raw);
  return say('unknown', { kind: 'say', text: 'Hmm, aku belum nangkep maksudnya. Coba tulis seperti ini:', chips: ['makan siang 35rb pakai gopay', 'pengeluaran bulan ini berapa', 'hitung 15% dari 2,5jt', 'bisa apa aja?'] });
}

function calcReply(c: NonNullable<ReturnType<typeof calculate>>, again: boolean): ChatReply {
  return { kind: 'say', title: 'Hitungan', text: `${c.expression} = ${calcText(c)}`, tone: 'info', chips: [again ? 'kalau dibagi 2?' : 'kalau dibagi 3?', ...(c.money && c.value > 0 ? [`keluar ${calcText(c)}`] : [])], note: c.money && Math.abs(c.value - Math.round(c.value)) > 1e-6 ? 'Dibulatkan ke rupiah terdekat.' : undefined };
}
