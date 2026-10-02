/**
 * Catat otomatis 2.0: a whole message becomes an action plan.
 *
 *   text → normalization → corrections → clauses → one reading per clause (parseQuickText, the engine the menus already
 *   trust) → references ("dua-duanya", "yang bensin") → what is said once for several clauses → checks → per-field
 *   confidence, alternatives and the reasons behind them.
 *
 * Everything runs on the device and is deterministic. Nothing is saved here: the preview shows the plan and the person
 * confirms it. A fact the text does not give is never filled in: a transfer without a source wallet, a payment whose debt
 * is unclear, two amounts for one entry or a reference with no clear antecedent are left open and marked, and only
 * that field is asked for. Defaults that the app has always used (today's date, the main wallet for spending) are
 * still used, but they are shown as defaults.
 *
 * Field states: Terverifikasi (said in the text), Kemungkinan benar (read from context, habit or a default),
 * Perlu dicek (conflicting or unclear), Belum terbaca (needed and missing).
 *
 * Precedence, when the text disagrees with itself:
 *   - a correction wins ("30rb eh 35rb", "pakai gopay, bukan bca", "kemarin, eh tadi pagi");
 *   - a value said in a clause wins over one said elsewhere in the message ("… bensin 100rb hari ini pake bca");
 *   - a reference to a clause ("yang bensin pakai bca") wins over a value shared by the whole message;
 *   - two dates in one clause without a correction: the reading of parseQuickText is kept (relative words such as
 *     "kemarin" first, then day + month, d/m, "tgl N", weekdays) and the date is marked Perlu dicek with the other one
 *     as a one-tap choice. Two amounts or two wallets for one entry work the same way;
 *   - the person's history only helps when the text says nothing (a wallet or category named in the text always wins).
 */
import { catchBugs, catchTemporalBugs, type BugWarning } from './catat/bug-catcher.ts';
import { findTimes, resolveTime, type TimeExpr, type TemporalResolution } from './catat/temporal.ts';
import type { EntityNode, RejectedCandidate } from './catat/entities.ts';
import { amountWords, DATE_PHRASES, findAmounts, GENERIC, parseQuickText, QUICK_LABELS, readDate, SALARY_WHEN, walletsIn, type QuickContext, type QuickGroup, type QuickKind, type QuickResult } from './quick-entry.ts';

export type FieldKey = 'kind' | 'amount' | 'date' | 'time' | 'wallet' | 'to' | 'link' | 'category' | 'person' | 'name';
export type FieldStatus = 'verified' | 'likely' | 'check' | 'missing';
export const FIELD_STATUS: Record<FieldStatus, string> = { verified: 'Terverifikasi', likely: 'Kemungkinan benar', check: 'Perlu dicek', missing: 'Belum terbaca' };
export const FIELD_LABELS: Record<FieldKey, string> = { kind: 'Jenis', amount: 'Nominal', date: 'Tanggal', time: 'Jam', wallet: 'Dompet', to: 'Dompet tujuan', link: 'Catatan terkait', category: 'Kategori', person: 'Orang', name: 'Nama' };
export type FieldState = { status: FieldStatus; note?: string };
export type QuickEntity = { type: 'amount' | 'date' | 'time' | 'wallet' | 'person' | 'place' | 'record' | 'reference' | 'correction'; text: string; value?: string | number; clause: number };
export type QuickClause = { index: number; text: string; source: [number, number]; normalized: string; role: 'action' | 'modifier' | 'extra-amount' | 'ignored' | 'cancel' };
export type QuickAlternative = { kind: QuickKind; label: string; result: QuickResult };
export type ActionCandidate = {
  id: string;
  /** The clause it was read from. */
  clause: number;
  text: string;
  result: QuickResult;
  fields: Partial<Record<FieldKey, FieldState>>;
  /** Short reasons, for "Kenapa?". */
  evidence: string[];
  /** Other readings of the same words, ready to use. */
  alternatives: QuickAlternative[];
  /** Values to choose from when the text gave more than one. */
  options: { amount?: number[]; date?: { date: string; label: string }[]; wallet?: string[]; time?: string[] };
  /** V3.1: the time expression read and how its timestamp was chosen (provenance, "Kenapa?", developer trace). */
  temporal?: { expr: TimeExpr; resolution: TemporalResolution; future: boolean; pastCue: boolean; dateLocked: boolean };
  daypart?: string;
  warnings: string[];
  /** Something in it needs the person's attention before saving. */
  review: boolean;
  /** 0–1, the weakest field. */
  confidence: number;
  /** The one thing to ask (the first field still open), as a short question with ready answers. */
  ask?: QuickAsk;
  /** V3: the typed entities of this action with their source spans and the engines' evidence (developer trace, "Kenapa?"). */
  entities?: EntityNode[];
  /** V3: candidates the resolver rejected, and what the Bug Catcher found and repaired. */
  rejected?: RejectedCandidate[];
  checks?: BugWarning[];
};
export type QuickAsk = { field: FieldKey; question: string; /** Wallet ids, record ids or kinds to pick from. */ choices?: string[] };
/**
 * How the actions of one message relate (the action graph): a value said once for several actions, a reference, a
 * correction, a cancellation, a consequence that is not a second money movement, the record a payment belongs to.
 * `from` / `to` are action ids ("a0") or clause numbers ("c2").
 */
export type QuickRelation = {
  type: 'shared_date' | 'shared_wallet' | 'refers_to' | 'correction_of' | 'negates' | 'consequence_of' | 'repayment_of' | 'claim_for' | 'transfer_between';
  from: string; to?: string; note: string; confidence: FieldStatus;
};
export type QuickParseResult = {
  sourceText: string; normalizedText: string;
  clauses: QuickClause[]; entities: QuickEntity[]; actions: ActionCandidate[];
  /** Everything left open: missing fields of the actions and references that could not be settled. */
  unresolved: string[];
  /** References with no clear antecedent ("yang ketiga" with two entries); nothing was applied for them. */
  references: string[];
  confidence: 'high' | 'review' | 'none';
  warnings: string[];
  /** The action graph's edges, for "Kenapa?" and the debug view. */
  relations: QuickRelation[];
  /** What the message itself took back ("makan 25rb, eh ga jadi"). */
  cancelled: string[];
  /** Developer trace: every step and decision, in order. */
  trace: string[];
};

/* ------------------------------------------------------------------ Normalization */

/** Chat spellings → the words the reader knows. Only whole words; names of the person's wallets are left alone. */
const SPELLING: Record<string, string> = {
  kemaren: 'kemarin', kmaren: 'kemarin', kmrin: 'kemarin', kmren: 'kemarin', kmrn: 'kemarin', td: 'tadi', tdi: 'tadi', tdk: 'tidak',
  skrg: 'sekarang', skg: 'sekarang', skrang: 'sekarang', skrng: 'sekarang', byr: 'bayar', bayr: 'bayar', bayarr: 'bayar',
  trf: 'transfer', trnsfer: 'transfer', transfr: 'transfer', trasfer: 'transfer', tranfer: 'transfer', trsf: 'transfer',
  pake: 'pakai', pakek: 'pakai', pk: 'pakai', dr: 'dari', gw: 'aku', gue: 'aku', gua: 'aku', w: 'aku',
  mkn: 'makan', mkan: 'makan', maem: 'makan', mam: 'makan', mnm: 'minum', minm: 'minum', maksi: 'makan siang', makmal: 'makan malam',
  blnj: 'belanja', blanja: 'belanja', bensn: 'bensin', bnsin: 'bensin', bensi: 'bensin', prkir: 'parkir', parkr: 'parkir', pkir: 'parkir',
  ntar: 'nanti', ntr: 'nanti', udh: 'sudah', udah: 'sudah', sdh: 'sudah', blm: 'belum', dgn: 'dengan', dg: 'dengan', jg: 'juga',
  pg: 'pagi', mlm: 'malam', trs: 'terus', trus: 'terus', krn: 'karena', lsg: 'langsung', tp: 'tapi', lg: 'lagi', sy: 'saya',
  ingetin: 'ingetin', ingatin: 'ingetin', inget: 'ingetin', tlg: 'tolong', bls: 'balas', bgt: 'banget', gpp: 'tidak apa',
};
const PHRASES: [RegExp, string][] = [
  // Day of month as people type it: "tgl2", "tnggl 2", "tanggal2" → "tgl 2".
  [/\b(?:tanggal|tangal|tnggal|tnggl|tngl|tgl|tg)\s*(\d{1,2})(?!\d)/g, 'tgl $1'],
    [/\bgo[\s-]pay\b/g, 'gopay'], [/\bshopee[\s-]pay\b/g, 'shopeepay'], [/\blink[\s-]aja\b/g, 'linkaja'], [/\bsea[\s-]bank\b/g, 'seabank'],
  [/(\d)\s*(?:rbu|rebu|rbuan|ribuan|rban|rb-an|rbn)\b/g, '$1rb'], [/(\d)\s*(?:jtan|jutaan|jt-an)\b/g, '$1jt'],
  [/\b(?:dua2nya|dua-duanya|dua duanya|duaduanya)\b/g, 'dua-duanya'], [/\bpas\s+gajian\b/g, 'pas gajian'],
  [/\b(?:gak|ga|nggak|enggak|engga|ngga|gk|g)\s*jadi\b|\bgajadi\b/g, 'tidak jadi'], [/\bmasing2\b/g, 'masing-masing'],
];
/** "2jt200" / "2 juta 200" → 2.200.000; the digits after "jt" are thousands ("2jt50" = 2.050.000), one digit is a tenth ("2jt5" = 2,5 jt). */
const MILLION_TAIL = /\b(\d{1,3})\s*(?:jt|juta)\s*(\d{1,3})\b(?!\s*(?:rb|ribu|k|jt|juta|[.,]\d))/g;
const millionTail = (_: string, whole: string, tail: string) => `${Number(whole) * 1000 + Number(tail) * (tail.length === 1 ? 100 : 1)}rb`;
export function normalizeQuick(text: string) {
  let out = text.toLocaleLowerCase('id-ID').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
  for (const [pattern, to] of PHRASES) out = out.replace(pattern, to);
  out = out.replace(MILLION_TAIL, millionTail);
  out = out.replace(/\p{L}+/gu, word => SPELLING[word] ?? word);
  return amountWords(out);
}

/* ------------------------------------------------------------------ Corrections */

