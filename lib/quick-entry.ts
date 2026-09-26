/**
 * "Ketik cepat": one line of everyday Indonesian becomes a transaction or a record.
 *   "beli pocari 8rb di alfa"          → Pengeluaran Rp8.000, Pocari, Alfamart, Makan & Minum
 *   "gaji 7,5jt masuk bca"             → Pemasukan Rp7.500.000 to BCA
 *   "tf 200rb dari bca ke gopay"       → Transfer
 *   "pinjam 500rb dari budi"           → Utang baru to Budi
 *   "bayar cicilan laptop 500rb"       → Bayar utang (the open debt "Cicilan laptop")
 *   "pinjemin andi 100rb" / "andi pinjam 100rb" / "bayarin andi makan 50rb" → Piutang baru (Andi)
 *   "andi bayar 50rb" / "terima 50rb dari andi"      → Piutang dibayar
 *   "klaim hotel 300rb" / "klaim cair 300rb"         → Klaim kantor baru / klaim cair
 *   "nabung 500rb ke dana darurat"                   → Isi target (tujuan dana), or a wish list item
 * Everything runs on the device. Categories are only picked from the user's own ones (never created):
 * first from earlier transactions with the same item or place, then from a category named in the text,
 * then from common words (kopi → a food & drink category, bensin → transport…).
 * The user can also pick the kind first (Keluar, Masuk, Transfer, Utang, Piutang, Klaim, Target).
 */
import type { Category, Claim, Debt, Fund, LedgerTx, Receivable, TxType, Wallet, WishItem } from './types';

export type QuickKind = 'expense' | 'income' | 'transfer' | 'debt_new' | 'debt_payment' | 'receivable_new' | 'receivable_payment' | 'claim_new' | 'claim_payment' | 'target' | 'wish';
export type QuickGroup = 'auto' | 'expense' | 'income' | 'transfer' | 'debt' | 'receivable' | 'claim' | 'target';
export const QUICK_GROUPS: [QuickGroup, string][] = [['auto', 'Otomatis'], ['expense', 'Keluar'], ['income', 'Masuk'], ['transfer', 'Transfer'], ['debt', 'Utang'], ['receivable', 'Piutang'], ['claim', 'Klaim'], ['target', 'Target']];
export const QUICK_LABELS: Record<QuickKind, string> = { expense: 'Pengeluaran', income: 'Pemasukan', transfer: 'Transfer', debt_new: 'Utang baru', debt_payment: 'Bayar utang', receivable_new: 'Piutang baru', receivable_payment: 'Piutang dibayar', claim_new: 'Klaim kantor baru', claim_payment: 'Klaim cair', target: 'Isi target', wish: 'Sisihkan untuk wish list' };
export const groupOf = (kind: QuickKind): Exclude<QuickGroup, 'auto'> => kind.startsWith('debt') ? 'debt' : kind.startsWith('receivable') ? 'receivable' : kind.startsWith('claim') ? 'claim' : kind === 'wish' ? 'target' : kind as 'expense' | 'income' | 'transfer' | 'target';

export type QuickResult = {
  kind: QuickKind; amount: number; date: string;
  /** Transaction fields (type, wallet, linked record…); for new records it carries the wallet, date and description. */
  preset: Partial<LedgerTx>;
  /** New debt: who lent the money. New receivable: who owes it. */
  person?: string;
  /** New debt or claim: its name. */
  name?: string;
  wishId?: string;
  /** Short notes of what was read (e.g. "kemarin", the category), for the preview. */
  understood: string[];
};
export type QuickContext = {
  wallets: Pick<Wallet, 'id' | 'name' | 'isArchived'>[];
  categories: Pick<Category, 'id' | 'name' | 'type' | 'parentId' | 'isArchived'>[];
  history: Pick<LedgerTx, 'type' | 'description' | 'merchant' | 'categoryId' | 'subcategoryId' | 'date'>[];
  today: string;
  debts?: Pick<Debt, 'id' | 'name' | 'provider' | 'outstandingAmount'>[];
  receivables?: (Pick<Receivable, 'id' | 'person' | 'description' | 'remainingAmount'> & { date?: string })[];
  claims?: Pick<Claim, 'id' | 'name' | 'remainingAmount'>[];
  funds?: Pick<Fund, 'id' | 'name' | 'isArchived' | 'linkedWalletId' | 'walletIds'>[];
  wishlist?: Pick<WishItem, 'id' | 'name' | 'status'>[];
};

