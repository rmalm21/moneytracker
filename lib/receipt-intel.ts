/**
 * Receipt Intelligence 2.0: from what the OCR read to what the receipt proves. Pure functions, no browser.
 *
 *  - fuseReadings: several OCR passes (whole receipt, or one region read again) are combined value by value. Values
 *    that agree across passes are trusted more; values that disagree are kept as alternatives, and arithmetic decides
 *    only when exactly one combination makes the receipt add up. Nothing is picked at random.
 *  - reconcile: RECONCILED / MINOR_DIFFERENCE / UNRECONCILED / INSUFFICIENT_DATA, with the difference in Rupiah.
 *  - buildIntelligence: every important field gets a status the user understands (Terverifikasi, Kemungkinan benar,
 *    Perlu dicek, Belum terbaca), the evidence behind it (the lines and photo region it came from) and, when unsure,
 *    the other readings to choose from. The review screen shows only what needs checking.
 *  - findDuplicate: a receipt that looks already recorded (several signals, never the amount alone).
 *  - mergeReceiptReads: a long receipt shot in several photos, overlapping items counted once.
 *  - regionFor / readRegionValue: where to read one field again, and how (numbers only for amounts).
 */
import { checkReceipt, itemsNet, netOf, readAmount, readReceiptDate, receiptScore, timeOf, type PaymentMethod, type ReceiptLine, type ReceiptRead, type ReceiptType, type SourceField } from './receipt.ts';
import { unionBox, type Box, type OcrLine } from './receipt-rows.ts';

export const RECEIPT_ENGINE_VERSION = 2;
export type FieldStatus = 'verified' | 'likely' | 'check' | 'missing';
export const STATUS_LABELS: Record<FieldStatus, string> = { verified: 'Terverifikasi', likely: 'Kemungkinan benar', check: 'Perlu dicek', missing: 'Belum terbaca' };
export type Evidence = { passIds: string[]; lines: number[]; box: Box | null; label?: string; relation?: string };
export type Field<T> = { value: T; status: FieldStatus; /** Other readings, most likely first. */ alternatives: T[]; /** Why it has this status, in plain words. */ why: string[]; evidence: Evidence; raw?: string };
export type ItemField = { index: number; name: Field<string>; amount: Field<number>; qty: number; discount: number; modifiers: string[]; addOnOf?: string };
export type ReconcileState = 'RECONCILED' | 'MINOR_DIFFERENCE' | 'UNRECONCILED' | 'INSUFFICIENT_DATA';
export type Reconciliation = { state: ReconcileState; difference: number; message: string };
export type Issue = { field: string; label: string; message: string; alternatives?: number[] | string[] };
export type ReceiptIntelligence = {
  engineVersion: typeof RECEIPT_ENGINE_VERSION;
  receiptType: ReceiptType;
  merchant: Field<string>; date: Field<string>; time: Field<string>; payment: Field<PaymentMethod>;
  subtotal: Field<number>; grandTotal: Field<number>;
  charges: Record<'tax' | 'service' | 'discount' | 'delivery' | 'fee' | 'rounding', Field<number>>;
  items: ItemField[];
  reconciliation: Reconciliation;
  /** Headline for the review screen. */
  headline: string;
  /** Only the things the user should look at. */
  issues: Issue[];
};

/* ------------------------------------------------------------------ OCR passes */

export type OcrPass = {
  id: string;
  /** Which image variant and page mode were read (for the debug view and the benchmark). */
  variant: string; psm: string;
  /** Rows with word boxes, in working-image pixels (a region pass is already offset to the page). */
  lines: OcrLine[];
  confidence: number;
  /** When only part of the receipt was read again. */
  region?: Box;
  /** The text as parsed, and its reading (lines of `text` = `lines`). */
  text: string; read: ReceiptRead;
};

/* ------------------------------------------------------------------ Consensus */

export type Vote<T> = { value: T; weight: number; passId: string };
export type Consensus<T> = { value: T | undefined; status: 'agreed' | 'single' | 'conflict' | 'none'; support: number; alternatives: T[]; passIds: string[] };
/**
 * The value most readings agree on. "agreed": at least two readings and more weight than all others together;
 * "single": only one reading has it; "conflict": readings disagree and none wins.
 */
export function fuseValues<T>(votes: Vote<T>[], same: (a: T, b: T) => boolean = (a, b) => a === b): Consensus<T> {
  const groups: { value: T; weight: number; count: number; passIds: string[] }[] = [];
  for (const vote of votes) {
    const group = groups.find(g => same(g.value, vote.value));
    if (group) { group.weight += vote.weight; group.count++; group.passIds.push(vote.passId); }
    else groups.push({ value: vote.value, weight: vote.weight, count: 1, passIds: [vote.passId] });
  }
  if (!groups.length) return { value: undefined, status: 'none', support: 0, alternatives: [], passIds: [] };
  groups.sort((a, b) => b.weight - a.weight || b.count - a.count);
  const [top, ...rest] = groups, others = rest.reduce((n, g) => n + g.weight, 0);
  const status = !rest.length ? (top.count >= 2 ? 'agreed' : 'single') : top.count >= 2 && top.weight > others ? 'agreed' : 'conflict';
  return { value: top.value, status, support: top.count, alternatives: rest.map(g => g.value), passIds: top.passIds };
}