const MARKER = /(?:\s*,\s*|\s+)(?:eh+m?|ralat|koreksi|maksudnya|maksudku|maksud (?:saya|aku)|sori|sorry|salah ketik)(?:\s*,\s*|\s+)/;
const DATE_ANY = () => new RegExp(`${DATE_PHRASES.source}|\\btadi(?:\\s+(?:pagi|siang|sore|malam))?\\b|\\bbarusan\\b|\\btgl \\d{1,2}(?!\\d)(?:\\s*[/-]\\s*\\d{1,2})?`, 'g');
const KIND_WORDS: Record<string, QuickKind[]> = {
  pengeluaran: ['expense'], pemasukan: ['income'], transfer: ['transfer'], utang: ['debt_new', 'debt_payment'], hutang: ['debt_new', 'debt_payment'],
  piutang: ['receivable_new', 'receivable_payment'], rencana: ['plan_new'], anggaran: ['budget'], budget: ['budget'], pengingat: ['note_new'], catatan: ['note_new'], rutin: ['recurring_new'],
};
/** The kind of value that starts a text: an amount, a date or a wallet. */
function leadingType(text: string, ctx: QuickContext, left = ''): 'amount' | 'date' | 'wallet' | 'place' | 'time' | null {
  // "jam 1 eh jam 2", "jam 3 sore eh jam set 3 sore": a new time (before the number reading below takes "jam" as a name).
  if (findTimes(text.trim())[0]?.start === 0 && findTimes(left).length) return 'time';
  { const d = DATE_ANY().exec(text.trim()); if (d && d.index === 0 && DATE_ANY().test(left)) return 'date'; }
  // "parkir 5rb, eh parkirnya 4rb": a word naming the entry before the new value.
  const named = text.trim().match(/^(?:yang\s+)?(\p{L}+?)(?:nya)?\s+(?=(?:rp\.?\s*)?\d)/u);
  const t = named && named[1].length >= 3 && has(left, named[1]) ? text.trim().slice(named[0].length) : text.trim();
  if (/^(?:rp\.?\s*)?\d/.test(t)) return 'amount';
  // "di b1, eh di piot": a new place.
  if (/^(?:di|@)\s+\S/.test(t) && /(?:^|\s)(?:di|@)\s+\S/.test(left)) return 'place';
  const date = DATE_ANY().exec(t); if (date && date.index === 0) return 'date';
  const wallet = walletsIn(t, ctx.wallets)[0];
  if (wallet && (wallet.at === 0 || /^(?:pakai|via|dari|lewat|ke)\s/.test(t) && wallet.at <= 7)) return 'wallet';
  return null;
}
/** The last value of a type in a text, as [start, end]. */
/** The last "di X" in a text: from "di" to the next amount, wallet or comma. */
function lastPlace(text: string, ctx: QuickContext): [number, number] | null {
  const all = [...text.matchAll(/(?:^|\s)((?:di|@)\s+)/g)]; const m = all.pop(); if (!m) return null;
  const start = (m.index ?? 0) + m[0].length - m[1].length, after = start + m[1].length;
  const stops = [text.indexOf(',', after), ...findAmounts(text.slice(after)).map(a => after + a.index), ...walletsIn(text.slice(after), ctx.wallets).map(w => after + w.at)].filter(i => i >= after);
  return [start, stops.length ? Math.min(...stops) : text.length];
}
function lastOf(text: string, type: 'amount' | 'date' | 'wallet' | 'place' | 'time', ctx: QuickContext): [number, number] | null {
  if (type === 'time') { const t = findTimes(text).pop(); return t ? [t.start, t.end] : null; }
  if (type === 'amount') { const a = findAmounts(text).pop(); return a ? [a.index, a.index + a.text.length] : null; }
  if (type === 'place') return lastPlace(text, ctx);
  if (type === 'date') { const all = [...text.matchAll(DATE_ANY())]; const d = all.pop(); return d ? [d.index ?? 0, (d.index ?? 0) + d[0].length] : null; }
  const w = walletsIn(text, ctx.wallets).sort((a, b) => b.at - a.at)[0];
  return w ? [w.at, w.at + w.word.length] : null;
}
/** "makan 30rb eh 35rb" → "makan 35rb"; "pakai gopay, bukan bca" → "pakai gopay"; "bukan pengeluaran, transfer …" → "transfer …". */
export function applyCorrections(input: string, ctx: QuickContext) {
  let text = input; const notes: string[] = [], negated = new Set<QuickKind>();
  for (let guard = 0; guard < 5; guard++) {
    const m = MARKER.exec(text); if (!m) break;
    // "pake bca, eh bukan, pake mandiri": "bukan" right after the marker only says the value before it was wrong.
    const left = text.slice(0, m.index), right = text.slice(m.index + m[0].length).replace(/^bukan\s*(?:,|$)\s*(?:tapi\s+)?/, ''), type = leadingType(right, ctx, left);
    const span = type ? lastOf(left, type, ctx) : null;
    const said = span ? left.slice(span[0], span[1]).trim() : '';
    text = `${span ? left.slice(0, span[0]) + left.slice(span[1]) : left} ${right}`.replace(/\s+/g, ' ').trim();
    // "talangin budi 40rb eh aldi": one name after the marker replaces the person read before it.
    if (!type && /^\p{L}{3,}$/u.test(right.trim())) {
      const person = parseQuickText(left, ctx)?.person?.toLocaleLowerCase('id-ID');
      if (person && person !== right.trim() && new RegExp(`\\b${esc(person)}\\b`).test(left)) {
        text = left.replace(new RegExp(`\\b${esc(person)}\\b`), right.trim()).replace(/\s+/g, ' ').trim();
        notes.push(`dikoreksi: “${person}” → “${right.trim()}”`);
        continue;
      }
    }
    const now = type === 'amount' ? findAmounts(right)[0]?.text : type === 'date' ? DATE_ANY().exec(right)?.[0] : type === 'wallet' ? walletsIn(right, ctx.wallets)[0]?.word : type === 'time' ? findTimes(right.trim())[0]?.raw : '';
    if (said) notes.push(`dikoreksi: “${said}” → “${(now || right.trim().split(' ')[0]).trim()}”`);
  }
  // "bukan jam 1, jam 2" / "bukan kemarin, hari ini" / "bukan tgl 2, tgl 3": the negated time or date is dropped.
  for (let guard = 0; guard < 3; guard++) {
    const m = /(?:^|\s*,\s*|\s+)bukan\s+/.exec(text); if (!m) break;
    const after = text.slice(m.index + m[0].length), clock = findTimes(after)[0], date = DATE_ANY().exec(after);
    const span = clock && clock.start === 0 ? clock.end : date && date.index === 0 ? date[0].length : 0;
    if (!span) break;
    notes.push(`bukan “${after.slice(0, span).trim()}”`);
    text = `${text.slice(0, m.index)} ${after.slice(span).replace(/^\s*,?\s*(?:tapi\s+)?/, ' ')}`.replace(/\s+/g, ' ').trim();
  }
  // "bukan di b1, di piot": the place after "bukan di" is not the place.
  text = text.replace(/(?:^|\s*,\s*|\s+)bukan\s+(?:di|@)\s+([^,]+?)\s*,\s*(?:tapi\s+)?(?=(?:di|@)\s)/, (_m, place: string) => { notes.push(`bukan di “${place.trim()}”`); return ' '; }).replace(/\s+/g, ' ').trim();
  // "bukan X": X is dropped when it is a wallet, an amount or a kind of entry.
  for (let guard = 0; guard < 5; guard++) {
    const m = /(?:^|\s*,\s*|\s+)bukan\s+(?:(?:dari|pakai|via|lewat|ke)\s+)?(\S+)(?:\s*,\s*|\s+(?:tapi|melainkan)\s+|\s*$)?/.exec(text); if (!m) break;
    const word = m[1].replace(/[,.]$/, ''), kinds = KIND_WORDS[word];
    const isWallet = walletsIn(word, ctx.wallets).length > 0, isAmount = findAmounts(word).some(a => a.marked || a.value >= 100);
    if (!kinds && !isWallet && !isAmount) {
      // "talangin budi 40rb, bukan budi, aldi" → Aldi; "buat budi bukan aldi" → Aldi is simply not meant.
      if (!/^\p{L}{3,}$/u.test(word)) break;
      const rest = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
      const person = parseQuickText(rest, ctx)?.person?.toLocaleLowerCase('id-ID');
      const next = text.slice(m.index + m[0].length).match(/^\s*(\p{L}{3,})\b/u)?.[1];
      if (person === word && next && next !== word) text = rest.replace(new RegExp(`\\b${esc(word)}\\b`), ' ').replace(new RegExp(`\\b${esc(next)}\\b`), next);
      else if (person && person !== word) text = rest;
      else break;
      notes.push(`bukan “${word}”`);
      text = text.replace(/\s+/g, ' ').trim();
      continue;
    }
    kinds?.forEach(k => negated.add(k));
    notes.push(kinds ? `bukan ${word}` : `bukan “${word}”`);
    text = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '').trim();
  }
  return { text, notes, negated };
}

/* ------------------------------------------------------------------ Clauses */

const CONNECT = 'lalu|terus|kemudian|habis itu|abis itu|abis tu|habis tu|setelah itu|sama|dan|tapi|sedangkan|plus|\\+';
const BOUNDARY = new RegExp(`\\s*(?:\\n|;|,(?!\\d)|\\.(?=\\s))\\s*(?:(?:${CONNECT}|trus|trs|tp)\\s+)?|\\s+(?:${CONNECT}|trus|trs|tp)\\s+`, 'gi');
const TX_CUE = /\b(beli|bayar|tf|transfer|topup|top up|isi saldo|tarik tunai|setor tunai|terima|pinjam|pinjem|minjem|pinjemin|nabung|sisihkan|klaim|reimburse|kirim|gaji|gajian|lunasin|lunasi|jual)\b/;
const VERB_START = /^(beli|bayar|tf|transfer|topup|top up|terima|pinjam|pinjem|pinjemin|nabung|klaim|isi|tarik|setor|ingetin|ingatkan|budget|anggaran|gaji|gajian|buka|catat|kirim|jual)\b/;
const OWN_KIND = /\b(beli|bayar|tf|transfer|topup|terima|pinjam|pinjem|pinjemin|nabung|klaim|gaji|gajian|kirim|ingetin|ingatkan|rencana|target|buka|jual|dapat|dapet|saldo|langganan)\b/;
const CORRECTION_START = /^(?:eh+m?|ralat|koreksi|maksudnya|maksud\b|bukan\b|sori|sorry)/;
const REFERENCE = /\b(?:dua-duanya|keduanya|semuanya|semua|sisanya|yang lain(?:nya)?|lainnya|yang\s+(?:ke-?\d+|\p{L}+))\b/u;
const NO_AMOUNT = new Set<QuickKind>(['note_new', 'open', 'category_new', 'wallet_new']);
type Piece = { start: number; end: number; connector: string };
type Unit = Piece & { index: number; text: string; norm: string; cls: 'action' | 'modifier' | 'amountOnly' | 'ignored' | 'cancel'; notes: string[]; negated: Set<QuickKind>; noAmount?: boolean; /** A reference read from the words ("tapi makan cash" → "yang makan"). */ ref?: string };

function pieces(source: string): Piece[] {
  const out: Piece[] = []; let at = 0, connector = '';
  for (const m of source.matchAll(BOUNDARY)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ start: at, end: i, connector });
    connector = m[0].replace(/[\s,;\n]+/g, ' ').trim() || (m[0].includes('\n') ? 'baris' : m[0].includes(';') ? ';' : ',');
    at = i + m[0].length;
  }
  if (at < source.length) out.push({ start: at, end: source.length, connector });
  return out.filter(p => source.slice(p.start, p.end).trim());
}

/* ------------------------------------------------------------------ Reading one clause */

const STOP = new Set(['bayar', 'cicil', 'nyicil', 'cicilan', 'angsuran', 'angsur', 'kredit', 'utang', 'hutang', 'pinjaman', 'pinjam', 'lunas', 'lunasin', 'lunasi', 'pelunasan', 'buat', 'untuk', 'utk', 'ke', 'dari', 'pakai', 'via', 'lewat', 'yang', 'yg', 'dan', 'ini', 'itu', 'bulan', 'nabung', 'isi', 'tabung', 'sisihkan', 'sisihin', 'setor', 'masuk', 'cair', 'klaim', 'kantor', 'dana', 'target', 'tabungan', 'wishlist', 'rb', 'ribu', 'jt', 'juta', 'rp', 'aku', 'saya', 'duit', 'uang', 'terima', 'dapat', 'dapet', 'dibayar', 'balikin', 'kembaliin', 'tf', 'transfer', 'kirim', 'sama', 'ya', 'dong', 'nih', 'tadi', 'kemarin', 'hari', 'besok', 'sisa', 'semua', 'sebagian', 'sudah', 'lagi', 'mau', 'akan', 'tolong', 'catat']);
const PAY_KINDS = new Set<QuickKind>(['debt_payment', 'receivable_payment', 'claim_payment', 'target', 'wish']);
/** Kinds whose wallet falls back to the main wallet when none is named (the rule the preview has always used). */
const DEFAULT_WALLET = new Set<QuickKind>(['expense', 'income', 'debt_payment', 'receivable_payment', 'claim_new', 'claim_payment', 'target', 'recurring_new']);
const DATED = new Set<QuickKind>(['expense', 'income', 'transfer', 'debt_new', 'debt_payment', 'receivable_new', 'receivable_payment', 'claim_new', 'claim_payment', 'target', 'wish']);
const WALLET_KINDS = new Set<QuickKind>([...DEFAULT_WALLET, 'transfer', 'debt_new', 'receivable_new', 'plan_new', 'balance', 'fund_new']);
const AMOUNT_KINDS = (kind: QuickKind) => !['open', 'category_new', 'wallet_new', 'note_new'].includes(kind);
const SIBLING: Partial<Record<QuickKind, QuickKind[]>> = {
  debt_new: ['debt_payment'], debt_payment: ['debt_new', 'expense'], receivable_new: ['receivable_payment', 'expense'], receivable_payment: ['receivable_new', 'income'],
  claim_new: ['claim_payment', 'expense'], claim_payment: ['claim_new', 'income'], target: ['wish'], wish: ['target'], fund_new: ['target'], wish_new: ['wish'],
  wallet_new: ['balance'], balance: ['wallet_new'], note_new: ['plan_new'], transfer: ['expense'], plan_new: ['note_new'],
};
const linkOf = (r: QuickResult) => r.preset.debtId || r.preset.receivableId || r.preset.claimId || r.preset.fundId || r.wishId || '';
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text: string, word: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc(word)}(?![\\p{L}\\p{N}])`, 'u').test(text);
const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const shortDate = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][m - 1]}`; };

