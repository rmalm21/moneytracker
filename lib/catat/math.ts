/**
 * Catat otomatis V4 — the arithmetic, the sharing and the purposes said in one sentence, read before the grammar.
 *
 *   "128181 dibagi 3 dikali 2"            → 85.454 (operators written as words: left to right)
 *   "makan (50rb+30rb)/2", "kopi 3 x 18rb" → 40.000, 54.000 (symbols: × and ÷ before + and −)
 *   "parkir 5rb, 2 kali", "pulsa 2x 25rb" → 10.000, 50.000
 *   "setengah dari 80rb", "10% dari 2jt"  → 40.000, 200.000
 *   "makan 100rb diskon 20%"              → "diskon Rp20.000" (the purchase reader then subtracts it)
 *   "hokben 162.003 dibagi2 sama ferdi"   → Split Bill: you 81.002, Ferdi 81.001 (Split Bill engine shares)
 *   "nonton 100rb, ferdi yang bayar, dibagi 2" → Split Bill paid by Ferdi: your share 50.000 owed to him
 *   "kos 1,8jt dibagi bertiga"            → your share 600.000 (nobody named: nothing to collect)
 *   "hokben 162.003 dibagi 2, satu buat gue makan biasa, satu traktir teman" → one expense in two category lines
 *
 * Each reading returns the text the grammar should read (the expression replaced by its result, the sharing or the
 * purposes taken out) and what to attach to the one expense it produces. Nothing here is guessed from a lone number: a
 * division needs a money amount on its left ("tgl 14/10", "jam 7-8" stay dates and times), "x" must stand alone or touch
 * a digit ("kaos xl"), "kurang lebih" is not a minus, and "kali ini" is not a multiplication.
 */
import { amountWords, nameLike, type QuickContext } from '../quick-entry.ts';
import { computeSplit } from '../split-bill.ts';

const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const lower = (s: string) => s.toLocaleLowerCase('id-ID');
const title = (w: string) => w.replace(/(^|\s)(\p{L})/gu, (_, sp: string, c: string) => sp + c.toLocaleUpperCase('id-ID'));

/* ------------------------------------------------------------------ Numbers */

const SMALL: Record<string, number> = { satu: 1, se: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11, 'dua belas': 12, 'dua puluh': 20 };
const COUNT_WORD: Record<string, number> = { berdua: 2, bertiga: 3, berempat: 4, berlima: 5, berenam: 6, bertujuh: 7, berdelapan: 8, bersembilan: 9, bersepuluh: 10 };
const UNITS: Record<string, number> = { rb: 1e3, ribu: 1e3, rebu: 1e3, rban: 1e3, k: 1e3, jt: 1e6, juta: 1e6 };
/** "162.003" → 162003, "2,5" → 2.5, "1.5" (with a unit) → 1.5, "99.999" → 99999. */
function readNumber(raw: string, unit: boolean): number {
  const s = raw.replace(/^rp\.?\s*/i, '');
  if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  if (/^\d{1,3}(?:,\d{3})+$/.test(s) && !unit) return Number(s.replace(/,/g, ''));
  if (/^\d+[.,]\d{1,2}$/.test(s)) return Number(s.replace(',', '.'));
  return Number(s.replace(/[.,]/g, ''));
}

type Operand = { kind: 'money' | 'count' | 'percent'; value: number; start: number; end: number; unit: boolean; marked: boolean; text: string };
const NUM = String.raw`(?:rp\.?\s*)?\d+(?:[.,]\d+)*`;
// A number may touch an "x" that stands alone ("2x 25rb"), never another letter ("3kg", "xl").
const OPERAND = new RegExp(String.raw`(${NUM})\s*(%|persen|rb|ribu|rebu|k|jt|juta)?(?!(?!x(?![\p{L}]))[\p{L}\d])`, 'iuy');
const WORD_COUNT = new RegExp(String.raw`(dua belas|dua puluh|sebelas|sepuluh|sembilan|delapan|tujuh|enam|lima|empat|tiga|dua|satu)(?![\p{L}])`, 'iuy');

function operandAt(text: string, at: number): Operand | null {
  OPERAND.lastIndex = at;
  const m = OPERAND.exec(text);
  if (m) {
    const unitWord = lower(m[2] || ''), marked = /^rp/i.test(m[1]) || Boolean(unitWord && unitWord !== '%' && unitWord !== 'persen');
    if (unitWord === '%' || unitWord === 'persen') return { kind: 'percent', value: readNumber(m[1], true) / 100, start: at, end: at + m[0].length, unit: false, marked: false, text: m[0] };
    const n = readNumber(m[1], Boolean(unitWord));
    if (!Number.isFinite(n) || n <= 0) return null;
    const value = unitWord ? n * UNITS[unitWord] : n;
    // A bare number from 1.000 up is money ("128181", "2000"); below that it is a count ("dibagi 3", "x 2").
    const kind = marked || value >= 1000 ? 'money' : 'count';
    return { kind, value, start: at, end: at + m[0].length, unit: Boolean(unitWord), marked, text: m[0] };
  }
  WORD_COUNT.lastIndex = at;
  const w = WORD_COUNT.exec(text);
  if (w) return { kind: 'count', value: SMALL[lower(w[1])], start: at, end: at + w[0].length, unit: false, marked: false, text: w[0] };
  return null;
}

/* ------------------------------------------------------------------ Expressions */

type Op = '+' | '-' | '*' | '/';
const OPS: [RegExp, Op, boolean][] = [
  // [pattern, operator, written as a word]
  [/(?:dikalikan|dikaliin|dikali|kali)(?![\p{L}])/iuy, '*', true],
  [/(?:dibagikan|dibagiin|dibagi|bagi)(?![\p{L}])/iuy, '/', true],
  [/(?:ditambahkan|ditambahin|ditambah|tambah|plus)(?![\p{L}])/iuy, '+', true],
  [/(?:dikurangkan|dikurangin|dikurangi|dikurang|kurang|minus)(?![\p{L}])(?!\s+lebih)/iuy, '-', true],
  [/[x×*](?![\p{L}])/iuy, '*', false],
  [/[/÷]/iuy, '/', false],
  [/\+/iuy, '+', false],
  [/[-−](?!an\b)/iuy, '-', false],
];
const skip = (text: string, at: number) => { while (at < text.length && text[at] === ' ') at++; return at; };
function opAt(text: string, at: number): { op: Op; end: number; word: boolean } | null {
  const i = skip(text, at);
  for (const [re, op, word] of OPS) { re.lastIndex = i; const m = re.exec(text); if (m) return { op, end: i + m[0].length, word }; }
  return null;
}

