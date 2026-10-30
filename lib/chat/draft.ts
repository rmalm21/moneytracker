/**
 * 7.9 The card waiting to be saved, changed by what the person says next (the training document's "ralat berlapis",
 * "hanya satu bagian berubah", "yang kedua", "sama seperti sebelumnya"):
 *
 *   - several changes in one message: "GoPay, kemarin", "bukan Jago, GoPay. Eh nominalnya 32rb",
 *     "tanggalnya hari ini aja, catatan makan siang", "iya, masuk Mandiri", "bener yang awal, 25rb", "kopi tadi jadi 25rb";
 *   - one item of several: "pulpennya 10rb, buku tetep", "yang bensin kemarin", "yang kedua hapus", "makan jangan dulu";
 *   - the shopping split into what was bought ("susu 25rb, sabun 62rb" for a card of 87rb), a plan that already happened
 *     ("eh ternyata udah dibeli tadi, pake tunai"), a discount ("diskon 10rb").
 *
 * Everything here rewrites the sentence of the card (Catat otomatis reads it again); nothing is saved by the chat.
 */
import { findAmounts, walletsIn, type QuickContext } from '../quick-entry.ts';
import { readOwnPart } from '../catat/math.ts';

const lower = (s: string) => s.toLocaleLowerCase('id-ID');
const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DATE = String.raw`(?:kemarin|kemaren|kmrn|tadi pagi|tadi siang|tadi sore|tadi malam|semalam|semalem|hari ini|besok|lusa|(?:\d+ )?hari lalu|minggu lalu|(?:tgl|tanggal) \d{1,2}(?:[/-]\d{1,2})?|\d{1,2}[/-]\d{1,2}|(?:hari )?(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu)(?: kemarin| lalu)?)`;
const DATE_ANY = new RegExp(String.raw`\b${DATE}\b`, 'g');
const FILL = /\b(?:aja|saja|deh|dong|ya|yah|sih|kok|nih|tuh|deng|dah|kak|min|lah)\b/g;
const unfill = (s: string) => s.replace(FILL, ' ').replace(/\s+/g, ' ').trim();
const ORDINAL: Record<string, number> = { pertama: 1, kesatu: 1, kedua: 2, ketiga: 3, keempat: 4, kelima: 5, keenam: 6 };

export type Clause = { text: string; amount: number };
/** The parts of a card's sentence: one per item (an amountless tail such as "bayar tunai" stays with the whole). */
export function clausesOf(text: string): { items: Clause[]; tail: string } {
  const parts = text.replace(/[.!]+$/, '').split(/\s*[,;]\s*|\s+(?:dan|sama|terus|trus|plus)\s+(?=\S+(?:\s+\S+)?\s+(?:rp\.?\s*)?\d)/i).map(p => p.trim()).filter(Boolean);
  const items: Clause[] = [], tails: string[] = [];
  for (const p of parts) { const a = findAmounts(lower(p)).find(x => x.value > 0); if (a) items.push({ text: p, amount: a.value }); else tails.push(p); }
  return { items, tail: tails.join(', ') };
}
const join = (items: Clause[], tail: string) => [...items.map(c => c.text), tail].filter(Boolean).join(', ');
/** The words naming an item ("pulpennya" → "pulpen"), or the clause it points to. */
function itemAt(word: string, items: Clause[]) {
  const w = lower(word).replace(/nya$/, '');
  if (w.length < 3) return -1;
  const hits = items.map((c, i) => new RegExp(`\\b${esc(w)}`, 'i').test(lower(c.text)) ? i : -1).filter(i => i >= 0);
  return hits.length === 1 ? hits[0] : -1;
}
function amountIn(text: string, amount: string) {
  const t = lower(text), a = findAmounts(t).find(x => x.value > 0);
  return a ? `${text.slice(0, a.index)}${amount}${text.slice(a.index + a.text.length)}` : `${text} ${amount}`;
}
export function withAmount(text: string, amount: string, quick?: QuickContext) {
  // "kopi 25rb. eh 22rb" + "bener yang awal, 25rb": the corrected amounts give way to the one meant now.
  const fixed = text.match(/((?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k|jt|juta)?)(?:\s*[.,]?\s*(?:eh+|eh salah|salah|maksud(?:nya|ku)?|bukan|ralat)\s*[,.]?\s*(?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k|jt|juta)?)+/i);
  if (fixed && fixed.index !== undefined && fixed[0] !== fixed[1]) return `${text.slice(0, fixed.index)}${amount}${text.slice(fixed.index + fixed[0].length)}`;
  const own = quick ? readOwnPart(text, quick) : null;
  if (own) return `${text.slice(0, own.mineAt[0])}${amount}${text.slice(own.mineAt[1])}`;
  return amountIn(text, amount);
}
export function withWallet(text: string, wallet: string, ctx: QuickContext) {
  const t = lower(text), w = walletsIn(t, ctx.wallets)[0];
  if (!w) return `${text.replace(/[.!]+$/, '')} pakai ${wallet}`;
  return `${text.slice(0, w.at)}${wallet}${text.slice(w.at + w.word.length)}`;
}
export const withDate = (text: string, date: string) => `${lower(text).replace(/[.!]+$/, '').replace(DATE_ANY, ' ').replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').trim()} ${date}`;
const NOTE_TAIL = /\s*,?\s*(?:catatan(?:nya)?|keterangan(?:nya)?|ket|note)\s*[:=]?\s+.*$/i;
export const withNote = (text: string, note: string) => `${text.replace(NOTE_TAIL, '').replace(/[.!]+$/, '').trim()}${note ? `, catatan: ${note}` : ''}`;
export const withCategory = (text: string, category: string) => `${lower(text).replace(/[.!]+$/, '').replace(/\s+(?:kategori|masuk kategori)\s+.+$/, '').trim()} kategori ${lower(category)}`;