/* ------------------------------------------------------------------ Fusing passes */

type NumberField = 'subtotal' | 'total' | 'tax' | 'service' | 'discount' | 'delivery' | 'fee' | 'rounding' | 'paid' | 'change';
const NUMBER_FIELDS: NumberField[] = ['subtotal', 'total', 'tax', 'service', 'discount', 'delivery', 'fee', 'rounding', 'paid', 'change'];
export type FieldVotes = {
  numbers: Partial<Record<NumberField, Consensus<number>>>;
  merchant?: Consensus<string>; date?: Consensus<string>; time?: Consensus<string>; payment?: Consensus<PaymentMethod>;
  /** Per item of the fused reading: its amount across passes. */
  items: Consensus<number>[];
  /** Fields and items settled by arithmetic (value → why). */
  resolved: string[];
  /** Pass ids per field, for the evidence. */
  passes: number;
};
export type Fused = { read: ReceiptRead; votes: FieldVotes; base: OcrPass; boxes: (field: SourceField) => Box | null; itemBox: (index: number) => Box | null };

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
function bigrams(text: string) { const t = squash(text), out: string[] = []; for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2)); return out; }
export function similarity(a: string, b: string) {
  const x = bigrams(a), y = bigrams(b); if (!x.length || !y.length) return squash(a) === squash(b) && squash(a) ? 1 : 0;
  const pool = [...y]; let hit = 0; for (const g of x) { const i = pool.indexOf(g); if (i >= 0) { hit++; pool.splice(i, 1); } }
  return 2 * hit / (x.length + y.length);
}
const lineBox = (pass: OcrPass, lines: number[] | undefined) => unionBox((lines || []).map(i => pass.lines[i]?.box).filter((b): b is Box => Boolean(b)));
const overlapY = (a: Box | null, b: Box | null) => { if (!a || !b) return 0; const top = Math.max(a.y, b.y), bottom = Math.min(a.y + a.height, b.y + b.height); return Math.max(0, bottom - top) / Math.max(1, Math.min(a.height, b.height)); };
/** How much a pass counts: its OCR confidence and whether its receipt adds up. */
const passWeight = (pass: OcrPass) => (.5 + pass.confidence / 200) * (checkReceipt(pass.read).matches ? 1.5 : 1) * (pass.region ? .9 : 1);
/**
 * How much one value of a pass counts: the pass's weight times how clearly the engine saw the line(s) the value came
 * from. Evidence, not a head count: two blurry readings of "8" do not outvote one sharp "3".
 */
export function evidenceWeight(pass: OcrPass, lines: number[] | undefined) {
  const seen = (lines || []).map(i => pass.lines[i]?.confidence).filter((c): c is number => typeof c === 'number' && c > 0);
  const clarity = seen.length ? seen.reduce((n, c) => n + c, 0) / seen.length : pass.confidence;
  return passWeight(pass) * (.4 + Math.min(100, clarity) / 100 * .6);
}

/**
 * Several readings of the same receipt → one reading. The best whole-receipt pass is the base; every value is then
 * voted on by all passes that read it (a pass that did not read a field does not vote). Items are matched across
 * passes by where they are on the receipt (same row), or by name when positions are not known.
 */
