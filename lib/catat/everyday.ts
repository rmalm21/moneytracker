/**
 * Catat otomatis 7.9 — everyday sentences the grammar did not read as meant, from the training document
 * (Training_Chatbot_Dompet_Ajaib.pdf). Each is rewritten into a sentence the grammar already reads right, and what the
 * rewrite knows is kept to put on the card afterwards (lib/quick-plan.ts `applyEveryday`):
 *
 *   - amounts: "2jt 350rb" is one amount, "15ewu" is 15rb ("tuku" = beli), plain numbers in a list are thousands to confirm
 *     ("kopi 25, makan 30");
 *   - how many: "dua kopi @18rb", "nasgor 18rb tiga", "beras 2,5 kg, sekilo 16rb", "beli 3 gratis 1, 20rb per buah";
 *   - one price worked out: a discount with a cap ("diskon 20% maksimal 30rb"), discounts one after another, several
 *     percentages in order (diskon, service, pajak), a price that already includes tax;
 *   - what is not money out (yet): a cashback still to come, the cash handed over ("kasih 50rb": only the change comes
 *     back), the rest of a price still to be paid in instalments ("DP 2jt, sisanya nyicil"), an item left out ("tapi
 *     parkirnya jangan dulu");
 *   - one purchase paid two ways ("150rb, tunai 50rb sisanya Jago"), an instalment's principal and interest, a refund for
 *     a returned item, spending the office pays back, the office paying a claim, money from a person ("Dika transfer
 *     100rb", "mama kirim 200rb", "tagihan Dika 100rb, baru bayar 40rb");
 *   - the person's own note ("…, catatannya lembur"), a category they name ("masukin Hiburan aja"), a budget raised by an
 *     amount ("naikin 300rb"), several items paid at once ("bayarnya barengan").
 */
import { findAmounts, walletsIn, type QuickContext } from '../quick-entry.ts';
import { conceptWords, suggestCategory } from '../categorize.ts';
import { compileLanguagePack } from './language.ts';

export type Everyday = {
  text: string; trace: string[];
  /** Added to the notes of every entry made. */ notes: string[];
  /** The arithmetic, shown as "Hitungan" on the one entry. */ calc?: string;
  /** Plain numbers read as thousands (to confirm), in order. */ inferred?: number[];
  /** "naikin 300rb": the budget goes up by this much. */ budgetAdd?: number;
  /** "bayarnya barengan": the items are one entry. */ merge?: boolean;
  /** The person's own note. */ note?: string;
  /** Two ways of paying that do not add up to the total. */ warn?: string;
  /** The wallet paid with, put on the one shared bill (written apart, it would split the sentence). */ wallet?: string;
};

const lower = (s: string) => s.toLocaleLowerCase('id-ID');
const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
/** An amount as the grammar reads it without doubt. */
const amt = (n: number) => rp(n).toLocaleLowerCase('id-ID');
const AMT = String.raw`(?:rp\.?\s*)?\d+(?:[.,]\d+)*\s*(?:rb|ribu|rebu|k|jt|juta)\b`;
const PCT = String.raw`(\d+(?:[.,]\d+)?)\s*(?:%|persen)`;
const value = (s: string) => findAmounts(lower(s)).find(a => a.value > 0)?.value || 0;
const num = (s: string) => Number(s.replace(',', '.'));
const WORDS: Record<string, number> = { satu: 1, se: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11, 'dua belas': 12, selusin: 12 };
const NUMBER_WORD = String.raw`(?:satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas)`;
const countOf = (s: string) => /^\d+$/.test(s) ? Number(s) : WORDS[s] || 0;
const FAMILY = String.raw`(?:mama|mamah|mami|papa|papah|papi|ibu|ibuk|bapak|ayah|bunda|ortu|orang tua|kakak|kak|abang|adik|adek|om|tante|nenek|kakek|mertua|pacar|suami|istri|bude|pakde|bulek|paklek)`;
/** Words that are never a person's name at the start of a sentence. */
const NOT_NAME = /^(?:aku|gue|gw|gua|saya|kamu|lo|lu|dia|kita|kami|mereka|tadi|kemarin|besok|lusa|udah|sudah|baru|terus|trus|eh|oke|ok|ya|iya|nggak|gak|ga|belum|mau|bayar|beli|transfer|tf|kirim|uang|duit|saldo|total|harga|budget|anggaran|tagihan|cicilan|gaji|bonus|kantor|bos|klien|client|toko|bank|atm|yang|ini|itu|semua|sisa|sisanya|tolong|catat|cuma|aja|dp|nanti|ntar|entar|huft|hufft|berapa|brp|batalin|batal|hapus|ubah|ganti|cancel|kalau|kalo|klo|misal|abis|habis|terakhir|pas|waktu|jadi|harus|sekarang|minggu|bulan|tahun|hari|pagi|siang|sore|malam|yuk|ayo|wah|duh|aduh|hmm|oh|nah|lah|kok|sih|emang|langsung|sambil|lagi|tetap|tetep|bisa|boleh|coba|minta|pernah|biasanya|selalu|kadang|setiap|tiap|orang|temen|teman|kawan|atasan|pak|bu|mas|mbak|mba|bang|akhirnya|katanya|sekalian|barusan|buruan|cepet|udahan)$/;
/** A word that is someone's name: a person in the records, family, or a word that is no everyday word at all. */
let known: Set<string> | null = null;
function looksLikeName(w: string, ctx: QuickContext) {
  const people = new Set([...(ctx.receivables || []).map(r => lower(r.person || '')), ...(ctx.debts || []).map(d => lower(d.provider || ''))].filter(Boolean));
  if (people.has(w) || new RegExp(`^${FAMILY}$`).test(w)) return true;
  known ??= new Set([...conceptWords(), ...compileLanguagePack().variants.keys()]);
  return /^\p{L}{3,12}$/u.test(w) && !NOT_NAME.test(w) && !/nya$/.test(w) && !known.has(w) && !walletsIn(w, ctx.wallets).length && !suggestCategory({ text: w, item: w, amount: 20000, type: 'expense' }, { categories: ctx.categories, history: [] });
}