/** Content words of a text that no known part explains ("motor" in "bayar cicilan motor"). */
function leftoverWords(text: string, ctx: QuickContext, known: string[]) {
  const walletWords = new Set(ctx.wallets.flatMap(w => w.name.toLocaleLowerCase('id-ID').split(/\s+/)));
  // Time phrases are owned by the time field: their words are not "other words" around a name (span ownership).
  let owned = text; for (const t of findTimes(text).reverse()) owned = owned.slice(0, t.start) + ' '.repeat(t.end - t.start) + owned.slice(t.end);
  return owned.replace(DATE_ANY(), ' ').split(/[^\p{L}]+/u).filter(w => w.length >= 2 && !STOP.has(w) && !known.includes(w) && !walletWords.has(w) && !GENERIC.has(w));
}
/** The record a payment was linked to: by a specific word (sure), by generic words only (unsure), or because it is the only one. */
function recordCheck(text: string, r: QuickResult, ctx: QuickContext): { status: FieldStatus; note: string; unlink?: boolean; leftover?: string[] } | null {
  const id = linkOf(r); if (!id) return null;
  const debt = ctx.debts?.find(d => d.id === id), receivable = ctx.receivables?.find(x => x.id === id), claim = ctx.claims?.find(c => c.id === id), fund = ctx.funds?.find(f => f.id === id), wish = ctx.wishlist?.find(w => w.id === id);
  const names = debt ? [debt.name, debt.provider] : receivable ? [receivable.person] : claim ? [claim.name] : fund ? [fund.name] : wish ? [wish.name] : [];
  const label = debt?.name || receivable?.person || claim?.name || fund?.name || wish?.name || '';
  const words = [...new Set(names.flatMap(n => (n || '').toLocaleLowerCase('id-ID').split(/[^\p{L}\p{N}]+/u)).filter(w => w.length >= 3))];
  const hits = words.filter(w => has(text, w)), specific = hits.filter(w => !GENERIC.has(w));
  if (specific.length) return { status: 'verified', note: `“${specific.join(' ')}” cocok dengan ${label}` };
  const open = debt ? (ctx.debts || []).filter(d => d.outstandingAmount > 0).length : claim ? (ctx.claims || []).filter(c => c.remainingAmount > 0).length : receivable ? (ctx.receivables || []).filter(x => x.remainingAmount > 0).length : 2;
  const leftover = leftoverWords(text, ctx, words);
  if (hits.length && leftover.length) return { status: 'missing', note: `Tidak ada catatan “${leftover.join(' ')}”; ${label} hanya mirip sebagian`, unlink: true, leftover };
  if (open === 1) return { status: 'likely', note: `satu-satunya yang masih terbuka: ${label}` };
  return { status: 'check', note: `${label} dipilih dari kata umum saja; pastikan benar` };
}

/** A date after today ("besok", "tgl 20" later this month): the event is still to come. */
const soonDate = (date: string | undefined, today: string) => Boolean(date && date > today);

/** The typed entities of one action, each tied to the words it came from (provenance). */
function entityGraph(r: QuickResult, text: string, ctx: QuickContext): EntityNode[] {
  const nodes: EntityNode[] = [...(r.entities?.nodes || [])].map(n => ({ ...n }));
  const find = (value?: string) => { if (!value) return -1; const v = value.toLocaleLowerCase('id-ID'); return text.indexOf(v); };
  const add = (value: string | undefined, type: EntityNode['selectedType'], evidence: string, linkedRecord?: string) => {
    if (!value) return;
    const at = find(value);
    nodes.push({ rawText: at >= 0 ? text.slice(at, at + value.length) : value, normalizedText: value, start: at, end: at >= 0 ? at + value.length : -1, candidateTypes: [type], selectedType: type, confidence: at >= 0 ? 0.9 : 0.7, sourceEngineEvidence: [`Financial Grammar: ${evidence}`], ...(linkedRecord ? { linkedRecord } : {}) });
  };
  if (r.preset.description && !/^(?:bayar|dibayar|klaim cair|isi|transfer ke|kirim ke|dari) /i.test(r.preset.description)) add(r.preset.description, 'DESCRIPTION', 'kata yang tersisa setelah nominal, tempat, dompet dan tanggal');
  if (r.person) add(r.person, 'PERSON', r.personCue ? `setelah “${r.personCue === 'to' ? 'ke' : r.personCue === 'pay' ? 'bayar' : 'dari'}”` : 'pihak lain');
  if (r.preset.debtId) add((ctx.debts || []).find(d => d.id === r.preset.debtId)?.name, 'DEBT_RECORD', 'catatan utang', r.preset.debtId);
  if (r.preset.receivableId) add((ctx.receivables || []).find(x => x.id === r.preset.receivableId)?.person, 'RECEIVABLE_RECORD', 'catatan piutang', r.preset.receivableId);
  if (r.preset.claimId) add((ctx.claims || []).find(c => c.id === r.preset.claimId)?.name, 'CLAIM_RECORD', 'catatan klaim', r.preset.claimId);
  // A transfer's wallets get their direction.
  if (r.kind === 'transfer') for (const n of nodes) if (n.selectedType === 'WALLET') n.selectedType = n.linkedRecord === r.preset.destinationWalletId ? 'DESTINATION_WALLET' : n.linkedRecord === r.preset.walletId ? 'SOURCE_WALLET' : 'WALLET';
  return nodes;
}

type Analyzed = ActionCandidate & { explicit: { wallet: boolean; date: boolean }; assigned: { wallet?: boolean; date?: boolean }; connector: string; dateAtEnd: boolean };
const DEBT_CUE = /\b(utang|hutang|cicil|cicilan|nyicil|angsuran|angsur|kredit|pinjaman|lunas|lunasin|lunasi|paylater)\b/;