export function fuseReadings(passes: OcrPass[]): Fused {
  const whole = passes.filter(p => !p.region);
  const base = (whole.length ? whole : passes).slice().sort((a, b) => receiptScore(b.read) - receiptScore(a.read))[0];
  const read: ReceiptRead = { ...base.read, items: base.read.items.map(item => ({ ...item })), sources: { ...base.read.sources } };
  const votes: FieldVotes = { numbers: {}, items: [], resolved: [], passes: passes.length };
  const others = passes.filter(p => p !== base);
  // Numbers.
  for (const field of NUMBER_FIELDS) {
    const list: Vote<number>[] = passes.filter(p => p.read[field]).map(p => ({ value: p.read[field] as number, weight: evidenceWeight(p, p.read.sources?.[field]), passId: p.id }));
    if (!list.length) continue;
    const consensus = fuseValues(list);
    votes.numbers[field] = consensus;
    // The base did not read it but others agree → take it; the base read it but others agree on something else → take theirs.
    if (consensus.value !== undefined && consensus.status === 'agreed' && consensus.value !== read[field]) read[field] = consensus.value;
    else if (!read[field] && consensus.value !== undefined && consensus.status === 'single') read[field] = consensus.value;
  }
  // One discount, two places: under an item in some passes, on the bill in others. It is counted once, and it goes
  // where most whole-receipt passes put it; on a tie, under the item (the more precise reading, same money).
  const itemDiscountOf = (r: ReceiptRead) => r.items.reduce((n, i) => n + (i.discount || 0), 0);
  const itemDiscounts = itemDiscountOf(read);
  if (!base.read.discount && itemDiscounts && read.discount === itemDiscounts) read.discount = 0;
  else if (read.discount && !itemDiscounts) {
    const sameCount = whole.filter(p => p.read.items.length === read.items.length);
    const underItem = sameCount.filter(p => !p.read.discount && itemDiscountOf(p.read) === read.discount);
    const onBill = sameCount.filter(p => p.read.discount === read.discount && !itemDiscountOf(p.read));
    if (underItem.length && underItem.length >= onBill.length) {
      underItem[0].read.items.forEach((item, i) => { if (item.discount) read.items[i] = { ...read.items[i], discount: item.discount }; });
      read.discount = 0; read.charges = (read.charges || []).filter(c => c.key !== 'discount'); delete read.sources?.discount;
    }
  }
  if (votes.numbers.total?.value !== undefined && read.total && !read.totals?.includes(read.total)) read.totals = [read.total, ...(read.totals || [])];
  // Words and dates.
  const textVotes = <T extends string>(get: (r: ReceiptRead) => T, same?: (a: T, b: T) => boolean) => fuseValues(passes.filter(p => get(p.read)).map(p => ({ value: get(p.read), weight: passWeight(p), passId: p.id })), same);
  votes.merchant = textVotes(r => r.merchant, (a, b) => similarity(a, b) >= .85);
  votes.date = textVotes(r => r.date); votes.time = textVotes(r => r.time); votes.payment = textVotes(r => r.payment);
  if (votes.date.status === 'agreed' && votes.date.value) read.date = votes.date.value;
  if (!read.date && votes.date.value) read.date = votes.date.value;
  if (!read.time && votes.time.value) read.time = votes.time.value;
  if (!read.merchant && votes.merchant.value) read.merchant = votes.merchant.value;
  if ((votes.payment.status === 'agreed' || !read.payment) && votes.payment.value) read.payment = votes.payment.value;
  // Items: each base item against the same row (or name) in the other passes.
  const baseBoxes = read.items.map(item => lineBox(base, item.lines));
  const extra: { item: ReceiptLine; pass: OcrPass; box: Box | null }[] = [];
  const itemVotes: Vote<number>[][] = read.items.map(item => [{ value: item.total, weight: evidenceWeight(base, item.lines), passId: base.id }]);
  for (const pass of others) {
    const used = new Set<number>();
    pass.read.items.forEach(item => {
      const box = lineBox(pass, item.lines);
      let best = -1, bestScore = 0;
      read.items.forEach((mine, i) => {
        if (used.has(i)) return;
        const place = box && baseBoxes[i] ? overlapY(box, baseBoxes[i]) : 0, name = similarity(item.name, mine.name);
        const score = place >= .5 ? 1 + place + name : !box || !baseBoxes[i] ? (name >= .55 ? name : 0) : name >= .8 ? name : 0;
        if (score > bestScore) { bestScore = score; best = i; }
      });
      if (best >= 0) { used.add(best); itemVotes[best].push({ value: item.total, weight: evidenceWeight(pass, item.lines), passId: pass.id }); }
      else extra.push({ item, pass, box });
    });
  }
  votes.items = itemVotes.map(list => fuseValues(list));
  votes.items.forEach((consensus, i) => {
    if (consensus.status !== 'agreed' || consensus.value === undefined || consensus.value === read.items[i].total) return;
    const item = read.items[i], qty = consensus.value % item.qty === 0 ? item.qty : 1;
    read.items[i] = { ...item, qty, price: consensus.value / qty, total: consensus.value };
  });
  // Items the base missed but other passes read: added only when two passes agree on them, or when adding exactly one
  // of them makes the receipt add up. An item that no pass read is never added.
  const target = read.subtotal || read.total;
  const candidates = extra.filter(e => !read.items.some(m => m.total === e.item.total && similarity(m.name, e.item.name) >= .5));
  const agreed = candidates.filter((e, i) => candidates.some((f, j) => j !== i && f.pass !== e.pass && f.item.total === e.item.total && similarity(f.item.name, e.item.name) >= .6));
  const seenAgreed = new Set<string>();
  for (const e of agreed) { const key = `${squash(e.item.name).slice(0, 8)}:${e.item.total}`; if (seenAgreed.has(key)) continue; seenAgreed.add(key); read.items.push({ ...e.item }); votes.items.push({ value: e.item.total, status: 'agreed', support: 2, alternatives: [], passIds: [e.pass.id] }); baseBoxes.push(e.box); votes.resolved.push(`item:${read.items.length - 1}`); }
  if (target && !checkReceipt(read).matches) {
    const fits = candidates.filter(e => !agreed.includes(e) && checkReceipt({ ...read, items: [...read.items, e.item] }).matches);
    const distinct = [...new Map(fits.map(e => [`${e.item.total}`, e])).values()];
    if (distinct.length === 1) { read.items.push({ ...distinct[0].item }); votes.items.push({ value: distinct[0].item.total, status: 'single', support: 1, alternatives: [], passIds: [distinct[0].pass.id] }); baseBoxes.push(distinct[0].box); votes.resolved.push(`item:${read.items.length - 1}`); }
  }
  // Keep the receipt order (by position when known).
  if (baseBoxes.every(Boolean)) {
    const order = read.items.map((item, i) => ({ item, vote: votes.items[i], box: baseBoxes[i]! })).sort((a, b) => a.box.y - b.box.y);
    read.items = order.map(o => o.item); votes.items = order.map(o => o.vote); order.forEach((o, i) => { baseBoxes[i] = o.box; });
  }
  resolveByArithmetic(read, votes);
  const boxes = (field: SourceField) => {
    const own = lineBox(base, read.sources?.[field]);
    if (own) return own;
    for (const pass of others) { const b = lineBox(pass, pass.read.sources?.[field]); if (b && (pass.read as unknown as Record<string, unknown>)[field] === (read as unknown as Record<string, unknown>)[field]) return b; }
    return null;
  };
  return { read, votes, base, boxes, itemBox: index => baseBoxes[index] || null };
}

