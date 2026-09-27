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
import { amountWords, DATE_PHRASES, findAmounts, GENERIC, parseQuickText, QUICK_LABELS, readDate, SALARY_WHEN, walletsIn, type QuickContext, type QuickGroup, type QuickKind, type QuickResult } from './quick-entry.ts';

export type FieldKey = 'kind' | 'amount' | 'date' | 'time' | 'wallet' | 'to' | 'link' | 'category' | 'person' | 'name';
export type FieldStatus = 'verified' | 'likely' | 'check' | 'missing';
export const FIELD_STATUS: Record<FieldStatus, string> = { verified: 'Terverifikasi', likely: 'Kemungkinan benar', check: 'Perlu dicek', missing: 'Belum terbaca' };
export const FIELD_LABELS: Record<FieldKey, string> = { kind: 'Jenis', amount: 'Nominal', date: 'Tanggal', time: 'Jam', wallet: 'Dompet', to: 'Dompet tujuan', link: 'Catatan terkait', category: 'Kategori', person: 'Orang', name: 'Nama' };
export type FieldState = { status: FieldStatus; note?: string };
export type QuickEntity = { type: 'amount' | 'date' | 'time' | 'wallet' | 'person' | 'place' | 'record' | 'reference' | 'correction'; text: string; value?: string | number; clause: number };
export type QuickClause = { index: number; text: string; source: [number, number]; normalized: string; role: 'action' | 'modifier' | 'extra-amount' | 'ignored' };
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
  options: { amount?: number[]; date?: { date: string; label: string }[]; wallet?: string[] };
  daypart?: string;
  warnings: string[];
  /** Something in it needs the person's attention before saving. */
  review: boolean;
  /** 0–1, the weakest field. */
  confidence: number;
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
  [/\bgo[\s-]pay\b/g, 'gopay'], [/\bshopee[\s-]pay\b/g, 'shopeepay'], [/\blink[\s-]aja\b/g, 'linkaja'], [/\bsea[\s-]bank\b/g, 'seabank'],
  [/(\d)\s*(?:rbu|rebu|rbuan|ribuan|rban|rb-an|rbn)\b/g, '$1rb'], [/(\d)\s*(?:jtan|jutaan|jt-an)\b/g, '$1jt'],
  [/\b(?:dua2nya|dua-duanya|dua duanya|duaduanya)\b/g, 'dua-duanya'], [/\bpas\s+gajian\b/g, 'pas gajian'],
];
export function normalizeQuick(text: string) {
  let out = text.toLocaleLowerCase('id-ID').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
  for (const [pattern, to] of PHRASES) out = out.replace(pattern, to);
  out = out.replace(/\p{L}+/gu, word => SPELLING[word] ?? word);
  return amountWords(out);
}

/* ------------------------------------------------------------------ Corrections */