export type DraftEdit = { text: string; did: string[]; save?: boolean; note?: string };
type Say = { amount: (rp: string) => string; wallet: (name: string) => string; date: (d: string) => string; category: (c: string) => string; note: (n: string) => string };

const LEAD = /^(?:(?:oke|ok|okey|iya|ya|eh|ehh|nah|terus|trus|btw|oh|hmm|salah|eh salah|sori|sorry|maaf)\s*,?\s+)+/;
const BACK = /^(?:oke\s+|ok\s+)?balik(?:\s+lagi)?(?:\s+ke\s+([\p{L}\s]+?))?\s*,\s*/u;
const AMOUNT_WORDS = /\b(?:ganti|ubah|jadiin|jadi(?:nya)?|bukan|salah|harusnya|seharusnya|koreksi|maksudnya|maksudku|bener(?:nya)?|benar|yang|yg|awal|tadi|nominal(?:nya)?|harga(?:nya)?|total(?:nya)?|cuma|sekalian|aslinya|beneran|kayaknya|eh)\b/g;
const WALLET_LEAD = /^(?:bukan\s+\p{L}+\s+)?(?:pakai|pake|pakek|pk|via|lewat|dari|masuk(?:\s+ke)?|ke|bayar(?:nya)?(?:\s+(?:pakai|pake|via|dari))?|dompet(?:nya)?|ganti\s+(?:ke|jadi)|jadi)?\s*/u;
const CANCEL_ITEM = /\b(?:hapus(?:in)?(?:\s+aja)?|gak jadi|ga jadi|nggak jadi|ngga jadi|gajadi|enggak jadi|jangan(?:\s+(?:dulu|dicatat|dicatet))?|batal(?:in|kan)?|skip|coret|buang)\b/;

/**
 * Changes to the card waiting, or null when the message is not (only) that. `t` is the message (lower case).
 */