/**
 * Readings that disagree: every combination of the alternatives is tried (bounded), and a combination is taken only
 * when it is the one and only way the receipt adds up. Otherwise the values stay as they are, marked for checking.
 */
/** The receipt adds up completely: the total is explained, and the items give the subtotal when both are printed. */
export function addsUp(read: ReceiptRead) {
  const check = checkReceipt(read);
  if (!check.matches || Math.abs(check.computed - check.total) > 1) return false;
  // The subtotal is printed after the item discounts on most receipts, before them on some (Alfamart: Subtotal 56,200,
  // then "Total Diskon -4,000"); both are the same items.
  const gross = read.items.reduce((n, i) => n + i.qty * i.price, 0);
  return !read.subtotal || !read.items.length || Math.abs(itemsNet(read.items) - read.subtotal) <= 1 || (gross !== itemsNet(read.items) && Math.abs(gross - read.subtotal) <= 1);
}
export function resolveByArithmetic(read: ReceiptRead, votes: FieldVotes) {
  type Choice = { apply: (r: ReceiptRead, v: number) => void; options: number[]; name: string };
  const choices: Choice[] = [];
  votes.items.forEach((consensus, i) => { if (consensus.status === 'conflict' && read.items[i]) choices.push({ name: `item:${i}`, options: [read.items[i].total, ...consensus.alternatives.filter(v => v !== read.items[i].total)].slice(0, 3), apply: (r, v) => { const item = r.items[i], qty = v % item.qty === 0 ? item.qty : 1; r.items[i] = { ...item, qty, price: v / qty, total: v }; } }); });
  for (const field of ['subtotal', 'total', 'tax', 'service', 'discount', 'delivery', 'fee'] as NumberField[]) {
    const consensus = votes.numbers[field];
    if (consensus?.status === 'conflict') choices.push({ name: field, options: [read[field] as number, ...consensus.alternatives.filter(v => v !== read[field])].slice(0, 3), apply: (r, v) => { (r as unknown as Record<string, number>)[field] = v; if (field === 'total') r.totals = [v]; } });
  }
  if (!choices.length) return;
  const limited = choices.slice(0, 6);
  let combos = 1; for (const c of limited) combos *= c.options.length;
  if (combos > 729) return;
  const fits: number[][] = [];
  for (let n = 0; n < combos; n++) {
    let rest = n; const pick = limited.map(c => { const k = rest % c.options.length; rest = Math.floor(rest / c.options.length); return c.options[k]; });
    const trial: ReceiptRead = { ...read, items: read.items.map(item => ({ ...item })), totals: [...(read.totals || [])] };
    limited.forEach((c, i) => c.apply(trial, pick[i]));
    if (addsUp(trial)) fits.push(pick);
  }
  // Exactly one way to add up: that is the reading (even when it is the one already chosen, it is now proven).
  if (fits.length !== 1) return;
  limited.forEach((c, i) => { if (fits[0][i] !== c.options[0]) c.apply(read, fits[0][i]); votes.resolved.push(c.name); });
}

/* ------------------------------------------------------------------ Reconciliation */

const rp = (n: number) => `Rp${Math.round(Math.abs(n)).toLocaleString('id-ID')}`;
/** A small, fixed tolerance for Rupiah rounding. */
export const tolerance = (total: number) => Math.max(100, Math.round(total * .002));
/**
 * Whether the parts of a receipt give its total. `computed` is items (or subtotal) with the counted charges.
 */
