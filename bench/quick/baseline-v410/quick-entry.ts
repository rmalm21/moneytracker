/**
 * "Catat otomatis": one line of everyday Indonesian becomes a transaction, a record, or an entry in any menu.
 *   "beli pocari 8rb di alfa"          → Pengeluaran Rp8.000, Pocari, Alfamart, Makan & Minum
 *   "gaji 7,5jt masuk bca"             → Pemasukan Rp7.500.000 to BCA
 *   "tf 200rb dari bca ke gopay"       → Transfer
 *   "pinjam 500rb dari budi"           → Utang baru to Budi
 *   "bayar cicilan laptop 500rb"       → Bayar utang (the open debt "Cicilan laptop")
 *   "pinjemin andi 100rb" / "andi pinjam 100rb" / "bayarin andi makan 50rb" → Piutang baru (Andi)
 *   "andi bayar 50rb" / "terima 50rb dari andi"      → Piutang dibayar
 *   "klaim hotel 300rb" / "klaim cair 300rb"         → Klaim kantor baru / klaim cair
 *   "nabung 500rb ke dana darurat"                   → Isi target (tujuan dana), or a wish list item
 * The other menus:
 *   "anggaran makan 2jt"                             → Anggaran (a new one, or the existing one's amount)
 *   "target liburan bali 10jt desember 2027"         → Tujuan dana baru
 *   "pengen headphone 1,5jt"                         → Wish list baru
 *   "rekening baru jago saldo 1jt"                   → Dompet baru
 *   "saldo bca sekarang 12jt"                        → Perbarui saldo (recorded as an adjustment)
 *   "kategori baru jajan" / "subkategori parkir di transportasi" → Kategori baru
 *   "langganan netflix 54rb tiap tanggal 5"          → Jadwal rutin
 *   "besok bayar arisan 200rb"                       → Rencana (balances don't change until it's recorded)
 *   "ingetin perpanjang stnk 20 oktober"             → Catatan / pengingat on the calendar
 *   "buka laporan"                                   → opens that menu
 * Everything runs on the device. Categories are only picked from the user's own ones (a category is only made
 * when the sentence asks for one): first from earlier transactions with the same item or place, then from a
 * category named in the text, then from common words (kopi → a food & drink category, bensin → transport…).
 * The user can also pick the kind first with the chips (Keluar, Masuk, Utang, Anggaran, Dompet…).
 */
import type { Budget, Category, Claim, Debt, Fund, LedgerTx, PlannedTransaction, Receivable, Recurring, TxType, Wallet, WishItem } from './types';
import { flowOf, suggestCategory } from './categorize.ts';
import { blankOut, resolveBoundaries, type BoundaryResult } from './catat/entities.ts';
import { findTimes, timeSpans } from './catat/temporal.ts';

export type QuickKind = 'tx_update' | 'tx_delete' | 'query' | 'recurring_change' | 'expense' | 'income' | 'transfer' | 'debt_new' | 'debt_payment' | 'receivable_new' | 'receivable_payment' | 'claim_new' | 'claim_payment' | 'target' | 'wish'
  | 'fund_new' | 'wish_new' | 'budget' | 'wallet_new' | 'balance' | 'category_new' | 'recurring_new' | 'plan_new' | 'note_new' | 'open';
export type QuickGroup = 'auto' | 'expense' | 'income' | 'transfer' | 'debt' | 'receivable' | 'claim' | 'target' | 'wish' | 'budget' | 'wallet' | 'category' | 'recurring' | 'plan' | 'open';
export const QUICK_GROUPS: [QuickGroup, string][] = [['auto', 'Otomatis'], ['expense', 'Keluar'], ['income', 'Masuk'], ['transfer', 'Transfer'], ['debt', 'Utang'], ['receivable', 'Piutang'], ['claim', 'Klaim'], ['target', 'Tujuan dana'], ['wish', 'Wish list'], ['budget', 'Anggaran'], ['wallet', 'Dompet'], ['category', 'Kategori'], ['recurring', 'Rutin'], ['plan', 'Rencana'], ['open', 'Buka menu']];
export const QUICK_LABELS: Record<QuickKind, string> = { tx_update: 'Ubah transaksi', tx_delete: 'Hapus transaksi', query: 'Pertanyaan', recurring_change: 'Ubah jadwal rutin', expense: 'Pengeluaran', income: 'Pemasukan', transfer: 'Transfer', debt_new: 'Utang baru', debt_payment: 'Bayar utang', receivable_new: 'Piutang baru', receivable_payment: 'Piutang dibayar', claim_new: 'Klaim kantor baru', claim_payment: 'Klaim cair', target: 'Isi tujuan dana', wish: 'Tabungan wish list', fund_new: 'Tujuan dana baru', wish_new: 'Wish list baru', budget: 'Anggaran', wallet_new: 'Dompet baru', balance: 'Perbarui saldo', category_new: 'Kategori baru', recurring_new: 'Jadwal rutin', plan_new: 'Rencana', note_new: 'Catatan', open: 'Buka menu' };
const GROUP_OF: Partial<Record<QuickKind, Exclude<QuickGroup, 'auto'>>> = { debt_new: 'debt', debt_payment: 'debt', receivable_new: 'receivable', receivable_payment: 'receivable', claim_new: 'claim', claim_payment: 'claim', fund_new: 'target', wish_new: 'wish', wallet_new: 'wallet', balance: 'wallet', category_new: 'category', recurring_new: 'recurring', plan_new: 'plan', note_new: 'plan' };
export const groupOf = (kind: QuickKind): Exclude<QuickGroup, 'auto'> => GROUP_OF[kind] || kind as Exclude<QuickGroup, 'auto'>;

/** A page "buka …" can open: its key, an optional section inside it (a Pengaturan page, a wallet), and its name. */
export type QuickMenu = { key: string; target?: string; label: string };
export type QuickResult = {
  kind: QuickKind; amount: number; date: string;
  /** Transaction fields (type, wallet, linked record…); for new records it carries the wallet, date and description. */
  preset: Partial<LedgerTx>;
  /** New debt: who lent the money. New receivable: who owes it. Spending/income: who was paid or paid (no record). */
  person?: string;
  /** V3.3: what this does to existing records (update, delete, settle, query…), with the target and the remaining balance. */
  operation?: import('./catat/history').OperationInfo;
  /** V3.3: gross, discount, charges and cashback inside this one purchase. */
  composition?: import('./catat/composition').Composition;
  /** V3.3: "3 kopi 18k satu" → 3 × 18.000. */
  quantity?: { qty: number; unit: number; total: number };
  /** V3.3: a shared spending (Split Bill): participants and their shares, from the Split Bill engine. */
  split?: import('./catat/group').SplitReading;
  /** V3.3: a plain "20" read as Rp20.000, to be confirmed. */
  inferredAmount?: { raw: number; value: number };
  /** V3.3: a recent entry this one looks like (a warning only). */
  duplicateOf?: string;
  /** V3.2: what a loan or repayment is for ("buat ngedate" → "Ngedate"): its own field, never the person or a second action. */
  purpose?: string;
  /** Spending/income: how the person was read — after "kirim/transfer ke" (to), after "bayar" (pay), after "dari" (from). */
  personCue?: 'to' | 'pay' | 'from';
  /** V3: the entity spans chosen for this clause and the candidates rejected (provenance, "Kenapa?", trace). */
  entities?: BoundaryResult;
  /** Name of what is made: a debt, claim, tujuan dana, wish, wallet, category, schedule, plan or note. */
  name?: string;
  wishId?: string;
  /** Short notes of what was read (e.g. "kemarin", the category), for the preview. */
  understood: string[];
  /** Anggaran: the budget to change (none = a new one), what it covers and its period. */
  budget?: { id?: string; previous?: number; categoryId?: string; subcategoryIds: string[]; cycleType: Budget['cycleType']; cycleStartDay?: number };
  /** Tujuan dana or wish list baru: one that already has this name, the deadline, the monthly saving… */
  goal?: { existingId?: string; targetDate: string; monthly: number; emoji?: string; priority?: 1 | 2 | 3; emergency?: boolean };
  /** Dompet baru: its type, and a wallet that already has this name. */
  wallet?: { type: Wallet['type']; existingId?: string };
  /** Kategori baru: its type, its parent when it's a subcategory, and one that already has this name there. */
  category?: { type: Category['type']; parentId: string | null; existingId?: string; parentAsked?: boolean };
  /** Jadwal rutin: how often, the day it falls on, and what happens when it's due. */
  schedule?: { frequency: Recurring['frequency']; mode: Recurring['mode']; anchorDay: number };
  menu?: QuickMenu;
  /** Catatan written as a reminder ("ingetin …"). */
  reminder?: boolean;
  /** Why the category was chosen, when it took reading the context or the person's habits ("“air” dibaca sebagai minuman"). */
  why?: string;
};
export type QuickContext = {
  wallets: (Pick<Wallet, 'id' | 'name' | 'isArchived'> & { type?: Wallet['type'] })[];
  categories: (Pick<Category, 'id' | 'name' | 'type' | 'parentId' | 'isArchived'> & { templateKey?: string; icon?: string })[];
  history: Pick<LedgerTx, 'type' | 'description' | 'merchant' | 'categoryId' | 'subcategoryId' | 'date'>[];
  today: string;
  debts?: Pick<Debt, 'id' | 'name' | 'provider' | 'outstandingAmount'>[];
  receivables?: (Pick<Receivable, 'id' | 'person' | 'description' | 'remainingAmount'> & { date?: string; originalAmount?: number })[];
  claims?: (Pick<Claim, 'id' | 'name' | 'remainingAmount'> & { amount?: number })[];
  funds?: (Pick<Fund, 'id' | 'name' | 'isArchived' | 'linkedWalletId' | 'walletIds'> & { targetAmount?: number })[];
  wishlist?: Pick<WishItem, 'id' | 'name' | 'status'>[];
  /** Day of the month the salary comes (Pengaturan › Profil), for "pas gajian". */
  salaryDay?: number;
  budgets?: (Pick<Budget, 'id' | 'name' | 'categoryId' | 'subcategoryId' | 'amount' | 'active'> & { subcategoryIds?: string[]; cycleType?: Budget['cycleType'] })[];
  /** Local time the sentence is written, "HH:MM" in the person's time zone: the reference clock for "jam 1" (V3.1). */
  now?: string;
  /** Places the person confirmed before (local entity memory, lib/catat/memory.ts): supporting evidence only. */
  merchants?: string[];
  /**
   * V3.3 read-only financial context, bounded by the caller (recent days only): the records a sentence may talk about
   * ("ubah kopi tadi", "atuy bayar 5k", "wifi udah dibayar", "spotify jadi 35k"). Never written while parsing.
   */
  recent?: RecentTx[];
  plans?: (Pick<PlannedTransaction, 'id' | 'title' | 'type' | 'amount' | 'date' | 'walletId' | 'categoryId' | 'subcategoryId' | 'status'> & { time?: string })[];
  recurring?: (Pick<Recurring, 'id' | 'name' | 'type' | 'amount' | 'walletId' | 'categoryId' | 'frequency' | 'nextDate' | 'active'> & Partial<Pick<Recurring, 'anchorDay' | 'time' | 'endDate'>>)[];
  /** The moment the sentence is written (epoch ms): recency for "barusan dicatat" duplicate warnings. */
  nowMs?: number;
  /** V3.4: people known by name (Split Bill contacts, Kamus Pribadi), so a name of two or three words is read whole. */
  people?: string[];
  /** V3.4 short session: ids of the entries saved from this box in the last minutes, newest first ("yang tadi"). */
  sessionTxIds?: string[];
  /** General language layer: words never rewritten in this sentence (the person's own alias keys). */
  protectedWords?: string[];
};
/** A recent ledger entry as the V3.3 resolver sees it (no notes, no receipt). */
export type RecentTx = Pick<LedgerTx, 'id' | 'type' | 'amount' | 'date' | 'walletId' | 'destinationWalletId' | 'categoryId' | 'subcategoryId' | 'merchant' | 'description'> & Partial<Pick<LedgerTx, 'time' | 'receivableId' | 'debtId' | 'claimId' | 'plannedId' | 'splitBillId' | 'counterparty'>> & { createdMs?: number };

const lower = (text: string) => text.toLocaleLowerCase('id-ID');
/** Names people write in capitals or with their own spelling. */
const NICE: Record<string, string> = { bca: 'BCA', bri: 'BRI', bni: 'BNI', bsi: 'BSI', btn: 'BTN', cimb: 'CIMB', ocbc: 'OCBC', uob: 'UOB', hsbc: 'HSBC', dbs: 'DBS', bjb: 'BJB', ovo: 'OVO', gopay: 'GoPay', shopeepay: 'ShopeePay', linkaja: 'LinkAja', seabank: 'SeaBank', rdn: 'RDN', kpr: 'KPR', stnk: 'STNK', pbb: 'PBB', bpjs: 'BPJS', pln: 'PLN', pdam: 'PDAM', krl: 'KRL', mrt: 'MRT', tv: 'TV', hp: 'HP', pc: 'PC', ps4: 'PS4', ps5: 'PS5', iphone: 'iPhone', ipad: 'iPad', macbook: 'MacBook', airpods: 'AirPods', thr: 'THR', ktp: 'KTP', dp: 'DP' };
const title = (text: string) => text.split(' ').map(word => NICE[word] || (word ? word[0].toUpperCase() + word.slice(1) : word)).join(' ');
/** A note keeps its words as written, with a capital first letter. */
const sentence = (text: string) => { const t = text.split(' ').map(word => NICE[word] || word).join(' '); return t ? t[0].toUpperCase() + t.slice(1) : t; };
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordAt = (text: string, word: string) => { const m = text.match(new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, 'u')); return m ? (m.index ?? 0) + (m[0].length - word.length) : -1; };
const strip = (text: string, ...patterns: RegExp[]) => patterns.reduce((t, p) => t.replace(p, ' '), ` ${text} `).replace(/\s+/g, ' ').trim();

