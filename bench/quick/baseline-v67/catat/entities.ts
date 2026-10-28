/**
 * Catat otomatis V3 — entity boundaries (Engine A, the Financial Grammar).
 *
 * V2.5 found the merchant with one regular expression after the amount had been cut out of the text, so whatever sat
 * after the amount slid into it ("b1 piot 7,7k krom" → merchant "B1 Piot Krom"). Here the clause is a row of tokens,
 * each with what it can be (amount, configured wallet, date, connector, content word), and the entity spans are chosen
 * on that row:
 *
 *   - an amount, a configured wallet, a date phrase and a connector ("pake", "dari", "ke", …) end a merchant span;
 *   - a configured wallet is a protected span: a merchant candidate that would swallow it is rejected (and kept in the
 *     trace with the reason), unless the wallet word is clearly part of a known merchant name;
 *   - "di / @ / at" opens a merchant-or-place span; without it, a merchant is only split off the description when the
 *     words are a known place (built-in names, the person's own history, confirmed local memory) — an unknown word
 *     stays in the description ("kopi tubruk" is not "Kopi" at "Tubruk");
 *   - multi-word spans stay whole ("family mart", "warung bu sri", "7 speed": the 7 is not money).
 *
 * The result lists every span chosen (with offsets, for provenance and "Kenapa?") and every candidate rejected.
 */
export type EntityType =
  | 'DESCRIPTION' | 'MERCHANT' | 'PLACE' | 'MERCHANT_OR_PLACE' | 'PERSON' | 'WALLET' | 'SOURCE_WALLET' | 'DESTINATION_WALLET'
  | 'CATEGORY' | 'AMOUNT' | 'DATE' | 'TIME' | 'DEBT_RECORD' | 'RECEIVABLE_RECORD' | 'CLAIM_RECORD' | 'TRANSFER_TARGET' | 'UNKNOWN';

export type EntityNode = {
  rawText: string; normalizedText: string; start: number; end: number;
  candidateTypes: EntityType[]; selectedType: EntityType; confidence: number;
  linkedRecord?: string;
  /** Which engine or rule saw it, and why ("Financial Grammar: after 'di'", "NLP.js: merchant 0.92"). */
  sourceEngineEvidence: string[];
};
export type RejectedCandidate = { text: string; type: EntityType; reason: string };
export type Span = { start: number; end: number };

type Token = { text: string; word: string; start: number; end: number; tag: Tag };
type Tag = 'amount' | 'wallet' | 'date' | 'marker' | 'place' | 'prep' | 'content';

/** Words that end a merchant span because they open another relation. */
const MARKERS = new Set(['pake', 'pakai', 'pakek', 'pk', 'via', 'lewat', 'potong', 'dari', 'dr', 'masuk']);
const PREPS = new Set(['ke', 'buat', 'untuk', 'utk', 'kepada', 'sama', 'ama', 'dengan', 'seharga', 'harga', 'total', 'rp', 'tiap', 'setiap', 'mulai', 'terus', 'lalu', 'eh', 'bukan']);
const PLACE_OPEN = new Set(['di', '@', 'at']);
/** Small words that never end a span on their own but are trimmed from its edges. */
const EDGE_FILLERS = new Set(['aja', 'saja', 'ya', 'dong', 'nih', 'sih', 'deh', 'tuh', 'yang', 'yg', 'juga', 'lagi', 'tadi', 'td']);
const DATE_WORDS = /^(?:tadi|td|barusan|kemarin|kemaren|kmrn|kmarin|lusa|besok|hari|ini|pagi|siang|sore|malam|minggu|bulan|lalu|kemarinnya)$/;

export type BoundaryInput = {
  /** The clause, lower case, as parseQuickText reads it. */
  text: string;
  amount?: { index: number; text: string } | null;
  /** Configured wallets found in the text (walletsIn): the protected entities. */
  wallets: { id: string; name: string; at: number; word: string }[];
  /** Spans already known to be dates (DATE_PHRASES matches). */
  dates: Span[];
  /** Time expressions (lib/catat/temporal.ts): owned by the time field, never merchant or description text. */
  times?: (Span & { raw: string })[];
  flow: string;
  /** Known places, lower case → display name (built-in names, history, confirmed memory). */
  knownPlaces: Map<string, string>;
};
export type BoundaryResult = {
  merchant?: { value: string; raw: string; span: Span; opener?: Span; reason: string; confidence: number; known: boolean };
  /** Spans to take out of the description (amount, dates, times, wallets with their connector, the merchant with its "di"). */
  blank: Span[];
  /** The spans consumed by a structured field whatever the kind of entry (amount, date, time): span ownership. */
  owned: (Span & { role: 'AMOUNT' | 'DATE' | 'TIME' | 'WALLET'; rawText: string })[];
  nodes: EntityNode[];
  rejected: RejectedCandidate[];
};