const lower = (text: string) => text.toLocaleLowerCase('id-ID');
const title = (text: string) => text.split(' ').map(word => word ? word[0].toUpperCase() + word.slice(1) : word).join(' ');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordAt = (text: string, word: string) => { const m = text.match(new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, 'u')); return m ? (m.index ?? 0) + (m[0].length - word.length) : -1; };

/** "8rb", "8k", "8.000", "Rp 8.000", "1,5jt", "2 juta", "750" → rupiah. */
const AMOUNT = /(?:rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(rb|ribu|k|jt|juta|m|miliar)?\b/gi;
function readAmount(raw: string, unit = '') {
  const u = lower(unit);
  if (u) { const n = Number(raw.replace(/\./g, '').replace(',', '.')); const times = u === 'rb' || u === 'ribu' || u === 'k' ? 1e3 : u === 'jt' || u === 'juta' ? 1e6 : 1e9; return Math.round(n * times); }
  return Number(raw.replace(/[.,]/g, ''));
}

const INCOME_WORDS = /\b(gaji|gajian|terima|diterima|dapat|dapet|bonus|thr|cashback|refund|jual|hasil jual|masuk|dibayar|dikasih|transferan masuk)\b/;
const TRANSFER_WORDS = /\b(tf|transfer|pindah|pindahin|topup|top up|isi saldo)\b/;
const CLAIM_WORDS = /\b(klaim|claim|reimburse|reimbursement|reimburs|rembes|talangan kantor|talangin kantor|nalangin kantor)\b/;
const CLAIM_PAID = /\b(cair|dicairkan|diganti|dibayar|masuk|lunas)\b/;
const SAVE_WORDS = /\b(nabung|menabung|tabung|nyimpen|simpan|sisihkan|sisihin|nyisihin|setor|celengan)\b/;
const FILL_WORDS = /\b(isi|tambah|nambah|masukin|masukkan|top ?up)\b/;
const LEND_OUT = /\b(pinjemin|minjemin|pinjamin|minjamin|meminjamkan|minjemkan|talangin|nalangin|nalangi|talangi|bayarin|bayari|utangin|ngutangin|hutangin|ngehutangin)\b/;
const BORROW = /\b(pinjam|minjem|pinjem|minjam|meminjam|ngutang|ngehutang|berutang|berhutang|utang|hutang|dipinjemin|dipinjamin|dipinjami|kasbon|pinjaman)\b/;
const PAY = /\b(bayar|byr|cicil|nyicil|angsur|lunas|lunasin|lunasi|balikin|ngembaliin|kembaliin|mengembalikan|transfer|tf|kirim|ngirim)\b/;
const RECEIVE = /\b(terima|nerima|dapat|dapet|masuk)\b/;
const DEBT_WORDS = /\b(utang|hutang|cicilan|kredit|pinjaman|paylater|kartu kredit|angsuran)\b/;
const PAID_OFF = /\b(lunas|lunasin|lunasi|pelunasan)\b/;
const VERBS = /\b(beli|bayar|bayarin|byr|jajan|isi|gaji|terima|nerima|dapat|dapet|tf|transfer|pindah|pindahin|topup|top up|buat|untuk|utk|seharga|harga|total|habis|keluar|masuk|pinjam|minjem|pinjem|minjam|pinjemin|minjemin|pinjamin|talangin|nalangin|utangin|ngutangin|ngutang|utang|hutang|cicil|nyicil|lunas|lunasin|balikin|kembaliin|klaim|reimburse|nabung|tabung|sisihkan|sisihin|setor|cair|dibayar|dipinjemin|dipinjamin|kasbon)\b/g;
// Time of day is a filler ("tadi siang") except in a meal ("makan siang").
const FILLERS = /\b(tadi|td|barusan|hari ini|kemarin|kmrn|kmarin|(?<!makan )(?:pagi|siang|sore|malam)|dan|yang|yg|sama|ama|sm|aku|gue|gw|saya|ke|dari|dr|di|pakai|pake|via|nih|dong|ya|lagi|dulu|uang|duit)\b/g;
/** Words that are never somebody's name. */
const NOT_A_NAME = new Set(['aku', 'gue', 'gw', 'saya', 'dia', 'kantor', 'dari', 'ke', 'sama', 'ama', 'sm', 'buat', 'untuk', 'utk', 'di', 'pakai', 'pake', 'via', 'kemarin', 'kmrn', 'tadi', 'hari', 'ini', 'lalu', 'uang', 'duit', 'dulu', 'ya', 'nih', 'dong', 'lagi', 'yang', 'yg', 'dan', 'rp', 'tgl', 'tanggal', 'utang', 'hutang', 'pinjam', 'pinjaman', 'bayar', 'cicilan', 'makan', 'minum', 'beli']);

/** Common short names of places. */
const PLACES: Record<string, string> = { alfa: 'Alfamart', alfamart: 'Alfamart', alfamidi: 'Alfamidi', indo: 'Indomaret', indomaret: 'Indomaret', sbux: 'Starbucks', starbuck: 'Starbucks', starbucks: 'Starbucks', kfc: 'KFC', mcd: "McDonald's", mekdi: "McDonald's", hokben: 'HokBen', janjiw: 'Janji Jiwa', kenangan: 'Kopi Kenangan', tokped: 'Tokopedia', tokopedia: 'Tokopedia', shopee: 'Shopee', grab: 'Grab', gojek: 'Gojek', pertamina: 'Pertamina', spbu: 'SPBU', superindo: 'Superindo', hypermart: 'Hypermart', transmart: 'Transmart' };

/** Everyday words → words that usually appear in the name of the right category. */
const HINTS: [RegExp, string[]][] = [
  [/\b(makan|minum|kopi|coffee|teh|es|jus|susu|aqua|pocari|air mineral|snack|jajan|cemilan|roti|nasi|mie|bakso|sate|ayam|sarapan|lunch|dinner|gofood|grabfood|shopeefood)\b/, ['makan', 'minum', 'kuliner', 'jajan']],
  [/\b(bensin|pertalite|pertamax|solar|parkir|ojek|ojol|gojek|grab|taksi|taxi|tol|kereta|krl|mrt|busway|transjakarta|bus|angkot|pesawat|tiket)\b/, ['transport', 'kendaraan', 'bensin', 'perjalanan']],
  [/\b(pulsa|kuota|paket data|listrik|pln|token|air|pdam|internet|wifi|indihome|tagihan|bpjs)\b/, ['tagihan', 'utilitas', 'pulsa', 'listrik', 'internet']],
  [/\b(obat|dokter|klinik|apotek|rumah sakit|vitamin)\b/, ['kesehatan', 'obat']],
  [/\b(baju|celana|sepatu|tas|kaos|skincare|sabun|shampo|odol|detergen|tisu|belanja bulanan)\b/, ['belanja', 'kebutuhan', 'rumah tangga']],
  [/\b(netflix|spotify|youtube|film|bioskop|game|nonton|konser)\b/, ['hiburan', 'langganan']],
  [/\b(sedekah|infaq|infak|zakat|donasi|sumbangan)\b/, ['sedekah', 'donasi', 'zakat']],
  [/\b(gaji|gajian|thr)\b/, ['gaji']],
  [/\b(bonus|insentif)\b/, ['bonus', 'gaji']],
];

function dateFrom(text: string, today: string) {
  const base = new Date(`${today}T12:00:00`);
  const shift = (days: number) => { const d = new Date(base); d.setDate(d.getDate() - days); return d.toLocaleDateString('en-CA'); };
  if (/\b(kemarin|kmrn|kmarin)\b/.test(text)) return { date: shift(1), label: 'kemarin' };
  const ago = text.match(/\b(\d{1,2})\s*hari\s*(lalu|yang lalu|yg lalu)\b/); if (ago) return { date: shift(Number(ago[1])), label: `${ago[1]} hari lalu` };
  const day = text.match(/\b(?:tgl|tanggal)\s*(\d{1,2})\b/);
  if (day) { const n = Number(day[1]); const d = new Date(base); if (n > d.getDate()) d.setMonth(d.getMonth() - 1); d.setDate(Math.min(n, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return { date: d.toLocaleDateString('en-CA'), label: `tanggal ${n}` }; }
  return { date: today, label: '' };
}

/** A wallet named in the text ("pakai gopay", "dari bca"), matching whole words of its name. */
function walletsIn(text: string, wallets: QuickContext['wallets']) {
  const found: { id: string; name: string; at: number; word: string }[] = [];
  const aliases: Record<string, string[]> = { tunai: ['cash', 'kas'], cash: ['tunai'] };
  for (const w of wallets.filter(w => !w.isArchived)) {
    const name = lower(w.name), words = [name, ...name.split(/\s+/).filter(p => p.length >= 3), ...(aliases[name] || [])];
    let at = -1, hit = '';
    for (const word of words) { const i = wordAt(text, word); if (i >= 0 && (at < 0 || i < at)) { at = i; hit = word; } }
    if (at >= 0) found.push({ id: w.id, name: w.name, at, word: hit });
  }
  return found.sort((a, b) => a.at - b.at);
}

/** Generic words in record names count less than the specific ones ("cicilan" vs "laptop"). */
const GENERIC = new Set(['utang', 'hutang', 'cicilan', 'pinjaman', 'kredit', 'kartu', 'bank', 'dana', 'tabungan', 'klaim', 'kantor', 'target', 'untuk', 'buat', 'yang', 'dan', 'baru']);
/**
 * The record whose name words appear in the text: one clear winner, or none. Several records for the same
 * name (e.g. two loans to Andi) are not a real tie: the first one in `records` (the oldest) is taken.
 */
function bestMatch<T extends { id: string }>(text: string, records: T[], names: (record: T) => string[]) {
  let best: { record: T; score: number; words: string[]; key: string } | null = null, tie = false;
  for (const record of records) {
    const key = names(record).map(name => lower(name || '').trim()).join('|');
    const words = [...new Set(names(record).flatMap(name => lower(name || '').split(/[^\p{L}\p{N}]+/u)).filter(word => word.length >= 3))];
    const hits = words.filter(word => wordAt(text, word) >= 0);
    const score = hits.reduce((n, word) => n + (GENERIC.has(word) ? 1 : 3), 0);
    if (!score) continue;
    if (!best || score > best.score) { best = { record, score, words: hits, key }; tie = false; }
    else if (score === best.score && key !== best.key) tie = true;
  }
  return best && !tie ? best : null;
}

/** Somebody's name: the word right after a verb or "dari/ke/sama…", or before the verb when they are the subject. */
function personAfter(text: string, pattern: RegExp) {
  const m = text.match(pattern); if (!m) return '';
  const next = text.slice((m.index ?? 0) + m[0].length).trim().split(/\s+/);
  const word = next.find(w => w && !NOT_A_NAME.has(w) && !/\d/.test(w));
  return word && next.indexOf(word) <= 1 ? word : '';
}

/** `mode`: 'auto', a kind group picked on a chip (Utang, Piutang…), or an exact kind (e.g. 'receivable_payment'). */
export function parseQuickText(input: string, ctx: QuickContext, mode: QuickGroup | QuickKind = 'auto'): QuickResult | null {
  const group = mode as QuickGroup;
  const text = lower(input.trim()).replace(/\s+/g, ' ');
  if (!text) return null;
  const understood: string[] = [];

  // Amount: a number with a unit or "rp" wins; otherwise the biggest plain number that isn't a date.
  let amount = 0, amountText = '';
  const candidates = [...text.matchAll(AMOUNT)].filter(m => !/\b(tgl|tanggal)\s*$/.test(text.slice(0, m.index)) && !/^\s*hari/.test(text.slice((m.index ?? 0) + m[0].length)));
  const marked = candidates.find(m => m[2] || /rp/.test(m[0]));
  const pick = marked || candidates.map(m => ({ m, v: readAmount(m[1]) })).filter(x => x.v >= 100).sort((a, b) => b.v - a.v)[0]?.m;
  if (pick) { amount = readAmount(pick[1], pick[2]); amountText = pick[0]; }

  const wallets = walletsIn(text, ctx.wallets);
  const openDebts = (ctx.debts || []).filter(d => d.outstandingAmount > 0);
  const openReceivables = (ctx.receivables || []).filter(r => r.remainingAmount > 0).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const openClaims = (ctx.claims || []).filter(c => c.remainingAmount > 0);
  const debt = bestMatch(text, openDebts, d => [d.name, d.provider]);
  const receivable = bestMatch(text, openReceivables, r => [r.person]);
  const claim = bestMatch(text, openClaims, c => [c.name]);
  const fund = bestMatch(text, (ctx.funds || []).filter(f => !f.isArchived), f => [f.name]);
  const wish = bestMatch(text, (ctx.wishlist || []).filter(w => w.status === 'active'), w => [w.name]);
  const firstVerb = (pattern: RegExp) => { const m = text.match(pattern); return m ? m.index ?? 0 : -1; };
  /** The person is the one doing it: their name comes before the verb ("andi bayar", "andi pinjam"). */
  const subject = (words: string[], verb: RegExp) => { const v = firstVerb(verb); if (v < 0) return false; return words.some(word => { const i = wordAt(text, word); return i >= 0 && i < v; }); };

  // What kind of entry is it?
  let kind: QuickKind;
  const claimKind = (): QuickKind => CLAIM_PAID.test(text) ? 'claim_payment' : 'claim_new';
  const targetKind = (): QuickKind => fund || !wish ? 'target' : 'wish';
  const receivableKind = (): QuickKind => receivable && (subject(receivable.words, PAY) || RECEIVE.test(text) || PAID_OFF.test(text)) && !LEND_OUT.test(text) ? 'receivable_payment' : 'receivable_new';
  const debtKind = (): QuickKind => PAY.test(text) && (debt || DEBT_WORDS.test(text) || !BORROW.test(text)) && !/\b(dipinjemin|dipinjamin|dipinjami)\b/.test(text) ? 'debt_payment' : 'debt_new';
  if (mode in QUICK_LABELS) kind = mode as QuickKind;
  else if (group === 'expense' || group === 'income' || group === 'transfer') kind = group;
  else if (group === 'claim') kind = claimKind();
  else if (group === 'target') kind = targetKind();
  else if (group === 'receivable') kind = receivableKind();
  else if (group === 'debt') kind = debtKind();
  else if (CLAIM_WORDS.test(text)) kind = claimKind();
  else if (TRANSFER_WORDS.test(text) && wallets.length >= 2) kind = 'transfer';
  else if (SAVE_WORDS.test(text) || (fund || wish) && (FILL_WORDS.test(text) || /\b(ke|buat|untuk|utk)\b/.test(text) && !BORROW.test(text) && !PAY.test(text))) kind = targetKind();
  else if (LEND_OUT.test(text)) kind = 'receivable_new';
  else if (receivable && (subject(receivable.words, PAY) || RECEIVE.test(text) && /\b(dari|dr)\b/.test(text))) kind = 'receivable_payment';
  else if (PAY.test(text) && (debt || DEBT_WORDS.test(text))) kind = 'debt_payment';
  else if (BORROW.test(text)) {
    // "andi pinjam 100rb" → Andi owes me; "pinjam 100rb dari budi" / "dipinjemin budi" → I owe Budi.
    const before = text.slice(0, Math.max(0, firstVerb(BORROW))).trim().split(/\s+/).filter(w => w && !NOT_A_NAME.has(w) && !/\d/.test(w));
    kind = before.length && !/\b(dipinjemin|dipinjamin|dipinjami)\b/.test(text) ? 'receivable_new' : 'debt_new';
  }
  else if (INCOME_WORDS.test(text)) kind = 'income';
  else kind = 'expense';

  const when = dateFrom(text, ctx.today);
  if (when.label) understood.push(when.label);

  // "lunas" without a number: the whole remaining amount.
  if (!amount && (PAID_OFF.test(text) || kind === 'claim_payment')) {
    if (kind === 'debt_payment' && debt) amount = debt.record.outstandingAmount;
    if (kind === 'receivable_payment' && receivable) amount = receivable.record.remainingAmount;
    const oneClaim = claim?.record || (openClaims.length === 1 ? openClaims[0] : undefined);
    if (kind === 'claim_payment' && oneClaim) amount = oneClaim.remainingAmount;
  }
  if (!amount) return null;

  const type: TxType | null = kind === 'expense' || kind === 'income' || kind === 'transfer' ? kind : kind === 'debt_payment' ? 'debt_payment' : kind === 'receivable_payment' ? 'receivable_payment' : kind === 'claim_payment' ? 'claim_payment' : kind === 'target' ? 'fund_contribution' : null;
  const preset: Partial<LedgerTx> = type ? { type, amount } : {};
  preset.date = when.date;
  const result: QuickResult = { kind, amount, date: when.date, preset, understood };

  // Wallets: "dari bca ke gopay" for transfers; otherwise the wallet that was named.
  if (kind === 'transfer') {
    const from = text.match(/\bdari\s+(.+?)\s+ke\s+(.+)$/);
    const source = from ? walletsIn(from[1], ctx.wallets)[0] : wallets[0], target = from ? walletsIn(from[2], ctx.wallets)[0] : wallets[1];
    if (source) preset.walletId = source.id; if (target && target.id !== source?.id) preset.destinationWalletId = target.id;
  } else {
    // A wallet word that is really part of a record's name ("Dana Darurat" vs the wallet "Tabungan Darurat") doesn't count;
    // a wallet right after "dari / pake / via / masuk" wins.
    const taken = new Set([debt, receivable, claim, fund, wish].filter(Boolean).flatMap(match => match!.words));
    const named = wallets.filter(w => !taken.has(w.word));
    const cued = named.find(w => /\b(dari|dr|pakai|pake|pakek|pk|via|masuk|masuk ke|lewat)\s+$/.test(text.slice(0, w.at)));
    const chosen = cued || named[0];
    if (chosen) preset.walletId = chosen.id;
  }

  // What's left once the known parts are taken out is the item / description.
  let rest = ` ${text} `.replace(amountText.toLowerCase(), ' ');
  const place = kind === 'expense' || kind === 'income' ? rest.match(/\s(?:di|@|at)\s+([a-z0-9&'.\- ]+?)(?=\s(?:pakai|pake|pk|via|dari|ke|kemarin|kmrn|tadi|tgl|tanggal|seharga|harga|rp|\d)\b|\s*$)/) : null;
  if (place) {
    const raw = place[1].trim(), key = raw.replace(/\s+/g, '');
    const earlier = ctx.history.find(t => t.merchant && lower(t.merchant).replace(/\s+/g, '').startsWith(key));
    preset.merchant = PLACES[key] || earlier?.merchant || title(raw);
    rest = rest.replace(place[0], ' ');
  }
  for (const w of wallets) rest = rest.replace(new RegExp(`\\b(?:pakai|pake|pk|via|dari|ke|masuk|pakek)?\\s*${escape(w.word)}\\b`), ' ');
  const about = kind === 'debt_payment' ? debt : kind === 'receivable_payment' ? receivable : kind === 'claim_payment' ? claim : kind === 'target' ? fund : kind === 'wish' ? wish : kind === 'debt_new' ? debt : kind === 'receivable_new' ? receivable : null;
  const known = about?.words || [];

  if (kind === 'debt_new' || kind === 'receivable_new') {
    // Who: a known person if their name is in the text, otherwise the word next to the verb or "dari/ke/sama".
    const knownName = kind === 'debt_new' ? debt?.record.provider : receivable?.record.person;
    const person = knownName && known.some(word => wordAt(lower(knownName), word) >= 0) ? knownName
      : kind === 'debt_new' ? personAfter(text, /\b(dipinjemin|dipinjamin|dipinjami|dari|dr|sama|ama|sm|ke)\b/) || personAfter(text, BORROW)
      : personAfter(text, LEND_OUT) || personAfter(text, /\b(buat|untuk|utk|ke|sama|ama)\b/) || text.slice(0, Math.max(0, firstVerb(BORROW))).trim().split(/\s+/).find(w => w && !NOT_A_NAME.has(w) && !/\d/.test(w)) || '';
    result.person = person ? title(person) : '';
    if (person) rest = rest.replace(new RegExp(`\\b${escape(lower(person))}\\b`), ' ');
  }
  for (const word of known) rest = rest.replace(new RegExp(`\\b${escape(word)}\\b`, 'g'), ' ');
  rest = rest.replace(/\b\d{1,2}\s*hari\s*(lalu|yang lalu|yg lalu)\b|\b(tgl|tanggal)\s*\d{1,2}\b/g, ' ').replace(VERBS, ' ').replace(FILLERS, ' ')
    .replace(kind.startsWith('claim') ? /\b(kantor|reimbursement|claim)\b/g : /$^/, ' ').replace(/\b(pelunasan|lunasi|pinjaman|cicilan|angsuran|kredit|paylater|tabungan|target|wishlist|wish list)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const item = rest;

  if (kind === 'expense' || kind === 'income') { if (item) preset.description = title(item); else if (kind === 'income' && /\bgaji|gajian\b/.test(text)) preset.description = 'Gaji'; }
  if (kind === 'debt_new') { result.name = /\bkasbon\b/.test(text) ? title(`kasbon${item ? ` ${item}` : ''}`) : item ? title(item) : result.person ? `Pinjaman ${result.person}` : 'Pinjaman'; }
  if (kind === 'receivable_new' && item) preset.description = title(item);
  if (kind === 'claim_new') result.name = item ? title(item) : 'Klaim kantor';
  if (kind === 'debt_payment' && debt) { preset.debtId = debt.record.id; preset.description = `Bayar ${debt.record.name}`; }
  if (kind === 'receivable_payment' && receivable) { preset.receivableId = receivable.record.id; preset.description = `Dibayar ${receivable.record.person}`; }
  if (kind === 'claim_payment') { const one = claim?.record || (openClaims.length === 1 ? openClaims[0] : undefined); if (one) { preset.claimId = one.id; preset.description = `Klaim cair: ${one.name}`; } }
  if (kind === 'target' && fund) {
    const f = fund.record; preset.fundId = f.id; preset.description = `Isi ${f.name}`;
    const into = f.linkedWalletId || (f.walletIds?.length === 1 ? f.walletIds[0] : '');
    if (into) preset.destinationWalletId = into;
  }
  if (kind === 'wish' && wish) result.wishId = wish.record.id;

  // Category (spending and income only; debts/receivables use their own groups unless picked later).
  if (kind === 'expense' || kind === 'income') {
    const own = ctx.categories.filter(c => !c.isArchived && c.type === kind);
    const same = ctx.history.find(t => t.type === kind && t.categoryId && own.some(c => c.id === t.categoryId) && (item && lower(t.description || '') === item || preset.merchant && lower(t.merchant || '') === lower(preset.merchant)));
    const named = [...own].sort((a, b) => b.name.length - a.name.length).find(c => wordAt(text, lower(c.name)) >= 0);
    const hinted = !same && !named ? HINTS.find(([words]) => words.test(text)) : undefined;
    const byHint = hinted ? own.filter(c => !c.parentId).find(c => hinted[1].some(word => lower(c.name).includes(word))) : undefined;
    if (same) { preset.categoryId = same.categoryId; preset.subcategoryId = same.subcategoryId || null; }
    else if (named) { preset.categoryId = named.parentId || named.id; preset.subcategoryId = named.parentId ? named.id : null; }
    else if (byHint) { preset.categoryId = byHint.id; preset.subcategoryId = null; }
    const chosen = own.find(c => c.id === (preset.subcategoryId || preset.categoryId));
    if (chosen) understood.push(chosen.name);
  }
  return result;
}
