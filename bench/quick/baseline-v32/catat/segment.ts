/**
 * Catat otomatis V3.2 — where one action ends and the next begins, without commas or joining words.
 *
 *   "ayam dbesto 13k kmrin parkir 2k di kantor hri ini atuy bayar utang 12k"
 *     → "ayam dbesto 13k kmrin" | "parkir 2k di kantor hri ini" | "atuy bayar utang 12k"
 *   "kmrn kopi 20k hari ini bensin 80k" → "kmrn kopi 20k" | "hari ini bensin 80k"
 *
 * Anchors: a new money amount, a new financial verb, a person + financial verb, a change of date. Between two money
 * amounts every possible cut is a candidate; each is scored by how complete both sides are:
 *   - what follows an amount and only modifies it (a wallet, "di kantor", a time, a date written after the item) stays
 *     with it; words that name something new (an item, a verb, a person doing something) start the next action;
 *   - the date style of the sentence decides where a date between two actions goes: a sentence that starts with a date
 *     ("kmrn kopi 20k hari ini bensin 80k") puts dates before their item, one that does not puts them after;
 *   - a financial verb or a person + verb at the start of the next part is a strong anchor (bonus).
 * Never split: charges ("makan 100k pajak 10k"), a count ("beli 2 ayam 20k" — one amount), a purpose ("atuy ngutang
 * 12k buat makan"), a monthly amount, or sentences that are one record by nature (saldo, tujuan dana, rencana…).
 * Reversible: the cuts are only offsets into the source; the trace lists every candidate and its score.
 */
import { findAmounts, knownPlaces, nameLike, walletsIn, type QuickContext, type QuickKind } from '../quick-entry.ts';
import { findTimes } from './temporal.ts';

export type SegmentDeps = {
  /** The clause as the reader sees it (normalized, corrections applied). */
  prep: (text: string) => string;
  dateRe: () => RegExp;
  /** The kind a text reads as on its own and whether it has an amount (null = not an action). */
  read: (norm: string) => { kind: QuickKind; amount: number } | null;
};
export type SegmentCandidate = { at: number; score: number; left: string; right: string; note: string };
export type Segmentation = { cuts: number[]; trace: string[] };

const CHARGE = /^(pajak|ppn|tax|service|servis|svc|ongkir|ongkos|admin|biaya|fee|tip|tips|diskon|disc|potongan|cashback|kembalian|total|sisa|dp|untung|rugi|modal|buat|untuk|utk|bwt|guna|demi|masing-masing|per|x|@|plus|tambah)\b/;
const FIN_VERB = /^(beli|bayar|byr|jajan|belanja|makan|minum|ngopi|isi|topup|top|tf|transfer|kirim|terima|dapat|dapet|gaji|gajian|jual|ngutang|utang|hutang|pinjam|minjem|pinjem|pinjemin|minjemin|pinjamin|talangin|nalangin|bayarin|balikin|ngembaliin|lunasin|dibayar|nabung|parkir|bensin)\b/;
const LOAN_VERB = /^(ngutang|utang|hutang|pinjam|minjem|pinjem|pinjemin|minjemin|pinjamin|talangin|nalangin|bayarin|balikin|ngembaliin|lunasin|bayar|dibayar|nyicil|kasbon)$/;
const PREP_MOD = /^(di|@|pakai|pake|pk|via|lewat|dari|dr|ke|masuk)$/;
const FILLER = /^(juga|aja|ya|deh|dong|nih|sih|lagi|lg|doang)$/;
const SPLITTABLE = new Set<QuickKind>(['expense', 'income', 'debt_new', 'receivable_new', 'debt_payment', 'receivable_payment', 'budget']);

