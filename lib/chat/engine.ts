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
 *   - 7.7: every budget at a glance, days to payday with the daily allowance, a kind reply when money worries, saving
 *     goals turned into a fund to create, and small talk;
 *   - 7.8 (chatbot v2): a personality (lib/chat/persona.ts: jokes and pantun, banter, anger, apologies, listening when
 *     the person vents, a serious mode) and a conversation that goes on: "lagi" / "yang lain?" continue the topic,
 *     "kenapa?" / "maksudnya?" explain the last answer, "boleh" / "nggak usah" answer the assistant's offer, and after
 *     two messages not understood the person can teach it ("ajari aku", "kalau aku bilang boncos artinya boros");
 *   - four ways of talking (lib/chat/voice.ts), greetings, help, templates;
 *   - a trained intent model (NLP.js, lib/chat/model.ts) for sentences the rules do not catch, and phrases learned from
 *     the person: a message not understood, followed by one that is, is remembered (on this device).
 *
 * The caller passes the data and keeps the memory; `inspect` is Catat otomatis' reading of a sentence.
 */
import { budgetCurrent, countedBudgets, expenseAllocations, metrics, transactionExpense, transactionIncome } from '../accounting.ts';
import { readPeriod } from '../catat/ask.ts';
import { suggestCategory } from '../categorize.ts';
import { readEveryday } from '../catat/everyday.ts';
import { findAmounts, walletsIn, type QuickContext } from '../quick-entry.ts';
import type { Data } from '../types';
import { calculate, calcText } from './calc.ts';
import { clausesOf, readBreakdown, readDiscount, readDraftEdit, readHappened, withAmount, withCategory, withDate, withWallet } from './draft.ts';
import { compareAnswer, readFaq } from './faq.ts';
import { normalizeWords, type ChatModelIntent } from './feature.ts';
import type { AskField, Inspection } from './inspect.ts';
import { CURHAT_TOPICS, JOKES, SELF_HARM, curhatReply, curhatTopic, persona as P, pickVar, safety } from './persona.ts';
import { say as V, you, yours, type Voice } from './voice.ts';
import { readWordMath } from './wordmath.ts';
import { RIDDLES, ROAST, TREAT, USER_PANTUN, USER_RIDDLE, guessUserRiddle, insulted, laughAtJoke, laughBack, mildOnly, pantunBack, readLaugh, readSwear, readUserJoke, riddleAnswer, roast, swearLead, swearReply, teaseLead, vo } from './fun.ts';
import { readGame, type GameState } from './games.ts';
import { readHowto } from './howto.ts';
import { readStats } from './stats.ts';
import { FUN_MORE, readFunContent, readTalk } from './talk.ts';
import { opensMenu, readModule } from './modules.ts';

export type ChatData = Pick<Data, 'wallets' | 'transactions' | 'budgets' | 'categories' | 'funds' | 'debts' | 'receivables' | 'claims'> & Partial<Pick<Data, 'recurring' | 'wishlist' | 'drafts' | 'plannedTransactions'>>;
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
  /** 7.8: replies so far (wordings rotate with it), and what the talk is about now. */
  turn?: number; topic?: string;
  /** The message the assistant offered ("Mau cek pengeluaran hari ini?"): "boleh" sends it, "nggak" declines. */
  offer?: string;
  /** A phrase the person is teaching: their next message is what it means. */
  teaching?: string;
  /** Messages not understood in a row (two → the assistant asks to be taught). */
  misses?: number;
  /** Jokes told lately (not repeated), venting turns in a row, serious mode, the page of tips shown. */
  jokes?: number[]; curhat?: number; serious?: boolean; tipsPage?: number;
  /** How the last answer was worked out, for "kenapa?" / "maksudnya?". */
  explain?: string;
  /** 7.9: what the assistant just asked in words ("udah diterima?", "ubah apa?", "masing-masing berapa?"), and about whom. */
  pendingQ?: 'claim' | 'field' | 'who'; people?: string[];
  /** The person the talk is about ("dia" next time), the thing it is about ("bandingin bulan lalu"). */
  person?: string; subject?: string;
  /** What is left after the last subtraction ("kalau makan lagi 80rb?"), and the things last summed ("oke catat tunai"). */
  remain?: number; calcPlan?: string;
  /** "kopinya 18rb" after "kopi tiga": the card if 18rb is each one, and if it is all of them. */
  unitAsk?: { per: string; total: string; note: string };
  /** 8.0: the riddle the assistant asked (its index), or where the person's own riddle is (question asked → punchline). */
  riddle?: number; userRiddle?: 'question' | 'answer';
  /** 8.1: the game waiting for a move, and the kind of fun content shown last ("lagi" gives another). */
  game?: GameState; funKind?: string;
};
export type SayTone = 'up' | 'down' | 'warn' | 'good';
export type SayLine = { label: string; value: string; tone?: SayTone };
/** A bar from 0 to 1 (more than 1 is over): a budget used, a share of spending, the pay period gone by. */
export type SayBar = { label: string; value: string; ratio: number; tone?: 'good' | 'warn' | 'bad'; note?: string };
/** Which card an answer is shown as (its icon and colour). */
export type SayCard = 'summary' | 'afford' | 'tips' | 'calc' | 'budget' | 'payday' | 'mood' | 'goal' | 'help' | 'talk';
export type ChatReply =
  /** Read by Catat otomatis: cards to save, an answer, a change to a record. `intro` is said before the card. */
  | { kind: 'plan'; text: string; intro?: string; chips?: string[] }
  /** An answer: the sentence, then (each optional) one big figure, small figure tiles, bars, numbered steps, and rows. */
  | { kind: 'say'; text: string; title?: string; card?: SayCard; hero?: { label: string; value: string; note?: string; tone?: SayTone }; stats?: SayLine[]; bars?: SayBar[]; steps?: string[]; lines?: SayLine[]; chips?: string[]; tone?: 'good' | 'warn' | 'info'; note?: string;
    /** 7.8: how this answer was worked out, said when the person asks "kenapa?" (not shown on the card). */
    why?: string;
    /** 8.0: a button to the menu the answer is about. */
    open?: { view: string; label: string } };
export type ChatIntent = 'greet' | 'thanks' | 'ack' | 'help' | 'examples' | 'about' | 'voice' | 'edit' | 'fill' | 'cancel' | 'undo' | 'followup' | 'calc' | 'summary' | 'afford' | 'tips' | 'plan' | 'question' | 'unknown'
  | 'smalltalk' | 'mood' | 'budget' | 'payday' | 'goal'
  | 'joke' | 'banter' | 'angry' | 'curhat' | 'serious' | 'teach' | 'apology' | 'explain' | 'decline'
  /** 7.9: what things mean in the app; asking back or saying honestly what the chat does not do. */
  | 'faq' | 'clarify'
  /** 8.0: swearing answered in the chosen style, a roast of the spending, riddles both ways, a menu of the app. */
  | 'swear' | 'roast' | 'riddle' | 'module'
  /** 8.1: quotes, facts, challenges and fortune; games; how to use a feature (from Tanya Jawab). */
  | 'fun' | 'game' | 'howto';
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
/** A round figure for a suggestion (whole millions from 10jt, half millions from 1jt, else 50rb steps). */
const nice = (n: number) => n >= 1e7 ? Math.round(n / 1e6) * 1e6 : n >= 1e6 ? Math.round(n / 5e5) * 5e5 : Math.max(5e4, Math.round(n / 5e4) * 5e4);
/** That figure as people write it: "12jt", "2,5jt", "750rb". */
const short = (n: number) => { const v = nice(n); return v >= 1e6 ? `${(v / 1e6).toLocaleString('id-ID')}jt` : `${v / 1e3}rb`; };
const pct = (r: number) => `${Math.round(r * 100)}%`;

/* ------------------------------------------------------------------ Templates */

