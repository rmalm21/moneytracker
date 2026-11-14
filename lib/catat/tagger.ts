/**
 * 10.3 Asisten chat 4.0 — pembaca kalimat: a small trained tagger that marks what each word of a money sentence is
 * (amount, the wallet paid from, the wallet money goes to, what was bought, where, when, a person, or anything else).
 *
 * It is an averaged perceptron over hand-made word features (the word, its beginning and end, its shape, how close it
 * is to one of the account's own wallet names, the words around it, where it sits), trained at build time on
 * sentences the app writes itself (scripts/tagger-corpus.mjs → scripts/train-tagger.mjs → lib/catat/tagger-model.ts).
 * No sentence a person typed is used, and no word of the held-out test set (checked when the corpus is made).
 *
 * The rules stay in charge: the tagger is a second opinion, used where the rules cannot tell on their own — today a
 * wallet typed wrong ("nasgor 18rb mandri", "pake jagoo"): a word close to one of the account's wallets is read as
 * that wallet only when the tagger says the word is in a wallet's place (and not "es krim" next to a Krom wallet).
 * The weights load on their own (loadTagger) when Catat otomatis or the chat opens; until then nothing changes.
 */

export type TagName = 'O' | 'AMT' | 'WAL' | 'WTO' | 'ITEM' | 'PLACE' | 'DATE' | 'PERSON';
/** Weights: tags, and per feature the weight of each tag (scaled integers, sparse: [tag, weight, tag, weight, …]). */
export type TaggerModel = { tags: TagName[]; scale: number; w: Record<string, number[]> };
export type Token = { text: string; low: string; start: number; end: number };
/** margin: how far the tag is ahead of the next best; wallet: how far "a wallet" (paid from or sent to) is ahead of "not a wallet". */
export type Tagged = Token & { tag: TagName; margin: number; wallet: number };