const titleCase = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/(^|\s)(\S)/g, (_, sp: string, c: string) => sp + c.toLocaleUpperCase('id-ID'));
const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/** Every whole-word occurrence of the configured wallets' words (walletsIn reports only the first of each). */
function walletSpans(text: string, wallets: BoundaryInput['wallets']): (Span & { id: string; word: string })[] {
  const spans: (Span & { id: string; word: string })[] = [];
  for (const w of wallets) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\p{L}\\p{N}])`, 'gu');
    for (const m of text.matchAll(re)) { const start = (m.index ?? 0) + m[1].length; spans.push({ start, end: start + m[2].length, id: w.id, word: w.word }); }
  }
  return spans;
}

function tokenize(input: BoundaryInput): { tokens: Token[]; walletAt: (Span & { id: string; word: string })[] } {
  const { text } = input;
  const amount: Span | null = input.amount ? { start: input.amount.index, end: input.amount.index + input.amount.text.length } : null;
  const walletAt = walletSpans(text, input.wallets);
  const tokens: Token[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const start = m.index ?? 0, end = start + m[0].length, word = m[0].replace(/^[,.;:!?()"']+|[,.;:!?()"']+$/g, '');
    const span = { start, end };
    let tag: Tag = 'content';
    if (amount && overlaps(span, amount)) tag = 'amount';
    else if (walletAt.some(w => overlaps(span, w))) tag = 'wallet';
    else if ((input.times || []).some(d => overlaps(span, d)) || input.dates.some(d => overlaps(span, d)) || DATE_WORDS.test(word) && /^(?:tadi|td|barusan|kemarin|kemaren|kmrn|kmarin|lusa|besok)$/.test(word)) tag = 'date';
    else if (PLACE_OPEN.has(word)) tag = 'place';
    else if (MARKERS.has(word)) tag = 'marker';
    else if (PREPS.has(word)) tag = 'prep';
    tokens.push({ text: m[0], word, start, end, tag });
  }
  return { tokens, walletAt };
}

/** The merchant spans the clause allows, best first, with the rejected ones. */
export function resolveBoundaries(input: BoundaryInput): BoundaryResult {
  const { tokens, walletAt } = tokenize(input);
  const nodes: EntityNode[] = [], rejected: RejectedCandidate[] = [], blank: Span[] = [];
  const owned: BoundaryResult['owned'] = [];
  const own = (span: Span, role: BoundaryResult['owned'][number]['role']) => { blank.push(span); owned.push({ ...span, role, rawText: input.text.slice(span.start, span.end) }); };
  const node = (start: number, end: number, type: EntityType, confidence: number, evidence: string, candidates: EntityType[] = [type], linkedRecord?: string): EntityNode => {
    const raw = input.text.slice(start, end);
    const n: EntityNode = { rawText: raw, normalizedText: raw.trim(), start, end, candidateTypes: candidates, selectedType: type, confidence, sourceEngineEvidence: [`Financial Grammar: ${evidence}`], ...(linkedRecord ? { linkedRecord } : {}) };
    nodes.push(n); return n;
  };
  if (input.amount) { const s = input.amount.index; own({ start: s, end: s + input.amount.text.length }, 'AMOUNT'); node(s, s + input.amount.text.length, 'AMOUNT', 1, 'angka dengan satuan/nilai uang'); }
  for (const w of walletAt) {
    // The connector before a wallet ("pake krom") goes with it.
    const i = tokens.findIndex(t => t.start === w.start);
    const before = i > 0 && (tokens[i - 1].tag === 'marker' || tokens[i - 1].word === 'ke') ? tokens[i - 1] : null;
    blank.push({ start: before ? before.start : w.start, end: w.end });
    node(w.start, w.end, 'WALLET', 1, before ? `dompet terdaftar setelah “${before.word}”` : 'dompet terdaftar', ['WALLET', 'MERCHANT'], w.id);
  }
  for (const d of input.dates) { own(d, 'DATE'); node(d.start, d.end, 'DATE', 0.95, 'frasa tanggal'); }
  for (const t of input.times || []) { own(t, 'TIME'); node(t.start, t.end, 'TIME', 0.95, `frasa jam “${t.raw}”`); }
  const hard = (t: Token) => t.tag !== 'content';
  const placeKey = (s: string) => s.replace(/\s+/g, ' ').trim();
  const lookup = (raw: string) => input.knownPlaces.get(placeKey(raw)) || input.knownPlaces.get(raw.replace(/\s+/g, ''));
  const trim = (run: Token[]) => { let a = 0, b = run.length; while (a < b && EDGE_FILLERS.has(run[a].word)) a++; while (b > a && EDGE_FILLERS.has(run[b - 1].word)) b--; return run.slice(a, b); };

  let merchant: BoundaryResult['merchant'];
  const spending = input.flow === 'expense' || input.flow === 'income';
  // 1. "di / @ / at" opens a merchant-or-place span that runs to the next boundary.
  if (spending) for (let i = 0; i < tokens.length && !merchant; i++) {
    if (tokens[i].tag !== 'place') continue;
    const run: Token[] = [];
    for (let j = i + 1; j < tokens.length && !hard(tokens[j]); j++) run.push(tokens[j]);
    const span = trim(run);
    if (!span.length) continue;
    const raw = input.text.slice(span[0].start, span[span.length - 1].end);
    // What a greedy reading would have taken: the words up to the end of the clause, ignoring the amount boundary.
    const greedy = tokens.slice(i + 1).filter(t => t.tag !== 'amount' && t.tag !== 'date');
    const greedyRaw = greedy.map(t => t.word).join(' ');
    if (greedy.length > span.length && greedy.some(t => t.tag === 'wallet') && greedyRaw !== raw) rejected.push({ text: titleCase(greedyRaw), type: 'MERCHANT', reason: 'menelan dompet terdaftar' });
    const known = lookup(raw);
    merchant = { value: known || titleCase(raw), raw, span: { start: span[0].start, end: span[span.length - 1].end }, opener: { start: tokens[i].start, end: tokens[i].end }, reason: `muncul setelah “${tokens[i].word}”`, confidence: known ? 0.95 : 0.85, known: Boolean(known) };
  }
  // 2. No "di": a known place after the thing bought, when other words are left for the description.
  if (spending && !merchant) {
    const content = tokens.filter(t => t.tag === 'content');
    const runs: Token[][] = [];
    let cur: Token[] = [];
    for (const t of tokens) { if (t.tag === 'content') cur.push(t); else { if (cur.length) runs.push(cur); cur = []; } }
    if (cur.length) runs.push(cur);
    let best: { from: number; to: number; run: Token[]; value: string } | null = null;
    for (const run of runs) for (let n = Math.min(3, run.length); n >= 1 && !best; n--) for (let from = 0; from + n <= run.length && !best; from++) {
      const raw = run.slice(from, from + n).map(t => t.word).join(' '), value = lookup(raw);
      // "kopi fore", "roti indomaret": the place follows the thing bought; a known name first ("grab waktu liburan") is the
      // thing itself and stays in the description.
      if (value && content.length > n && content.indexOf(run[from]) > 0) best = { from, to: from + n, run, value };
    }
    if (best) {
      const s = best.run[best.from], e = best.run[best.to - 1];
      merchant = { value: best.value, raw: input.text.slice(s.start, e.end), span: { start: s.start, end: e.end }, reason: 'nama tempat yang dikenal', confidence: 0.9, known: true };
    }
  }
  if (merchant) {
    blank.push(merchant.opener ? { start: merchant.opener.start, end: merchant.span.end } : merchant.span);
    node(merchant.span.start, merchant.span.end, 'MERCHANT_OR_PLACE', merchant.confidence, merchant.reason, ['MERCHANT_OR_PLACE', 'DESCRIPTION']);
  }
  return { merchant, blank, owned, nodes, rejected };
}

/** The text with the spans blanked out (offsets stay valid for whatever is read next). */
export function blankOut(text: string, spans: Span[]) {
  let out = text;
  for (const s of [...spans].sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + ' '.repeat(Math.max(0, s.end - s.start)) + out.slice(s.end);
  return out;
}