export function readEveryday(input: string, ctx: QuickContext): Everyday | null {
  // A full stop at the end says nothing (the sentence is compared without it at the end, so nothing changes for it alone).
  let t = lower(input.trim()).replace(/\s+/g, ' ').replace(/[.!]+$/, '').trim();
  const out: Everyday = { text: '', trace: [], notes: [] }, raw = t;
  const said = (what: string) => out.trace.push(`7.9 sehari-hari: ${what}`);
  const isWallet = (w: string) => walletsIn(lower(w), ctx.wallets).length > 0;

  // The person's own note at the end: "…, catatannya lembur", "… ket: meeting klien".
  const noted = t.match(/(?:\s*[,.;]\s*|\s+)(?:dengan\s+)?(?:catatan(?:nya)?|keterangan(?:nya)?|ket|note)\s*[:=]?\s+(?!\d)(.{2,80}?)\s*[.!]?$/);
  if (noted && noted.index && findAmounts(t.slice(0, noted.index)).some(a => a.value > 0)) {
    const note = noted[1].replace(/^(?:nya|ya)\s+/, '').trim();
    out.note = note.charAt(0).toUpperCase() + note.slice(1); t = t.slice(0, noted.index).trim(); said(`catatan “${out.note}”`);
  }
  // Javanese: "tuku sego 15ewu" = beli nasi 15rb.
  if (/\d\s*(?:ewu|rewu|ewon)\b|\b(?:tuku|tumbas)\s+\p{L}/u.test(t)) { t = t.replace(/(\d)\s*(?:ewu|rewu|ewon)\b/g, '$1rb').replace(/\b(?:tuku|tumbas)\s+(?=\p{L})/gu, 'beli '); said('bahasa Jawa: ewu = ribu, tuku = beli'); }
  // One amount in two parts: "2jt 350rb", "1 juta 200 ribu".
  t = t.replace(/\b(\d+(?:[.,]\d+)?)\s*(jt|juta)\s+(?:lebih\s+)?(\d{1,3})\s*(rb|ribu|rebu|k)\b/g, (m, a: string, _u: string, b: string) => { const n = Math.round(num(a) * 1e6) + Number(b) * 1e3; said(`“${m}” = ${rp(n)}`); return amt(n); });

  // An item left out: "…, tapi parkirnya jangan dulu", "tapi donatnya jangan dicatat".
  const leave = t.match(/[,.]?\s*tapi\s+(\p{L}+?)(?:nya)?\s+(?:jangan|jgn|gak usah|nggak usah|ga usah|gausah|ga|gak|nggak|tidak)\s*(?:dulu|dicatat|dicatet|usah|deh|ya)?\s*$/u);
  if (leave && leave.index) {
    const item = leave[1], head = t.slice(0, leave.index);
    const parts = head.split(/(\s*,\s*|\s+(?:sama|dan|terus|trus|plus)\s+)/);
    const at = parts.findIndex((p, i) => i % 2 === 0 && new RegExp(`\\b${item}`).test(p));
    if (at >= 0 && parts.filter((_, i) => i % 2 === 0).length > 1) {
      const kept = parts.filter((_, i) => i !== at && i !== (at > 0 ? at - 1 : at + 1));
      t = kept.join('').trim(); said(`“${item}” tidak dicatat`); out.notes.push(`${item.charAt(0).toUpperCase() + item.slice(1)} belum dicatat`);
    }
  }
  // A category named: "kopi 30rb, masukin Hiburan aja" → "… kategori hiburan".
  // 8.2 — a whole word only ("pemasukan bulan ini berapa" is a question, not "masukan …"), after something recorded.
  t = t.replace(/[,.]?\s*(?<![\p{L}])(?:masukin|masukkan|masukan|taruh|taro)\s+(?:ke\s+)?(?:kategori\s+)?([\p{L}&][\p{L}&\s]{1,30}?)(?:\s+(?:aja|saja|ya|deh|dong))*\s*$/u, (m, c: string, at: number) => {
    if (!findAmounts(t.slice(0, at)).some(a => a.value > 0) || /\b(?:berapa|brp|apa|kapan|siapa)\b/.test(c)) return m;
    if (isWallet(c) || !ctx.categories.some(k => lower(k.name).includes(c.trim()) || c.trim().split(' ').some(w => w.length > 3 && lower(k.name).includes(w)))) return m;
    said(`kategori “${c.trim()}”`); return ` kategori ${c.trim()}`;
  });
  // The cash handed over: "beli nasi 23rb, kasih 50rb" → only 23rb went out, 27rb came back.
  const handed = t.match(new RegExp(String.raw`^(.*?(${AMT}).*?)\s*,?\s*(?:kasih|ngasih|bayar(?:nya)?\s+(?:pake|pakai|pakek)|uang(?:nya)?|duit(?:nya)?|nyerahin)\s+(${AMT})\s*$`));
  if (handed) { const price = value(handed[2]), paid = value(handed[3]); if (paid > price && price > 0 && findAmounts(handed[1]).length === 1) { t = handed[1].trim(); out.notes.push(`Dibayar ${rp(paid)}, kembalian ${rp(paid - price)}`); said(`uang diberikan ${rp(paid)}, kembalian ${rp(paid - price)}`); } }
  // A cashback still to come is not money in: "belanja 100rb, nanti cashback 10rb".
  const later = /\b(?:nanti|katanya|bakal|akan|besok|dijanjikan|menyusul|belum masuk)\b/;
  t = t.replace(new RegExp(String.raw`\s*[,.]?\s*((?:nanti|katanya|bakal|akan|besok|dijanjikan)\s+)?(?:(?:dapet|dapat|ada)\s+)?cashback(?:nya)?\s+(${AMT})(\s+(?:nanti|besok|menyusul|katanya))?`), (m, pre?: string, a?: string, post?: string) => {
    if (!pre && !post && !later.test(t)) return m;
    const rest = t.replace(m, ' ');
    if (!findAmounts(rest).some(x => x.value > 0)) return m;
    out.notes.push(`Cashback ${rp(value(a!))} belum diterima`); said(`cashback ${rp(value(a!))} belum masuk, tidak dicatat`); return '';
  });
  // A returned item's refund: only the refund is new money ("belanja 200rb, satu barang dibalikin, refund 50rb ke Jago").
  const refund = t.match(new RegExp(String.raw`\b(?:refund|pengembalian dana)(?:nya)?\s+(${AMT})(.*)$`));
  if (refund && /\b(dibalikin|diretur|retur|dikembalikan|dikembaliin|balikin barang|barangnya rusak|cancel|dicancel|batal)\b/.test(t) && findAmounts(t).length > 1) {
    const where = refund[2].replace(/^\s*(?:ke|masuk(?:\s+ke)?)\s+/, ' masuk ').replace(/[,.].*$/, '');
    t = `refund ${refund[1]}${where}`.trim(); said('barang dikembalikan: yang dicatat hanya refund-nya'); out.notes.push('Refund barang yang dikembalikan');
  } else t = t.replace(new RegExp(String.raw`\b(refund\s+${AMT})\s+ke\s+`), '$1 masuk ');
  // Spending the office pays back is a claim: "bayar makan meeting 180rb dari jago, nanti diganti kantor".
  const back = t.match(/\s*[,.]?\s*(?:nanti\s+|bakal\s+|mau\s+|akan\s+)?(?:diganti|digantiin|direimburse|di-reimburse|direimbursement|diklaim|ditanggung)\s+(?:sama\s+|oleh\s+)?(?:kantor|perusahaan|bos|atasan|kantor nanti)\b.*$/);
  if (back && back.index && findAmounts(t.slice(0, back.index)).some(a => a.value > 0) && !/\bklaim\b/.test(t.slice(0, back.index))) { t = `klaim ${t.slice(0, back.index).replace(/^(?:bayar|beli)\s+/, '')}`.trim(); said('nanti diganti kantor: klaim kantor'); }
  // The office paying a claim: "kantor baru ganti 150rb dari klaim 180rb", "kantor udah transfer klaim 200rb, dari total 250rb".
  const paidBack = t.match(new RegExp(String.raw`^(?:kantor|perusahaan|hrd|finance)\s+(?:baru\s+|udah\s+|sudah\s+|akhirnya\s+)*(?:ganti|gantiin|transfer|bayar|cairin|cair|nyairin)\s+(?:klaim(?:nya)?\s+)?(${AMT})(?:\s*,?\s*(?:dari|dr)\s+(?:total\s+)?(?:klaim\s+)?(${AMT}))?(.*)$`));
  if (paidBack) { const a = value(paidBack[1]), total = paidBack[2] ? value(paidBack[2]) : 0; t = `klaim cair ${amt(a)}${paidBack[3] || ''}`.trim(); if (total > a) out.notes.push(`Sisa klaim ${rp(total - a)} belum cair`); said(`klaim cair ${rp(a)}`); }
  // A down payment: only it is paid now ("laptop 8jt, dp 2jt dari mandiri, sisanya nyicil").
  const dp = t.match(new RegExp(String.raw`^(.*?)\s*(${AMT})\s*,?\s*(?:dp|uang muka|down payment)(?:nya)?\s+(${AMT})(.*?)\s*,?\s*(?:sisanya|sisa(?:nya)?|kekurangannya)\s+(?:nyicil|dicicil|cicil|kredit|dikredit|nanti|belakangan|nyusul|menyusul|dilunasi nanti|bayar nanti|ngutang)\b.*$`));
  if (dp) { const price = value(dp[2]), down = value(dp[3]); if (price > down) { t = `dp ${dp[1].trim()} ${amt(down)}${dp[4]}`.replace(/\s+/g, ' ').trim(); out.notes.push(`DP dari harga ${rp(price)}, sisa ${rp(price - down)} belum dibayar`); said(`DP ${rp(down)}; sisa ${rp(price - down)} belum terjadi`); } }
  // An instalment: principal and interest ("bayar cicilan 450rb, pokok 400rb bunga 50rb").
  const inst = t.match(new RegExp(String.raw`^((?:bayar\s+)?(?:cicilan|angsuran)(?:nya)?(?:\s+\p{L}+)?)\s+(${AMT})\s*,?\s*(?:pokok(?:nya)?)\s+(${AMT})\s*,?\s*(?:dan\s+|sama\s+|\+\s*)?(?:bunga(?:nya)?)\s+(${AMT})(.*)$`, 'u'));
  if (inst) { const total = value(inst[2]), a = value(inst[3]), b = value(inst[4]); if (Math.abs(a + b - total) < 1) { t = `${inst[1]} ${amt(a)}${inst[5]}, bunga pinjaman ${amt(b)}${inst[5]}`; said(`cicilan ${rp(total)} = pokok ${rp(a)} + bunga ${rp(b)}`); } }

  // One purchase paid two ways: "belanja 150rb, tunai 50rb sisanya jago", "300rb, 100rb pake cash sisanya gopay".
  const PAYER = String.raw`(?:(?:pake|pakai|pakek|via|dari|lewat)\s+)?([\p{L}]+(?:\s[\p{L}]+)?)`;
  const two = t.match(new RegExp(String.raw`^(?:total\s+)?(.*?)\s*(${AMT})\s*,?\s*(?:(?:${PAYER})\s+(${AMT})|(${AMT})\s+${PAYER})\s*,?\s*(?:dan\s+)?(?:sisanya|sisa(?:nya)?|kekurangannya)\s+${PAYER}\s*$`, 'u'));
  if (two) {
    const desc = two[1].replace(/^(?:total\s+)/, '').trim() || 'belanja', total = value(two[2]);
    const w1 = two[3] || two[6], a = value(two[4] || two[5]), w2 = two[7];
    if (isWallet(w1) && isWallet(w2) && a < total) { t = `${desc} ${amt(a)} pakai ${w1}, ${desc} ${amt(total - a)} pakai ${w2}`; out.notes.push(`Dibayar dua cara, total ${rp(total)}`); said(`dibayar dua cara: ${rp(a)} + ${rp(total - a)}`); }
  } else {
    // "total belanja 150rb, tunai 50rb, jago 80rb": each way paid is its own entry; a gap is pointed out, never filled in.
    const m = t.match(new RegExp(String.raw`^(?:total\s+)?(.*?)\s*(${AMT})\s*,\s*(.+)$`, 'u'));
    if (m) {
      const pairs = m[3].split(/\s*,\s*|\s+(?:dan|sama)\s+/).map(p => p.match(new RegExp(String.raw`^${PAYER}\s+(${AMT})$|^(${AMT})\s+${PAYER}$`, 'u'))).filter(Boolean) as RegExpMatchArray[];
      const ways = pairs.map(p => ({ w: p[1] || p[4], a: value(p[2] || p[3]) }));
      if (pairs.length >= 2 && pairs.length === m[3].split(/\s*,\s*|\s+(?:dan|sama)\s+/).length && ways.every(x => isWallet(x.w))) {
        const total = value(m[2]), sum = ways.reduce((n, x) => n + x.a, 0), desc = m[1].trim() || 'belanja';
        t = ways.map(x => `${desc} ${amt(x.a)} pakai ${x.w}`).join(', ');
        if (Math.abs(sum - total) >= 1) { out.warn = `Total ${rp(total)}, tapi yang dibayar ${rp(sum)} (beda ${rp(Math.abs(total - sum))}). Ada diskon, cara bayar lain, atau nominal yang salah?`; said(out.warn); }
        else { out.notes.push(`Dibayar ${ways.length} cara, total ${rp(total)}`); said(`dibayar ${ways.length} cara`); }
      }
    }
  }

  // A price that already includes tax: the price stays.
  t = t.replace(/\s*,?\s*(?:harga(?:nya)?\s+)?(?:udah|sudah|dah)?\s*(?:termasuk|include|incl\.?|including)\s+(pajak|ppn|tax|pb1|service)(?:\s+(\d+(?:[.,]\d+)?)\s*(?:%|persen))?\s*,?/, (_m, what: string, p?: string) => { out.notes.push(`Sudah termasuk ${what}${p ? ` ${p}%` : ''}`); said(`harga sudah termasuk ${what}`); return ' '; }).replace(/^\s*,\s*/, '').trim();
  // Discounts and charges worked out into one price, in the order written (a single plain "diskon 20%" stays with V4).
  const MOD_A = new RegExp(String.raw`\b(diskon|disc|potongan|pajak|ppn|tax|pb1|service charge|service|servis)\s+${PCT}(?:\s*(?:maks(?:imal)?|max(?:imal)?|maksimum|s\.?d\.?|sampai|hingga|paling banyak)\s*(${AMT}))?`, 'g');
  const MOD_B = new RegExp(String.raw`\b(?:terus|trus|lalu|tambah|ditambah|plus)\s+(?:diskon\s+)?(?:lagi\s+)?${PCT}`, 'g');
  const modA = [...t.matchAll(MOD_A)].map(m => ({ at: m.index!, end: m.index! + m[0].length, kind: m[1], pct: num(m[2]), cap: m[3] ? value(m[3]) : 0 }));
  const modB = [...t.matchAll(MOD_B)].map(m => ({ at: m.index!, end: m.index! + m[0].length, kind: '', pct: num(m[1]), cap: 0 })).filter(b => !modA.some(a => a.at >= b.at && a.at < b.end));
  const mods = [...modA, ...modB].sort((a, b) => a.at - b.at);
  if (mods.length >= 2 || mods.some(m => m.cap)) {
    const amounts = findAmounts(t).filter(a => a.value > 0 && !mods.some(m => a.index >= m.at && a.index < m.end));
    const named = t.match(new RegExp(String.raw`(?:dari|untuk|buat)\s+(?:belanja(?:nya)?|total|harga)?\s*(${AMT})`));
    const basis = named ? value(named[1]) : amounts[0]?.value || 0;
    if (basis) {
      let total = basis, kind = 'diskon', afterDiscount = basis;
      const compound = /\b(?:setelah|sesudah)\b/.test(t);
      const steps: string[] = [];
      for (const m of mods) {
        kind = m.kind ? lower(m.kind) : kind;
        if (/^(?:diskon|disc|potongan)$/.test(kind)) { let d = total * m.pct / 100; if (m.cap && d > m.cap) { d = m.cap; steps.push(`− diskon ${m.pct}% (maks ${rp(m.cap)})`); } else steps.push(`− ${m.pct}%`); total -= d; afterDiscount = total; }
        // Service and tax are both taken from the price after discounts, unless one is "setelah" the other.
        else { total += (compound ? total : afterDiscount) * m.pct / 100; steps.push(`+ ${kind} ${m.pct}%`); }
      }
      total = Math.round(total);
      const first = Math.min(mods[0].at, amounts[0]?.index ?? Infinity);
      const lead = t.slice(0, first).replace(/\b(?:subtotal|total|harga(?:nya)?)\b/g, ' ').replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
      const leftover = t.replace(new RegExp(AMT, 'g'), ' ').replace(/\d+(?:[.,]\d+)?\s*(?:%|persen)/g, ' ').replace(/\b(?:diskon|disc|potongan|pajak|ppn|tax|pb1|service|servis|charge|maks(?:imal)?|max(?:imal)?|maksimum|setelah|sebelum|terus|trus|lalu|lagi|dari|untuk|buat|belanja(?:nya)?|subtotal|total|harga(?:nya)?|bayar|pake|pakai|via|jadi|berapa)\b/g, ' ').replace(/[,.?]/g, ' ').replace(/\s+/g, ' ').trim();
      const wallet = walletsIn(t, ctx.wallets)[0];
      const desc = (lead || leftover.split(' ').filter(w => !wallet || w !== wallet.word).join(' ') || 'belanja').trim();
      t = `${desc} ${amt(total)}${wallet ? ` pakai ${wallet.word}` : ''}`; out.calc = `${rp(basis)} ${steps.join(' ')} = ${rp(total)}`; said(`dihitung: ${out.calc}`);
    }
  }

  // How many: "dua kopi @18rb" → 2 kopi @18rb; "nasgor 18rb tiga, es teh 5rb dua" → 3 nasgor @18rb, 2 es teh @5rb.
  t = t.replace(new RegExp(String.raw`\b(${NUMBER_WORD})\s+(?=\p{L}[\p{L}\s]*@)`, 'gu'), (_m, w: string) => `${WORDS[w]} `);
  t = t.split(/(\s*,\s*)/).map(part => part.replace(new RegExp(String.raw`^(\p{L}[\p{L}\s]*?)\s+(${AMT})\s+(${NUMBER_WORD}|\d{1,2})$`, 'u'), (m, item: string, price: string, n: string) => {
    const c = countOf(n); if (c < 2 || /\b(?:hari|jam|bulan|minggu|orang)\b/.test(m)) return m;
    said(`${c} × ${item.trim()} @${price.trim()}`); return `${c} ${item.trim()} @${price.trim()}`;
  })).join('');
  // A weighed price: "beras 2,5 kg, sekilo 16rb" = 40rb.
  t = t.replace(new RegExp(String.raw`^(.*?\p{L})\s+(\d+(?:[.,]\d+)?)\s*(kg|kilo|liter|ltr|l)\b\s*,?\s*(?:sekilo|per\s?kilo|per\s?kg|\/kg|seliter|per\s?liter|\/l|@|harga(?:nya)?\s+(?:sekilo|per\s?kilo|seliter)?)\s*(${AMT})`, 'u'), (m, item: string, q: string, unit: string, price: string) => {
    const n = num(q) * value(price); if (!n) return m;
    out.calc = `${q.replace('.', ',')} ${unit} × ${rp(value(price))} = ${rp(n)}`; said(out.calc); return `${item} ${amt(n)}`;
  });
  // Buy N get M free: "beli 3 gratis 1, harga 20rb per buah" = 3 × 20rb.
  t = t.replace(new RegExp(String.raw`^(.*?)\b(\d+|${NUMBER_WORD})\s+(?:gratis|free|bonus)\s+(\d+|${NUMBER_WORD})\s*,?\s*(?:harga(?:nya)?\s+|@\s*|satuan(?:nya)?\s+)?(${AMT})\s*(?:per\s?(?:buah|biji|pcs|item)|satuan(?:nya)?|sebiji|\/pcs|each)?`, 'u'), (m, lead: string, n: string, free: string, price: string) => {
    const c = countOf(n), f = countOf(free), unit = value(price); if (!c || !unit) return m;
    out.calc = `${c} × ${rp(unit)} = ${rp(c * unit)} (gratis ${f}, harga per buah ${rp(c * unit / (c + f))})`; said(out.calc);
    return `${lead.trim() || 'beli'} promo ${c} gratis ${f} ${amt(c * unit)}`.replace(/\s+/g, ' ');
  });

  // Plain numbers in a list are thousands, to confirm: "kopi 25, makan 30", "kopi 20 roti 15 parkir 3 tunai tadi", "makan 50".
  if (!findAmounts(t).some(a => a.marked)) {
    const pairs = [...t.matchAll(/(\p{L}[\p{L}\s]*?)\s+(\d{1,3})(?!\s*(?:%|x\b|kali|orang|org|porsi|hari|jam|kg|gram|gr|liter|ml|biji|buah|pcs|lembar|botol|gelas|bungkus|ribu|rb|k\b|jt|juta|\.\d|,\d))/gu)];
    const items = pairs.map(p => ({ words: p[1].trim().replace(/^(?:dan|sama|terus|trus|,)\s+/, ''), n: Number(p[2]) }));
    const knownItem = (w: string) => Boolean(suggestCategory({ text: w, item: w, amount: 20000, type: 'expense' }, { categories: ctx.categories, history: [] }));
    const rest = t.replace(/(\p{L}[\p{L}\s]*?)\s+(\d{1,3})\b/gu, ' ').replace(/[,.]/g, ' ').trim();
    const restOk = !rest || rest.split(/\s+/).every(w => isWallet(w) || /^(?:tadi|kemarin|kemaren|pagi|siang|sore|malam|semalam|semalem|hari|ini|pake|pakai|bayar|cash|tunai|aja|ya|dong|deh)$/.test(w));
    if (items.length && restOk && items.every(x => x.n > 0 && x.n < 100 && !walletsIn(x.words, ctx.wallets).length && knownItem(x.words.split(' ').slice(-2).join(' ')) && !/\b(?:jam|tanggal|tgl|meja|kamar|nomor|no|umur|lantai)\b/.test(x.words)) && items.some(x => x.n >= 10) && (items.length > 1 || /\b(?:makan|sarapan|nasi|nasgor|kopi|ngopi|teh|esteh|minum|jajan|bensin|parkir|ojek|ojol|gojek|grab|bakso|mie|sate|soto|roti|gorengan|snack|pulsa|tol|laundry)\b/.test(items[0].words))) {
      out.inferred = items.map(x => x.n);
      let i = 0;
      t = t.replace(/(\p{L}[\p{L}\s]*?)\s+(\d{1,3})\b/gu, (_m, w: string, n: string) => `${i++ ? ', ' : ''}${w.trim().replace(/^(?:dan|sama|,)\s+/, '')} ${n}rb`).replace(/,\s*,/g, ',');
      said(`angka tanpa satuan dibaca ribuan (dicek): ${items.map(x => `${x.n} → ${rp(x.n * 1000)}`).join(', ')}`);
    }
  }

  // Money from a person: "dika transfer 100rb" (in), "mama kirim 200rb", "dika udah bayar", "dika nyicil 50rb".
  const from = t.match(new RegExp(String.raw`^(?:si\s+)?(${FAMILY}|\p{L}{3,})\s+(?:udah\s+|sudah\s+|baru\s+|tadi\s+|barusan\s+|akhirnya\s+)*(transfer|transferin|tf|ngirim|kirim|kirimin|ngasih|kasih|bayar|nyicil|cicil|ngembaliin)\b(?!\s+(?:ke|buat|untuk|bayar)\b)(.*)$`, 'u'));
  if (from && looksLikeName(from[1], ctx) && (!/\d/.test(from[3]) || findAmounts(from[3]).some(a => a.marked))) {
    const who = from[1], verb = from[2], rest = from[3].trim(), family = new RegExp(`^${FAMILY}$`).test(who);
    const owes = (ctx.receivables || []).some(r => lower(r.person) === who && r.remainingAmount > 0);
    if (/^balik\b/.test(rest) || /^(?:bayar|nyicil|cicil|ngembaliin)$/.test(verb) && !family) { if (!owes) { t = `${who} balikin ${rest.replace(/^balik\s*/, '')}`.trim(); said(`${who} membayar: piutang dibayar`); } }
    else if (!owes && rest) { t = `dapat ${family ? 'kiriman' : 'transferan'} ${rest} dari ${who}`.replace(/\s+/g, ' ').trim(); said(`${who} mengirim uang: uang masuk`); }
  }
  // "tagihan dika 100rb, baru bayar 40rb", "dika masih utang 150rb, hari ini bayar 50rb".
  const owed = t.match(new RegExp(String.raw`^(?:(?:tagihan|tagihannya|utang|utangnya|hutang)\s+(\p{L}{3,})\s+(${AMT})|(\p{L}{3,})\s+(?:masih\s+)?(?:utang|hutang|ngutang|punya utang)\s+(${AMT}))\s*,?\s*(?:dia\s+)?(?:hari ini\s+|tadi\s+|barusan\s+|baru\s+|udah\s+|sudah\s+)*(?:bayar|nyicil|cicil|transfer|balikin|ngasih|lunasin|ngembaliin)\s+(${AMT})(.*)$`, 'u'));
  if (owed) {
    const who = owed[1] || owed[3], total = value(owed[2] || owed[4]), a = value(owed[5]);
    if (looksLikeName(who, ctx) && a <= total) { t = `${who} balikin ${amt(a)}${owed[6] || ''}`.trim(); if (total > a) out.notes.push(`Sisa piutang ${rp(total - a)}`); said(`${who} membayar ${rp(a)} dari ${rp(total)}`); }
  }

  // A budget raised by an amount ("budget makan naikin 200rb"), not to it ("naikin jadi 1,4jt").
  if (/\b(?:budget|anggaran|bujet)\b/.test(t) && /\b(?:naik(?:in|kan)?|tambah(?:in|kan|i)?|nambah(?:in)?)\b/.test(t) && !/\bjadi\b/.test(t)) {
    const a = value(t); if (a) { out.budgetAdd = a; said(`anggaran naik ${rp(a)}`); }
  }
  // Several items paid at once: one entry.
  if (/\bbayar(?:nya)?\s+(?:barengan|bareng|sekalian|jadi satu|sekaligus)\b|\bsekali bayar\b/.test(t)) { out.merge = true; t = t.replace(/\s*,?\s*bayar(?:nya)?\s+(?:barengan|bareng|sekalian|jadi satu|sekaligus)\b/, ' bayar').replace(/\s+bayar\s*$/, ''); said('dibayar sekaligus: satu catatan'); }
  // "bill 180rb. gue 80rb, dika 60rb, bimo 40rb. gue bayar semua dari jago": one shared bill, paid by you from Jago.
  t = t.replace(new RegExp(String.raw`^(.*?${AMT})\s*[.,]\s+((?:gue|gw|aku|saya)\s+(?:bayar\s+)?${AMT}.*?)[.,]\s*(?:gue|gw|aku|saya)\s+(?:yang\s+)?(?:bayar(?:in)?|nalangin|talangin)\s+(?:semua(?:nya)?|duluan|dulu)?\s*(?:pake|pakai|dari|via)\s+(\p{L}+)\s*$`, 'u'), (m, head: string, parts: string, w: string) => {
    if (!isWallet(w)) return m;
    out.wallet = w; said(`satu tagihan dibagi, kamu bayar semua pakai ${w}`); return `${head}, ${parts}`;
  });
  // Shared without names. "… termasuk gue" is counted already ("bagi rata berempat" = you and three others).
  t = t.replace(/\s*,?\s*termasuk\s+(?:gue|gw|aku|saya|aku juga)\b/, '');
  const GROUP: Record<string, number> = { berdua: 2, bertiga: 3, berempat: 4, berlima: 5, berenam: 6, bertujuh: 7, berdelapan: 8 };
  const countPeople = (w: string) => GROUP[w] || countOf(w);
  // "makan 200rb bagi rata ke empat teman, gue nggak ikut": they owe it all; your part is nothing.
  const without = t.match(new RegExp(String.raw`^(.*?)\s*(${AMT})\s*,?\s*(?:di)?bagi(?:\s+rata)?\s+(?:ke|buat|untuk|sama)\s+(\d+|${NUMBER_WORD})\s+(?:teman|temen|orang|kawan|anak)\b.*?\b(?:gue|gw|aku|saya)\s+(?:nggak|gak|ga|tidak|ngga|enggak)\s+(?:ikut|termasuk|makan|join)\b.*$`, 'u'));
  if (without) {
    const total = value(without[2]), n = countOf(without[3]);
    if (total && n >= 2) { t = `teman ngutang ${amt(total)}`; out.notes.push(`${without[1].trim() ? `${without[1].trim().charAt(0).toUpperCase() + without[1].trim().slice(1)} ` : ''}${rp(total)} dibagi rata ${n} teman (${rp(Math.ceil(total / n))}/orang), kamu tidak ikut`); said(`dibagi ${n} teman, bagianmu nol: semuanya piutang`); }
  }
  // "gue bayar 600rb buat berempat, bagi rata": you paid it all; your part is spent, theirs is owed to you.
  const paidAll = t.match(new RegExp(String.raw`^(?:(.*?)\s*,?\s*)?(?:gue|gw|aku|saya)\s+(?:yang\s+)?(?:bayar(?:in)?|nalangin|talangin|traktir(?:in)?)\s+(?:(.*?)\s+)?(${AMT})\s+(?:buat|untuk|utk)\s+(berdua|bertiga|berempat|berlima|berenam|bertujuh|berdelapan|(?:\d+|${NUMBER_WORD})\s+orang)\s*,?\s*(?:di)?(?:bagi\s+rata|patungan|split|bagi\s+\d+)?\s*(.*)$`, 'u'));
  if (paidAll && !/traktir/.test(paidAll[0])) {
    const total = value(paidAll[3]), n = countPeople(paidAll[4].replace(/\s+orang$/, ''));
    if (total && n >= 2) {
      const mine = Math.floor(total / n), rest = total - mine, desc = [paidAll[1], paidAll[2]].filter(Boolean).join(' ').trim() || 'patungan';
      t = `${desc} ${amt(mine)} ${paidAll[5] || ''}, teman ngutang ${amt(rest)}`.replace(/\s+/g, ' ').replace(/\s+,/, ',').trim();
      out.notes.push(`Kamu bayar ${rp(total)} untuk ${n} orang: bagianmu ${rp(mine)}, bagian ${n - 1} teman ${rp(rest)}`); out.calc = `${rp(total)} ÷ ${n} = ${rp(mine)}`;
      said(`kamu bayar ${rp(total)} untuk ${n} orang: bagianmu ${rp(mine)}, piutang ${rp(rest)}`);
    }
  }

  out.text = t.replace(/^(?:harga(?:nya)?|total)?\s*,\s*/, '').replace(/\s+/g, ' ').replace(/\s+,/g, ',').replace(/[.!]+$/, '').trim();
  if (out.text === raw && !out.note && !out.notes.length && !out.calc && !out.inferred && out.budgetAdd === undefined && !out.merge && !out.warn && !out.wallet) return null;
  return out;
}