type Term = { value: number; kind: 'money' | 'count' | 'percent'; start: number; end: number; text: string; unit: boolean };
/** A term: a number, a word count, or a parenthesised expression. */
function termAt(text: string, at: number, depth: number): Term | null {
  const i = skip(text, at);
  if (text[i] === '(' && depth < 3) {
    const inner = exprAt(text, i + 1, depth + 1);
    if (!inner) return null;
    const j = skip(text, inner.end);
    if (text[j] !== ')') return null;
    return { value: inner.value, kind: 'money', start: i, end: j + 1, text: text.slice(i, j + 1), unit: true };
  }
  const o = operandAt(text, i);
  return o ? { value: o.value, kind: o.kind, start: o.start, end: o.end, text: o.text, unit: o.unit || o.marked } : null;
}

type Expr = { value: number; start: number; end: number; steps: string[]; ops: number; division: boolean; words: boolean };
/** Money arithmetic from `at`: money with counts (× ÷), money with money or a percent (+ −). Null when it is not money. */
function exprAt(text: string, at: number, depth = 0): Expr | null {
  const first = termAt(text, at, depth);
  if (!first) return null;
  const terms: Term[] = [first], ops: { op: Op; word: boolean }[] = [];
  let end = first.end;
  for (let guard = 0; guard < 8; guard++) {
    const o = opAt(text, end); if (!o) break;
    const next = termAt(text, o.end, depth); if (!next) break;
    // "x" glued to a word ("xl"), "-an": not operators; a minus or a slash needs no letters around ("jam 7-8", "14/10").
    terms.push(next); ops.push({ op: o.op, word: o.word }); end = next.end;
  }
  if (!ops.length) return null;
  const words = ops.some(o => o.word);
  // Validate and evaluate. Words: left to right ("dibagi 3 dikali 2"); symbols: × ÷ before + −.
  const steps: string[] = [];
  const show = (t: Term) => t.kind === 'money' ? rupiah(t.value) : t.kind === 'percent' ? `${+(t.value * 100).toFixed(2)}%` : String(t.value);
  const apply = (a: Term, op: Op, b: Term): Term | null => {
    let value: number, kind: Term['kind'] = 'money';
    if (op === '*' || op === '/') {
      if (a.kind === 'money' && (b.kind === 'count' || b.kind === 'percent')) value = op === '*' ? a.value * b.value : a.value / b.value;
      else if (op === '*' && (a.kind === 'count' || a.kind === 'percent') && b.kind === 'money') value = a.value * b.value;
      else return null;
      if (b.kind === 'count' && (b.value <= 0 || b.value > 1000) || a.kind === 'count' && (a.value <= 0 || a.value > 1000)) return null;
    } else {
      if (a.kind !== 'money') return null;
      if (b.kind === 'money') value = op === '+' ? a.value + b.value : a.value - b.value;
      else if (b.kind === 'percent') value = op === '+' ? a.value * (1 + b.value) : a.value * (1 - b.value);
      // "makan 50rb + 25" with a unit on the left: the same unit ("25" = 25rb).
      else if (b.kind === 'count' && a.unit && /rb|ribu|k\b/i.test(a.text) && b.value < 1000) value = op === '+' ? a.value + b.value * 1000 : a.value - b.value * 1000;
      else return null;
    }
    if (!(value > 0)) return null;
    steps.push(`${show(a)} ${op === '*' ? '×' : op === '/' ? '÷' : op === '+' ? '+' : '−'} ${show(b)}`);
    return { value, kind, start: a.start, end: b.end, text: '', unit: true };
  };
  let result: Term | null;
  if (words) {
    result = terms[0];
    for (let i = 0; i < ops.length && result; i++) result = apply(result, ops[i].op, terms[i + 1]);
  } else {
    // × ÷ first.
    const ts = [...terms], os = [...ops];
    for (let i = 0; i < os.length;) {
      if (os[i].op === '*' || os[i].op === '/') { const r = apply(ts[i], os[i].op, ts[i + 1]); if (!r) return null; ts.splice(i, 2, r); os.splice(i, 1); } else i++;
    }
    result = ts[0];
    for (let i = 0; i < os.length && result; i++) result = apply(result, os[i].op, ts[i + 1]);
  }
  if (!result || result.kind !== 'money') return null;
  return { value: result.value, start: first.start, end, steps, ops: ops.length, division: ops.some(o => o.op === '/'), words };
}

export type MathNote = { raw: string; value: number; formula: string; rounded: boolean; kind: 'expression' | 'fraction' | 'percent-role' | 'times'; divisor?: number; total?: number };

const FRACTIONS: Record<string, number> = { setengah: 1 / 2, separuh: 1 / 2, sepertiga: 1 / 3, seperempat: 1 / 4, seperlima: 1 / 5, 'dua pertiga': 2 / 3, 'tiga perempat': 3 / 4 };
const ROLE = /(diskon|disc|discount|potongan|promo|pajak|ppn|pb1|tax|service charge|service|servis|svc|tip|tips|cashback|cash back|biaya admin|admin|fee|ongkir)\s*$/i;

/**
 * Replaces the money arithmetic of a sentence with its result ("128181 dibagi 3 dikali 2" → "Rp85.454"). A division
 * that shares with people ("dibagi 2 sama ferdi") or splits into purposes ("dibagi 2, satu …") is left for readShare.
 */