export function reconcileAmounts({ total, computed, hasParts }: { total: number; computed: number; hasParts: boolean }): Reconciliation {
  if (!total || !hasParts || !computed) return { state: 'INSUFFICIENT_DATA', difference: 0, message: total ? 'Rincian belum cukup untuk mencocokkan total.' : 'Total belum terbaca.' };
  const difference = total - computed;
  if (Math.abs(difference) <= 1) return { state: 'RECONCILED', difference: 0, message: 'Total cocok dengan rincian.' };
  if (Math.abs(difference) <= tolerance(total)) return { state: 'MINOR_DIFFERENCE', difference, message: `Total hampir cocok (selisih ${rp(difference)}, biasanya pembulatan).` };
  return { state: 'UNRECONCILED', difference, message: `Total struk belum cocok. Selisih ${rp(difference)}.` };
}
export function reconcile(read: ReceiptRead): Reconciliation {
  const check = checkReceipt(read), byPayment = read.paid && read.change && read.paid > read.change ? read.paid - read.change : 0;
  const hasParts = check.itemsTotal > 0 || read.subtotal > 0;
  if (check.total && !hasParts && byPayment) return Math.abs(byPayment - check.total) <= 1 ? { state: 'RECONCILED', difference: 0, message: 'Total cocok dengan uang bayar dan kembalian.' } : { state: 'UNRECONCILED', difference: check.total - byPayment, message: `Total belum cocok dengan bayar − kembalian. Selisih ${rp(check.total - byPayment)}.` };
  return reconcileAmounts({ total: check.total, computed: check.matches ? check.computed : check.computed || check.itemsTotal, hasParts });
}

/* ------------------------------------------------------------------ Field confidence */