export function readDraftEdit(message: string, pending: string, ctx: QuickContext, say: Say): DraftEdit | null {
  let t = lower(message).replace(/[!?]+$/g, '').replace(/\.$/, '').trim();
  const did: string[] = [], removed: string[] = [];
  let current = pending, save = false;
  t = t.replace(LEAD, '');
  const back = t.match(BACK); if (back) t = t.slice(back[0].length);
  const SAVE = /\s*,?\s*(?:(?:iya|ya|oke|ok)\s*,?\s*)?(?:simpan|simpen|save)(?:\s+(?:aja|ya|sekarang|semua))?\s*$/;
  if (SAVE.test(t)) { save = true; t = t.replace(SAVE, '').trim(); }
  if (!t) return null;
  const parts = t.split(/\s*[,.;]\s*|\s+(?:terus|trus|eh)\s+/).map(p => p.trim()).filter(Boolean);
  for (const raw of parts) {
    const part = unfill(raw);
    if (!part) continue;
    const { items, tail } = clausesOf(current);
    const many = items.length > 1;
    // Said only to set aside: "bukan hari ini", "buku tetep", "sisanya besok katanya", "bukan jago" (before the right one).
    if (/^bukan\s+(?:hari ini|kemarin|tadi)$/.test(part) || /^(?:[\p{L}]+(?:nya)?\s+)?(?:tetep|tetap)$/u.test(part)) continue;
    if (/^sisa(?:nya)?\s+(?:besok|nanti|lusa|minggu depan|bulan depan|nyusul|belakangan)(?:\s+katanya)?$/.test(part)) { did.push('sisanya belum dihitung sebagai uang diterima'); continue; }
    if (/^(?:bener|benar)(?:\s+(?:yang|yg))?(?:\s+(?:awal|pertama|tadi|sebelumnya))?$/.test(part)) continue;
    if (/^bukan\s+\p{L}+$/u.test(part) && walletsIn(part, ctx.wallets).length) continue;
    // A note: "catatannya lembur", "catatan: rapat divisi", "ganti catatannya jadi buat mama".
    const note = part.match(/^(?:tambah(?:in|kan)?\s+|ganti\s+|ubah\s+|kasih\s+)?(?:catatan(?:nya)?|keterangan(?:nya)?|ket|note)\s*(?:jadi\s+|:\s*|=\s*)?(.+)$/);
    if (note && !/^(?:apa|mana|nya)$/.test(note[1])) { const n = note[1].trim(), nice = n.charAt(0).toUpperCase() + n.slice(1); current = withNote(current, nice); did.push(say.note(nice)); continue; }
    if (/^(?:hapus|buang|kosongin|kosongkan)\s+(?:catatan|keterangan)(?:nya)?$/.test(part)) { current = withNote(current, ''); did.push('catatannya kuhapus'); continue; }
    // A day: "kemarin", "tanggalnya hari ini", "yang bensin kemarin", "tolnya kemarin".
    const date = part.match(new RegExp(String.raw`^(?:(?:yang|yg)\s+)?(?:([\p{L}]+?)(?:nya)?\s+)?(?:tanggal(?:nya)?\s+|harinya\s+|jadi\s+)?(${DATE})$`, 'u'));
    if (date) {
      const word = date[1] && !/^(?:tanggal|tanggalnya|hari|harinya|ganti|ubah|itu|yang|tadi|jadi)$/.test(date[1]) ? date[1] : '';
      const at = word ? itemAt(word, items) : -1;
      if (word && at < 0) return null;
      if (at >= 0 && many) { items[at] = { ...items[at], text: withDate(items[at].text, date[2]) }; current = join(items, tail); did.push(`${lower(word).replace(/nya$/, '')} ${say.date(date[2])}`); }
      else { current = withDate(current, date[2]); did.push(say.date(date[2])); }
      continue;
    }
    // An item dropped: "yang kedua hapus", "makan jangan dulu", "jajannya jangan dulu", "yang ketiga gak jadi".
    if (CANCEL_ITEM.test(part) && many) {
      const ord = part.match(/\b(?:yang|yg)\s+(pertama|kesatu|kedua|ketiga|keempat|kelima|keenam|terakhir)\b/);
      const word = part.replace(CANCEL_ITEM, ' ').replace(/\b(?:yang|yg|itu|beli|dulu|dicatat|aja|nggak|gak|ga|jadi)\b/g, ' ').trim().split(/\s+/)[0] || '';
      const at = ord ? (ord[1] === 'terakhir' ? items.length - 1 : ORDINAL[ord[1]] - 1) : itemAt(word, items);
      if ((at < 0 || at >= items.length) && removed.length && !word) continue;
      if (at < 0 || at >= items.length) return null;
      removed.push(items[at].text); current = join(items.filter((_, i) => i !== at), tail);
      continue;
    }
    // A wallet: "gopay", "pake cash", "masuk mandiri".
    const w = walletsIn(part, ctx.wallets)[0];
    if (w && part.replace(WALLET_LEAD, '').trim() === w.word) { current = withWallet(current, lower(w.name), ctx); did.push(say.wallet(w.name)); continue; }
    // An amount: "22rb", "nominalnya 32rb", "bener yang awal, 25rb", "kopi tadi jadi 25rb", "pulpennya 10rb", "es tehnya 6rb".
    const a = findAmounts(part).find(x => x.value > 0);
    if (a) {
      const rest = part.replace(a.text, ' ').replace(AMOUNT_WORDS, ' ').replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
      const words = rest ? rest.split(' ') : [];
      const hit = rest ? itemAt(words[words.length - 1], items) : -1;
      if (words.length && !(hit >= 0 && words.slice(0, -1).every(x => items.some(c => new RegExp(`\\b${esc(x)}`).test(lower(c.text)))))) return null;
      if (hit >= 0 && many) { items[hit] = { text: amountIn(items[hit].text, a.text.trim()), amount: a.value }; current = join(items, tail); did.push(`${words[words.length - 1].replace(/nya$/, '')} ${say.amount(rp(a.value))}`); }
      else { current = withAmount(current, a.text.trim(), ctx); did.push(say.amount(rp(a.value))); }
      continue;
    }
    // A category: "kategorinya jajan", "masukin hiburan", "yang ini masuk meeting".
    const cat = part.match(/^(?:(?:yang|yg)\s+ini\s+)?(?:kategori(?:nya)?|masuk(?:in|kan)?(?:\s+ke)?(?:\s+kategori)?|ganti kategori(?:nya)?(?:\s+(?:jadi|ke))?)\s+(.+)$/);
    if (cat && !walletsIn(cat[1], ctx.wallets).length) { current = withCategory(current, cat[1]); did.push(say.category(cat[1])); continue; }
    return null;
  }
  if (removed.length) did.unshift(`${removed.map(r => r.replace(/^(?:siapin|siapkan|beli|catat)\s+/i, '')).join(' dan ')} tidak jadi dicatat`);
  if (!did.length && !save) return null;
  return { text: current, did, save };
}

