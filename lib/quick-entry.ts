/**
 * "Ketik cepat": one line of everyday Indonesian becomes a filled-in transaction form.
 *   "beli pocari 8rb di alfa"          → Pengeluaran Rp8.000, Pocari, Alfamart, Makan & Minum
 *   "gaji 7,5jt masuk bca"             → Pemasukan Rp7.500.000 to BCA
 *   "tf 200rb dari bca ke gopay"       → Transfer
 *   "parkir 5000 kemarin pake tunai"   → yesterday, paid from Tunai
 * Everything runs on the device. Categories are only picked from the user's own ones (never created):
 * first from earlier transactions with the same item or place, then from a category named in the text,
 * then from common words (kopi → a food & drink category, bensin → transport…).
 */
import type { Category, LedgerTx, TxType, Wallet } from './types';

export type QuickResult = { preset: Partial<LedgerTx>; understood: string[] };
type Context = { wallets: Pick<Wallet, 'id' | 'name' | 'isArchived'>[]; categories: Pick<Category, 'id' | 'name' | 'type' | 'parentId' | 'isArchived'>[]; history: Pick<LedgerTx, 'type' | 'description' | 'merchant' | 'categoryId' | 'subcategoryId' | 'date'>[]; today: string };

const lower = (text: string) => text.toLocaleLowerCase('id-ID');
const title = (text: string) => text.split(' ').map(word => word ? word[0].toUpperCase() + word.slice(1) : word).join(' ');

/** "8rb", "8k", "8.000", "Rp 8.000", "1,5jt", "2 juta", "750" → rupiah. */
const AMOUNT = /(?:rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(rb|ribu|k|jt|juta|m|miliar)?\b/gi;
function readAmount(raw: string, unit = '') {
  const u = lower(unit);
  if (u) { const n = Number(raw.replace(/\./g, '').replace(',', '.')); const times = u === 'rb' || u === 'ribu' || u === 'k' ? 1e3 : u === 'jt' || u === 'juta' ? 1e6 : 1e9; return Math.round(n * times); }
  return Number(raw.replace(/[.,]/g, ''));
}

const INCOME_WORDS = /\b(gaji|gajian|terima|diterima|dapat|dapet|bonus|thr|cashback|refund|jual|hasil jual|masuk|dibayar|dikasih|transferan masuk)\b/;
const TRANSFER_WORDS = /\b(tf|transfer|pindah|pindahin|topup|top up|isi saldo)\b/;
const VERBS = /\b(beli|bayar|bayarin|jajan|belanja|makan|minum|isi|gaji|terima|dapat|dapet|tf|transfer|pindah|pindahin|topup|top up|buat|untuk|utk|seharga|harga|total|habis|keluar|masuk)\b/g;
const FILLERS = /\b(tadi|td|barusan|hari ini|kemarin|kmrn|kmarin|lusa|pagi|siang|sore|malam|dan|yang|yg|sama|aku|gue|gw|saya)\b/g;

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
function walletsIn(text: string, wallets: Context['wallets']) {
  const found: { id: string; name: string; at: number }[] = [];
  const aliases: Record<string, string[]> = { tunai: ['cash', 'kas', 'dompet'], cash: ['tunai'] };
  for (const w of wallets.filter(w => !w.isArchived)) {
    const name = lower(w.name), words = [name, ...name.split(/\s+/).filter(p => p.length >= 3), ...(aliases[name] || [])];
    let at = -1;
    for (const word of words) { const m = text.match(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)); if (m && (at < 0 || (m.index ?? 0) < at)) at = m.index ?? 0; }
    if (at >= 0) found.push({ id: w.id, name: w.name, at });
  }
  return found.sort((a, b) => a.at - b.at);
}