function analyze(unit: Unit, index: number, ctx: QuickContext, mode: QuickGroup | QuickKind, forceText?: string): Analyzed | null {
  const text = forceText ?? unit.norm;
  let result = parseQuickText(text, ctx, mode);
  let amountMissing = false;
  if (!result && (unit.noAmount || TX_CUE.test(text))) {
    // A clear action without its amount: read it with a stand-in amount, then leave the amount empty and ask for it.
    result = parseQuickText(`${text} 1rb`, ctx, mode);
    if (result) { amountMissing = true; result.amount = 0; if (result.preset.amount) result.preset.amount = 0; }
  }
  if (!result) return null;
  const fields: ActionCandidate['fields'] = {}, evidence: string[] = [...unit.notes], warnings: string[] = [], options: ActionCandidate['options'] = {};
  let temporal: ActionCandidate['temporal'];
  const set = (key: FieldKey, status: FieldStatus, note?: string) => { fields[key] = { status, ...(note ? { note } : {}) }; };
  let kindStatus: FieldStatus = 'likely', kindNote = '';

  // A payment matched to a record only through shared generic words ("cicilan") is not a match.
  const record = recordCheck(text, result, ctx);
  if (record?.unlink) {
    const noun = result.kind === 'debt_payment' ? 'utang' : result.kind === 'target' ? 'tujuan dana' : result.kind === 'wish' ? 'wish list' : 'catatan';
    if (result.kind === 'debt_payment' && !/\b(utang|hutang)\b/.test(text)) {
      const plain = parseQuickText(text, ctx, 'expense');
      if (plain) { result = plain; kindNote = `Tidak ada ${noun} “${record.leftover!.join(' ')}” yang tercatat, jadi dibaca sebagai pengeluaran`; }
    } else {
      delete result.preset.debtId; delete result.preset.fundId; delete result.wishId;
      warnings.push(`Tidak ada ${noun} “${record.leftover!.join(' ')}” yang tercatat.`);
    }
  }
  // "bayar servis motor": a debt's name word alone, with other words around it and no debt word, is spending.
  let demoted: QuickKind | null = null;
  if (result.kind === 'debt_payment' && linkOf(result) && !DEBT_CUE.test(text)) {
    const debt = ctx.debts?.find(d => d.id === linkOf(result!));
    const words = [debt?.name, debt?.provider].join(' ').toLocaleLowerCase('id-ID').split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3);
    const providerSaid = (debt?.provider || '').split(/\s+/).some(w => w.length >= 3 && has(text, w.toLocaleLowerCase('id-ID')));
    const plain = !providerSaid && leftoverWords(text, ctx, words).length ? parseQuickText(text, ctx, 'expense') : null;
    if (plain) { demoted = 'debt_payment'; result = plain; kindNote = `Tidak ada kata utang/cicilan; “${debt?.name}” hanya mirip namanya, jadi dibaca sebagai pengeluaran`; }
  }
  // "mau bayar …", "akan beli …": not done yet.
  if (['expense', 'debt_payment', 'transfer'].includes(result.kind) && /\b(?:mau|akan|bakal|rencana(?:nya)?)\s+(?:bayar|beli|transfer|isi|servis|top ?up|kirim)\b/.test(text) && !/\b(sudah|tadi|barusan|kemarin)\b/.test(text)) {
    const planned = parseQuickText(text, ctx, 'plan');
    if (planned?.kind === 'plan_new') { result = planned; kindNote = '“mau …” berarti belum terjadi, jadi dicatat sebagai rencana'; }
  }
  if (result.kind === 'debt_payment' && !linkOf(result) && !/\b(utang|hutang|lunas|lunasin|lunasi)\b/.test(text) && !(ctx.debts || []).some(d => d.outstandingAmount > 0)) {
    const plain = parseQuickText(text, ctx, 'expense'); if (plain) { result = plain; kindNote = 'Belum ada utang yang tercatat, jadi dibaca sebagai pengeluaran'; }
  }
  // "transfer 500rb" and "saldo sekarang 2jt" name the action but not the wallet: keep the action and ask for the wallet.
  // "kirim 75rb ke mandiri": sent to one of the person's own wallets is a transfer (its source is asked, never guessed).
  if (result.kind === 'expense' && /\b(kirim|ngirim|pindahin|pindah)\b/.test(text) && walletsIn(text, ctx.wallets).some(w => /\b(?:ke|kepada)\s+$/.test(text.slice(0, w.at)))) {
    const moved = parseQuickText(text, ctx, 'transfer');
    if (moved?.kind === 'transfer') { result = moved; kindNote = 'dikirim ke dompetmu sendiri = transfer'; }
  }
  if (result.kind === 'expense' && !walletsIn(text, ctx.wallets).length) {
    const asked: QuickKind | null = /\b(tf|transfer|pindahin|topup|top up)\b/.test(text) && !/\b(?:ke|kepada|buat|untuk)\s+\p{L}/u.test(text) ? 'transfer'
      : /\bsaldo(?:nya)?\b/.test(text) && (/\b(sekarang|tinggal|sisa|jadi|aktual|real)\b/.test(text) || /^saldo\b/.test(text)) ? 'balance' : null;
    const again = asked && parseQuickText(text, ctx, asked);
    if (again) result = again;
  }
  // "bukan pengeluaran": another reading.
  const kind0 = result.kind;
  if (unit.negated.has(kind0)) {
    const other = (SIBLING[kind0] || []).concat(['transfer', 'income', 'expense']).find(k => !unit.negated.has(k) && k !== kind0);
    const alt = other ? parseQuickText(text, ctx, other) : null;
    if (alt) { result = alt; kindStatus = 'check'; kindNote = `bukan ${QUICK_LABELS[kind0].toLowerCase()}`; }
  }
  const r = result, kind = r.kind;
  // V3 Bug Catcher: challenge the parse against the words and the configured entities before anything is shown.
  const caught = catchBugs({ kind, description: r.preset.description, merchant: r.preset.merchant, walletId: r.preset.walletId, destinationWalletId: r.preset.destinationWalletId, person: r.person }, text, ctx);
  if (caught.changed) {
    const p = caught.parse;
    r.preset.description = p.description; r.preset.merchant = p.merchant; r.person = p.person;
    if (p.walletId) r.preset.walletId = p.walletId; if (p.destinationWalletId) r.preset.destinationWalletId = p.destinationWalletId;
  }

  // Kind.
  const strongCue = kind === 'transfer' ? /\b(tf|transfer|topup|top up|isi saldo|tarik tunai|setor tunai|pindah)\b/ : kind === 'income' ? /\b(gaji|gajian|terima|dapat|dapet|bonus|jual|thr|masuk)\b/ : kind === 'expense' ? /\b(beli|bayar|jajan|belanja|makan|minum|ngopi|parkir|bensin|isi bensin|servis|pulsa|listrik)\b/
    : kind === 'budget' ? /\b(anggaran|budget|bujet|jatah)\b/ : kind === 'note_new' ? /\b(ingetin|ingatkan|pengingat|reminder|catatan|jangan lupa)\b/ : kind === 'plan_new' ? /\b(rencana|besok|lusa|nanti)\b|\d/ : /./;
  if (kindStatus !== 'check') kindStatus = strongCue.test(text) || !['expense', 'income'].includes(kind) ? 'verified' : 'likely';
  if (kindNote && !/belum terjadi/.test(kindNote)) { if (kindStatus === 'verified') kindStatus = 'likely'; }
  set('kind', kindStatus, kindNote || undefined);
  if (kindNote) evidence.push(kindNote);

  // "2 kopi masing-masing 20rb": a count times a price each; the total is worked out (and shown as such).
  const each = text.match(/\b(\d{1,3})\s+(?:[\p{L}-]+\s+){1,3}?(?:masing-masing|@|per\s+(?:porsi|buah|biji|pcs|orang|gelas|cup|bungkus|botol))\s*((?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k|jt|juta)?)/u);
  const eachPrice = each && ['expense', 'plan_new'].includes(kind) ? findAmounts(each[2])[0] : undefined, eachCount = each ? Number(each[1]) : 0;
  if (eachPrice && eachCount > 1 && eachCount <= 100) { r.amount = eachCount * eachPrice.value; r.preset.amount = r.amount; }

  // Amount.
  if (eachPrice && eachCount > 1 && eachCount <= 100) set('amount', 'likely', `${eachCount} × ${rupiah(eachPrice.value)} = ${rupiah(r.amount)} (dihitung)`);
  else if (AMOUNT_KINDS(kind)) {
    const amounts = findAmounts(text).filter(a => !a.monthly), marked = [...new Set(amounts.filter(a => a.marked).map(a => a.value))];
    const main = amounts.find(a => a.marked) || amounts.filter(a => a.value >= 10).sort((a, b) => b.value - a.value)[0];
    if (amountMissing || !r.amount) set('amount', 'missing', 'Nominalnya belum disebut');
    else if (marked.length > 1 && !['fund_new', 'wish_new'].includes(kind)) { set('amount', 'check', `Ada ${marked.length} nominal: ${marked.map(rupiah).join(' dan ')}`); options.amount = marked; }
    else if (!main && r.amount) set('amount', 'likely', kind === 'budget' ? 'dihitung dari anggaran sekarang' : 'seluruh sisanya');
    else if (main && !main.marked && main.value < 1000) { set('amount', 'check', `${rupiah(main.value)}? Mungkin maksudnya ${rupiah(main.value * 1000)}`); options.amount = [main.value, main.value * 1000]; }
    else if (kind === 'budget' && r.budget?.previous !== undefined && r.amount !== main?.value) set('amount', 'likely', `${rupiah(r.budget.previous)} → ${rupiah(r.amount)}`);
    else set('amount', 'verified', main ? `“${main.text.trim()}”` : undefined);
  }

  // Date and time.
  const phrases = [...text.matchAll(DATE_ANY())].map(m => m[0].trim()).filter(p => !/^(?:tiap|setiap|saban|per|mulai)\b/.test(p));
  const future = kind === 'plan_new' || kind === 'note_new' || kind === 'recurring_new';
  let explicitDate = phrases.length > 0;
  if (DATED.has(kind) || kind === 'plan_new' || kind === 'note_new' || kind === 'recurring_new') {
    const readings = phrases.map(p => ({ label: p, date: /^tadi|^barusan/.test(p) ? ctx.today : readDate(p, ctx.today, future, false, ctx.salaryDay)?.date || '' })).filter(x => x.date);
    const distinct = [...new Map(readings.map(x => [x.date, x])).values()];
    explicitDate = readings.length > 0 || SALARY_WHEN.test(text);
    if (SALARY_WHEN.test(text) && !ctx.salaryDay) { set('date', 'missing', 'Tanggal gajian belum diatur di Profil & gaji'); r.date = ''; r.preset.date = ''; }
    else if (kind === 'recurring_new') set('date', r.schedule ? 'verified' : 'likely', r.schedule ? `mulai ${shortDate(r.date)}` : 'mulai hari ini');
    else if (distinct.length > 1) { set('date', 'check', `Ada ${distinct.length} tanggal: ${distinct.map(x => `${x.label} (${shortDate(x.date)})`).join(' dan ')}`); options.date = distinct; }
    else if (explicitDate) set('date', 'verified', `“${phrases[0]}” → ${shortDate(r.date)}`);
    else set('date', 'likely', r.date === ctx.today ? 'hari ini (bawaan)' : undefined);
    // V3.1 time: the clock the words allow, then the nearest plausible timestamp on the (locked) date.
    const clocks = findTimes(text);
    if (clocks.length) {
      const named = readings.some(x => !/^(?:tadi|barusan)/.test(x.label)) || SALARY_WHEN.test(text);
      const futureCue = future || /\b(nanti|ntar|entar|besok|lusa|ntr)\b/.test(text) || soonDate(r.date, ctx.today);
      const pastCue = /\b(tadi|td|barusan|baru aja|baru saja|semalam|kemarin)\b/.test(text);
      let expr = clocks[clocks.length - 1];
      // "kemaren sore … jam set 6": a daypart said elsewhere in the clause fixes a clock that has none.
      if (!expr.daypart && !expr.is24) {
        const outside = text.slice(0, expr.start) + ' ' + text.slice(expr.end);
        const parts = [...new Set([...outside.matchAll(/\b(pagi|siang|sore|malam)\b/g)].map(m => m[1]))].filter(p => !/makan (?:pagi|siang|malam)/.test(outside) || !new RegExp(`makan ${p}`).test(outside));
        if (parts.length === 1) expr = { ...expr, daypart: parts[0] as TimeExpr['daypart'] };
      }
      const resolution = resolveTime(expr, { today: ctx.today, now: ctx.now || '12:00', date: r.date || ctx.today, dateLocked: named, future: futureCue, pastCue });
      temporal = { expr, resolution, future: futureCue, pastCue, dateLocked: named };
      r.preset.time = resolution.time;
      if (resolution.date !== (r.date || ctx.today)) { r.date = resolution.date; r.preset.date = resolution.date; set('date', resolution.status === 'check' ? 'check' : 'likely', `jam ${resolution.time} jatuh ${resolution.date < ctx.today ? 'kemarin' : 'besok'}`); }
      set('time', resolution.status, resolution.reason.replace(/\.$/, ''));
      if (resolution.alternatives.length) options.time = [...new Set(resolution.alternatives.map(x => x.time))];
      if (clocks.length > 1 && new Set(clocks.map(c => c.raw)).size > 1) { set('time', 'check', `Ada ${clocks.length} jam: ${clocks.map(c => c.raw).join(' dan ')}`); }
    }
  } else if (kind === 'budget' && phrases.some(p => !/^(?:mulai)/.test(p))) warnings.push('Anggaran berlaku per periode; tanggal di kalimat tidak mengubah periodenya.');
  const daypart = text.match(/\b(?:tadi|kemarin|besok)\s+(pagi|siang|sore|malam)\b/)?.[1];

  // "transfer 100rb … kena admin 2.500": the fee is its own expense line of the transfer, never added to the amount.
  if (kind === 'transfer') {
    const fee = text.match(/\b(?:kena|biaya|plus|\+)?\s*(?:admin|biaya admin|fee|biaya transfer)\s*(?:nya)?\s*((?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k)?)/);
    const value = fee ? findAmounts(fee[1])[0]?.value || Number(fee[1].replace(/\D/g, '')) : 0;
    if (value > 0 && value < r.amount) {
      r.preset.transferFee = value;
      const feeCat = ctx.categories.find(c => c.type === 'expense' && !c.isArchived && /\b(admin|biaya bank|biaya transfer)\b/i.test(c.name)) || ctx.categories.find(c => c.type === 'expense' && !c.isArchived && /\bbiaya\b/i.test(c.name));
      if (feeCat) { r.preset.transferFeeCategoryId = feeCat.id; evidence.push(`Biaya admin ${rupiah(value)} dicatat terpisah (kategori ${feeCat.name}); jumlah yang ditransfer tetap ${rupiah(r.amount)}`); }
      else warnings.push(`Biaya admin ${rupiah(value)}: pilih kategorinya di formulir.`);
    }
  }

  // Wallets.
  const found = walletsIn(text, ctx.wallets);
  const explicitWallet = found.length > 0 && Boolean(r.preset.walletId);
  if (kind === 'transfer') {
    const from = text.match(/\b(?:dari|dr)\s+(\S+)/)?.[1], to = text.match(/\b(?:ke|kepada)\s+(\S+)/)?.[1];
    const fromW = from && walletsIn(from, ctx.wallets)[0], toW = to && walletsIn(to, ctx.wallets)[0];
    if (fromW && toW && fromW.id === toW.id) {
      delete r.preset.destinationWalletId;
      set('wallet', 'verified', `dari ${fromW.name}`); set('to', 'check', 'Dompet asal dan tujuan sama');
      warnings.push(`Dompet asal dan tujuan sama-sama ${fromW.name}.`);
    } else {
      const name = (id?: string) => ctx.wallets.find(w => w.id === id)?.name;
      const implied = !found.some(w => w.id === r.preset.destinationWalletId);
      set('wallet', r.preset.walletId ? 'verified' : 'missing', r.preset.walletId ? `dari ${name(r.preset.walletId)}` : 'Dompet asal belum disebut');
      set('to', r.preset.destinationWalletId ? (implied ? 'likely' : 'verified') : 'missing', r.preset.destinationWalletId ? `ke ${name(r.preset.destinationWalletId)}${implied ? ' (tarik tunai)' : ''}` : 'Dompet tujuan belum disebut');
    }
  } else if (WALLET_KINDS.has(kind)) {
    const cued = [...new Set(found.filter(w => /\b(?:dari|pakai|via|lewat|masuk|masuk ke|ke|di)\s+$/.test(text.slice(0, w.at))).map(w => w.id))];
    const record = kind === 'target' ? ctx.funds?.find(f => f.id === r.preset.fundId) : undefined;
    const recordWords = (record?.name || '').toLocaleLowerCase('id-ID').split(/\s+/);
    const own = cued.filter(id => !recordWords.includes(ctx.wallets.find(w => w.id === id)?.name.toLocaleLowerCase('id-ID') || ''));
    if (own.length > 1) { set('wallet', 'check', `Ada ${own.length} dompet: ${own.map(id => ctx.wallets.find(w => w.id === id)?.name).join(' dan ')}`); options.wallet = own; }
    else if (r.preset.walletId) set('wallet', 'verified', `“${found.find(w => w.id === r.preset.walletId)?.word || ''}”`);
    else if (kind === 'balance') set('wallet', 'missing', 'Dompet mana yang saldonya diperbarui?');
    else if (DEFAULT_WALLET.has(kind)) set('wallet', 'likely', 'dompet utama (bawaan)');
    if (kind === 'target') set('to', r.preset.destinationWalletId ? 'likely' : 'missing', r.preset.destinationWalletId ? 'dompet tujuan dana ini' : 'Tujuan dana ini belum punya dompet sendiri');
  }

  // Record, category, person, name.
  if (PAY_KINDS.has(kind)) {
    const again = recordCheck(text, r, ctx);
    if (again && !again.unlink) set('link', again.status, again.note);
    else set('link', 'missing', kind === 'debt_payment' ? 'Utang yang mana?' : kind === 'receivable_payment' ? 'Piutang yang mana?' : kind === 'claim_payment' ? 'Klaim yang mana?' : kind === 'target' ? 'Tujuan dana yang mana?' : 'Wish list yang mana?');
  }
  if (kind === 'expense') {
    // "nasi dan es teh": several things of one main category → the main category, not one of their subcategories.
    const parts = text.replace(/(?:rp\.?\s*)?\d+(?:[.,]\d+)*\s*(?:rb|ribu|k|jt|juta)?\b/g, ' ').replace(DATE_ANY(), ' ').replace(/\b(beli|bayar|jajan|pakai|via|di)\b.*?(?=\s|$)/g, m => /^(beli|bayar|jajan)/.test(m) ? ' ' : m).replace(/\b(?:pakai|via|di)\s+\S+/g, ' ').trim().split(/\s+(?:dan|sama|plus|&|\+)\s+|\s*,\s*/).filter(Boolean);
    if (parts.length > 1 && r.preset.subcategoryId) {
      const cats = parts.map(part => parseQuickText(`beli ${part.trim()} 1rb`, ctx, 'expense')?.preset).filter(Boolean).map(p => p!.categoryId);
      const subs = parts.map(part => parseQuickText(`beli ${part} 1rb`, ctx, 'expense')?.preset.subcategoryId || null);
      if (cats.length === parts.length && new Set(cats).size === 1 && new Set(subs).size > 1) { r.preset.subcategoryId = null; r.preset.categoryId = cats[0]; r.why = `${parts.join(', ')} → ${ctx.categories.find(c => c.id === cats[0])?.name}`; }
    }
  }
  if (kind === 'expense' || kind === 'income') {
    const id = r.preset.subcategoryId || r.preset.categoryId, cat = ctx.categories.find(c => c.id === id);
    if (!cat) { if (kind === 'expense') set('category', 'missing', 'Kategorinya belum ketemu'); }
    else {
      const word = has(text, cat.name.toLocaleLowerCase('id-ID')) ? cat.name.toLocaleLowerCase('id-ID') : cat.name.toLocaleLowerCase('id-ID').split(/[^\p{L}]+/u).find(w => w.length >= 4 && has(text, w));
      set('category', word ? 'verified' : 'likely', r.why || (word ? `“${word}” → ${cat.name}` : `dibaca dari isi kalimat → ${cat.name}`));
    }
  }
  // "Budi 100rb": nothing says whether money went out, came in or was lent.
  // Only when the words name a person (someone in the records, or a name written with a capital letter mid-sentence):
  // "zakat 175rb" is still spending, just without a category yet.
  const people = [...(ctx.receivables || []).map(x => x.person), ...(ctx.debts || []).map(d => d.provider)].filter(Boolean).map(n => n.toLocaleLowerCase('id-ID'));
  const named = text.split(/[^\p{L}]+/u).some(w => people.includes(w)) || unit.text.split(/[^\p{L}]+/u).some((w, i) => i > 0 && /^\p{Lu}\p{Ll}{2,}$/u.test(w) && !walletsIn(w.toLocaleLowerCase('id-ID'), ctx.wallets).length);
  if (kind === 'expense' && fields.category?.status === 'missing' && !strongCue.test(text) && !TX_CUE.test(text) && named) set('kind', 'check', 'Tidak ada kata kerjanya: keluar, masuk, utang, atau piutang?');
  if (kind === 'budget') set('category', r.budget?.categoryId ? (r.why ? 'likely' : 'verified') : 'missing', r.budget?.categoryId ? r.why : 'Kategori anggarannya belum ketemu');
  if (kind === 'receivable_new' || kind === 'debt_new') {
    // A name written with a capital letter ("… tiket konser Sinta 750rb") is the person; otherwise the word next to the
    // verb is only a guess when other words stand around it.
    const known = [...(ctx.receivables || []).map(x => x.person), ...(ctx.debts || []).map(d => d.provider)].filter(Boolean).map(n => n.toLocaleLowerCase('id-ID'));
    const walletWords = new Set(ctx.wallets.flatMap(w => w.name.toLocaleLowerCase('id-ID').split(/\s+/)));
    const capitals = [...new Set(unit.text.split(/[^\p{L}]+/u).filter((w, i) => i > 0 && /^\p{Lu}\p{Ll}{2,}$/u.test(w) && !walletWords.has(w.toLocaleLowerCase('id-ID'))))];
    if (capitals.length === 1 && (r.person || '').toLocaleLowerCase('id-ID') !== capitals[0].toLocaleLowerCase('id-ID') && !known.includes((r.person || '').toLocaleLowerCase('id-ID'))) { r.person = capitals[0]; set('person', 'verified', `${capitals[0]} (ditulis dengan huruf besar)`); }
    else if (r.person) {
      const person = r.person, others = leftoverWords(text, ctx, [person.toLocaleLowerCase('id-ID')]).filter(w => !/^(pinjem|pinjam|minjem|pinjemin|minjemin|talangin|nalangin|bayarin|utang|hutang|kasih|ngasih|pinjaman|dulu|nanti|ganti|gantiin|balikin|dia|makan)$/.test(w));
      const sure = known.includes(person.toLocaleLowerCase('id-ID')) || capitals.some(c => c.toLocaleLowerCase('id-ID') === person.toLocaleLowerCase('id-ID')) || others.length === 0;
      set('person', sure ? 'verified' : 'check', sure ? person : `Nama orangnya ${person}? Kata lain: ${others.join(', ')}`);
    } else if (kind === 'receivable_new') set('person', 'missing', 'Siapa yang meminjam?');
  }
  // Spending to / income from a person without a record (V3): "ke X" after kirim/transfer is a clear cue; "bayar X" and
  // "dari X" only when X is someone in the records, otherwise it is marked to check (it may be a thing, not a person).
  if ((kind === 'expense' || kind === 'income') && r.person) {
    const known = [...(ctx.receivables || []).map(x => x.person), ...(ctx.debts || []).map(d => d.provider)].filter(Boolean).map(n => n.toLocaleLowerCase('id-ID'));
    const sure = r.personCue === 'to' || known.includes(r.person.toLocaleLowerCase('id-ID')) || unit.text.includes(r.person);
    set('person', sure ? 'likely' : 'check', sure ? `${r.person} (${r.personCue === 'from' ? 'pengirim' : 'penerima'})` : `${r.person} itu nama orang? Kalau bukan, hapus saja.`);
    evidence.push(r.personCue === 'from' ? `${r.person} dianggap pengirim karena muncul setelah “dari”.` : r.personCue === 'to' ? `${r.person} dianggap penerima karena muncul setelah “ke”, dan bukan dompet terdaftar.` : `${r.person} dianggap penerima karena muncul setelah “bayar”.`);
  }
  if (['note_new', 'fund_new', 'wish_new', 'category_new', 'wallet_new', 'recurring_new', 'plan_new'].includes(kind)) set('name', r.name?.trim() ? 'likely' : 'missing', r.name?.trim() ? undefined : 'Namanya belum ada');
  if (kind === 'open' && !r.menu) set('kind', 'check', 'Menu belum dikenali');

  // Other readings.
  const alternatives: QuickAlternative[] = [];
  const tried = new Set<QuickKind>([kind]);
  const wish = (ctx.wishlist || []).some(w => w.status === 'active'), funds = (ctx.funds || []).some(f => !f.isArchived);
  const extra: QuickKind[] = [...(SIBLING[kind] || [])];
  if (kind !== kind0) extra.unshift(kind0);
  if (demoted) extra.unshift(demoted);
  if (fields.kind?.status === 'check' && kind === 'expense') extra.push('income', 'debt_new', 'receivable_new');
  if (kind === 'expense') {
    if (/\b(cicilan|angsuran|kredit|paylater|utang|hutang)\b/.test(text)) extra.push('debt_payment');
    if (/\b(bayarin|talangin|nalangin)\b/.test(text)) extra.push('receivable_new');
    if (/\b(kantor|dinas|klien)\b/.test(text)) extra.push('claim_new');
    if (found.some(w => /\bke\s+$/.test(text.slice(0, w.at)))) extra.push('transfer');
  }
  if (kind === 'income') { if ((ctx.receivables || []).length && /\bdari\b/.test(text)) extra.push('receivable_payment'); if (/\bdari\s+\p{L}+/u.test(text)) extra.push('debt_new'); }
  if (kind === 'plan_new' || kind === 'recurring_new') extra.unshift(r.preset.type === 'income' ? 'income' : 'expense');
  for (const k of extra) {
    if (tried.has(k) || alternatives.length >= 3) continue; tried.add(k);
    if (k === 'wish' && !wish || k === 'target' && !funds || k === 'debt_payment' && !(ctx.debts || []).some(d => d.outstandingAmount > 0) || k === 'receivable_payment' && !(ctx.receivables || []).some(x => x.remainingAmount > 0) || k === 'claim_payment' && !(ctx.claims || []).some(c => c.remainingAmount > 0) || k === 'plan_new' && !r.amount) continue;
    const alt = parseQuickText(amountMissing ? `${text} 1rb` : text, ctx, k);
    if (!alt || alt.kind !== k) continue;
    if (amountMissing) { alt.amount = 0; if (alt.preset.amount) alt.preset.amount = 0; }
    if (r.preset.time) alt.preset.time = r.preset.time;
    alternatives.push({ kind: k, label: k === 'expense' && (kind === 'plan_new' || kind === 'recurring_new') ? 'Catat sekarang' : QUICK_LABELS[k], result: alt });
  }

  for (const [key, f] of Object.entries(fields)) if (f?.note && key !== 'kind' && f.status !== 'missing' && f.status !== 'check') evidence.push(`${FIELD_LABELS[key as FieldKey]}: ${f.note}`);
  if (daypart) evidence.push(`waktu: ${daypart}`);
  const dateAtEnd = new RegExp(`(?:${DATE_ANY().source})\\s*$`).test(text.replace(/[.,!]+$/, ''));
  // V3.1 temporal Bug Catcher: time and date phrases belong to their fields only; a clock needs a time phrase.
  const temporalPhrases = [...findTimes(text).map(t => t.raw), ...phrases];
  const tcaught = catchTemporalBugs({ kind, description: r.preset.description, merchant: r.preset.merchant, person: r.person, time: r.preset.time }, temporalPhrases, findTimes(text).length > 0, DATED.has(kind));
  if (tcaught.changed) { r.preset.description = tcaught.parse.description; r.preset.merchant = tcaught.parse.merchant; r.person = tcaught.parse.person; r.preset.time = tcaught.parse.time; if (!r.preset.time) delete fields.time; }
  if (tcaught.warnings.some(w => w.code === 'EXPLICIT_TIME_IGNORED') && fields.time?.status !== 'check') set('time', 'check', 'Jam di kalimat belum terbaca');
  // Whatever the Bug Catcher could not repair is a doubt on that field.
  for (const w of caught.warnings.filter(x => !x.repaired)) {
    if (w.code === 'UNASSIGNED_KNOWN_WALLET' && fields.wallet && fields.wallet.status !== 'check') set('wallet', 'check', `Ada dompet lain: ${w.detail}`);
    if (w.code === 'ROLE_COLLISION' && fields.person) set('person', 'check', w.detail);
  }
  if (caught.warnings.some(w => w.code === 'KNOWN_WALLET_SWALLOWED_BY_MERCHANT' || w.code === 'WALLET_AS_PERSON')) evidence.push(...caught.warnings.filter(w => w.repaired).map(w => `${w.detail}.`));
  const graph = entityGraph(r, text, ctx);
  // "Kenapa?" for the entities, in plain words.
  for (const n of graph) {
    if (n.selectedType === 'MERCHANT_OR_PLACE' && r.preset.merchant) evidence.push(`${r.preset.merchant} dianggap tempat transaksi karena ${/setelah/.test(n.sourceEngineEvidence.join(' ')) ? `muncul setelah “${n.sourceEngineEvidence.join(' ').match(/setelah “([^”]+)”/)?.[1] || 'di'}”` : 'cocok dengan nama tempat yang dikenal'}.`);
    if (/WALLET/.test(n.selectedType) && n.linkedRecord && [r.preset.walletId, r.preset.destinationWalletId].includes(n.linkedRecord)) { const w = ctx.wallets.find(x => x.id === n.linkedRecord); if (w) evidence.push(`${w.name} dikenali sebagai dompet karena cocok dengan dompet ${w.name} yang sudah ada.`); }
    if (n.selectedType === 'AMOUNT' && r.amount && !/^(?:rp\.?\s*)?[\d.]+$/.test(n.rawText.trim())) evidence.push(`${rupiah(r.amount)} dibaca dari “${n.rawText.trim()}”.`);
  }
  // The plain sentences replace the short V2.5 lines that say the same thing.
  for (const [short, long] of [[/^Nominal: “/, / dibaca dari “/], [/^Dompet: “/, / dikenali sebagai dompet karena/]] as const) if (evidence.some(e => long.test(e))) for (let i = evidence.length - 1; i >= 0; i--) if (short.test(evidence[i])) evidence.splice(i, 1);
  const action: Analyzed = { id: `a${index}`, clause: index, text: unit.text, result: r, fields, evidence: [...new Set(evidence)], alternatives, options, daypart, warnings, review: false, confidence: 1, explicit: { wallet: explicitWallet, date: explicitDate }, assigned: {}, connector: unit.connector, dateAtEnd, entities: graph, rejected: r.entities?.rejected || [], checks: [...caught.warnings, ...tcaught.warnings], temporal };
  return action;
}