/** "8rb", "8k", "8.000", "Rp 8.000", "1,5jt", "2 juta", "750" → rupiah. */
const AMOUNT = /(?:rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(rb|ribu|k|jt|juta|m|miliar)?\b/gi;
function readAmount(raw: string, unit = '') {
  const u = lower(unit);
  // "1,5jt" and "1.5jt" are one and a half million; "1.500rb" is one thousand five hundred thousand.
  if (u) { const n = Number(/^\d+\.\d{1,2}$/.test(raw) ? raw : raw.replace(/\./g, '').replace(',', '.')); const times = u === 'rb' || u === 'ribu' || u === 'k' ? 1e3 : u === 'jt' || u === 'juta' ? 1e6 : 1e9; return Math.round(n * times); }
  return Number(raw.replace(/[.,]/g, ''));
}

/**
 * Amounts said in words or slang, turned into digits before anything else is read:
 * "dua puluh lima ribu" → 25000, "satu setengah juta" / "1 setengah juta" → 1500000, "sejuta setengah" → 1500000,
 * "setengah juta" → 500000, "goceng" → 5000, "ceban" → 10000, "gocap" → 50000, "cepek" → 100000.
 */
const SLANG: Record<string, number> = { seceng: 1000, noceng: 2000, goceng: 5000, ceban: 10000, noban: 20000, goban: 50000, gocap: 50000, cepek: 100000, sejutaan: 1000000 };
const NUM_WORDS: Record<string, number> = { nol: 0, satu: 1, se: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11, seratus: 100, seribu: 1000, sejuta: 1000000 };
const SCALES: Record<string, number> = { ribu: 1e3, rb: 1e3, k: 1e3, juta: 1e6, jt: 1e6, miliar: 1e9, milyar: 1e9, m: 1e9 };
const NUMBER_RUN = new RegExp(`(?<![\\p{L}\\p{N}])((?:(?:${[...Object.keys(NUM_WORDS), 'puluh', 'belas', 'ratus', 'setengah', ...Object.keys(SCALES)].sort((a, b) => b.length - a.length).join('|')}|\\d+(?:[.,]\\d+)?)\\s*)+)(?![\\p{L}\\p{N}])`, 'gu');
/** Words read as names in the sentence being parsed ("Ceban Cafe"): never money slang. Set by the plan reader. */
export const amountGuard: { words: Set<string> } = { words: new Set() };
export function amountWords(text: string) {
  let out = text.replace(new RegExp(`\\b(${Object.keys(SLANG).join('|')})\\b`, 'g'), word => amountGuard.words.has(word) ? word : `${SLANG[word]}`);
  out = out.replace(NUMBER_RUN, (run: string) => {
    const tokens = run.trim().split(/\s+/);
    // Only runs with a number word; plain "1,5 juta" is read later as it is.
    if (!tokens.some(t => t in NUM_WORDS || ['puluh', 'belas', 'ratus', 'setengah'].includes(t))) return run;
    if (!tokens.some(t => t in SCALES || t === 'seribu' || t === 'seratus' || t === 'sejuta')) return run;
    let total = 0, small = 0, last = 0, lastScale = 0;
    for (const t of tokens) {
      if (/^\d/.test(t)) { last = Number(t.replace(',', '.')); small += last; }
      else if (t in NUM_WORDS) { last = NUM_WORDS[t]; if (last >= 1000) { total += last; lastScale = last; last = 0; } else small += last; }
      else if (t === 'puluh') { small += last * 9; last *= 10; }
      else if (t === 'belas') { small += 10; last += 10; }
      else if (t === 'ratus') { small += last * 99; last *= 100; }
      else if (t === 'setengah') { if (small || !lastScale) small += .5; else total += lastScale / 2; }
      else if (t in SCALES) { total += (small || 1) * SCALES[t]; lastScale = SCALES[t]; small = 0; last = 0; }
    }
    total += small;
    return total ? ` ${Math.round(total)} ` : run;
  });
  return out.replace(/\s+/g, ' ').trim();
}

// Dates in words.
const MONTHS = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
const MONTH_SHORT: Record<string, number> = { pebruari: 1, jan: 0, feb: 1, peb: 1, mar: 2, apr: 3, jun: 5, jul: 6, agu: 7, agt: 7, ags: 7, aug: 7, sep: 8, sept: 8, okt: 9, oct: 9, nov: 10, nop: 10, des: 11, dec: 11 };
/** Any month name; short ones only count next to a day or a year ("5 okt", "des 2027"). */
const MONTH = `(?:${[...MONTHS, ...Object.keys(MONTH_SHORT)].sort((a, b) => b.length - a.length).join('|')})`;
const MONTH_FULL = `(?:${[...MONTHS, 'pebruari'].join('|')})`;
const monthOf = (word: string) => MONTHS.includes(word) ? MONTHS.indexOf(word) : MONTH_SHORT[word] ?? -1;
const WEEKDAYS: Record<string, number> = { minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6 };
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
/** A day in a month, moved to the month's last day when it's shorter (31 → 30 November). Months past 11 roll into the next year. */
const on = (y: number, m: number, d: number) => { const first = new Date(y, m, 1, 12), fy = first.getFullYear(), fm = first.getMonth(); return new Date(fy, fm, Math.min(d, lastDay(fy, fm)), 12); };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Salary day said as a time ("pas gajian berikutnya"), not the salary itself ("gajian 7jt"). */
export const SALARY_WHEN = /\b(?:(?:pas|saat|waktu|habis|abis|setelah|sesudah|nunggu|tunggu|sebelum)\s+gajian(?:\s+(?:berikutnya|depan|nanti|selanjutnya|bulan depan))?|gajian\s+(?:berikutnya|depan|nanti|selanjutnya))\b/;
/** The words of a date, taken out of a name ("liburan bali desember 2027" → "liburan bali"). */
export const DATE_PHRASES = new RegExp([
  SALARY_WHEN.source,
  `\\b(?:mulai\\s+)?(?:(?:tiap|setiap|saban)\\s+)?(?:(?:tgl|tanggal)\\s*)?\\d{1,2}\\s+${MONTH}(?:\\s+\\d{4})?\\b`,
  `\\b(?:mulai\\s+)?(?:(?:tiap|setiap|saban|per)\\s+)?(?:tgl|tanggal)\\s*\\d{1,2}\\b`,
  `\\b(?:(?:bulan|bln|sebelum|sampai|hingga|pada)\\s+)?${MONTH_FULL}(?:\\s+\\d{4})?\\b`,
  `\\b${MONTH}\\s+\\d{4}\\b`,
  `\\b(?:(?:sebelum|sampai|hingga|pada)\\s+)?(?:tahun|thn|th)\\s*\\d{4}\\b`,
  `\\b\\d{1,2}\\s*(?:hari|minggu|pekan|bulan)\\s*(?:lagi|lalu|yang lalu|yg lalu|ke depan|kedepan)\\b`,
  `\\bdalam\\s*\\d{1,2}\\s*(?:hari|minggu|pekan|bulan)\\b`,
  `(?<![\\d.,])\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?(?![\\d.,])`,
  `\\b(?:mulai\\s+)?(?:hari ini|kemarin lusa|kemarin|kmrn|kmarin|besok|besuk|bsk|lusa|nanti|(?:minggu|pekan|bulan|tahun) (?:depan|lalu|kemarin)|akhir (?:bulan|bln|tahun)|awal (?:bulan|tahun)(?: depan)?)\\b`,
  `\\b(?:(?:tiap|setiap|saban|mulai)\\s+)?(?:hari\\s+)?(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu)(?:\\s+(?:depan|lalu|kemarin))?\\b`,
  `\\b(?:(?:tiap|setiap|saban|mulai)\\s+)?hari minggu(?:\\s+(?:depan|lalu|kemarin))?\\b`,
].join('|'), 'g');
/** "tiap bulan", "per minggu", "bulanan"… */
const FREQ_PHRASES = /\b(?:tiap|setiap|saban|per)\s*(?:hari\s+)?(?:minggu|pekan|bulan|bln|tahun|thn|siklus|gajian)\b|\/\s*(?:minggu|bulan|bln|tahun|thn)\b|\b(?:bulanan|mingguan|tahunan|rutin|sebulan sekali|seminggu sekali|setahun sekali|sebulan|seminggu|setahun)\b/g;

type When = { date: string; label: string; ahead?: boolean };
/**
 * A date said in words. `future` (plans, schedules, targets): "tgl 5" is the coming 5th and "desember" the coming December;
 * otherwise it's something that already happened ("tgl 28" is the last 28th). `end`: a month or a year alone means its last day.
 * `ahead` marks a date after today, which turns a spending sentence into a plan.
 */
export function readDate(text: string, today: string, future = false, end = false, salaryDay?: number): When | null {
  const base = new Date(`${today}T12:00:00`), y = base.getFullYear(), m = base.getMonth(), d = base.getDate();
  const plus = (days: number) => new Date(y, m, d + days, 12);
  const when = (date: Date, label: string): When => ({ date: iso(date), label, ...(iso(date) > today ? { ahead: true } : {}) });
  let r: RegExpMatchArray | null;
  // "pas gajian berikutnya": the next salary day, only when it is known.
  if ((r = text.match(SALARY_WHEN))) {
    if (!salaryDay) return null;
    let date = on(y, m, salaryDay); if (iso(date) <= today) date = on(y, m + 1, salaryDay);
    if (/\bsebelum\b/.test(r[0])) date = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, 12);
    return when(date, /\bsebelum\b/.test(r[0]) ? 'sebelum gajian' : 'gajian berikutnya');
  }
  if (/\bhari ini\b/.test(text)) return when(base, 'hari ini');
  if (/\bkemarin lusa\b/.test(text)) return when(plus(-2), 'kemarin lusa');
  // "senin kemarin" is last Monday, read with the weekdays below.
  if (/\b(kemarin|kmrn|kmarin)\b/.test(text) && !/\b(minggu|pekan|bulan|senin|selasa|rabu|kamis|jumat|jum'at|sabtu) kemarin\b/.test(text)) return when(plus(-1), 'kemarin');
  if (/\b(besok|besuk|bsk)\b/.test(text)) return when(plus(1), 'besok');
  if (/\blusa\b/.test(text)) return when(plus(2), 'lusa');
  if ((r = text.match(/\b(\d{1,2})\s*hari\s*(?:lalu|yang lalu|yg lalu)\b/))) return when(plus(-Number(r[1])), `${r[1]} hari lalu`);
  if ((r = text.match(/\b(\d{1,2})\s*(hari|minggu|pekan|bulan)\s*(?:lagi|ke depan|kedepan)\b|\bdalam\s*(\d{1,2})\s*(hari|minggu|pekan|bulan)\b/))) {
    const n = Number(r[1] || r[3]), unit = r[2] || r[4];
    return when(unit === 'bulan' ? on(y, m + n, d) : plus(unit === 'hari' ? n : n * 7), `${n} ${unit} lagi`);
  }
  if (/\b(minggu|pekan) (lalu|kemarin)\b/.test(text)) return when(plus(-7), 'minggu lalu');
  // A day with a month: "17 agustus", "tgl 5 okt 2027". A "tiap 17 agustus" is a schedule, read elsewhere.
  if ((r = text.match(new RegExp(`\\b(tiap\\s+|setiap\\s+)?(?:(?:tgl|tanggal)\\s*)?(\\d{1,2})\\s+(${MONTH})(?:\\s+(\\d{4}))?\\b`))) && !r[1]) {
    const day = Number(r[2]), month = monthOf(r[3]);
    if (day >= 1 && day <= 31 && month >= 0) {
      let date = on(r[4] ? Number(r[4]) : y, month, day);
      if (!r[4] && future && iso(date) < today) date = on(y + 1, month, day);
      return when(date, `${day} ${MONTHS[month]}${r[4] ? ` ${r[4]}` : ''}`);
    }
  }
  // "3/9", "03-09-2026", "3/9/26": day first, as written in Indonesia.
  if ((r = text.match(/(?<![\d.,])(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?![\d.,])/))) {
    const day = Number(r[1]), month = Number(r[2]) - 1, year = r[3] ? (r[3].length === 2 ? 2000 + Number(r[3]) : Number(r[3])) : y;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      let date = on(year, month, day);
      if (!r[3] && !future && iso(date) > today) date = on(y - 1, month, day);
      if (!r[3] && future && iso(date) < today) date = on(y + 1, month, day);
      return when(date, `${day} ${MONTHS[month]}${r[3] ? ` ${year}` : ''}`);
    }
  }
  // "tgl 5", "tanggal 25 bulan depan".
  if ((r = text.match(/\b(tiap\s+|setiap\s+|per\s+)?(?:tgl|tanggal)\s*(\d{1,2})\b/)) && !r[1]) {
    const day = Number(r[2]);
    if (day >= 1 && day <= 31) {
      const next = /\bbulan depan\b/.test(text), prev = /\bbulan (lalu|kemarin)\b/.test(text);
      let date = on(y, m + (next ? 1 : prev ? -1 : 0), day);
      if (!next && !prev) { if (future && iso(date) < today) date = on(y, m + 1, day); if (!future && iso(date) > today) date = on(y, m - 1, day); }
      return when(date, `tanggal ${day}${next ? ' bulan depan' : prev ? ' bulan lalu' : ''}`);
    }
  }
  if (/\bbulan (lalu|kemarin)\b/.test(text)) return when(on(y, m - 1, d), 'bulan lalu');
  if (future) {
    // A month alone ("desember", "des 2027") or a year ("tahun 2030"): its first day, or its last day for a deadline.
    if ((r = text.match(new RegExp(`\\b(${MONTH_FULL})(?:\\s+(\\d{4}))?\\b|\\b(${MONTH})\\s+(\\d{4})\\b`)))) {
      const month = monthOf(r[1] || r[3]), yearText = r[2] || r[4];
      const year = yearText ? Number(yearText) : month < m ? y + 1 : y;
      let date = on(year, month, end ? 31 : 1);
      if (iso(date) < today) date = base;
      return when(date, `${MONTHS[month]}${yearText ? ` ${yearText}` : ''}`);
    }
    if ((r = text.match(/\b(?:tahun|thn|th)\s*(\d{4})\b/))) { const year = Number(r[1]); return when(new Date(year, end ? 11 : 0, end ? 31 : 1, 12), `tahun ${year}`); }
    if (/\bakhir (bulan|bln)\b/.test(text)) return when(on(y, m, 31), 'akhir bulan');
    if (/\bakhir tahun\b/.test(text)) return when(new Date(y, 11, 31, 12), 'akhir tahun');
    if (/\bawal tahun( depan)?\b/.test(text)) return when(new Date(y + 1, 0, 1, 12), 'awal tahun depan');
    if (/\bawal bulan( depan)?\b/.test(text)) return when(on(y, m + 1, 1), 'awal bulan depan');
  }
  // Not only for plans: "bayar kos akhir bulan" is still to come, "awal bulan" already happened.
  if (/\bakhir (bulan|bln)\b/.test(text) && !/\bakhir (bulan|bln) (lalu|kemarin)\b/.test(text)) return when(on(y, m, 31), 'akhir bulan');
  if (/\bawal (bulan|bln) depan\b/.test(text)) return when(on(y, m + 1, 1), 'awal bulan depan');
  if (/\bawal (bulan|bln)( ini)?\b/.test(text)) return when(on(y, m, 1), 'awal bulan');
  if (/\b(minggu|pekan) depan\b/.test(text)) return when(plus(7), 'minggu depan');
  if (/\bbulan depan\b/.test(text)) return when(end ? on(y, m + 1, 31) : on(y, m + 1, d), 'bulan depan');
  if (/\btahun depan\b/.test(text)) return when(end ? new Date(y + 1, 11, 31, 12) : on(y + 1, m, d), 'tahun depan');
  // A weekday: the coming one for plans ("jumat", "senin depan"), the last one for what already happened.
  if ((r = text.match(/\b(tiap\s+|setiap\s+|saban\s+)?(?:hari\s+)?(senin|selasa|rabu|kamis|jumat|jum'at|sabtu)\b|\b(tiap\s+|setiap\s+)?hari (minggu)\b/)) && !r[1] && !r[3]) {
    const name = r[2] || r[4], target = WEEKDAYS[name], now = base.getDay(), next = /\bdepan\b/.test(text);
    const diff = future || next ? ((target - now + 7) % 7 || (next ? 7 : 0)) : -((now - target + 7) % 7);
    return when(plus(diff), `hari ${name}`);
  }
  return null;
}

/**
 * How often a schedule repeats ("tiap tanggal 5", "setiap senin", "per bulan") and its first date. `loose` (the Rutin chip):
 * "bulanan", "mingguan", "rutin" also count; otherwise they are just words in a name ("belanja bulanan", "uang mingguan").
 */
function scheduleOf(text: string, today: string, loose = false): { frequency: Recurring['frequency']; date: string; anchorDay: number; label: string } | null {
  const base = new Date(`${today}T12:00:00`), y = base.getFullYear(), m = base.getMonth();
  const EVERY = '(?:tiap|setiap|saban|per)';
  let r: RegExpMatchArray | null;
  if ((r = text.match(new RegExp(`\\b${EVERY}\\s+(?:(?:tgl|tanggal)\\s*)?(\\d{1,2})\\s+(${MONTH})\\b`)))) {
    const day = Math.min(31, Math.max(1, Number(r[1]))), month = monthOf(r[2]);
    let date = on(y, month, day); if (iso(date) < today) date = on(y + 1, month, day);
    return { frequency: 'yearly', date: iso(date), anchorDay: day, label: `tiap ${day} ${MONTHS[month]}` };
  }
  if ((r = text.match(new RegExp(`\\b${EVERY}\\s+(?:bulan\\s+)?(?:tgl|tanggal)\\s*(\\d{1,2})\\b`)))) {
    const day = Math.min(31, Math.max(1, Number(r[1])));
    let date = on(y, m, day); if (iso(date) < today) date = on(y, m + 1, day);
    return { frequency: /\b(?:tiap|setiap|per)\s+tahun\b|\btahunan\b/.test(text) ? 'yearly' : 'monthly', date: iso(date), anchorDay: day, label: `tiap tanggal ${day}` };
  }
  if ((r = text.match(new RegExp(`\\b${EVERY}\\s+(?:hari\\s+)?(senin|selasa|rabu|kamis|jumat|jum'at|sabtu)\\b|\\b${EVERY}\\s+hari\\s+(minggu)\\b`)))) {
    const name = r[1] || r[2], diff = (WEEKDAYS[name] - base.getDay() + 7) % 7, date = new Date(y, m, base.getDate() + diff, 12);
    return { frequency: 'weekly', date: iso(date), anchorDay: date.getDate(), label: `tiap ${name}` };
  }
  const frequency: Recurring['frequency'] | null = /\b(?:tiap|setiap|saban|per)\s*(?:tahun|thn)\b|\/\s*(?:tahun|thn)\b|\bsetahun\s*sekali\b/.test(text) || loose && /\btahunan\b/.test(text) ? 'yearly'
    : /\b(?:tiap|setiap|saban|per)\s*(?:minggu|pekan)\b|\/\s*minggu\b|\bseminggu\s*sekali\b/.test(text) || loose && /\bmingguan\b/.test(text) ? 'weekly'
    : /\b(?:tiap|setiap|saban|per)\s*(?:bulan|bln)\b|\/\s*(?:bulan|bln)\b|\bsebulan\s*sekali\b/.test(text) || loose ? 'monthly' : null;
  if (!frequency) return null;
  const start = readDate(text, today, true)?.date || today;
  return { frequency, date: start, anchorDay: Number(start.slice(8, 10)), label: frequency === 'weekly' ? 'tiap minggu' : frequency === 'yearly' ? 'tiap tahun' : 'tiap bulan' };
}

const NOT_MONEY_BEFORE = /\b(?:jam|pukul|pkl|meja|kamar|lantai|lt|no|nomor|nomer|nmr|rek|rekening|norek|kode|gate|kursi|umur|usia|ke|nik|hp|wa|telp|telepon|km|kilo|seat|blok|gang|rt|rw)\.?\s*$/;
export type Amount = { value: number; text: string; index: number; marked: boolean; monthly: boolean };
const COUNTS = `(?:hari|minggu|pekan|bulan|bln|tahun|thn|x|kali|jam|menit|orang|org|pcs|buah|porsi|bungkus|botol|gelas|kg|gram|gr|liter|ltr|lt|lembar|persen|${MONTH})`;
/** Every amount in the text, leaving out dates ("tgl 5", "17 agustus", "2027"), counts ("3 hari", "2 porsi") and model numbers ("ps5"). */
export function findAmounts(text: string): Amount[] {
  const found: Amount[] = [];
  // Numbers owned by a time expression ("jam 1200", "jam 7 lwt 5", "jam set 3") are never money.
  const clocks = timeSpans(text);
  for (const m of text.matchAll(AMOUNT)) {
    const index = m.index ?? 0, before = text.slice(0, index), after = text.slice(index + m[0].length);
    if (clocks.some(c => index < c.end && c.start < index + m[0].length)) continue;
    const marked = Boolean(m[2]) || /rp/.test(m[0]);
    if (/\b(tgl|tanggal)\s*$/.test(before)) continue;
    // A clock time, a table, a room or an account number is not money ("jam 7", "meja 12", "kamar 205", "rekening 1234567890").
    if (!marked && (NOT_MONEY_BEFORE.test(before) || /^\d{10,}$/.test(m[1]))) continue;
    if (!marked && (/\p{L}$/u.test(before) || new RegExp(`^\\s*(?:${COUNTS}\\b|%)`).test(after))) continue;
    if (!marked && /^(19|20)\d{2}$/.test(m[1]) && new RegExp(`(?:${MONTH}|tahun|thn|th)\\s*$`).test(before)) continue;
    const value = readAmount(m[1], m[2]);
    if (!value) continue;
    found.push({ value, text: m[0], index, marked, monthly: /^\s*(?:\/|per|tiap|setiap)\s*(?:bulan|bln)\b|^\s*(?:sebulan|bulanan)\b/.test(after) });
  }
  return found;
}
/** The amount meant: one with a unit or "rp" first, otherwise the biggest plain number. */
/** Two-digit plain numbers count too ("bensin 80"): the preview marks a plain number under 1.000 to check, with the thousands as a one-tap choice. */
const mainAmount = (list: Amount[]) => list.find(a => a.marked) || list.filter(a => a.value >= 10).sort((a, b) => b.value - a.value)[0];

const TRANSFER_WORDS = /\b(tf|transfer|pindah|pindahin|topup|top up|isi saldo|tambah saldo)\b/;
/** Cash in and out of a bank: tarik tunai (bank → cash), setor tunai (cash → bank). Not the fee ("biaya tarik tunai"). */
const CASH_OUT = /\b(tarik tunai|tarik uang|narik uang|narik tunai|ambil uang(?: di)? atm|tarik(?: di)? atm|narik(?: di)? atm)\b/, CASH_IN = /\b(setor tunai|setor uang|nyetor|setoran tunai)\b/;
const CLAIM_WORDS = /\b(klaim|claim|reimburse|reimbursement|reimburs|rembes|talangan kantor|talangin kantor|nalangin kantor|diklaim|diklaimkan|klaimkan|direimburse)\b/;
const CLAIM_PAID = /\b(cair|dicairkan|diganti|dibayar|masuk|lunas)\b/;
const SAVE_WORDS = /\b(nabung|menabung|tabung|nyimpen|simpan|sisihkan|sisihin|nyisihin|setor|celengan)\b/;
const FILL_WORDS = /\b(isi|tambah|nambah|masukin|masukkan|top ?up)\b/;
const LEND_OUT = /\b((?:ngasi|kasi)h? (?:pinjem|pinjam|pinjaman|utang|hutang)|pinjemin|minjemin|pinjamin|minjamin|meminjamkan|minjemkan|talangin|nalangin|nalangi|talangi|bayarin|bayari|utangin|ngutangin|hutangin|ngehutangin)\b/;
const LENT_TO_ME = /\b(?:pinjemin|minjemin|pinjamin|minjamin|meminjamkan|minjemkan|utangin|ngutangin)\s+(?:aku|saya|gue|gw|ku)\b/;
const BORROW = /\b(pinjam|minjem|pinjem|minjam|meminjam|ngutang|ngehutang|berutang|berhutang|utang|hutang|dipinjemin|dipinjamin|dipinjami|kasbon|pinjaman)\b/;
const PAY = /\b(bayar|byr|cicil|nyicil|angsur|lunas|lunasin|lunasi|balikin|ngembaliin|kembaliin|mengembalikan|transfer|tf|kirim|ngirim)\b/;
const RECEIVE = /\b(terima|nerima|dapat|dapet|masuk)\b/;
const DEBT_WORDS = /\b(utang|hutang|cicilan|kredit|pinjaman|paylater|kartu kredit|angsuran)\b/;
const PAID_OFF = /\b(lunas|lunasin|lunasi|pelunasan)\b/;
// The other menus.
const CATEGORY_WORDS = /\b(kategori|kategory|categori|category|subkategori|sub-kategori|sub kategori)\b/;
const SUB_WORDS = /\b(subkategori|sub-kategori|sub kategori|sub)\b/;
const WALLET_NEW = /\b(?:buat|bikin|bikinin|tambah|tambahin|tambahkan|daftar|daftarin|buka)\s+(?:dompet|rekening|rek|akun|e-?wallet|kartu kredit)\b|\b(?:dompet|rekening|rek|akun|e-?wallet|kartu kredit)\s+baru\b/;
const BUDGET_WORDS = /\b(anggaran|budget|bujet|budjet|jatah)\b/;
const BUDGET_PERIOD = /\b(?:per|tiap|setiap)\s*(?:minggu|pekan|bulan|bln|siklus|gajian)\b|\/\s*(?:minggu|bulan|bln)\b|\b(sebulan|seminggu|mingguan|bulanan)\b/;
const FUND_NOUN = /\b(target|tujuan dana|tujuan tabungan|tujuan keuangan)\b/;
const FUND_CREATE = /\b(?:buat|bikin|bikinin|tambah|tambahin|pasang|set)\s+(?:target|tujuan)\b|\b(?:target|tujuan dana)\s+baru\b/;
const WISH_NOUN = /\b(wishlist|wish list|wishlis|impian|idaman|incaran|ngincer|incer|pengen|pengin|pingin|kepengen|kepingin|ingin|mau punya)\b/;
const NOTE_WORDS = /\b(catatan|note|memo)\b/;
const REMIND = /\b(ingetin|ingatkan|ingetkan|ingatin|pengingat|reminder|remind|jangan lupa)\b/;
const PLAN_WORDS = /\b(rencana|rencananya|berencana|planning)\b/;
const BALANCE_WORDS = /\b(saldo|saldonya)\b/;
const BALANCE_NOW = /\b(sekarang|skrg|skg|jadi|tinggal|sisa|update|perbarui|perbaharui|cocokkan|cocokin|sesuaikan|real|aktual|asli|sebenarnya|sebenernya|seharusnya|harusnya|terkini|ada)\b/;
const BALANCE_MOVE = /\b(tambah|tambahin|isi|top ?up|topup|kurang|kurangi|potong|transfer|tf|kirim|narik|tarik|bayar|beli)\b/;
/** Buying or paying for something: "beli dompet baru" is spending, not a new wallet. */
const BOUGHT = /\b(beli|bayar|byr|jajan|belanja|servis|service|ganti|benerin)\b/;
const CREATE_WORDS = /\b(baru|buat|bikin|bikinin|tambah|tambahin|tambahkan|daftar|daftarin|pasang|set|namanya|bernama|nama)\b/g;

const VERBS = /\b(beli|bayar|bayarin|byr|jajan|isi|gaji|terima|nerima|dapat|dapet|tf|transfer|pindah|pindahin|topup|top up|buat|untuk|utk|seharga|harga|total|habis|keluar|masuk|pinjam|minjem|pinjem|minjam|pinjemin|minjemin|pinjamin|talangin|nalangin|utangin|ngutangin|ngutang|utang|hutang|cicil|nyicil|lunas|lunasin|balikin|kembaliin|klaim|reimburse|nabung|tabung|sisihkan|sisihin|setor|cair|dibayar|dipinjemin|dipinjamin|kasbon)\b/g;
// Time of day is a filler ("tadi siang") except in a meal ("makan siang").
const FILLERS = /\b(tadi|td|barusan|hari ini|kemarin|kmrn|kmarin|(?<!makan )(?:pagi|siang|sore|malam)|dan|yang|yg|sama|ama|sm|aku|gue|gw|saya|ke|dari|dr|di|pakai|pake|via|nih|dong|ya|lagi|dulu|uang|duit|catat|catet|nyatet|nyatat|input|tolong)\b/g;
/** Words of schedules and plans, taken out of their names. */
const PLAN_FILLERS = /\b(rencana|rencananya|berencana|planning|ingetin|ingatkan|ingetkan|ingatin|pengingat|reminder|remind|jangan lupa|langganan|mulai|akan|bakal|mau|otomatis|auto|langsung|draf|draft|konfirmasi)\b/g;
/** Words that are never somebody's name. */
/** Honorifics: skipped before a name ("kak tio" → Tio), the person themselves when alone ("ke ibu" → Ibu). */
const HONORIFIC = new Set(['kak', 'kaka', 'mas', 'mbak', 'mba', 'bang', 'abang', 'pak', 'bapak', 'bu', 'ibu', 'om', 'tante', 'bro', 'sis', 'dek', 'adek', 'teh', 'aa', 'neng', 'cak', 'ning', 'mama', 'papa', 'mamah', 'papah', 'ayah', 'bunda', 'nenek', 'kakek', 'paman', 'bibi']);
const NOT_A_NAME = new Set([...HONORIFIC, 'pagi', 'siang', 'sore', 'malam', 'aku', 'gue', 'gw', 'saya', 'dia', 'kantor', 'kasih', 'ngasih', 'kasi', 'dari', 'ke', 'sama', 'ama', 'sm', 'buat', 'untuk', 'utk', 'di', 'pakai', 'pake', 'via', 'kemarin', 'kmrn', 'tadi', 'hari', 'ini', 'lalu', 'uang', 'duit', 'dulu', 'ya', 'nih', 'dong', 'lagi', 'yang', 'yg', 'dan', 'rp', 'tgl', 'tanggal', 'utang', 'hutang', 'pinjam', 'pinjaman', 'bayar', 'cicilan', 'makan', 'minum', 'beli']);

/** Common short names of places. */
const PLACES: Record<string, string> = { alfa: 'Alfamart', alfamart: 'Alfamart', alfamidi: 'Alfamidi', indo: 'Indomaret', indomaret: 'Indomaret', sbux: 'Starbucks', starbuck: 'Starbucks', starbucks: 'Starbucks', kfc: 'KFC', mcd: "McDonald's", mekdi: "McDonald's", hokben: 'HokBen', janjiw: 'Janji Jiwa', kenangan: 'Kopi Kenangan', tokped: 'Tokopedia', tokopedia: 'Tokopedia', shopee: 'Shopee', grab: 'Grab', gojek: 'Gojek', pertamina: 'Pertamina', spbu: 'SPBU', superindo: 'Superindo', hypermart: 'Hypermart', transmart: 'Transmart' };

/** Places known for this person: the built-in short names, the merchants in their history and the ones they confirmed. */
export function knownPlaces(ctx: Pick<QuickContext, 'history' | 'merchants'>) {
  const map = new Map<string, string>();
  for (const [key, name] of Object.entries(PLACES)) { map.set(key, name); map.set(lower(name), name); }
  for (const [alias, name] of Object.entries(PLACE_ALIASES)) map.set(alias, name);
  for (const name of [...EXTRA_PLACES, ...(ctx.merchants || []), ...ctx.history.map(t => t.merchant).filter(Boolean)]) if (name && name.length >= 3) map.set(lower(name).replace(/\s+/g, ' ').trim(), name);
  return map;
}
/** How people write some chains without punctuation or in short. */
const PLACE_ALIASES: Record<string, string> = { dbesto: 'D\'Besto', 'd besto': 'D\'Besto', cotti: 'Cotti Coffee', 'cotti kopi': 'Cotti Coffee' };
/** Chains and brands people write without "di" ("kopi fore", "roti indomaret"). */
const EXTRA_PLACES = ['D\'Besto', 'Cotti Coffee', 'Fore', 'Kopi Kenangan', 'Janji Jiwa', 'Tomoro', 'Point Coffee', 'Chatime', 'Mixue', 'Family Mart', 'Lawson', 'Circle K', 'Burger King', 'Pizza Hut', 'Domino', 'Richeese', 'Gacoan', 'Solaria', 'Hokben', 'Yoshinoya', 'Wingstop', 'Sushi Tei', 'Guardian', 'Watsons', 'Ace Hardware', 'Informa', 'IKEA', 'Uniqlo', 'Gramedia', 'Lotte Mart', 'Giant', 'Carrefour', 'Lion Parcel', 'JNE', 'J&T', 'SiCepat', 'Shell', 'Kimia Farma', 'Apotek K24', 'Century'];

/** Everyday words → words that usually appear in the name of the right category. */
const HINTS: [RegExp, string[]][] = [
  [/\b(makan|minum|kopi|coffee|teh|es|jus|susu|aqua|pocari|air mineral|snack|jajan|cemilan|roti|nasi|mie|bakso|sate|ayam|sarapan|lunch|dinner|gofood|grabfood|shopeefood)\b/, ['makan', 'minum', 'kuliner', 'jajan']],
  [/\b(bensin|pertalite|pertamax|solar|parkir|ojek|ojol|gojek|grab|taksi|taxi|tol|kereta|krl|mrt|busway|transjakarta|bus|angkot|pesawat|tiket|transport|transportasi)\b/, ['transport', 'kendaraan', 'bensin', 'perjalanan']],
  [/\b(pulsa|kuota|paket data|listrik|pln|token|air|pdam|internet|wifi|indihome|tagihan|bpjs)\b/, ['tagihan', 'utilitas', 'pulsa', 'listrik', 'internet']],
  [/\b(obat|dokter|klinik|apotek|rumah sakit|vitamin)\b/, ['kesehatan', 'obat']],
  [/\b(baju|celana|sepatu|tas|kaos|skincare|sabun|shampo|odol|detergen|tisu|belanja bulanan)\b/, ['belanja', 'kebutuhan', 'rumah tangga']],
  [/\b(netflix|spotify|youtube|film|bioskop|game|nonton|konser)\b/, ['hiburan', 'langganan']],
  [/\b(sedekah|infaq|infak|zakat|donasi|sumbangan)\b/, ['sedekah', 'donasi', 'zakat']],
  [/\b(kos|kost|kontrakan|sewa rumah|sewa)\b/, ['kos', 'sewa', 'tempat tinggal', 'rumah']],
  [/\b(gaji|gajian|thr)\b/, ['gaji']],
  [/\b(bonus|insentif)\b/, ['bonus', 'gaji']],
];

/** Wish list pictures by what the item is. */
const WISH_EMOJI: [RegExp, string][] = [
  [/\b(headphone|headset|earphone|earbuds|tws|airpods)\b/, '🎧'], [/\b(hp|handphone|iphone|samsung|ponsel|smartphone|xiaomi|oppo|vivo)\b/, '📱'], [/\b(laptop|macbook|notebook)\b/, '💻'],
  [/\b(jam|smartwatch|watch)\b/, '⌚'], [/\b(kamera|camera|lensa)\b/, '📷'], [/\b(ps4|ps5|playstation|nintendo|switch|konsol|game)\b/, '🎮'], [/\b(sepatu|sneakers|sneaker)\b/, '👟'],
  [/\b(tas|bag)\b/, '👜'], [/\b(baju|dress|gaun|kemeja|jaket)\b/, '👗'], [/\b(kacamata)\b/, '🕶️'], [/\b(makeup|skincare|lipstik|parfum)\b/, '💄'], [/\b(ransel|backpack)\b/, '🎒'],
  [/\b(cincin|nikah|lamaran|tunangan)\b/, '💍'], [/\b(berlian|perhiasan|emas|kalung)\b/, '💎'], [/\b(monitor|pc|komputer)\b/, '🖥️'], [/\b(keyboard)\b/, '⌨️'], [/\b(tv|televisi)\b/, '📺'],
  [/\b(gitar)\b/, '🎸'], [/\b(piano)\b/, '🎹'], [/\b(buku|kursus|kelas)\b/, '📚'], [/\b(sofa|kasur|lemari|furnitur|meja)\b/, '🛋️'], [/\b(kompor|oven|airfryer|blender|kulkas)\b/, '🍳'],
  [/\b(tanaman)\b/, '🪴'], [/\b(mainan|boneka|lego)\b/, '🧸'], [/\b(kucing|anjing|hewan)\b/, '🐶'], [/\b(sepeda)\b/, '🚲'], [/\b(motor|skuter|vespa|nmax|pcx)\b/, '🛵'], [/\b(mobil)\b/, '🚗'],
  [/\b(rumah|kpr|apartemen)\b/, '🏠'], [/\b(pesawat|trip|jalan-jalan|jalan jalan)\b/, '✈️'], [/\b(liburan|pantai|bali)\b/, '🏖️'], [/\b(camping|kemah)\b/, '⛺'], [/\b(koper)\b/, '🧳'], [/\b(konser|tiket)\b/, '🎫'],
];

/** Menus "buka …" can open, with the words people use for them. */
export const QUICK_MENUS: (QuickMenu & { words: string[] })[] = [
  { key: 'dashboard', label: 'Beranda', words: ['beranda', 'dashboard', 'home', 'halaman utama'] },
  { key: 'transactions', label: 'Transaksi', words: ['transaksi', 'riwayat transaksi', 'semua transaksi', 'mutasi', 'riwayat'] },
  { key: 'inbox', label: 'Perlu dikonfirmasi', words: ['perlu dikonfirmasi', 'konfirmasi', 'inbox'] },
  { key: 'budgets', label: 'Anggaran', words: ['anggaran', 'budget', 'bujet'] },
  { key: 'advisor', label: 'Insight', words: ['insight', 'saran', 'saran keuangan'] },
  { key: 'wallets', label: 'Dompet', words: ['dompet', 'rekening', 'saldo', 'akun', 'semua dompet', 'saldo dompet'] },
  { key: 'debts', label: 'Utang', words: ['utang', 'hutang', 'cicilan', 'pinjaman'] },
  { key: 'receivables', label: 'Piutang', words: ['piutang'] },
  { key: 'splitbill', label: 'Split Bill', words: ['split bill', 'splitbill', 'split', 'patungan', 'bagi tagihan', 'bagi bill', 'split tagihan'] },
  { key: 'claims', label: 'Klaim kantor', words: ['klaim', 'klaim kantor', 'reimburse'] },
  { key: 'funds', label: 'Tujuan dana', words: ['tujuan dana', 'target', 'target tabungan', 'tujuan', 'dana darurat'] },
  { key: 'wishlist', label: 'Wish list', words: ['wish list', 'wishlist', 'impian'] },
  { key: 'recurring', label: 'Transaksi rutin', words: ['rutin', 'jadwal rutin', 'transaksi rutin', 'langganan'] },
  { key: 'upcoming', label: 'Arus kas', words: ['arus kas', 'arus kas mendatang', 'cashflow', 'cash flow', 'rencana'] },
  { key: 'calendar', label: 'Kalender keuangan', words: ['kalender', 'kalender keuangan', 'catatan'] },
  { key: 'schedule', label: 'Jadwal', words: ['jadwal'] },
  { key: 'categories', label: 'Kategori', words: ['kategori'] },
  { key: 'report', label: 'Laporan', words: ['laporan', 'report', 'rekap', 'laporan bulanan', 'laporan keuangan'] },
  { key: 'analytics', label: 'Analisis', words: ['analisis', 'analisa', 'analitik', 'statistik', 'grafik'] },
  { key: 'forecast', label: 'Proyeksi', words: ['proyeksi', 'prediksi', 'ramalan'] },
  { key: 'cycles', label: 'Riwayat siklus', words: ['riwayat siklus', 'siklus', 'tutup buku', 'tutup siklus'] },
  { key: 'health', label: 'Periksa data', words: ['periksa data', 'cek data'] },
  { key: 'settings', label: 'Pengaturan', words: ['pengaturan', 'setting', 'settings', 'setelan'] },
  { key: 'settings', target: 'reminders', label: 'Pengingat', words: ['pengingat', 'notifikasi', 'alarm'] },
  { key: 'settings', target: 'appearance', label: 'Tampilan', words: ['tampilan', 'tema', 'mode gelap', 'dark mode', 'ukuran huruf', 'font'] },
  { key: 'settings', target: 'security', label: 'Keamanan', words: ['keamanan', 'pin', 'kata sandi', 'password', 'sidik jari'] },
  { key: 'settings', target: 'profile', label: 'Profil & gaji', words: ['profil', 'tanggal gajian', 'hari gajian'] },
  { key: 'settings', target: 'control', label: 'Kontrol keuangan', words: ['kontrol keuangan'] },
  { key: 'settings', target: 'data', label: 'Data & cadangan', words: ['cadangan', 'backup', 'ekspor', 'export', 'impor', 'import'] },
  { key: 'settings', target: 'about', label: 'Info aplikasi', words: ['info aplikasi', 'versi', 'versi aplikasi', 'tentang aplikasi'] },
  { key: 'help', label: 'Tanya jawab', words: ['bantuan', 'tanya jawab', 'faq', 'panduan', 'cara pakai', 'help'] },
];
const OPEN_VERB = /^(?:tolong\s+)?(?:buka|bukain|bukakan|lihat|liat|lihatin|cek|ke|pergi ke|masuk ke|tampilkan|tunjukkan|tunjukin|open|show)\b\s*/;

/** A wallet named in the text ("pakai gopay", "dari bca"), matching whole words of its name. */
export function walletsIn(text: string, wallets: QuickContext['wallets']) {
  const found: { id: string; name: string; at: number; word: string }[] = [];
  const aliases: Record<string, string[]> = { tunai: ['cash', 'kas'], cash: ['tunai'] };
  for (const w of wallets.filter(w => !w.isArchived)) {
    const name = lower(w.name), words = [name, ...name.split(/\s+/).filter(p => p.length >= 3), ...(aliases[name] || [])];
    let at = -1, hit = '';
    for (const word of words) {
      const i = wordAt(text, word);
      // "promo gopay", "cashback ovo": the wallet's name, not the wallet paid with.
      if (i >= 0 && /\b(?:promo|diskon|disc|cashback|voucher|voucer|kode promo|poin)\s+$/.test(text.slice(0, i))) continue;
      if (i >= 0 && (at < 0 || i < at)) { at = i; hit = word; }
    }
    if (at >= 0) found.push({ id: w.id, name: w.name, at, word: hit });
  }
  return found.sort((a, b) => a.at - b.at);
}

/**
 * The menu the text asks to open: "buka laporan", "lihat utang", "pengaturan", "saldo bca" (that wallet).
 * `loose` (the Buka menu chip): a menu word anywhere in the text is enough.
 */
function menuIn(text: string, ctx: QuickContext, loose = false): QuickMenu | null {
  const verb = OPEN_VERB.exec(text);
  const rest = strip(verb ? text.slice(verb[0].length) : text, /\b(menu|halaman|page|dong|ya|aja|deh|dulu|sekarang|saya|aku|gue|gw|punyaku|ku|nya)\b/g);
  if (!rest) return null;
  const wallet = walletsIn(rest, ctx.wallets)[0];
  if (wallet && !strip(rest, new RegExp(`\\b${escape(wallet.word)}\\b`), /\b(dompet|rekening|saldo|akun|detail)\b/g) && (verb || rest !== wallet.word)) return { key: 'wallets', target: wallet.id, label: wallet.name };
  let best: QuickMenu | null = null, size = 0;
  for (const { words, ...menu } of QUICK_MENUS) for (const word of words) if ((rest === word || loose && wordAt(rest, word) >= 0) && word.length > size) { best = menu; size = word.length; }
  if (!best && loose && rest.length >= 3) { size = Infinity; for (const { words, ...menu } of QUICK_MENUS) for (const word of words) if (word.startsWith(rest) && word.length < size) { best = menu; size = word.length; } }
  return best;
}

/** Generic words in record names count less than the specific ones ("cicilan" vs "laptop"). */
export const GENERIC = new Set(['utang', 'hutang', 'cicilan', 'pinjaman', 'kredit', 'kartu', 'bank', 'dana', 'tabungan', 'klaim', 'kantor', 'target', 'untuk', 'buat', 'yang', 'dan', 'baru']);
/**
 * The record whose name words appear in the text: one clear winner, or none. Several records for the same
 * name (e.g. two loans to Andi) are not a real tie: the first one in `records` (the oldest) is taken.
 */
function bestMatch<T extends { id: string }>(text: string, records: T[], names: (record: T) => string[]) {
  let best: { record: T; score: number; words: string[]; key: string } | null = null, tie = false;
  for (const record of records) {
    const key = names(record).map(name => lower(name || '').trim()).join('|');
    const words = [...new Set(names(record).flatMap(name => lower(name || '').split(/[^\p{L}\p{N}]+/u)).filter(word => word.length >= 3))];
    const hits = words.filter(word => wordAt(text, word) >= 0);
    const score = hits.reduce((n, word) => n + (GENERIC.has(word) ? 1 : 3), 0);
    if (!score) continue;
    if (!best || score > best.score) { best = { record, score, words: hits, key }; tie = false; }
    else if (score === best.score && key !== best.key) tie = true;
  }
  return best && !tie ? best : null;
}

type Cat = QuickContext['categories'][number];
/**
 * A category named in the text: its whole name ("makan & minum"), or one of its words, whole or begun
 * ("transport" → Transportasi, "minuman" → Minuman). A category and its own subcategory matching equally → the category.
 */
function namedCategory(text: string, own: Cat[]) {
  const exact = [...own].sort((a, b) => b.name.length - a.name.length).find(c => wordAt(text, lower(c.name)) >= 0);
  if (exact) return exact;
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3);
  let best: Cat | undefined, score = 0, tie = false;
  for (const c of own) {
    const parts = lower(c.name).split(/[^\p{L}\p{N}]+/u).filter(p => p.length >= 3);
    const s = parts.reduce((n, p) => n + (words.includes(p) ? 3 : p.length >= 4 && words.some(w => w.length >= 4 && (p.startsWith(w) || w.startsWith(p))) ? 2 : 0), 0);
    if (!s || s < score) continue;
    if (s > score) { best = c; score = s; tie = false; }
    else if (best && c.parentId === best.id) continue;
    else if (best && best.parentId === c.id) best = c;
    else tie = true;
  }
  return tie ? undefined : best;
}
/** Words that set the scene for a whole top-level category ("makan traveling" is Travel's Makan). */
const SCENES: [RegExp, string[]][] = [
  [/\b(liburan|traveling|travelling|travel|trip|wisata|jalan-jalan|jalan jalan|mudik|staycation|vacation|holiday|healing)\b/, ['travel', 'liburan', 'perjalanan']],
  [/\b(kantor|kerja|dinas|meeting|klien|client)\b/, ['kerja']],
  [/\b(kendaraan|motor|mobil)\b/, ['kendaraan']],
  [/\b(rumah|dapur|kamar)\b/, ['rumah']],
  [/\b(kuliah|sekolah|kampus|les)\b/, ['pendidikan']],
];
const sameWord = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
const wordsOf = (text: string) => lower(text).replace(/&/g, ' dan ').split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3 && !['dan', 'yang', 'untuk', 'buat', 'lainnya'].includes(w));
/**
 * What an Anggaran is for, read like a person would:
 *  1. a scene word picks the top-level category and a word naming one of its subcategories picks that
 *     ("makan traveling", "transport liburan" → Travel › Makan / Transport Lokal);
 *  2. a category named in full ("Makan & Minum", "makan dan minum", "Makan Siang");
 *  3. otherwise the same context engine as spending (lib/categorize.ts: "ngopi" → Kopi, "sayur" → Bahan Makanan,
 *     "makan" → Makan & Minum), which also knows the person's habits. A subcategory named exactly but living under a
 *     different parent ("Makan" under Travel) only wins when its parent is mentioned;
 *  4. several things joined by "dan", "&" or commas under one parent become several subcategories.
 */
function budgetCategory(scope: string, text: string, own: Cat[], _history: QuickContext['history']): { cat: Cat; subs: Cat[]; why: string; label?: string } | undefined {
  const tops = own.filter(c => !c.parentId), childrenOf = (id: string) => own.filter(c => c.parentId === id);
  scope = lower(scope).replace(/\bskin care\b/g, 'skincare').replace(/\bkos\b/g, 'kost').replace(/[:;]/g, ' ');
  // "makan kecuali delivery", "hiburan selain bioskop dan konser": every subcategory of the main one but those.
  const except = scope.match(/^(.*?)\s*\b(?:kecuali|selain|tanpa|di ?luar|minus|except|bukan)\b\s+(.+)$/);
  if (except) {
    const whole = budgetCategory(except[1], except[1], own, _history);
    const top = whole && (whole.cat.parentId ? own.find(c => c.id === whole.cat.parentId) : whole.cat);
    if (top) {
      const left = except[2].split(/\s*(?:,|&|\+|\bdan\b|\/)\s*/).map(p => p.trim()).filter(Boolean).map(part => budgetCategory(part, part, own, _history)?.cat).filter((c): c is Cat => Boolean(c && c.parentId === top.id));
      const keep = own.filter(c => c.parentId === top.id && !left.some(x => x.id === c.id));
      if (left.length && keep.length) return { cat: keep[0], subs: keep, why: `${top.name} tanpa ${left.map(c => c.name).join(', ')}`, label: `${top.name} (tanpa ${left.map(c => c.name).join(', ')})` };
    }
  }
  // "khusus / hanya / cuma X": only X.
  const only = scope.match(/\b(?:khusus|hanya|cuma|cuman|only)\b\s+(.+)$/);
  if (only) { const inner = budgetCategory(only[1], only[1], own, _history); if (inner) return inner; }
  const words = wordsOf(scope);
  if (!words.length) return undefined;
  const parentOf = (c: Cat) => c.parentId ? own.find(p => p.id === c.parentId) : undefined;
  // 1. The scene.
  for (const [pattern, names] of SCENES) {
    if (!pattern.test(text)) continue;
    const top = tops.find(t => names.some(n => lower(t.name).includes(n)));
    if (!top) continue;
    const sceneWords = new Set(wordsOf(text.match(pattern)?.[0] || '').concat(wordsOf(top.name)));
    const rest = words.filter(w => !sceneWords.has(w));
    const sub = childrenOf(top.id).find(c => !/lainnya/i.test(c.name) && wordsOf(c.name).some(n => rest.some(w => sameWord(w, n))));
    if (sub) return { cat: sub, subs: [sub], why: `“${rest.join(' ')}” saat ${lower(top.name)} → ${top.name} › ${sub.name}` };
    if (!rest.length || rest.every(w => names.some(n => w.includes(n)))) return { cat: top, subs: [], why: `untuk ${lower(top.name)}` };
  }
  // Word meaning only: a habit of logging "makan" as Makan siang must not shrink a budget for all food.
  const guessFor = (t: string) => { const g = suggestCategory({ text: lower(t), item: lower(t), amount: 0, type: 'expense' }, { categories: own, history: [] }); const c = g && own.find(x => x.id === (g.subcategoryId || g.categoryId)); return c ? { c, why: g?.why } : undefined; };
  // 2. Several things under one parent ("pulsa dan kuota").
  const parts = scope.split(/\s*(?:,|&|\+|\bdan\b|\bsama\b|\/)\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    // "makan siang dan malam": a short part borrows the first word of the part before it ("malam" → "makan malam").
    const found = parts.map((part, i) => {
      const direct = guessFor(part)?.c, head = i ? parts[i - 1].split(' ')[0] : '';
      if (i && !direct && !part.includes(' ') && head && head !== part) { const joined = guessFor(`${head} ${part}`)?.c; if (joined?.parentId) return joined; }
      return direct;
    }).filter((c): c is Cat => Boolean(c));
    const parentIds = new Set(found.map(c => c.parentId || c.id));
    if (found.length === parts.length && parentIds.size === 1) {
      const top = own.find(c => c.id === [...parentIds][0])!;
      const subs = [...new Map(found.filter(c => c.parentId).map(c => [c.id, c])).values()];
      if (found.some(c => !c.parentId) || !subs.length) return { cat: top, subs: [], why: `semua masuk ${top.name}` };
      return { cat: subs[0], subs, why: `${subs.map(c => c.name).join(' + ')} di ${top.name}` };
    }
  }
  // 3. Named in full (& read as "dan"), the longest name first.
  const normal = ` ${words.join(' ')} `;
  const full = [...own].filter(c => !/lainnya/i.test(c.name)).sort((a, b) => b.name.length - a.name.length).find(c => { const n = wordsOf(c.name).join(' '); return n && normal.includes(` ${n} `); });
  if (full) {
    const parent = parentOf(full);
    if (!parent || words.some(w => wordsOf(parent.name).some(n => sameWord(w, n)))) return { cat: full, subs: full.parentId ? [full] : [], why: `kategori ${full.name}` };
    // A subcategory's name alone ("makan"): trust it only if the context engine agrees on its parent.
    const guess = guessFor(scope);
    if (guess && (guess.c.parentId || guess.c.id) !== parent.id) return { cat: guess.c, subs: guess.c.parentId ? [guess.c] : [], why: `${guess.why || `“${scope.trim()}”`} (bukan ${parent.name} › ${full.name})` };
    return { cat: full, subs: [full], why: `kategori ${parent.name} › ${full.name}` };
  }
  // 4. The context engine.
  const guess = guessFor(scope);
  if (guess) return { cat: guess.c, subs: guess.c.parentId ? [guess.c] : [], why: guess.why || `“${scope.trim()}” → ${guess.c.name}` };
  // 5. A name that only partly matches ("hiburan" → Nongkrong & Hiburan), or common words.
  const named = namedCategory(scope, own) || hintedCategory(scope, own);
  return named ? { cat: named, subs: named.parentId ? [named] : [], why: `kategori ${named.name}` } : undefined;
}
/**
 * Spending during a trip or for work goes to that category's matching subcategory: the item's own meaning (from the
 * context engine, without the scene words) is matched to the scene's subcategories by name ("makan" → Travel › Makan,
 * "grab" → Taxi / Online → Travel › Transport Lokal, "makan" on "dinas" → Kerja › Makan Kerja).
 */
const SPEND_SCENES: [RegExp, string[]][] = [SCENES[0], [/\b(dinas|perjalanan dinas|klien|client|meeting)\b/, ['kerja']]];
function sceneCategory(text: string, item: string, own: Cat[], history: QuickContext['history'], current: { categoryId: string | null; subcategoryId: string | null } | null) {
  for (const [pattern, names] of SPEND_SCENES) {
    const found = text.match(pattern);
    if (!found) continue;
    const top = own.find(c => !c.parentId && c.type === 'expense' && names.some(n => lower(c.name).includes(n)));
    if (!top) continue;
    const subs = own.filter(c => c.parentId === top.id && !/lainnya/i.test(c.name));
    if (current?.subcategoryId && subs.some(c => c.id === current.subcategoryId)) return null;
    const plain = lower(item).replace(pattern, ' ').replace(/\b(pas|waktu|saat|selama|ketika|di|ke|pada|untuk|buat)\b/g, ' ').trim();
    const meaning = plain ? suggestCategory({ text: plain, item: plain, amount: 0, type: 'expense' }, { categories: own, history }) : null;
    const hints = [
      ...wordsOf(plain).map(w => [w, 3] as [string, number]),
      ...(meaning ? wordsOf(own.find(c => c.id === meaning.subcategoryId)?.name || '').map(w => [w, 2] as [string, number]) : []),
      ...(meaning ? wordsOf(own.find(c => c.id === meaning.categoryId)?.name || '').map(w => [w, 1] as [string, number]) : []),
    ].filter(([w]) => !names.some(n => w.includes(n)));
    let best: Cat | undefined, score = 0;
    for (const sub of subs) { const value = wordsOf(sub.name).reduce((n, word) => n + Math.max(0, ...hints.filter(([w]) => sameWord(w, word)).map(([, v]) => v)), 0); if (value > score) { best = sub; score = value; } }
    if (best) return { categoryId: top.id, subcategoryId: best.id, why: `${plain || 'ini'} saat ${found[0]} → ${top.name} › ${best.name}` };
  }
  return null;
}
/** The top-level category that common words point to (kopi → Makan & Minum). */
function hintedCategory(text: string, own: Cat[]) {
  const hinted = HINTS.find(([words]) => words.test(text));
  return hinted ? own.filter(c => !c.parentId).find(c => hinted[1].some(word => lower(c.name).includes(word))) : undefined;
}

/** Somebody's name: the word right after a verb or "dari/ke/sama…", or before the verb when they are the subject. */
/** Words that follow "ke / bayar / dari" but are not people. */
const NOT_PERSON = new Set(['rekening', 'rek', 'atm', 'bank', 'tabungan', 'dompet', 'toko', 'warung', 'kantor', 'kos', 'kost', 'kosan', 'rumah', 'sekolah', 'kampus', 'listrik', 'pulsa', 'kuota', 'paket', 'parkir', 'tol', 'ojol', 'ojek', 'admin', 'pajak', 'cicilan', 'tagihan', 'wifi', 'internet', 'air', 'gas', 'asuransi', 'sewa', 'iuran', 'kas', 'arisan', 'zakat', 'sedekah', 'infaq', 'infak', 'donasi', 'sumbangan', 'sana', 'situ', 'sini', 'mana', 'orang', 'online', 'gaji', 'gajian', 'bonus', 'klien', 'client', 'proyek', 'project', 'freelance', 'jualan', 'usaha', 'kerja', 'kerjaan', 'kantin', 'laundry', 'londri', 'bengkel', 'servis', 'service', 'dokter', 'apotek', 'rs', 'rumah sakit', 'spp', 'les', 'kursus', 'langganan', 'netflix', 'spotify', 'youtube', 'utang', 'hutang', 'pinjaman', 'nya', 'tiket', 'makan', 'minum', 'belanja', 'bulanan', 'mingguan', 'harian', 'semua', 'sisa', 'dp', 'uang', 'duit', 'cash', 'tunai', 'saldo']);
/**
 * The other person of spending or income, when no record names them: "kirim 50rb ke sinta", "transfer ke budi" (to),
 * "bayar budi" (pay), "dapet dari aldi" (from). Never a configured wallet, a known place or an everyday thing.
 */
function counterpartyIn(text: string, ctx: QuickContext): { word: string; at: number; end: number; cue: 'to' | 'pay' | 'from' } | null {
  const places = knownPlaces(ctx);
  const ok = (w: string) => w.length >= 3 && !NOT_A_NAME.has(w) && !NOT_PERSON.has(w) && !/\d/.test(w) && !walletsIn(w, ctx.wallets).length && !places.has(w) && !ctx.categories.some(c => lower(c.name).split(/[^\p{L}]+/u).includes(w)) && !HINTS.some(([re]) => re.test(w));
  const tries: [RegExp, 'to' | 'pay' | 'from'][] = [
    [/\b(?:tf|transfer|trf|kirim|ngirim|kasih|ngasih|kirimin|transferin)\b.*?\b(?:ke|kepada|buat|untuk|utk)\s+(\p{L}+)/u, 'to'],
    [/\b(?:bayar|bayarin|byr)\s+(\p{L}+)/u, 'pay'],
    [/\b(?:dari|dr)\s+(\p{L}+)/u, 'from'],
  ];
  for (const [re, cue] of tries) {
    const m = re.exec(text); if (!m) continue;
    let word = m[1], at = (m.index ?? 0) + m[0].length - word.length;
    // "ke kak dina" → Dina; "ke ibu" → Ibu.
    if (HONORIFIC.has(word)) { const after = text.slice(at + word.length).match(/^\s+(\p{L}+)/u); if (after && ok(after[1])) { at += word.length + after[0].length - after[1].length; word = after[1]; } else return { word, at, end: at + word.length, cue }; }
    if (ok(word)) return { word, at, end: at + word.length, cue };
  }
  return null;
}
/** V3.2: a word that can be somebody's name (not a small word, a wallet, a known place, a category or an everyday thing). */
export function nameLike(word: string, ctx: QuickContext) {
  const places = knownPlaces(ctx), w = lower(word);
  return w.length >= 3 && /^\p{L}+$/u.test(w) && !NOT_A_NAME.has(w) && !NOT_PERSON.has(w) && !walletsIn(w, ctx.wallets).length && !places.has(w) && !ctx.categories.some(c => lower(c.name).split(/[^\p{L}]+/u).includes(w)) && !HINTS.some(([re]) => re.test(w));
}
export const isHonorific = (word: string) => HONORIFIC.has(lower(word));
function personAfter(text: string, pattern: RegExp) {
  const m = text.match(pattern); if (!m) return '';
  const next = text.slice((m.index ?? 0) + m[0].length).trim().split(/\s+/);
  // The first word that can be a name, past small words, honorifics and time words ("dari kak tio", "nalangin makan siang tono").
  const word = next.find(w => w && !NOT_A_NAME.has(w) && !/\d/.test(w));
  if (word && next.slice(0, next.indexOf(word)).every(w => NOT_A_NAME.has(w) || /\d/.test(w))) return word;
  return HONORIFIC.has(next[0]) ? next[0] : '';
}

/** The type of a new wallet from its name or the words around it. */
function walletTypeOf(text: string): Wallet['type'] {
  if (/\b(kartu kredit|credit card|cc|paylater|kredivo|akulaku)\b/.test(text)) return 'credit';
  if (/\b(investasi|reksadana|reksa dana|saham|rdn|bibit|ajaib|stockbit|pluang|obligasi|sbn|crypto|kripto|emas)\b/.test(text)) return 'investment';
  if (/\b(tabungan|deposito|celengan|dana darurat)\b/.test(text)) return 'savings';
  if (/\b(e-?wallet|ewallet|dompet digital|gopay|ovo|dana|shopeepay|shopee pay|linkaja|flip|e-?money|flazz|tapcash|brizzi)\b/.test(text)) return 'ewallet';
  if (/\b(tunai|cash|kas|dompet fisik|uang fisik)\b/.test(text)) return 'cash';
  return 'bank';
}

/** `mode`: 'auto', a kind group picked on a chip (Utang, Anggaran…), or an exact kind (e.g. 'receivable_payment'). */
export function parseQuickText(input: string, ctx: QuickContext, mode: QuickGroup | QuickKind = 'auto'): QuickResult | null {
  const group = mode as QuickGroup;
  const text = amountWords(lower(input.trim()).replace(/\s+/g, ' '));
  if (!text) return null;
  const understood: string[] = [];
  const today = ctx.today;

  // Amount: a number with a unit or "rp" wins; otherwise the biggest plain number that isn't a date or a count.
  const amounts = findAmounts(text);
  const wallets = walletsIn(text, ctx.wallets);
  // A plain two-digit number is money only next to a wallet or a paying verb ("bensin 80 krom"), not in a name ("iphone 15").
  const main = [mainAmount(amounts)].map(m => m && !m.marked && m.value < 100 && !wallets.length && !/\b(beli|bayar|isi|jajan|byr)\b/.test(text) ? mainAmount(amounts.filter(a => a.marked || a.value >= 100)) : m)[0];
  let amount = main?.value || 0, amountText = main?.text || '';

  const recipient = counterpartyIn(text, ctx);
  const openDebts = (ctx.debts || []).filter(d => d.outstandingAmount > 0);
  const openReceivables = (ctx.receivables || []).filter(r => r.remainingAmount > 0).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const openClaims = (ctx.claims || []).filter(c => c.remainingAmount > 0);
  const debt = bestMatch(text, openDebts, d => [d.name, d.provider]);
  const receivable = bestMatch(text, openReceivables, r => [r.person]);
  const claim = bestMatch(text, openClaims, c => [c.name]);
  const fund = bestMatch(text, (ctx.funds || []).filter(f => !f.isArchived), f => [f.name]);
  const wish = bestMatch(text, (ctx.wishlist || []).filter(w => w.status === 'active'), w => [w.name]);
  const firstVerb = (pattern: RegExp) => { const m = text.match(pattern); return m ? m.index ?? 0 : -1; };
  /** The person is the one doing it: their name comes before the verb ("andi bayar", "andi pinjam"). */
  const subject = (words: string[], verb: RegExp) => { const v = firstVerb(verb); if (v < 0) return false; return words.some(word => { const i = wordAt(text, word); return i >= 0 && i < v; }); };
  const schedule = scheduleOf(text, today, group !== 'auto');
  const soon = readDate(text, today, false, false, ctx.salaryDay);
  // "bayar pajak pas gajian": the salary day is a time here, not income.
  const flowText = SALARY_WHEN.test(text) ? text.replace(SALARY_WHEN, ' ') : text;
  const saving = SAVE_WORDS.test(text) || FILL_WORDS.test(text);
  // "bunga pinjaman 200rb", "denda cicilan 50rb": the cost of a loan is spending, not a new loan or a repayment of one.
  const loanCost = /\b(bunga|biaya|denda|admin|provisi|asuransi)\s+(?:pinjaman|kredit|utang|hutang|cicilan|paylater|kpr)\b/.test(text);
  // "saldo bca sekarang 12jt", "gopay tinggal 150rb": what a wallet holds now.
  const balanceWallet = (BALANCE_WORDS.test(text) && (BALANCE_NOW.test(text) || /^saldo\b/.test(text)) || /\b(tinggal|sisa)\s*(?:rp\.?\s*)?\d/.test(text) && !BALANCE_WORDS.test(text)) && !BALANCE_MOVE.test(text) && !PAY.test(text) ? wallets[0] : undefined;
  // "target liburan 10jt" makes a tujuan dana; "nabung ke target liburan" / "isi target" fills one.
  const fundNoun = firstVerb(FUND_NOUN), fillAt = [firstVerb(SAVE_WORDS), firstVerb(/\b(isi|masukin|masukkan|top ?up|(?:tambah|tambahin|nambah|nambahin)\s+ke)\b/)].filter(i => i >= 0);
  const createsFund = fundNoun >= 0 && (FUND_CREATE.test(text) || !fillAt.length || fundNoun < Math.min(...fillAt));
  // "impian ps5 8jt nabung 500rb per bulan" makes a wish; "pengen nabung 1jt buat headphone" fills the one on the list.
  // Not a wish: something already bought ("beli kado impian istri") or eaten ("ingin makan bakso").
  const wishNoun = firstVerb(WISH_NOUN), boughtAt = firstVerb(BOUGHT), consumed = /\b(makan|minum|jajan|ngopi|ngemil|sarapan)\b/.test(text) && !/\b(wishlist|wish list|impian)\b/.test(text);
  const createsWish = wishNoun >= 0 && !LEND_OUT.test(text) && !consumed && !(boughtAt >= 0 && boughtAt < wishNoun) && (!fillAt.length || wishNoun < Math.min(...fillAt) && !wish);

  // What kind of entry is it?
  let kind: QuickKind;
  const claimKind = (): QuickKind => CLAIM_PAID.test(text) ? 'claim_payment' : 'claim_new';
  const targetKind = (): QuickKind => fund || !wish ? 'target' : 'wish';
  const receivableKind = (): QuickKind => receivable && (subject(receivable.words, PAY) || RECEIVE.test(text) || PAID_OFF.test(text)) && !LEND_OUT.test(text) ? 'receivable_payment' : 'receivable_new';
  const debtKind = (): QuickKind => PAY.test(text) && (debt || DEBT_WORDS.test(text) || !BORROW.test(text)) && !/\b(dipinjemin|dipinjamin|dipinjami)\b/.test(text) ? 'debt_payment' : 'debt_new';
  const menuKind = (): QuickKind | null => {
    if (!amounts.some(a => a.marked) && menuIn(text, ctx)) return 'open';
    if (CATEGORY_WORDS.test(text)) return 'category_new';
    if (WALLET_NEW.test(text) && !BOUGHT.test(text)) return 'wallet_new';
    if (balanceWallet && amount) return 'balance';
    if (/\b(anggaran|budget|bujet|budjet)\b/.test(text) || /\bjatah\b/.test(text) && BUDGET_PERIOD.test(text)) return 'budget';
    if (createsFund) return 'fund_new';
    if (createsWish) return 'wish_new';
    if (NOTE_WORDS.test(text)) return 'note_new';
    return null;
  };
  const txKind = (): QuickKind => {
    if (group === 'expense' || group === 'income' || group === 'transfer') return group;
    if (group === 'claim') return claimKind();
    if (group === 'receivable') return receivableKind();
    if (group === 'debt') return debtKind();
    if (CLAIM_WORDS.test(text) || LEND_OUT.test(text) && /\bkantor\b/.test(text)) return claimKind();
    // "uang hotel bandung udah cair": an open claim named with a payout word.
    if (claim && /\b(cair|dicairkan|diganti|reimburse)\b/.test(text)) return 'claim_payment';
    if ((CASH_OUT.test(text) || CASH_IN.test(text)) && !/\b(biaya|admin|fee)\b/.test(text) && ctx.wallets.some(w => w.type === 'cash' || /tunai|cash/i.test(w.name))) return 'transfer';
    if (wallets.length >= 2 && wallets.some(w => /\b(isi|isi saldo|top ?up|topup)\s+$/.test(text.slice(0, w.at)))) return 'transfer';
    // "transfer 100k dari jago ke budi": Budi is a person, not a wallet → money paid to someone (spending), not a transfer.
    const toPerson = recipient?.cue === 'to' && !wallets.some(w => /\b(ke|kepada|masuk(?: ke)?|top ?up|topup|isi(?: saldo)?)\s+$/.test(text.slice(0, w.at)));
    if (TRANSFER_WORDS.test(text) && !toPerson && (wallets.length >= 2 || wallets.length === 1 && /\b(topup|top up|isi saldo|tambah saldo)\b|\b(tf|transfer|pindah|pindahin)\b.*\b(ke|dari)\s+\S+/.test(text))) return 'transfer';
    if (SAVE_WORDS.test(text) || (fund || wish) && (FILL_WORDS.test(text) || /\b(ke|buat|untuk|utk)\b/.test(text) && !BORROW.test(text) && !PAY.test(text))) return targetKind();
    // "budi minjemin aku 300rb": somebody lent to me.
    if (LEND_OUT.test(text) && LENT_TO_ME.test(text)) return 'debt_new';
    if (LEND_OUT.test(text)) return 'receivable_new';
    if (receivable && (subject(receivable.words, PAY) || RECEIVE.test(text) && /\b(dari|dr)\b/.test(text))) return 'receivable_payment';
    if (loanCost) return flowOf(flowText);
    if (PAY.test(text) && (debt || DEBT_WORDS.test(text))) return 'debt_payment';
    if (BORROW.test(text)) {
      // "andi pinjam 100rb" → Andi owes me; "pinjam 100rb dari budi" / "dipinjemin budi" → I owe Budi.
      const before = text.slice(0, Math.max(0, firstVerb(BORROW))).trim().split(/\s+/).filter(w => w && !NOT_A_NAME.has(w) && !/\d/.test(w));
      return before.length && !/\b(dipinjemin|dipinjamin|dipinjami)\b/.test(text) ? 'receivable_new' : 'debt_new';
    }
    return flowOf(flowText);
  };
  /** Spending or income, for schedules and plans. */
  const flowKind = (): 'expense' | 'income' => flowOf(flowText);
  let base: QuickKind | null = null;
  if (mode in QUICK_LABELS) kind = mode as QuickKind;
  else if (group === 'auto') {
    kind = menuKind() || (base = txKind());
    // A spending or income sentence that repeats, or that is still to come, is a schedule or a plan;
    // "ingetin bayar utang budi tgl 1" (other kinds) is a reminder note.
    if (kind === 'expense' || kind === 'income') {
      if (schedule && amount) kind = 'recurring_new';
      else if (REMIND.test(text) || PLAN_WORDS.test(text) || soon?.ahead) kind = amount ? 'plan_new' : 'note_new';
    } else if (base && (REMIND.test(text) || PLAN_WORDS.test(text))) kind = 'note_new';
    // "ingetin tagih andi 150rb": a reminder about a debt, loan or claim is a note, not new spending.
    if ((kind === 'plan_new' || kind === 'recurring_new') && REMIND.test(text) && (debt || receivable || claim)) kind = 'note_new';
  }
  else if (group === 'budget') kind = 'budget';
  else if (group === 'category') kind = 'category_new';
  else if (group === 'recurring') kind = 'recurring_new';
  else if (group === 'plan') kind = amount && !NOTE_WORDS.test(text) ? 'plan_new' : 'note_new';
  else if (group === 'open') kind = 'open';
  else if (group === 'wallet') kind = wallets.length && amount && !WALLET_NEW.test(text) ? 'balance' : 'wallet_new';
  else if (group === 'target') kind = fund && !createsFund || saving && !createsFund ? 'target' : 'fund_new';
  else if (group === 'wish') kind = wish && !WISH_NOUN.test(text) ? 'wish' : 'wish_new';
  else kind = txKind();

  const result: QuickResult = { kind, amount, date: today, preset: {}, understood };
  const mentioned = (list: typeof wallets) => list.reduce((t, w) => t.replace(new RegExp(`\\b(?:pakai|pake|pk|via|dari|ke|masuk|pakek|di|simpan di|disimpan di)?\\s*${escape(w.word)}\\b`), ' '), ` ${text} `);
  /** The text without the amounts that were used (a "15" in "iphone 15" stays). */
  const without = (t: string, ...used: (Amount | undefined)[]) => used.reduce((s, a) => a ? s.replace(a.text, ' ') : s, t);

  // The other menus.
  if (kind === 'open') {
    const menu = menuIn(text, ctx, true);
    if (menu) result.menu = menu;
    return result;
  }
  if (kind === 'category_new') {
    const all = ctx.categories.filter(c => !c.isArchived), parents = all.filter(c => !c.parentId);
    const asked = SUB_WORDS.test(text);
    // "subkategori parkir di transportasi", "kategori jajan ke makan & minum": the part after "di / ke / dalam" names the parent.
    const split = text.match(/^(.*?)\s+(?:di dalam|di bawah|dibawah|di|dalam|ke|bagian|induknya|induk|parentnya|parent|masuk ke|masuk)\s+(.+)$/);
    const parent = split ? namedCategory(split[2], parents) : asked ? namedCategory(text.replace(CATEGORY_WORDS, ' '), parents) : undefined;
    let named = strip(split && parent ? split[1] : parent ? text.replace(new RegExp(`\\b${escape(lower(parent.name))}\\b`), ' ') : text, CATEGORY_WORDS, /\bsub\b/g, CREATE_WORDS, /\b(?:jenis|tipe|untuk|buat|utk)\s+(?:pemasukan|pengeluaran|tabungan)\b/g, /\b(pemasukan|pendapatan|penghasilan|income|pengeluaran|expense)\b/g, /[:,]/g);
    if (!named && /\btabungan\b/.test(text)) named = 'tabungan';
    const type: Category['type'] = parent ? parent.type : /\b(pemasukan|pendapatan|penghasilan|income)\b/.test(text) ? 'income' : /\b(?:jenis|tipe|untuk|buat|utk)\s+tabungan\b/.test(text) ? 'savings' : 'expense';
    const name = title(named);
    const existing = all.find(c => lower(c.name) === lower(name) && (c.parentId || null) === (parent?.id || null) && (parent || c.type === type));
    result.name = name;
    result.category = { type, parentId: parent?.id || null, ...(existing ? { existingId: existing.id } : {}), ...(asked && !parent ? { parentAsked: true } : {}) };
    return result;
  }
  if (kind === 'wallet_new') {
    const rest = strip(without(text, main), /\b(?:buat|bikin|bikinin|tambah|tambahin|tambahkan|daftar|daftarin|buka)\s+(?:dompet|rekening|rek|akun|e-?wallet)\b/g, /\b(dompet|rekening|rek|akun|e-?wallet|ewallet)\b/g, /\bsaldo(?:\s*awal)?(?:nya)?\b/g, /\b(baru|isi|isinya|sebesar|dengan|namanya|bernama|nama|jenis|tipe|rp)\b/g, /[:,]/g);
    const name = rest === 'dana' ? 'DANA' : title(rest);
    const existing = ctx.wallets.find(w => !w.isArchived && lower(w.name) === lower(name));
    result.name = name;
    result.wallet = { type: walletTypeOf(text), ...(existing ? { existingId: existing.id } : {}) };
    return result;
  }
  if (kind === 'balance') {
    const wallet = balanceWallet || wallets[0];
    if (wallet) result.preset.walletId = wallet.id;
    return result;
  }
  if (kind === 'budget') {
    const own = ctx.categories.filter(c => !c.isArchived && (c.type === 'expense' || c.type === 'savings'));
    const scope = strip(without(text, main), BUDGET_WORDS, FREQ_PHRASES, DATE_PHRASES, /\b(baru|buat|bikin|untuk|utk|jadi|sebesar|maksimal|maks|max|batas|limit|naik|naikin|naikkan|tambah|tambahin|tambahkan|turun|turunin|turunkan|kurang|kurangi|kurangin|potong|ubah|ganti|kalender|siklus|gajian|mulai)\b/g);
    const smart = budgetCategory(scope, text, own, ctx.history || []);
    const cat = smart?.cat || namedCategory(scope, own) || hintedCategory(scope || text, own);
    const categoryId = cat ? cat.parentId || cat.id : undefined, subs = smart ? smart.subs.map(c => c.id) : cat?.parentId ? [cat.id] : [];
    if (smart?.why) result.why = smart.why;
    const subsOf = (b: NonNullable<QuickContext['budgets']>[number]) => (b.subcategoryIds?.length ? b.subcategoryIds : b.subcategoryId ? [b.subcategoryId] : []).slice().sort().join();
    const weekly = /\b(?:per|tiap|setiap)\s*(?:minggu|pekan)\b|\/\s*minggu\b|\b(mingguan|seminggu|minggu ini|pekan ini)\b/.test(text);
    const calendar = /\b(kalender|bulan kalender)\b/.test(text), custom = text.match(/\bmulai\s*(?:tgl|tanggal)\s*(\d{1,2})\b/);
    const salary = /\b(siklus|gajian|per gajian)\b/.test(text);
    const period = weekly || calendar || custom || salary;
    const cycleType: Budget['cycleType'] = weekly ? 'weekly' : custom ? 'custom' : calendar ? 'calendar' : 'salary';
    const budgets = (ctx.budgets || []).filter(b => !period || (b.cycleType || 'salary') === cycleType);
    const existing = categoryId ? budgets.filter(b => b.categoryId === categoryId && subsOf(b) === subs.slice().sort().join()).sort((a, b) => Number(b.active) - Number(a.active))[0]
      : bestMatch(scope, budgets, b => [b.name])?.record;
    if (existing && amount && !/\bjadi\b/.test(text)) {
      if (/\b(naik|naikin|naikkan|tambah|tambahin|tambahkan)\b/.test(text)) amount = existing.amount + amount;
      else if (/\b(turun|turunin|turunkan|kurang|kurangi|kurangin|potong)\b/.test(text)) amount = Math.max(0, existing.amount - amount);
    }
    result.amount = amount;
    result.name = existing?.name || smart?.label || (smart && smart.subs.length > 3 ? `${own.find(c => c.id === smart.subs[0].parentId)?.name || ''} (${smart.subs.length} subkategori)` : smart && smart.subs.length > 1 ? smart.subs.map(c => c.name).join(' & ') : cat?.name) || '';
    const weekday = text.match(/\bmulai\s+(?:hari\s+)?(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu)\b/);
    result.budget = { ...(existing ? { id: existing.id, previous: existing.amount } : {}), categoryId: existing?.categoryId ?? categoryId, subcategoryIds: existing ? subsOf(existing).split(',').filter(Boolean) : subs, cycleType: existing ? existing.cycleType || 'salary' : cycleType, ...(cycleType === 'weekly' ? { cycleStartDay: weekday ? (WEEKDAYS[weekday[1]] + 6) % 7 + 1 : 1 } : custom ? { cycleStartDay: Math.min(31, Math.max(1, Number(custom[1]))) } : {}) };
    return result;
  }
  if (kind === 'fund_new' || kind === 'wish_new') {
    // Two amounts: the price or target, and "nabung 500rb per bulan".
    const target = amounts.find(a => !a.monthly && a.marked) || amounts.filter(a => !a.monthly && a.value >= 100).sort((a, b) => b.value - a.value)[0];
    const monthly = amounts.find(a => a.monthly);
    result.amount = target?.value || 0;
    const deadline = readDate(text, today, true, true);
    const nouns = kind === 'fund_new' ? [FUND_NOUN, /\b(tujuan|nabung|menabung|tabung|tabungan buat|buat|untuk|utk|ke|di|sebesar|senilai|seharga|jadi|ubah|ganti|naikin|naikkan|dana buat)\b/g]
      : [WISH_NOUN, /\b(beli|punya|seharga|harga|harganya|sekitar|kira-kira|kurang lebih|sebesar|nabung|menabung|buat|untuk|utk|prioritas tinggi|prioritas|penting|urgent|mendesak|santai|nanti aja|kapan-kapan|mau)\b/g];
    // A wallet only counts when it's said where the money is kept ("di jago"): "dana" in "dana darurat" is not the DANA wallet.
    const keptIn = kind === 'fund_new' ? wallets.find(w => /\b(di|ke|simpan di|disimpan di|pakai|pake|masuk|masuk ke)\s+$/.test(text.slice(0, w.at))) : undefined;
    const rest = strip(without(mentioned(keptIn ? [keptIn] : []), target, monthly), /\b(?:target|tujuan dana|tujuan|wishlist|wish list)\s+baru\b/g, ...nouns, /\b(buat|bikin|bikinin|tambah|tambahin|tambahkan|pasang|set|namanya|bernama)\b/g, FREQ_PHRASES, DATE_PHRASES, /\b(sebelum|sampai|hingga|pada|per|tiap|setiap|sebulan|bulanan)\b/g, /[:,]/g);
    const name = title(rest);
    result.name = name;
    if (kind === 'fund_new') {
      const existing = (ctx.funds || []).find(f => !f.isArchived && lower(f.name) === lower(name));
      result.goal = { targetDate: deadline?.date || '', monthly: monthly?.value || 0, emergency: /\bdarurat\b/.test(text), ...(existing ? { existingId: existing.id } : {}) };
      if (keptIn) result.preset.walletId = keptIn.id;
    } else {
      const existing = (ctx.wishlist || []).find(w => w.status === 'active' && lower(w.name) === lower(name));
      const priority = /\b(prioritas tinggi|penting|urgent|mendesak|butuh banget|wajib)\b/.test(text) ? 1 : /\b(santai|nanti aja|kapan-kapan|kapan2|ga buru|gak buru|nggak buru)\b/.test(text) ? 3 : 2;
      result.goal = { targetDate: deadline?.date || '', monthly: monthly?.value || 0, priority, emoji: WISH_EMOJI.find(([words]) => words.test(text))?.[1] || '🎁', ...(existing ? { existingId: existing.id } : {}) };
    }
    return result;
  }
  if (kind === 'note_new') {
    const when = readDate(text, today, true, false, ctx.salaryDay);
    result.date = when?.date || today;
    result.reminder = REMIND.test(text);
    result.name = sentence(strip(without(text, main), NOTE_WORDS, /\b(ingetin|ingatkan|ingetkan|ingatin|pengingat|reminder|remind|jangan lupa|rencana|rencananya|berencana|planning|tolong|aku|saya|gue|gw|untuk|utk|buat|ya|dong|nanti)\b/g, DATE_PHRASES, /^[:\-–]+|[:]/g));
    return result;
  }

  // Transactions (and the schedules and plans built on them).
  const flow: QuickKind = kind === 'recurring_new' || kind === 'plan_new' ? (base === 'expense' || base === 'income' ? base : flowKind()) : kind;
  // A date still to come only belongs to plans; a transaction picked on a chip is recorded today.
  const when = kind === 'plan_new' ? readDate(text, today, true, false, ctx.salaryDay) : kind === 'recurring_new' || soon?.ahead ? null : soon;
  if (when?.label) understood.push(when.label);

  // "lunas" without a number: the whole remaining amount.
  if (!amount && (PAID_OFF.test(text) || flow === 'claim_payment')) {
    if (flow === 'debt_payment' && debt) amount = debt.record.outstandingAmount;
    if (flow === 'receivable_payment' && receivable) amount = receivable.record.remainingAmount;
    const oneClaim = claim?.record || (openClaims.length === 1 ? openClaims[0] : undefined);
    if (flow === 'claim_payment' && oneClaim) amount = oneClaim.remainingAmount;
  }
  // Without an amount only a schedule or a plan picked on a chip still shows (and asks for it).
  if (!amount && kind !== 'recurring_new' && kind !== 'plan_new') return null;

  const type: TxType | null = flow === 'expense' || flow === 'income' || flow === 'transfer' ? flow : flow === 'debt_payment' ? 'debt_payment' : flow === 'receivable_payment' ? 'receivable_payment' : flow === 'claim_payment' ? 'claim_payment' : flow === 'target' ? 'fund_contribution' : null;
  const preset: Partial<LedgerTx> = type ? { type, amount } : {};
  const date = kind === 'recurring_new' ? schedule?.date || today : when?.date || today;
  preset.date = date;
  Object.assign(result, { amount, date, preset });
  if (kind === 'recurring_new') {
    const mode: Recurring['mode'] = /\b(otomatis|auto|langsung catat|langsung dicatat|langsung tercatat)\b/.test(text) ? 'auto' : /\b(ingetin|ingatkan|pengingat|reminder)\b/.test(text) ? 'reminder' : /\b(draf|draft)\b/.test(text) ? 'draft' : 'inbox';
    result.schedule = { frequency: schedule?.frequency || 'monthly', mode, anchorDay: schedule?.anchorDay || Number(date.slice(8, 10)) };
    if (schedule) understood.push(schedule.label);
  }

  // Wallets: "dari bca ke gopay" for transfers; otherwise the wallet that was named.
  if (flow === 'transfer') {
    // Each wallet's role comes from the word before it: "dari" = out of it; "ke", "masuk", "top up", "isi" = into it.
    const role = (w: typeof wallets[number]) => { const before = text.slice(0, w.at); return /\b(dari|dr|pakai|pake|via|lewat)\s+$/.test(before) ? 'from' : /\b(ke|kepada|masuk(?: ke)?|top ?up|topup|isi(?: saldo)?|tambah saldo)\s+$/.test(before) ? 'to' : ''; };
    const cash = ctx.wallets.find(w => !w.isArchived && (w.type === 'cash' || /tunai|cash/i.test(w.name)));
    let source = wallets.find(w => role(w) === 'from'), target = wallets.find(w => role(w) === 'to' && w.id !== source?.id);
    const loose = wallets.filter(w => w !== source && w !== target && w.id !== cash?.id);
    if (CASH_OUT.test(text) && cash) { target = { ...cash, at: -1, word: '' }; source = source || loose[0]; }
    else if (CASH_IN.test(text) && cash) { source = { ...cash, at: -1, word: '' }; target = target || loose[0]; }
    else if (!source && !target) { source = wallets[0]; target = wallets[1]; }
    else if (!source) source = wallets.find(w => w.id !== target?.id && !role(w));
    else if (!target) target = wallets.find(w => w.id !== source?.id && !role(w));
    if (source) preset.walletId = source.id; if (target && target.id !== source?.id) preset.destinationWalletId = target.id;
  } else {
    // A wallet word that is really part of a record's name ("Dana Darurat" vs the wallet "Tabungan Darurat") doesn't count;
    // a wallet right after "dari / pake / via / masuk" wins.
    const taken = new Set([debt, receivable, claim, fund, wish].filter(Boolean).flatMap(match => match!.words));
    // "tarik tunai", "setor tunai" name an action, not the Tunai wallet.
    const named = wallets.filter(w => !taken.has(w.word) && !(/^(tunai|cash)$/.test(w.word) && /\b(tarik|narik|setor|nyetor)\s+$/.test(text.slice(0, w.at))));
    const cued = named.find(w => /\b(dari|dr|pakai|pake|pakek|pk|via|masuk|masuk ke|lewat)\s+$/.test(text.slice(0, w.at)));
    const chosen = cued || named[0];
    if (chosen) preset.walletId = chosen.id;
  }

  // What's left once the known parts are taken out is the item / description. V3: the merchant, the wallets and the
  // amount are found as spans on the clause first (lib/catat/entities.ts), so one cannot slide into another.
  const spending = flow === 'expense' || flow === 'income';
  // Dates and times are owned by their fields: protected boundaries for the merchant, blanked out of the description.
  const dateSpans = [...text.matchAll(new RegExp(DATE_PHRASES.source, 'g'))].map(m => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  const times = findTimes(text).map(t => ({ start: t.start, end: t.end, raw: t.raw }));
  const bounds = resolveBoundaries({ text, amount: main && main.text === amountText ? { index: main.index, text: main.text } : null, wallets, dates: dateSpans, times, flow, knownPlaces: knownPlaces(ctx) });
  result.entities = bounds;
  let rest = ` ${blankOut(text, spending ? bounds.blank : bounds.blank.filter(b => bounds.owned.some(o => o.start === b.start && o.end === b.end)))} `;
  if (!(main && main.text === amountText)) rest = rest.replace(amountText.toLowerCase(), ' ');
  if (spending && bounds.merchant) {
    const m = bounds.merchant, key = m.raw.replace(/\s+/g, '');
    const earlier = m.known ? null : ctx.history.find(t => t.merchant && lower(t.merchant).replace(/\s+/g, '').startsWith(key));
    preset.merchant = m.known ? m.value : earlier?.merchant || title(m.raw);
  }
  for (const w of wallets) rest = rest.replace(new RegExp(`\\b(?:pakai|pake|pk|via|dari|ke|masuk|pakek)?\\s*${escape(w.word)}\\b`), ' ');
  // Spending to someone / income from someone without a record: who it was (not part of the description).
  const other = spending && recipient && (recipient.cue !== 'from' || flow === 'income') ? recipient : null;
  if (other) {
    result.person = title(other.word); result.personCue = other.cue;
    rest = rest.replace(/\b(kirim|ngirim|kirimin|transferin|kasih|ngasih)\b/g, ' ');
    rest = rest.replace(new RegExp(`\\b(?:ke|kepada|buat|untuk|utk|dari|dr)?\\s*${escape(other.word)}\\b`), ' ');
  }
  const about = flow === 'debt_payment' ? debt : flow === 'receivable_payment' ? receivable : flow === 'claim_payment' ? claim : flow === 'target' ? fund : flow === 'wish' ? wish : flow === 'debt_new' ? debt : flow === 'receivable_new' ? receivable : null;
  const known = about?.words || [];

  if (flow === 'debt_new' || flow === 'receivable_new') {
    // Who: a known person if their name is in the text, otherwise the word next to the verb or "dari/ke/sama".
    const knownName = flow === 'debt_new' ? debt?.record.provider : receivable?.record.person;
    const person = knownName && known.some(word => wordAt(lower(knownName), word) >= 0) ? knownName
      : flow === 'debt_new' && LENT_TO_ME.test(text) ? text.slice(0, Math.max(0, firstVerb(LEND_OUT))).trim().split(/\s+/).filter(w => w && !NOT_A_NAME.has(w) && !/\d/.test(w)).pop() || ''
      : flow === 'debt_new' ? personAfter(text, /\b(dipinjemin|dipinjamin|dipinjami|dari|dr|sama|ama|sm|ke)\b/) || personAfter(text, BORROW)
      : personAfter(text, LEND_OUT) || personAfter(text, /\b(buat|untuk|utk|ke|sama|ama)\b/) || text.slice(0, Math.max(0, firstVerb(BORROW))).trim().split(/\s+/).find(w => w && !NOT_A_NAME.has(w) && !/\d/.test(w)) || '';
    result.person = person ? title(person) : '';
    if (person) rest = rest.replace(new RegExp(`\\b${escape(lower(person))}\\b`), ' ');
  }
  for (const word of known) rest = rest.replace(new RegExp(`\\b${escape(word)}\\b`, 'g'), ' ');
  rest = rest.replace(DATE_PHRASES, ' ').replace(/\b\d{1,2}\s*hari\s*(lalu|yang lalu|yg lalu)\b|\b(tgl|tanggal)\s*\d{1,2}\b/g, ' ');
  if (kind === 'recurring_new' || kind === 'plan_new') rest = rest.replace(FREQ_PHRASES, ' ').replace(PLAN_FILLERS, ' ');
  rest = rest.replace(VERBS, ' ').replace(FILLERS, ' ')
    .replace(flow.startsWith('claim') ? /\b(kantor|reimbursement|reimburse|direimburse|diklaim|klaim|claim|nanti|diganti|ganti|rembes)\b/g : /$^/, ' ').replace(flow === 'expense' || flow === 'income' ? /\b(pelunasan|lunasi|tabungan|target|wishlist|wish list)\b/g : /\b(pelunasan|lunasi|pinjaman|cicilan|angsuran|kredit|paylater|tabungan|target|wishlist|wish list)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const item = rest;

  if (flow === 'expense' || flow === 'income') {
    const verb = /\b(kirim|ngirim|kirimin)\b/.test(text) ? 'Kirim' : /\b(tf|transfer|trf|transferin)\b/.test(text) ? 'Transfer' : 'Bayar';
    if (item) preset.description = title(item);
    else if (flow === 'income' && /\bgaji|gajian\b/.test(text)) preset.description = 'Gaji';
    // "jajan 15rb": the word is both the act and the thing. With nothing else bought it stays the description
    // (the category still reads it as evidence: Makan & Minum › Jajanan).
    else if (flow === 'expense' && /\b(jajan|jajanan|belanja|ngopi|ngemil)\b/.test(text)) preset.description = title(text.match(/\b(jajan|jajanan|belanja|ngopi|ngemil)\b/)![1]);
    else if (result.person) preset.description = result.personCue === 'from' ? `Dari ${result.person}` : result.personCue === 'pay' ? `Bayar ${result.person}` : `${verb} ke ${result.person}`;
  }
  if (flow === 'debt_new') { result.name = /\bkasbon\b/.test(text) ? title(`kasbon${item ? ` ${item}` : ''}`) : item ? title(item) : result.person ? `Pinjaman ${result.person}` : 'Pinjaman'; }
  if (flow === 'receivable_new' && item) preset.description = title(item);
  if (flow === 'claim_new') result.name = item ? title(item) : 'Klaim kantor';
  if (flow === 'debt_payment' && debt) { preset.debtId = debt.record.id; preset.description = `Bayar ${debt.record.name}`; }
  if (flow === 'receivable_payment' && receivable) { preset.receivableId = receivable.record.id; preset.description = `Dibayar ${receivable.record.person}`; }
  if (flow === 'claim_payment') { const one = claim?.record || (openClaims.length === 1 ? openClaims[0] : undefined); if (one) { preset.claimId = one.id; preset.description = `Klaim cair: ${one.name}`; } }
  if (flow === 'target' && fund) {
    const f = fund.record; preset.fundId = f.id; preset.description = `Isi ${f.name}`;
    const into = f.linkedWalletId || (f.walletIds?.length === 1 ? f.walletIds[0] : '');
    if (into) preset.destinationWalletId = into;
  }
  if (flow === 'wish' && wish) result.wishId = wish.record.id;

  // Category (spending and income only; debts/receivables use their own groups unless picked later): read from the context,
  // the person's habits and a category named in the text (lib/categorize.ts).
  if (flow === 'expense' || flow === 'income') {
    const guess = suggestCategory({ text, item, merchant: preset.merchant, amount, type: flow }, ctx);
    if (guess) { preset.categoryId = guess.categoryId; preset.subcategoryId = guess.subcategoryId; if (guess.why) result.why = guess.why; }
    const scene = flow === 'expense' ? sceneCategory(text, item, ctx.categories.filter(c => !c.isArchived), ctx.history || [], guess) : null;
    if (scene) { preset.categoryId = scene.categoryId; preset.subcategoryId = scene.subcategoryId; result.why = scene.why; }
    const chosen = ctx.categories.find(c => c.id === (preset.subcategoryId || preset.categoryId));
    if (chosen) understood.push(chosen.name);
  }
  if (kind === 'recurring_new' || kind === 'plan_new') {
    const category = ctx.categories.find(c => c.id === (preset.subcategoryId || preset.categoryId));
    result.name = preset.description || preset.merchant || (flow === 'income' && /\b(gaji|gajian)\b/.test(text) ? 'Gaji' : category?.name || '');
  }
  return result;
}

/* ------------------------------------------------------------------ Several entries at once */

export type QuickBatchItem = { text: string; result: QuickResult };
const BATCH_KINDS = new Set<QuickKind>(['expense', 'income', 'transfer', 'budget']);
/**
 * "makan 25rb, parkir 5rb, bensin 30rb", "budget makan 2jt, transport 800rb", or one entry per line: several entries.
 * Split only where every piece has its own amount (so "1,5jt" or "beli nasi dan es teh 25rb" stay one). A date or a
 * wallet said once ("kemarin …", "… pakai gopay") applies to the pieces that don't have their own, and "budget" at the
 * start covers the pieces after it. Returns null when the text is a single entry.
 */
export function parseQuickBatch(input: string, ctx: QuickContext, mode: QuickGroup | QuickKind = 'auto'): QuickBatchItem[] | null {
  const raw = input.trim();
  if (!raw) return null;
  const hasAmount = (piece: string) => findAmounts(amountWords(lower(piece))).some(a => a.marked || a.value >= 100);
  let pieces = raw.split(/\n|;/).map(p => p.trim()).filter(Boolean);
  pieces = pieces.flatMap(piece => {
    const parts = piece.split(/,\s+|\s+\+\s+|\s+(?:dan|terus|lalu|trus|sama|habis itu|abis itu)\s+(?=\S+(?:\s+\S+){0,5}?\s+(?:rp\.?\s*)?\d)/i).map(p => p.trim()).filter(Boolean);
    return parts.length > 1 && parts.every(hasAmount) ? parts : [piece];
  });
  if (pieces.length < 2 || pieces.length > 20 || !pieces.every(hasAmount)) return null;
  const first = parseQuickText(pieces[0], ctx, mode);
  const budgetAll = first?.kind === 'budget';
  const items = pieces.map(text => ({ text, result: budgetAll && !/\b(anggaran|budget|bujet|jatah)\b/i.test(text) ? parseQuickText(`budget ${text}`, ctx, mode) : parseQuickText(text, ctx, mode) }));
  if (items.some(item => !item.result || !BATCH_KINDS.has(item.result.kind) || !item.result.amount)) return null;
  // A date or a wallet said once counts for the others.
  const dated = items.find(item => new RegExp(DATE_PHRASES.source).test(lower(item.text)));
  const flows = items.filter(item => item.result!.kind === 'expense' || item.result!.kind === 'income');
  const said = flows.filter(item => item.result!.preset.walletId && walletsIn(lower(item.text), ctx.wallets).length);
  const walletIds = new Set(said.map(item => item.result!.preset.walletId));
  const saidWallet = said[0];
  for (const item of items) {
    const r = item.result!;
    if (dated && dated !== item && !new RegExp(DATE_PHRASES.source).test(lower(item.text)) && r.kind !== 'budget') { r.preset.date = dated.result!.preset.date || dated.result!.date; r.date = r.preset.date || r.date; }
    if (saidWallet && walletIds.size === 1 && !walletsIn(lower(item.text), ctx.wallets).length && r.kind === saidWallet.result!.kind) r.preset.walletId = saidWallet.result!.preset.walletId;
  }
  return items as QuickBatchItem[];
}