export type TemplateGroup = { key: string; title: string; hint: string; items: string[] };
/** Everything the chat can do, as messages to tap (the empty chat, the suggestion strip, "Contoh", and help). */
export const TEMPLATES: TemplateGroup[] = [
  { key: 'catat', title: 'Catat', hint: 'Pengeluaran, pemasukan, transfer', items: ['makan siang 35rb pakai {ewallet}', 'gaji 8,5jt masuk {bank}', 'transfer 500rb dari {bank} ke {to}', 'kopi 22rb, parkir 5rb, bensin 30rb'] },
  { key: 'patungan', title: 'Patungan', hint: 'Split Bill, utang, piutang', items: ['hokben 162.003 dibagi2 sama ferdi', 'makan 100rb aku 60rb ferdi 40rb', 'listrik 450rb sepertiga buat kosan sebelah', 'ferdi bayarin makan 90rb, aku hutang setengah'] },
  { key: 'kategori', title: 'Bagi kategori', hint: 'Satu belanja, beberapa keperluan', items: ['hokben 162.003 dibagi 2, satu buat gue, satu traktir teman', 'belanja 200rb, 150rb buat makan, sisanya sabun'] },
  { key: 'hitung', title: 'Hitung', hint: 'Kalkulator di dalam chat', items: ['hitung 128181 dibagi 3 dikali 2', 'berapa 15% dari 2,5jt', 'diskon 50% makan 80rb'] },
  { key: 'tanya', title: 'Tanya', hint: 'Dijawab dari catatanmu', items: ['pengeluaran bulan ini berapa', 'kapan terakhir isi bensin', 'saldo semua dompet berapa', 'sisa anggaran makan berapa', 'hari apa aku paling boros', 'berapa hari aku nggak jajan', 'paling sering belanja di mana'] },
  { key: 'saran', title: 'Ringkasan & saran', hint: 'Kondisi keuangan, anggaran, gajian', items: ['ringkasan bulan ini', 'cek semua anggaran', 'kapan gajian?', 'aman nggak beli sepatu 500rb?', 'kasih tips hemat', 'pengen nabung buat liburan'] },
  { key: 'ngobrol', title: 'Ngobrol', hint: 'Bercanda, tebak-tebakan, roasting, curhat', items: ['kasih jokes dong', 'tebak-tebakan dong', 'roasting pengeluaranku', 'aku punya tebakan', 'boleh curhat?', 'kalau aku bilang boncos artinya boros'] },
  { key: 'main', title: 'Main & seru', hint: 'Suit, tebak angka, motivasi, ramalan', items: ['suit yuk', 'main tebak angka', 'pilihin dong, bakso atau mie ayam?', 'kasih motivasi dong', 'fakta unik soal uang', 'kasih tantangan hemat', 'ramal keuangan aku'] },
  { key: 'fitur', title: 'Cara pakai', hint: 'Dijawab dari Tanya Jawab', items: ['cara bikin anggaran', 'cara split bill', 'cara pasang PIN', 'cara catat utang', 'cara backup data'] },
  { key: 'menu', title: 'Semua menu', hint: 'Utang, piutang, target, rutin, wish list', items: ['utang aku berapa', 'siapa aja yang utang ke aku', 'progres target tabungan', 'langganan apa aja', 'buka wishlist'] },
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
/** A greeting with a little more after it: "pagi min, apa kabar", "malam kak, masih bangun?" (7.7, post-hoc). */
const GREET_LEAD = /^(?:halo+|hai+|hi+|hello|hey|pagi|siang|sore|malam|met (?:pagi|siang|sore|malam)|selamat (?:pagi|siang|sore|malam)|assalamu.?alaikum)(?:\s+(?:min|kak|bro|sis|bot|asisten|dompet|ajaib|semua))*\s*[,!.]\s*(.+)$/;
const THANKS = /^(?:(?:iya|ya|oke|ok|sip|nah|wah|wih|mantap)\s+)?(?:makasih+|makasi|mksh|maksih|terima ?kasih|trims|thanks|thank you|thx|tq|ty|nuhun|suwun|tengkyu)\b/;
const ACK = /^(?:ok(?:e|ay|ey)?|okk+|sip+|siap|mantap|mantul|good|nice|keren|baik|oke deh|okedeh|ya|iya|yoi|noted|wkwk+|haha+|hehe+|hihi|👍|🙏|(?:baik|aman|sehat|lumayan|alhamdulillah|biasa)(?:\s+(?:kok|aja|banget|bgt|baik|alhamdulillah|sih))*|so far so good|fine)$/;
const HELP = /^(?:bantuan|help|tolong|menu|fitur|panduan|cara ?pakai|caranya)$|\b(?:bisa apa(?: aja| saja)?|bisa ngapain|ngapain aja|bisa bantu apa|apa (?:aja|saja) yang bisa|fitur(?:nya|mu)? apa|apa (?:aja|saja) fitur(?:nya|mu)?|cara (?:pakai|make|makenya|pakainya|menggunakan)(?! \p{L}+ (?:\d|rp)))\b/u;
// 8.2: "ini apa" only about the app itself ("catatan minggu ini apa saja" is a question about records).
const ABOUT = /\b(?:kamu siapa|siapa kamu|kamu itu apa|kamu apa)\b|(?:^|\b(?:aplikasi|app|bot|asisten|chat)\s+)ini\s+(?:apa|siapa)(?:\s+(?:sih|ya|dong|kok))?$|^kamu\s+(?:(?:tuh|itu|ini)\s+)?(?:sebenarnya\s+)?(?:apa|siapa)$/;
const EXAMPLES = /^(?:(?:liat|lihat|minta|kasih|mau liat|mau lihat|tunjukin|tampilin)\s+)?(?:contoh(?:nya)?|template(?:nya)?|ide)(?:\s+(?:nya|dong|lagi|chat|kalimat|apa aja|yang ada))*$/;
const VOICE_WORDS: [RegExp, Voice][] = [[/\b(?:bar[- ]?bar|barbar|toxic|brutal|nyolot|preman)\b/, 'barbar'], [/\b(?:formal|baku|sopan|anda)\b/, 'sopan'], [/\b(?:lo[- ]?gue|lu[- ]?gue|gue[- ]?lo|gaul)\b/, 'gaul'], [/\b(?:singkat|pendek|ringkas|to the point)\b/, 'singkat'], [/\b(?:santai|kayak temen|jangan kaku|ga kaku|nggak kaku|biasa aja)\b/, 'santai']];
const VOICE_TALK = /\b(?:bahasa|gaya|ngomong|jawab(?:nya)?|ngobrol|bicara|pakai|pake|balas(?:nya)?|bales(?:nya)?|respon(?:nya)?)\b/;

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
const TIPS = /\b(?:tips|tip|saran|kasih saran|cara hemat|biar hemat|gimana (?:caranya )?hemat|supaya hemat|ngirit|irit|nabung|menabung|boros|nyisihin|sisihin|menyisihkan|disiplin)\b/;
const SUMMARY = /\b(?:ringkasan|rangkuman|rekap|ikhtisar|kondisi keuangan|keadaan keuangan|status keuangan|keuangan(?:ku)? (?:gimana|bagaimana)|(?:gimana|bagaimana) keuangan(?:ku)?|cashflow|arus kas|aman (?:(?:ga|gak|nggak|enggak|tidak) )?(?:sampai|sampe) gajian|cukup (?:(?:ga|gak|nggak|enggak|tidak) )?(?:uang|duit)(?:ku)? (?:sampai|sampe) gajian)\b/;
/** Every budget at once ("anggaranku gimana", "budget mana yang mau habis"); one budget by name is a Tanya question. */
const BUDGET = /\b(?:anggaran|budget)(?:ku|nya|mu)?\b/;
const BUDGET_ASK = /\b(?:gimana|bagaimana|gmn|aman|cek|sisa|status|rekap|progress|progres|lihat|liat|semua|mana|jebol|habis|abis|over|kelewatan|lewat|tinggal|overview|pemakaian|masih|kondisi)\b/;
const PAYDAY = /\b(?:gajian|gaji(?:nya)? (?:turun|masuk|cair)|tanggal muda|payday)\b/;
const PAYDAY_ASK = /\b(?:kapan|berapa|brp|brapa|lama|dekat|deket|kurang|mundur|sisa|tanggal|tgl)\b/;
const ALLOWANCE = /\bjatah (?:harian|per ?hari|sehari)\b|\b(?:sehari|per ?hari) (?:boleh|bisa|aman)\b/;
/** Money worries: strong words alone, softer ones only next to money. */
const MOOD_STRONG = /\b(?:bokek|boke|kere|bangkrut|tanggal tua|kanker|seret|kalap|dompet tipis|dompet kering|krisis|tinggal debu|saldo (?:tipis|sekarat|kritis|kering))\b|\b(?:uang|duit)(?:ku|\s+(?:gue|aku|saya|ku))?\s+(?:abis|habis|tinggal\s+(?:dikit|sedikit)|menipis)\b|\b(?:abis|habis) terus\b|\bcepet (?:abis|habis)\b|\b(?:ga|gak|nggak|tidak) punya (?:uang|duit|tabungan)\b/;
const MOOD_SOFT = /\b(?:pusing|puyeng|stres|stress|sedih|galau|panik|khawatir|cemas|takut|nyesel|menyesal|capek|cape|lelah|frustasi|kesel|sebel|bad mood)\b/;
const MONEY_WORD = /\b(?:uang(?:ku)?|duit(?:ku)?|keuangan(?:ku)?|finansial|tagihan|cicilan|utang|hutang|gaji(?:ku)?|belanja|tabungan|dompet|bayar|checkout|boros|kantong)\b/;
const SMALL: [RegExp, 'kabar' | 'bosan' | 'tidur' | 'puji' | 'kamu' | 'galau'][] = [
  [/\b(?:apa kabar|kabar(?:mu|nya)? (?:gimana|bagaimana|baik)|gimana kabar(?:mu|nya)?|how are you)\b/, 'kabar'],
  [/\b(?:bosen|bosan|gabut|bete|boring|kesepian|temenin|temani|ceritain)\b/, 'bosan'],
  [/\b(?:ngantuk|selamat tidur|good night|met bobo|mau tidur|bobo dulu)\b/, 'tidur'],
  [/\b(?:kamu|lo|lu|anda) (?:keren|hebat|pintar|pinter|baik|mantap|asik|asyik)\b|\b(?:pinter|hebat) (?:banget|juga)\b|\bgood job\b/, 'puji'],
  [/\b(?:lagi (?:apa|ngapain|sibuk)|ngapain|udah makan|sudah makan|kamu (?:tidur|suka|sayang|cewek|cowok|laki|perempuan|punya nama|capek)|nama (?:kamu|mu)|namamu)\b/, 'kamu'],
];
/** A saving goal: "pengen nabung buat nikah", "mau siapin dana darurat", "target beli motor tahun depan". */
const DESIRE = /\b(?:pengen|pengin|pingin|ingin|mau|target|rencana|berencana|niat|cita.?cita|impian)\b/;
const SAVE_WORD = /\b(?:nabung|menabung|ngumpulin|ngumpulkan|kumpulin|nyisihin|sisihin|menyisihkan|nyiapin|siapin|menyiapkan)\b|\bdana (?:darurat|pendidikan|pensiun|nikah|menikah|haji|umroh|kuliah)\b|\bpunya (?:rumah|mobil|motor|tabungan)\b|\b(?:target|tujuan) (?:nabung|tabungan)\b/;
const LATER = /\b(?:tahun depan|bulan depan|tahun ini|akhir tahun|nanti|suatu hari)\b/;
const LEARNABLE = new Set<ChatIntent>(['summary', 'tips', 'help', 'examples', 'about', 'greet', 'thanks', 'budget', 'payday', 'mood', 'smalltalk', 'joke', 'banter', 'serious']);

/* ------------------------------------------------------------------ 7.8 conversation */

const LAUGH = String.raw`wk(?:wk)+k*|w+k+w+k*|ha(?:ha)+h*|he(?:he)+h*|hi(?:hi)+|xixi+|ngakak|lol|lmao|anjay|anjir|anjrit`;
const JOKE_NOUN = String.raw`jokes?|lelucon|lawak(?:an)?|candaan|bercandaan|humor|pantun|tebak[\s-]?tebakan|tebakan|teka[\s-]?teki|gombal(?:an|in)?|cerita\s+lucu|cerita\s+kocak|plesetan|dad\s+jokes?`;
/** Asking for a joke: "kasih jokes dong", "pantun dong", "tebak-tebakan yuk", "bikin aku ketawa", "gombalin aku". */
const JOKE = new RegExp(String.raw`\b(?:kasih|ceritain|cerita|ceritakan|bikin|bikinin|buatin|minta|mau|pengen|pengin|ada|punya|bagi|share|sebutin|coba|tolong|yuk|ayo|lagi|satu)\b.*\b(?:${JOKE_NOUN})\b|^(?:${JOKE_NOUN})\b|\b(?:${JOKE_NOUN})\s+(?:dong|donk|yuk|yg|yang|receh|lucu|lagi|please|plis|pls|soal|tentang|biar)\b|\bgombalin\b|\b(?:bikin|buat)\s+(?:aku|gue|gw|saya|ku)\s+(?:ketawa|ngakak|senyum|tertawa)\b|\bhibur\s+(?:aku|gue|gw|saya)\b`, 'u');
/** Laughing, teasing, playing along: "wkwk receh", "garing ah", "bisa aja kamu", "kamu ngelawak ya". */
const BANTER = new RegExp(String.raw`\b(?:${LAUGH})\b|\b(?:garing|jayus|krik(?:\s*krik)?|receh|kocak|ngelawak|melawak|lawak)\b|\bbisa\s+aja\b|\blucu\s+(?:juga|jg|banget|bgt|amat|sih)\b|^lucu\b`, 'u');
const FLAT = /\b(?:garing|jayus|krik|ga lucu|gak lucu|nggak lucu|kurang lucu|ga ada lucunya)\b/;
/** Anger at the assistant (not at oneself): insults, "salah mulu", "ga guna", "nyebelin". */
const INSULT = /\b(?:bego|bodoh|bodo|goblok|goblog|tolol|idiot|dongo|bloon|oon|bebal|lemot|lelet|payah|jelek|sampah|bacot|berisik|ngaco|ngawur|nyebelin|ngeselin|menyebalkan|menjengkelkan)\b/;
const AT_BOT = /\b(?:kamu|km|kau|lu|lo|loe|elu|elo|bot|botnya|asisten|asistennya|aplikasi|aplikasinya|app|dasar|ini)\b/;
const ANGRY = /\b(?:salah\s+(?:mulu|terus|melulu|lagi|lg|trs)|(?:ga|gak|nggak|ngga|tidak|kagak)\s+(?:guna|berguna|becus|bisa\s+apa\s+apa|ngerti\s+apa\s+apa)|useless|(?:kesel|kesal|sebel|sebal|benci|muak|bete)\s+(?:sama|ama|dengan|ma)\s+(?:kamu|lu|lo|kau|bot|asisten|aplikasi\w*)|nyebelin|ngeselin|menyebalkan|jawabannya\s+(?:ngaco|salah|ngawur)|asal\s+(?:jawab|aja))\b/;
const SELF_BLAME = /^(?:aku|gue|gw|saya|ku)\b|\b(?:aku|gue|gw|saya)\s+(?:emang\s+|memang\s+)?(?:bego|bodoh|tolol|payah)\b/;
/** Sorry: "maaf ya tadi aku kasar", "iya maaf aku emosi", "sori td kelepasan". */
const APOLOGY = /^(?:(?:iya|ya|oke|ok|eh|duh)\s+)?(?:maaf|maap|mf|maafin|maafkan|sori|sorry|sory|sorri|punten|ampun)\b/;
/** Venting about life (money worries are "mood"). */
const CURHAT = /\b(?:curhat|patah hati|diputusin|ditinggal(?:in)?|ninggalin|selingkuh|berantem|bertengkar|ribut|marahan|marahin|dimarahin|kesepian|sendirian|nangis|galau|kecewa|stres|stress|depresi|cemas|overthinking|capek|cape|capai|lelah|burnout|tertekan|hancur|down|bad mood|sedih|sakit hati|insecure|minder|putus asa|frustasi|kangen|rindu)\b|\b(?:hari ini|minggu ini|hidup|hidupku)\s+(?:berat|kacau|hancur|ancur|capek|nyebelin|buruk)\b|\b(?:berat|kacau)\s+banget\b|\b(?:skripsi\w*|kerjaan\w*|tugas\w*)\s+(?:gak|ga|nggak|tidak|ngga)\s+(?:kelar|selesai|beres)/;
/** Be serious: "serius dong", "jangan bercanda", "udah becandanya, fokus", "mode serius". */
const SERIOUS = /\b(?:serius(?:in)?|jangan\s+(?:ber)?canda|jgn\s+(?:ber)?canda|ga\s+usah\s+(?:ber)?canda|udah(?:an)?\s+(?:ber)?canda(?:nya)?|stop\s+(?:ber)?canda|fokus|mode\s+serius|yang\s+bener|yg\s+bener)\b/;
const SERIOUS_WORDS = /\b(?:udah(?:an)?|ah|dong|deh|sekarang|oke|ok|ya|nih|mode|serius(?:in)?|jangan|jgn|ga\s+usah|stop|(?:ber)?canda(?:nya)?|fokus|yang\s+bener|yg\s+bener|aja|kita|lah|sih)\b/g;
/** Teaching: "ajari aku", "aku mau ngajarin kamu", "aku ajarin ya", "boleh aku ajarin?". */
const TEACH_START = /^(?:(?:aku|gue|gw|saya)\s+(?:mau\s+|pengen\s+|pengin\s+)?)?(?:ajari|ajarin|ngajarin|mengajari|ngajari)(?:\s+(?:aku|kamu|km|lu|lo|gue|dong|ya|deh|boleh|bisa|sini|mau))*(?:\s+boleh)?$|^(?:boleh|bisa)\s+(?:aku\s+|gue\s+|saya\s+)?(?:ajari|ajarin|ngajarin)(?:\s+(?:kamu|km|lu|lo|ga|gak|nggak|ya))*$|^(?:aku|gue|saya)\s+(?:mau|pengen)\s+(?:ngajarin|ngajari|mengajari|ajarin)\s+(?:kamu|km|lu|lo)(?:\s+\p{L}+)?$/u;
/** "kalau aku bilang boncos artinya boros", "inget ya, cekidot itu artinya ringkasan", "boncos itu artinya boros". */
const TEACH_SAID = /^(?:(?:kalau|kalo|klo|kl|jika|misal|misalnya)\s+(?:aku|gue|gw|saya)\s+(?:bilang|nulis|ngetik|ketik|tulis|ngomong)|(?:inget|ingat|catet|catat|tolong\s+inget)(?:\s+(?:ya|yah|dong|baik\s+baik))?)\s*,?\s*["“']?(.+?)["”']?\s*,?\s+(?:itu\s+)?(?:artinya|maksudnya|berarti|sama\s+dengan|sama\s+aja\s+(?:dengan|kayak|kaya)|=)\s+["“']?(.+?)["”']?$|^["“']?([\p{L}\d\s]{2,30}?)["”']?\s+(?:itu\s+)?(?:artinya|=)\s+["“']?(.+?)["”']?$/u;
const TEACH_CHIPS = ['ringkasan bulan ini', 'kasih tips hemat', 'pengeluaran bulan ini berapa', 'cek semua anggaran', 'kapan gajian?', 'kasih jokes dong'];
/** Yes / no to the assistant's offer. */
const YES = /^(?:iya+|ya+|yap|yup|yoi|boleh|bole|oke+|ok+|okay|sip+|gas+|ayo+|yuk+|mau|lanjut|cus|hayuk|siap|bener|betul|setuju|bisa|silakan|monggo|tentu|pastinya|pasti)(?:\s+(?:dong|deh|aja|ya|lah|banget|bgt|kak|min|bot|boleh|mau|yuk|gas|kok|sih))*$/;
const NO = /^(?:ng?ga+k?|ngga+|enggak|gak|ga|tidak|no|nope|engga|gausah|gausa|ntar|nanti|lain\s+kali|skip|jangan)(?:\s+(?:usah|dulu|deh|aja|ya|makasih|mksh|thanks|perlu|mau|kok|sih|lah|kali|nanti))*$/;
/** "kenapa?", "kok bisa?", "kok gitu?", "maksudnya apa?", "jelasin dong", "dari mana angkanya?". */
const EXPLAIN = /^(?:kenapa|knp|napa|ngapa|kok|lho|loh|lah|terus)?\s*(?:kenapa|knp|napa|kok\s+(?:bisa|gitu|gt|begitu|segitu|gtu)|kok|maksud(?:nya|mu)?(?:\s+(?:apa|apaan|gimana|gmn|gmana))?|jelasin|jelaskan|terangin|gimana\s+(?:bisa|itungannya|hitungannya|ngitungnya|caranya)|dari\s+mana\s+(?:itu|angkanya|hitungannya|tuh)|alasannya(?:\s+apa)?|kok\s+gitu\s+sih|lucunya\s+(?:dimana|di\s+mana|apa))(?:\s+(?:tuh|itu|dong|sih|ya|kak|nya|deh|lagi))*$/;
/** "lagi", "satu lagi", "lagi dong", "yang lain?", "lanjut", "terus?", "ada lagi?". */
const MORE = /^(?:(?:satu|1|sekali)\s+)?(?:lagi|lg|lagii+|lanjut|lanjutin|terus|trus|next|another|ada\s+lagi|yang\s+lain|yg\s+lain|lainnya|yang\s+lainnya|tambah|tambahin)(?:\s+(?:dong|donk|deh|ya|nya|lagi|kak|bot|sih|gak|ga|nggak|ngga|yang\s+lain|lah))*$/;
/** General tips, a page at a time after the ones from the person's records ("yang lain?"). */
const MORE_TIPS = [
  'Pakai aturan 50/30/20: separuh untuk kebutuhan, 30% keinginan, 20% tabungan. Sesuaikan angkanya dengan kondisimu.',
  'Tunggu 24 jam sebelum checkout barang yang bukan kebutuhan. Kalau besok masih pengen, baru pertimbangkan.',
  'Matikan notifikasi promo dari aplikasi belanja. Lebih sedikit godaan, lebih sedikit checkout.',
  'Bawa bekal atau masak sendiri dua kali seminggu. Hematnya terasa dalam sebulan.',
  'Langsung pindahkan tabungan di hari gajian, sebelum uangnya terpakai untuk yang lain.',
  'Cek langganan yang jarang dipakai (streaming, aplikasi, gym), lalu berhenti dari yang tidak perlu.',
  'Pasang anggaran untuk kategori yang paling sering bocor, misalnya jajan atau belanja online.',
  'Catat semua pengeluaran, sekecil apa pun. Yang tercatat lebih mudah dikendalikan.',
  'Siapkan dana darurat sedikit demi sedikit, targetkan 3 sampai 6 kali pengeluaran sebulan.',
];
/** Learned short words used inside longer messages ("aku boncos banget" → "aku boros banget"). */
function withAliases(t: string, learned: Record<string, string> | undefined) {
  let out = t;
  for (const [k, as] of Object.entries(learned || {})) {
    if (!k || k === t || k.split(' ').length > 3 || as.split(' ').length > 4) continue;
    const re = new RegExp(`(^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'g');
    out = out.replace(re, `$1${lower(as)}`);
  }
  return out;
}

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
/** The sentence names one budget or category ("sisa anggaran makan"): Catat otomatis answers that one. */
function namesBudget(t: string, ctx: ChatContext) {
  const words = new Set(t.split(/[^\p{L}]+/u));
  return ctx.data.budgets.some(b => b.active && lower(b.name).split(/[^\p{L}]+/u).some(w => w.length > 2 && words.has(w)))
    || ctx.data.categories.some(c => !c.parentId && lower(c.name).split(/[^\p{L}&]+/u).some(w => w.length > 2 && words.has(w)));
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
  const stats: SayLine[] = [
    { label: 'Pemasukan', value: rp(income), tone: 'up' }, { label: 'Pengeluaran', value: rp(spent), tone: 'down' },
    { label: 'Selisih', value: rp(income - spent), tone: income - spent >= 0 ? 'good' : 'warn' },
  ];
  const bars: SayBar[] = spent ? top.map(c => ({ label: c.name, value: rp(c.amount), ratio: c.amount / spent, note: pct(c.amount / spent) })) : [];
  const parts = [V.summaryLead(v, p.label, txs.length)];
  // The bars show the biggest categories; the sentence names them only when there are no bars to show.
  if (top.length && spent && v === 'singkat') parts.push(V.summaryTop(v, top.map(c => `${c.name} ${Math.round(c.amount / spent * 100)}%`).join(', ')));
  if (warn.length) parts.push(V.summaryWarn(v, warn.map(b => `${b.name} ${Math.round(b.used * 100)}%`).join(', ')));
  const why = `Pemasukan dan pengeluaran dihitung dari catatan ${p.label}. Uang bebas memakai hitungan yang sama dengan Beranda, dan jatah harian adalah uang bebas dibagi ${m.left} hari sampai gajian. Bar menunjukkan bagian tiap kategori dari total pengeluaran.`;
  return { kind: 'say', card: 'summary', title: 'Ringkasan', text: parts.join(' '), why, hero: { label: 'Uang bebas sekarang', value: rp(m.free), note: `≈ ${rp(m.daily)}/hari · ${m.left} hari ke gajian`, tone: m.free > 0 ? 'good' : 'warn' }, stats, bars, tone: warn.some(b => b.used >= 1) || m.free <= 0 ? 'warn' : 'info', chips: ['cek semua anggaran', 'kasih tips hemat', 'pengeluaran terbesar bulan ini'] };
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
  const stats: SayLine[] = [
    { label: 'Harga', value: rp(a.value) }, { label: 'Uang bebas', value: rp(m.free) },
    { label: 'Jatah harian', value: `${rp(m.daily)} → ${rp(Math.max(0, dailyAfter))}`, tone: dailyAfter < m.pace ? 'warn' : 'good' },
  ];
  const bars: SayBar[] = budget ? [{ label: `Anggaran ${budget.name} setelah beli`, value: `${rp(budget.spent + a.value)} / ${rp(budget.available)}`, ratio: budget.available > 0 ? (budget.spent + a.value) / budget.available : 1, tone: a.value > budget.remaining ? 'bad' : (budget.spent + a.value) / Math.max(1, budget.available) >= 0.8 ? 'warn' : 'good', note: a.value > budget.remaining ? `lewat ${rp(a.value - budget.remaining)}` : `sisa ${rp(budget.remaining - a.value)}` }] : [];
  let verdict: string, tone: 'good' | 'warn';
  if (after < 0) { verdict = V.affordNo(v, rp(m.free), rp(-after), thing || 'ini'); tone = 'warn'; }
  else if (dailyAfter < m.pace) { verdict = V.affordTight(v, rp(dailyAfter), m.left, rp(m.pace)); tone = 'warn'; }
  else { verdict = V.affordOk(v, rp(after), rp(dailyAfter)); tone = 'good'; }
  if (budget && a.value > budget.remaining) verdict += V.affordBudget(v, budget.name, rp(budget.remaining));
  const why = `Uang bebasmu sekarang ${rp(m.free)}, dikurangi harga ${rp(a.value)} jadi ${rp(after)}. Dibagi ${m.left} hari sampai gajian, jadi ${rp(Math.max(0, dailyAfter))} per hari. Rata-rata belanjamu periode ini ${rp(m.pace)} per hari, jadi ${after < 0 ? 'uangnya belum cukup' : dailyAfter < m.pace ? 'jatahnya lebih kecil dari kebiasaan belanjamu. Itu sebabnya mepet' : 'masih di atas kebiasaan belanjamu. Itu sebabnya aman'}.${budget ? ` Anggaran ${budget.name} tinggal ${rp(budget.remaining)}.` : ''}`;
  return { kind: 'say', card: 'afford', title: thing ? `Beli ${thing}?` : 'Boleh beli?', text: verdict, why, hero: { label: 'Sisa uang bebas setelah beli', value: rp(after), note: `${m.left} hari ke gajian`, tone: after < 0 ? 'warn' : tone === 'warn' ? 'warn' : 'good' }, stats, bars, tone, chips: ['ringkasan bulan ini', 'kasih tips hemat'], note: V.affordNote(v) || undefined };
}

function tips(ctx: ChatContext, v: Voice, page = 0): ChatReply {
  // "yang lain?": general tips, three at a time, after the ones from the person's own records.
  if (page > 0) {
    const from = ((page - 1) * 3) % MORE_TIPS.length, steps = [0, 1, 2].map(i => MORE_TIPS[(from + i) % MORE_TIPS.length]);
    return { kind: 'say', card: 'tips', title: 'Tips lain', text: v === 'sopan' ? 'Berikut beberapa tips lain:' : v === 'gaul' ? 'Nih tips lainnya:' : 'Ini beberapa tips lain:', steps, tone: 'info', chips: ['lagi dong', 'ringkasan bulan ini'] };
  }
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
  return { kind: 'say', card: 'tips', title: 'Tips', text: V.tipsLead(v), steps: out.slice(0, 4), tone: 'info', why: tipsWhy(v, 0), chips: ['yang lain?', 'cek semua anggaran', 'aman nggak beli sepatu 500rb?'] };
}
const tipsWhy = (_v: Voice, page: number) => page ? 'Ini tips umum yang sering membantu banyak orang. Tips dari catatanmu sendiri ada di daftar pertama.' : 'Tips ini diambil dari catatanmu sendiri: kategori terbesar periode ini, anggaran yang hampir habis, jajan kecil di bawah Rp30.000, dan jatah harian sampai gajian.';
const moodWhy = (_v: Voice) => 'Angkanya dari uang bebas dan jatah harian sampai gajian, dihitung sama seperti di Beranda. Langkah ketiga diambil dari kategori pengeluaran terbesarmu periode ini.';
const QUESTION_WHY = 'Jawaban ini dihitung dari catatanmu sendiri. Ketuk tombol di kartunya untuk melihat transaksi yang ikut dihitung.';

/** Every budget of this period, fullest first. */
function budgetOverview(ctx: ChatContext, v: Voice): ChatReply {
  const list = budgetsNow(ctx);
  if (!list.length) return { kind: 'say', card: 'budget', title: 'Anggaran', text: V.budgetNone(v), chips: ['anggaran makan 2jt', 'anggaran transport 500rb', 'ringkasan bulan ini'] };
  const total = list.reduce((n, b) => n + b.available, 0), spent = list.reduce((n, b) => n + b.spent, 0);
  const over = list.filter(b => b.used >= 1), close = list.filter(b => b.used >= 0.8 && b.used < 1);
  const bars: SayBar[] = list.slice(0, 6).map(b => ({ label: b.name, value: `${rp(b.spent)} / ${rp(b.available)}`, ratio: b.used, tone: b.used >= 1 ? 'bad' : b.used >= 0.8 ? 'warn' : 'good', note: b.remaining >= 0 ? `sisa ${rp(b.remaining)}` : `lewat ${rp(-b.remaining)}` }));
  const first = over[0] || close[0];
  return {
    kind: 'say', card: 'budget', title: 'Anggaran', text: V.budgetLead(v, list.length, over.map(b => b.name), close.map(b => b.name)),
    hero: { label: 'Sisa semua anggaran', value: rp(total - spent), note: `terpakai ${pct(total > 0 ? spent / total : 0)} dari ${rp(total)}`, tone: total - spent < 0 ? 'warn' : 'good' },
    bars, tone: over.length ? 'warn' : 'info', note: list.length > 6 ? `+${list.length - 6} anggaran lain ada di menu Anggaran.` : undefined,
    why: 'Tiap bar membandingkan yang sudah terpakai dengan batas anggarannya di periode ini. Hijau di bawah 80%, kuning 80–99%, merah sudah lewat batas.',
    chips: [...(first ? [`pengeluaran ${lower(first.name)} bulan ini berapa`] : []), 'kasih tips hemat', 'ringkasan bulan ini'],
  };
}

/** Days to the next payday, and how much a day keeps the money going. */
function payday(ctx: ChatContext, v: Voice): ChatReply {
  const m = money(ctx), total = m.passed + m.left - 1, day = D(ctx.cycle.end).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return {
    kind: 'say', card: 'payday', title: 'Gajian', text: V.payday(v, m.left, rp(m.daily), m.free > 0, m.daily < m.pace),
    hero: { label: 'Gajian berikutnya', value: `${m.left} hari lagi`, note: day },
    stats: [{ label: 'Uang bebas', value: rp(m.free), tone: m.free > 0 ? 'good' : 'warn' }, { label: 'Jatah per hari', value: rp(Math.max(0, m.daily)) }, { label: 'Rata-rata belanja', value: `${rp(m.pace)}/hari`, tone: m.pace > m.daily ? 'warn' : undefined }],
    bars: [{ label: 'Periode gaji ini', value: `hari ke-${m.passed} dari ${total}`, ratio: total > 0 ? m.passed / total : 0 }],
    tone: m.free > 0 && m.daily >= m.pace ? 'good' : 'warn', chips: ['ringkasan bulan ini', 'cek semua anggaran', 'kasih tips hemat'],
    why: `Gajian dihitung dari tanggal gajianmu (tanggal ${ctx.salaryDay}). Jatah per hari adalah uang bebas ${rp(m.free)} dibagi ${m.left} hari. Rata-rata belanja adalah pengeluaran periode ini ${rp(m.expenses)} dibagi ${m.passed} hari yang sudah lewat.`,
  };
}

/** A kind word when money worries, then the facts and three small steps. */
function mood(ctx: ChatContext, v: Voice): ChatReply {
  const m = money(ctx), top = categoryTotals(ctx, ctx.cycle.start, ctx.cycle.end)[0], steps = V.moodSteps(v);
  if (top && m.expenses) steps[2] = v === 'sopan' ? `Pengeluaran terbesar Anda di ${top.name} (${rp(top.amount)}). Coba mulai menghemat dari sana.` : v === 'gaul' ? `Paling gede di ${top.name} (${rp(top.amount)}). Coba mulai hemat dari situ.` : `Paling besar di ${top.name} (${rp(top.amount)}). Coba mulai hemat dari sana.`;
  return {
    kind: 'say', card: 'mood', title: v === 'sopan' ? 'Mari atur bersama' : 'Pelan-pelan, ya', text: V.mood(v, m.free > 0 ? rp(m.free) : null, rp(m.daily), m.left),
    stats: [{ label: 'Uang bebas', value: rp(m.free), tone: m.free > 0 ? 'good' : 'warn' }, { label: 'Jatah per hari', value: rp(Math.max(0, m.daily)) }, { label: 'Ke gajian', value: `${m.left} hari` }],
    steps: v === 'singkat' ? undefined : steps, tone: m.free > 0 ? 'info' : 'warn', chips: ['kasih tips hemat', 'cek semua anggaran', 'ringkasan bulan ini'], note: P.offerTips(v).trim() || undefined,
  };
}

/** A saving goal: what for, how much a month, and a tap to create the fund (Catat otomatis "target … 10jt"). */
function goal(text: string, ctx: ChatContext, v: Voice): ChatReply {
  const t = lower(text), a = findAmounts(t).find(x => x.value > 0), m = money(ctx);
  const emergency = /\bdana darurat\b/.test(t);
  let thing = emergency ? 'dana darurat' : (t.replace(a?.text || '\u0000', ' ').match(/\b(?:buat|untuk|utk|punya|ganti|beli|siapin|nyiapin)\s+(.+)$/)?.[1] || t.match(/\bdana \p{L}+/u)?.[0] || '');
  thing = unfill(thing.replace(/\b(?:beli|membeli|buat|untuk|utk|tahun depan|bulan depan|tahun ini|akhir tahun|nanti|tiap bulan|setiap bulan|sendiri|gimana|caranya|dong|nih|sih|ya)\b/g, ' ').replace(/[?!.,]/g, ' ').replace(/\s{2,}/g, ' ').trim()) || 'tabungan';
  const monthlyCost = m.pace * 30, income = m.income;
  const stats: SayLine[] = [], chips: string[] = [];
  let planText: string | null = null, hero: { label: string; value: string; note?: string } | undefined;
  if (a) {
    hero = { label: 'Yang mau dikumpulkan', value: rp(a.value) };
    stats.push({ label: '12 bulan', value: `${rp(Math.ceil(a.value / 12 / 1000) * 1000)}/bln` }, { label: '6 bulan', value: `${rp(Math.ceil(a.value / 6 / 1000) * 1000)}/bln` });
    if (income > 0) stats.push({ label: 'Dari pemasukan', value: pct(a.value / 12 / income), tone: a.value / 12 / income > 0.3 ? 'warn' : 'good' });
    planText = V.goalPlan(v, rp(Math.ceil(a.value / 12 / 1000) * 1000));
    chips.push(`target ${thing} ${a.text}`);
  } else if (emergency && monthlyCost > 0) {
    hero = { label: 'Dana darurat ideal', value: `${rp(nice(monthlyCost * 3))}–${rp(nice(monthlyCost * 6))}`, note: '3–6 kali pengeluaran sebulan' };
    chips.push(`target dana darurat ${short(monthlyCost * 3)}`, `target dana darurat ${short(monthlyCost * 6)}`);
  } else if (income > 0) {
    stats.push({ label: 'Sisihkan 10%', value: `${rp(income * 0.1)}/bln` }, { label: 'Sisihkan 20%', value: `${rp(income * 0.2)}/bln` });
    chips.push(`target ${thing} ${short(income * 0.1 * 12)}`, `target ${thing} ${short(income * 0.2 * 12)}`);
  }
  chips.push('kasih tips hemat');
  const save = chips.length > 1 ? V.goalSave(v) : '';
  const why = a ? 'Per bulan adalah target dibagi jumlah bulan, dibulatkan ke atas ke ribuan. “Dari pemasukan” membandingkan sisihan per bulan dengan pemasukanmu periode ini.' : emergency ? 'Dana darurat yang umum disarankan 3 sampai 6 kali pengeluaran sebulan. Pengeluaran sebulanmu diperkirakan dari rata-rata harian dikali 30.' : 'Saran targetnya dari 10% dan 20% pemasukanmu periode ini, disisihkan selama 12 bulan.';
  return { kind: 'say', card: 'goal', title: `Target ${thing}`, text: [V.goal(v, thing, planText), a ? save : ''].filter(Boolean).join(' '), hero, stats: stats.length ? stats : undefined, tone: 'info', chips, why };
}

function smallTalk(kind: (typeof SMALL)[number][1], v: Voice): ChatReply {
  const chips = { kabar: ['ringkasan bulan ini', 'kapan gajian?'], bosan: ['pengeluaran terbesar bulan ini', 'kasih tips hemat'], tidur: ['pengeluaran hari ini berapa', 'ringkasan bulan ini'], puji: ['ringkasan bulan ini'], kamu: ['bisa apa aja?', 'contoh'], galau: ['ringkasan bulan ini', 'kasih tips hemat'] }[kind];
  return { kind: 'say', card: 'talk', text: V.small(v, kind), chips };
}

function calcReply(c: NonNullable<ReturnType<typeof calculate>>, again: boolean, v: Voice): ChatReply {
  return { kind: 'say', card: 'calc', title: 'Hitungan', text: `${c.expression} = ${calcText(c)}`, hero: { label: c.expression, value: calcText(c) }, tone: 'info', why: 'Kata seperti “dibagi” dan “dikali” dihitung urut dari kiri. Kalau pakai simbol, × dan ÷ dikerjakan dulu sebelum + dan −. Hasil uang dibulatkan ke rupiah terdekat.', chips: [again ? 'kalau dibagi 2?' : 'kalau dibagi 3?', ...(c.money && c.value > 0 ? [`keluar ${calcText(c)}`] : [])], note: c.money && Math.abs(c.value - Math.round(c.value)) > 1e-6 ? V.calcNote(v) : undefined };
}
const helpReply = (v: Voice, t: TemplateGroup[]): ChatReply => ({ kind: 'say', card: 'help', title: 'Yang bisa kubantu', text: V.helpLead(v), lines: t.slice(0, 7).map(g => ({ label: g.title, value: `“${g.items[0]}”` })), chips: ['contoh', 'ringkasan bulan ini', 'ganti gaya bahasa'] });
const examplesReply = (v: Voice, t: TemplateGroup[]): ChatReply => ({ kind: 'say', title: 'Coba salah satu', text: V.examplesLead(v), chips: t.filter(g => g.key !== 'ubah').flatMap(g => g.items.slice(0, 1)).concat(t[1].items[1], t[3].items[1]) });
const unknownReply = (v: Voice, t: TemplateGroup[], unanswered = false): ChatReply => ({ kind: 'say', text: unanswered ? V.unanswered(v) : V.unknown(v), chips: unanswered ? ['pengeluaran bulan ini berapa', 'kapan terakhir isi bensin', 'saldo semua dompet berapa', 'ringkasan bulan ini'] : [t[0].items[0], 'pengeluaran bulan ini berapa', 'hitung 15% dari 2,5jt', 'bisa apa aja?'] });
const VOICE_CHIPS = ['gaya santai', 'gaya sopan', 'gaya singkat', 'gaya gaul', 'gaya bar-bar'];

/** `money` under another name, for where a message's own `money` (an amount in it) hides it. */
const cycleMoney = (ctx: ChatContext) => money(ctx);
/** 8.0 "Kopi lagi? Ini yang ke-8 siklus ini": the same treat recorded again and again this cycle. */
function teaseFor(ins: Inspection, ctx: ChatContext, v: Voice, turn: number) {
  const id = ins.subcategoryId || ins.categoryId, name = id ? ctx.data.categories.find(c => c.id === id)?.name : undefined;
  if (!id || !name || !TREAT.test(name) || v === 'singkat') return '';
  let count = 0, total = 0;
  for (const x of ctx.data.transactions) if (x.type === 'expense' && x.date >= ctx.cycle.start && x.date < ctx.cycle.end && (x.subcategoryId === id || !ins.subcategoryId && x.categoryId === id)) { count++; total += x.amount; }
  return count >= 4 ? teaseLead(v, name, count + 1, rp(total + (ins.total || 0)), turn) : '';
}

/* ------------------------------------------------------------------ The reply */

export async function chatReply(input: string, memory: ChatMemory, ctx: ChatContext, depth = 0): Promise<ChatResult> {
  // Learned phrases are kept as typed (`typed`); the rules read the shorthand written out (`t`: "km bs" → "kamu bisa").
  const raw = input.trim(), typed = clean(raw), t = normalizeWords(typed), v: Voice = ctx.voice || 'santai', tpl = templatesFor(ctx.quick.wallets);
  // What lasts one reply only: the field asked, the offer made, the explanation, the phrase being taught.
  const mem: ChatMemory = { ...memory, asking: undefined, offer: undefined, explain: undefined, teaching: undefined, pendingQ: undefined, people: undefined, unitAsk: undefined, riddle: undefined, userRiddle: undefined, game: undefined };
  const turn = (memory.turn || 0) + 1;
  const finish = (r: ChatResult): ChatResult => {
    const next: ChatMemory = { ...r.memory, turn, misses: r.intent === 'unknown' ? (memory.misses || 0) + 1 : 0 };
    if (r.intent !== 'unknown' && r.intent !== 'teach') next.unknown = undefined;
    return { ...r, memory: next };
  };
  const learnedAs = depth === 0 && !memory.teaching ? ctx.learned?.[typed] ?? ctx.learned?.[t] : undefined;
  if (learnedAs) {
    const r = await chatReply(learnedAs, memory, ctx, 1);
    const note = V.learned(v, raw);
    if (r.reply.kind === 'say' && note) r.reply = { ...r.reply, note: [note, r.reply.note].filter(Boolean).join(' ') };
    return finish({ ...r, by: 'learned' });
  }
  // Learned short words inside a longer message: "aku boncos banget" with "boncos" taught as "boros".
  const aliased = depth === 0 && !memory.teaching ? withAliases(typed, ctx.learned) : typed;
  if (aliased !== typed) return finish({ ...(await chatReply(aliased, memory, ctx, 1)), by: 'learned' });
  const result = await decide();
  // A message not understood, then one that is: the first is remembered as the second (only for meanings without amounts).
  if (depth === 0 && memory.unknown && !result.learn && result.intent !== 'unknown' && result.intent !== 'teach' && LEARNABLE.has(result.intent) && clean(memory.unknown) !== typed && !memory.teaching) result.learn = { phrase: clean(memory.unknown), as: raw };
  return depth === 0 ? finish(result) : result;

  async function decide(): Promise<ChatResult> {
    // 8.2: without a memory of its own, the reply's topic is what it was about (not the topic before: a game, a joke).
    const sayR = (intent: ChatIntent, reply: ChatReply, next: ChatMemory = mem, by: ChatResult['by'] = 'rules'): ChatResult => ({ intent, reply, memory: { ...next, explain: next.explain ?? (reply.kind === 'say' ? reply.why : undefined), topic: next === mem ? intent : next.topic ?? intent, last: next.last === memory.last && intent !== 'calc' ? 'say' : next.last }, by });
    /** A sentence for Catat otomatis: a record (confirmed, or with one thing asked back) or a question. */
    const plan = (text: string, opts: { did?: string; intent?: ChatIntent; intro?: string } = {}): ChatResult => {
      const ins = ctx.inspect(text);
      if (ins.reading === 'question') return { intent: opts.intent && opts.intent !== 'plan' ? opts.intent : 'question', reply: { kind: 'plan', text }, memory: { ...mem, question: text, last: 'question', topic: 'question', explain: QUESTION_WHY }, by: 'rules' };
      // 7.9: what Catat otomatis knows besides the cards (the change given back, a cashback still to come…), and two ways
      // of paying that do not add up: asked first, recorded as written only on "boleh".
      const everyday = !opts.did ? readEveryday(text, ctx.quick) : null;
      if (everyday?.warn && !opts.intro) return { intent: 'clarify', reply: { kind: 'say', card: 'talk', text: `${everyday.warn} Kalau mau dicatat apa adanya, bilang “boleh”.`, chips: ['boleh', 'nggak dulu'] }, memory: { ...mem, offer: `catat apa adanya: ${text}` }, by: 'rules' };
      const next: ChatMemory = { ...mem, plan: { text, status: 'pending' }, last: 'record', topic: 'record', person: ins.person ? lower(ins.person) : mem.person };
      let intro = opts.intro ?? (opts.did ? V.edited(v, opts.did) : V.confirm(v, (ins.count || 1) > 1));
      const told = (everyday?.notes || []).filter(n => /kembalian|belum diterima|belum dibayar|belum dicatat|sisa/i.test(n));
      if (told.length && !opts.intro) intro = `${told.join('. ')}. ${intro}`;
      if (!opts.did && !opts.intro && ins.kind === 'expense' && (ins.count || 1) === 1) intro = `${teaseFor(ins, ctx, v, turn)}${intro}`;
      if (!opts.did && /\b(?:transfer(?:in|kan)|kirim(?:in|kan)|tf(?:in)?)\b/.test(lower(text)) && /\b(?:sekarang|tolong|langsung|dong)\b/.test(lower(text))) intro = `Aku siapkan catatannya. Transfer uangnya tetap lewat aplikasi bank atau e-wallet, ya. ${intro}`;
      let chips: string[] | undefined;
      if (ins.ask && !opts.intro) {
        const lead = opts.did ? `${cap(opts.did)}. ${V.askLead(v)}` : '';
        intro = `${lead}${V.ask(v, ins.ask.field)}`; chips = ins.ask.choices; next.asking = ins.ask;
      }
      return { intent: opts.intent || 'plan', reply: { kind: 'plan', text, intro: intro || undefined, ...(chips?.length ? { chips } : {}) }, memory: next, by: 'rules' };
    };
    const pending = mem.plan?.status === 'pending' ? mem.plan : undefined, saved = mem.plan?.status === 'saved' ? mem.plan : undefined;
    const name = ctx.name ? ` ${ctx.name}` : '';
    /** A joke not told lately; "maksudnya?" then explains it. */
    function tellJoke(): ChatResult {
      const told = memory.jokes || [], fresh = JOKES.map((_, i) => i).filter(i => !told.includes(i));
      const pool = fresh.length ? fresh : JOKES.map((_, i) => i), at = pool[(turn * 7) % pool.length], joke = JOKES[at];
      const lead = memory.serious ? P.seriousJoke(v) : P.jokeLead(v, turn, memory.topic === 'joke');
      return sayR('joke', { kind: 'say', card: 'talk', text: [lead, joke.text].filter(Boolean).join(' '), chips: ['lagi dong', 'maksudnya?', 'ringkasan bulan ini'] },
        { ...mem, topic: 'joke', jokes: [...told, at].slice(-Math.min(12, JOKES.length - 1)), explain: P.jokeWhy(v, joke.why), serious: false });
    }
    /** This cycle's spending for a roast: the biggest category (or subcategory) and how often. */
    function roastData() {
      const m = cycleMoney(ctx), by = new Map<string, { amount: number; count: number }>();
      for (const x of ctx.data.transactions) {
        if (x.date < ctx.cycle.start || x.date >= ctx.cycle.end) continue;
        const spent = transactionExpense(x); if (spent <= 0) continue;
        const key = x.subcategoryId || x.categoryId || ''; if (!key) continue;
        const b = by.get(key) || { amount: 0, count: 0 }; b.amount += spent; b.count++; by.set(key, b);
      }
      const named = ([id, b]: [string, { amount: number; count: number }] | [] = []) => { const name = id ? ctx.data.categories.find(c => c.id === id)?.name : undefined; return name && b ? { name, ...b } : undefined; };
      const list = [...by.entries()];
      return { top: named(list.sort((a, b) => b[1].amount - a[1].amount)[0]), often: named(list.sort((a, b) => b[1].count - a[1].count)[0]), pace: m.pace, daily: Math.max(0, m.daily), free: m.free, spent: m.expenses, days: m.passed };
    }
    /** Listening when the person vents: by topic; from the second turn on, also an offer to cheer them up. */
    function listen(): ChatResult {
      const count = (memory.topic === 'curhat' ? memory.curhat || 0 : 0) + 1, topic = curhatTopic(t);
      const text = curhatReply(v, topic, turn, count >= 2 && topic !== 'mulai') + (count === 2 ? P.offerJoke(v) : '');
      return talk('curhat', text, count === 2 ? { chips: ['boleh', 'nggak dulu'] } : {}, { curhat: count, ...(count === 2 ? { offer: 'kasih jokes dong' } : {}) });
    }
    /** After small talk: what the assistant offered or asked. */
    function smallMemory(kind: (typeof SMALL)[number][1]): ChatMemory {
      const offer = kind === 'tidur' ? 'pengeluaran hari ini berapa' : kind === 'bosan' ? 'pengeluaran terbesar bulan ini' : undefined;
      return { ...mem, topic: kind === 'kabar' ? 'kabar' : 'smalltalk', ...(offer ? { offer } : {}) };
    }

    if (!t) return sayR('unknown', unknownReply(v, tpl));
    const money = findAmounts(t).some(a => a.value > 0), words = t.split(' ').length;
    const talk = (intent: ChatIntent, text: string, extra: Partial<Extract<ChatReply, { kind: 'say' }>> = {}, next: Partial<ChatMemory> = {}): ChatResult =>
      sayR(intent, { kind: 'say', card: 'talk', text, ...extra }, { ...mem, topic: intent, ...next });
    const addNote = (r: ChatResult, note: string): ChatResult => ({ ...r, reply: r.reply.kind === 'say' ? { ...r.reply, note: [note, r.reply.note].filter(Boolean).join(' ') } : { ...r.reply, intro: [note, r.reply.intro].filter(Boolean).join(' ') } });

    // 7.8 Teaching: the message after "Maksud “X” itu apa?" is what X means.
    if (memory.teaching) {
      if (CANCEL.test(t) || NO.test(t)) return talk('decline', P.decline(v, turn));
      const r = await chatReply(raw, { ...mem }, { ...ctx, learned: {} }, 1);
      if (r.intent !== 'unknown' && r.intent !== 'teach') return { ...addNote(r, P.teachDone(v, memory.teaching)), learn: { phrase: memory.teaching, as: raw } };
      return talk('teach', P.teachFail(v, raw), { chips: TEACH_CHIPS }, { teaching: memory.teaching });
    }
    const said = t.match(TEACH_SAID);
    if (said) {
      const phrase = clean(said[1] || said[3] || ''), meaning = (said[2] || said[4] || '').trim();
      if (phrase && meaning && phrase !== clean(meaning)) {
        const r = await chatReply(meaning, mem, { ...ctx, learned: {} }, 1);
        if (r.intent === 'unknown' || r.intent === 'teach') return talk('teach', P.teachFail(v, meaning), { chips: TEACH_CHIPS }, { teaching: phrase });
        return { ...talk('teach', `${P.teachDone(v, phrase)} (“${phrase}” → “${meaning}”)`, { chips: [phrase] }), learn: { phrase, as: meaning } };
      }
    }
    if (TEACH_START.test(t)) {
      if (memory.unknown) return talk('teach', P.teachAsk(v, memory.unknown), { chips: TEACH_CHIPS }, { teaching: clean(memory.unknown) });
      return talk('teach', P.teachHow(v), { chips: ['kalau aku bilang boncos artinya boros'] });
    }
    // The assistant asked "mau …?": "boleh" sends what it offered, "nggak" declines.
    if (memory.offer && YES.test(t)) return chatReply(memory.offer, mem, ctx, 1);
    if (memory.offer && NO.test(t)) return talk('decline', P.decline(v, turn));
    const asIs = raw.match(/^catat apa adanya:\s*(.+)$/i);
    if (asIs) return plan(asIs[1], { intro: 'Oke, kucatat apa adanya. Cek lagi selisihnya sebelum disimpan, ya.' });
    // 7.9 What the assistant asked in words: the short answer belongs to it.
    if (memory.pendingQ === 'claim' && /^(?:belum|blm|belom)\b/.test(t)) return talk('clarify', 'Oke, belum menambah saldo dompet. Kalau sudah cair, bilang saja, misalnya “klaim cair 180rb ke jago”.', { chips: ['klaim cair 180rb ke jago'] });
    if (memory.pendingQ === 'claim' && /^(?:udah|sudah|dah)\b/.test(t)) return plan(`klaim cair ${t.replace(/^(?:udah|sudah|dah)\s*(?:masuk|cair|diterima|ditransfer)?\s*/, '')}`.trim());
    if (memory.pendingQ === 'field' && YES.test(t)) return talk('clarify', 'Yang mana: tanggal, dompet, atau keduanya? Bilang saja, misalnya “kemarin” atau “pakai jago”.', { chips: ['kemarin', 'pakai jago'] }, { pendingQ: 'field' });
    const he = t.match(/^(?:dia|doi|dianya)\b/);
    if (he && memory.pendingQ === 'who' && memory.people?.length === 2 && money) {
      const a = findAmounts(t).find(x => x.value > 0)!, [p1, p2] = memory.people;
      return talk('clarify', `Yang ${rp(a.value)} itu ${cap(p1)} atau ${cap(p2)}?`, { chips: [`${p1} bayar ${a.text.trim()}`, `${p2} bayar ${a.text.trim()}`] }, { pendingQ: 'who', people: memory.people });
    }
    // "dia baru balikin 40rb ke tunai": the person talked about just now.
    if (he && memory.person && depth === 0) return chatReply(raw.replace(/^\s*(?:dia|doi|dianya)\b/i, memory.person), mem, ctx, 1);
    if (SELF_HARM.test(t)) return talk('curhat', safety(v), { tone: 'warn' }, { curhat: (memory.curhat || 0) + 1, serious: true });
    // 8.0 Riddles: the guess at the assistant's riddle; the person's own riddle (its question, then its punchline).
    if (memory.riddle !== undefined && RIDDLES[memory.riddle] && !money && words <= 8 && !CANCEL.test(t)) return talk('riddle', riddleAnswer(v, RIDDLES[memory.riddle], t, turn), { chips: ['tebak-tebakan lagi', 'kasih jokes dong'] }, { topic: 'joke' });
    if (memory.userRiddle === 'question' && !money && words <= 20) return talk('riddle', guessUserRiddle(v, turn), {}, { userRiddle: 'answer', topic: 'joke' });
    if (memory.userRiddle === 'answer' && !money && words <= 20) return talk('banter', laughAtJoke(v, turn), { chips: ['gantian aku kasih tebakan', 'tebak-tebakan lagi'] }, { topic: 'joke' });
    // 8.1 Games: a move in the one going on, or a new one ("suit yuk", "lempar koin", "pilihin dong, A atau B?").
    // A number is a guess in tebak angka, and a range for "angka acak 1 sampai 100", not an amount.
    const gameNumbers = memory.game?.kind === 'angka' && /^(?:angka\s+)?\d{1,2}$/.test(t) || /\b(?:angka|nomor|number)\s+(?:acak|random)\b|\brandom\s+(?:angka|nomor|number)\b|\bacak\s+angka\b/.test(t);
    const game = (!money || gameNumbers) && words <= 14 ? readGame(t, raw, v, turn, memory.game) : null;
    if (game) return talk('game', game.text, { chips: game.chips || [] }, { game: game.game, topic: 'game', serious: false });
    // 8.0 Swearing: answered in the chosen style; with something else to do, that is done too.
    // 8.1 Laughing while recording ("wkwk iya beli kopi 20rb"): the laugh is not part of the record.
    const laughing = depth === 0 && money ? readLaugh(raw) : null;
    if (laughing && laughing.rest && /\d/.test(laughing.rest)) {
      // The laugh back is the same kind: "hehe" → "Hehe", "haha" → "Haha", "wkwk" → "Wkwk".
      const sound = /^he/i.test(laughing.text) ? 'Hehe' : /^h/i.test(laughing.text) ? 'Haha' : 'Wkwk';
      const r = await chatReply(laughing.rest, memory, ctx, 1), lead = vo(v, { santai: `${sound}, siap. `, sopan: '', gaul: `${sound.toUpperCase()} siap. `, singkat: '', barbar: `${sound.toUpperCase()} anjir, oke. ` });
      return lead && r.reply.kind === 'plan' ? { ...r, reply: { ...r.reply, intro: `${lead}${r.reply.intro || ''}`.trim() } } : r;
    }
    const sworn = depth === 0 ? readSwear(t, money) : null;
    if (sworn && !(mildOnly(sworn) && readLaugh(raw))) {
      if (!sworn.rest || sworn.atBot && !money && !ANGRY.test(sworn.rest)) return talk('swear', swearReply(v, sworn, turn), { chips: v === 'sopan' ? ['ringkasan bulan ini', 'kasih jokes dong'] : ['kasih jokes dong', 'roasting pengeluaranku', 'ringkasan bulan ini'] }, { serious: false });
      const r = await chatReply(sworn.rest, memory, ctx, 1), lead = swearLead(v, sworn, turn);
      // What is left means nothing on its own ("ngewe yuk", "nonton bokep"): the swearing is the message.
      if (r.intent === 'unknown') return talk('swear', swearReply(v, sworn, turn), { chips: v === 'sopan' ? ['ringkasan bulan ini', 'kasih jokes dong'] : ['kasih jokes dong', 'roasting pengeluaranku', 'ringkasan bulan ini'] }, { serious: false });
      if (!lead) return r;
      return { ...r, reply: r.reply.kind === 'say' ? { ...r.reply, text: `${lead}${r.reply.text}` } : { ...r.reply, intro: `${lead}${r.reply.intro || ''}`.trim() } };
    }
    if (APOLOGY.test(t) && words <= 8 && !money) return talk('apology', P.apology(v, turn), { chips: ['ringkasan bulan ini', 'bisa apa aja?'] });
    // "kenapa?" / "maksudnya?": how the last answer was worked out (a joke: what makes it funny).
    if (EXPLAIN.test(t) && !money) return talk('explain', memory.explain || P.explainNone(v), {}, { topic: memory.topic, jokes: memory.jokes });
    // "lagi" / "yang lain?": more of the same.
    if (MORE.test(t) && (memory.topic === 'joke' || memory.topic === 'banter')) return tellJoke();
    if (MORE.test(t) && memory.topic === 'tips') { const page = (memory.tipsPage || 0) + 1; return sayR('tips', tips(ctx, v, page), { ...mem, topic: 'tips', tipsPage: page, explain: tipsWhy(v, page) }); }
    if (MORE.test(t) && memory.topic === 'curhat') return talk('curhat', curhatReply(v, 'umum', turn, true), {}, { curhat: (memory.curhat || 0) + 1 });
    // "udah ah serius, ringkasan bulan ini": serious from now on, and the rest of the message is answered.
    if (SERIOUS.test(t) && !money) {
      const rest = t.replace(SERIOUS, ' ').replace(SERIOUS_WORDS, ' ').replace(/[,.!?]/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (rest.split(' ').filter(Boolean).length >= 2) { const r = await chatReply(rest, { ...mem, serious: true }, ctx, 1); return { ...r, memory: { ...r.memory, serious: true } }; }
      return talk('serious', P.serious(v), {}, { serious: true });
    }
    // Anger at the assistant: sorry, what to do, and an offer to be taught.
    if (!money && (ANGRY.test(t) || INSULT.test(t) && AT_BOT.test(t) && !SELF_BLAME.test(t) || INSULT.test(t) && words <= 3 && !SELF_BLAME.test(t))) {
      const hint = pending ? ` ${P.angryRecord(v)}` : '';
      // 8.1 Called names (not "salah mulu"): the style answers ("Astaghfirullah…", teasing back in Gaul and Bar-bar).
      if (!ANGRY.test(t)) return talk('angry', `${insulted(v, turn)}${hint}`, { chips: ['ajari aku', 'bisa apa aja?'] }, { offer: 'ajari aku' });
      return talk('angry', `${P.angry(v, turn)}${hint}${P.offerTeach(v)}`, { chips: ['ajari aku', 'bisa apa aja?'] }, { offer: 'ajari aku' });
    }
    // 8.0 The person's own riddle or joke; the assistant's riddles; roasting the spending.
    if (!money && USER_RIDDLE.test(t)) {
      const inline = t.replace(USER_RIDDLE, ' ').replace(/^[\s,:.-]+/, '').trim();
      if (/\?/.test(raw) && inline.split(' ').length >= 3) return talk('riddle', guessUserRiddle(v, turn), {}, { userRiddle: 'answer', topic: 'joke' });
      return talk('riddle', vo(v, { sopan: 'Silakan, apa pertanyaannya?', santai: 'Wah, ayo! Apa soalnya?', gaul: 'Gas! Apaan soalnya?', singkat: 'Apa soalnya?', barbar: 'Sini, apaan soalnya? Jangan yang gampang, anjir.' }), {}, { userRiddle: 'question', topic: 'joke' });
    }
    const userJoke = !money ? readUserJoke(t) : null;
    if (userJoke === 'told') return talk('banter', laughAtJoke(v, turn), { chips: ['gantian, kasih jokes dong', 'tebak-tebakan dong'] }, { topic: 'joke' });
    if (userJoke === 'riddle') return talk('riddle', guessUserRiddle(v, turn), {}, { userRiddle: 'answer', topic: 'joke' });
    if (!money && words >= 8 && USER_PANTUN.test(lower(raw)) && !/\b(?:berapa|rb|ribu)\b/.test(t)) return talk('banter', pantunBack(v, turn), { chips: ['pantun soal duit dong'] }, { topic: 'joke' });
    if (!money && /\b(?:tebak[\s-]?tebakan|tebakan|teka[\s-]?teki)\b/.test(t)) {
      const told = memory.jokes || [], at = (turn * 5 + told.length) % RIDDLES.length;
      return talk('joke', `${vo(v, { sopan: 'Baik, coba tebak:', santai: 'Oke, tebak ya:', gaul: 'Siap, tebak nih:', singkat: 'Tebak:', barbar: 'Tebak nih, kalau salah lo goblok WKWK:' })} ${RIDDLES[at].q}`, { chips: ['nyerah', 'kasih tau dong'] }, { riddle: at, topic: 'joke' });
    }
    // 8.1 A money quote, fact, saving challenge or fortune; "lagi" gives another.
    const funAsk = !money ? (MORE.test(t) && memory.topic === 'fun' && memory.funKind ? FUN_MORE[memory.funKind] : t) : '';
    const fun = funAsk ? readFunContent(funAsk, v, turn, (() => { const m = cycleMoney(ctx); return { pace: m.pace, daily: m.daily, free: m.free, left: m.left }; })(), rp) : null;
    if (fun) return talk('fun', fun.text, { chips: fun.chips }, { funKind: fun.kind, topic: 'fun', serious: false });
    // 8.2 "aku boros nggak sih?": the summary card, with the verdict said in the style (a roast in Gaul and Bar-bar).
    if (!money && /\b(?:aku|gue|gw|saya)\s+(?:boros|hemat)\s+(?:ga|gak|nggak|ngga|enggak|tidak|nggk)\b|\bboros\s+(?:ga|gak|nggak|ngga)\s+(?:sih\s+)?(?:aku|gue|gw|saya)\b/.test(t) && !/\b(?:roast|rosting|ejek|ledek|katain|hina|sindir)/.test(t)) {
      const r = summary(raw, ctx, v);
      if (r.kind === 'say') return sayR('summary', { ...r, title: 'Boros atau hemat?', text: roast(v, roastData(), rp, turn), chips: ['roasting pengeluaranku', 'kasih tips hemat'] }, { ...mem, topic: 'summary', offer: 'kasih tips hemat' });
    }
    if (!money && ROAST.test(t)) return sayR('roast', { kind: 'say', card: 'talk', text: roast(v, roastData(), rp, turn), chips: ['kasih tips hemat', 'pengeluaran terbesar bulan ini'] }, { ...mem, topic: 'roast', offer: 'kasih tips hemat', serious: false });
    if (JOKE.test(t) && !money) return tellJoke();
    // 8.0 Opening a menu ("buka wishlist", "tunjukin laporan") before anything reads it as a question.
    const opening = !money && opensMenu(t) ? readModule(t, ctx.data, ctx.today, v) : null;
    if (opening) return sayR('module', { kind: 'say', card: 'talk', title: opening.title, text: opening.text, open: opening.open });
    // 8.0 Laughing along, as loud as the person laughs.
    const laugh = !money && words <= 8 && !CURHAT.test(t) && !FLAT.test(t) ? readLaugh(raw) : null;
    if (laugh && laugh.rest.split(' ').filter(Boolean).length <= 4) return talk('banter', laughBack(v, laugh, turn, memory.topic === 'joke' || memory.topic === 'riddle'), { chips: ['lagi dong', 'tebak-tebakan dong', 'ringkasan bulan ini'] }, { serious: false, topic: memory.topic === 'joke' ? 'joke' : 'banter' });
    if (!money && BANTER.test(t) && words <= 8 && !CURHAT.test(t)) return talk('banter', P.banter(v, turn, FLAT.test(t)), { chips: ['lagi dong', 'ringkasan bulan ini'] }, { serious: false });
    if (!money && (memory.topic === 'joke' || memory.topic === 'banter') && ACK.test(t) && /\b(?:wk|ha|he|hi)/.test(t)) return talk('banter', P.banter(v, turn, false), { chips: ['lagi dong'] });

    // 8.1 Everyday talk: kind words, news to celebrate, the day (hungry, rain, weekend).
    const chat = !money && words <= 12 ? readTalk(t, v, turn) : null;
    if (chat) return talk('smalltalk', chat.text, chat.chips ? { chips: chat.chips } : {}, chat.offer ? { offer: chat.offer } : {});
    const greetLead = t.match(GREET_LEAD), rest = greetLead?.[1].replace(/[?!.]+$/, '').trim();
    const greetMore = rest && rest.split(' ').length <= 4 && !findAmounts(rest).length && !['record', 'question'].includes(ctx.inspect(rest).reading);
    if (GREET.test(t) || greetMore) return sayR('greet', { kind: 'say', text: V.greet(v, partOfDay(ctx.hour), name), chips: [tpl[0].items[0], 'ringkasan bulan ini', 'bisa apa aja?'] });
    if (THANKS.test(t)) return sayR('thanks', { kind: 'say', text: V.thanks(v), chips: ['ringkasan bulan ini'] });
    if (ACK.test(t)) return sayR('ack', { kind: 'say', text: pending ? V.ackPending(v) : memory.topic === 'kabar' ? P.ackKabar(v, turn) : V.ack(v) });
    // 8.2 "insight bulan ini apa", "laporan bulan ini", "analisis pengeluaranku": the summary, with a button to that menu.
    const report = !money && !opensMenu(t) && !/\b(?:utang|hutang|piutang)\b/.test(t) ? t.match(/\b(insight|laporan|rekap|analisis|analisa)\b/)?.[1] : undefined;
    if (report) { const r = summary(raw, ctx, v), go = report === 'insight' ? { view: 'advisor', label: 'Buka Insight' } : /^anal/.test(report) ? { view: 'analytics', label: 'Buka Analisis' } : { view: 'report', label: 'Buka Laporan' }; return sayR('summary', r.kind === 'say' ? { ...r, open: go } : r); }
    if (ABOUT.test(t)) return sayR('about', { kind: 'say', text: V.about(v), chips: ['bisa apa aja?'] });
    if (HELP.test(t)) return sayR('help', helpReply(v, tpl));
    if (EXAMPLES.test(t)) return sayR('examples', examplesReply(v, tpl));
    // Another way of talking: "pakai bahasa formal", "gaya gaul", "jawab singkat aja".
    if (/^gaya\s+/.test(t) || VOICE_TALK.test(t) && VOICE_WORDS.some(([re]) => re.test(t)) && t.split(' ').length <= 7 && !findAmounts(t).length) {
      const picked = VOICE_WORDS.find(([re]) => re.test(t))?.[1];
      if (picked) return { intent: 'voice', reply: { kind: 'say', text: V.voiceSet(picked) }, memory: mem, setVoice: picked, by: 'rules' };
      if (/\bgaya bahasa\b|\bganti gaya\b/.test(t)) return sayR('voice', { kind: 'say', text: V.voiceAsk(v), chips: VOICE_CHIPS });
    }

    // 7.9 "beli kopi tiga sama roti, kopinya 18rb rotinya 12rb": is 18rb each cup, or all three? Then "per gelas" / "total".
    if (memory.unitAsk && /\b(?:per|satuan|sebiji|segelas|seporsi|masing|satunya)\b/.test(t)) return plan(memory.unitAsk.per, { intro: `${memory.unitAsk.note} Udah pas?` });
    if (memory.unitAsk && /\b(?:total|semua|semuanya|sekaligus|bertiga|berdua)\b/.test(t)) return plan(memory.unitAsk.total);
    const NUMW = '(\\d+|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)', AMTW = '((?:rp\\.?\\s*)?\\d[\\d.,]*\\s*(?:rb|ribu|k)\\b)';
    const each = t.match(new RegExp(`^(?:beli\\s+)?(\\p{L}+)\\s+${NUMW}\\s+(?:sama|dan)\\s+(\\p{L}+)\\s*,?\\s*\\1(?:nya)?\\s+${AMTW}\\s*,?\\s*(?:dan\\s+|sama\\s+)?\\3(?:nya)?\\s+${AMTW}`, 'u'));
    if (each) {
      const [, item, n, other, p1, p2] = each, k = /^\d+$/.test(n) ? Number(n) : ['dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh'].indexOf(n) + 2;
      const unit = /\b(?:kopi|teh|es|jus|susu|boba|minum)\b/.test(item) ? 'gelas' : /\b(?:nasi|makan|bakso|mie|sate|soto)\b/.test(item) ? 'porsi' : 'buah';
      const a1 = findAmounts(p1).find(x => x.value > 0)!.value, a2 = findAmounts(p2).find(x => x.value > 0)!.value;
      return talk('clarify', `${cap(item)} ${rp(a1)} itu per ${unit} atau total ${k} ${unit}?`, { chips: [`per ${unit}`, 'total'] },
        { unitAsk: { per: `${k} ${item} @${p1.trim()}, ${other} ${p2.trim()}`, total: `${k} ${item} ${p1.trim()}, ${other} ${p2.trim()}`, note: `Berarti totalnya ${rp(k * a1 + a2)}: ${item} ${rp(k * a1)} dan ${other} ${rp(a2)}.` } });
    }
    // 7.9 "Lah bukan itu maksud gue": what to straighten out.
    if (/\b(?:bukan|salah)\s+(?:itu|gitu|begitu|ini)\s+maksud|\bsalah\s+(?:paham|tangkap|nangkep|ngerti)\b|^(?:lah\s+|eh\s+)?(?:bukan|salah)\s+(?:itu|gitu)(?:\s+(?:deh|sih|dong|kok))?$/.test(t)) {
      if (pending) return talk('clarify', 'Oke, kita lurusin. Yang mau diubah nominalnya, dompetnya, tanggalnya, atau transaksinya?', { chips: ['tanggalnya kemarin', 'gak jadi'] });
      return talk('clarify', `Maaf, aku salah tangkap. Maksudmu apa? Coba tulis dengan kata lain${P.offerTeach(v)}`, { chips: ['ajari aku'] }, { offer: 'ajari aku' });
    }
    // Saved or not: the chat never saves by itself.
    if (!money && words <= 9 && /\b(?:udah|sudah|dah)\s+(?:ke)?(?:simpen|simpan|disimpan|tersimpan|kesave)\b|\b(?:belum|blm)\s+(?:ke)?(?:simpen|simpan|disimpan|tersimpan)\b|\bkesimpen\b/.test(t)) {
      return talk('clarify', pending ? 'Belum. Kartunya masih menunggu: cek dulu, lalu ketuk Simpan di kartunya.' : saved ? 'Sudah tersimpan. Kalau mau dibatalkan, bilang “batalin yang tadi”.' : 'Belum ada catatan yang kusiapkan untuk disimpan di obrolan ini.', pending ? {} : { chips: saved ? ['batalin yang tadi'] : [] });
    }
    if (!money && /^(?:tolong\s+)?(?:simpan|simpen|save)(?:in|kan)?\b/.test(t)) {
      const left = pending ? clausesOf(pending.text).items.map(c => c.text).join(', ') : '';
      return talk('clarify', pending ? `Aku nggak menyimpan sendiri, supaya kamu bisa cek dulu. Ketuk Simpan di kartunya, ya. Isinya sekarang: ${left || pending.text}.` : 'Belum ada kartu yang menunggu disimpan. Tulis dulu yang mau dicatat, nanti kusiapkan kartunya.');
    }
    if (pending) {
      const say = { amount: (r: string) => V.editAmount(v, r), wallet: (n: string) => V.editWallet(v, n), date: (d: string) => V.editDate(v, d), category: (c: string) => V.editCategory(v, c), note: (n: string) => `catatannya “${n}”` };
      const editIntent: ChatIntent = memory.asking ? 'fill' : 'edit';
      // "eh ternyata udah dibeli tadi, pake tunai": the plan happened.
      const happened = readHappened(raw, pending.text, ctx.quick);
      if (happened) return plan(happened, { did: 'kuubah jadi pengeluaran yang sudah terjadi', intent: 'edit' });
      // "diskon 10rb": less to pay.
      const off = readDiscount(raw, pending.text);
      if (off) return plan(off.text, { did: `dipotong diskon ${rp(off.off)}, jadi ${rp(off.was - off.off)}`, intent: 'edit' });
      // "susu 25rb, sabun 62rb" for a card of 87rb: one purchase, one line per thing.
      const split = readBreakdown(raw, pending.text, ctx.quick);
      if (split) return plan(split, { did: 'pas, kubagi per barang dalam satu catatan', intent: 'edit' });
      // "totalnya 40rb ya?": the total of the card.
      const asked = /\?\s*$/.test(raw) || /\b(?:ya|kan|bukan)$/.test(t) ? t.match(/^(?:total(?:nya)?|semua(?:nya)?|jadi(?:nya)?\s+total)\s+((?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k|jt)?)\s*(?:ya|kan|bukan|gak|nggak)?$/) : null;
      if (asked) {
        const want = findAmounts(asked[1].match(/rb|ribu|k|jt|rp/) ? asked[1] : `${asked[1]}rb`).find(x => x.value > 0)?.value || 0, total = ctx.inspect(pending.text).total || 0;
        if (want && total) return talk('clarify', want === total ? `Iya, totalnya ${rp(total)}.` : `Totalnya ${rp(total)}, bukan ${rp(want)}.`);
      }
      // "yang keluar dari bank cuma 45rb": a discount, part paid another way, or the amount is wrong?
      const less = t.match(/\b(?:yang\s+)?(?:keluar|kepotong|kebayar|dibayar|kedebet|terpotong)\b.*\b(?:cuma|hanya|cuman|doang)\b\s*((?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k|jt)?)|\b(?:cuma|hanya|cuman)\s+((?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k|jt))\s+(?:yang\s+)?(?:keluar|kepotong|kebayar)\b/);
      if (less) {
        const got = findAmounts(less[1] || less[2]).find(x => x.value > 0)?.value || 0, total = ctx.inspect(pending.text).total || 0;
        if (got && total > got) return talk('clarify', `Berarti ada diskon ${rp(total - got)}, dibayar sebagian dengan cara lain, atau nominalnya seharusnya ${rp(got)}?`, { chips: [`jadi ${Math.round(got / 1000)}rb`, `diskon ${Math.round((total - got) / 1000)}rb`] });
      }
      const edit = readDraftEdit(raw, pending.text, ctx.quick, say);
      if (edit) return plan(edit.text, { did: edit.did.join(', '), intent: editIntent, ...(edit.save ? { intro: `${cap(edit.did.join(', '))}. Cek lagi karena isinya berubah, lalu ketuk Simpan di kartunya.` } : {}) });
    }
    // A new record with the wallet of the one before: "kopi 12rb juga, dompetnya sama".
    const same = t.match(/\s*,?\s*(?:(?:pake|pakai)\s+)?(?:dompet(?:nya)?\s+(?:yang\s+)?sama|dompet yang sama|sama kayak tadi|sama seperti tadi|sama kaya tadi)\b/);
    if (same && money && mem.plan) {
      const w = walletsIn(lower(mem.plan.text), ctx.quick.wallets)[0];
      if (w) return plan(`${raw.slice(0, same.index).replace(/\s+(?:juga|lagi)\s*$/i, '')} pakai ${lower(w.name)}`.replace(/\s+/g, ' ').trim(), { intro: `Pakai ${w.name} juga, sama seperti tadi. Udah pas?` });
    }
    // What things mean, what the chat does not do, money that is not money yet, asking back.
    const faq = readFaq(t, ctx, mem);
    if (faq) {
      if (faq.intent === 'payday') return sayR('payday', payday(ctx, v));
      if (faq.plan) return plan(faq.plan, { intent: faq.intent === 'question' ? 'question' : 'plan', ...(faq.intro ? { intro: faq.intro } : {}) });
      return sayR(faq.intent as ChatIntent, { kind: 'say', card: 'talk', text: faq.text || '', ...(faq.title ? { title: faq.title } : {}), ...(faq.lines?.length ? { lines: faq.lines } : {}), ...(faq.chips?.length ? { chips: faq.chips } : {}) }, { ...mem, topic: faq.memory?.topic ?? faq.intent, ...faq.memory });
    }
    // 8.1 How to use a feature, from Tanya Jawab, with a button to its menu.
    // Not a way to save ("gimana caranya biar bisa nyisihin uang"): that is tips.
    const howto = !money && !TIPS.test(t) ? readHowto(t) : null;
    if (howto) return sayR('howto', { kind: 'say', card: 'help', title: howto.title, text: howto.text, ...(howto.steps ? { steps: howto.steps } : {}), ...(howto.open ? { open: howto.open } : {}), chips: ['cara lainnya?', 'bisa apa aja?'] });
    // 8.1 Habits from the records: days without spending, the costliest weekday, the usual shop, how much is recorded.
    const stat = !money ? readStats(t, ctx.data.transactions, ctx.cycle, ctx.today, v, ctx.data.categories, ctx.salaryDay) : null;
    if (stat?.plan) return plan(stat.plan);
    if (stat) return sayR('question', { kind: 'say', card: 'summary', title: stat.title, text: stat.text, ...(stat.lines?.length ? { lines: stat.lines } : {}) }, { ...mem, last: 'question', topic: 'question' });
    // 8.2 Where the money is heading: what is left at payday at the current pace (Proyeksi), and Insight in short.
    if (!money && /\b(?:perkiraan|prediksi|proyeksi|estimasi|kira[-\s]?kira|forecast)\b.*\b(?:akhir\s+(?:bulan|siklus)|sisa|uang|saldo|gajian|nanti)\b|\bakhir\s+(?:bulan|siklus)\b.*\b(?:sisa|tinggal|masih)\b|\b(?:sisa|tinggal)\s+(?:uang|duit)\s*(?:aku|gue|saya|ku)?\s+(?:pas|waktu|saat)\s+gajian\b/.test(t)) {
      const m = cycleMoney(ctx), end = m.free - m.pace * m.left, perDay = Math.max(0, m.daily);
      return sayR('summary', { kind: 'say', card: 'summary', title: 'Perkiraan saat gajian', text: vo(v, {
        santai: end >= 0 ? `Kalau belanjamu tetap ${rp(m.pace)}/hari, saat gajian nanti masih sisa sekitar ${rp(end)}. Aman! 👍` : `Kalau belanjamu tetap ${rp(m.pace)}/hari, uang bebasmu habis sebelum gajian, kurang sekitar ${rp(-end)}. Coba tahan di ${rp(perDay)}/hari ya.`,
        sopan: end >= 0 ? `Dengan pengeluaran ${rp(m.pace)}/hari, perkiraan sisa uang bebas saat gajian sekitar ${rp(end)}.` : `Dengan pengeluaran ${rp(m.pace)}/hari, uang bebas diperkirakan kurang sekitar ${rp(-end)} sebelum gajian. Disarankan maksimal ${rp(perDay)}/hari.`,
        gaul: end >= 0 ? `Kalau lo tetep ${rp(m.pace)}/hari, pas gajian masih sisa ±${rp(end)}. Aman!` : `Kalau lo tetep ${rp(m.pace)}/hari, duit lo abis sebelum gajian, kurang ±${rp(-end)}. Rem di ${rp(perDay)}/hari.`,
        singkat: end >= 0 ? `Sisa saat gajian ±${rp(end)}.` : `Kurang ±${rp(-end)} sebelum gajian.`,
        barbar: end >= 0 ? `Kalau lo ga kalap, pas gajian masih sisa ±${rp(end)}. Tumben aman, anjir.` : `Dengan gaya lo ${rp(m.pace)}/hari, duit abis sebelum gajian, kurang ±${rp(-end)}, bangsat. Rem di ${rp(perDay)}/hari!`,
      }), hero: { label: 'Perkiraan sisa uang bebas saat gajian', value: rp(end), note: `${m.left} hari lagi`, tone: end >= 0 ? 'good' : 'warn' }, stats: [{ label: 'Uang bebas sekarang', value: rp(m.free) }, { label: 'Rata-rata belanja', value: `${rp(m.pace)}/hari` }, { label: 'Jatah aman', value: `${rp(perDay)}/hari` }], tone: end >= 0 ? 'good' : 'warn', open: { view: 'forecast', label: 'Buka Proyeksi' }, chips: ['kasih tips hemat', 'ringkasan bulan ini'] });
    }
    // 8.0 Every menu: opening it, or what is in it ("utang gue berapa", "langganan apa aja"), with a button to it.
    const module = !money ? readModule(t, ctx.data, ctx.today, v) : null;
    if (module) return sayR('module', { kind: 'say', card: 'talk', title: module.title, text: module.text, ...(module.hero ? { hero: module.hero } : {}), ...(module.lines?.length ? { lines: module.lines } : {}), ...(module.bars?.length ? { bars: module.bars } : {}), ...(module.chips?.length ? { chips: module.chips } : {}), open: module.open });
    // "untung gue segitu kan?" after a sale: recorded as money in, and what profit still needs.
    if (money && /\b(?:untung|laba|profit|cuan)\b.*\b(?:kan|ya|bukan|gak|nggak|ga|kah)\s*$/.test(t)) {
      const clean = raw.replace(/\s*,?\s*(?:itu\s+)?(?:untung|laba|profit|cuan)\b.*$/i, '').trim(), ins = ctx.inspect(clean);
      if (ins.reading === 'record' && ins.kind === 'income') return plan(clean, { intro: `${rp(ins.total || 0)} itu penerimaan penjualan. Untuk tahu laba, masih perlu dikurangi biaya barang dan biaya usaha. Kartunya kusiapkan sebagai pemasukan.` });
    }

    // The record being made: cancelled, filled in, or changed by a short follow-up.
    if (pending && CANCEL.test(t)) return { intent: 'cancel', reply: { kind: 'say', text: V.cancel(v) }, memory: { ...mem, plan: { ...pending, status: 'dismissed' } }, dismiss: true, by: 'rules' };
    if (UNDO.test(t) || saved && CANCEL.test(t)) return plan('hapus transaksi terakhir', { intro: V.undoIntro(v), intent: 'undo' });
    const asking = memory.asking;
    if (pending && asking && t.split(' ').length <= 4) {
      const amount = findAmounts(t).find(a => a.value > 0) || (/^\d[\d.]*$/.test(t) ? { text: t, value: Number(t.replace(/\./g, '')) } : undefined);
      const w = walletsIn(t, ctx.quick.wallets)[0], date = t.match(DATE_ONLY);
      if (asking.field === 'amount' && amount) return plan(withAmount(pending.text, amount.text, ctx.quick), { did: V.editAmount(v, rp(amount.value)), intent: 'fill' });
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
        if (onlyAmount) return plan(withAmount(pending.text, amount!.text, ctx.quick), { did: V.editAmount(v, rp(amount!.value)), intent: 'edit' });
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

    // 7.9 "oke catat tunai" after a sum of things bought: the things become cards.
    const keep = mem.calcPlan && mem.last === 'calc' ? t.match(/^(?:(?:oke|ok|okey|yaudah|ya udah|yowes|sip|iya|ya|boleh|gas)\s*,?\s*)*(?:catat|catet|dicatat|simpan|masukin)(?:\s+(?:aja|ya|deh|dong))?(?:\s+(?:pake|pakai|pakek|via|dari|ke|di))?\s*(.*)$/) : null;
    if (keep) { const w = walletsIn(keep[1], ctx.quick.wallets)[0]; return plan(`${mem.calcPlan}${w ? ` pakai ${lower(w.name)}` : ''}`); }
    // Arithmetic asked in words: answered, never recorded ("kembali berapa?", "sehari berapa?", "naik berapa persen?").
    const wm = readWordMath(raw, ctx.quick, { remain: mem.remain, last: mem.last });
    if (wm) return sayR('calc', { kind: 'say', card: 'calc', title: wm.title, text: wm.text, hero: wm.hero, ...(wm.lines ? { lines: wm.lines } : {}), tone: 'info', why: wm.why, chips: wm.chips || ['kalau dibagi 2?'] }, { ...mem, number: wm.number, last: 'calc', remain: wm.remain ?? (wm.plan ? undefined : mem.remain), calcPlan: wm.plan });
    // "cuma hitung aja, jangan dicatat": nothing is recorded.
    if (!money && /\b(?:hitung|itung|hitungin|itungin)\b.*\b(?:aja|doang|saja)\b.*\b(?:jangan|ga usah|gak usah|nggak usah|gausah|tanpa)\b.*\b(?:catat|dicatat|dicatet|catet)\b|\b(?:cuma|cuman|hanya)\s+(?:hitung|itung)\b/.test(t)) return talk('calc', 'Oke, cuma kuhitung, nggak kucatat. Tulis hitungannya, misalnya “250rb kurang 87rb” atau “3 kopi @18rb sama roti 12rb berapa”.', { chips: ['250rb kurang 87rb'] });
    // A calculation carried on: "kalau dibagi 4?".
    const again = mem.number !== undefined && mem.last === 'calc' ? t.match(CALC_AGAIN) : null;
    if (again) { const c = calculate(`${mem.number!.toLocaleString('id-ID', { maximumFractionDigits: 6 })} ${again[1]} ${again[2]}`); if (c) return sayR('calc', calcReply(c, true, v), { ...mem, number: c.value, last: 'calc' }); }
    // The last question again, with a new period or subject.
    if (mem.question && (mem.last === 'question' || readPeriod(t, ctx.today, ctx.salaryDay))) {
      const f = t.match(FOLLOW), onlyPeriod = readPeriod(t, ctx.today, ctx.salaryDay);
      // 7.9 "makan siang aja, kopi jangan": the subject narrowed.
      const only = mem.last === 'question' ? t.match(/^([\p{L}\s]{3,30}?)\s+(?:aja|saja|doang)(?:\s*,\s*[\p{L}\s]+?\s+(?:jangan|ga usah|gak usah|nggak usah|nggak|gak|enggak))?$/u) : null;
      const rest = f ? f[1] : only ? only[1] : onlyPeriod && unfill(t.replace(onlyPeriod.said, ' ')).replace(/\s/g, '') === '' ? t : '';
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
    if (DESIRE.test(t) && SAVE_WORD.test(t) && (!money || /\b(?:pengen|pengin|pingin|ingin|target|impian)\b/.test(t) && !walletsIn(t, ctx.quick.wallets).length)
      || !money && (/\b(?:nabung|menabung) (?:buat|untuk|utk|beli)\b/.test(t) || DESIRE.test(t) && /\b(?:beli|ganti|punya)\b/.test(t) && LATER.test(t) || /\b(?:bikin|buat|siapin|nyiapin) (?:dana|target)\b/.test(t))) return sayR('goal', goal(raw, ctx, v));
    if (!money && (MOOD_STRONG.test(t) || MOOD_SOFT.test(t) && MONEY_WORD.test(t))) return sayR('mood', mood(ctx, v), { ...mem, topic: 'mood', offer: 'kasih tips hemat', explain: moodWhy(v) });
    if (!money && (CURHAT.test(t) || CURHAT_TOPICS.some(([re, k]) => k === 'mulai' && re.test(t)))) return listen();
    if (TIPS.test(t) && !money) return sayR('tips', tips(ctx, v));
    if (SUMMARY.test(t)) return sayR('summary', summary(t, ctx, v));
    if (!money && BUDGET.test(t) && BUDGET_ASK.test(t) && !namesBudget(t, ctx)) return sayR('budget', budgetOverview(ctx, v));
    if (!money && (PAYDAY.test(t) && PAYDAY_ASK.test(t) || ALLOWANCE.test(t))) return sayR('payday', payday(ctx, v));
    const small = !money && words <= 8 ? SMALL.find(([re]) => re.test(t)) : undefined;
    if (small) return sayR('smalltalk', smallTalk(small[1], v), smallMemory(small[1]));

    const ins = ctx.inspect(raw);
    if (ins.reading === 'record' || ins.reading === 'question') return plan(raw);
    // Still venting: what follows is listened to as well ("dia ninggalin aku").
    if (memory.topic === 'curhat' && !money && words <= 25) return listen();

    // The trained model, for what the rules did not catch.
    const guess = ctx.classify ? await ctx.classify(raw) : null;
    const sure = guess && guess.score >= 0.6 ? guess.intent : null;
    const byModel = (intent: ChatIntent, reply: ChatReply, next: ChatMemory = mem) => sayR(intent, reply, next, 'model');
    const model = (r: ChatResult): ChatResult => ({ ...r, by: 'model' });
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
      case 'budget': return byModel('budget', budgetOverview(ctx, v));
      case 'payday': if (/\b(?:gaji|gajian|payday|tanggal muda|jatah|cukup)\b/.test(t)) return byModel('payday', payday(ctx, v)); break;
      case 'mood': return byModel('mood', mood(ctx, v));
      case 'goal': return byModel('goal', goal(raw, ctx, v));
      case 'smalltalk': { const kind = SMALL.find(([re]) => re.test(t))?.[1] || 'kamu'; return byModel('smalltalk', smallTalk(kind, v), smallMemory(kind)); }
      case 'joke': return model(tellJoke());
      case 'banter': return model(talk('banter', P.banter(v, turn, FLAT.test(t)), { chips: ['lagi dong', 'ringkasan bulan ini'] }));
      case 'angry': return model(talk('angry', `${P.angry(v, turn)}${P.offerTeach(v)}`, { chips: ['ajari aku', 'bisa apa aja?'] }, { offer: 'ajari aku' }));
      case 'curhat': return model(listen());
      case 'serious': if (/\b(?:serius|fokus|canda|bercanda)\b/.test(t)) return model(talk('serious', P.serious(v), {}, { serious: true })); break;
      case 'teach': return model(memory.unknown ? talk('teach', P.teachAsk(v, memory.unknown), { chips: TEACH_CHIPS }, { teaching: clean(memory.unknown) }) : talk('teach', P.teachHow(v), { chips: ['kalau aku bilang boncos artinya boros'] }));
      case 'apology': return model(talk('apology', P.apology(v, turn), { chips: ['ringkasan bulan ini', 'bisa apa aja?'] }));
      // 7.9: deleting or dropping only when the message says so (never "catatannya lembur" or "yang tadi kemarin ya").
      case 'undo': if (/\b(?:di)?(?:batal(?:in|kan)?|hapus(?:in|kan)?|apus(?:in)?|cancel)\b|\b(?:undo|delete|tarik)\b/.test(t)) return { ...plan('hapus transaksi terakhir', { intro: V.undoIntro(v), intent: 'undo' }), by: 'model' }; break;
      case 'cancel': if (pending && /\b(?:di)?(?:batal(?:in|kan)?|hapus(?:in)?|cancel)\b|\b(?:gak jadi|ga jadi|nggak jadi|gajadi|skip|jangan|gausah|ga usah|gak usah|nggak usah)\b/.test(t)) return { intent: 'cancel', reply: { kind: 'say', text: V.cancel(v) }, memory: { ...mem, plan: { ...pending, status: 'dismissed' } }, dismiss: true, by: 'model' }; break;
    }
    if (money) return plan(raw);
    // The second message in a row not understood: the person can teach it.
    if ((memory.misses || 0) >= 1) return { intent: 'unknown', reply: { kind: 'say', card: 'talk', text: P.teachOffer(v), chips: ['ajari aku', ...unknownReply(v, tpl).chips!.slice(0, 2)] }, memory: { ...mem, unknown: raw, offer: 'ajari aku' }, by: 'rules' };
    return { intent: 'unknown', reply: unknownReply(v, tpl, ins.reading === 'unanswered'), memory: { ...mem, unknown: raw }, by: 'rules' };
  }
}