export function readMath(input: string): { text: string; notes: MathNote[] } {
  let text = input;
  const notes: MathNote[] = [];
  const replace = (start: number, end: number, value: number, note: Omit<MathNote, 'raw' | 'value' | 'rounded'>) => {
    const raw = text.slice(start, end).trim(), rounded = Math.abs(value - Math.round(value)) > 1e-6;
    notes.push({ raw, value: Math.round(value), ...note, rounded });
    text = `${text.slice(0, start)}${rupiah(value)}${text.slice(end)}`;
  };
  // 1. Fractions and percents of an amount: "setengah dari 80rb", "1/4 dari 400rb", "10% dari 2jt".
  for (let guard = 0; guard < 4; guard++) {
    const m = new RegExp(String.raw`(?<![\p{L}\d])(setengah|separuh|sepertiga|seperempat|seperlima|dua pertiga|tiga perempat|(\d+)\s*\/\s*(\d+)|(\d+(?:[.,]\d+)?)\s*(?:%|persen))(?:nya)?\s+dari\s+`, 'iu').exec(text);
    if (!m) break;
    const at = (m.index ?? 0) + m[0].length, of = exprAt(text, at) || (() => { const o = operandAt(text, skip(text, at)); return o && o.kind === 'money' ? { value: o.value, end: o.end, steps: [] as string[] } : null; })();
    if (!of) break;
    const f = m[2] ? Number(m[2]) / Number(m[3]) : m[4] ? readNumber(m[4], true) / 100 : FRACTIONS[lower(m[1])];
    if (!(f > 0 && f <= 1)) break;
    replace(m.index ?? 0, of.end, of.value * f, { formula: `${m[1].replace(/\s+/g, ' ')} dari ${rupiah(of.value)} = ${rupiah(of.value * f)}`, kind: 'fraction' });
  }
  // 2. A percent named by its role inside a purchase: "makan 100rb diskon 20%" → "diskon Rp20.000" (of the price before it).
  for (let guard = 0; guard < 6; guard++) {
    const m = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s*(?:%|persen)(?![\p{L}\d])`, 'iu').exec(text);
    if (!m) break;
    const before = text.slice(0, m.index);
    if (!ROLE.test(before)) break;
    // The price: the first money amount that is not itself a charge ("150rb service 5% pajak 10%": both of 150rb).
    let base: Operand | null = null;
    for (let i = 0; i < before.length && !base; i++) { const o = /\d/.test(before[i]) && (i === 0 || !/[\d.,]/.test(before[i - 1])) ? operandAt(before, i) : null; if (o && o.kind === 'money' && !ROLE.test(before.slice(0, o.start).replace(/rp\.?\s*$/i, ''))) base = o; else if (o) i = o.end - 1; }
    const p = readNumber(m[1], true) / 100;
    if (!base) {
      // "diskon 50% makan 80rb": the price comes after. The charge moves behind it ("makan 80rb diskon Rp40.000"), the
      // order the purchase reader knows.
      const role = before.match(ROLE)!, after = text.slice((m.index ?? 0) + m[0].length);
      let price: Operand | null = null;
      for (let i = 0; i < after.length && !price; i++) { const o = /\d/.test(after[i]) && (i === 0 || !/[\p{L}\d.,]/u.test(after[i - 1])) ? operandAt(after, i) : null; if (o && o.kind === 'money') price = o; else if (o) i = o.end - 1; }
      if (!price || ROLE.test(after.slice(0, price.start).replace(/rp\.?\s*$/i, ''))) break;
      const start = (role.index ?? 0), value = price.value * p;
      notes.push({ raw: text.slice(start, (m.index ?? 0) + m[0].length).trim(), value: Math.round(value), formula: `${m[1]}% dari ${rupiah(price.value)} = ${rupiah(value)}`, kind: 'percent-role', rounded: Math.abs(value - Math.round(value)) > 1e-6 });
      text = `${text.slice(0, start)}${after}`.replace(/\s{2,}/g, ' ').trim() + ` ${role[1]} ${rupiah(value)}`;
      continue;
    }
    replace(m.index ?? 0, (m.index ?? 0) + m[0].length, base.value * p, { formula: `${m[1]}% dari ${rupiah(base.value)} = ${rupiah(base.value * p)}`, kind: 'percent-role' });
  }
  // 3. "parkir 5rb, 2 kali" / "parkir 5rb 3x": the amount times N. Never for instalments ("cicilan hp 3 kali 500rb" is
  // one payment of 500rb).
  const instalment = INSTALMENT.test(input);
  for (let guard = 0; guard < 3 && !instalment; guard++) {
    const m = new RegExp(String.raw`(${NUM}\s*(?:rb|ribu|rebu|k|jt|juta)?)(?![\p{L}\d])\s*,?\s+(\d{1,2}|dua|tiga|empat|lima)\s*(?:x|kali)(?![\p{L}\d])(?!\s*(?:ini|itu|lipat))(?!\s*(?:rp\.?\s*)?\d)`, 'iu').exec(text);
    if (!m) break;
    const o = operandAt(m[1], 0), n = /^\d/.test(m[2]) ? Number(m[2]) : SMALL[lower(m[2])];
    if (!o || o.kind !== 'money' || !(n >= 2 && n <= 50)) break;
    replace(m.index ?? 0, (m.index ?? 0) + m[0].length, o.value * n, { formula: `${rupiah(o.value)} × ${n} = ${rupiah(o.value * n)}`, kind: 'times' });
  }
  // 4. Expressions. Scan every place a number or "(" starts.
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!(/\d/.test(c) || c === '(' || /[rR]/.test(c) && /^rp\.?\s*\d/i.test(text.slice(i, i + 6))) || i > 0 && /[\p{L}\d.,]/u.test(text[i - 1]) && c !== '(') continue;
    // "dua puluh ribu dikali tiga" arrives as "20000 dikali tiga" (lib/quick-entry.ts amountWords runs first).
    const e = exprAt(text, i);
    if (!e) continue;
    const tail = text.slice(e.end);
    // Left for readShare: dividing with people or into purposes.
    if (e.division && (SHARE_AFTER.test(tail) || PURPOSE_AFTER.test(tail))) continue;
    // "kurang 5rb lagi" is what is still missing, not a minus; instalments are not multiplied.
    if (/^\s*lagi\b/i.test(tail) && e.steps.some(st => st.includes('−'))) continue;
    if (instalment && e.steps.some(st => st.includes('×'))) continue;
    const divisor = e.ops === 1 && e.division ? Number(e.steps[0].split('÷ ')[1]) : undefined;
    const total = divisor ? Math.round(e.value * divisor) : undefined;
    replace(e.start, e.end, e.value, { formula: `${e.steps.length > 1 && e.words ? e.steps[0] + e.steps.slice(1).map(s => ' ' + s.split(' ').slice(1).join(' ')).join('') : e.steps.join(', ')} = ${rupiah(e.value)}`, kind: 'expression', ...(divisor ? { divisor, total } : {}) });
    i = e.start + rupiah(e.value).length - 1;
  }
  return { text, notes };
}
const INSTALMENT = /\b(?:cicil\w*|nyicil|angsur\w*|kredit|tenor|termin)\b/iu;
/** After "dibagi 2": people ("sama ferdi", "berdua sama rina") → sharing. */
const SHARE_AFTER = /^\s*,?\s*(?:orang\s+)?(?:sama|bareng|dengan|ama|bersama|ma|antara)\s+\p{L}/iu;
/** After "dibagi 2": purposes ("satu buat …", "setengah …") → allocation. */
const PURPOSE_AFTER = /^\s*[,:]?\s*(?:satu|yang satu|satunya|setengah|separuh|sebagian|\d+\s*(?:%|rb|ribu|k)\s)/iu;

/* ------------------------------------------------------------------ Sharing with people */

const USER = /^(aku|saya|ane|gue|gua|gw|ku|aq|sy)$/;
/** People who may share a bill without a real name: relations. */
const RELATION = new Set(['adik', 'adek', 'kakak', 'kak', 'abang', 'mama', 'papa', 'ibu', 'bapak', 'ayah', 'bunda', 'mamah', 'papah', 'pacar', 'istri', 'suami', 'sepupu', 'om', 'tante', 'nenek', 'kakek', 'ponakan', 'keponakan', 'bos', 'mertua', 'ipar', 'doi', 'ayang']);
const GENERIC_PEOPLE = /^(teman|temen|kawan|orang|anak-anak|anak2|tim|keluarga|semua|semuanya|rekan|geng)$/;
const STOP_NAME = new Set(['bagi', 'dibagi', 'rata', 'patungan', 'split', 'bill', 'yang', 'bayar', 'bayarin', 'dibayar', 'dibayarin', 'masing', 'masing-masing', 'masing2', 'per', 'tiap', 'orang', 'lagi', 'nanti', 'transfer', 'ganti', 'aja', 'saja', 'ya', 'dong', 'deh', 'kok', 'tadi', 'kemarin', 'pakai', 'pake', 'via', 'lewat', 'di', 'ke', 'dari', 'buat', 'untuk', 'utk', 'traktir', 'semua', 'semuanya', 'total', 'berdua', 'bertiga', 'berempat', 'berlima', 'sama', 'dan', 'bareng']);

export type ShareSpec = {
  /** Named participants other than you, as written. */
  people: string[]; me: boolean; payer: string | null;
  /** How many share the bill (you included when you are in it). */
  count: number; mode: 'split' | 'mine' | 'total' | 'offer';
  /** "masing-masing 35rb": the amount each one pays. */
  each?: number; words: string; why: string;
  /** "aku 60rb ferdi 40rb": each one's own part (you first when you are in it), instead of equal parts. */
  amounts?: number[];
};
export type AllocLine = { purpose: string; self: boolean; part: { kind: 'equal'; of: number } | { kind: 'amount'; value: number } | { kind: 'percent'; value: number } | { kind: 'rest' } };
export type V4Reading = { text: string; math: MathNote[]; share?: ShareSpec; allocation?: { lines: AllocLine[]; words: string }; trace: string[] };

const NUMBER_WORDS = 'dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh';
const DIVIDE = new RegExp(String.raw`\b(?:di)?bagi\s+(?:ber-?\s?\d{1,2}|ber(?:dua|tiga|empat|lima|enam|tujuh|delapan))\b|\b(?:di)?bagi\s*-?\s*(\d+|${NUMBER_WORDS}|rata)\b|\b(?:di)?bagi2\b|\bpatungan\b|\bsplit(?:\s+bill)?\b|\bsharing\b|\bsaweran\b|\bbagi\s+rata\b|\b50\s*[:/-]\s*50\b|\bfifty[\s-]?fifty\b|\bsetengah[\s-]setengah\b|\b(?:aku|saya|gue|gua|gw)\s+(?:hutang|utang|ngutang|nanggung|tanggung)\s+(?:setengah|separuh)(?:nya)?\b`, 'iu');
const EACH = /\b(?:masing-masing|masing2|masing\s+masing|tiap\s+orang|per\s*orang|seorang|@\s*orang)\s*(?:rp\.?\s*)?(\d[\d.,]*\s*(?:rb|ribu|rebu|k|jt|juta)?)/iu;
const TREAT = /\b(?:aku|saya|gue|gua|gw)\s+(?:yang\s+)?(?:traktir|nraktir|bayarin\s+semua(?:nya)?|bayar\s+semua(?:nya)?|yang\s+bayar\s+semua(?:nya)?|nalangin\s+semua)\b|\btraktir\s+semua(?:nya)?\b/iu;
const PAYER = /^(\p{L}+)\s+(?:bayarin|nalangin|talangin|nalangin dulu|bayarin dulu)\b|\b(\p{L}+)\s+yang\s+(?:bayar(?:in)?|nalangin|talangin|bayarin dulu|bayar dulu)\b|\bdibayar(?:in)?\s+(?:sama\s+|oleh\s+|ama\s+)?(\p{L}+)\b|\bditalangin\s+(?:sama\s+|oleh\s+)?(\p{L}+)\b/iu;

function countOf(text: string): { count: number; words: string } | null {
  const t = lower(text);
  let m = t.match(/\b(?:di)?bagi\s*-?\s*(\d+|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\b/);
  if (m) return { count: /^\d/.test(m[1]) ? Number(m[1]) : SMALL[m[1]], words: m[0] };
  if ((m = t.match(/\b(?:di)?bagi2\b|\b50\s*[:/-]\s*50\b|\bfifty[\s-]?fifty\b|\bsetengah[\s-]setengah\b|\b(?:hutang|utang|ngutang|nanggung|tanggung)\s+(?:setengah|separuh)(?:nya)?\b/))) return { count: 2, words: m[0] };
  if ((m = t.match(/\b(berdua|bertiga|berempat|berlima|berenam|bertujuh|berdelapan|bersembilan|bersepuluh)\b/))) return { count: COUNT_WORD[m[1]], words: m[0] };
  if ((m = t.match(/\bber-?\s?(\d{1,2})\b/))) return { count: Number(m[1]), words: m[0] };
  if ((m = t.match(/\bsama\s+(\d{1,2}|dua|tiga|empat|lima)\s+(?:teman|temen|orang|kawan|rekan)\b/))) return { count: (/^\d/.test(m[1]) ? Number(m[1]) : SMALL[m[1]]) + 1, words: m[0] };
  if ((m = t.match(/\b(\d{1,2})\s+orang\b/))) return { count: Number(m[1]), words: m[0] };
  return null;
}
/** "kamu dan Ferdi", "kamu, Atuy, dan Budi". */
const listOf = (items: string[]) => items.length < 3 ? items.join(' dan ') : `${items.slice(0, -1).join(', ')}, dan ${items[items.length - 1]}`;
const isPerson = (w: string, ctx: QuickContext) => RELATION.has(w) || (!STOP_NAME.has(w) && !GENERIC_PEOPLE.test(w) && !USER.test(w) && !/^\d/.test(w) && !(w in SMALL) && !(w in COUNT_WORD) && nameLike(w, ctx));

/** Names in the lists after "sama / bareng / dengan" (and before a dividing word: "aku sama ferdi bagi dua"). */
function namesIn(text: string, ctx: QuickContext): { names: string[]; spans: [number, number][]; me: boolean } {
  const t = lower(text), names: string[] = [], spans: [number, number][] = [];
  let me = false;
  const re = /\b(sama|bareng|dengan|ama|bersama|antara|bertiga|berempat|berdua|berlima|rata)\s+((?:\p{L}+(?:\s*,\s*|\s+dan\s+|\s+sama\s+|\s+&\s+|\s+)?){1,6})/gu;
  for (const m of t.matchAll(re)) {
    const words = m[2].split(/[\s,&]+/).filter(Boolean);
    const got: string[] = [];
    let used = 0;
    for (const w of words) {
      if (w === 'dan' || w === 'sama' || w === 'ama' || w === 'rata' || w in COUNT_WORD) { used++; continue; }
      if (USER.test(w)) { me = true; used++; continue; }
      if (isPerson(w, ctx)) { got.push(w); used++; continue; }
      break;
    }
    if (!got.length) continue;
    for (const g of got) if (!names.includes(g)) names.push(g);
    // The span: the joining word and the words used (trailing joiners dropped).
    const start = (m.index ?? 0) + (m[1] === 'rata' ? m[0].indexOf(m[2]) : 0);
    const usedText = m[2].split(/(?<=[\s,&])/).slice(0, Math.max(0, used)).join('').replace(/(?:\s*(?:,|dan|sama|ama|&)\s*)+$/, '');
    spans.push([start, (m.index ?? 0) + m[0].indexOf(m[2]) + usedText.length]);
  }
  // "aku sama ferdi …": the person writing is in it.
  if (/\b(?:aku|saya|gue|gua|gw)\s+(?:sama|dan|&|bareng|ama)\s+\p{L}/u.test(t)) me = true;
  return { names, spans, me };
}

/**
 * A spending shared by people. Named people with a dividing word → a Split Bill (you included unless the count says
 * otherwise; paid by you unless "X yang bayar"); a dividing word with only a count → your share; "aku bayarin semua"
 * with "masing-masing X" → X × count. Null when the sentence does not divide anything.
 */
export function readShare(text: string, ctx: QuickContext, total: number | null): (ShareSpec & { spans: [number, number][]; keep?: string }) | null {
  const t = lower(text);
  const divide = t.match(DIVIDE), each = t.match(EACH), treat = TREAT.test(t), counted = countOf(t);
  if (!divide && !each && !counted) return null;
  const { names, spans, me: meSaid } = namesIn(text, ctx);
  const spanOf = (re: RegExp): [number, number][] => { const m = re.exec(t); return m ? [[m.index ?? 0, (m.index ?? 0) + m[0].length]] : []; };
  let payer: string | null = null;
  const pm = t.match(PAYER);
  if (pm) { const who = (pm[1] || pm[2] || pm[3] || pm[4] || '').trim(); if (who && !USER.test(who) && isPerson(who, ctx)) { payer = who; if (!names.includes(who)) names.unshift(who); } }
  const allSpans: [number, number][] = [...spans, ...(divide ? spanOf(DIVIDE) : []), ...(counted ? spanOf(new RegExp(counted.words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) : []), ...(pm ? spanOf(PAYER) : []), ...(each ? spanOf(EACH) : [])];
  const eachValue = each ? (() => { const o = operandAt(lower(each[1]), 0); return o && (o.kind === 'money' || o.value >= 100) ? (o.kind === 'money' ? o.value : o.value * 1000) : 0; })() : 0;
  // Treating everyone: no one owes anything. "masing-masing 35rb" with a count is then the whole bill.
  if (treat && !payer) {
    if (eachValue && counted) return { people: [], me: true, payer: null, count: counted.count, mode: 'total', each: eachValue, words: counted.words, why: `Kamu membayari semua: ${counted.count} × ${rupiah(eachValue)} = ${rupiah(eachValue * counted.count)}.`, spans: [...allSpans, ...spanOf(TREAT)], keep: rupiah(eachValue) };
    return null;
  }
  if (names.length && (divide || (counted && eachValue))) {
    const count = counted?.count || 0;
    const me = count ? count === names.length + 1 || meSaid : true;
    if (count && count !== names.length + (me ? 1 : 0)) return null;
    const people = names.map(n => title(n));
    return { people, me, payer: payer ? title(payer) : null, count: names.length + (me ? 1 : 0), mode: 'split', words: (divide?.[0] || counted?.words || ''), why: `${divide ? `Bagi rata dipilih karena kamu menulis “${divide[0]}”` : `“${counted!.words}”`} dan menyebut ${listOf([...(me ? ['kamu'] : []), ...people])}${payer ? `; ${title(payer)} yang membayar` : ''}.`, spans: allSpans };
  }
  if (!names.length && (divide || eachValue) && counted && counted.count >= 2 && counted.count <= 20) {
    if (eachValue) return { people: [], me: true, payer: null, count: counted.count, mode: 'mine', each: eachValue, words: counted.words, why: `Tiap orang ${rupiah(eachValue)} (${counted.count} orang): bagianmu ${rupiah(eachValue)}.`, spans: allSpans, ...(total ? {} : { keep: rupiah(eachValue) }) };
    if (!total) return null;
    return { people: [], me: true, payer: null, count: counted.count, mode: 'mine', words: counted.words, why: `Dibagi ${counted.count} orang tanpa nama: yang dicatat bagianmu saja.`, spans: allSpans };
  }
  // "makan 300rb kita berlima": maybe the whole bill, maybe shared. The total stays; your part is one tap away.
  if (!names.length && !divide && !eachValue && counted && !/\bbagi\b/.test(counted.words) && counted.count >= 2 && counted.count <= 20 && total) return { people: [], me: true, payer: null, count: counted.count, mode: 'offer', words: counted.words, why: `“${counted.words}”: kalau dibagi rata, bagianmu ${rupiah(anonymousShare(total, counted.count))}.`, spans: [] };
  return null;
}

/**
 * "makan 100rb aku 60rb ferdi 40rb", "makan 100rb, bagian aku 60rb dan rina 40rb": each one's own part. Only when the
 * parts name you and someone else and add up to the purchase exactly.
 */
export function readParts(text: string, ctx: QuickContext, total: number): (ShareSpec & { base: string }) | null {
  const t = lower(text), main = mainAmount(t, total);
  if (!main) return null;
  const tail = t.slice(main.end);
  const PART = /\s*(?:[,;:]|\bdan\b)?\s*(?:bagian(?:nya)?\s+)?(\p{L}+)\s+(?:bayar\s+|nanggung\s+|kena\s+)?((?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|rebu|k|jt|juta)?)(?![\p{L}\d])/iuy;
  const parts: { who: string; me: boolean; value: number }[] = [];
  let at = 0;
  while (at < tail.length) {
    PART.lastIndex = at;
    const f = PART.exec(tail);
    if (!f) break;
    const who = f[1], me = USER.test(who), o = operandAt(f[2], 0);
    if (!me && !isPerson(who, ctx)) return null;
    if (!o || o.kind !== 'money') return null;
    parts.push({ who, me, value: Math.round(o.value) });
    at = PART.lastIndex;
  }
  if (tail.slice(at).replace(/[\s,;:.]/g, '') || parts.length < 2) return null;
  const mine = parts.filter(p => p.me);
  if (mine.length !== 1 || parts.reduce((n, p) => n + p.value, 0) !== total) return null;
  const others = parts.filter(p => !p.me);
  if (new Set(others.map(p => p.who)).size !== others.length) return null;
  let head = text.slice(0, main.end), payer: string | null = null;
  const pm = lower(head).match(PAYER);
  if (pm) { const who = (pm[1] || pm[2] || pm[3] || pm[4] || '').trim(); if (others.some(p => p.who === who)) { payer = title(who); head = removeSpans(head, [[pm.index ?? 0, (pm.index ?? 0) + pm[0].length]]); } }
  const people = others.map(p => title(p.who));
  return { people, me: true, payer, count: parts.length, mode: 'split', amounts: [mine[0].value, ...others.map(p => p.value)], words: tail.trim(), why: `Bagian tiap orang ditulis: ${parts.map(p => `${p.me ? 'kamu' : title(p.who)} ${rupiah(p.value)}`).join(', ')}${payer ? `; ${payer} yang membayar` : ''}.`, base: head };
}

/** Someone's part of a bill: a person, a relation, or the people of a place ("kosan sebelah", "anak kos", "tetangga"). */
const PARTY_PLACE = /\b(?:kos|kosan|kost|kamar|tetangga|sebelah|roommate|housemate|anak\s+kos|temen\s+kos|teman\s+kos|teman\s+sekamar|rumah\s+sebelah)\b/u;
const TREAT_PURPOSE = /\b(?:traktir\w*|nraktir|mentraktir|sedekah|kado|hadiah|donasi|infa[qk]|zakat|arisan|entertain|jamu|kantor|kerja|pribadi|sendiri)\b/u;
const PART_OF = String.raw`(setengah|separuh|sepertiga|seperempat|seperlima|dua pertiga|tiga perempat|\d+(?:[.,]\d+)?\s*(?:%|persen)|(?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|rebu|k|jt|juta))`;

/**
 * "listrik 450rb sepertiga buat kosan sebelah", "wifi 300rb, rina bayar setengah": another party's part of what you
 * paid. A Split Bill with written parts: yours is the rest, theirs a receivable. Treating someone ("setengahnya buat
 * traktir rina") is not this: that is one purchase on two categories (readAllocation).
 */
export function readPartyShare(text: string, ctx: QuickContext, total: number): (ShareSpec & { base: string }) | null {
  const t = lower(text), main = mainAmount(t, total);
  if (!main) return null;
  const tail = t.slice(main.end);
  const a = tail.match(new RegExp(String.raw`^\s*[,:]?\s*${PART_OF}(?:\s*nya)?\s+(?:buat|untuk|utk|bwt|bagian|punya|ditanggung|dibayar|dibayarin)\s+(?:sama\s+|oleh\s+)?((?:\p{L}+\s*){1,4})$`, 'u'));
  const b = a ? null : tail.match(new RegExp(String.raw`^\s*[,:]?\s*((?:\p{L}+\s+){1,3}?)(?:bayar|nanggung|tanggung|patungan|ikut\s+bayar|kena|nombok)\s+${PART_OF}(?:\s*nya)?\s*$`, 'u'));
  const m = a || b;
  if (!m) return null;
  const partText = a ? m[1] : m[2], party = (a ? m[2] : m[1]).trim();
  if (!party || TREAT_PURPOSE.test(party) || isSelf(party) || USER.test(party.split(/\s+/)[0])) return null;
  const first = party.split(/\s+/)[0];
  if (!PARTY_PLACE.test(party) && !(isPerson(first, ctx) && party.split(/\s+/).length <= 2)) return null;
  const frac = FRACTIONS[partText.replace(/\s+/g, ' ')];
  const pct = /%|persen/.test(partText) ? readNumber(partText.replace(/\s*(?:%|persen)/, ''), true) / 100 : 0;
  const money = !frac && !pct ? operandAt(partText, 0) : null;
  const theirs = Math.round(frac ? total * frac : pct ? total * pct : money?.kind === 'money' ? money.value : 0);
  if (!(theirs > 0 && theirs < total)) return null;
  const name = title(party), mine = total - theirs;
  return { people: [name], me: true, payer: null, count: 2, mode: 'split', amounts: [mine, theirs], words: m[0].trim(), why: `Kamu menulis “${m[0].trim().replace(/^[,:]\s*/, '')}”.`, base: text.slice(0, main.end) };
}

/* ------------------------------------------------------------------ One purchase, several purposes */

/** The part that stays the purchase itself: said with "gue / aku / punyaku / pribadi / biasa". */
const SELF = /^(?:(?:makan|minum|jajan|bensin)\s+)?(?:gue|gua|gw|aku|saya|ku|aq|sendiri|biasa|pribadi|punyaku|punya\s+(?:gue|aku|saya)|bagianku|bagian\s+(?:gue|aku|saya))$|^(?:gue|gua|gw|aku|saya)\s+(?:makan|minum|jajan)?\s*(?:biasa|sendiri)?$|^(?:gue|gua|gw|aku|saya)\s+\p{L}+(?:\s+biasa)?$|^(?:makan|minum)\s+(?:biasa|sendiri)$/u;
/** "gue expense makan biasa", "aku sendiri": starts with you and names no one else or another purpose. */
const OTHER_PURPOSE = /\b(?:traktir\w*|nraktir|mentraktir|sedekah|kado|hadiah|teman|temen|kawan|kantor|kerja|donasi|infa[qk]|zakat|ortu|orang\s*tua|mama|papa|ibu|bapak|ayah|adik|adek|kakak|pacar|istri|suami|anak|arisan|tamu|entertain|jamu)\b/u;
const isSelf = (purpose: string) => SELF.test(purpose) || /^(?:gue|gua|gw|aku|saya|ku)\b/u.test(purpose) && !OTHER_PURPOSE.test(purpose);
const FOR = String.raw`(?:(?:untuk|buat|utk|bwt|ke)\s+)?`;
const cleanPurpose = (p: string) => p.replace(/^\s*(?:lagi|nya|yang)\s+/i, '').replace(/^(?:untuk|buat|utk|bwt)\s+/i, '').replace(/[.,;:]+$/g, '').replace(/\s+/g, ' ').trim();

/**
 * "hokben 162.003 dibagi 2, satu buat gue makan biasa, satu lagi traktir teman", "setengahnya buat traktir rina",
 * "120rb: 80rb makanan, 40rb sabun", "60% bahan makanan 40% kebutuhan rumah", "30rb nya buat kantor". The lines and the
 * text before them; null when the sentence names no purposes.
 */
export function readAllocation(text: string, total: number): { base: string; lines: AllocLine[]; words: string } | null {
  const t = lower(text);
  // The purchase's amount comes first; everything about purposes follows it.
  const main = mainAmount(t, total);
  if (!main) return null;
  const head = text.slice(0, main.end), tailRaw = text.slice(main.end), tail = lower(tailRaw);
  // (a) "dibagi N, satu …, satu (lagi) …"
  let m = tail.match(new RegExp(String.raw`^\s*,?\s*(?:di)?bagi\s*-?\s*(\d|dua|tiga|empat)\s*[,:]?\s*(.+)$`, 'u'));
  const pieces = (rest: string, lead: RegExp) => rest.split(lead).map(s => s.trim()).filter(Boolean);
  if (m) {
    const n = /^\d/.test(m[1]) ? Number(m[1]) : SMALL[m[1]];
    const rest = m[2];
    let parts = pieces(rest, /(?:^|[,;]\s*|\s+)(?:yang\s+satu(?:nya)?|satunya|satu\s+lagi|satu|sisanya)\s+/u);
    if (parts.length !== n) parts = pieces(rest, /(?:^|[,;]\s*|\s+)(?:setengah(?:nya)?|separuh(?:nya)?)\s+/u);
    if (parts.length === n && n >= 2) return { base: head, lines: parts.map(p => { const purpose = cleanPurpose(p); return { purpose, self: isSelf(purpose), part: { kind: 'equal', of: n } }; }), words: tailRaw.trim() };
    return null;
  }
  // (b) halves: "setengah makan aku setengah sedekah", ", setengahnya buat traktir rina", "separuh buat traktir nisa".
  m = tail.match(new RegExp(String.raw`^\s*[,:]?\s*(?:setengah|separuh)(?:nya)?\s+(.+?)\s*,?\s+(?:setengah|separuh|sisanya)(?:nya)?\s+(.+)$`, 'u'));
  if (m) { const a = cleanPurpose(m[1]), b = cleanPurpose(m[2]); return { base: head, lines: [{ purpose: a, self: isSelf(a), part: { kind: 'equal', of: 2 } }, { purpose: b, self: isSelf(b), part: { kind: 'equal', of: 2 } }], words: tailRaw.trim() }; }
  m = tail.match(new RegExp(String.raw`^\s*[,:]?\s*(?:setengah|separuh)(?:nya)?\s+${FOR}(.+)$`, 'u'));
  if (m) { const b = cleanPurpose(m[1]); if (b && !isSelf(b)) return { base: head, lines: [{ purpose: '', self: true, part: { kind: 'equal', of: 2 } }, { purpose: b, self: false, part: { kind: 'equal', of: 2 } }], words: tailRaw.trim() }; return null; }
  // (c) amounts or percents, each with its purpose: "80rb makanan, 40rb sabun", "60% bahan makanan 40% kebutuhan rumah".
  // The whole tail must be such parts (separated by commas, ":", "dan" or spaces), or it is not a list of purposes.
  const PART = new RegExp(String.raw`\s*(?:[,;:]|\bdan\b)?\s*((?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|rebu|k|jt|juta|%|persen))(?:\s*nya)?\s+(?:(?:untuk|buat|utk|bwt)\s+)?((?:(?!(?:rp\.?\s*)?\d)(?!\bdan\s+(?:rp\.?\s*)?\d)[^,;])+)`, 'iuy');
  const REST = /\s*(?:[,;:]|\bdan\b)?\s*sisa(?:nya)?\s+(?:(?:untuk|buat|utk|bwt)\s+)?([^,;]+)/iuy;
  const lines: AllocLine[] = [];
  let at = 0;
  while (at < tail.length) {
    REST.lastIndex = at;
    const r = lines.length && !lines.some(l => l.part.kind === 'rest') ? REST.exec(tail) : null;
    if (r) { const purpose = cleanPurpose(r[1]); if (!purpose) return null; lines.push({ purpose, self: isSelf(purpose), part: { kind: 'rest' } }); at = REST.lastIndex; continue; }
    PART.lastIndex = at;
    const f = PART.exec(tail);
    if (!f) break;
    const purpose = cleanPurpose(f[2]); if (!purpose) return null;
    const isPct = /%|persen/.test(f[1]);
    const value = isPct ? readNumber(f[1].replace(/\s*(?:%|persen)/, ''), true) / 100 : (() => { const o = operandAt(f[1], 0); return o?.kind === 'money' ? o.value : 0; })();
    if (!value) return null;
    lines.push({ purpose, self: isSelf(purpose), part: isPct ? { kind: 'percent', value } : { kind: 'amount', value } });
    at = PART.lastIndex;
  }
  if (!lines.length || tail.slice(at).replace(/[\s,;:.]/g, '')) return null;
  const sum = lines.reduce((n, l) => n + (l.part.kind === 'amount' ? l.part.value : l.part.kind === 'percent' ? l.part.value * total : 0), 0);
  if (sum > total + 0.5) return null;
  // What is not named stays with the purchase itself ("30rb nya buat kantor" → the rest is the bensin).
  if (sum < total - 0.5 && !lines.some(l => l.part.kind === 'rest')) lines.unshift({ purpose: '', self: true, part: { kind: 'rest' } });
  if (lines.length < 2) return null;
  return { base: head, lines, words: tailRaw.trim() };
}

/** Where the purchase's amount is written (the first money amount equal to the total). */
function mainAmount(t: string, total: number) {
  for (let i = 0; i < t.length; i++) { if (!/\d/.test(t[i]) || (i && /[\d.,]/.test(t[i - 1]))) continue; const o = operandAt(t, i); if (o && o.kind === 'money' && Math.round(o.value) === total) return o; if (o) i = o.end - 1; }
  return null;
}

/** Amounts of the lines, adding up to the total exactly (equal parts: the first ones get the extra rupiah). */
export function lineAmounts(lines: AllocLine[], total: number): number[] {
  const out = lines.map(l => l.part.kind === 'amount' ? Math.round(l.part.value) : l.part.kind === 'percent' ? Math.round(l.part.value * total) : 0);
  const equal = lines.map((l, i) => l.part.kind === 'equal' ? i : -1).filter(i => i >= 0);
  if (equal.length) {
    const n = equal.length, left = total - out.reduce((a, b) => a + b, 0), base = Math.floor(left / n);
    equal.forEach((i, k) => { out[i] = base + (k < left - base * n ? 1 : 0); });
  }
  const rest = lines.findIndex(l => l.part.kind === 'rest');
  if (rest >= 0) out[rest] = total - out.reduce((a, b, i) => i === rest ? a : a + b, 0);
  else if (!equal.length) { const diff = total - out.reduce((a, b) => a + b, 0); if (diff && lines.some(l => l.part.kind === 'percent')) out[out.length - 1] += diff; }
  return out;
}

/* ------------------------------------------------------------------ The whole reading */

/** Takes the spans out of the text (overlaps merged); a span covering `keep.at` is replaced by `keep.with` instead. */
const removeSpans = (text: string, spans: [number, number][], keep?: { at: number; with: string }) => {
  const merged: [number, number][] = [];
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) { const last = merged[merged.length - 1]; if (last && a <= last[1]) last[1] = Math.max(last[1], b); else merged.push([a, b]); }
  let out = text;
  for (const [a, b] of merged.reverse()) out = `${out.slice(0, a)} ${keep && keep.at >= a && keep.at < b ? keep.with : ''} ${out.slice(b)}`;
  return out.replace(/\s*,\s*(?=,|$)/g, '').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '').trim();
};

/** The V4 reading of a whole message, or null when it has no arithmetic, sharing or purposes. */
export function readV4(input: string, ctx: QuickContext): V4Reading | null {
  const trace: string[] = [];
  // "dua puluh ribu dikali tiga": number words become digits first when an operator is written as a word.
  const spoken = /\b(?:dikali|kali|dibagi|bagi|ditambah|tambah|dikurangi?|kurang|dari)\b/i.test(input) && /\b(?:ribu|rebu|juta|ratus|puluh|belas|seribu|sejuta|seratus)\b/i.test(input) ? amountWords(input) : input;
  const math = readMath(spoken);
  let text = math.text;
  for (const n of math.notes) trace.push(`Matematika: “${n.raw}” → ${n.formula}${n.rounded ? ' (dibulatkan)' : ''}`);
  // The purchase's amount (the first money amount) for sharing and purposes.
  const amounts: number[] = [];
  for (let i = 0; i < text.length; i++) { if (!/\d/.test(text[i]) || (i && /[\p{L}\d.,]/u.test(text[i - 1]))) continue; const o = operandAt(lower(text), i); if (o) { if (o.kind === 'money') amounts.push(Math.round(o.value)); i = o.end - 1; } }
  const total = amounts[0] || null;
  let allocation: V4Reading['allocation'];
  // Another party's part comes first: "sepertiga buat kosan sebelah" is not a category.
  const party = total ? readPartyShare(text, ctx, total) : null;
  if (total && !party) {
    const a = readAllocation(text, total);
    if (a) { allocation = { lines: a.lines, words: a.words }; text = a.base; trace.push(`Keperluan: ${a.lines.length} bagian (${a.lines.map(l => l.self ? 'pembelian ini' : l.purpose).join(' / ')})`); }
  }
  let share: ShareSpec | undefined;
  if (party) { const { base, ...spec } = party; share = spec; text = base; trace.push(`Bagi: bagian ${spec.people[0]} ${spec.amounts![1]}`); }
  const parts = !allocation && !party && total ? readParts(text, ctx, total) : null;
  if (parts) { const { base, ...spec } = parts; share = spec; text = base; trace.push(`Bagi: bagian sendiri-sendiri · ${spec.count} orang (${spec.people.join(', ')})${spec.payer ? ` · dibayar ${spec.payer}` : ''}`); }
  if (!allocation && !parts && !party) {
    const s = readShare(text, ctx, total);
    if (s?.mode === 'offer') { const { spans: _, keep: __, ...spec } = s; share = spec; trace.push(`Bagi: ditawarkan · ${spec.count} orang`); }
    else if (s) {
      const { spans, keep, ...spec } = s; share = spec;
      // "masing-masing 35rb" with nothing else: the amount stays where the grammar reads it.
      const each = keep ? EACH.exec(lower(text)) : null;
      text = removeSpans(text, spans, each ? { at: each.index ?? 0, with: keep! } : undefined); trace.push(`Bagi: ${spec.mode} · ${spec.count} orang${spec.people.length ? ` (${spec.people.join(', ')})` : ''}${spec.payer ? ` · dibayar ${spec.payer}` : ''}`); }
  }
  if (!math.notes.length && !share && !allocation) return null;
  // "128181 dibagi 3 dikali 2": only the result is left; read it as a spending (to be described by the person).
  if (!/\p{L}/u.test(text.replace(/rp\.?\s*\d[\d.,]*/giu, ''))) text = `keluar ${text}`;
  return { text, math: math.notes, share, allocation, trace };
}

/** Shares of a Split Bill reading, from the Split Bill engine (they always add up to the total). */
export function splitShares(spec: ShareSpec, total: number) {
  const participants: { id: string; name: string; isMe?: boolean }[] = [...(spec.me ? [{ id: 'me', name: 'Kamu', isMe: true }] : []), ...spec.people.map((name, i) => ({ id: `p${i + 1}`, name }))];
  if (spec.amounts?.length === participants.length) return { participants, shares: Object.fromEntries(participants.map((p, i) => [p.id, spec.amounts![i]])) as Record<string, number> };
  const result = computeSplit({ total, method: 'equal', participants, items: [], extras: [] });
  return { participants, shares: result.shares as Record<string, number> };
}
export const anonymousShare = (total: number, count: number) => {
  const ids = Array.from({ length: count }, (_, i) => ({ id: i ? `p${i}` : 'me', name: i ? `Orang ${i + 1}` : 'Kamu', ...(i ? {} : { isMe: true }) }));
  return computeSplit({ total, method: 'equal', participants: ids, items: [], extras: [] }).shares.me as number;
};
export { rupiah as rp };