const MARKER = /(?:\s*,\s*|\s+)(?:eh+m?|ralat|koreksi|maksudnya|maksudku|maksud (?:saya|aku)|sori|sorry|salah ketik)(?:\s*,\s*|\s+)/;
const DATE_ANY = () => new RegExp(`${DATE_PHRASES.source}|\\btadi(?:\\s+(?:pagi|siang|sore|malam))?\\b|\\bbarusan\\b`, 'g');
const KIND_WORDS: Record<string, QuickKind[]> = {
  pengeluaran: ['expense'], pemasukan: ['income'], transfer: ['transfer'], utang: ['debt_new', 'debt_payment'], hutang: ['debt_new', 'debt_payment'],
  piutang: ['receivable_new', 'receivable_payment'], rencana: ['plan_new'], anggaran: ['budget'], budget: ['budget'], pengingat: ['note_new'], catatan: ['note_new'], rutin: ['recurring_new'],
};
/** The kind of value that starts a text: an amount, a date or a wallet. */
function leadingType(text: string, ctx: QuickContext): 'amount' | 'date' | 'wallet' | null {
  const t = text.trim();
  if (/^(?:rp\.?\s*)?\d/.test(t)) return 'amount';
  const date = DATE_ANY().exec(t); if (date && date.index === 0) return 'date';
  const wallet = walletsIn(t, ctx.wallets)[0];
  if (wallet && (wallet.at === 0 || /^(?:pakai|via|dari|lewat|ke)\s/.test(t) && wallet.at <= 7)) return 'wallet';
  return null;
}
/** The last value of a type in a text, as [start, end]. */
function lastOf(text: string, type: 'amount' | 'date' | 'wallet', ctx: QuickContext): [number, number] | null {
  if (type === 'amount') { const a = findAmounts(text).pop(); return a ? [a.index, a.index + a.text.length] : null; }
  if (type === 'date') { const all = [...text.matchAll(DATE_ANY())]; const d = all.pop(); return d ? [d.index ?? 0, (d.index ?? 0) + d[0].length] : null; }
  const w = walletsIn(text, ctx.wallets).sort((a, b) => b.at - a.at)[0];
  return w ? [w.at, w.at + w.word.length] : null;
}
/** "makan 30rb eh 35rb" → "makan 35rb"; "pakai gopay, bukan bca" → "pakai gopay"; "bukan pengeluaran, transfer …" → "transfer …". */
export function applyCorrections(input: string, ctx: QuickContext) {
  let text = input; const notes: string[] = [], negated = new Set<QuickKind>();
  for (let guard = 0; guard < 5; guard++) {
    const m = MARKER.exec(text); if (!m) break;
    const left = text.slice(0, m.index), right = text.slice(m.index + m[0].length), type = leadingType(right, ctx);
    const span = type ? lastOf(left, type, ctx) : null;
    const said = span ? left.slice(span[0], span[1]).trim() : '';
    text = `${span ? left.slice(0, span[0]) + left.slice(span[1]) : left} ${right}`.replace(/\s+/g, ' ').trim();
    const now = type === 'amount' ? findAmounts(right)[0]?.text : type === 'date' ? DATE_ANY().exec(right)?.[0] : type === 'wallet' ? walletsIn(right, ctx.wallets)[0]?.word : '';
    if (said) notes.push(`dikoreksi: “${said}” → “${(now || right.trim().split(' ')[0]).trim()}”`);
  }
  // "bukan X": X is dropped when it is a wallet, an amount or a kind of entry.
  for (let guard = 0; guard < 5; guard++) {
    const m = /(?:^|\s*,\s*|\s+)bukan\s+(\S+)(?:\s*,\s*|\s+(?:tapi|melainkan)\s+|\s*$)?/.exec(text); if (!m) break;
    const word = m[1].replace(/[,.]$/, ''), kinds = KIND_WORDS[word];
    const isWallet = walletsIn(word, ctx.wallets).length > 0, isAmount = findAmounts(word).some(a => a.marked || a.value >= 100);
    if (!kinds && !isWallet && !isAmount) break;
    kinds?.forEach(k => negated.add(k));
    notes.push(kinds ? `bukan ${word}` : `bukan “${word}”`);
    text = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '').trim();
  }
  return { text, notes, negated };
}

/* ------------------------------------------------------------------ Clauses */

const CONNECT = 'lalu|terus|kemudian|habis itu|abis itu|abis tu|habis tu|setelah itu|sama|dan|tapi|sedangkan|plus|\\+';
const BOUNDARY = new RegExp(`\\s*(?:\\n|;|,(?!\\d))\\s*(?:(?:${CONNECT}|trus|trs|tp)\\s+)?|\\s+(?:${CONNECT}|trus|trs|tp)\\s+`, 'gi');
const TX_CUE = /\b(beli|bayar|tf|transfer|topup|top up|isi saldo|tarik tunai|setor tunai|terima|pinjam|pinjem|minjem|pinjemin|nabung|sisihkan|klaim|reimburse|kirim|gaji|gajian|lunasin|lunasi|jual)\b/;
const VERB_START = /^(beli|bayar|tf|transfer|topup|top up|terima|pinjam|pinjem|pinjemin|nabung|klaim|isi|tarik|setor|ingetin|ingatkan|budget|anggaran|gaji|gajian|buka|catat|kirim|jual)\b/;
const OWN_KIND = /\b(beli|bayar|tf|transfer|topup|terima|pinjam|pinjem|pinjemin|nabung|klaim|gaji|gajian|kirim|ingetin|ingatkan|rencana|target|buka|jual|dapat|dapet|saldo|langganan)\b/;
const CORRECTION_START = /^(?:eh+m?|ralat|koreksi|maksudnya|maksud\b|bukan\b|sori|sorry)/;
const REFERENCE = /\b(?:dua-duanya|keduanya|semuanya|semua|sisanya|yang lain(?:nya)?|lainnya|yang\s+(?:ke-?\d+|\p{L}+))\b/u;
const NO_AMOUNT = new Set<QuickKind>(['note_new', 'open', 'category_new', 'wallet_new']);
type Piece = { start: number; end: number; connector: string };
type Unit = Piece & { text: string; norm: string; cls: 'action' | 'modifier' | 'amountOnly' | 'ignored'; notes: string[]; negated: Set<QuickKind>; noAmount?: boolean };

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
  return text.replace(DATE_ANY(), ' ').split(/[^\p{L}]+/u).filter(w => w.length >= 2 && !STOP.has(w) && !known.includes(w) && !walletWords.has(w) && !GENERIC.has(w));
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