/* ------------------------------------------------------------------ Shared context and references */

function setWallet(a: Analyzed, id: string, status: FieldStatus, note: string) {
  for (const r of [a.result, ...a.alternatives.map(x => x.result)]) if (r.kind !== 'transfer' || !r.preset.walletId) r.preset.walletId = id;
  a.fields.wallet = { status, note }; a.evidence.push(`Dompet: ${note}`);
}
function setDate(a: Analyzed, date: string, status: FieldStatus, note: string) {
  for (const r of [a.result, ...a.alternatives.map(x => x.result)]) { r.date = date; r.preset.date = date; }
  a.fields.date = { status, note }; a.evidence.push(`Tanggal: ${note}`);
}
const ORDINAL: Record<string, number> = { pertama: 1, kesatu: 1, kedua: 2, ketiga: 3, keempat: 4, kelima: 5, keenam: 6 };
const WALLET_TAKERS = new Set<QuickKind>(['expense', 'income', 'plan_new', 'recurring_new', 'debt_payment', 'receivable_payment', 'claim_new', 'claim_payment', 'target', 'transfer', 'debt_new', 'receivable_new']);

type Graph = { relations: QuickRelation[]; trace: string[] };
const AMOUNT_TEXT = /(?:rp\.?\s*)?\d+(?:[.,]\d+)*\s*(?:rb|ribu|k|jt|juta)?\b/g;