const MONEY = /^(?:rp\.?|idr)?\d[\d.,]*(?:rb|ribu|k|rban|jt|juta|an)?$|^(?:rp\.?|idr)$|^(?:rb|ribu|k|jt|juta)$/;
/** Words split on spaces and the punctuation around them (amounts keep their dots and commas). */
export function tokens(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(/[^\s,;:!?()"“”]+/g)) {
    const raw = m[0].replace(/[.]+$/, ''); if (!raw) continue;
    out.push({ text: raw, low: raw.toLocaleLowerCase('id-ID'), start: m.index!, end: m.index! + raw.length });
  }
  return out;
}

/** Edit distance where swapping two letters next to each other counts as one (Damerau). */
export function editDistance(a: string, b: string, cap = 3) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

/** The words a wallet goes by: its name, each longer word of it, and "cash"/"tunai" for each other. */
export function walletWords(names: string[]) {
  const out = new Map<string, string>();
  const alias: Record<string, string[]> = { tunai: ['cash'], cash: ['tunai'] };
  for (const name of names) {
    const low = name.toLocaleLowerCase('id-ID').trim(), compact = low.replace(/[^\p{L}\p{N}]+/gu, '');
    for (const w of [compact, ...low.split(/[^\p{L}\p{N}]+/u).filter(p => p.length >= 3 && !['bank', 'by', 'pay', 'digital'].includes(p)), ...(alias[low] || [])]) if (w && !out.has(w)) out.set(w, name);
  }
  return out;
}

/** The closest wallet word to a word: how far, and which. Exact words are 0. */
export function nearestWallet(word: string, words: Map<string, string>) {
  let best = { dist: 9, word: '', name: '', tie: false };
  for (const [w, name] of words) {
    const d = word === w ? 0 : editDistance(word, w);
    if (d < best.dist) best = { dist: d, word: w, name, tie: false };
    else if (d === best.dist && name !== best.name) best.tie = true;
  }
  return best;
}
/** How close, as a feature: exact, a slip for its length, two slips on a long word, or not close. */
function closeness(word: string, words: Map<string, string>) {
  if (!/^\p{L}{3,}$/u.test(word)) return 'none';
  const n = nearestWallet(word, words);
  return n.dist === 0 ? 'exact' : n.dist === 1 ? 'one' : n.dist === 2 && word.length >= 6 ? 'two' : 'far';
}
const shape = (w: string) => MONEY.test(w) ? 'money' : /^\d+$/.test(w) ? 'digits' : /\d/.test(w) ? 'mixed' : /^\p{L}+$/u.test(w) ? (w.length <= 3 ? 'short' : 'word') : 'other';

/** What the tagger looks at for word i (prev: the tag given to the word before). */
export function features(toks: Token[], i: number, words: Map<string, string>, prev: string): string[] {
  const w = toks[i].low, at = (k: number) => toks[i + k]?.low ?? (k < 0 ? '<s>' : '</s>');
  const near = closeness(w, words), sh = shape(w), fromEnd = Math.min(toks.length - 1 - i, 3);
  const p1 = at(-1), n1 = at(1);
  return [
    'b', `w=${w}`, `p3=${w.slice(0, 3)}`, `s3=${w.slice(-3)}`, `s2=${w.slice(-2)}`, `sh=${sh}`, `near=${near}`,
    `p1=${p1}`, `n1=${n1}`, `p2=${at(-2)}`, `n2=${at(2)}`, `p1sh=${shape(p1)}`, `n1sh=${shape(n1)}`,
    `first=${i === 0}`, `end=${fromEnd}`, `prev=${prev}`, `prev+near=${prev}|${near}`, `p1+near=${p1}|${near}`,
    `near+end=${near}|${fromEnd}`, `near+first=${near}|${i === 0}`, `n1+near=${n1}|${near}`, `p1near=${closeness(p1, words)}`, `n1near=${closeness(n1, words)}`,
  ];
}

/** Tags for a sentence, left to right, with how sure each one is (the gap to the next best). */
export function tagTokens(model: TaggerModel, toks: Token[], walletNames: string[]): Tagged[] {
  const words = walletWords(walletNames), out: Tagged[] = [];
  let prev = '<s>';
  for (let i = 0; i < toks.length; i++) {
    const scores = new Array(model.tags.length).fill(0);
    for (const f of features(toks, i, words, prev)) { const row = model.w[f]; if (row) for (let k = 0; k < row.length; k += 2) scores[row[k]] += row[k + 1]; }
    let best = 0, second = -Infinity;
    for (let k = 1; k < scores.length; k++) if (scores[k] > scores[best]) best = k;
    for (let k = 0; k < scores.length; k++) if (k !== best && scores[k] > second) second = scores[k];
    let isW = -Infinity, notW = -Infinity;
    for (let k = 0; k < scores.length; k++) if (model.tags[k] === 'WAL' || model.tags[k] === 'WTO') isW = Math.max(isW, scores[k]); else notW = Math.max(notW, scores[k]);
    out.push({ ...toks[i], tag: model.tags[best], margin: (scores[best] - second) / model.scale, wallet: (isW - notW) / model.scale });
    prev = model.tags[best];
  }
  return out;
}

let MODEL: TaggerModel | null = null, loading: Promise<TaggerModel | null> | null = null;
/** Loads the weights once (a separate chunk); reading works without them (rules only) until they are in. */
export function loadTagger(): Promise<TaggerModel | null> {
  loading ||= import('./tagger-model.ts').then(m => (MODEL = m.TAGGER as TaggerModel)).catch(() => null);
  return loading;
}
export const taggerReady = () => MODEL;
/** For tests and benches: use these weights (null: rules only). */
export function useTagger(model: TaggerModel | null) { MODEL = model; }

/** How sure the tagger must be before a word is read as a wallet it was not spelled as (typos score 39–61 on the dev
 * sentences, real words in a wallet-like place mostly below 25). */
const SURE = 30;
/** Right after a word that names a wallet ("pake", "via", "dompetnya"), a lower bar: the place says it already. */
const SURE_AFTER_LEAD = 10;
const LEADS = new Set(['pake', 'pakai', 'via', 'lewat', 'dari', 'ke', 'dompet', 'dompetnya', 'saldo', 'pakenya', 'bayar', 'masuk', 'rekening']);
/** Everyday words one slip away from a popular wallet name: never read as that wallet. */
const REAL_WORDS = new Set(['jaga', 'krim', 'krem', 'kram', 'tuna', 'tunas', 'cas', 'case', 'genius', 'mandi', 'from', 'all', 'hallo', 'ago', 'hash', 'blue', 'neon', 'dan', 'data', 'dina']);
/**
 * 10.3 A wallet typed wrong: "nasgor 18rb mandri", "pake jagoo", "kromm bayar listrik 200rb". A word one slip away from
 * one of the account's wallet words (of 4 letters or more), closest to just one wallet, is written as that wallet when
 * the tagger reads it as a wallet. The rest of the sentence is untouched.
 */
export function repairWallets(text: string, walletNames: string[], model: TaggerModel | null = MODEL): { text: string; fixed: { from: string; to: string; wallet: string }[] } {
  if (!model || !text || !walletNames.length) return { text, fixed: [] };
  const words = walletWords(walletNames), toks = tokens(text);
  const candidates = toks.map(t => {
    if (!/^\p{L}{3,}$/u.test(t.low) || words.has(t.low) || REAL_WORDS.has(t.low)) return null;
    const n = nearestWallet(t.low, words);
    // One slip only, on a wallet word of 4 letters or more: two slips, or a slip on "bri"/"bca"/"ovo", reach too many
    // real words ("mandor", "beri").
    const close = n.dist === 1 && n.word.length >= 4;
    return close && !n.tie ? n : null;
  });
  if (!candidates.some(Boolean)) return { text, fixed: [] };
  const tagged = tagTokens(model, toks, walletNames), fixed: { from: string; to: string; wallet: string }[] = [];
  let out = text;
  for (let i = toks.length - 1; i >= 0; i--) {
    const n = candidates[i], t = tagged[i];
    if (!n || t.wallet < (LEADS.has(toks[i - 1]?.low || '') ? SURE_AFTER_LEAD : SURE)) continue;
    out = out.slice(0, t.start) + n.word + out.slice(t.end);
    fixed.unshift({ from: t.text, to: n.word, wallet: n.name });
  }
  return { text: out, fixed };
}