export function parseQuickText(input: string, ctx: Context): QuickResult | null {
  const text = lower(input.trim()).replace(/\s+/g, ' ');
  if (!text) return null;
  const understood: string[] = [];

  // Amount: a number with a unit or "rp" wins; otherwise the biggest plain number that isn't a date.
  let amount = 0, amountText = '';
  const candidates = [...text.matchAll(AMOUNT)].filter(m => !/\b(tgl|tanggal)\s*$/.test(text.slice(0, m.index)) && !/^\s*hari/.test(text.slice((m.index ?? 0) + m[0].length)));
  const marked = candidates.find(m => m[2] || /rp/.test(m[0]));
  const pick = marked || candidates.map(m => ({ m, v: readAmount(m[1]) })).filter(x => x.v >= 100).sort((a, b) => b.v - a.v)[0]?.m;
  if (pick) { amount = readAmount(pick[1], pick[2]); amountText = pick[0]; }
  if (!amount) return null;

  const wallets = walletsIn(text, ctx.wallets);
  const type: TxType = TRANSFER_WORDS.test(text) && wallets.length >= 2 ? 'transfer' : INCOME_WORDS.test(text) ? 'income' : 'expense';
  const preset: Partial<LedgerTx> = { type, amount };

  const when = dateFrom(text, ctx.today); preset.date = when.date; if (when.label) understood.push(when.label);

  if (type === 'transfer') {
    const from = text.match(/\bdari\s+(.+?)\s+ke\s+(.+)$/);
    const source = from ? walletsIn(from[1], ctx.wallets)[0] : wallets[0], target = from ? walletsIn(from[2], ctx.wallets)[0] : wallets[1];
    if (source) preset.walletId = source.id; if (target && target.id !== source?.id) preset.destinationWalletId = target.id;
  } else if (wallets.length) preset.walletId = wallets[0].id;

  // Place: the words after "di" / "@" (until the next known part), expanded from common short names or earlier places.
  let rest = ` ${text} `.replace(amountText.toLowerCase(), ' ');
  const place = rest.match(/\s(?:di|@|at)\s+([a-z0-9&'.\- ]+?)(?=\s(?:pakai|pake|pk|via|dari|ke|kemarin|kmrn|tadi|tgl|tanggal|seharga|harga|rp|\d)\b|\s*$)/);
  if (place && type !== 'transfer') {
    const raw = place[1].trim(), key = raw.replace(/\s+/g, '');
    const earlier = ctx.history.find(t => t.merchant && lower(t.merchant).replace(/\s+/g, '').startsWith(key));
    preset.merchant = PLACES[key] || earlier?.merchant || title(raw);
    rest = rest.replace(place[0], ' ');
  }
  for (const w of wallets) rest = rest.replace(new RegExp(`\\b(?:pakai|pake|pk|via|dari|ke|masuk|pakek)?\\s*${lower(w.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), ' ');
  rest = rest.replace(/\b(pakai|pake|pk|via|dari|ke|masuk|pakek)\s*$/, ' ');
  rest = rest.replace(/\b\d{1,2}\s*hari\s*(lalu|yang lalu|yg lalu)\b|\b(tgl|tanggal)\s*\d{1,2}\b/g, ' ').replace(VERBS, ' ').replace(FILLERS, ' ').replace(/\s+/g, ' ').trim();
  const item = rest.replace(/^(di|ke|dari|pakai|pake|via)\s+/, '').trim();
  if (item && type !== 'transfer') preset.description = title(item);
  else if (type === 'income' && /\bgaji|gajian\b/.test(text)) preset.description = 'Gaji';

  // Category: earlier transactions with the same item or place, a category named in the text, then common words.
  if (type !== 'transfer') {
    const kind = type === 'income' ? 'income' : 'expense';
    const own = ctx.categories.filter(c => !c.isArchived && c.type === kind);
    const same = ctx.history.find(t => t.type === type && t.categoryId && own.some(c => c.id === t.categoryId) && (item && lower(t.description || '') === item || preset.merchant && lower(t.merchant || '') === lower(preset.merchant)));
    const named = [...own].sort((a, b) => b.name.length - a.name.length).find(c => new RegExp(`\\b${lower(c.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text));
    const hinted = !same && !named ? HINTS.find(([words]) => words.test(text)) : undefined;
    const byHint = hinted ? own.filter(c => !c.parentId).find(c => hinted[1].some(word => lower(c.name).includes(word))) : undefined;
    if (same) { preset.categoryId = same.categoryId; preset.subcategoryId = same.subcategoryId || null; }
    else if (named) { preset.categoryId = named.parentId || named.id; preset.subcategoryId = named.parentId ? named.id : null; }
    else if (byHint) { preset.categoryId = byHint.id; preset.subcategoryId = null; }
    const chosen = own.find(c => c.id === (preset.subcategoryId || preset.categoryId));
    if (chosen) understood.push(chosen.name);
  }
  return { preset, understood };
}