function applyModifier(unit: Unit, before: Analyzed[], after: Analyzed[], ctx: QuickContext, unresolved: string[], graph: Graph) {
  const t = unit.norm, wallet = walletsIn(t, ctx.wallets)[0];
  const phrase = [...t.matchAll(DATE_ANY())][0]?.[0];
  const when = phrase ? (/^tadi|^barusan/.test(phrase) ? { date: ctx.today, label: phrase } : readDate(phrase, ctx.today, false, false, ctx.salaryDay)) : null;
  const ref = unit.ref || t.match(REFERENCE)?.[0] || '';
  let targets: Analyzed[] = [], explicit = true;
  const fail = (why: string) => { unresolved.push(why); graph.trace.push(`rujukan gagal: ${why}`); };
  if (/dua-duanya|keduanya/.test(ref)) { if (before.length === 2) targets = before; else return fail(`“${ref}” tidak jelas: ada ${before.length} catatan sebelumnya.`); }
  else if (/^semua/.test(ref)) targets = before.length ? before : after;
  else if (/sisanya|lain/.test(ref)) { targets = before.filter(a => wallet ? !a.explicit.wallet && !a.assigned.wallet : !a.explicit.date && !a.assigned.date); explicit = true; }
  else if (/^yang\s/.test(ref)) {
    const word = ref.replace(/^yang\s+/, ''), n = ORDINAL[word] || Number(word.match(/\d+/)?.[0] || 0);
    if (/^terakhir$/.test(word)) targets = before.slice(-1);
    else if (/^(tadi|itu|satunya)$/.test(word)) {
      // "yang tadi" with several entries before it: which one is not clear, so each candidate is marked and nothing is chosen.
      if (before.length === 1) targets = before;
      else {
        const names = before.map(a => (a.result.preset.description || a.text).toLocaleLowerCase('id-ID')).join(' atau ');
        for (const a of before) {
          if (wallet && WALLET_TAKERS.has(a.result.kind)) { a.fields.wallet = { status: 'check', note: `“${ref}” bisa ${names}` }; a.options.wallet = [...new Set([a.result.preset.walletId, wallet.id].filter(Boolean) as string[])]; }
          if (when && DATED.has(a.result.kind)) { a.fields.date = { status: 'check', note: `“${ref}” bisa ${names}` }; a.options.date = [{ date: a.result.date, label: 'tetap' }, { date: when.date, label: when.label }]; }
        }
        return fail(`Maksudnya yang ${names}?`);
      }
    }
    else if (n) { if (before[n - 1]) targets = [before[n - 1]]; else return fail(`“${ref}” tidak ada: hanya ada ${before.length} catatan.`); }
    else {
      const hit = before.filter(a => has(a.result.preset.description?.toLocaleLowerCase('id-ID') || '', word) || has(a.text.toLocaleLowerCase('id-ID'), word));
      if (hit.length === 1) targets = hit; else return fail(hit.length ? `“${ref}” cocok dengan ${hit.length} catatan; pilih di tiap catatan.` : `Tidak ada catatan “${word}” sebelumnya.`);
    }
  } else if (unit.connector === 'tapi') targets = before.slice(-1);
  else { explicit = false; targets = before.length ? before : after; }
  if (!targets.length) { if (ref) fail(`“${ref}” tidak merujuk ke catatan mana pun.`); return; }
  const said = ref ? `“${unit.text.trim()}”` : 'disebut sekali untuk semuanya';
  // "yang bensin 75 ternyata": a new amount for exactly one earlier entry.
  const amount = ref ? findAmounts(t.replace(REFERENCE, ' ')).find(a => a.marked || a.value >= 1) : undefined;
  if (amount) {
    if (targets.length !== 1) fail(`Nominal di “${unit.text.trim()}” untuk catatan yang mana?`);
    else {
      const a = targets[0], old = a.result.amount;
      const value = !amount.marked && amount.value < 1000 && old >= 1000 && amount.value * 1000 <= old * 3 ? amount.value * 1000 : amount.value;
      for (const r of [a.result, ...a.alternatives.map(x => x.result)]) { r.amount = value; if (r.preset.amount !== undefined) r.preset.amount = value; }
      a.fields.amount = { status: value === amount.value || amount.marked ? 'verified' : 'likely', note: `dikoreksi: ${rupiah(old)} → ${rupiah(value)} (${said})` };
      a.evidence.push(`Nominal: ${a.fields.amount.note}`);
      graph.relations.push({ type: 'correction_of', from: `c${unit.index}`, to: a.id, note: `${rupiah(old)} → ${rupiah(value)}`, confidence: a.fields.amount.status });
    }
  }
  for (const a of targets) {
    if (wallet && WALLET_TAKERS.has(a.result.kind)) {
      if (a.result.kind === 'transfer' && a.result.preset.walletId) continue;
      const own = a.explicit.wallet && a.result.preset.walletId && a.result.preset.walletId !== wallet.id;
      if (own && !explicit) continue;
      if (own && /^semua/.test(ref)) { a.fields.wallet = { status: 'check', note: `Disebut ${ctx.wallets.find(w => w.id === a.result.preset.walletId)?.name} dan ${wallet.name}` }; a.options.wallet = [a.result.preset.walletId!, wallet.id]; continue; }
      setWallet(a, wallet.id, explicit ? 'verified' : 'likely', `${wallet.name} (${said})`); a.assigned.wallet = true;
      graph.relations.push({ type: ref ? 'refers_to' : 'shared_wallet', from: `c${unit.index}`, to: a.id, note: `${wallet.name} ← ${said}`, confidence: explicit ? 'verified' : 'likely' });
    }
    if (when && DATED.has(a.result.kind) && !(a.explicit.date && !explicit) && when.date <= ctx.today) {
      setDate(a, when.date, explicit ? 'verified' : 'likely', `${when.label} (${said})`); a.assigned.date = true;
      graph.relations.push({ type: ref && !/dua-duanya|keduanya|^semua/.test(ref) ? 'refers_to' : 'shared_date', from: `c${unit.index}`, to: a.id, note: `${when.label} ← ${said}`, confidence: explicit ? 'verified' : 'likely' });
    }
  }
}

/** A value said in one clause, for the clauses that don't say their own. */
/** A date given to an action after it was read (shared or corrected): its clock is placed again on that date. */
function retime(a: Analyzed, ctx: QuickContext) {
  if (!a.temporal) return;
  const t = a.temporal, resolution = resolveTime(t.expr, { today: ctx.today, now: ctx.now || '12:00', date: a.result.date, dateLocked: true, future: t.future, pastCue: t.pastCue });
  a.temporal = { ...t, resolution, dateLocked: true };
  a.result.preset.time = resolution.time;
  a.fields.time = { status: resolution.status, note: resolution.reason.replace(/\.$/, '') };
  a.options.time = resolution.alternatives.length ? [...new Set(resolution.alternatives.map(x => x.time))] : undefined;
}

function inherit(actions: Analyzed[], today: string, graph: Graph, ctx: QuickContext) {
  // "makan 25rb sama parkir 5rb kemarin": a date at the very end of a "sama/dan" pair covers both.
  for (let i = actions.length - 1; i > 0; i--) {
    const a = actions[i], prev = actions[i - 1];
    if (a.explicit.date && a.dateAtEnd && /^(sama|dan|&|\+|plus)$/.test(a.connector) && prev.clause === a.clause - 1 && !prev.explicit.date && !prev.assigned.date && DATED.has(prev.result.kind) && DATED.has(a.result.kind) && a.result.date <= today && a.fields.date?.status === 'verified') {
      const label = a.fields.date?.note?.match(/^“(.+?)”/)?.[1] || shortDate(a.result.date);
      setDate(prev, a.result.date, 'likely', `“${label}” disebut di akhir untuk keduanya`); prev.assigned.date = true; retime(prev, ctx);
      graph.relations.push({ type: 'shared_date', from: a.id, to: prev.id, note: `“${label}” di akhir “${a.connector}”`, confidence: 'likely' });
    }
  }
  // Dates carry forward ("kemarin makan 25rb, parkir 5rb"), never into the future and never over a date of its own.
  let last: { date: string; label: string; from: string } | null = null;
  for (const a of actions) {
    if ((a.explicit.date || a.assigned.date) && DATED.has(a.result.kind) && a.fields.date?.status !== 'missing' && a.fields.date?.status !== 'check') { last = { date: a.result.date, label: a.fields.date?.note?.match(/^“(.+?)”/)?.[1] || shortDate(a.result.date), from: a.id }; continue; }
    if (a.explicit.date) { last = null; continue; }
    if (last && DATED.has(a.result.kind) && !a.assigned.date && last.date <= today && last.date !== a.result.date) {
      setDate(a, last.date, 'likely', `ikut “${last.label}” dari bagian sebelumnya`); retime(a, ctx);
      graph.relations.push({ type: 'shared_date', from: last.from, to: a.id, note: `ikut “${last.label}”`, confidence: 'likely' });
    }
  }
  // A time said first, before what was bought ("jam 8 beli kopi 20k sama roti 10k"), covers the parts joined to it by
  // "sama / dan"; a part with its own time, or joined by "terus / lalu" (a later event), keeps its own.
  for (let i = 1; i < actions.length; i++) {
    const a = actions[i], prev = actions[i - 1], lead = prev.temporal && prev.temporal.expr.start === 0 ? prev : null;
    if (!lead || a.temporal || a.result.preset.time || !DATED.has(a.result.kind) || !/^(sama|dan|&|\+|plus)$/.test(a.connector) || a.result.date !== lead.result.date) continue;
    a.result.preset.time = lead.result.preset.time;
    a.fields.time = { status: 'likely', note: `ikut “${lead.temporal!.expr.raw}” dari bagian sebelumnya` };
    a.temporal = { ...lead.temporal!, expr: { ...lead.temporal!.expr, start: 0 } };
    graph.relations.push({ type: 'shared_date', from: lead.id, to: a.id, note: `jam “${lead.temporal!.expr.raw}” untuk keduanya`, confidence: 'likely' });
  }
  // A wallet said once among several spendings (or incomes) counts for the others of the same kind.
  for (const kind of ['expense', 'income'] as const) {
    const flows = actions.filter(a => a.result.kind === kind);
    const said = [...new Set(flows.filter(a => a.explicit.wallet).map(a => a.result.preset.walletId!))];
    for (const a of flows.filter(x => !x.explicit.wallet && !x.assigned.wallet)) {
      if (said.length === 1 && flows.length > 1) { setWallet(a, said[0], 'likely', 'disebut sekali untuk semuanya'); graph.relations.push({ type: 'shared_wallet', from: flows.find(f => f.explicit.wallet)!.id, to: a.id, note: 'disebut sekali untuk semuanya', confidence: 'likely' }); }
      else if (said.length > 1) { a.fields.wallet = { status: 'check', note: 'Dompetnya tidak disebut; kalimat ini menyebut beberapa dompet' }; a.options.wallet = said; }
    }
  }
}