function clockTime(text: string) {
  const m = text.match(/\b(?:jam|pukul|pkl)\s*(\d{1,2})(?:[.:](\d{2}))?\s*(pagi|siang|sore|malam)?\b/);
  if (!m) return undefined;
  let h = Number(m[1]); const min = Number(m[2] || 0), part = m[3];
  if (h > 23 || min > 59) return undefined;
  if (part === 'pagi' && h === 12) h = 0;
  if (part === 'siang' && h < 11) h += 12;
  if ((part === 'sore' || part === 'malam') && h < 12) h = h === 12 ? 0 : h + 12;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

type Analyzed = ActionCandidate & { explicit: { wallet: boolean; date: boolean }; assigned: { wallet?: boolean; date?: boolean } };

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
  if (result.kind === 'debt_payment' && !linkOf(result) && !/\b(utang|hutang|lunas|lunasin|lunasi)\b/.test(text) && !(ctx.debts || []).some(d => d.outstandingAmount > 0)) {
    const plain = parseQuickText(text, ctx, 'expense'); if (plain) { result = plain; kindNote = 'Belum ada utang yang tercatat, jadi dibaca sebagai pengeluaran'; }
  }
  // "transfer 500rb" and "saldo sekarang 2jt" name the action but not the wallet: keep the action and ask for the wallet.
  if (result.kind === 'expense' && !walletsIn(text, ctx.wallets).length) {
    const asked: QuickKind | null = /\b(tf|transfer|pindahin|topup|top up)\b/.test(text) && !/\b(?:ke|kepada|buat|untuk)\s+\p{L}/u.test(text) ? 'transfer'
      : /\bsaldo(?:nya)?\b/.test(text) && /\b(sekarang|tinggal|sisa|jadi|aktual|real)\b/.test(text) ? 'balance' : null;
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

  // Kind.
  const strongCue = kind === 'transfer' ? /\b(tf|transfer|topup|top up|isi saldo|tarik tunai|setor tunai|pindah)\b/ : kind === 'income' ? /\b(gaji|gajian|terima|dapat|dapet|bonus|jual|thr|masuk)\b/ : kind === 'expense' ? /\b(beli|bayar|jajan|belanja|makan|minum|ngopi|parkir|bensin|isi bensin|servis|pulsa|listrik)\b/
    : kind === 'budget' ? /\b(anggaran|budget|bujet|jatah)\b/ : kind === 'note_new' ? /\b(ingetin|ingatkan|pengingat|reminder|catatan|jangan lupa)\b/ : kind === 'plan_new' ? /\b(rencana|besok|lusa|nanti)\b|\d/ : /./;
  if (kindStatus !== 'check') kindStatus = strongCue.test(text) || !['expense', 'income'].includes(kind) ? 'verified' : 'likely';
  if (kindNote) { if (kindStatus === 'verified') kindStatus = 'likely'; }
  set('kind', kindStatus, kindNote || undefined);
  if (kindNote) evidence.push(kindNote);

  // Amount.
  if (AMOUNT_KINDS(kind)) {
    const amounts = findAmounts(text).filter(a => !a.monthly), marked = [...new Set(amounts.filter(a => a.marked).map(a => a.value))];
    const main = amounts.find(a => a.marked) || amounts.filter(a => a.value >= 100).sort((a, b) => b.value - a.value)[0];
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
    const time = clockTime(text);
    if (time && DATED.has(kind)) { r.preset.time = time; set('time', 'verified', `jam ${time}`); }
  } else if (kind === 'budget' && phrases.some(p => !/^(?:mulai)/.test(p))) warnings.push('Anggaran berlaku per periode; tanggal di kalimat tidak mengubah periodenya.');
  const daypart = text.match(/\b(?:tadi|kemarin|besok)\s+(pagi|siang|sore|malam)\b/)?.[1];

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
  if (kind === 'budget') set('category', r.budget?.categoryId ? (r.why ? 'likely' : 'verified') : 'missing', r.budget?.categoryId ? r.why : 'Kategori anggarannya belum ketemu');
  if (kind === 'receivable_new' || kind === 'debt_new') { if (r.person) set('person', 'verified', r.person); else if (kind === 'receivable_new') set('person', 'missing', 'Siapa yang meminjam?'); }
  if (['note_new', 'fund_new', 'wish_new', 'category_new', 'wallet_new', 'recurring_new', 'plan_new'].includes(kind)) set('name', r.name?.trim() ? 'likely' : 'missing', r.name?.trim() ? undefined : 'Namanya belum ada');
  if (kind === 'open' && !r.menu) set('kind', 'check', 'Menu belum dikenali');

  // Other readings.
  const alternatives: QuickAlternative[] = [];
  const tried = new Set<QuickKind>([kind]);
  const wish = (ctx.wishlist || []).some(w => w.status === 'active'), funds = (ctx.funds || []).some(f => !f.isArchived);
  const extra: QuickKind[] = [...(SIBLING[kind] || [])];
  if (kind !== kind0) extra.unshift(kind0);
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
  const action: Analyzed = { id: `a${index}`, clause: index, text: unit.text, result: r, fields, evidence: [...new Set(evidence)], alternatives, options, daypart, warnings, review: false, confidence: 1, explicit: { wallet: explicitWallet, date: explicitDate }, assigned: {} };
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

function applyModifier(unit: Unit, before: Analyzed[], after: Analyzed[], ctx: QuickContext, unresolved: string[]) {
  const t = unit.norm, wallet = walletsIn(t, ctx.wallets)[0];
  const phrase = [...t.matchAll(DATE_ANY())][0]?.[0];
  const when = phrase ? (/^tadi|^barusan/.test(phrase) ? { date: ctx.today, label: phrase } : readDate(phrase, ctx.today, false, false, ctx.salaryDay)) : null;
  const ref = t.match(REFERENCE)?.[0] || '';
  let targets: Analyzed[] = [], explicit = true;
  const fail = (why: string) => { unresolved.push(why); return; };
  if (/dua-duanya|keduanya/.test(ref)) { if (before.length === 2) targets = before; else return fail(`“${ref}” tidak jelas: ada ${before.length} catatan sebelumnya.`); }
  else if (/^semua/.test(ref)) targets = before.length ? before : after;
  else if (/sisanya|lain/.test(ref)) { targets = before.filter(a => wallet ? !a.explicit.wallet && !a.assigned.wallet : !a.explicit.date && !a.assigned.date); explicit = true; }
  else if (/^yang\s/.test(ref)) {
    const word = ref.replace(/^yang\s+/, ''), n = ORDINAL[word] || Number(word.match(/\d+/)?.[0] || 0);
    if (/^(tadi|terakhir|itu)$/.test(word)) targets = before.slice(-1);
    else if (n) { if (before[n - 1]) targets = [before[n - 1]]; else return fail(`“${ref}” tidak ada: hanya ada ${before.length} catatan.`); }
    else {
      const hit = before.filter(a => has(a.result.preset.description?.toLocaleLowerCase('id-ID') || '', word) || has(a.text.toLocaleLowerCase('id-ID'), word));
      if (hit.length === 1) targets = hit; else return fail(hit.length ? `“${ref}” cocok dengan ${hit.length} catatan; pilih dompetnya di tiap catatan.` : `Tidak ada catatan “${word}” sebelumnya.`);
    }
  } else if (unit.connector === 'tapi') targets = before.slice(-1);
  else { explicit = false; targets = before.length ? before : after; }
  if (!targets.length) { if (ref) fail(`“${ref}” tidak merujuk ke catatan mana pun.`); return; }
  const said = ref ? `“${t}”` : 'disebut sekali untuk semuanya';
  for (const a of targets) {
    if (wallet && WALLET_TAKERS.has(a.result.kind)) {
      if (a.result.kind === 'transfer' && a.result.preset.walletId) continue;
      const own = a.explicit.wallet && a.result.preset.walletId && a.result.preset.walletId !== wallet.id;
      if (own && !explicit) continue;
      if (own && /^semua/.test(ref)) { a.fields.wallet = { status: 'check', note: `Disebut ${ctx.wallets.find(w => w.id === a.result.preset.walletId)?.name} dan ${wallet.name}` }; a.options.wallet = [a.result.preset.walletId!, wallet.id]; continue; }
      setWallet(a, wallet.id, explicit ? 'verified' : 'likely', `${wallet.name} (${said})`); a.assigned.wallet = true;
    }
    if (when && DATED.has(a.result.kind) && !(a.explicit.date && !explicit) && when.date <= ctx.today) { setDate(a, when.date, explicit ? 'verified' : 'likely', `${when.label} (${said})`); a.assigned.date = true; }
  }
}

/** A value said in one clause, for the clauses that don't say their own. */
function inherit(actions: Analyzed[], today: string) {
  // Dates carry forward ("kemarin makan 25rb, parkir 5rb"), never into the future and never over a date of its own.
  let last: { date: string; label: string } | null = null;
  for (const a of actions) {
    if (a.explicit.date && DATED.has(a.result.kind) && a.fields.date?.status !== 'missing') { last = { date: a.result.date, label: a.fields.date?.note?.match(/^“(.+?)”/)?.[1] || shortDate(a.result.date) }; continue; }
    if (a.explicit.date) { last = null; continue; }
    if (last && DATED.has(a.result.kind) && !a.assigned.date && last.date <= today) setDate(a, last.date, 'likely', `ikut “${last.label}” dari bagian sebelumnya`);
  }
  // A wallet said once among several spendings (or incomes) counts for the others of the same kind.
  for (const kind of ['expense', 'income'] as const) {
    const flows = actions.filter(a => a.result.kind === kind);
    const said = [...new Set(flows.filter(a => a.explicit.wallet).map(a => a.result.preset.walletId!))];
    for (const a of flows.filter(x => !x.explicit.wallet && !x.assigned.wallet)) {
      if (said.length === 1 && flows.length > 1) setWallet(a, said[0], 'likely', 'disebut sekali untuk semuanya');
      else if (said.length > 1) { a.fields.wallet = { status: 'check', note: 'Dompetnya tidak disebut; kalimat ini menyebut beberapa dompet' }; a.options.wallet = said; }
    }
  }
}

/* ------------------------------------------------------------------ The plan */

const RANK: Record<FieldStatus, number> = { verified: 1, likely: .8, check: .4, missing: 0 };

export function parseQuickPlan(input: string, ctx: QuickContext, mode: QuickGroup | QuickKind = 'auto'): QuickParseResult {
  const sourceText = input.trim();
  const empty: QuickParseResult = { sourceText, normalizedText: '', clauses: [], entities: [], actions: [], unresolved: [], references: [], confidence: 'none', warnings: [] };
  if (!sourceText) return empty;
  const prep = (text: string) => { const c = applyCorrections(normalizeQuick(text), ctx); return c; };
  const classify = (norm: string): Unit['cls'] | 'correction' | 'incomplete' => {
    if (CORRECTION_START.test(norm)) return 'correction';
    const amounts = findAmounts(norm);
    if (amounts.length && !norm.replace(/(?:rp\.?\s*)?\d+(?:[.,]\d+)*\s*(?:rb|ribu|k|jt|juta|m|miliar)?\b/g, ' ').replace(/\b(lagi|juga|aja|saja|ya|deh|dong|atau|jadi)\b/g, ' ').trim()) return 'amountOnly';
    const r = parseQuickText(norm, ctx, mode);
    if (r && (r.amount > 0 || NO_AMOUNT.has(r.kind))) return 'action';
    const ref = norm.match(REFERENCE)?.[0], wallet = walletsIn(norm, ctx.wallets).length > 0, date = DATE_ANY().test(norm);
    if (ref || wallet || date) {
      let rest = norm.replace(REFERENCE, ' ').replace(DATE_ANY(), ' ');
      for (const w of walletsIn(rest, ctx.wallets)) rest = rest.replace(new RegExp(`\\b${esc(w.word)}\\b`), ' ');
      rest = rest.replace(/\b(pakai|via|lewat|dari|bayar|dibayar|bayarnya|juga|aja|saja|ya|dong|sama|semua|itu|tapi|terus|lalu|yang|pake|pakainya|semuanya|pas|waktu)\b/g, ' ').trim();
      if (!rest) return 'modifier';
    }
    return 'incomplete';
  };

  // Clauses: split at commas, new lines and joining words, then join back what cannot stand alone
  // ("beli nasi" + "es teh 25rb"; "budget makan untuk sarapan" + "makan siang" + "kopi 2jt").
  const units: Unit[] = [];
  let pending: Piece | null = null;
  const make = (p: Piece, cls: Unit['cls'], extra: Partial<Unit> = {}): Unit => { const text = sourceText.slice(p.start, p.end).trim(), c = prep(text); return { ...p, text, norm: c.text, notes: c.notes, negated: c.negated, cls, ...extra }; };
  const join = (a: Piece, b: Piece): Piece => ({ start: a.start, end: b.end, connector: a.connector });
  for (const piece of pieces(sourceText)) {
    const alone = prep(sourceText.slice(piece.start, piece.end)).text;
    if (pending) {
      const before = prep(sourceText.slice(pending.start, pending.end)).text;
      // "transfer dari bca ke gopay, beli pulsa 50rb": the first clause is its own action even without an amount.
      if (TX_CUE.test(before) && VERB_START.test(alone) && classify(alone) === 'action') { units.push(make(pending, 'action', { noAmount: true })); pending = null; }
    }
    const cur: Piece = pending ? join(pending, piece) : piece;
    const cls = classify(prep(sourceText.slice(cur.start, cur.end)).text);
    if (cls === 'correction') {
      const last = units[units.length - 1];
      if (last && !pending) { units[units.length - 1] = make(join(last, piece), classify(prep(sourceText.slice(last.start, piece.end)).text) as Unit['cls']); continue; }
      pending = cur; continue;
    }
    if (cls === 'incomplete') { pending = cur; continue; }
    units.push(make(cur, cls)); pending = null;
  }
  if (pending) {
    const last = units[units.length - 1];
    const text = prep(sourceText.slice(pending.start, pending.end)).text;
    if (last && last.cls === 'action' && !TX_CUE.test(text)) { const merged = join(last, pending), cls = classify(prep(sourceText.slice(merged.start, merged.end)).text); units[units.length - 1] = make(merged, cls === 'incomplete' || cls === 'correction' ? 'action' : cls); }
    else units.push(make(pending, TX_CUE.test(text) ? 'action' : 'ignored', TX_CUE.test(text) ? { noAmount: true } : {}));
  }

  // One reading per action clause.
  const actions: Analyzed[] = [], unresolved: string[] = [], warnings: string[] = [];
  units.forEach((unit, i) => {
    if (unit.cls !== 'action') return;
    let a = analyze(unit, i, ctx, mode);
    // "budget makan 2jt, transport 800rb": "budget" said first covers the clauses after it that name no other action.
    const prev = actions[actions.length - 1];
    if (a && prev?.result.kind === 'budget' && ['expense', 'income'].includes(a.result.kind) && !OWN_KIND.test(unit.norm) && mode === 'auto') a = analyze(unit, i, ctx, mode, `budget ${unit.norm}`) || a;
    if (a) actions.push(a); else unit.cls = 'ignored';
  });
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
  units.forEach((unit, i) => { if (unit.cls === 'modifier') applyModifier(unit, actions.filter(a => a.clause < i), actions.filter(a => a.clause > i), ctx, unresolved); });
  const references = [...unresolved];
  inherit(actions, ctx.today);

  // Review flags and confidence.
  for (const a of actions) {
    const states = Object.values(a.fields).filter(Boolean) as FieldState[];
    a.review = states.some(f => f.status === 'check' || f.status === 'missing') || a.warnings.length > 0;
    a.confidence = Math.min(1, ...states.map(f => RANK[f.status]));
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
  units.forEach((u, i) => { const ref = u.norm.match(REFERENCE)?.[0]; if (u.cls === 'modifier' && ref) entities.push({ type: 'reference', text: ref, clause: i }); u.notes.forEach(n => entities.push({ type: 'correction', text: n, clause: i })); });

  const clauses: QuickClause[] = units.map((u, i) => ({ index: i, text: u.text, source: [u.start, u.end], normalized: u.norm, role: u.cls === 'action' ? 'action' : u.cls === 'modifier' ? 'modifier' : u.cls === 'amountOnly' ? 'extra-amount' : 'ignored' }));
  const out: ActionCandidate[] = actions.map(({ explicit: _e, assigned: _a, ...a }) => a);
  return {
    sourceText, normalizedText: units.map(u => u.norm).join(' · '), clauses, entities, actions: out, unresolved: [...new Set(unresolved)], references,
    confidence: !out.length ? 'none' : out.some(a => a.review) || unresolved.length ? 'review' : 'high', warnings: [...new Set(warnings)],
  };
}