type Tok = { w: string; start: number; end: number };
const toks = (t: string): Tok[] => [...t.matchAll(/\S+/g)].map(m => ({ w: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));

/** How many words at the start of a (normalized) text only modify what came before: wallet, "di X", date, time. */
function leadModifiers(norm: string, ctx: QuickContext, dateRe: () => RegExp, places: Map<string, string>) {
  let rest = norm.trim(), count = 0, date = false, dateWords = 0;
  for (let guard = 0; guard < 8 && rest; guard++) {
    const words = rest.split(/\s+/), first = words[0];
    const wallet = walletsIn(rest, ctx.wallets).find(w => w.at === 0);
    const d = dateRe().exec(rest), t = findTimes(rest)[0];
    let used = 0;
    if (d && d.index === 0) { used = d[0].trim().split(/\s+/).length; date = true; dateWords += used; }
    else if (t && t.start === 0) used = rest.slice(0, t.end).trim().split(/\s+/).length;
    else if (wallet) used = wallet.word.split(/\s+/).length;
    else if (PREP_MOD.test(first) && words[1]) {
      used = 2;
      // "di apotek k24", "di pak min": a known place or an honorific keeps its next word.
      if (words[2] && (places.has(`${words[1]} ${words[2]}`) || /^(pak|bu|mas|mbak|mba|bang|kak|warung|toko|rm|kedai)$/.test(words[1]))) used = 3;
    } else if (FILLER.test(first)) used = 1;
    if (!used) break;
    count += used; rest = words.slice(used).join(' ');
  }
  return { count, date, dateWords, rest };
}

export function segmentPiece(source: string, start: number, end: number, ctx: QuickContext, deps: SegmentDeps): Segmentation {
  const src = source.slice(start, end), lower = src.toLocaleLowerCase('id-ID'), trace: string[] = [];
  const tokens = toks(src);
  const money = findAmounts(lower).filter(a => (a.marked || a.value >= 1000) && !a.monthly);
  if (money.length < 2) return { cuts: [], trace };
  const whole = deps.read(deps.prep(src));
  if (!whole || !SPLITTABLE.has(whole.kind) || findAmounts(lower).some(a => a.monthly)) return { cuts: [], trace };
  const places = knownPlaces(ctx);
  const anchor = money.map(a => ({ first: tokens.findIndex(t => t.end > a.index), last: tokens.reduce((k, t, i) => t.start < a.index + a.text.length ? i : k, 0) }));
  const span = (i: number, j: number) => i < j ? src.slice(tokens[i].start, tokens[j - 1].end) : '';
  const amountFirst = anchor[0].first === 0;
  const head0 = deps.prep(span(0, anchor[0].first));
  const forward = Boolean(head0 && deps.dateRe().exec(head0)?.index === 0);
  trace.push(`segmentasi: ${money.length} nominal di “${src.trim()}”; gaya tanggal ${forward ? 'di depan barang' : 'di belakang barang'}${amountFirst ? ', nominal di depan' : ''}`);

  const cuts: number[] = [];
  let segStart = 0;
  for (let n = 0; n + 1 < anchor.length; n++) {
    const A = anchor[n], B = anchor[n + 1];
    if (B.first <= A.last) continue;
    const candidates: SegmentCandidate[] = [];
    for (let k = A.last + 1; k <= B.first; k++) {
      const head = deps.prep(span(k, B.first)), tail = deps.prep(span(A.last + 1, k));
      const left = span(segStart, k), right = span(k, B.last + 1);
      let note = '';
      if (amountFirst) { if (k !== B.first) continue; }
      else if (!head) continue;
      if (CHARGE.test(head)) { candidates.push({ at: k, score: -99, left, right, note: 'biaya/keperluan, bukan aksi baru' }); continue; }
      const lead = leadModifiers(head, ctx, deps.dateRe, places), tailMods = leadModifiers(tail, ctx, deps.dateRe, places);
      const content = lead.rest.trim();
      if (!amountFirst && !content) { candidates.push({ at: k, score: -99, left, right, note: 'bagian kanan tanpa barang/kata kerja' }); continue; }
      const tailContent = tailMods.rest.trim() ? tailMods.rest.trim().split(/\s+/).length : 0;
      let score = 0;
      score -= tailContent;
      score -= lead.count - (forward ? lead.dateWords : 0);
      if (forward && tailMods.date) score -= 2;
      const cw = content.split(/\s+/);
      if (FIN_VERB.test(content)) { score += 1; note = `kata kerja “${cw[0]}”`; }
      if (cw[1] && LOAN_VERB.test(cw[1]) && nameLike(cw[0], ctx)) { score += 2; note = `orang + kata kerja “${cw[0]} ${cw[1]}”`; }
      if (forward ? lead.date : tailMods.date) { score += 0.5; note = `${note ? `${note}, ` : ''}pergantian tanggal`; }
      candidates.push({ at: k, score, left, right, note });
    }
    const valid = candidates.filter(c => c.score > -99).sort((a, b) => b.score - a.score || a.at - b.at);
    const best = valid[0];
    trace.push(`  antara nominal ${n + 1} dan ${n + 2}: ${candidates.map(c => `[${c.left.trim()} | ${c.right.trim()}] ${c.score <= -99 ? `ditolak (${c.note})` : `skor ${c.score}${c.note ? ` (${c.note})` : ''}`}`).join(' · ') || 'tidak ada kandidat'}`);
    if (!best) continue;
    // Both sides must read as an action with an amount on their own (completeness).
    const leftNorm = deps.prep(span(segStart, best.at)), rightNorm = deps.prep(span(best.at, n + 2 < anchor.length ? anchor[n + 2].first : tokens.length));
    const l = deps.read(leftNorm), r = deps.read(rightNorm);
    if (!l?.amount || !r?.amount) { trace.push(`  potongan “${best.left.trim()} | ${best.right.trim()}” batal: salah satu sisi bukan aksi lengkap`); continue; }
    cuts.push(start + tokens[best.at].start); segStart = best.at;
    trace.push(`  dipotong sebelum “${tokens[best.at].w}” (skor ${best.score})`);
  }
  return { cuts, trace };
}