/* ------------------------------------------------------------------ Questions */

/** The one question to ask for an action: its first open field, in words that keep what is already known. */
/** Review flag, confidence and the one question of an action, from its field states (also after V3 consensus). */
export function refreshAction(a: ActionCandidate, ctx: QuickContext) {
  const states = Object.values(a.fields).filter(Boolean) as FieldState[];
  a.review = states.some(f => f.status === 'check' || f.status === 'missing') || a.warnings.length > 0;
  a.confidence = Math.min(1, ...states.map(f => RANK[f.status]));
  a.ask = askFor(a, ctx);
}
function askFor(a: ActionCandidate, ctx: QuickContext): QuickAsk | undefined {
  const r = a.result, open = (key: FieldKey) => a.fields[key]?.status === 'missing' || a.fields[key]?.status === 'check';
  const walletName = (id?: string | null) => ctx.wallets.find(w => w.id === id)?.name;
  const what = r.preset.description || QUICK_LABELS[r.kind].toLowerCase();
  const wallets = ctx.wallets.filter(w => !w.isArchived).map(w => w.id);
  if (open('kind')) return { field: 'kind', question: `${r.amount ? `${rupiah(r.amount)} ini` : 'Ini'} pengeluaran, pemasukan, utang, atau piutang?`, choices: ['expense', 'income', 'debt_new', 'receivable_new'] };
  if (open('amount')) return { field: 'amount', question: a.options.amount?.length ? `Nominal ${what}: ${a.options.amount.map(rupiah).join(' atau ')}?` : `Berapa nominal ${what}?`, ...(a.options.amount ? { choices: a.options.amount.map(String) } : {}) };
  if (r.kind === 'transfer' && open('wallet')) return { field: 'wallet', question: `${r.amount ? rupiah(r.amount) : 'Transfer'}${r.preset.destinationWalletId ? ` ke ${walletName(r.preset.destinationWalletId)}` : ''} dari dompet mana?`, choices: wallets.filter(id => id !== r.preset.destinationWalletId) };
  if (open('to')) return { field: 'to', question: `${r.amount ? rupiah(r.amount) : 'Transfer'}${r.preset.walletId ? ` dari ${walletName(r.preset.walletId)}` : ''} ke dompet mana?`, choices: wallets.filter(id => id !== r.preset.walletId) };
  if (open('wallet')) return { field: 'wallet', question: r.kind === 'balance' ? 'Saldo dompet mana?' : `${what[0].toUpperCase()}${what.slice(1)} pakai dompet mana?`, choices: a.options.wallet?.length ? a.options.wallet : wallets };
  if (open('link')) {
    const list = r.kind === 'debt_payment' ? (ctx.debts || []).filter(d => d.outstandingAmount > 0).map(d => [d.id, d.name]) : r.kind === 'receivable_payment' ? (ctx.receivables || []).filter(x => x.remainingAmount > 0).map(x => [x.id, x.person]) : r.kind === 'claim_payment' ? (ctx.claims || []).filter(c => c.remainingAmount > 0).map(c => [c.id, c.name]) : r.kind === 'target' ? (ctx.funds || []).filter(f => !f.isArchived).map(f => [f.id, f.name]) : [];
    const noun = r.kind === 'debt_payment' ? 'Utang' : r.kind === 'receivable_payment' ? 'Piutang' : r.kind === 'claim_payment' ? 'Klaim' : r.kind === 'target' ? 'Tujuan dana' : 'Catatan';
    return { field: 'link', question: list.length && list.length <= 3 ? `${noun} yang mana: ${list.map(x => x[1]).join(' atau ')}?` : `${noun} yang mana?`, choices: list.map(x => x[0]) };
  }
  if (open('person')) return { field: 'person', question: r.kind === 'receivable_new' ? 'Siapa yang meminjam?' : 'Siapa orangnya?' };
  if (open('date')) return { field: 'date', question: a.options.date?.length ? `Tanggalnya ${a.options.date.map(d => d.label).join(' atau ')}?` : 'Tanggal berapa?' };
  if (open('name')) return { field: 'name', question: 'Namanya apa?' };
  return undefined;
}

/* ------------------------------------------------------------------ The plan */

const RANK: Record<FieldStatus, number> = { verified: 1, likely: .8, check: .4, missing: 0 };
/** "ga jadi", "batal", "cancel": the message takes something back. */
const CANCEL = /\btidak jadi\b|\bbatal(?:in|kan)?\b|\bcancel\b|\bdibatalkan\b/;
/** "jadi dia utang ke aku", "catat aldi utang ke aku": what a talangan means, not a second payment. */
const CONSEQUENCE = /(?:^|\b(?:jadi|catat|berarti|biar|anggap|terus|nah)\s+)(?:dia|ia|\p{L}+)\s+(?:utang|hutang|ngutang|berutang|berhutang|minjem|pinjam)\s+(?:ke|sama|ama|kepada|dengan)?\s*(?:aku|saya)\b/u;
const FILLER = /\b(pakai|via|lewat|dari|bayar|dibayar|bayarnya|juga|aja|saja|ya|dong|sama|semua|itu|tapi|terus|lalu|yang|pake|pakainya|semuanya|pas|waktu|ternyata|harusnya|seharusnya|jadinya|cuma|hanya|deh|sih|eh)\b/g;

