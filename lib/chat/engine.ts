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
import { readPeriod, spendingShare } from '../catat/ask.ts';
import { suggestCategory } from '../categorize.ts';
import { readEveryday } from '../catat/everyday.ts';
import { parseQuickPlan } from '../quick-plan.ts';
import { readFix, type Fix } from './followup.ts';
import { amountWords, findAmounts, walletsIn, type QuickContext } from '../quick-entry.ts';
import type { Data, LedgerTx } from '../types';
import { dailyForSpending } from '../budget-daily.ts';
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
import { aboutItem, debtPerson, fromList, readAnswer, rekapAsk, weekAsk, readSaving, spendingMore, type Answer, type ItemRef, type ListRef, type Saving } from './answers.ts';
import { understand } from './understand.ts';
import { FUN_MORE, readFunContent, readTalk } from './talk.ts';
import { opensMenu, readModule } from './modules.ts';
import { budgetMissing, continueGoal, readGoal, type GoalFlow, type GoalStep } from './goals.ts';
import { readAdvice } from './advice.ts';
import { AFTER_COMMENT, DEBT, GENEROUS, SAVING, TREATS, afterComment, commentFor, type CommentFacts } from './comment.ts';

export type ChatData = Pick<Data, 'wallets' | 'transactions' | 'budgets' | 'categories' | 'funds' | 'debts' | 'receivables' | 'claims'> & Partial<Pick<Data, 'recurring' | 'wishlist' | 'drafts' | 'plannedTransactions'>>;
export type ChatContext = {
  data: ChatData; today: string; salaryDay: number; cycle: { start: string; end: string };
  quick: QuickContext; inspect: (text: string) => Inspection;
  /** The trained intent model (absent in plain tests: the rules alone). */
  classify?: (text: string) => Promise<{ intent: ChatModelIntent; score: number } | null>;
  name?: string; hour?: number; voice?: Voice;
  /** 8.4 The minute now, with `hour`, for "jam berapa sekarang". */
  minute?: number;
  /** Phrases learned from this person: what they wrote → the message that meant it. */
  learned?: Record<string, string>;
};
export type ChatMemory = {
  /** 8.3 The saving sum just worked out ("kalau 1jt per bulan?"), and the kind of item just answered ("kalau dimas?"). */
  saving?: Saving; item?: string;
  /** 8.4 "catat pengeluaran" said with nothing after it: the kind, and an amount said before what it was for. */
  start?: { kind: 'expense' | 'income' | 'any'; amount?: string; item?: string };
  /** 8.4 The one record answered last (a receivable, a debt, a bill…), for "dia kapan bayar?" / "buat apa dulu?". */
  about?: ItemRef;
  /** 8.4 The records the last answer listed, for "yang paling lama siapa?" / "totalnya?". */
  list?: ListRef;
  /** 8.5 When the record, the list and the question were answered (the reply's turn): they last a few light replies
   * ("makasih", "wkwk", a joke), so "dia kapan bayar?" or "rinciannya dong" still belongs to them. */
  aboutAt?: number; listAt?: number; questionAt?: number;
  /** 8.6 "kasbon pak rt 300rb" asked back (who took it): the person and the amount, for "aku" / "dia yang kasbon". */
  kasbon?: { person: string; amount: string };
  /** The last sentence handed to Catat otomatis to record, and whether it was saved. */
  plan?: { text: string; status: 'pending' | 'saved' | 'dismissed' };
  /** 10.2 The cards saved in this chat lately (newest last), for "yang kopi tadi pake gopay" after two more. */
  saves?: string[];
  /** 10.2 The one wallet talked about last ("saldo gopay berapa?"), for "pake itu aja" or a transfer without its source. */
  walletTalk?: string;
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
  /** 10.0 Something being set up in the chat (an anggaran, a dompet, a tujuan dana…): the question just asked. */
  goal?: GoalFlow;
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
  | { kind: 'say'; text: string; title?: string; card?: SayCard; hero?: { label: string; value: string; note?: string; tone?: SayTone }; stats?: SayLine[]; bars?: SayBar[]; steps?: string[]; lines?: SayLine[]; chips?: string[]; tone?: 'good' | 'warn' | 'info'; note?: string; /** 10.1 "Sehari seharusnya ±Rp…" after a spending is saved: a line of its own. */ daily?: string;
    /** 7.8: how this answer was worked out, said when the person asks "kenapa?" (not shown on the card). */
    why?: string;
    /** 8.0: a button to the menu the answer is about. */
    open?: { view: string; label: string; /** 10.0 Where in that menu: 'new' opens its form. */ target?: string } };
export type ChatIntent = 'greet' | 'thanks' | 'ack' | 'help' | 'examples' | 'about' | 'voice' | 'edit' | 'fill' | 'cancel' | 'undo' | 'followup' | 'calc' | 'summary' | 'afford' | 'tips' | 'plan' | 'question' | 'unknown'
  | 'smalltalk' | 'mood' | 'budget' | 'payday' | 'goal'
  | 'joke' | 'banter' | 'angry' | 'curhat' | 'serious' | 'teach' | 'apology' | 'explain' | 'decline'
  /** 7.9: what things mean in the app; asking back or saying honestly what the chat does not do. */
  | 'faq' | 'clarify'
  /** 8.0: swearing answered in the chosen style, a roast of the spending, riddles both ways, a menu of the app. */
  | 'swear' | 'roast' | 'riddle' | 'module'
  /** 8.1: quotes, facts, challenges and fortune; games; how to use a feature (from Tanya Jawab). */
  | 'fun' | 'game' | 'howto'
  /** 10.0: something set up in the chat (lib/chat/goals.ts); advice for real life and the feature that fits (lib/chat/advice.ts). */
  | 'setup';
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
/** 10.2 The words each newer model intent is said with: the model's guess counts only with one of them in the message. */
const FIX_WORDS = /\b(?:salah|keliru|ralat|koreksi|revisi|benerin|betulin|perbaiki|ganti|ubah|edit|update|harusnya|seharusnya|bukan|kebalik|ketuker|kategori\p{L}*|dompet\p{L}*|nominal\p{L}*|tanggal\p{L}*|nama\p{L}*|tempat\p{L}*|masuk|masukin|taruh|taro|pindahin|pos|pake\p{L}*|pakai|bayarnya|lewat|via|dari|itu|buat|pemasukan|pengeluaran|income)\b/u;
const FOLLOW_WORDS = /\p{L}+nya\s+(?:berapa|brp)\b|\b(?:terus|trus|lalu|abis\s+itu)\s+(?:gimana|gmn|apa)\b|\b(?:lagi\s+satu|satu\s+lagi|sama\s+kayak\s+tadi|lanjutannya)\b|\b(?:kalau|kalo|klo|kl|yang|yg|sisanya|totalnya|rata\s*rata\p{L}*|per\s*(?:hari|minggu|bulan)\p{L}*|selain|kurang\s+berapa|detailnya|rinciannya|dibanding|naik|turun|lebih\s+banyak|siapa\s+aja|mana\s+aja)\b/u;
const HOW_WORDS = /\b(?:cara|caranya|gimana|gmn|bagaimana|dimana|di\s+mana|tutorial|panduan|ajarin|ajari|langkah|step|how|bisa|letak\p{L}*|nyari\p{L}*|mau)\b/u;
const PLAY_WORDS = /\b(?:main|maen|mainan|game|games|gim|ngegame|permainan|suit|tebak\s+angka|lempar\s+koin|play)\b/u;
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
  { key: 'tanya', title: 'Tanya', hint: 'Dijawab dari catatanmu', items: ['pengeluaran bulan ini berapa', 'uang bebasku berapa', 'sehari boleh jajan berapa', 'kapan terakhir isi bensin', 'saldo semua dompet berapa', 'sisa anggaran makan berapa', 'tanggal 5 belanja apa aja', 'rincian pengeluaran bulan ini', 'berapa persen pengeluaran buat makan', 'hari apa aku paling boros', 'berapa hari aku nggak jajan', 'paling sering belanja di mana'] },
  { key: 'saran', title: 'Ringkasan & saran', hint: 'Kondisi keuangan, anggaran, gajian, nabung', items: ['ringkasan bulan ini', 'skor keuangan aku berapa', 'aku harus hemat di mana', 'cek semua anggaran', 'kapan gajian?', 'aman nggak beli sepatu 500rb?', 'nabung 500rb sebulan kapan dapet 10jt', 'kasih tips hemat', 'pengen nabung buat liburan'] },
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

const GREET = /^(?:(?:eh+|oi+|nah)\s+)?(?:halo+|hal+o|hai+|hay|hi+|hello|helo|hey|hei|pagi|siang|sore|malam|malem|met (?:pagi|siang|sore|malam|malem)|selamat (?:pagi|siang|sore|malam|malem)|good (?:morning|afternoon|evening|night)|morning|gm|gn|assalamu.?alaikum|asw|permisi|p|yo)(?:\s+(?:min|kak|bro|sis|bot|asisten|dompet|ajaib|semua|apa kabar|ya|juga|nih|dong|all|everyone))*$/;
/** A greeting with a little more after it: "pagi min, apa kabar", "malam kak, masih bangun?" (7.7, post-hoc). */
const GREET_LEAD = /^(?:halo+|hai+|hi+|hello|hey|pagi|siang|sore|malam|met (?:pagi|siang|sore|malam)|selamat (?:pagi|siang|sore|malam)|assalamu.?alaikum)(?:\s+(?:min|kak|bro|sis|bot|asisten|dompet|ajaib|semua))*\s*[,!.]\s*(.+)$/;
const THANKS = /^(?:(?:iya|ya|oke|ok|sip|nah|wah|wih|mantap)\s+)?(?:makasih+|makasi|mksh|maksih|terima ?kasih|trims|thanks|thank you|thx|tq|ty|nuhun|suwun|tengkyu)\b/;
const ACK = /^(?:ok(?:e|ay|ey)?|okk+|si+p+|siap|mantap|mantab|mantep|mantul|gokil|jos+|cakep|top|good|nice|keren|baik|oke deh|okedeh|ya|iya|yoi|noted|wkwk+|haha+|hehe+|hihi|👍|🙏|(?:baik|aman|sehat|lumayan|alhamdulillah|biasa)(?:\s+(?:kok|aja|banget|bgt|baik|alhamdulillah|sih))*|so far so good|fine)(?:\s+(?:bro|sis|bos|boss|kak|min|gan|bang|cuy|coy|bestie|bes|beb|lur|sob|bray|banget|bgt|deh|dong|nih|ya))*$/;
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
/** 8.4 Starting a record with nothing in it yet: "catat pengeluaran", "mau nyatet nih", "tolong catetin ya", "catat dong". */
const START_LEAD = /^(?:(?:eh+|eits|nah|oiya|btw|halo|hai|min|mimin|admin|bot|kak|bang|bro|sis|gan)\s*[,!.]?\s+)+/;
const START = /^(?:(?:tolong|coba|bantu|aku|gue|gw|saya|mau|pengen|pingin|ingin|bisa|boleh|yuk|ayo)\s+)*(catat|catet|nyatet|nyatat|mencatat|catetin|catatin|nyatetin|input|tambah|add)(?:\s+(?:transaksi|data|catatan))?(?:\s+(pengeluaran|pemasukan|belanja(?:an)?|jajan|keluar|masuk|income|expense|(?:duit|uang) (?:keluar|masuk)))?(?:\s+(?:baru|dong|donk|ya|yah|nih|yuk|deh|dulu|sih|aja|min|kak|bang|bro|sis|bentar|sebentar|lagi))*$/;
function readStart(t: string): 'expense' | 'income' | 'any' | null {
  const m = t.replace(START_LEAD, '').match(START);
  if (!m || (/^(?:input|tambah|add)$/.test(m[1]) && !m[2])) return null;
  return !m[2] ? 'any' : /pemasukan|masuk|income/.test(m[2]) ? 'income' : 'expense';
}
/** 8.4 What a total was asked about, and the follow-ups to it. */
const SPEND_ASKED = /\b(?:pengeluaran\p{L}*|keluar|habis|abis|belanja\p{L}*|spending|jajan|boros)\b/u;
const INCOME_ASKED = /\b(?:pemasukan\p{L}*|penghasilan\p{L}*|pendapatan\p{L}*|income)\b/u;
const MORE_BREAKDOWN = /\b(?:rinci\p{L}*|perincian\p{L}*|detail\p{L}*|detil\p{L}*|breakdown)\b|\b(?:apa|buat apa|untuk apa|ke ?mana) (?:aja|saja)\b/u;
const MORE_BIGGEST = /\b(?:paling|ter)\s*(?:besar|gede|banyak|mahal|boros)\b|\bterbesar\b/;
const MORE_COMPARE = /\b(?:dibanding\p{L}*|banding\p{L}*|vs|versus|lebih\s+(?:boros|hemat|banyak|sedikit)|naik|turun)\b/u;
const MORE_WHY = /\b(?:kenapa|knp|mengapa|napa|kok)\b.*\b(?:banyak|gede|besar|boros|segitu|tinggi|mahal|bengkak|bisa)\b/;
/** 8.4 Everyday questions, asked on their own ("tgl brp skrg", "sekarang hari apa", "jam berapa nih"). */
const DATE_NOW = /^(?:(?:sekarang|skrg|hari ini|hr ini|ini)\s+)?(?:tanggal|tgl)\s+(?:berapa|brp|brapa)(?:\s+(?:sekarang|skrg|hari ini|ini))?$|^(?:tanggal|tgl)\s+(?:hari ini|sekarang|skrg)(?:\s+(?:berapa|brp))?$|^what(?:'?s| is)? the date(?: today)?$/;
const DAY_NOW = /^(?:(?:sekarang|skrg|hari ini|hr ini|ini)\s+)?hari\s+apa(?:\s+(?:sekarang|skrg|ini|hari ini))?$|^what day is (?:it|today)(?: today)?$/;
const TIME_NOW = /^(?:(?:sekarang|skrg)\s+)?(?:jam|pukul)\s+(?:berapa|brp|brapa)(?:\s+(?:sekarang|skrg|nih|ini))?$|^what time is it(?: now)?$/;
const EXPORT_ASK = /\b(?:excel|xls|xlsx|csv|spreadsheet|google\s+sheets?)\b|\b(?:export|ekspor|eksport)\b.*\b(?:data|transaksi|catatan|riwayat|semua)\b/;
const FORGOT_PIN = /\blupa\s+(?:pin|kode\s+(?:kunci|pin)|kunci\s+aplikasi)\b|\bpin\b.{0,20}\blupa\b|\bforgot\s+(?:my\s+)?pin\b/;
/** 8.4 "gaji aku cukup ga", "duitku cukup ga sampe gajian", "uangku bakal tahan sampai akhir bulan?": a question, never income. */
const ENOUGH_TILL_PAYDAY = /\b(?:gaji\p{L}*|duit\p{L}*|uang\p{L}*|saldo\p{L}*|dana\p{L}*)\s+(?:(?:aku|gue|gw|saya|ku|lo|kamu)\s+)?(?:(?:bakal|bakalan|masih|kira[-\s]?kira)\s+)?(?:cukup|tahan|bertahan|aman|nyampe|sampe)\b.*\b(?:ga|gak|nggak|ngga|enggak|engga|tidak|kah|nggk|gk|g|ya|gimana|nggak\s+ya)\b|\b(?:cukup|tahan|bertahan|aman|nyampe)\b.{0,25}\b(?:sampai|sampe|ampe|hingga|ke)\s+(?:gajian|akhir\s+(?:bulan|siklus)|tanggal\s+gajian)\b/u;
/**
 * 8.4 Words around a message that are not part of it (post-hoc, after the first held-out run): "oke, …", "sip, …",
 * "kak …" / "bot …" before a record or a question, "… kak" at the end; a message typed in capitals is read in small
 * letters. A name after "kak" stays ("kak tio ngutang 25k"), and a short reply ("oke deh", "boleh kak") is left whole.
 */
const OPENER = /^(?:oke+|ok+|okey|okay|okeh|sip|siap|nah|eh+|btw|oiya|oh iya|yaudah|ya udah)\s*[,!.]\s*/;
const OPENER_BARE = /^(?:oke+|ok+|okey|okay|okeh|sip|siap)\s+(?=\S+\s+\S)/;
const ADDRESS_LEAD = /^(?:kak|ka|kakak|bot|min|mimin|admin|bang|bro|sis|gan)\s*[,!.]?\s+(?=(?:\d|(?:hutang|utang|piutang|ngutang|pinjem|pinjam|minjem|minjam|dipinjem|dipinjam|dipinjemin|dipinjamin|nalangin|talangin|kasbon|catat|catet|nyatet|tolong|mau|bisa|tf|transfer|kirim|top ?up|topup|isi|saldo|habis|abis|beli|bayar|tadi|barusan|td|gaji|gajian|pengeluaran|pemasukan|daftar|selamat|met|pagi|siang|sore|malam|malem|halo|hai|tanggal|tgl|hari|jam|sekarang|skrg|berapa|brp|kapan|siapa|apa|gimana|uang|duit|dompet|tagihan|cicilan|klaim|lupa|undo|batal|batalin|hapus|ringkasan|rincian|pengen|aku|gue|gw|saya|yang|yg)\b))/;
const ADDRESS_TAIL = /(?<!\b(?:ke|sama|ama|dari|dr|buat|untuk))\s*[,!.]?\s+(?:kak|ka|bot|min|mimin|bang|bro|sis|gan)(\s*[!?.]*)$/;
export function trimSurface(input: string): string {
  let s = input.trim();
  if (/\p{Lu}{2}/u.test(s) && !/\p{Ll}/u.test(s)) s = s.toLocaleLowerCase('id-ID');
  const words = (x: string) => x.trim().split(/\s+/).filter(Boolean).length;
  for (let i = 0; i < 3; i++) {
    const before = s, low = s.toLocaleLowerCase('id-ID');
    const cut = low.match(OPENER) || low.match(OPENER_BARE) || low.match(ADDRESS_LEAD);
    if (cut && words(s.slice(cut[0].length)) >= 2) s = s.slice(cut[0].length).trim();
    const tail = s.match(ADDRESS_TAIL);
    if (tail && tail.index !== undefined && words(s.slice(0, tail.index)) >= 2) s = `${s.slice(0, tail.index)}${tail[1].trim()}`.trim();
    if (s === before) break;
  }
  return s;
}
/** 8.4 (post-hoc) A thing done that costs money ("barusan isi bensin", "kopi kemarin"), not a wish, a "no" or a question. */
const SPENT_WORD = /\b(?:beli|beliin|isi|bayar|bayarin|jajan|makan|minum|ngopi|nonton|naik|parkir|servis|service|potong|cukur|laundry|tadi|td|barusan|kemarin|kmrn|habis|abis|dapet|dapat|terima|nerima)\b/;
const NOT_SPENT = /\b(?:jangan|ga|gak|nggak|ngga|enggak|engga|tidak|tak|belum|blm|kan|apa|apakah|kenapa|gimana|bagaimana|siapa|mana|kapan|berapa|brp|mau|pengen|pingin|ingin|rencana|nanti|besok|aman|catatan\p{L}*|keterangan\p{L}*|kategori\p{L}*|dompet\p{L}*)\b|\?/u;
const TRANSFERISH = /\b(?:transfer|tf|kirim|pindah(?:in)?|top ?up|topup|isi saldo)\b/;
/** 8.4 Words before a name in a reply to "Siapa yang pinjam?" ("ke andi", "yg minjem nia", "namanya fajar"). */
const WHO_LEAD = /^(?:(?:ke|sama|ama|sm|dari|dr|si|namanya|nama|orangnya|itu|yang|yg)\s+)+(?:(?:minjem|pinjem|minjam|pinjam|ngutang|utang|hutang|kasbon)\s+)?/;
/** 8.3.3 After a wallet's balance: "adjust ke 564.800", "jadiin 564rb", "sesuaikan saldonya jadi 1,2jt", "ke 500rb aja". */
const SET_BALANCE = /^(?:tolong |coba )?(?:(?:adjust|adjus|sesuaikan|sesuain|samain|samakan|ubah|ganti|koreksi|update|perbarui|set|jadiin|jadikan|benerin|betulin|bikin)(?: saldo(?:nya)?)?(?: (?:ke|jadi|jd|menjadi))?|(?:saldo(?:nya)? )?(?:ke|jadi|jd|menjadi)) ((?:rp\.? ?)?\d[\d.,]*(?: ?(?:rb|ribu|k|jt|juta))?)(?: (?:aja|ya|yah|dong|deh|sih|plis|please))?[.!?]*$/;
const BALANCE_ASKED = /\b(?:saldo|isi|sisa|duit|uang|balance)\b/;
const AMOUNT_LEAD = /^(?:eh,?\s+|eh\s+salah,?\s+)?(?:ganti|ubah|jadiin|jadi(?:nya)?|bukan|salah|harusnya|seharusnya|koreksi|maksudnya|maksudku|yang bener|yg bener|benernya|nominalnya|totalnya)\b/;
const SPLIT_EDIT = /^(?:(?:di)?bagi(?:2| dua| tiga| empat| rata| \d)|patungan|split|bagi rata|50:50)\b/;
const CANCEL = /^(?:batal(?:in|kan)?|ga jadi|gak jadi|nggak jadi|ngga jadi|enggak jadi|gajadi|gk jadi|cancel|ga usah|gak usah|nggak usah|gausah|skip|lewati|hapus aja|jangan(?: dicatat)?)(?:\s+(?:deh|aja|dulu|ya))*$/;
const UNDO = /\b(?:batal(?:in|kan)?|hapus(?:in)?|undo|delete|cancel|tarik)\b.*\b(?:barusan|tadi|terakhir|sebelumnya|td)\b/;
const FOLLOW = /^(?:kalau|kalo|klo|kl|trus|terus|lalu|gimana|bagaimana|yg|yang|kalau yang|kalo yang|kalo buat|kalau buat|kalo untuk|kalau untuk|kalo di|kalau di|terus kalau|trus kalo)\s+(.+)$/;
const FRAME = /\b(?:berapa|brp|brapa|total|totalnya|saldo|pengeluaran(?:ku|nya)?|pemasukan(?:ku|nya)?|belanja(?:ku)?|habis(?:nya)?|keluar(?:nya)?|uang(?:ku)?|buat|untuk|utk|di|aku|saya|gue|ku|sih|ya|aja|dong|yang|yg|udah|sudah|selama|dalam|sampai|sampe)\b/g;
const CALC_LEAD = /^(?:hitung(?:in|kan)?|itung(?:in)?|berapa(?:kah)?|brp|brapa|kalkulator|kalkulasi|calc)\s+/;
const CALC_TAIL = /\s*(?:=|berapa|brp|ya|sih|hasilnya|jadinya|jadi berapa|itu)?\s*$/;
const CALC_AGAIN = /^(?:kalau|kalo|klo|terus|trus|lalu)?\s*((?:di)?bagi|(?:di)?kali|(?:di)?tambah|(?:di)?kurang(?:i)?|plus|minus|x|\*|\/|\+|-|÷|×)\s*(.+)$/;
const CALC_WORDS = /\b(?:dikali|dibagi|ditambah|dikurangi?|kali|bagi|tambah|kurang|plus|minus|persen|dari|setengah|separuh|sepertiga|seperempat|ribu|rebu|juta|miliar|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|puluh|ratus|belas)\b/g;
const AFFORD = /\b(?:boleh|bisa|aman|sanggup|cukup|mampu|kuat|oke|ok)\b.*\b(?:beli|beliin|jajan|belanja|ambil|checkout|co|bayar|nonton|makan|liburan|traktir|top ?up|langganan|sewa)\b|\b(?:kalau|kalo|klo)\s+(?:beli|checkout|ambil|liburan|nonton)\b.*\b(?:aman|boleh|bisa|cukup)\b|\b(?:mau|pengen|pingin|ingin)\s+(?:beli|ambil|checkout)\b.*\b(?:aman|boleh|bisa|gimana|ga|gak|nggak|enggak)\b|\b(?:beli|checkout|co|ambil)\b.*\b(?:aman|boleh|bisa|sanggup|kuat|cukup)\s*(?:kah|gak|ga|nggak|enggak|tidak|ya|gk|nggk|ngga|sih|nih)?\s*\??$|\b(?:kalau|kalo|klo)\s+(?:(?:aku|gue|saya|w)\s+)?(?:beli|checkout|ambil|liburan|nonton)\b.*\b(?:aman|boleh|bisa|cukup|gimana)\b/;
const TIPS = /\b(?:tips|tip|saran|kasih saran|cara hemat|biar hemat|gimana (?:caranya )?hemat|supaya hemat|ngirit|irit|nabung|menabung|boros|nyisihin|sisihin|menyisihkan|disiplin)\b/;
const SUMMARY = /\b(?:ringkasan|rangkuman|rekap|ikhtisar|kondisi keuangan|keadaan keuangan|status keuangan|keuangan(?:ku)? (?:gimana|bagaimana)|(?:gimana|bagaimana) keuangan(?:ku)?|cashflow|arus kas|aman (?:(?:ga|gak|nggak|enggak|tidak) )?(?:sampai|sampe) gajian|cukup (?:(?:ga|gak|nggak|enggak|tidak) )?(?:uang|duit)(?:ku)? (?:sampai|sampe) gajian)\b/;
/** Every budget at once ("anggaranku gimana", "budget mana yang mau habis"); one budget by name is a Tanya question. */
const BUDGET = /\b(?:anggaran|budget)(?:ku|nya|mu)?\b/;
const BUDGET_ASK = /\b(?:gimana|bagaimana|gmn|aman|cek|sisa|status|rekap|progress|progres|lihat|liat|semua|mana|jebol|habis|abis|over|kelewatan|lewat|tinggal|overview|pemakaian|masih|kondisi)\b/;
const PAYDAY = /\b(?:gajian|gaji(?:nya)? (?:turun|masuk|cair)|tanggal muda|payday)\b/;
const PAYDAY_ASK = /\b(?:kapan|berapa|brp|brapa|lama|dekat|deket|kurang|mundur|sisa|tanggal|tgl)\b/;
const ALLOWANCE = /\bjatah (?:harian|per ?hari|sehari)\b|\b(?:sehari|per ?hari) (?:boleh|bisa|aman)\b/;
/** Money worries: strong words alone, softer ones only next to money. */
const MOOD_STRONG = /\b(?:bokek|boke|kere|bangkrut|tanggal tua|kanker|seret|kalap|dompet tipis|dompet kering|krisis|tinggal debu|saldo (?:tipis|sekarat|kritis|kering))\b|\b(?:uang|duit)(?:ku|\s+jajan)?(?:\s+(?:gue|aku|saya|ku))?\s+(?:udah\s+|sudah\s+|dah\s+)?(?:abis|habis|ludes|tinggal\s+(?:dikit|sedikit)|menipis|sekarat|kritis)\b|\b(?:abis|habis) terus\b|\bcepet (?:abis|habis)\b|\b(?:ga|gak|nggak|tidak) punya (?:uang|duit|tabungan)\b/;
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
/** 8.5 Replies that do not change the subject: the record, list and question before them are still the ones meant. */
const LIGHT = new Set<ChatIntent>(['greet', 'thanks', 'ack', 'smalltalk', 'banter', 'joke', 'fun', 'riddle', 'swear', 'apology', 'mood', 'curhat', 'angry', 'decline']);
/** 8.5 For how many replies a record, a list or a question can still be meant ("dia kapan bayar?" three messages on). */
const REFS_LAST = 3;
/** 8.6 "kasbon pak rt 300rb": who took the advance is not said (no "ke", "dari", "aku"…). */
const KASBON_BARE = /^(?:tolong\s+)?(?:catat\s+)?kasbon\s+(?!ke\b|dari\b|sama\b|buat\b|untuk\b|aku\b|gue\b|gua\b|saya\b|lagi\b|dong\b)/;
const KASBON_ME = /^(?:aku|gue|gua|saya|w|gw)\b|\b(?:aku|gue|gua|saya)\s+(?:yang|yg)\b|\butang\b|\b(?:aku|gue|saya)\s+(?:kasbon|pinjam|pinjem|minjem|ngutang)\b/;
const KASBON_THEM = /^(?:dia|doi|beliau)\b|\b(?:dia|doi|beliau)\s+(?:yang|yg)\b|\bpiutang\b|\b(?:dia|doi)\s+(?:kasbon|pinjam|pinjem|minjem|ngutang)\b/;
const WHOLE_LIST = /\b(?:total\p{L}*|semua\p{L}*|jumlah\p{L}*)\b|\bada\s+berapa\b|\bberapa\s+(?:orang|item|biji|buah)\b/u;
/** 8.5 "bayar ke dia", "transfer ke doi", "kasih dia": the person talked about, inside a record. */
const TO_HIM = /\b(ke|sama|buat|untuk|dari|bayar|bayarin|transfer|tf|kasih|ngasih|balikin|kembaliin|minjemin|pinjemin)\s+(?:dia|doi|dianya)\b/i;
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
const YES = /^(?:iya+|ya+|yap|yup|yoi|boleh|bole|oke+|ok+|okay|sip+|gas+|gaskeun|gass+keun|gasken|ayo+|ayok|yuk+|kuy|mau|lanjut|cus+|cuss+|hayuk|hayu|siap|sikat|hajar|bener|betul|setuju|bisa|silakan|monggo|tentu|pastinya|pasti)(?:\s+(?:dong|deh|aja|ya|lah|banget|bgt|kak|min|bot|boleh|mau|yuk|gas|kok|sih))*$/;
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
  // 8.4 "saldo gopay berapa deh": the words said at the end of the first question are not part of it.
  last = `${unfill(lower(last).replace(/[?!.]+$/, ''))}${/\?\s*$/.test(last) ? '?' : ''}`;
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
  const item = t.replace(a.text, ' ').replace(/\b(?:aku|saya|gue|gw|boleh|bisa|aman|sanggup|cukup|mampu|kuat|ga|gak|nggak|enggak|tidak|kah|nih|sih|ya|dong|mau|pengen|pingin|ingin|kalau|kalo|klo|harga(?:nya)?|seharga|yang|yg|buat|untuk|oke|ok|gimana|gmn|gmna|bgt|banget|deh|dong|duitku|uangku|duit|uang)\b/g, ' ').replace(/[?!.,]/g, ' ').replace(/\s{2,}/g, ' ').trim();
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

/**
 * 10.0 "budget jajan aman ga?" when Jajan is a subcategory counted in its parent's budget (Makan & Minum): that budget is
 * named, with what the subcategory itself took, and a budget of its own is offered.
 */
function budgetUnder(t: string, ctx: ChatContext, v: Voice): ChatReply | null {
  if (!BUDGET.test(t) || !BUDGET_ASK.test(t) || namesBudget(t, ctx)) return null;
  const words = new Set(t.split(/[^\p{L}]+/u));
  const sub = ctx.data.categories.find(c => c.parentId && !c.isArchived && c.type === 'expense' && lower(c.name).split(/[^\p{L}]+/u).some(w => w.length > 2 && words.has(w)) && ctx.data.categories.some(p => p.id === c.parentId && p.type === 'expense'));
  let b = sub ? budgetsNow(ctx).find(x => x.categoryId === sub.parentId) : undefined, name = sub?.name || '', counts = (x: LedgerTx) => x.subcategoryId === sub?.id;
  // No subcategory of that name ("jajan" where Jajan is part of Makan): the category Catat otomatis files it under.
  if (!sub) {
    const said = t.match(/\b(?:budget|anggaran|bujet)(?:ku|nya)?\s+(?:buat\s+|untuk\s+)?(\p{L}{3,})/u)?.[1];
    if (!said || /^(?:aku|gue|saya|kamu|masih|sisa|aman|udah|semua|bulan|minggu|baru)$/.test(said)) return null;
    const i = ctx.inspect(`${said} 1rb`), cat = i.subcategoryId || i.categoryId;
    const parent = ctx.data.categories.find(c => c.id === cat)?.parentId;
    b = cat ? budgetsNow(ctx).find(x => x.categoryId === cat || x.categoryId === parent) : undefined;
    if (!b || lower(b.name).includes(said)) return null;
    name = said.charAt(0).toUpperCase() + said.slice(1);
    counts = x => lower(`${x.description || ''} ${x.merchant || ''}`).includes(said) || Boolean(i.subcategoryId && x.subcategoryId === i.subcategoryId);
  }
  if (!b) return null;
  let own = 0; for (const x of ctx.data.transactions) if (x.type === 'expense' && x.date >= b.start && x.date < b.end && counts(x)) own += x.amount;
  const low = lower(name), state = b.remaining >= 0 ? `masih sisa ${rp(b.remaining)} dari ${rp(b.available)}` : `sudah lewat ${rp(-b.remaining)} dari ${rp(b.available)}`;
  const text = vo(v, {
    santai: `${name} ikut anggaran ${b.name}, yang ${state}.${own ? ` ${name} sendiri periode ini ${rp(own)}.` : ''} Mau ${low} punya batas sendiri?`,
    sopan: `${name} termasuk anggaran ${b.name}, yang ${state}.${own ? ` Pengeluaran ${low} periode ini ${rp(own)}.` : ''} Ingin membuat batas khusus ${low}?`,
    singkat: `${name} masuk anggaran ${b.name}: ${state}.${own ? ` ${name} ${rp(own)}.` : ''}`,
    gaul: `${name} lo masuk anggaran ${b.name}, ${state}.${own ? ` ${name}-nya doang udah ${rp(own)}.` : ''} Mau dikasih batas sendiri?`,
    barbar: `${name} itu numpang di anggaran ${b.name}, ${state}.${own ? ` ${name} doang udah ${rp(own)}, bos.` : ''} Kasih batas sendiri aja?`,
  });
  return {
    kind: 'say', card: 'budget', title: `Anggaran ${b.name}`, text, tone: b.used >= 1 ? 'warn' : b.used >= 0.8 ? 'warn' : 'info',
    bars: [{ label: b.name, value: `${rp(b.spent)} / ${rp(b.available)}`, ratio: b.used, tone: b.used >= 1 ? 'bad' : b.used >= 0.8 ? 'warn' : 'good', note: b.remaining >= 0 ? `sisa ${rp(b.remaining)}` : `lewat ${rp(-b.remaining)}` }],
    chips: [`bikin anggaran ${low}`, `pengeluaran ${low} bulan ini berapa`, 'cek semua anggaran'],
  };
}
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

/**
 * 10.0 A word after a record saved from the chat (lib/chat/comment.ts): praise for giving, saving and paying off, a tease
 * for the same treat again and again, a warning for a big expense or a budget nearly gone; nothing for everyday records.
 * Null when there is nothing worth saying, or when the person switched comments off. `ctx.data` may or may not hold the
 * record yet (the save has only just been sent): the record is counted once either way.
 */
export function commentOnSaved(planText: string, memory: ChatMemory, ctx: ChatContext, opts: { comments?: boolean } = {}): { reply: ChatReply; memory: ChatMemory } | null {
  if (opts.comments === false) return null;
  const ins = ctx.inspect(planText);
  if (ins.reading !== 'record' || (ins.count || 1) > 1 || !ins.total) return null;
  const text = lower(planText), v = ctx.voice || 'santai', turn = memory.turn || 0;
  const kind: CommentFacts['kind'] = ins.kind === 'income' ? 'income' : ins.kind === 'debt_payment' ? 'debt' : ins.kind === 'target' || ins.kind === 'fund_contribution' ? 'saving' : ins.kind === 'expense' ? 'expense' : 'other';
  const cat = ctx.data.categories.find(c => c.id === (ins.subcategoryId || ins.categoryId)), catName = lower(cat?.name || '');
  const treat = kind === 'expense' && !GENEROUS.test(text) ? TREATS.find(([re]) => re.test(text) || re.test(catName))?.[1] : undefined;
  // How often this treat (its subcategory, or the same words) came this pay cycle and today, this one counted once.
  // The record itself may be in the ledger already (the app's data updates as soon as it is saved): it is counted once.
  const now = Date.now(), fresh = (x: { createdAt?: unknown }) => { const at = x.createdAt as { toMillis?: () => number } | null | undefined; return at === null || (typeof at?.toMillis === 'function' && now - at.toMillis() < 180_000); };
  let treatCount = 0, todayCount = 0, treatTotal = 0, already = ctx.data.transactions.some(x => x.amount === ins.total && fresh(x));
  if (treat) {
    const re = TREATS.find(([, w]) => w === treat)![0];
    const treatCats = new Set(ctx.data.categories.filter(c => c.parentId && re.test(lower(c.name))).map(c => c.id));
    if (ins.subcategoryId && re.test(catName)) treatCats.add(ins.subcategoryId);
    for (const x of ctx.data.transactions) {
      if (x.type !== 'expense' || x.date < ctx.cycle.start || x.date >= ctx.cycle.end) continue;
      // The same treat: its own subcategory (Jajan, Kopi & Minuman), or the same words ("seblak" counted with the jajan).
      const same = treatCats.has(x.subcategoryId || '') || re.test(lower(`${x.description || ''} ${x.merchant || ''}`)) || (ins.subcategoryId ? x.subcategoryId === ins.subcategoryId && treatCats.has(ins.subcategoryId) : false);
      if (!same) continue;
      treatCount++; treatTotal += x.amount; if (x.date === ctx.today) todayCount++;
      if (x.date === ctx.today && x.amount === ins.total && lower(x.description || '').split(' ')[0] === text.split(' ')[0]) already = true;
    }
    if (!already) { treatCount++; todayCount++; treatTotal += ins.total; }
  }
  // The budget this expense falls in (its category or its main category), counted with it.
  let budget: CommentFacts['budget'];
  if (kind === 'expense' && cat) {
    const b = budgetsNow(ctx).find(x => x.categoryId === cat.id || x.categoryId === cat.parentId);
    if (b) { const warnAt = (ctx.data.budgets.find(x => x.name === b.name)?.warningPercent || 80) / 100; const spent = b.spent + (already ? 0 : ins.total); budget = { name: b.name, spent, before: spent - ins.total, limit: b.available, warnAt }; }
  }
  const m = money(ctx);
  const facts: CommentFacts = { kind, amount: ins.total, text, treat, treatCount, todayCount, treatTotal, generous: GENEROUS.test(text) || /sedekah|donasi|zakat|keagamaan/.test(catName), budget, free: m.free - (kind === 'expense' && !already ? ins.total : 0) };
  if (kind === 'expense' && !facts.generous && (SAVING.test(text) || DEBT.test(text)) && !treat) facts.kind = DEBT.test(text) ? 'debt' : 'saving';
  const c = commentFor(facts, v, turn);
  if (!c) return null;
  return { reply: { kind: 'say', card: 'talk', text: c.text, tone: c.tone, chips: c.chips }, memory: { ...memory, topic: 'comment', ...(c.offer ? { offer: c.offer } : {}) } };
}

/**
 * 10.1 After a spending is saved: today's share of each budget it counts toward and what is left of it today ("jatah
 * hari ini ±Rp50.000, udah kepake Rp25.000, jadi hari ini sisa Rp25.000 ya"), in the chosen way of talking. Where a
 * share would not mean anything (today went past it, the budget is nearly or wholly used up) it says something sensible
 * instead (lib/budget-daily.ts). Nothing when no budget covers it, or when the person switched it off (Pengaturan chat →
 * Tampilkan jatah per hari).
 */
export function dailyOnSaved(planText: string, ctx: ChatContext, opts: { daily?: boolean } = {}): string | null {
  if (opts.daily === false) return null;
  const ins = ctx.inspect(planText);
  if (ins.reading !== 'record' || !ins.spent?.length) return null;
  // The record may already be in the ledger (the app's data updates as soon as it is saved): counted once.
  const now = Date.now(), fresh = (x: { createdAt?: unknown }) => { const at = x.createdAt as { toMillis?: () => number } | null | undefined; return at === null || (typeof at?.toMillis === 'function' && now - at.toMillis() < 180_000); };
  const already = ctx.data.transactions.some(x => x.amount === ins.total && fresh(x));
  const list = dailyForSpending(ctx.data as Data, ins.spent, new Date(`${ctx.today}T12:00:00`), ctx.salaryDay, !already);
  if (!list.length) return null;
  const v = ctx.voice || 'santai';
  return list.map(d => {
    const n = d.name, even = rp(d.even), per = rp(d.perDay), spent = rp(d.spentToday), sisa = rp(d.todayLeft), left = rp(d.left), days = d.days, typical = rp(d.typical), tomorrow = rp(d.tomorrow), past = rp(d.spentToday - d.perDay), over = rp(d.over);
    switch (d.state) {
      // "Jatah hari ini ±Rp50.000, udah kepake Rp25.000, jadi hari ini sisa Rp25.000 ya."
      case 'today': return d.todayLeft > 0 ? vo(v, {
        santai: `Jatah ${n} hari ini ±${per}, udah kepake ${spent}, jadi hari ini sisa ${sisa} ya.`,
        sopan: `Jatah harian ${n} hari ini ±${per}; sudah terpakai ${spent}, sehingga sisa hari ini ${sisa}.`,
        singkat: `${n}: sisa hari ini ${sisa} (jatah ±${per}).`,
        gaul: `Jatah ${n} lo hari ini ±${per}, udah kepake ${spent}, jadi sisa ${sisa} lagi ya.`,
        barbar: `Jatah ${n} hari ini ±${per}, udah lo pake ${spent}. Sisa ${sisa}, jangan lewat, bos.`,
      }) : vo(v, {
        santai: `Jatah ${n} hari ini ±${per} udah pas kepake semua. Sisanya buat besok ya.`,
        sopan: `Jatah harian ${n} hari ini ±${per} sudah terpakai seluruhnya.`,
        singkat: `${n}: jatah hari ini (±${per}) habis.`,
        gaul: `Jatah ${n} lo hari ini (±${per}) udah pas abis. Lanjut besok ya.`,
        barbar: `Jatah ${n} hari ini (±${per}) udah ludes, bos. Tahan sampai besok.`,
      });
      // Past today's share: no minus, the share from tomorrow on instead.
      case 'overToday': return days > 1 ? vo(v, {
        santai: `Hari ini ${n} udah kepake ${spent}, lewat ${past} dari jatah harian ±${per}. Santai, mulai besok jatahnya jadi ±${tomorrow}/hari biar tetap aman sampai ${days - 1} hari lagi.`,
        sopan: `Pengeluaran ${n} hari ini ${spent}, melewati jatah harian ±${per} sebesar ${past}. Mulai besok, jatahnya menjadi ±${tomorrow} per hari agar tetap aman.`,
        singkat: `${n}: hari ini lewat ${past}. Besok ±${tomorrow}/hari.`,
        gaul: `Hari ini ${n} lo udah ${spent}, lewat ${past} dari jatah ±${per}. Gapapa, besok jatahnya jadi ±${tomorrow}/hari ya.`,
        barbar: `${n} hari ini udah ${spent}, lewat ${past}, bos. Besok jatah lo cuma ±${tomorrow}/hari.`,
      }) : vo(v, {
        santai: `Hari ini hari terakhir periode ${n}, sisa anggarannya ${left}.`,
        sopan: `Hari ini hari terakhir periode ${n}; sisa anggaran ${left}.`,
        singkat: `${n}: hari terakhir, sisa ${left}.`,
        gaul: `Hari terakhir periode ${n} nih, sisa ${left}.`,
        barbar: `Hari terakhir ${n}, sisa ${left}. Abisin dengan bijak, bos.`,
      });
      // Too little to share out a day: what is left and roughly how many more times it covers.
      case 'tight': return d.times >= 1 ? vo(v, {
        santai: `Anggaran ${n} tinggal ${left} buat ${days} hari. Kalau dibagi rata cuma ±${even}/hari, jadi nggak usah dipaksa harian: sisa ini kira-kira cukup ${d.times}× lagi (sekali biasanya ±${typical}). Pakai buat yang perlu aja ya.`,
        sopan: `Sisa anggaran ${n} ${left} untuk ${days} hari. Jika dibagi rata hanya ±${even} per hari, jadi sebaiknya dianggap cukup untuk sekitar ${d.times} kali lagi (biasanya ±${typical} sekali). Gunakan untuk yang perlu saja.`,
        singkat: `${n}: sisa ${left}, cukup ±${d.times}× lagi.`,
        gaul: `Anggaran ${n} tinggal ${left} buat ${days} hari. Dibagi rata cuma ±${even}/hari, ya udah anggap aja cukup ${d.times}× lagi (biasanya ±${typical} sekali). Pake buat yang penting aja.`,
        barbar: `${n} tinggal ${left} buat ${days} hari, bos. Cukup ${d.times}× lagi doang (biasanya ±${typical}). Yang penting-penting aja.`,
      }) : d.typical > 0 ? vo(v, {
        santai: `Anggaran ${n} tinggal ${left} buat ${days} hari, udah nggak cukup buat sekali lagi (biasanya ±${typical}). Mending rem dulu, atau naikin batasnya kalau memang kebutuhan.`,
        sopan: `Sisa anggaran ${n} ${left} untuk ${days} hari, sudah tidak cukup untuk satu kali lagi (biasanya ±${typical}). Sebaiknya ditahan dulu, atau batasnya dinaikkan bila memang diperlukan.`,
        singkat: `${n}: sisa ${left}, kurang buat sekali lagi.`,
        gaul: `Anggaran ${n} tinggal ${left}, udah nggak nutup buat sekali lagi (biasanya ±${typical}). Rem dulu, atau naikin batasnya kalau emang perlu.`,
        barbar: `${n} tinggal ${left}, sekali lagi aja nggak nutup, bos. Rem, atau naikin batasnya.`,
      }) : vo(v, {
        santai: `Anggaran ${n} tinggal ${left} buat ${days} hari. Simpan buat yang perlu aja ya.`,
        sopan: `Sisa anggaran ${n} ${left} untuk ${days} hari. Gunakan untuk yang perlu saja.`,
        singkat: `${n}: sisa ${left}, ${days} hari.`,
        gaul: `Anggaran ${n} tinggal ${left} buat ${days} hari. Yang penting aja ya.`,
        barbar: `${n} tinggal ${left}, bos. Yang penting aja.`,
      });
      case 'over': return vo(v, {
        santai: `Anggaran ${n} ${d.over ? `udah lewat ${over}` : 'udah habis'}. Mending rem dulu ${days} hari ke depan, atau naikin batasnya kalau ini memang kebutuhan.`,
        sopan: `Anggaran ${n} ${d.over ? `sudah melewati batas sebesar ${over}` : 'sudah habis'}. Sebaiknya ditahan dulu ${days} hari ke depan, atau batasnya dinaikkan bila memang diperlukan.`,
        singkat: `${n}: ${d.over ? `lewat ${over}` : 'habis'}. Rem ${days} hari.`,
        gaul: `Anggaran ${n} ${d.over ? `udah jebol ${over}` : 'udah abis'}. Rem dulu ${days} hari ke depan, atau naikin batasnya kalau emang butuh.`,
        barbar: `${n} ${d.over ? `udah jebol ${over}` : 'udah ludes'}, bos. Stop dulu ${days} hari, atau naikin batasnya.`,
      });
    }
  }).join(' ');
}

/* ------------------------------------------------------------------ The reply */

export async function chatReply(input: string, memory: ChatMemory, ctx: ChatContext, depth = 0): Promise<ChatResult> {
  // Learned phrases are kept as typed (`typed`); the rules read the shorthand written out (`t`: "km bs" → "kamu bisa").
  // 8.3 Read first: words of address, English and regional words, misspelled money words (lib/chat/understand.ts).
  const raw = depth === 0 ? understand(trimSurface(input)) : input.trim(), typed = clean(raw), t = normalizeWords(typed), v: Voice = ctx.voice || 'santai', tpl = templatesFor(ctx.quick.wallets);
  // What lasts one reply only: the field asked, the offer made, the explanation, the phrase being taught.
  const mem: ChatMemory = { ...memory, asking: undefined, offer: undefined, explain: undefined, teaching: undefined, pendingQ: undefined, people: undefined, unitAsk: undefined, riddle: undefined, userRiddle: undefined, game: undefined, saving: undefined, item: undefined, start: undefined, about: undefined, list: undefined, kasbon: undefined, goal: undefined };
  const turn = (memory.turn || 0) + 1;
  // 8.5 The record and the list answered lately are kept for three replies, while the talk in between was light.
  const young = (at?: number) => at !== undefined && turn - at <= REFS_LAST;
  if (young(memory.aboutAt)) { mem.about = memory.about; mem.aboutAt = memory.aboutAt; } else mem.aboutAt = undefined;
  if (young(memory.listAt)) { mem.list = memory.list; mem.listAt = memory.listAt; } else mem.listAt = undefined;
  const questionLive = memory.last === 'question' || young(memory.questionAt);
  const finish = (r: ChatResult): ChatResult => {
    const next: ChatMemory = { ...r.memory, turn, misses: r.intent === 'unknown' ? (memory.misses || 0) + 1 : 0 };
    if (r.intent !== 'unknown' && r.intent !== 'teach') next.unknown = undefined;
    // 8.5 What was answered this turn is dated now; what was carried over stays only past light talk.
    const light = LIGHT.has(r.intent);
    if (next.about && next.aboutAt !== turn && !light) { next.about = undefined; next.aboutAt = undefined; }
    // Talking about one of the listed records keeps the list ("yang paling lama siapa?" → "dia kapan bayar?" → "kalau yang paling besar?").
    if (next.list && next.aboutAt === turn && next.about && next.list.kind === next.about.kind && next.list.ids.includes(next.about.id)) next.listAt = turn;
    if (next.list && next.listAt !== turn && next.aboutAt !== turn && !light) { next.list = undefined; next.listAt = undefined; }
    if (next.last === 'question') next.questionAt = turn; else if (!light) next.questionAt = undefined;
    // 10.2 The wallet asked about stays in mind for the next couple of messages.
    const named = walletsIn(lower(raw), ctx.quick.wallets);
    if (named.length === 1 && r.reply.kind === 'say' || named.length === 1 && r.reply.kind === 'plan' && ctx.inspect(r.reply.text).reading === 'question') next.walletTalk = named[0].name;
    else if (!light && r.intent !== 'edit' && r.intent !== 'fill' && r.reply.kind !== 'plan') next.walletTalk = undefined;
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
      // 10.2 "saldo jago berapa" → "transfer 500rb ke gopay": from the wallet just talked about.
      if (ins.kind === 'transfer' && ins.ask?.field === 'wallet' && memory.walletTalk && !opts.did && !new RegExp(`\\b${lower(memory.walletTalk)}\\b`).test(lower(text))) {
        const from = `${text.replace(/[.!]+$/, '')} dari ${lower(memory.walletTalk)}`, again = ctx.inspect(from);
        if (again.reading === 'record' && again.kind === 'transfer' && !again.ask) return plan(from, { ...opts, intro: vo(v, { santai: `Dari ${memory.walletTalk}, yang barusan kita bahas. Udah pas?`, sopan: `Dari ${memory.walletTalk}, sesuai yang baru dibahas. Apakah sudah sesuai?`, singkat: `Dari ${memory.walletTalk}.`, gaul: `Dari ${memory.walletTalk} ya, yang tadi. Udah bener?` }) });
      }
      const next: ChatMemory = { ...mem, plan: { text, status: 'pending' }, last: 'record', topic: 'record', person: ins.person ? lower(ins.person) : mem.person };
      let intro = opts.intro ?? (opts.did ? V.edited(v, opts.did) : V.confirm(v, (ins.count || 1) > 1));
      const told = (everyday?.notes || []).filter(n => /kembalian|belum diterima|belum dibayar|belum dicatat|sisa/i.test(n));
      if (told.length && !opts.intro) intro = `${told.join('. ')}. ${intro}`;
      // 10.0 The tease for the same treat again and again is said after saving (commentOnSaved), once, not on the card.
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

    /** 10.2 An amount as words Catat otomatis reads back the same ("35rb", "1,5jt", "rp12.500"). */
    function amountWord(n: number) { return n % 1_000_000 === 0 ? `${n / 1_000_000}jt` : n % 100_000 === 0 && n >= 1_000_000 ? `${String(n / 1_000_000).replace('.', ',')}jt` : n % 1000 === 0 ? `${n / 1000}rb` : `rp${n.toLocaleString('id-ID')}`; }
    /** 10.2 A card's sentence turned into income or spending, keeping its amount, wallet and day. */
    function retype(text: string, to: 'income' | 'expense') {
      const r = parseQuickPlan(text, ctx.quick).actions[0]?.result;
      if (!r || !r.amount) return text;
      const w = ctx.quick.wallets.find(x => x.id === r.preset.walletId), d = r.preset.date;
      return [to === 'income' ? 'uang masuk' : 'keluar', amountWord(r.amount), d && d !== ctx.today ? `${Number(d.slice(8))}/${Number(d.slice(5, 7))}` : '', w ? `${to === 'income' ? 'ke' : 'pakai'} ${lower(w.name)}` : ''].filter(Boolean).join(' ');
    }
    /** 10.2 A new name for what was bought ("kopi 25rb" + "namanya kopi kenangan" → "kopi kenangan 25rb"). */
    function rename(text: string, name: string) {
      const a = findAmounts(lower(text)).find(x => x.value > 0);
      if (!a) return `${name} ${text}`;
      const before = text.slice(0, a.index).trim(), words = before.split(/\s+/).filter(Boolean);
      const lead = words.length && /^(?:beli|bayar|jajan|abis|habis|keluar|makan|minum)$/i.test(words[0]) ? `${words[0]} ` : '';
      return `${lead}${name} ${text.slice(a.index).trim()}`;
    }
    /** 10.2 How a category is written on a card: its name, or "Induk › Sub" when the name alone could be read as another
     * (the same name elsewhere, or a main category whose name holds it: "Sedekah" in "Sosial & Sedekah"). */
    function categoryLabel(c: { categoryId: string; subcategoryId: string | null; name: string }) {
      if (!c.subcategoryId) return c.name;
      const parent = ctx.data.categories.find(x => x.id === c.categoryId), key = (n: string) => lower(n).replace(/&/g, ' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      const mine = key(c.name), clash = ctx.data.categories.some(x => x.id !== c.subcategoryId && !x.isArchived && (lower(x.name) === lower(c.name) || !x.parentId && mine.every(w => key(x.name).includes(w))));
      return clash && parent ? `${parent.name} › ${c.name}` : c.name;
    }
    /** 10.2 The categories to pick from, for a spending or an income (the main ones first, most used). */
    function categoryChips(kind: 'expense' | 'income') {
      const used = new Map<string, number>();
      for (const x of ctx.data.transactions) if (x.type === kind && x.categoryId) used.set(x.categoryId, (used.get(x.categoryId) || 0) + 1);
      return ctx.data.categories.filter(c => !c.isArchived && !c.parentId && c.type === kind).sort((a, b) => (used.get(b.id) || 0) - (used.get(a.id) || 0)).map(c => c.name);
    }
    function fixReply(): ChatResult | null {
      const first = pending || saved;
      if (!first) return null;
      let target = first, now = ctx.inspect(first.text);
      // A change card was the last thing saved ("eh salah, 28rb" → Simpan): the next fix is about the same record, the
      // newest record saved in this chat.
      if (!pending && now.reading === 'record' && now.kind === 'tx_update') {
        const rec = [...(memory.saves || [])].reverse().map(x => ({ x, i: ctx.inspect(x) })).find(o => o.i.reading === 'record' && (o.i.kind === 'expense' || o.i.kind === 'income'));
        if (rec) { target = { ...first, text: rec.x }; now = rec.i; }
      }
      if (now.reading !== 'record' || now.kind !== 'expense' && now.kind !== 'income') return null;
      const kind: 'expense' | 'income' = now.kind === 'income' ? 'income' : 'expense';
      const asking = pending ? memory.asking?.field : undefined;
      const f: Fix | null = readFix(raw, ctx.quick, { kind, ...(asking ? { asking } : {}), ...(memory.walletTalk ? { lastWallet: memory.walletTalk } : {}) });
      if (!f) return null;
      if (pending) {
        if (f.remove && !f.category && !f.wallet && !f.date && !f.amount) return null;
        // Without a question asked, a word alone is taken as a fix only when it is short and says nothing else.
        if (!asking && !f.cue && (words > 3 || f.amount)) return null;
        if (f.list) {
          const names = categoryChips(kind);
          return talk('fill', vo(v, { santai: `Kategori ${kind === 'income' ? 'pemasukan' : 'pengeluaran'}mu: ${names.slice(0, 10).join(', ')}${names.length > 10 ? ', dan lainnya' : ''}. Pilih salah satu, ya.`, sopan: `Kategori ${kind === 'income' ? 'pemasukan' : 'pengeluaran'} Anda: ${names.slice(0, 10).join(', ')}. Silakan pilih salah satu.`, singkat: `${names.slice(0, 10).join(', ')}.`, gaul: `Kategori lo: ${names.slice(0, 10).join(', ')}. Pilih aja satu.` }), { chips: names.slice(0, 6) }, { asking: { field: 'category', choices: names.slice(0, 6) } });
        }
        if (f.noCategory && !f.category) return plan(pending.text, { intent: 'fill', intro: vo(v, { santai: 'Oke, tanpa kategori dulu. Nanti bisa diatur di Transaksi. Udah pas? Tinggal Simpan.', sopan: 'Baik, tanpa kategori terlebih dahulu. Kategorinya dapat diatur nanti di Transaksi. Silakan Simpan bila sudah sesuai.', singkat: 'Oke, tanpa kategori.', gaul: 'Oke, tanpa kategori dulu. Ntar bisa diatur di Transaksi. Simpan aja kalau udah pas.' }) });
        if (f.unknownCategory && !f.category && !f.type) {
          const choices = memory.asking?.choices?.length ? memory.asking.choices : categoryChips(kind).slice(0, 5);
          return sayR('fill', { kind: 'say', text: vo(v, { santai: `Kategori “${f.unknownCategory}” belum ada di daftarmu. Pilih salah satu, atau buat dulu di menu Kategori:`, sopan: `Kategori “${f.unknownCategory}” belum tersedia. Silakan pilih salah satu, atau buat terlebih dahulu di menu Kategori:`, gaul: `Kategori “${f.unknownCategory}” belum ada nih. Pilih salah satu, atau bikin dulu di menu Kategori:`, singkat: `“${f.unknownCategory}” belum ada. Pilih:` }), chips: choices }, { ...mem, asking: { field: 'category', choices } });
        }
        if (f.askField && !f.category && !f.wallet && !f.date && !f.amount) {
          const field = f.askField as AskField, choices = field === 'wallet' ? ctx.quick.wallets.filter(w => !w.isArchived).slice(0, 5).map(w => w.name) : field === 'category' ? categoryChips(kind).slice(0, 5) : field === 'date' ? ['hari ini', 'kemarin'] : [];
          return talk('fill', V.ask(v, field), choices.length ? { chips: choices } : {}, { asking: { field, choices } });
        }
        // "pemasukan" for what is already income: said so, nothing changed.
        if (f.type && f.type === kind && !f.category && !f.wallet && !f.date && !f.amount && !f.name && !f.place) {
          // Said for sure now: the card no longer asks which kind it is ("35k nambah di mandiri" → "uang masuk 35k …").
          const before = parseQuickPlan(pending.text, ctx.quick).actions[0];
          let sure = pending.text;
          if (before && before.fields?.kind?.status !== 'verified') { const lead = `${kind === 'income' ? 'uang masuk' : 'keluar'} ${pending.text}`, after = parseQuickPlan(lead, ctx.quick).actions[0]; if (after?.result.kind === kind && after.fields?.kind?.status === 'verified' && after.result.amount === before.result.amount) sure = lead; }
          return plan(sure, { intent: asking ? 'fill' : 'edit', intro: vo(v, { santai: `Iya, ini udah tercatat sebagai ${kind === 'income' ? 'pemasukan' : 'pengeluaran'}. Udah pas? Tinggal Simpan.`, sopan: `Benar, ini sudah tercatat sebagai ${kind === 'income' ? 'pemasukan' : 'pengeluaran'}. Silakan Simpan bila sudah sesuai.`, singkat: `Sudah ${kind === 'income' ? 'pemasukan' : 'pengeluaran'}.`, gaul: `Iya, udah ${kind === 'income' ? 'pemasukan' : 'pengeluaran'} kok. Simpan aja kalau udah pas.` }) });
        }
        let text = pending.text; const did: string[] = [];
        const want = f.category ? f.category.type : f.type;
        if (want && want !== kind) { text = retype(text, want); did.push(want === 'income' ? 'jadi pemasukan' : 'jadi pengeluaran'); }
        if (f.category) {
          // A subcategory is written with its main one ("sosial & sedekah › sedekah") so the same name elsewhere is not picked.
          text = withCategory(text, lower(categoryLabel(f.category))); did.push(V.editCategory(v, f.category.name));
        }
        if (f.amount) { text = withAmount(text, f.amount.text, ctx.quick); did.push(V.editAmount(v, rp(f.amount.value))); }
        if (f.wallet) { text = withWallet(text, lower(f.wallet.name), ctx.quick); did.push(V.editWallet(v, f.wallet.name)); }
        if (f.date) { text = withDate(text, f.date); did.push(V.editDate(v, f.date)); }
        if (f.name) { text = rename(text, f.name); did.push(`namanya ${cap(f.name)}`); }
        if (f.place) { text = `${text.replace(/[.!]+$/, '')} di ${f.place}`; did.push(`tempatnya ${cap(f.place)}`); }
        if (!did.length || text === pending.text) return null;
        if (ctx.inspect(text).reading !== 'record') return null;
        return plan(text, { did: did.join(', '), intent: asking ? 'fill' : 'edit' });
      }
      // After Simpan: a change card for that record (or a delete), only when the message says it is a fix.
      if (!f.cue || f.list || f.noCategory) return null;
      if (f.askField && !f.category && !f.wallet && !f.date && !f.amount) return talk('edit', vo(v, { santai: `Catatan tadi udah tersimpan. Mau diubah jadi apa ${f.askField === 'wallet' ? 'dompetnya' : f.askField === 'date' ? 'tanggalnya' : f.askField === 'category' ? 'kategorinya' : 'nominalnya'}? Bilang aja, misalnya “${f.askField === 'wallet' ? 'pake gopay' : f.askField === 'date' ? 'kemarin' : f.askField === 'category' ? 'masuk makan malam' : '30rb'}”.`, sopan: `Catatan tadi sudah tersimpan. ${f.askField === 'wallet' ? 'Dompet' : f.askField === 'date' ? 'Tanggal' : f.askField === 'category' ? 'Kategori' : 'Nominal'} yang benar apa?`, singkat: 'Jadi apa?', gaul: `Yang tadi udah kesimpen. Mau diganti jadi apa?` }));
      const savedTx = parseQuickPlan(target.text, ctx.quick).actions[0]?.result;
      const ref = f.ref ? (() => {
        const mine = [...(memory.saves || []), target.text].reverse().find(x => lower(x).includes(lower(f.ref!)));
        const r = mine ? parseQuickPlan(mine, ctx.quick).actions[0]?.result : undefined;
        return `${f.ref}${r?.amount ? ` ${amountWord(r.amount)}` : ''}${!r || (r.preset.date || ctx.today) === ctx.today ? ' tadi' : ''}`;
      })() : 'transaksi terakhir';
      if (f.remove) return plan(`hapus ${ref}`, { intro: V.undoIntro(v), intent: 'undo' });
      if (f.unknownCategory && !f.category) return talk('edit', vo(v, { santai: `Kategori “${f.unknownCategory}” belum ada di daftarmu. Buat dulu di menu Kategori, lalu bilang lagi ya.`, sopan: `Kategori “${f.unknownCategory}” belum tersedia. Silakan buat terlebih dahulu di menu Kategori.`, singkat: `“${f.unknownCategory}” belum ada.`, gaul: `Kategori “${f.unknownCategory}” belum ada. Bikin dulu di menu Kategori, terus bilang lagi.` }), { chips: categoryChips(kind).slice(0, 4).map(n => `kategorinya ${lower(n)}`) });
      const parts: string[] = [];
      if (f.amount) parts.push(f.amount.text);
      if (f.wallet) parts.push(`pakai ${lower(f.wallet.name)}`);
      if (f.date) parts.push(f.date);
      const want = f.category ? f.category.type : f.type;
      if (want && want !== (savedTx?.kind === 'income' ? 'income' : 'expense')) parts.push(want === 'income' ? 'pemasukan' : 'pengeluaran');
      if (f.category) parts.push(`kategori ${lower(f.category.name)}`);
      if (!parts.length) return null;
      const said = [f.amount ? `nominalnya ${rp(f.amount.value)}` : '', f.wallet ? `dompetnya ${f.wallet.name}` : '', f.date ? `tanggalnya ${f.date}` : '', want && !f.category ? (want === 'income' ? 'jadi pemasukan' : 'jadi pengeluaran') : '', f.category ? `kategorinya ${f.category.name}` : ''].filter(Boolean).join(', ');
      return plan(`ubah ${ref} jadi ${parts.join(' ')}`, { intent: 'edit', intro: vo(v, { santai: `Catatan tadi udah tersimpan, jadi kusiapkan perubahannya: ${said}. Cek, lalu ketuk Simpan perubahan.`, sopan: `Catatan tadi sudah tersimpan. Berikut perubahannya: ${said}. Silakan periksa, lalu ketuk Simpan perubahan.`, singkat: `Ubah: ${said}.`, gaul: `Yang tadi udah kesimpen, jadi ini perubahannya: ${said}. Cek dulu, terus ketuk Simpan perubahan.` }) });
    }
    if (!t) return sayR('unknown', unknownReply(v, tpl));
    const money = findAmounts(t).some(a => a.value > 0), words = t.split(' ').length;
    const talk = (intent: ChatIntent, text: string, extra: Partial<Extract<ChatReply, { kind: 'say' }>> = {}, next: Partial<ChatMemory> = {}): ChatResult =>
      sayR(intent, { kind: 'say', card: 'talk', text, ...extra }, { ...mem, topic: intent, ...next });
    /** 10.0 A step of something set up in the chat: the card to save, or the question asked (kept for the next message). */
    /** Saving targets that fit this person's income: a tenth and a fifth of it for a year. */
    const goalSizes = () => { const income = cycleMoney(ctx).income; return income > 0 ? [short(income * 0.1 * 12), short(income * 0.2 * 12)] : []; };
    const goalReply = (step: GoalStep, going: boolean): ChatResult => {
      if (step.cancelled) return { intent: 'cancel', reply: { kind: 'say', card: 'talk', text: step.text, chips: ['bisa apa aja?'] }, memory: { ...mem, topic: 'setup', ...(pending ? { plan: { ...pending, status: 'dismissed' as const } } : {}) }, ...(pending ? { dismiss: true } : {}), by: 'rules' };
      if (step.plan) {
        // "anggaran jajan" where jajan has no budget of its own but its category has one: said plainly that this card
        // changes that budget (the card itself also reads "Ubah anggaran" with the old limit).
        const was = step.flow?.kind === 'budget' ? ctx.inspect(step.plan).replaces : undefined, word = step.flow?.slots.category || '';
        const note = was && word && !lower(was.name).includes(word) ? vo(v, {
          santai: `Catatan: ${word} masuk anggaran ${was.name} yang udah ada (${rp(was.amount)}), jadi kartu ini mengubah batas anggaran itu. Kalau maunya batas khusus ${word}, bikin lewat menu Anggaran dan pilih subkategorinya.`,
          sopan: `Catatan: ${word} termasuk anggaran ${was.name} yang sudah ada (${rp(was.amount)}), sehingga kartu ini mengubah batas anggaran tersebut. Untuk batas khusus ${word}, buat lewat menu Anggaran dan pilih subkategorinya.`,
          singkat: `Ini mengubah anggaran ${was.name} (${rp(was.amount)}).`,
          gaul: `Btw, ${word} masuk anggaran ${was.name} yang udah ada (${rp(was.amount)}), jadi ini ngubah batasnya. Mau khusus ${word}? Bikin lewat menu Anggaran terus pilih subkategorinya.`,
        }) : '';
        const r = plan(step.plan, { intent: going && pending ? 'fill' : 'setup', ...(step.text || note ? { intro: [step.text, note, V.confirm(v, false)].filter(Boolean).join(' ').trim() } : {}) });
        if (r.reply.kind === 'plan' && step.chips?.length && !r.reply.chips?.length) r.reply = { ...r.reply, chips: step.chips };
        return { ...r, memory: { ...r.memory, goal: step.flow ? { ...step.flow, card: r.reply.kind === 'plan' ? r.reply.text : step.plan } : undefined, topic: 'setup' } };
      }
      // A tujuan dana keeps the name its question had before 3.0 ("pengen nabung buat nikah" is a goal).
      return sayR(step.flow?.kind === 'fund' ? 'goal' : 'setup', { kind: 'say', card: 'talk', text: step.text, ...(step.title ? { title: step.title } : {}), ...(step.steps ? { steps: step.steps } : {}), ...(step.chips?.length ? { chips: step.chips } : {}), ...(step.open ? { open: step.open } : {}), ...(step.tone ? { tone: step.tone } : {}) }, { ...mem, goal: step.flow, topic: 'setup' });
    };
    const addNote = (r: ChatResult, note: string): ChatResult => ({ ...r, reply: r.reply.kind === 'say' ? { ...r.reply, note: [note, r.reply.note].filter(Boolean).join(' ') } : { ...r.reply, intro: [note, r.reply.intro].filter(Boolean).join(' ') } });
    /** 8.5 Whom a record is about, for "dia" later: the person of a receivable, or of a debt owed to a person. */
    const personOf = (ref: ItemRef): string => {
      if (ref.kind === 'receivable') return lower(ctx.data.receivables.find(r => r.id === ref.id)?.person || '');
      const d = ref.kind === 'debt' ? ctx.data.debts.find(x => x.id === ref.id) : undefined;
      return d ? debtPerson(d, [...(ctx.quick.people || []), ...ctx.data.receivables.map(r => r.person)].map(lower)) : '';
    };
    /** 8.3 A v3 answer as a card; a question about a period can be asked again ("kalau bulan lalu?"). */
    const v3Say = (a: Answer, asked?: string, intent?: ChatIntent): ChatResult => sayR(intent || a.intent, {
      kind: 'say', card: a.intent === 'calc' ? 'calc' : a.intent === 'tips' ? 'tips' : a.intent === 'payday' ? 'payday' : a.intent === 'module' ? 'talk' : 'summary',
      title: a.title, text: a.text, ...(a.hero ? { hero: { ...a.hero, tone: a.hero.tone === 'info' ? undefined : a.hero.tone } } : {}), ...(a.stats?.length ? { stats: a.stats } : {}), ...(a.lines?.length ? { lines: a.lines } : {}), ...(a.bars?.length ? { bars: a.bars } : {}),
      ...(a.open ? { open: a.open } : {}), ...(a.chips?.length ? { chips: a.chips } : {}), ...(a.why ? { why: a.why } : {}), tone: 'info',
    }, { ...mem, topic: intent || a.intent, saving: a.saving, item: a.item, about: a.about, ...(a.about ? { aboutAt: turn, person: personOf(a.about) || mem.person } : {}), ...(asked && a.intent === 'question' ? { question: asked, last: 'question' as const } : {}) });

    // 8.3.3 Right after a wallet's balance ("saldo mandiri brp" → Rp599.800), "adjust ke 564.800" sets that wallet's balance
    // through Catat otomatis (Perbarui saldo), the same as "saldo mandiri sekarang 564.800"; nothing is saved without a tap.
    // ("ke 564.800" is not read as an amount on its own, and a plain number needs "Rp" to be a balance, not a question.)
    const setTo = memory.last === 'question' && memory.question && !pending ? t.match(SET_BALANCE) : null;
    if (setTo && memory.question) {
      const asked = lower(memory.question), wallets = walletsIn(asked, ctx.quick.wallets), amount = setTo[1].replace(/^rp\.? ?/, '');
      if (wallets.length === 1 && BALANCE_ASKED.test(asked)) return plan(`saldo ${wallets[0].name} sekarang ${/[a-z]/.test(amount) ? amount : `Rp${amount}`}`);
    }
    // 8.4 "catat pengeluaran" → what and how much. A bare amount is kept ("75rb" → "buat apa?") until the thing comes
    // ("makan siang" → «makan siang 75rb»); the thing with its amount is a card at once. Anything else leaves it.
    const startKind = !(memory.calcPlan && memory.last === 'calc') ? readStart(t) : null;
    if (startKind) return talk('clarify', V.startAsk(v, startKind), {}, { start: { kind: startKind } });
    if (memory.start && !CANCEL.test(t) && !/\?\s*$/.test(raw)) {
      // 10.2 "dua puluh ribu" is an amount as much as "20rb".
      const start = memory.start, said = amountWords(lower(typed)), amounts = findAmounts(said).filter(a => a.value > 0);
      const rest = amounts.length ? said.replace(amounts[0].text, ' ').replace(/\b(?:rp|rb|ribu|jt|juta|k|aja|saja|deh|dong|ya|nih|sih|tuh|itu|tadi|total(?:nya)?|semua(?:nya)?|harga(?:nya)?|habis|abis|kena)\b|[,.]/g, ' ').trim() : 'x';
      const bare = amounts.length === 1 && !/\p{L}{2,}/u.test(rest);
      if (bare && start.item) return plan(`${start.item} ${amounts[0].text}`, { intent: 'fill', did: V.editAmount(v, rp(amounts[0].value)) });
      if (bare) return talk('clarify', V.startFor(v, rp(amounts[0].value), start.kind), {}, { start: { ...start, amount: amounts[0].text } });
      // 10.2 "50rb" then "masuk makan", "buat makan malam", "itu bonus": a category said with its lead words.
      if (!amounts.length && start.amount) {
        const f = readFix(raw, ctx.quick, { kind: start.kind === 'income' ? 'income' : 'expense', asking: 'category' });
        if (f?.category && f.cue) {
          const via = f.wallet ? ` ${f.category.type === 'income' ? 'ke' : 'pakai'} ${lower(f.wallet.name)}` : '';
          const card = `${f.category.type === 'income' ? 'uang masuk' : 'keluar'} ${start.amount}${via}${f.date ? ` ${f.date}` : ''} kategori ${lower(categoryLabel(f.category))}`;
          if (ctx.inspect(card).reading === 'record') return plan(card, { intent: 'fill', did: V.editCategory(v, f.category.name) });
        }
      }
      let text = amounts.length || !start.amount ? raw : `${raw.replace(/[.!]+$/, '')} ${start.amount}`;
      if (start.kind === 'income' && ctx.inspect(text).kind !== 'income' && ctx.inspect(`pemasukan ${text}`).kind === 'income') text = `pemasukan ${text}`;
      if (ctx.inspect(text).reading === 'record') return plan(text, { intent: 'fill' });
    }
    // 10.0 Something being set up in the chat: this message answers the question just asked ("makan" → the category,
    // "1,5jt" → the limit, "enaknya berapa?" → a limit from the person's own spending, "nggak jadi" → dropped).
    // 10.0 A flow goes on only while its card is still waiting (a saved or dropped card ends it; the fund's "berapa lama"
    // sum is the one question left after), and never takes a whole new record ("sedekah jumatan 20rb pakai cash") as
    // its answer.
    const flowDone = memory.goal?.card && (memory.plan?.text !== memory.goal.card || memory.plan.status !== 'pending') && !(memory.goal.kind === 'fund' && memory.goal.asking === 'monthly');
    const ownRecord = memory.goal && money && words > 2 && (() => { const i = ctx.inspect(raw); return i.reading === 'record' && i.kind !== 'budget' && Boolean(i.categoryId || i.subcategoryId); })();
    if (memory.goal && !flowDone && !ownRecord) {
      const step = continueGoal(t, memory.goal, ctx.data, ctx.today, v, goalSizes());
      if (step) return goalReply(step, true);
    }
    // 10.2 Asisten 3.5: the record waiting, or just saved, finished or fixed in everyday words ("itu masuk makan malam",
    // "buat makan malam", "pemasukan", "pakenya gopay", "dompet sama, tapi kemarin"; after Simpan a change card:
    // "masuk ke makan malam", "eh salah harusnya 28rb", "yang kopi tadi pake gopay", "hapus yang barusan").
    // 10.2 "udah, simpan" on a card: the chat never saves by itself, the button does.
    if (pending && /^(?:(?:udah|udh|dah|oke|ok|sip|yaudah|ya|iya|siap)\s*,?\s*)*(?:simpan|simpen|save|catat|catet|simpenin|simpanin|catetin)(?:\s+(?:aja|dong|ya|deh|sekarang|yuk|langsung))*$/.test(t)) return talk('ack', vo(v, { santai: 'Tinggal ketuk Simpan di kartunya, ya. Aku nggak nyimpen sendiri, biar kamu bisa cek dulu.', sopan: 'Silakan ketuk Simpan pada kartunya. Saya tidak menyimpan sendiri agar Anda dapat memeriksanya terlebih dahulu.', singkat: 'Ketuk Simpan di kartunya.', gaul: 'Tinggal pencet Simpan di kartunya. Gue ga nyimpen sendiri, biar lo cek dulu.' }));
    // 10.2 "kenapa kategorinya itu?": where the category of the card (or the record just saved) came from.
    if ((pending || saved) && /\b(?:kenapa|knp|mengapa|kok|dari\s+mana)\b/.test(t) && /\bkategori(?:nya)?\b/.test(t)) {
      const texts = [pending?.text, saved?.text, ...[...(memory.saves || [])].reverse()].filter(Boolean) as string[];
      const card = texts.map(x => parseQuickPlan(x, ctx.quick).actions[0]).find(a => a && (a.result.kind === 'expense' || a.result.kind === 'income'));
      const names = card ? [card.result.preset.subcategoryId, card.result.preset.categoryId].map(id => ctx.data.categories.find(c => c.id === id)?.name).filter(Boolean) : [];
      if (card && names.length) {
        const why = (card.fields?.category?.note || '').replace(/\s*→.*$/, '').trim();
        return talk('explain', vo(v, { santai: `Kategorinya ${names.join(' di ')}${why ? `, ${why}` : ''}. Kalau kurang pas, bilang aja, misalnya “masuk ke jajan”.`, sopan: `Kategorinya ${names.join(' pada ')}${why ? `, ${why}` : ''}. Bila kurang tepat, sampaikan saja, misalnya “masuk ke jajan”.`, singkat: `${names[0]}${why ? ` (${why})` : ''}. Salah? Bilang kategorinya.`, gaul: `Masuk ${names.join(' di ')}${why ? `, ${why}` : ''}. Ga pas? Bilang aja, misal “masuk ke jajan”.` }));
      }
    }
    const fixed = !(memory.goal && !flowDone) && depth <= 1 ? fixReply() : null;
    if (fixed) return fixed;
    // 10.2 "kantor udah ganti uang taksi meeting", "klaim … udah cair": an open claim paid out is recorded (not looked up);
    // "klaim kantor yang belum cair" is the list of those still open.
    if (!money && /\b(?:klaim|claim|reimburse|reimbursement|talangan)\b/.test(t) && /\b(?:belum|blm|belom)\s+(?:cair|dibayar|diganti|lunas|bayar|ganti|ditransfer)\b/.test(t)) { const m = readModule('klaim yang belum cair apa aja', ctx.data, ctx.today, v); if (m) return sayR('module', { kind: 'say', card: 'talk', title: m.title, text: m.text, ...(m.hero ? { hero: m.hero } : {}), ...(m.lines?.length ? { lines: m.lines } : {}), ...(m.bars?.length ? { bars: m.bars } : {}), ...(m.chips?.length ? { chips: m.chips } : {}), open: m.open }, m.list ? { ...mem, list: m.list, listAt: turn, topic: 'module' } : mem); }
    if (!money && /\b(?:cair|dicairkan|diganti|ganti|gantiin|reimburse|dibayar|ditransfer)\b/.test(t) && !/\?\s*$/.test(raw) && !/\b(?:belum|blm|belom|kapan|berapa|brp|apa)\b/.test(t)) { const c = ctx.inspect(raw); if (c.reading === 'record' && c.kind === 'claim_payment') return plan(raw); }
    // 10.2 How to use a feature, asked so it reads like a record or a setup ("cara bikin kategori baru", "pengingat nyatet
    // dimana", "sembunyiin nominal gimana"): Tanya Jawab answers first.
    // Not a way to live with money ("cara biar ga impulsif belanja", "cara supaya hemat"): that is advice, answered later.
    const howLead = (/^(?:cara(?:nya)?|gimana\s+cara(?:nya)?|bagaimana\s+cara(?:nya)?|gmn\s+cara(?:nya)?|tutorial|ajarin\s+(?:aku\s+|gue\s+)?cara)\b/.test(t) || /^(?:gimana|gmn|gmana|bagaimana)\s+(?:nambah|tambah|bikin|buat|ngapus|hapus|apus|ganti|ubah|ngubah|edit|ngedit|nyatet|nyatat|catat|pasang|masang|nyalain|matiin|sembunyiin|nyembunyiin|backup|impor|import|scan|undang|ngundang|arsipin|ngarsip|pindahin|isi|ngisi)\s+\p{L}/u.test(t))
      && !/^(?:cara(?:nya)?|gimana\s+cara(?:nya)?|bagaimana\s+cara(?:nya)?|gmn\s+cara(?:nya)?)\s+(?:biar|supaya|agar|ngatasin|mengatasi|menghindari|ngehindarin|ngurangin|mengurangi|berhenti|stop|jadi|bisa)\b/.test(t)
      && !/\b(?:hemat|boros|impulsif|irit|kaya|cuan|investasi|lunas|ngelunasin|melunasi|ngumpulin|mengumpulkan|kebanyakan)\b/.test(t);
    // Asked at the end, only with a verb of using a feature ("sembunyiin nominal gimana"), or where a feature is
    // ("pengingat nyatet dimana"): never "anggaranku gimana" or "terakhir ngopi di mana".
    const howTail = /\b(?:gimana|gmn|bagaimana)(?:\s+(?:caranya|dong|ya|sih))?\s*\??$/.test(t) && /\b(?:sembunyi\p{L}*|nyembunyi\p{L}*|pasang|masang|nyalain|matiin|hapus|apus|ngapus|edit|ngedit|kunci|ngunci|aktifin|nonaktifin|ganti\s+(?:tema|warna|pin|gaya|bahasa)|bikin\s+(?:kategori|ruang|dompet bersama|pin))\b/u.test(t)
      || /\b(?:dimana|di mana)\s*\??$/.test(t) && /\b(?:pengingat|notifikasi|notif|pin|tema|kategori|ruang bersama|dompet bersama|split bill|scan|impor|import|backup|ekspor|cadangan|pengaturan|setting)\b/.test(t);
    if (!money && !TIPS.test(t) && (howLead || howTail)) {
      const how = readHowto(t, { tail: howTail });
      if (how) return sayR('howto', { kind: 'say', card: 'help', title: how.title, text: how.text, ...(how.steps ? { steps: how.steps } : {}), ...(how.open ? { open: how.open } : {}), chips: ['cara lainnya?', 'bisa apa aja?'] });
    }
    // 10.2 "bisa ganti gaya bahasa ga", "gaya ngomongnya bisa diubah?": the ways of talking to pick from.
    if (!money && /\b(?:ganti|ubah|ngubah|ngganti|pilih|atur|setel)\s+(?:gaya|cara)\s+(?:bahasa|ngomong|bicara|chat|ngobrol)|\bgaya\s+(?:bahasa|ngomong|bicara)(?:nya)?\s+(?:bisa\s+)?(?:diganti|diubah|ganti|ubah)\b/.test(t) && !VOICE_WORDS.some(([re]) => re.test(t))) return sayR('voice', { kind: 'say', text: V.voiceAsk(v), chips: VOICE_CHIPS });
    // 10.2 "lagi satu yang sama", "sekali lagi", "sama kayak tadi" right after Simpan: the same card again.
    if (saved && !pending && /^(?:(?:oke|ok|eh|terus|trus)\s+)?(?:lagi\s+satu|satu\s+lagi|sekali\s+lagi|tambah\s+satu(?:\s+lagi)?|beli\s+lagi|catat\s+lagi|sama\s+(?:kayak|kaya|seperti)\s+tadi|yang\s+sama(?:\s+lagi)?|lagi\s+dong)(?:\s+(?:yang|yg)\s+sama)?(?:\s+(?:dong|deh|ya|aja|lagi))*$/.test(t)) return plan(saved.text, { intro: vo(v, { santai: 'Oke, satu lagi yang sama. Udah pas? Tinggal Simpan.', sopan: 'Baik, satu lagi yang sama. Silakan Simpan bila sudah sesuai.', singkat: 'Satu lagi.', gaul: 'Siap, satu lagi yang sama. Simpan aja kalau udah pas.' }) });
    // 10.2 "isi 200rb", "tambahin 500rb" right after a goal or a wish-list item was answered: money put into it.
    if (money && mem.about && (mem.about.kind === 'fund' || mem.about.kind === 'wish') && /^(?:(?:oke|ok|eh|terus|trus|yaudah)\s+)?(?:isi(?:in)?|tambah(?:in|kan)?|nambah(?:in)?|nabung|setor(?:in)?|masukin|top\s*up)\b/.test(t) && words <= 6) {
      const item = mem.about.kind === 'fund' ? ctx.data.funds.find(f => f.id === mem.about!.id)?.name : (ctx.data.wishlist || []).find(w => w.id === mem.about!.id)?.name;
      const amt = findAmounts(t).find(a => a.value > 0);
      if (item && amt) return plan(`nabung ${amt.text.trim()} ke ${lower(item)}`);
    }
    // 10.2 "yang paling deket?" after bills were asked about (as spending or as a list): the next bill due.
    if (!money && words <= 6 && /\bpaling\s+(?:deket|dekat|cepet|cepat|duluan|awal|mepet)\b/.test(t) && !mem.list && /\b(?:tagihan|langganan|rutin|cicilan|bayaran)\b/.test(lower(memory.question || ''))) {
      const m = readModule('tagihan rutin apa aja', ctx.data, ctx.today, v), pick = m?.list ? fromList(t, m.list, ctx, v) : null;
      if (pick) return v3Say(pick, undefined, 'followup');
    }
    // 10.2 "terus gimana dong", "solusinya?", "saranmu apa" after hearing about spending: what to do.
    if (!money && words <= 6 && /^(?:(?:terus|trus|lalu|jadi|nah)\s+)?(?:gimana|gmn|bagaimana)(?:\s+(?:dong|nih|ya|sih|kak|min))?\??$|^(?:solusi(?:nya)?|saran(?:nya|mu)?(?:\s+apa)?|harus\s+gimana|kudu\s+gimana|enaknya\s+gimana|terus\s+harus\s+apa)\b/.test(t) && ['summary', 'mood', 'roast', 'question', 'budget', 'payday', 'followup'].includes(memory.topic || '')) return sayR('tips', tips(ctx, v));
    // 8.4 About the record just answered: "dia kapan bayar?", "udah lunas belum?", "buat apa dulu?", "berapa?".
    // 8.6 The answer to "who took the kasbon?": "aku" (a debt) or "dia" / the name (money owed to me).
    if (memory.kasbon && !CANCEL.test(t)) {
      const { person, amount } = memory.kasbon, named = lower(person).split(/\s+/).some(w => w.length >= 2 && new RegExp(`\\b${w}\\b`).test(t) && !/^(?:pak|bu|mas|mbak|kak|bang|om|tante)$/.test(w));
      if (KASBON_ME.test(t)) return plan(`aku kasbon ke ${lower(person)} ${amount}`);
      if (KASBON_THEM.test(t) || named) return plan(`${lower(person)} kasbon ${amount}`);
    }
    if (money && depth === 0 && KASBON_BARE.test(t) && !/\b(?:ke|dari|sama|aku|gue|gua|saya)\b/.test(t)) {
      const ins = ctx.inspect(raw), amt = findAmounts(t).find(a => a.value > 0);
      if ((ins.kind === 'debt_new' || ins.kind === 'receivable_new') && ins.person && amt) {
        const who = ins.person, low = lower(who), amount = amt.text.trim();
        return talk('clarify', vo(v, { santai: `“Kasbon ${who}” bisa dua arti: ${who} yang kasbon ke kamu (piutang), atau kamu yang kasbon ke ${who} (utang)?`, sopan: `Mohon dipastikan: ${who} yang meminjam kepada Anda (piutang), atau Anda yang meminjam kepada ${who} (utang)?`, gaul: `${who} yang kasbon ke lo, apa lo yang kasbon ke ${who}?`, singkat: `${who} yang pinjam, atau kamu?`, barbar: `Yang kasbon siapa nih, ${who} apa lo?` }),
          { chips: [`${low} kasbon ${amount}`, `aku kasbon ke ${low} ${amount}`] }, { kasbon: { person: who, amount } });
      }
    }
    // 8.5 With a list still meant, "totalnya?" / "ada berapa?" is about all of it, not the one record picked from it.
    const picked = mem.list && !money ? fromList(t, mem.list, ctx, v) : null;
    if (picked && WHOLE_LIST.test(t)) return v3Say(picked, undefined, 'followup');
    const aboutIt = mem.about && !money ? aboutItem(t, mem.about, ctx, v) : null;
    if (aboutIt) return v3Say(aboutIt, undefined, 'followup');
    if (picked) return v3Say(picked, undefined, 'followup');
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
    // 8.4 Everyday things: today's date and day, the time, the data in Excel, a forgotten PIN, "undo".
    const plainQ = t.replace(START_LEAD, '').replace(/(?:\s+(?:ya|yah|sih|dong|nih|kak|min|bang|bro|sis|gan|deh|kah|ini))+$/, '').replace(/[?!.]+$/, '').trim();
    if (!money && (DATE_NOW.test(plainQ) || DAY_NOW.test(plainQ))) {
      const d = new Date(`${ctx.today}T00:00:00Z`), day = d.toLocaleDateString('id-ID', { weekday: 'long', timeZone: 'UTC' }), date = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
      const left = daysBetween(ctx.today, ctx.cycle.end);
      return talk('smalltalk', vo(v, { santai: `Hari ini ${day}, ${date}. ${left > 0 ? `Gajian ${left} hari lagi.` : 'Hari ini gajian!'}`, sopan: `Hari ini ${day}, ${date}.${left > 0 ? ` Gajian ${left} hari lagi.` : ''}`, gaul: `Sekarang ${day}, ${date}. ${left > 0 ? `Gajian ${left} hari lagi, sabar.` : 'Gajian hari ini, cuy!'}`, singkat: `${day}, ${date}.`, barbar: `${day}, ${date}. ${left > 0 ? `Gajian masih ${left} hari, tahan napsu belanja lo.` : 'Gajian hari ini, anjir!'}` }), { chips: ['sehari boleh jajan berapa', 'pengeluaran hari ini berapa'] });
    }
    if (!money && TIME_NOW.test(plainQ)) {
      const at = ctx.hour === undefined ? '' : ctx.minute === undefined ? `sekitar jam ${ctx.hour}` : `jam ${String(ctx.hour).padStart(2, '0')}.${String(ctx.minute).padStart(2, '0')}`;
      return talk('smalltalk', at ? vo(v, { santai: `Sekarang ${at}. Selamat ${partOfDay(ctx.hour)}!`, sopan: `Sekarang ${at}.`, gaul: `Sekarang ${at}, bro.`, singkat: `${cap(at)}.`, barbar: `Sekarang ${at}. Jangan begadang, anjir.` }) : 'Aku nggak bisa lihat jam di perangkatmu. Cek di pojok layar, ya.');
    }
    if (!money && EXPORT_ASK.test(t)) return talk('faq', vo(v, { santai: 'Bisa. Buka Transaksi, lalu ketuk tombol CSV di atas: seluruh riwayat terunduh dan bisa dibuka di Excel atau Google Sheets. Kalau mau cadangan lengkap untuk dipulihkan nanti, pakai Pengaturan → Data & cadangan → Unduh cadangan.', sopan: 'Bisa. Buka menu Transaksi, lalu ketuk tombol CSV di bagian atas. Seluruh riwayat akan terunduh dan dapat dibuka di Excel atau Google Sheets. Untuk cadangan lengkap, gunakan Pengaturan → Data & cadangan → Unduh cadangan.', gaul: 'Bisa! Buka Transaksi, ketuk tombol CSV di atas, semua riwayat ke-download dan bisa dibuka di Excel atau Google Sheets. Buat cadangan lengkap: Pengaturan → Data & cadangan → Unduh cadangan.', singkat: 'Transaksi → tombol CSV (bisa dibuka di Excel). Cadangan lengkap: Pengaturan → Data & cadangan.' }), { open: { view: 'transactions', label: 'Buka Transaksi' } });
    if (!money && FORGOT_PIN.test(t)) return talk('faq', vo(v, { santai: 'Tenang. Di layar kunci, ketuk “Lupa PIN? Keluar & masuk lagi”, masuk dengan password akunmu, lalu buat PIN baru di Pengaturan → Keamanan. Datamu nggak hilang.', sopan: 'Di layar kunci, ketuk “Lupa PIN? Keluar & masuk lagi”, lalu masuk dengan password akun Anda. Setelah itu buat PIN baru di Pengaturan → Keamanan. Data Anda tetap aman.', gaul: 'Santai. Di layar kunci ketuk “Lupa PIN? Keluar & masuk lagi”, login pakai password akun lo, terus bikin PIN baru di Pengaturan → Keamanan. Data lo aman.', singkat: 'Layar kunci → “Lupa PIN? Keluar & masuk lagi” → masuk dengan password → buat PIN baru di Pengaturan → Keamanan.' }), { open: { view: 'settings', label: 'Buka Pengaturan' } });
    if (!pending && /^(?:undo|ctrl\s*z|batal(?:in|kan)?\s+(?:catatan|transaksi)\s+(?:barusan|terakhir|tadi))$/.test(plainQ)) return plan('hapus transaksi terakhir', { intro: V.undoIntro(v), intent: 'undo' });
    // The assistant asked "mau …?": "boleh" sends what it offered, "nggak" declines.
    if (memory.offer && YES.test(t)) return chatReply(memory.offer, mem, ctx, 1);
    if (memory.offer && NO.test(t)) return talk('decline', P.decline(v, turn));
    // 10.0 Answering the assistant's comment on a record ("iya iya maaf", "hehe iya deh"): taken kindly, its offer kept.
    if (memory.topic === 'comment' && !money && words <= 8 && AFTER_COMMENT.test(t) && !readGoal(t, ctx.data, ctx.today, v)) { const a = afterComment(v, turn, memory.offer); return talk('banter', a.text, { chips: a.chips }, { ...(memory.offer ? { offer: memory.offer } : {}), topic: 'comment' }); }
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
    // 8.5 "bayar ke dia 500rb", "transfer ke doi 200rb": the person inside a record with an amount.
    if (!he && money && memory.person && depth === 0 && TO_HIM.test(raw)) return chatReply(raw.replace(TO_HIM, (_m, verb: string) => `${verb} ${memory.person}`), mem, ctx, 1);
    if (SELF_HARM.test(t)) return talk('curhat', safety(v), { tone: 'warn' }, { curhat: (memory.curhat || 0) + 1, serious: true });
    // 8.0 Riddles: the guess at the assistant's riddle; the person's own riddle (its question, then its punchline).
    if (memory.riddle !== undefined && RIDDLES[memory.riddle] && !money && words <= 8 && !CANCEL.test(t)) return talk('riddle', riddleAnswer(v, RIDDLES[memory.riddle], t, turn), { chips: ['tebak-tebakan lagi', 'kasih jokes dong'] }, { topic: 'joke' });
    if (memory.userRiddle === 'question' && !money && words <= 20) return talk('riddle', guessUserRiddle(v, turn), {}, { userRiddle: 'answer', topic: 'joke' });
    if (memory.userRiddle === 'answer' && !money && words <= 20) return talk('banter', laughAtJoke(v, turn), { chips: ['gantian aku kasih tebakan', 'tebak-tebakan lagi'] }, { topic: 'joke' });
    // 8.1 Games: a move in the one going on, or a new one ("suit yuk", "lempar koin", "pilihin dong, A atau B?").
    // A number is a guess in tebak angka, and a range for "angka acak 1 sampai 100", not an amount.
    const gameNumbers = memory.game?.kind === 'angka' && /^(?:angka\s+)?\d{1,2}$/.test(t) || /\b(?:angka|nomor|number)\s+(?:acak|random)\b|\brandom\s+(?:angka|nomor|number)\b|\bacak\s+angka\b/.test(t);
    // 10.0 "mending deposito atau saham" is a money question, never a coin flip.
    const moneyChoice = /\b(?:investasi|invest|saham|reksa\s*dana|reksadana|deposito|obligasi|sbn|crypto|kripto|bitcoin|emas|nabung|tabungan|cicilan|kredit|paylater|utang|hutang|asuransi)\b/.test(t) && !memory.game;
    const game = (!money || gameNumbers) && words <= 14 && !moneyChoice ? readGame(t, raw, v, turn, memory.game) : null;
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
    // ("uang yang bener-bener bisa dipakai berapa" is a question about money, not "serius dong".)
    if (SERIOUS.test(t) && !money && !readAnswer(t, ctx, v)) {
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
    if (!money && /\b(?:aku|gue|gw|saya)\s+(?:boros|hemat)\s+(?:(?:banget|bgt|parah|amat|sekali)\s+)?(?:ga|gak|nggak|ngga|enggak|tidak|nggk)\b|\bboros\s+(?:ga|gak|nggak|ngga)\s+(?:sih\s+)?(?:aku|gue|gw|saya)\b/.test(t) && !/\b(?:roast|rosting|ejek|ledek|katain|hina|sindir)/.test(t)) {
      const r = summary(raw, ctx, v);
      if (r.kind === 'say') return sayR('summary', { ...r, title: 'Boros atau hemat?', text: roast(v, roastData(), rp, turn), chips: ['roasting pengeluaranku', 'kasih tips hemat'] }, { ...mem, topic: 'summary', offer: 'kasih tips hemat' });
    }
    if (!money && ROAST.test(t)) return sayR('roast', { kind: 'say', card: 'talk', text: roast(v, roastData(), rp, turn), chips: ['kasih tips hemat', 'pengeluaran terbesar bulan ini'] }, { ...mem, topic: 'roast', offer: 'kasih tips hemat', serious: false });
    if (JOKE.test(t) && !money) return tellJoke();
    // 10.0 What the person wants to set up or use, however it is written ("budgeting baru", "set limit jajan 500rb",
    // "nambah rekening", "pengen mulai nabung", "patungan makan sama temen"): asked in the chat, with a button to the form.
    // A feature asked how to use ("gimana cara pasang pin") is answered by Tanya Jawab further on, as before.
    const setup = readGoal(t, ctx.data, ctx.today, v, goalSizes());
    if (setup && !(setup.open && !setup.flow && !setup.plan && !setup.steps && !money && /\b(?:cara|caranya|gimana|bagaimana)\b/.test(t) && readHowto(t))) return goalReply(setup, false);
    // 10.0 Advice for real life and the feature that fits ("uang tinggal 300rb sampai gajian", "gaji 5jt dibagi gimana",
    // "aku sering lupa nyatet", "kok uangku cepet abis"), from the person's own records where it can be.
    const missing = !money ? budgetMissing(t, ctx.data, ctx.today, ctx.cycle.start, v) : null;
    if (missing) return goalReply(missing, false);
    const under = !money ? budgetUnder(t, ctx, v) : null;
    if (under) return sayR('budget', under, { ...mem, topic: 'budget', offer: under.chips?.[0] });
    // Telling why one is upset ("lagi stres" → "soalnya duit abis buat bayar kos") stays a talk about the mood.
    const advice = memory.topic === 'curhat' || memory.topic === 'mood' ? null : readAdvice(t, ctx, v);
    if (advice) return sayR('tips', { kind: 'say', card: 'tips', title: advice.title, text: advice.text, ...(advice.steps ? { steps: advice.steps } : {}), ...(advice.chips?.length ? { chips: advice.chips } : {}), ...(advice.open ? { open: advice.open } : {}), tone: advice.tone || 'info' }, { ...mem, topic: 'advice', ...(advice.offer ? { offer: advice.offer } : {}) });
    // 8.0 Opening a menu ("buka wishlist", "tunjukin laporan") before anything reads it as a question.
    const opening = !money && opensMenu(t) ? readModule(t, ctx.data, ctx.today, v) : null;
    if (opening) return sayR('module', { kind: 'say', card: 'talk', title: opening.title, text: opening.text, open: opening.open });
    // 8.0 Laughing along, as loud as the person laughs.
    const laugh = !money && words <= 8 && !CURHAT.test(t) && !FLAT.test(t) ? readLaugh(raw) : null;
    if (laugh && laugh.rest.split(' ').filter(Boolean).length <= 4) return talk('banter', laughBack(v, laugh, turn, memory.topic === 'joke' || memory.topic === 'riddle'), { chips: ['lagi dong', 'tebak-tebakan dong', 'ringkasan bulan ini'] }, { serious: false, topic: memory.topic === 'joke' ? 'joke' : 'banter' });
    if (!money && BANTER.test(t) && words <= 8 && !CURHAT.test(t)) return talk('banter', P.banter(v, turn, FLAT.test(t)), { chips: ['lagi dong', 'ringkasan bulan ini'] }, { serious: false });
    if (!money && (memory.topic === 'joke' || memory.topic === 'banter') && ACK.test(t) && /\b(?:wk|ha|he|hi)/.test(t)) return talk('banter', P.banter(v, turn, false), { chips: ['lagi dong'] });

    // 8.3 Worked out here: Uang bebas, the daily allowance, a share, spending per category, where to cut, the health
    // score, one debt/receivable/goal/wish/bill/claim by name (and "kalau dimas?" after one). Before small talk, so
    // "liburan bali kapan kekumpul" is about the goal, not the holiday.
    // With a record waiting, a message without a question word is about that record ("udah kebeli barusan pakai jenius").
    // 8.6 "rekap bulan lalu" opens the Rekap; "kenapa minggu ini boros?" compares the last 7 days with the weeks before.
    // The summary it always gave stays ("rekap bulan ini" → Ringkasan), now with the button to the Rekap slides.
    const rekap = !money ? rekapAsk(t, ctx, v) : null;
    if (rekap) {
      const summary = depth === 0 ? await chatReply(t.replace(/\b(?:rekap(?:an|nya)?|recap|wrapped|kilas balik)\b/, 'ringkasan'), mem, ctx, 1) : null;
      if (summary?.intent === 'summary' && summary.reply.kind === 'say') return { ...summary, reply: { ...summary.reply, open: rekap.open, chips: rekap.chips, note: [summary.reply.note, `${rekap.title} lengkapnya (kategori, tempat favorit, hari paling boros) ada di tombol di bawah.`].filter(Boolean).join(' ') } };
      return v3Say(rekap, undefined, 'module');
    }
    const week = !money ? weekAsk(t, ctx, v) : null;
    if (week) return v3Say(week, undefined, 'module');
    const answer = pending && !/\b(?:berapa|brp|apa|kapan|siapa|gimana|mana|seberapa)\b|\?/.test(t) ? null : readAnswer(t, ctx, v, { item: memory.item });
    if (answer) return v3Say(answer, t);
    // 8.1 Everyday talk: kind words, news to celebrate, the day (hungry, rain, weekend).
    const chat = !money && words <= 12 ? readTalk(t, v, turn) : null;
    if (chat) return talk('smalltalk', chat.text, chat.chips ? { chips: chat.chips } : {}, chat.offer ? { offer: chat.offer } : {});
    const greetLead = t.match(GREET_LEAD), rest = greetLead?.[1].replace(/[?!.]+$/, '').trim();
    const greetMore = rest && rest.split(' ').length <= 4 && !findAmounts(rest).length && !['record', 'question'].includes(ctx.inspect(rest).reading);
    // 8.4 The part of the day the person said is the one said back ("pagi min" → "Selamat pagi", "good night" → "malam").
    const saidPart = t.match(/\b(pagi|siang|sore|malam|malem|morning|afternoon|evening|night)\b/)?.[1], part = saidPart ? ({ morning: 'pagi', afternoon: 'siang', evening: 'malam', night: 'malam', malem: 'malam' } as Record<string, string>)[saidPart] || saidPart : partOfDay(ctx.hour);
    if (GREET.test(t) || greetMore) return sayR('greet', { kind: 'say', text: V.greet(v, part, name), chips: [tpl[0].items[0], 'ringkasan bulan ini', 'bisa apa aja?'] });
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

    // 8.3 Saving sums ("nabung 500rb sebulan kapan dapet 10jt"), worked out and never recorded; "kalau 1jt per bulan?" after.
    const saving = readSaving(t, ctx.today, v, memory.saving);
    if (saving) return v3Say(saving);
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
    // 8.4 A transfer finished in the next message: "ke gopay" is where it goes, "dari jago" where it comes from.
    if (pending && t.split(' ').length <= 5 && TRANSFERISH.test(lower(pending.text))) {
      const dir = t.match(/^(?:terus\s+|lalu\s+)?(ke|kirim ke|masuk ke|masukin ke|dari|dr|pakai|pake)\s+/), w = dir ? walletsIn(t, ctx.quick.wallets)[0] : undefined;
      if (dir && w) { const from = /^(?:dari|dr|pakai|pake)$/.test(dir[1]); return plan(`${pending.text} ${from ? 'dari' : 'ke'} ${lower(w.name)}`, { did: from ? V.editWallet(v, w.name) : `tujuannya ${w.name}`, intent: memory.asking ? 'fill' : 'edit' }); }
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
    if (!money && ENOUGH_TILL_PAYDAY.test(t) || !money && /\b(?:perkiraan|prediksi|proyeksi|estimasi|kira[-\s]?kira|forecast)\b.*\b(?:akhir\s+(?:bulan|siklus)|sisa|uang|saldo|gajian|nanti)\b|\bakhir\s+(?:bulan|siklus)\b.*\b(?:sisa|tinggal|masih)\b|\b(?:sisa|tinggal)\s+(?:uang|duit)\s*(?:aku|gue|saya|ku)?\s+(?:pas|waktu|saat)\s+gajian\b/.test(t)) {
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
    if (module) return sayR('module', { kind: 'say', card: 'talk', title: module.title, text: module.text, ...(module.hero ? { hero: module.hero } : {}), ...(module.lines?.length ? { lines: module.lines } : {}), ...(module.bars?.length ? { bars: module.bars } : {}), ...(module.chips?.length ? { chips: module.chips } : {}), open: module.open }, module.list ? { ...mem, list: module.list, listAt: turn, topic: 'module' } : mem);
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
      // 8.4 Who borrowed or lent ("andi", "ke andi", "yg minjem nia", "sama om heru").
      if ((asking.field === 'borrower' || asking.field === 'lender') && !amount && !w && /\p{L}/u.test(t) && !CANCEL.test(t)) {
        const who = unfill(t.replace(WHO_LEAD, '').replace(WHO_LEAD, '')).replace(/[.!?]+$/, '');
        if (who) return plan(`${pending.text} ke ${who}`, { did: asking.field === 'borrower' ? `${cap(who)} yang pinjam` : `pinjam ke ${cap(who)}`, intent: 'fill' });
      }
      if (asking.field === 'category' && !amount && !date && /\p{L}/u.test(t) && !CANCEL.test(t)) {
        const cat = unfill(t.replace(/^(?:kategori(?:nya)?|masuk(?:in)?(?:\s+ke)?)\s+/, '')), next = withCategory(pending.text, cat), read = ctx.inspect(next);
        // 8.4.1 A category not in the list is said so (the card stays as it was); the answer never makes a new category.
        if (read.reading !== 'record' || read.kind === 'category_new' || read.ask?.field === 'category') return sayR('fill', { kind: 'say', text: vo(v, { santai: `Kategori “${cat}” belum ada di daftarmu. Pilih salah satu, atau buat dulu di menu Kategori:`, sopan: `Kategori “${cat}” belum tersedia. Silakan pilih salah satu, atau buat terlebih dahulu di menu Kategori:`, gaul: `Kategori “${cat}” belum ada nih. Pilih salah satu, atau bikin dulu di menu Kategori:`, singkat: `“${cat}” belum ada. Pilih:` }), chips: asking.choices }, { ...mem, asking });
        return plan(next, { did: V.editCategory(v, cat), intent: 'fill' });
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
    // 8.4 Right after a spending total: "rinciannya dong", "yang paling besar apa?", "dibanding sebelumnya gimana?",
    // "kenapa banyak banget" — about the period that question named.
    if (mem.question && questionLive && !money && words <= 7) {
      const asked = lower(mem.question), totalAsked = SPEND_ASKED.test(asked) || INCOME_ASKED.test(asked);
      const more = !totalAsked ? null : MORE_WHY.test(t) && SPEND_ASKED.test(asked) ? 'why' : MORE_COMPARE.test(t) ? 'compare' : MORE_BIGGEST.test(t) && SPEND_ASKED.test(asked) ? 'biggest' : MORE_BREAKDOWN.test(t) && SPEND_ASKED.test(asked) ? 'breakdown' : null;
      const said = readPeriod(asked, ctx.today, ctx.salaryDay)?.said || '';
      const a = more === 'breakdown' ? readAnswer(`rincian pengeluaran ${said}`.trim(), ctx, v) : more ? spendingMore(more, asked, ctx, v) : null;
      if (a) return v3Say(a, undefined, 'followup');
    }
    // The last question again, with a new period or subject.
    if (mem.question && (questionLive || readPeriod(t, ctx.today, ctx.salaryDay))) {
      const f = t.match(FOLLOW), onlyPeriod = readPeriod(t, ctx.today, ctx.salaryDay);
      // 7.9 "makan siang aja, kopi jangan": the subject narrowed.
      const only = questionLive ? t.match(/^([\p{L}\s]{3,30}?)\s+(?:aja|saja|doang)(?:\s*,\s*[\p{L}\s]+?\s+(?:jangan|ga usah|gak usah|nggak usah|nggak|gak|enggak))?$/u) : null;
      // 8.3 "kalau bulan lalu? sih": the words around the new period or subject are not part of it.
      const rest = (f ? f[1] : only ? only[1] : onlyPeriod && unfill(t.replace(onlyPeriod.said, ' ')).replace(/[\s?!.]/g, '') === '' ? t : '').replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\b(?:sih|dong|ya|deh|nih|kak|min|bot|gimana|berapa|brp)\b/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (rest && ctx.inspect(t).reading !== 'record' && !findAmounts(t).some(a => a.marked)) {
        const q = askAgain(mem.question, rest, ctx.today, ctx.salaryDay);
        // 8.3 A question the chat answers itself (a share, spending per category) is answered again here.
        const again = q !== lower(mem.question) ? readAnswer(q, ctx, v) : null;
        if (again) return v3Say(again, q, 'followup');
        if (q !== lower(mem.question)) return { intent: 'followup', reply: { kind: 'plan', text: q }, memory: { ...mem, question: q, last: 'question' }, by: 'rules' };
      }
    }
    // Calculator.
    const lead = CALC_LEAD.test(t), body = t.replace(CALC_LEAD, '').replace(CALC_TAIL, '');
    const c = calculate(body);
    if (c && (lead || !/\p{L}{3,}/u.test(body.replace(CALC_WORDS, '')))) return sayR('calc', calcReply(c, false, v), { ...mem, number: c.value, last: 'calc' });

    if (/^(?:buka|lihat|liat|ke|pergi ke|masuk ke)\s+/.test(t)) return plan(raw);
    if (AFFORD.test(t)) { const r = afford(raw, ctx, v); return sayR('afford', r || { kind: 'say', text: V.needPrice(v) }); }
    // 10.2 "iphone 16 bagus ga ya": a model number is no amount; whether a thing is good is not something to judge here,
    // whether it fits the money is (with its price).
    if (/\d/.test(t) && /\b(?:bagus|worth(?:\s+it)?|layak|recommended|rekomen(?:ded)?|mantap)\s+(?:ga|gak|nggak|enggak|ngga|gk|engga|kah|tidak|ya)\b/.test(t) && findAmounts(t).every(a => a.value < 1000)) return sayR('afford', { kind: 'say', text: vo(v, { santai: `Bagus atau nggaknya barang, aku nggak bisa nilai. Tapi aku bisa cek aman nggak buat dompetmu. ${V.needPrice(v)}`, sopan: `Kualitas barangnya tidak dapat saya nilai, namun saya dapat memeriksa apakah aman untuk keuangan Anda. ${V.needPrice(v)}`, singkat: V.needPrice(v), gaul: `Bagus apa nggaknya gue ga bisa nilai, tapi bisa gue cek aman ga buat dompet lo. ${V.needPrice(v)}` }) });
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
    // 8.3 "total kopi bulan ini", "pengeluaran di shell bulan kemarin": a period and a subject, asked without "berapa".
    const period = !money ? readPeriod(t, ctx.today, ctx.salaryDay) : null;
    // A subject alone only with a span of days ("transport bulan ini"): "kopi kemarin" or "tolnya kemarin" may be a record.
    if (period) {
      const rest = t.replace(period.said, ' ').replace(/\b(?:dong|ya|sih|deh|nih|kak|min)\b/g, ' ').replace(/[?!.]/g, ' ').replace(/\s{2,}/g, ' ').trim();
      const asked = `${raw.replace(/[?!.]+$/, '').replace(/\s+(?:dong|ya|sih|deh|nih|kak|min)$/i, '')} berapa`;
      if ((/^(?:total|pengeluaran|jumlah)\b/.test(rest) || daysBetween(period.start, period.end) > 1 && rest.split(' ').length <= 4 && spendingShare(rest, ctx.quick, period)) && ctx.inspect(asked).reading === 'question') return plan(asked);
    }
    // Still venting: what follows is listened to as well ("dia ninggalin aku").
    if (memory.topic === 'curhat' && !money && words <= 25) return listen();

    // 8.4 (post-hoc) Something that would be a record with an amount ("barusan isi bensin"): how much? The next
    // message finishes it ("45 ribu" → «barusan isi bensin 45 ribu»).
    if (!money && words >= 2 && words <= 8 && ins.reading === 'none' && SPENT_WORD.test(t) && !NOT_SPENT.test(t)) {
      const probe = ctx.inspect(`${raw.replace(/[.!?]+$/, '')} 10rb`);
      if (probe.reading === 'record' && (probe.kind === 'expense' || probe.kind === 'income') && probe.subcategoryId) return talk('clarify', V.ask(v, 'amount'), {}, { start: { kind: probe.kind, item: raw.replace(/[.!?]+$/, '') } });
    }
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
      // 10.2 A fix the rules could not read (or with no card to fix): what can be changed, and how to say it.
      case 'fix': {
        // Only with a word a fix is said with (the model alone is not enough: "berapa sebulan" is no fix).
        if (money || !FIX_WORDS.test(t)) break;
        const ex = '“kategorinya makan malam”, “pake gopay”, “jadi 30rb”, atau “kemarin”';
        if (pending || saved) return model(talk('edit', vo(v, { santai: `Mau ubah bagian mana dari ${saved ? 'catatan tadi' : 'kartu ini'}? Bilang langsung aja, misalnya ${ex}.`, sopan: `Bagian mana yang ingin diubah? Silakan sampaikan langsung, misalnya ${ex}.`, singkat: 'Ubah apa? Kategori, dompet, nominal, atau tanggal?', gaul: `Mau ganti yang mana nih? Langsung aja, misal ${ex}.` }), { chips: ['ubah kategorinya', 'ubah dompetnya', 'ubah nominalnya', 'ubah tanggalnya'] }));
        return model(talk('clarify', vo(v, { santai: 'Belum ada catatan yang lagi kita bahas nih. Ketik catatannya lengkap aja, misalnya “makan malam 45rb pake gopay”. Kalau mau ubah yang udah tersimpan, bilang misalnya “ubah transaksi terakhir jadi kategori makan malam”.', sopan: 'Belum ada catatan yang sedang dibahas. Silakan ketik catatannya lengkap, misalnya “makan malam 45rb pakai gopay”. Untuk mengubah yang sudah tersimpan, misalnya “ubah transaksi terakhir jadi kategori makan malam”.', singkat: 'Belum ada catatan. Ketik lengkap, misal “makan malam 45rb pake gopay”.', gaul: 'Belum ada catatan yang lagi dibahas nih. Ketik lengkap aja, misal “makan malam 45rb pake gopay”. Mau ubah yang udah kesimpen? Bilang “ubah transaksi terakhir jadi kategori makan malam”.' }), { chips: ['transaksi terakhir apa?', 'contoh'] }));
      }
      // 10.2 "kalau bulan lalu?" with nothing asked before it: what about it, with the questions to pick from.
      case 'followup': {
        if (money || !FOLLOW_WORDS.test(t)) break;
        const about = t.replace(/^(?:(?:eh|min|bot|kak|bro|terus|trus|lalu|nah|oke|ok)\s*,?\s+)*(?:kalau|kalo|klo|kl|gimana\s+kalau|gimana\s+kalo|gmn\s+kalo)\s+(?:yang\s+|yg\s+)?/, '').replace(/[?!.,]+/g, ' ').replace(/\b(?:ya|dong|sih|deh|nih|gimana|gmn|berapa|brp)\b/g, ' ').replace(/\s+/g, ' ').trim();
        const named = about !== t.replace(/[?!.,]+/g, ' ').replace(/\s+/g, ' ').trim() && about && about.split(' ').length <= 4;
        if (named) {
          const period = readPeriod(about, ctx.today, ctx.salaryDay);
          const chips = period ? [`pengeluaran ${about}`, `pemasukan ${about}`, `ringkasan ${about}`] : [`pengeluaran ${about} bulan ini`, `sisa anggaran ${about}`, `kapan terakhir ${about}`];
          return model(talk('clarify', vo(v, { santai: `Kalau ${about} apanya nih? Pilih di bawah, atau tanya lengkap ya.`, sopan: `Mengenai ${about}, yang ingin diketahui apa? Silakan pilih, atau tanyakan dengan lengkap.`, singkat: `${cap(about)}: yang mana?`, gaul: `${cap(about)} apanya nih? Pilih aja, atau tanya lengkap.` }), { chips }));
        }
        return model(talk('clarify', vo(v, { santai: 'Maksudnya yang mana nih? Tanya lengkap aja ya, misalnya “pengeluaran kopi bulan ini berapa”.', sopan: 'Mohon maaf, maksudnya yang mana? Silakan tanyakan dengan lengkap, misalnya “pengeluaran kopi bulan ini berapa”.', singkat: 'Yang mana? Tanya lengkap ya.', gaul: 'Yang mana nih? Tanya lengkap aja, misal “pengeluaran kopi bulan ini berapa”.' }), { chips: ['ringkasan bulan ini', 'contoh'] }));
      }
      // 10.2 How to use a feature, when the rules did not see it as one: the guide, or where all guides are.
      case 'howto': {
        if (money || !HOW_WORDS.test(t)) break;
        const how = readHowto(t, { tail: true });
        if (how) return model(sayR('howto', { kind: 'say', card: 'help', title: how.title, text: how.text, ...(how.steps ? { steps: how.steps } : {}), ...(how.open ? { open: how.open } : {}), chips: ['cara lainnya?', 'bisa apa aja?'] }));
        return model(sayR('howto', { kind: 'say', card: 'help', title: 'Cara pakai', text: vo(v, { santai: 'Aku belum nemu panduan persisnya. Coba sebut nama fiturnya, misalnya “cara bikin anggaran” atau “cara pasang pengingat”. Semua panduan ada di Tanya Jawab.', sopan: 'Panduan yang tepat belum ditemukan. Silakan sebut nama fiturnya, misalnya “cara membuat anggaran”. Seluruh panduan tersedia di Tanya Jawab.', singkat: 'Sebut fiturnya, misal “cara bikin anggaran”. Lengkapnya di Tanya Jawab.', gaul: 'Panduannya belum ketemu nih. Sebut fiturnya aja, misal “cara bikin anggaran”. Semua panduan ada di Tanya Jawab.' }), open: { view: 'help', label: 'Tanya Jawab' }, chips: ['cara bikin anggaran', 'bisa apa aja?'] }));
      }
      // 10.2 Asked to play: the games in the chat.
      case 'game': {
        if (money || !PLAY_WORDS.test(t)) break;
        const g = readGame('main game yuk', 'main game yuk', v, turn, undefined);
        if (g) return model(talk('game', g.text, { chips: g.chips || [] }, { game: g.game, topic: 'game', serious: false }));
        break;
      }
      // 7.9: deleting or dropping only when the message says so (never "catatannya lembur" or "yang tadi kemarin ya").
      case 'undo': if (/\b(?:di)?(?:batal(?:in|kan)?|hapus(?:in|kan)?|apus(?:in)?|cancel)\b|\b(?:undo|delete|tarik)\b/.test(t)) return { ...plan('hapus transaksi terakhir', { intro: V.undoIntro(v), intent: 'undo' }), by: 'model' }; break;
      case 'cancel': if (pending && /\b(?:di)?(?:batal(?:in|kan)?|hapus(?:in)?|cancel)\b|\b(?:gak jadi|ga jadi|nggak jadi|gajadi|skip|jangan|gausah|ga usah|gak usah|nggak usah)\b/.test(t)) return { intent: 'cancel', reply: { kind: 'say', text: V.cancel(v) }, memory: { ...mem, plan: { ...pending, status: 'dismissed' } }, dismiss: true, by: 'model' }; break;
    }
    // 8.4 (post-hoc) An amount alone, with nothing for it to belong to ("45 ribu"): what was it for?
    const alone = money && !pending ? findAmounts(lower(typed)).filter(a => a.value > 0) : [];
    if (alone.length === 1 && !/\p{L}{3,}/u.test(lower(typed).replace(alone[0].text, ' ').replace(/\b(?:rp|rb|ribu|jt|juta|aja|saja|deh|dong|ya|nih|sih|tadi|kak|min)\b/g, ' '))) return talk('clarify', V.startFor(v, rp(alone[0].value), 'any'), {}, { start: { kind: 'any', amount: alone[0].text } });
    if (money) return plan(raw);
    // The second message in a row not understood: the person can teach it.
    if ((memory.misses || 0) >= 1) return { intent: 'unknown', reply: { kind: 'say', card: 'talk', text: P.teachOffer(v), chips: ['ajari aku', ...unknownReply(v, tpl).chips!.slice(0, 2)] }, memory: { ...mem, unknown: raw, offer: 'ajari aku' }, by: 'rules' };
    return { intent: 'unknown', reply: unknownReply(v, tpl, ins.reading === 'unanswered'), memory: { ...mem, unknown: raw }, by: 'rules' };
  }
}
