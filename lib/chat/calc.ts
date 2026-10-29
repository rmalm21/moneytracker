/**
 * Chat calculator: "hitung 128181 dibagi 3 dikali 2", "berapa 15% dari 2,5jt", "(50rb+30rb)/2", "12 x 7". Numbers are read
 * the Indonesian way ("128.181" is a hundred and twenty-eight thousand, "2,5" two and a half, "1.5jt" one and a half
 * million), with rb / ribu / k / jt / juta / m / miliar. Operator words are worked out left to right, the way they are
 * said ("100rb ditambah 50rb dibagi 2" = 75rb); symbols use the usual order (× ÷ before + −) and brackets.
 */
import { amountWords } from '../quick-entry.ts';

export type Calculation = { value: number; expression: string; money: boolean; steps: number };

type Tok = { t: 'num'; v: number; money: boolean; show: string } | { t: 'op'; v: '+' | '-' | '*' | '/'; word: boolean } | { t: '(' } | { t: ')' } | { t: 'pct' } | { t: 'of' };

const UNIT: Record<string, number> = { rb: 1e3, ribu: 1e3, rebu: 1e3, k: 1e3, jt: 1e6, juta: 1e6, m: 1e9, miliar: 1e9, milyar: 1e9 };
const WORD_OP: [RegExp, '+' | '-' | '*' | '/'][] = [
  [/^(?:ditambah|ditambahin|tambah|plus)\b/, '+'], [/^(?:dikurangi|dikurangin|dikurang|kurangi|kurang|minus)\b/, '-'],
  [/^(?:dikali|dikalikan|dikaliin|kali)\b/, '*'], [/^(?:dibagi|dibagikan|bagi)\b/, '/'],
];
const FRACTION: Record<string, number> = { setengah: 0.5, separuh: 0.5, sepertiga: 1 / 3, seperempat: 0.25, seperlima: 0.2 };
const SMALL: Record<string, number> = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11 };

/** "128.181" → 128181, "2,5" → 2.5, "1.5" → 1.5, "1.250.000" → 1250000. */
function readNumber(raw: string): number {
  const s = raw.trim();
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^\d+,\d+$/.test(s)) return Number(s.replace(',', '.'));
  if (/^\d+\.\d{1,2}$/.test(s)) return Number(s);
  return Number(s.replace(/[.,]/g, ''));
}
const show = (n: number, money: boolean) => money ? `Rp${Math.round(n).toLocaleString('id-ID')}` : n.toLocaleString('id-ID', { maximumFractionDigits: 2 });

function tokenize(input: string): Tok[] | null {
  let s = amountWords(input.toLocaleLowerCase('id-ID')).replace(/\s+/g, ' ').trim();
  const out: Tok[] = [];
  while (s.length) {
    s = s.replace(/^\s+/, '');
    if (!s) break;
    let m: RegExpMatchArray | null;
    if ((m = s.match(/^(?:rp\.?\s*)?(\d[\d.,]*)\s*(rb|ribu|rebu|k|jt|juta|miliar|milyar|m)?(?![\p{L}])/u))) {
      const unit = m[2] ? UNIT[m[2]] : 1, v = readNumber(m[1]) * unit;
      if (!Number.isFinite(v)) return null;
      out.push({ t: 'num', v, money: Boolean(m[2]) || /^rp/.test(m[0]) || v >= 1000, show: m[0].trim() });
      s = s.slice(m[0].length); continue;
    }
    if ((m = s.match(/^(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas)\b/))) { out.push({ t: 'num', v: SMALL[m[1]], money: false, show: String(SMALL[m[1]]) }); s = s.slice(m[0].length); continue; }
    if ((m = s.match(/^(setengah|separuh|sepertiga|seperempat|seperlima)(?:nya)?\b/))) { out.push({ t: 'num', v: FRACTION[m[1]], money: false, show: m[1] }); s = s.slice(m[0].length); continue; }
    if ((m = s.match(/^(?:%|persen)/))) { out.push({ t: 'pct' }); s = s.slice(m[0].length); continue; }
    if ((m = s.match(/^dari\b/))) { out.push({ t: 'of' }); s = s.slice(m[0].length); continue; }
    if (s[0] === '(' || s[0] === ')') { out.push({ t: s[0] }); s = s.slice(1); continue; }
    if ((m = s.match(/^[+]/))) { out.push({ t: 'op', v: '+', word: false }); s = s.slice(1); continue; }
    if ((m = s.match(/^[-−–]/))) { out.push({ t: 'op', v: '-', word: false }); s = s.slice(1); continue; }
    if ((m = s.match(/^(?:[*×]|x(?![\p{L}]))/u))) { out.push({ t: 'op', v: '*', word: false }); s = s.slice(m[0].length); continue; }
    if ((m = s.match(/^[/÷:]/))) { out.push({ t: 'op', v: '/', word: false }); s = s.slice(1); continue; }
    const w = WORD_OP.find(([re]) => re.test(s));
    if (w) { out.push({ t: 'op', v: w[1], word: true }); s = s.slice(s.match(w[0])![0].length); continue; }
    return null;
  }
  return out;
}