export function parseQuickPlan(input: string, ctx: QuickContext, mode: QuickGroup | QuickKind = 'auto'): QuickParseResult {
  const sourceText = input.trim();
  const graph: Graph = { relations: [], trace: [] };
  const empty: QuickParseResult = { sourceText, normalizedText: '', clauses: [], entities: [], actions: [], unresolved: [], references: [], confidence: 'none', warnings: [], relations: [], cancelled: [], trace: [] };
  if (!sourceText) return empty;
  const prep = (text: string) => { const c = applyCorrections(normalizeQuick(text), ctx); return c; };
  const classify = (norm: string, said = ''): Unit['cls'] | 'correction' | 'incomplete' | 'implicit' => {
    if (CANCEL.test(norm)) return 'cancel';
    if (CORRECTION_START.test(norm)) return 'correction';
    const amounts = findAmounts(norm);
    if (amounts.length && !norm.replace(AMOUNT_TEXT, ' ').replace(/\b(lagi|juga|aja|saja|ya|deh|dong|atau|jadi)\b/g, ' ').trim()) return 'amountOnly';
    const ref = norm.match(REFERENCE)?.[0], wallet = walletsIn(norm, ctx.wallets).length > 0, date = DATE_ANY().test(norm);
    // A reference with a new amount ("yang bensin 75 ternyata") corrects that entry; it is not a new one.
    if (ref && amounts.length) {
      const rest = norm.replace(REFERENCE, ' ').replace(AMOUNT_TEXT, ' ').replace(FILLER, ' ').trim();
      if (!rest) return 'modifier';
    }
    const r = parseQuickText(norm, ctx, mode);
    if (r && (r.amount > 0 || NO_AMOUNT.has(r.kind))) return 'action';
    if (ref || wallet || date) {
      let rest = norm.replace(REFERENCE, ' ').replace(DATE_ANY(), ' ');
      for (const w of walletsIn(rest, ctx.wallets)) rest = rest.replace(new RegExp(`\\b${esc(w.word)}\\b`), ' ');
      rest = rest.replace(FILLER, ' ').trim();
      if (!rest) return 'modifier';
      // "tapi makan cash": the words left name an entry said before → a reference to it.
      const words = rest.split(/\s+/).map(w => w.replace(/nya$/, ''));
      if (!ref && said && words.length <= 2 && words.every(w => w.length >= 3 && has(said, w))) return 'implicit';
    }
    return 'incomplete';
  };

  // Clauses: split at commas, full stops, new lines and joining words, then join back what cannot stand alone
  // ("beli nasi" + "es teh 25rb"; "budget makan untuk sarapan" + "makan siang" + "kopi 2jt").
  const units: Unit[] = [];
  let pending: Piece | null = null;
  const make = (p: Piece, cls: Unit['cls'], extra: Partial<Unit> = {}): Unit => { const text = sourceText.slice(p.start, p.end).trim(), c = prep(text); return { ...p, text, norm: c.text, notes: c.notes, negated: c.negated, cls, index: 0, ...extra }; };
  const join = (a: Piece, b: Piece): Piece => ({ start: a.start, end: b.end, connector: a.connector });
  const kindFixed = (u?: Unit) => Boolean(u && u.negated.size);
  for (const piece of pieces(sourceText)) {
    const alone = prep(sourceText.slice(piece.start, piece.end)).text, said = prep(sourceText.slice(0, piece.start)).text;
    if (CANCEL.test(alone) && !pending) { units.push(make(piece, 'cancel')); continue; }
    const lastUnit = units[units.length - 1];
    // "… pake bca, eh bukan, pake mandiri": a "bukan" left hanging takes the next piece as what it meant.
    if (!pending && lastUnit?.cls === 'action' && /\bbukan\s*[,.]?\s*$/.test(lastUnit.text)) { const merged = join(lastUnit, piece); units[units.length - 1] = make(merged, 'action'); continue; }
    // "100rb ke mandiri, eh bukan pengeluaran, transfer dari jago": what follows a kind correction belongs to it.
    if (!pending && kindFixed(lastUnit) && lastUnit.cls === 'action' && !findAmounts(alone).length && !CANCEL.test(alone)) { units[units.length - 1] = make(join(lastUnit, piece), 'action'); continue; }
    if (pending) {
      const before = prep(sourceText.slice(pending.start, pending.end)).text;
      // "transfer dari bca ke gopay, beli pulsa 50rb": the first clause is its own action even without an amount.
      if (TX_CUE.test(before) && VERB_START.test(alone) && classify(alone) === 'action') { units.push(make(pending, 'action', { noAmount: true })); pending = null; }
    }
    const cur: Piece = pending ? join(pending, piece) : piece;
    const cls = classify(prep(sourceText.slice(cur.start, cur.end)).text, pending ? '' : said);
    if (cls === 'correction') {
      const last = units[units.length - 1];
      if (last && !pending && last.cls !== 'cancel') { units[units.length - 1] = make(join(last, piece), classify(prep(sourceText.slice(last.start, piece.end)).text) as Unit['cls']); continue; }
      pending = cur; continue;
    }
    if (cls === 'incomplete') { pending = cur; continue; }
    if (cls === 'implicit') {
      const rest = prep(sourceText.slice(cur.start, cur.end)).text.replace(REFERENCE, ' ').replace(DATE_ANY(), ' ');
      let words = rest; for (const w of walletsIn(words, ctx.wallets)) words = words.replace(new RegExp(`\\b${esc(w.word)}\\b`), ' ');
      units.push(make(cur, 'modifier', { ref: `yang ${words.replace(FILLER, ' ').trim().split(/\s+/).map(w => w.replace(/nya$/, '')).join(' ')}` })); pending = null; continue;
    }
    units.push(make(cur, cls as Unit['cls'])); pending = null;
  }
  if (pending) {
    const last = units[units.length - 1];
    const text = prep(sourceText.slice(pending.start, pending.end)).text;
    if (last && last.cls === 'action' && (!TX_CUE.test(text) || kindFixed(last) && !findAmounts(text).length)) { const merged = join(last, pending), cls = classify(prep(sourceText.slice(merged.start, merged.end)).text); units[units.length - 1] = make(merged, cls === 'incomplete' || cls === 'correction' || cls === 'cancel' ? 'action' : cls as Unit['cls']); }
    else units.push(make(pending, TX_CUE.test(text) ? 'action' : 'ignored', TX_CUE.test(text) ? { noAmount: true } : {}));
  }
  units.forEach((u, i) => { u.index = i; });
  graph.trace.push(`normalisasi: ${units.map(u => u.norm).join(' · ')}`);
  graph.trace.push(`klausa: ${units.map((u, i) => `[${i}:${u.cls}${u.ref ? ` ${u.ref}` : ''}] ${u.text}`).join(' ')}`);
  for (const u of units) for (const n of u.notes) graph.trace.push(`koreksi di klausa ${u.index}: ${n}`);

  // One reading per action clause.
  const actions: Analyzed[] = [], unresolved: string[] = [], warnings: string[] = [], cancelled: string[] = [];
  units.forEach((unit, i) => {
    if (unit.cls !== 'action') return;
    let a = analyze(unit, i, ctx, mode);
    // "budget makan 2jt, transport 800rb": "budget" said first covers the clauses after it that name no other action.
    const prev = actions[actions.length - 1];
    if (a && prev?.result.kind === 'budget' && ['expense', 'income'].includes(a.result.kind) && !OWN_KIND.test(unit.norm) && mode === 'auto') a = analyze(unit, i, ctx, mode, `budget ${unit.norm}`) || a;
    if (a) { actions.push(a); graph.trace.push(`aksi ${a.id}: ${a.result.kind} ${a.result.amount ? rupiah(a.result.amount) : '-'} dari “${unit.text}”`); } else unit.cls = 'ignored';
  });
  for (const unit of units) for (const n of unit.notes) { const a = actions.find(x => x.clause === unit.index); if (a && /^dikoreksi/.test(n)) graph.relations.push({ type: 'correction_of', from: `c${unit.index}`, to: a.id, note: n.replace(/^dikoreksi:\s*/, ''), confidence: 'verified' }); }

  // "jadi dia utang ke aku" after a talangan: the same money, now a receivable — one action, not two.
  for (let i = actions.length - 1; i > 0; i--) {
    const a = actions[i], unit = units[a.clause];
    if (!CONSEQUENCE.test(unit.norm)) continue;
    const prev = actions[i - 1];
    if (a.result.amount && prev.result.amount && a.result.amount !== prev.result.amount) continue;
    const name = unit.norm.match(/(?:^|\b(?:jadi|catat|berarti|biar|anggap|terus|nah)\s+)(\p{L}+)\s+(?:utang|hutang|ngutang|berutang|berhutang)/u)?.[1];
    const person = name && !['dia', 'ia', 'jadi', 'catat'].includes(name) ? name[0].toUpperCase() + name.slice(1) : '';
    if (prev.result.kind === 'expense') { const as = parseQuickText(units[prev.clause].norm, ctx, 'receivable'); if (as?.kind === 'receivable_new') { as.preset.walletId ||= prev.result.preset.walletId; prev.result = as; prev.fields.kind = { status: 'verified', note: 'uang keluar untuk orang lain = piutang' }; } }
    if (prev.result.kind !== 'receivable_new') continue;
    if (!prev.result.person && person) { prev.result.person = person; prev.fields.person = { status: 'verified', note: person }; }
    actions.splice(i, 1);
    prev.evidence.push(`“${unit.text}” = piutang dari uang yang sama, bukan uang keluar lagi`);
    graph.relations.push({ type: 'consequence_of', from: `c${unit.index}`, to: prev.id, note: `${prev.result.person || 'dia'} berutang ${rupiah(prev.result.amount)}; satu kali uang keluar`, confidence: 'verified' });
    graph.trace.push(`konsekuensi: klausa ${unit.index} digabung ke ${prev.id} (tidak dicatat dobel)`);
  }

  // "makan 25rb, eh ga jadi", "yang parkir ga jadi": take back what it points to (nothing is saved for it).
  for (const unit of units) {
    if (unit.cls !== 'cancel') continue;
    const rest = unit.norm.replace(CANCEL, ' ').replace(/\b(eh+|deh|aja|saja|dong|ya|sih|lah|catat|jadi)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const own = rest && findAmounts(rest).length ? parseQuickText(rest, ctx, mode) : null;
    if (own && own.amount) { cancelled.push(rest); graph.trace.push(`batal: “${rest}” dibatalkan di klausanya sendiri`); continue; }
    const before = actions.filter(a => a.clause < unit.index);
    const ref = rest.match(REFERENCE)?.[0] || '', words = rest.replace(REFERENCE, ' ').trim().split(/\s+/).filter(w => w.length >= 3);
    let targets: Analyzed[] = [];
    if (/dua-duanya|keduanya|^semua/.test(ref)) targets = before;
    else if (/^yang\s/.test(ref)) {
      const word = ref.replace(/^yang\s+/, ''), n = ORDINAL[word] || 0;
      targets = n ? before.slice(n - 1, n) : /^(tadi|itu|terakhir)$/.test(word) ? before.slice(-1) : before.filter(a => has(a.text.toLocaleLowerCase('id-ID'), word));
    } else if (words.length) targets = before.filter(a => words.some(w => has(a.text.toLocaleLowerCase('id-ID'), w) || QUICK_LABELS[a.result.kind].toLowerCase() === w));
    else targets = before.slice(-1);
    if (!targets.length || (/^yang\s/.test(ref) && targets.length > 1)) { unresolved.push(`“${unit.text}”: yang mana yang dibatalkan?`); continue; }
    for (const t of targets) {
      actions.splice(actions.indexOf(t), 1); cancelled.push(t.text);
      graph.relations.push({ type: 'negates', from: `c${unit.index}`, to: t.id, note: `“${unit.text}” membatalkan “${t.text}”`, confidence: 'verified' });
    }
  }

  // "budget makan 2jt dan 3jt": a second amount for the same entry.
  units.forEach((unit, i) => {
    if (unit.cls !== 'amountOnly') return;
    const prev = [...actions].reverse().find(a => a.clause < i);
    const value = findAmounts(unit.norm).find(a => a.marked || a.value >= 100)?.value;
    if (!prev || !value) { unit.cls = 'ignored'; return; }
    const values = [...new Set([...(prev.options.amount || [prev.result.amount]), value])];
    prev.options.amount = values; prev.fields.amount = { status: 'check', note: `Ada ${values.length} nominal: ${values.map(rupiah).join(' dan ')}` };
  });
  // References and values said on their own ("dua-duanya pakai gopay", "kemarin, …").
  units.forEach((unit, i) => { if (unit.cls === 'modifier') applyModifier(unit, actions.filter(a => a.clause < i), actions.filter(a => a.clause > i), ctx, unresolved, graph); });
  const references = [...unresolved];
  inherit(actions, ctx.today, graph, ctx);

  // Records and transfers in the graph.
  for (const a of actions) {
    const r = a.result, link = linkOf(r);
    if (link && ['debt_payment', 'receivable_payment'].includes(r.kind)) graph.relations.push({ type: 'repayment_of', from: a.id, to: link, note: a.fields.link?.note || '', confidence: a.fields.link?.status || 'likely' });
    if (link && r.kind === 'claim_payment') graph.relations.push({ type: 'claim_for', from: a.id, to: link, note: a.fields.link?.note || '', confidence: a.fields.link?.status || 'likely' });
    if (r.kind === 'transfer') graph.relations.push({ type: 'transfer_between', from: a.id, note: `${ctx.wallets.find(w => w.id === r.preset.walletId)?.name || '?'} → ${ctx.wallets.find(w => w.id === r.preset.destinationWalletId)?.name || '?'}`, confidence: a.fields.wallet?.status === 'verified' && a.fields.to?.status === 'verified' ? 'verified' : 'check' });
  }

  // Review flags, confidence and the one question per action.
  for (const a of actions) {
    refreshAction(a, ctx);
    if (a.temporal) graph.trace.push(...a.temporal.resolution.trace.map(t => `waktu ${a.id}: ${t}`));
    for (const x of a.rejected || []) graph.trace.push(`ditolak ${a.id}: ${x.type.toLowerCase()} “${x.text}” — ${x.reason}`);
    for (const c of a.checks || []) graph.trace.push(`bug catcher ${a.id}: ${c.code}${c.repaired ? ' (diperbaiki)' : ''} — ${c.detail}`);
    if (a.ask) graph.trace.push(`tanya ${a.id}: ${a.ask.question}`);
    for (const [key, f] of Object.entries(a.fields)) if (f && (f.status === 'missing')) unresolved.push(`${QUICK_LABELS[a.result.kind]}: ${FIELD_LABELS[key as FieldKey]} ${f.note ? `(${f.note})` : 'perlu dipilih'}`);
    warnings.push(...a.warnings);
  }

  const entities: QuickEntity[] = [];
  for (const a of actions) {
    const r = a.result;
    if (r.amount) entities.push({ type: 'amount', text: rupiah(r.amount), value: r.amount, clause: a.clause });
    if (a.fields.date && r.date) entities.push({ type: 'date', text: r.date, value: r.date, clause: a.clause });
    if (r.preset.time) entities.push({ type: 'time', text: r.preset.time, value: r.preset.time, clause: a.clause });
    for (const id of [r.preset.walletId, r.preset.destinationWalletId].filter(Boolean)) entities.push({ type: 'wallet', text: ctx.wallets.find(w => w.id === id)?.name || '', value: id!, clause: a.clause });
    if (r.person) entities.push({ type: 'person', text: r.person, clause: a.clause });
    if (r.preset.merchant) entities.push({ type: 'place', text: r.preset.merchant, clause: a.clause });
    if (linkOf(r)) entities.push({ type: 'record', text: linkOf(r), value: linkOf(r), clause: a.clause });
  }
  units.forEach((u, i) => { const ref = u.ref || u.norm.match(REFERENCE)?.[0]; if (u.cls === 'modifier' && ref) entities.push({ type: 'reference', text: ref, clause: i }); u.notes.forEach(n => entities.push({ type: 'correction', text: n, clause: i })); });

  const clauses: QuickClause[] = units.map((u, i) => ({ index: i, text: u.text, source: [u.start, u.end], normalized: u.norm, role: u.cls === 'action' ? 'action' : u.cls === 'modifier' ? 'modifier' : u.cls === 'amountOnly' ? 'extra-amount' : u.cls === 'cancel' ? 'cancel' : 'ignored' }));
  const out: ActionCandidate[] = actions.map(({ explicit: _e, assigned: _a, connector: _c, dateAtEnd: _d, ...a }) => a);
  return {
    sourceText, normalizedText: units.map(u => u.norm).join(' · '), clauses, entities, actions: out, unresolved: [...new Set(unresolved)], references,
    confidence: !out.length ? 'none' : out.some(a => a.review) || unresolved.length ? 'review' : 'high', warnings: [...new Set(warnings)],
    relations: graph.relations, cancelled, trace: graph.trace,
  };
}