/** "susu 25rb, sabun 62rb" for a card of 87rb: the one purchase split into what was bought. */
export function readBreakdown(message: string, pending: string, ctx: QuickContext): string | null {
  const { items, tail } = clausesOf(pending);
  if (items.length !== 1) return null;
  const parts = clausesOf(lower(message));
  if (parts.items.length < 2 || parts.tail) return null;
  const sum = parts.items.reduce((n, c) => n + c.amount, 0);
  if (Math.abs(sum - items[0].amount) >= 1) return null;
  const lines = parts.items.map(c => { const a = findAmounts(lower(c.text)).find(x => x.value > 0)!; return `${a.text.trim()} buat ${lower(c.text).replace(a.text, ' ').replace(/\s+/g, ' ').trim()}`; });
  const base = items[0].text.replace(/\s*,?\s*(?:ada|isinya|isi|yaitu|berisi)\s+.*$/i, '');
  const kept = tail.split(/\s*,\s*/).filter(p => p && !/^(?:ada|isinya|isi|yaitu|berisi)\b/i.test(p)).join(', ');
  return [base, ...lines, kept].filter(Boolean).join(', ').replace(walletsIn(lower(message), ctx.wallets)[0]?.word || '\u0000', '');
}

/** A plan that already happened: "eh ternyata udah dibeli tadi, pake tunai" → the same purchase, today. */
export function readHappened(message: string, pending: string, ctx: QuickContext): string | null {
  const t = lower(message);
  if (!/\b(?:udah|sudah|dah|ternyata)\s+(?:ke)?(?:beli|dibeli|kebeli|kubeli|dibayar|bayar|kebayar)\b/.test(t)) return null;
  let text = lower(pending).replace(/\b(?:rencana|rencananya|pengen|pengin|pingin|ingin|mau|kayaknya|minggu depan|bulan depan|besok|lusa|nanti|deh)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/^(?:beli|bayar)\b/.test(text)) text = `beli ${text}`;
  const when = t.match(new RegExp(String.raw`\b(${DATE}|barusan)\b`))?.[1];
  text = `${text} ${when && when !== 'barusan' ? when : 'tadi'}`;
  const w = walletsIn(t, ctx.wallets)[0];
  if (w) text = `${text} pakai ${lower(w.name)}`;
  return text.replace(/\s+/g, ' ');
}

/** A discount on the card: "diskon 10rb", "dapet diskon 5rb" → the amount minus it. */
export function readDiscount(message: string, pending: string): { text: string; off: number; was: number } | null {
  const t = lower(message).replace(/[.!]+$/, '');
  const m = t.match(/^(?:dapet|dapat|ada|pakai|pake)?\s*(?:diskon|potongan|disc|promo)\s+((?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k)?)\s*(?:aja|ya|deh)?$/);
  if (!m) return null;
  const off = findAmounts(m[1].includes('rb') || m[1].includes('k') || /rp/.test(m[1]) ? m[1] : `${m[1]}rb`).find(x => x.value > 0)?.value || 0;
  const { items } = clausesOf(pending);
  if (items.length !== 1 || !off || off >= items[0].amount) return null;
  return { text: amountIn(pending, rp(items[0].amount - off).toLocaleLowerCase('id-ID')), off, was: items[0].amount };
}