/** The value of a whole calculation, or null when the text is not one (a word that is not a number or an operator). */
export function calculate(input: string): Calculation | null {
  const read = tokenize(input);
  if (!read || !read.some(t => t.t === 'num')) return null;
  const toks: Tok[] = read;
  // "15% dari 2jt", "setengah dari 80rb": a part of what follows ("dari" binds tighter than anything else).
  const ops = toks.filter(t => t.t === 'op');
  const words = ops.some(t => t.t === 'op' && t.word);
  let i = 0, steps = 0, money = false;
  const shown: string[] = [];
  const peek = () => toks[i];
  function primary(): number | null {
    const t = toks[i];
    if (!t) return null;
    if (t.t === '(') { i++; shown.push('('); const v = sum(); if (toks[i]?.t !== ')') return null; i++; shown.push(')'); return v; }
    if (t.t === 'op' && t.v === '-' ) { i++; const v = primary(); return v === null ? null : -v; }
    if (t.t !== 'num') return null;
    i++;
    let v = t.v; money ||= t.money; shown.push(t.show);
    if (peek()?.t === 'pct') { i++; v /= 100; shown[shown.length - 1] += '%'; }
    if (peek()?.t === 'of') { i++; shown.push('dari'); const of = primary(); if (of === null) return null; steps++; v *= of; }
    return v;
  }
  function product(): number | null {
    let v = primary(); if (v === null) return null;
    while (peek()?.t === 'op' && ((peek() as { v: string }).v === '*' || (peek() as { v: string }).v === '/')) {
      const op = (toks[i++] as { v: string }).v; shown.push(op === '*' ? '×' : '÷');
      const r = primary(); if (r === null) return null;
      if (op === '/' && r === 0) return null;
      v = op === '*' ? v * r : v / r; steps++;
    }
    return v;
  }
  function sum(): number | null {
    let v = product(); if (v === null) return null;
    while (peek()?.t === 'op' && ((peek() as { v: string }).v === '+' || (peek() as { v: string }).v === '-')) {
      const op = (toks[i++] as { v: string }).v; shown.push(op === '+' ? '+' : '−');
      const r = product(); if (r === null) return null;
      v = op === '+' ? v + r : v - r; steps++;
    }
    return v;
  }
  /** Words: strictly left to right ("dibagi 3 dikali 2"). */
  function spoken(): number | null {
    let v = primary(); if (v === null) return null;
    while (peek()?.t === 'op') {
      const op = (toks[i++] as { v: string }).v; shown.push(op === '*' ? '×' : op === '/' ? '÷' : op === '+' ? '+' : '−');
      const r = primary(); if (r === null) return null;
      if (op === '/' && r === 0) return null;
      v = op === '+' ? v + r : op === '-' ? v - r : op === '*' ? v * r : v / r; steps++;
    }
    return v;
  }
  const value = words && !toks.some(t => t.t === '(') ? spoken() : sum();
  if (value === null || i !== toks.length || !steps) return null;
  return { value, expression: shown.join(' ').replace(/\(\s/g, '(').replace(/\s\)/g, ')'), money, steps };
}

/** The result in words for the chat: rupiah for money (rounded to the rupiah), a number otherwise. */
export const calcText = (c: Calculation) => show(c.money ? Math.round(c.value) : c.value, c.money);