const PAYMENT_WORDS: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', debit: 'Debit', credit: 'Kartu kredit', transfer: 'Transfer', gopay: 'GoPay', ovo: 'OVO', dana: 'DANA', shopeepay: 'ShopeePay', linkaja: 'LinkAja' };
/** A merchant the user has recorded before, when the OCR is one letter off ("H0KBEN" → "HokBen"). */
export function normalizeMerchant(raw: string, known: string[]): { value: string; matched: boolean } {
  const key = squash(raw.replace(/0/g, 'o').replace(/1/g, 'l'));
  if (key.length < 4) return { value: raw, matched: false };
  for (const name of known) {
    const other = squash(name);
    if (other.length < 4) continue;
    if (other === key) return { value: name, matched: true };
    const limit = other.length >= 9 ? 2 : other.length >= 5 ? 1 : 0;
    if (limit && Math.abs(other.length - key.length) <= limit && editDistance(other, key) <= limit) return { value: name, matched: true };
  }
  return { value: raw, matched: false };
}
function editDistance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const row = [i]; for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = row; }
  return prev[b.length];
}
const looksReadable = (name: string) => { const letters = (name.match(/[a-z]/gi) || []).length, visible = name.replace(/\s/g, '').length; return letters >= 3 && letters / Math.max(1, visible) >= .6 && !/[^\w\s&'().,/%+-]/.test(name); };

export type IntelContext = { votes?: FieldVotes; boxes?: (field: SourceField) => Box | null; itemBox?: (index: number) => Box | null; knownMerchants?: string[]; passIds?: string[] };
/** Everything the review screen needs to know about how sure each value is. */
export function buildIntelligence(read: ReceiptRead, context: IntelContext = {}): ReceiptIntelligence {
  const check = checkReceipt(read), reconciliation = reconcile(read), votes = context.votes, passIds = context.passIds || [];
  const ev = (field: SourceField, extra: Partial<Evidence> = {}): Evidence => ({ passIds: passIds.slice(0, 1), lines: read.sources?.[field] || [], box: context.boxes?.(field) || null, ...extra });
  const field = <T>(value: T, status: FieldStatus, why: string[], evidence: Evidence, alternatives: T[] = [], raw?: string): Field<T> => ({ value, status, alternatives, why, evidence, ...(raw !== undefined ? { raw } : {}) });
  const agreement = (c: Consensus<unknown> | undefined) => c?.status === 'agreed' ? ['Beberapa pembacaan sama.'] : c?.status === 'conflict' ? ['Pembacaan berbeda-beda.'] : [];
  const reconciled = reconciliation.state === 'RECONCILED' || reconciliation.state === 'MINOR_DIFFERENCE';
  const byPayment = read.paid && read.change && read.paid > read.change ? read.paid - read.change : 0;

  // The place.
  const normalized = normalizeMerchant(read.merchant, context.knownMerchants || []);
  const merchantValue = normalized.value;
  const merchantStatus: FieldStatus = !merchantValue ? 'missing' : (read.merchantRaw && read.merchantRaw !== read.merchant) || normalized.matched ? 'verified' : votes?.merchant?.status === 'conflict' ? 'check' : looksReadable(merchantValue) ? 'likely' : 'check';
  const merchant = field(merchantValue, merchantStatus, [...(normalized.matched ? ['Cocok dengan tempat yang pernah kamu catat.'] : read.merchantRaw && read.merchantRaw !== read.merchant ? ['Nama toko dikenali.'] : []), ...agreement(votes?.merchant)], ev('merchant'), (votes?.merchant?.alternatives || []) as string[], read.merchantRaw || (normalized.matched ? read.merchant : undefined));
  // Date and time.
  const date = field(read.date, !read.date ? 'missing' : votes?.date?.status === 'conflict' ? 'check' : votes?.date?.status === 'agreed' ? 'verified' : 'likely', agreement(votes?.date), ev('date'), (votes?.date?.alternatives || []) as string[]);
  const time = field(read.time, !read.time ? 'missing' : votes?.time?.status === 'conflict' ? 'check' : 'likely', agreement(votes?.time), ev('time'), (votes?.time?.alternatives || []) as string[]);
  // The grand total: evidence, not the biggest number.
  const totalWhy: string[] = [];
  if (check.source === 'printed') totalWhy.push('Tertulis sebagai total di struk.');
  if (reconciled && check.matches) totalWhy.push('Cocok dengan jumlah item dan biaya.');
  if (byPayment && Math.abs(byPayment - check.total) <= 1) totalWhy.push('Cocok dengan uang bayar dikurangi kembalian.');
  totalWhy.push(...agreement(votes?.numbers.total));
  if (votes?.resolved.includes('total')) totalWhy.push('Dipilih karena hanya angka ini yang cocok dengan rincian.');
  const totalCross = (reconciled && check.matches) || Boolean(byPayment && Math.abs(byPayment - check.total) <= 1);
  const totalStatus: FieldStatus = !check.total ? 'missing' : totalCross ? 'verified' : votes?.numbers.total?.status === 'conflict' || reconciliation.state === 'UNRECONCILED' || check.source === 'computed' || check.source === 'items' || check.confidence === 'rendah' ? 'check' : 'likely';
  const grandTotal = field(check.total, totalStatus, totalWhy, ev(check.source === 'paid' ? 'paid' : 'total', { label: check.source === 'printed' ? 'TOTAL' : undefined, relation: reconciled ? 'item + biaya = total' : undefined }), (votes?.numbers.total?.alternatives || []).filter(v => v !== check.total));
  const subtotal = field(read.subtotal, !read.subtotal ? 'missing' : check.itemsTotal && Math.abs(read.subtotal - check.itemsTotal) <= 1 ? 'verified' : votes?.numbers.subtotal?.status === 'conflict' ? 'check' : 'likely', agreement(votes?.numbers.subtotal), ev('subtotal'), votes?.numbers.subtotal?.alternatives || []);
  // Charges.
  const chargeField = (key: 'tax' | 'service' | 'discount' | 'delivery' | 'fee' | 'rounding') => {
    const value = (read[key] || 0) as number, c = votes?.numbers[key as NumberField];
    const status: FieldStatus = !value ? 'missing' : c?.status === 'conflict' && !votes?.resolved.includes(key) ? 'check' : reconciled && check.matches ? 'verified' : 'likely';
    return field(value, status, [...(check.included.includes(key) ? ['Sudah termasuk dalam harga (tidak ditambahkan lagi).'] : []), ...agreement(c)], ev(key), c?.alternatives || []);
  };
  const charges = { tax: chargeField('tax'), service: chargeField('service'), discount: chargeField('discount'), delivery: chargeField('delivery'), fee: chargeField('fee'), rounding: chargeField('rounding') };
  // Items.
  const itemsReconcile = reconciled && check.matches && check.itemsTotal > 0 && Math.abs((read.subtotal || check.itemsTotal) - check.itemsTotal) <= 1;
  const items: ItemField[] = read.items.map((item, index) => {
    const c = votes?.items[index], fixed = (read.fixes || []).some(f => f.startsWith(`${item.name}:`)), byMath = votes?.resolved.includes(`item:${index}`);
    const amountStatus: FieldStatus = c?.status === 'conflict' && !byMath ? 'check' : itemsReconcile ? 'verified' : fixed ? 'check' : 'likely';
    const why = [...(itemsReconcile ? ['Jumlah semua item cocok dengan subtotal/total.'] : []), ...(fixed ? ['Angka ini dibetulkan agar cocok dengan total; cocokkan dengan struk.'] : []), ...(byMath ? ['Dipilih karena hanya angka ini yang membuat struk cocok.'] : []), ...agreement(c)];
    const box = context.itemBox?.(index) || null;
    return {
      index, qty: item.qty, discount: item.discount || 0, modifiers: item.modifiers || [], ...(item.addOnOf ? { addOnOf: item.addOnOf } : {}),
      name: field(item.name, looksReadable(item.name) ? 'likely' : 'check', looksReadable(item.name) ? [] : ['Nama item kurang jelas terbaca.'], { passIds: passIds.slice(0, 1), lines: item.lines || [], box }),
      amount: field(netOf(item), amountStatus, why, { passIds: c?.passIds || passIds.slice(0, 1), lines: item.lines || [], box }, (c?.alternatives || []).filter(v => v !== item.total)),
    };
  });
  const payment = field(read.payment, read.payment ? (votes?.payment?.status === 'conflict' ? 'check' : 'likely') : 'missing', read.payment ? [`Dari bagian pembayaran: ${PAYMENT_WORDS[read.payment] || read.payment}.`] : [], ev('payment'), (votes?.payment?.alternatives || []) as PaymentMethod[]);

  // What the user should look at, most important first.
  const issues: Issue[] = [];
  if (!check.total) issues.push({ field: 'total', label: 'Total', message: 'Bagian total belum terbaca. Isi nominalnya.' });
  else if (grandTotal.status === 'check') issues.push({ field: 'total', label: 'Total', message: grandTotal.alternatives.length ? `Total terbaca ${rp(check.total)}; kemungkinan lain ${grandTotal.alternatives.map(rp).join(', ')}.` : reconciliation.state === 'UNRECONCILED' ? 'Cocokkan angka total dan item dengan struk; mungkin ada angka yang salah baca atau item yang terlewat.' : 'Total perlu dicocokkan dengan struk.', alternatives: grandTotal.alternatives });
  items.forEach(item => { if (item.amount.status === 'check') issues.push({ field: `item:${item.index}`, label: `Item ${item.index + 1}${item.name.value ? ` (${item.name.value})` : ''}`, message: item.amount.alternatives.length ? `Terbaca ${rp(item.amount.value)}; kemungkinan lain ${item.amount.alternatives.map(rp).join(', ')}.` : 'Nominal item ini perlu dicek.', alternatives: item.amount.alternatives }); });
  if (date.status === 'check') issues.push({ field: 'date', label: 'Tanggal', message: 'Tanggal terbaca berbeda-beda. Periksa tanggalnya.', alternatives: date.alternatives });
  if (!read.date && (read.items.length || check.total)) issues.push({ field: 'date', label: 'Tanggal', message: 'Tanggal belum terbaca; dipakai tanggal hari ini.' });
  for (const key of Object.keys(charges) as (keyof typeof charges)[]) if (charges[key].status === 'check') issues.push({ field: key, label: { tax: 'Pajak', service: 'Service', discount: 'Diskon', delivery: 'Ongkir', fee: 'Biaya lain', rounding: 'Pembulatan' }[key], message: 'Nominal biaya ini terbaca berbeda-beda.', alternatives: charges[key].alternatives });
  if (reconciliation.state === 'UNRECONCILED' && !issues.some(i => i.field === 'total')) issues.push({ field: 'reconcile', label: 'Rincian', message: reconciliation.message });
  if (read.itemGaps && !itemsReconcile) issues.push({ field: 'items', label: 'Item', message: 'Beberapa item belum dikenali.' });

  const headline = !check.total && !read.items.length ? (read.merchant || read.date ? 'Struk terbaca sebagian.' : 'Struk tidak ditemukan.') : !check.total ? 'Bagian total belum terbaca.' : !read.items.length ? 'Total berhasil dibaca, tetapi item belum dikenali.' : issues.length ? 'Struk terbaca. Periksa bagian yang ditandai.' : 'Struk berhasil dibaca.';
  return { engineVersion: RECEIPT_ENGINE_VERSION, receiptType: read.receiptType || 'unknown', merchant, date, time, payment, subtotal, grandTotal, charges, items, reconciliation, headline, issues };
}

/* ------------------------------------------------------------------ Duplicates */

type TxLike = { id: string; type: string; amount: number; date: string; time?: string; merchant: string; notes: string; tags: string[] };
export type Duplicate = { tx: TxLike; score: number; reasons: string[] };
const dayDiff = (a: string, b: string) => Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
/**
 * A transaction that looks like this receipt recorded before: the same amount AND at least two more signals (same
 * day, same place, same time, the receipt number in its notes). Two meals of the same price on one day at different
 * places are not duplicates. Only transactions a few days around the receipt date are looked at.
 */
export function findDuplicate(receipt: { amount: number; date: string; time?: string; merchant?: string; receiptNo?: string; type?: string }, transactions: TxLike[]): Duplicate | null {
  if (!receipt.amount || !receipt.date) return null;
  let best: Duplicate | null = null;
  for (const tx of transactions) {
    if (tx.amount !== receipt.amount || (receipt.type && tx.type !== receipt.type) || !tx.date || dayDiff(tx.date, receipt.date) > 2) continue;
    const reasons: string[] = []; let score = 0;
    if (receipt.receiptNo && receipt.receiptNo.length >= 4 && tx.notes?.includes(receipt.receiptNo)) { score += 6; reasons.push('nomor struk sama'); }
    if (tx.date === receipt.date) { score += 3; reasons.push('tanggal sama'); } else if (dayDiff(tx.date, receipt.date) === 1) score += 1;
    if (receipt.merchant && tx.merchant && similarity(receipt.merchant, tx.merchant) >= .7) { score += 3; reasons.push('tempat sama'); }
    if (receipt.time && tx.time && Math.abs(minutes(receipt.time) - minutes(tx.time)) <= 20) { score += 2; reasons.push('jam hampir sama'); }
    if (tx.tags?.includes('struk')) score += 1;
    if (score >= 6 && (!best || score > best.score)) best = { tx, score, reasons };
  }
  return best;
}
const minutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };

/* ------------------------------------------------------------------ Long receipts */

/**
 * A long receipt shot in parts: the second photo starts where the first ended, usually with a few items repeated.
 * The overlap (the longest run of items at the end of the first that match the start of the second, by amount and
 * name) is counted once. Header from the first photo, summary from the last one that has it.
 */
export function mergeReceiptReads(first: ReceiptRead, next: ReceiptRead): { read: ReceiptRead; overlap: number } {
  const same = (a: ReceiptLine, b: ReceiptLine) => a.total === b.total && similarity(a.name, b.name) >= .6;
  // The longest run of matching items between the end of the first photo and the start of the next. Rows cut in half
  // at the edge of either photo (misread) sit around the run and are dropped.
  let run = { i: first.items.length, j: 0, k: 0 };
  for (let i = Math.max(0, first.items.length - 25); i < first.items.length; i++) for (let j = 0; j < Math.min(25, next.items.length); j++) {
    let k = 0; while (i + k < first.items.length && j + k < next.items.length && same(first.items[i + k], next.items[j + k])) k++;
    if (k > run.k) run = { i, j, k };
  }
  const trailing = first.items.length - (run.i + run.k);
  // One matching item counts only when it is right at the join; a run of two or more may have a cut row or two around it.
  const ok = run.k >= 2 ? trailing <= 2 && run.j <= 2 : run.k === 1 && trailing === 0 && run.j === 0;
  const kept = ok ? [...first.items.slice(0, run.i + run.k), ...next.items.slice(run.j + run.k)] : [...first.items, ...next.items];
  const overlap = ok ? run.k : 0;
  const summary = next.total || next.subtotal ? next : first;
  const read: ReceiptRead = {
    ...first,
    items: kept.map(item => ({ ...item, lines: undefined })),
    subtotal: summary.subtotal, tax: summary.tax, service: summary.service, discount: summary.discount, delivery: summary.delivery, rounding: summary.rounding, fee: summary.fee, total: summary.total, totals: summary.totals,
    paid: summary.paid, change: summary.change, payment: next.payment || first.payment, cashback: summary.cashback, charges: summary.charges, rates: summary.rates,
    merchant: first.merchant || next.merchant, date: first.date || next.date, time: first.time || next.time,
    skipped: first.skipped + next.skipped, fixes: [...(first.fixes || []), ...(next.fixes || [])], sources: {}, layout: undefined,
  };
  if (!read.fixes?.length) delete read.fixes;
  return { read, overlap };
}

/* ------------------------------------------------------------------ Reading one field again */

export type RegionMode = 'number' | 'text' | 'date';
export type RegionPlan = { rect: Box; mode: RegionMode; psm: '7' | '6'; whitelist?: string; scale: number };
/**
 * Where to read a field again: only its row (for an amount, only the number at the end of the row), enlarged so the
 * letters are big, and read as a single line; amounts with digits only. Null when the field has no known position.
 */
export function regionFor(fieldName: string, box: Box | null, line: OcrLine | null, page: { width: number; height: number }): RegionPlan | null {
  if (!box) return null;
  const mode: RegionMode = /^(date|time)$/.test(fieldName) ? 'date' : /^(merchant|name)/.test(fieldName) ? 'text' : 'number';
  let rect = box;
  if (mode === 'number' && line) {
    // The amount: the last token(s) that look like a number.
    const numbers = line.tokens.filter(t => /\d/.test(t.text) && t.box.x + t.box.width > box.x && t.box.x < box.x + box.width);
    const last = numbers[numbers.length - 1];
    if (last) rect = unionBox(numbers.filter(t => t.box.x >= last.box.x - last.box.height * 3).map(t => t.box))!;
  }
  const height = Math.max(8, rect.height), padX = height * .3, padY = height * .45;
  const x = Math.max(0, rect.x - padX), y = Math.max(0, rect.y - padY);
  const full = { x, y, width: Math.min(page.width - x, rect.width + padX * 2), height: Math.min(page.height - y, rect.height + padY * 2) };
  return { rect: full, mode, psm: '7', ...(mode === 'number' ? { whitelist: '0123456789.,-' } : {}), scale: Math.max(1, Math.min(4, 56 / height)) };
}
/** The value a re-read region gives, or null when it gives nothing usable. */
export function readRegionValue(mode: RegionMode, text: string): number | string | null {
  const line = text.replace(/\s+/g, ' ').trim();
  if (!line) return null;
  if (mode === 'number') { const cleaned = line.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1').replace(/\s(?=\d{3}\b)/g, '.'); const amount = readAmount(cleaned); return amount && Math.abs(amount.value) >= 100 ? Math.abs(amount.value) : null; }
  if (mode === 'date') return readReceiptDate(line) || timeOf(line) || null;
  return /[a-z]{3,}/i.test(line) ? line.slice(0, 60) : null;
}
export { itemsNet };
