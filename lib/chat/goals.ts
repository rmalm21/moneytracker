/**
 * 10.0 Asisten 3.0 — what the person wants to set up, however it is written ("budgeting baru", "bikin anggaran",
 * "create new budget", "set limit jajan 500rb", "nambah rekening", "pengen mulai nabung", "patungan sama temen"…).
 *
 * Something to create (an anggaran, a dompet, a tujuan dana, a jadwal rutin, a kategori, a wish list item) is asked for
 * in the chat, one detail at a time with choices, and ends as the usual card to save (the same sentence Catat otomatis
 * reads: «anggaran jajan 500rb», «dompet baru seabank saldo 2jt», «tujuan dana motor 15jt»…). Every question also has a
 * button to the full form. Nothing is saved without a tap. A feature to use (Split Bill, Impor mutasi, Scan struk, PIN,
 * Tampilan) is explained with a button to it, and "atur keuangan dari nol" gets first steps from the person's records.
 *
 * `readGoal` reads a new message; `continueGoal` reads the answer to the question just asked (`GoalFlow` in the chat's
 * memory). Both return a `GoalStep` that the engine turns into a reply.
 */
import { findAmounts } from '../quick-entry.ts';
import type { Data } from '../types';
import { vo } from './fun.ts';
import type { Voice } from './voice.ts';

export type GoalKind = 'budget' | 'wallet' | 'fund' | 'recurring' | 'category' | 'wish' | 'split';
/** The question just asked and what is known so far. */
export type GoalFlow = {
  /** The card this flow put up ("anggaran jajan 300rb"): once it is saved or dropped, the flow is over. */ card?: string;
  kind: GoalKind;
  asking: 'category' | 'amount' | 'name' | 'balance' | 'item' | 'schedule' | 'purpose' | 'target' | 'monthly' | 'people';
  slots: { category?: string; amount?: string; name?: string; balance?: string; item?: string; purpose?: string; target?: string; targetValue?: number };
};
export type GoalOpen = { view: string; label: string; target?: string };
export type GoalStep = {
  text: string; title?: string; chips?: string[]; open?: GoalOpen; steps?: string[];
  /** A sentence for Catat otomatis: the card to save. */ plan?: string;
  /** The question left open: the next message is read as its answer. */ flow?: GoalFlow;
  /** The person dropped what was being set up. */ cancelled?: boolean;
  tone?: 'good' | 'warn' | 'info';
};
type GoalData = Pick<Data, 'categories' | 'transactions' | 'wallets' | 'funds' | 'budgets'>;

const rpText = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
/** 1500000 → "1,5jt", 450000 → "450rb": how a person would type it (and Catat otomatis reads it). */
export const shortAmount = (n: number) => n >= 1e6 ? `${(Math.round(n / 1e5) / 10).toLocaleString('id-ID')}jt` : `${Math.round(n / 1e3)}rb`;
const roundNice = (n: number) => n >= 2e6 ? Math.round(n / 25e4) * 25e4 : n >= 5e5 ? Math.round(n / 5e4) * 5e4 : Math.max(5e4, Math.round(n / 25e3) * 25e3);

/* ---------------------------------------------------------------- words */
const CREATE = /\b(?:baru|bikin|buat|buatin|buatkan|bikinin|membuat|set|setting|setel|atur|aturin|pasang|kasih|tambah|tambahin|tambahkan|nambah|create|new|make|add|ad|mau|pengen|pengin|pingin|ingin|mulai|siapin|siapkan|bantu)\b/;
/** A question about something that exists, not a wish to make one ("anggaran makan masih aman?"). */
const ASKING = /\b(?:berapa|brp|brapa|brapah|berapaan|brpa|progres|progress|kekumpul|terkumpul)\b/;
const STATUS = /\b(?:berapa|brp|sisa|masih|msh|aman|cek|lihat|liat|status|kepake|kepakai|terpakai|habis|abis|lewat|over|udah|sudah)\b|\?/;
const BUDGET_WORD = /\b(?:anggaran|anggarin|anggarkan|budget|budgeting|budgetin|bujet|ngebudget|budgeting|limit|ngelimit|batas|batasan|batasin|batasi|membatasi|plafon|ngerem|ngeremin|rem)\b|\bjatah\s+(?:bulanan|per\s+bulan|sebulan)\b/;
const WALLET_WORD = /\b(?:dompet|rekening|wallet|e-?wallet|ewallet|akun\s+bank|account|rek)\b/;
const FUND_WORD = /\b(?:tabungan|nabung|menabung|celengan|celengin|tujuan\s+dana|saving|savings|nyisihin|nyisihkan|menyisihkan|sisihin|sisihkan)\b|\btarget\s+(?:tabungan|nabung|dana)\b|\b(?:ngumpulin|ngumpulkan|mengumpulkan|kumpulin|nyimpen|nyimpan)\s+uang\b/;
const RECUR_WORD = /\b(?:jadwal\s+rutin|rutin|tagihan\s+bulanan|tagihan\s+rutin|autodebet|auto\s*debet|otomatis\s+tiap|bayar\s+bulanan)\b/;
const CANCEL = /\b(?:ga|gak|nggak|ngga|enggak|g|tidak|gk)\s*jadi\b|\bgajadi\b|\bbatal(?:in|kan)?\b|\bcancel\b|\bga\s*usah\b|\bgausah\b|\bnggak\s+usah\b|\bgak\s+usah\b|\bskip\b|\bnanti\s+aja\b|\blain\s+kali\b/;
const SUGGEST_ASK = /\b(?:enaknya|idealnya|bagusnya|sebaiknya|baiknya|saranin|sarannya|rekomendasi|biasanya|wajarnya|cocoknya)\b|\bberapa\s+(?:ya|sih|enaknya|bagusnya)\b/;

/** Words people use for a category, and the word put in the card (Catat otomatis knows it). */
const CATEGORY_WORDS: [RegExp, string][] = [
  [/\b(?:jajan|jajanan|ngemil|cemilan|camilan|snack|snacks)\b/, 'jajan'],
  [/\b(?:kopi|ngopi|coffee|boba)\b/, 'kopi'],
  [/\b(?:makan|makanan|maem|mamam|food|meals?)\b/, 'makan'],
  [/\b(?:transport|transportasi|transportation)\b/, 'transportasi'],
  [/\b(?:ojek|ojol)\b/, 'ojek'], [/\bbensin\b/, 'bensin'], [/\bparkir\b/, 'parkir'],
  [/\b(?:belanja|shopping)\b/, 'belanja'], [/\b(?:hiburan|nongkrong|hangout|entertainment)\b/, 'nongkrong'],
  [/\b(?:tagihan|bills?)\b/, 'tagihan'], [/\b(?:langganan|streaming|subscription)\b/, 'langganan'],
  [/\b(?:kesehatan|obat|dokter|health)\b/, 'kesehatan'], [/\b(?:pendidikan|kuliah|sekolah|kursus)\b/, 'pendidikan'],
  [/\b(?:kos|kost|kosan|sewa)\b/, 'kos'], [/\b(?:skincare|perawatan)\b/, 'skincare'], [/\b(?:pulsa|kuota|paket\s+data)\b/, 'pulsa'],
  [/\b(?:listrik|token)\b/, 'listrik'], [/\binternet|wifi\b/, 'internet'], [/\b(?:sedekah|donasi|amal)\b/, 'sedekah'],
  [/\b(?:liburan|travel|jalan-jalan)\b/, 'liburan'], [/\b(?:gym|olahraga|fitness)\b/, 'gym'], [/\b(?:game|gaming|topup|top\s+up)\b/, 'game'],
];
/** The category word in a message: the usual words first, then any category of the person's own. */
export function categoryWord(t: string, data: Pick<Data, 'categories'>): string | undefined {
  for (const [re, word] of CATEGORY_WORDS) if (re.test(t)) return word;
  const own = data.categories.filter(c => !c.isArchived && c.type === 'expense').map(c => c.name.toLowerCase()).sort((a, b) => b.length - a.length);
  return own.find(name => name.length >= 3 && t.includes(name));
}
/** How much a category word has cost a month lately (the last three months), for a budget's suggested limit. */
export function usualMonthly(word: string, data: Pick<Data, 'categories' | 'transactions'>, today: string): number {
  const ids = new Set(data.categories.filter(c => c.name.toLowerCase().includes(word) || word.includes(c.name.toLowerCase().split(/[\s&/]+/)[0])).flatMap(c => [c.id, ...data.categories.filter(s => s.parentId === c.id).map(s => s.id)]));
  if (word === 'transportasi') for (const c of data.categories) if (/transport/i.test(c.name)) { ids.add(c.id); for (const s of data.categories) if (s.parentId === c.id) ids.add(s.id); }
  if (!ids.size) return 0;
  const from = new Date(`${today}T00:00:00Z`); from.setUTCDate(from.getUTCDate() - 90);
  const start = from.toISOString().slice(0, 10);
  let total = 0, first = today;
  for (const x of data.transactions) {
    if (x.type !== 'expense' || x.date < start || x.date > today) continue;
    if (!ids.has(x.subcategoryId || '') && !ids.has(x.categoryId || '')) continue;
    total += x.amount; if (x.date < first) first = x.date;
  }
  const days = Math.max(30, Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${first}T00:00:00Z`).getTime()) / 864e5) + 1);
  return total ? total / days * 30 : 0;
}
const amountIn = (t: string) => findAmounts(t).filter(a => a.value > 0)[0];
/** "buat beli motor" → "motor", "untuk umroh" → "umroh", "namanya seabank" → "seabank". */
function nameIn(t: string) {
  return t.replace(/\b(?:namanya|nama|judulnya|buat|untuk|utk|for|beli|membeli|biar\s+bisa|pengen|mau|ya|aja|saja|dong|deh|nih|sih|kok|yang|yg|tabungan|nabung|target|tujuan\s+dana|dompet|rekening|kategori|baru)\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
}
const BANKS = ['bca', 'bni', 'bri', 'mandiri', 'seabank', 'jago', 'dana', 'ovo', 'gopay', 'shopeepay', 'jenius', 'blu', 'krom', 'neo', 'allo', 'cimb', 'permata', 'btn', 'linkaja', 'flip', 'superbank', 'bsi', 'danamon', 'maybank', 'ocbc', 'uob', 'line bank', 'raya', 'tmrw'];
const bankIn = (t: string) => BANKS.find(b => new RegExp(`\\b${b}\\b`).test(t));
const PEOPLE: [RegExp, number][] = [[/\bberdua\b/, 2], [/\bbertiga\b/, 3], [/\bberempat\b/, 4], [/\bberlima\b/, 5], [/\bberenam\b/, 6], [/\bbertujuh\b/, 7], [/\bberdelapan\b/, 8]];
function peopleIn(t: string) { for (const [re, n] of PEOPLE) if (re.test(t)) return n; const m = t.match(/\b(\d{1,2})\s*(?:orang|org|people)\b/); return m ? Number(m[1]) : 0; }

/* ---------------------------------------------------------------- what to ask */
const OPEN: Record<GoalKind, GoalOpen> = {
  budget: { view: 'budgets', label: 'Buka form Anggaran', target: 'new' },
  wallet: { view: 'wallets', label: 'Buka form Dompet', target: 'new' },
  fund: { view: 'funds', label: 'Buka form Tujuan dana', target: 'new' },
  recurring: { view: 'recurring', label: 'Buka form Jadwal rutin', target: 'new' },
  category: { view: 'categories', label: 'Buka Kategori', target: 'new' },
  wish: { view: 'wishlist', label: 'Buka Wish list' },
  split: { view: 'splitbill', label: 'Buka Split Bill', target: 'new' },
};
/** The categories most spent on this pay cycle that have no budget yet: the choices for "buat kategori apa?". */
function budgetChoices(data: GoalData, today: string) {
  const budgeted = new Set(data.budgets.map(b => b.categoryId));
  const from = new Date(`${today}T00:00:00Z`); from.setUTCDate(from.getUTCDate() - 30);
  const start = from.toISOString().slice(0, 10), by = new Map<string, number>();
  for (const x of data.transactions) if (x.type === 'expense' && x.date >= start && x.date <= today) { const id = x.subcategoryId || x.categoryId; if (id) by.set(id, (by.get(id) || 0) + x.amount); }
  const words: string[] = [];
  for (const [id] of [...by.entries()].sort((a, b) => b[1] - a[1])) {
    const c = data.categories.find(x => x.id === id); if (!c || budgeted.has(c.id) || budgeted.has(c.parentId || '')) continue;
    const word = categoryWord(c.name.toLowerCase(), data) || c.name.toLowerCase();
    if (!words.includes(word)) words.push(word); if (words.length >= 4) break;
  }
  for (const w of ['makan', 'jajan', 'transportasi', 'belanja', 'kopi']) { if (words.length >= 5) break; if (!words.includes(w)) words.push(w); }
  return words.slice(0, 5);
}
function amountChoices(usual: number) {
  if (!usual) return ['500rb', '1jt', '1,5jt'];
  const a = roundNice(usual * 0.9), b = roundNice(usual), c = roundNice(usual * 1.15);
  return [...new Set([a, b, c])].map(shortAmount);
}
const label = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

function askBudgetCategory(v: Voice, data: GoalData, today: string): GoalStep {
  return { title: 'Anggaran baru', text: vo(v, {
    santai: 'Oke, kita bikin anggaran baru. Buat kategori apa? Pilih atau tulis sendiri.',
    sopan: 'Baik, saya bantu membuat anggaran baru. Untuk kategori apa?',
    singkat: 'Anggaran baru. Kategori apa?',
    gaul: 'Siap, bikin anggaran baru. Buat kategori apa nih?',
    barbar: 'Gas, anggaran baru biar lo nggak jebol. Buat kategori apaan?',
  }), chips: budgetChoices(data, today), open: OPEN.budget, flow: { kind: 'budget', asking: 'category', slots: {} } };
}
function askBudgetAmount(v: Voice, word: string, data: GoalData, today: string): GoalStep {
  const usual = usualMonthly(word, data, today), seen = usual ? ` Biasanya ${word} habis sekitar ${rpText(roundNice(usual))} sebulan.` : '';
  return { title: `Anggaran ${label(word)}`, text: vo(v, {
    santai: `Anggaran ${word}, sip.${seen} Batasnya berapa per bulan?`,
    sopan: `Anggaran ${word}.${seen} Berapa batas per bulannya?`,
    singkat: `${label(word)}.${seen} Batas sebulan?`,
    gaul: `Anggaran ${word}, oke.${seen} Mau dibatesin berapa sebulan?`,
    barbar: `Anggaran ${word}, mantap.${seen} Batasin berapa sebulan, biar lo nggak kalap?`,
  }), chips: amountChoices(usual), open: OPEN.budget, flow: { kind: 'budget', asking: 'amount', slots: { category: word } } };
}
function suggestBudgetAmount(v: Voice, word: string, data: GoalData, today: string): GoalStep {
  const usual = usualMonthly(word, data, today);
  const text = usual
    ? vo(v, {
      santai: `Rata-rata ${word} kamu ${rpText(roundNice(usual))} per bulan (3 bulan terakhir). Kalau mau lebih hemat, coba ${rpText(roundNice(usual * 0.9))}: turun 10% masih realistis. Pilih salah satu atau tulis sendiri.`,
      sopan: `Rata-rata pengeluaran ${word} Anda ${rpText(roundNice(usual))} per bulan (3 bulan terakhir). Untuk berhemat, ${rpText(roundNice(usual * 0.9))} (turun 10%) masih realistis.`,
      singkat: `Rata-rata ${rpText(roundNice(usual))}/bulan. Hemat: ${rpText(roundNice(usual * 0.9))}.`,
      gaul: `Rata-rata ${word} lo ${rpText(roundNice(usual))} sebulan (3 bulan terakhir). Mau hemat dikit? ${rpText(roundNice(usual * 0.9))} masih masuk akal.`,
    })
    : vo(v, {
      santai: `Belum ada catatan ${word} buat dijadikan patokan. Mulai saja dari angka yang terasa pas, misalnya Rp500.000 per bulan, nanti bisa diubah kapan saja.`,
      sopan: `Belum ada catatan ${word} untuk patokan. Silakan mulai dari angka yang terasa wajar, misalnya Rp500.000 per bulan.`,
      singkat: `Belum ada patokan. Coba Rp500.000/bulan.`,
      gaul: `Belum ada catatan ${word} buat patokan. Mulai aja dari Rp500.000 sebulan, nanti bisa diubah.`,
    });
  return { title: `Anggaran ${label(word)}`, text, chips: amountChoices(usual), open: OPEN.budget, flow: { kind: 'budget', asking: 'amount', slots: { category: word } } };
}
function budgetCard(v: Voice, word: string, amount: string): GoalStep {
  return { plan: `anggaran ${word} ${amount}`, text: vo(v, {
    santai: `Siap, anggaran ${word} ${amount} per bulan.`, sopan: `Baik, anggaran ${word} ${amount} per bulan.`, singkat: '', gaul: `Oke, anggaran ${word} ${amount} sebulan.`,
  }), flow: { kind: 'budget', asking: 'amount', slots: { category: word, amount } } };
}

function askWalletName(v: Voice, data: GoalData): GoalStep {
  const have = new Set(data.wallets.map(w => w.name.toLowerCase()));
  return { title: 'Dompet baru', text: vo(v, {
    santai: 'Oke, tambah dompet baru. Namanya apa? Bank, e-wallet, atau tunai.',
    sopan: 'Baik, saya bantu menambah dompet baru. Apa nama dompet atau rekeningnya?',
    singkat: 'Dompet baru. Namanya?',
    gaul: 'Siap, dompet baru. Namanya apa nih?',
    barbar: 'Gas, dompet baru. Namanya apaan?',
  }), chips: ['bca', 'seabank', 'dana', 'ovo', 'shopeepay', 'bni'].filter(b => !have.has(b)).slice(0, 4), open: OPEN.wallet, flow: { kind: 'wallet', asking: 'name', slots: {} } };
}
function walletCard(v: Voice, name: string, balance?: string): GoalStep {
  return { plan: `dompet baru ${name}${balance ? ` saldo ${balance}` : ''}`, text: balance ? '' : vo(v, {
    santai: `Dompet ${name}. Saldo awalnya berapa? Bilang aja, atau langsung Simpan kalau mulai dari 0.`,
    sopan: `Dompet ${name}. Berapa saldo awalnya? Atau langsung simpan bila mulai dari nol.`,
    singkat: `${label(name)}. Saldo awal? (atau Simpan)`,
    gaul: `Dompet ${name}. Saldo awalnya berapa? Atau Simpan aja kalau masih 0.`,
  }), chips: balance ? undefined : ['saldonya 0', 'saldonya 500rb', 'saldonya 1jt'], flow: { kind: 'wallet', asking: 'balance', slots: { name, balance } } };
}

function askFundPurpose(v: Voice, data: GoalData): GoalStep {
  const have = new Set(data.funds.map(f => f.name.toLowerCase()));
  return { title: 'Tujuan dana baru', text: vo(v, {
    santai: 'Mantap, mau mulai nabung! Buat apa tabungannya? Pilih atau tulis sendiri.',
    sopan: 'Baik, mari mulai menabung. Untuk tujuan apa tabungannya?',
    singkat: 'Nabung buat apa?',
    gaul: 'Mantul, mau nabung! Buat apa nih?',
    barbar: 'Akhirnya lo mau nabung juga. Buat apaan?',
  }), chips: ['dana darurat', 'liburan', 'gadget baru', 'nikah'].filter(f => !have.has(f)).slice(0, 4), open: OPEN.fund, flow: { kind: 'fund', asking: 'purpose', slots: {} } };
}
function askFundTarget(v: Voice, purpose: string, sizes: string[] = []): GoalStep {
  return { title: `Target ${purpose}`, text: vo(v, {
    santai: `Nabung buat ${purpose}, keren! Targetnya berapa?`,
    sopan: `Menabung untuk ${purpose}. Berapa target dananya?`,
    singkat: `${label(purpose)}. Target?`,
    gaul: `Nabung buat ${purpose}, gaskeun! Targetnya berapa?`,
  }), chips: (sizes.length ? sizes : ['5jt', '10jt', '25jt']).map(x => `target ${purpose} ${x}`), open: OPEN.fund, flow: { kind: 'fund', asking: 'target', slots: { purpose } } };
}
function fundCard(v: Voice, purpose: string, target: string, value: number): GoalStep {
  return { plan: `tujuan dana ${purpose} ${target}`, text: vo(v, {
    santai: `Siap, tujuan dana ${purpose} ${target}. Kalau mau, tanya juga “kalau sebulan 1jt berapa lama?”.`,
    sopan: `Baik, tujuan dana ${purpose} ${target}.`, singkat: '', gaul: `Oke, tujuan dana ${purpose} ${target}.`,
  }), chips: ['kalau sebulan 1jt berapa lama', 'sebulan harus nabung berapa biar setahun'], flow: { kind: 'fund', asking: 'monthly', slots: { purpose, target, targetValue: value } } };
}
function fundMonths(v: Voice, slots: GoalFlow['slots'], t: string): GoalStep | null {
  const target = slots.targetValue || 0, a = amountIn(t);
  if (!target) return null;
  const year = /\bsetahun\b|\b1\s+tahun\b|\b12\s+bulan\b/.test(t) && !a;
  if (year) {
    const each = Math.ceil(target / 12 / 1000) * 1000;
    return { title: `Target ${slots.purpose}`, text: vo(v, { santai: `Biar ${rpText(target)} terkumpul dalam setahun, sisihkan ${rpText(each)} per bulan.`, sopan: `Agar ${rpText(target)} terkumpul dalam setahun, sisihkan ${rpText(each)} per bulan.`, singkat: `${rpText(each)}/bulan.`, gaul: `Biar ${rpText(target)} kekumpul setahun, sisihin ${rpText(each)} sebulan.` }), flow: { kind: 'fund', asking: 'monthly', slots } };
  }
  if (!a) return null;
  const months = Math.ceil(target / a.value), years = months >= 12 ? ` (sekitar ${Math.floor(months / 12)} tahun${months % 12 ? ` ${months % 12} bulan` : ''})` : '';
  return { title: `Target ${slots.purpose}`, text: vo(v, {
    santai: `Dengan ${rpText(a.value)} per bulan, ${rpText(target)} terkumpul dalam ${months} bulan${years}.`,
    sopan: `Dengan ${rpText(a.value)} per bulan, ${rpText(target)} terkumpul dalam ${months} bulan${years}.`,
    singkat: `${months} bulan${years}.`,
    gaul: `Kalau ${rpText(a.value)} sebulan, ${rpText(target)} kekumpul dalam ${months} bulan${years}.`,
  }), chips: ['bikin tujuan dananya', 'kasih tips nabung'], flow: { kind: 'fund', asking: 'monthly', slots } };
}

function askRecurringItem(v: Voice): GoalStep {
  return { title: 'Jadwal rutin baru', text: vo(v, {
    santai: 'Oke, bikin jadwal rutin biar nggak lupa. Tagihan atau langganan apa?',
    sopan: 'Baik, saya bantu membuat jadwal rutin. Tagihan atau langganan apa?',
    singkat: 'Jadwal rutin. Bayar apa?',
    gaul: 'Siap, jadwal rutin biar nggak kelewat. Bayar apa nih?',
  }), chips: ['bayar kos', 'internet', 'listrik', 'netflix'], open: OPEN.recurring, flow: { kind: 'recurring', asking: 'item', slots: {} } };
}
function askRecurringSchedule(v: Voice, item: string): GoalStep {
  return { title: `Jadwal ${item}`, text: vo(v, {
    santai: `${label(item)}. Berapa, dan tiap tanggal berapa? Misalnya “1,5jt tiap tanggal 5”.`,
    sopan: `${label(item)}. Berapa nominalnya dan setiap tanggal berapa?`,
    singkat: `${label(item)}. Nominal & tanggal?`,
    gaul: `${label(item)}. Berapa, terus tiap tanggal berapa?`,
  }), chips: ['tiap tanggal 1', 'tiap tanggal 25'], open: OPEN.recurring, flow: { kind: 'recurring', asking: 'schedule', slots: { item } } };
}

function askCategoryName(v: Voice): GoalStep {
  return { title: 'Kategori baru', text: vo(v, {
    santai: 'Oke, kategori baru. Namanya apa? Misalnya “jajan kantor” atau “hobi foto”.',
    sopan: 'Baik, kategori baru. Apa nama kategorinya?',
    singkat: 'Kategori baru. Namanya?',
    gaul: 'Siap, kategori baru. Namanya apa?',
  }), open: OPEN.category, flow: { kind: 'category', asking: 'name', slots: {} } };
}

/* ---------------------------------------------------------------- a new message */
// ("split bill" reaches here as "split bil": the chat's spelling fixes shorten doubled letters.)
const FEATURE_SPLIT = /\b(?:patungan|split\s*bill?|splitbill?|bagi\s+(?:tagihan|bill?|bon|struk|rata)|bayar\s+bareng|urunan|sharing\s+cost|split\s+(?:the\s+)?bill?)\b/;
const FEATURE_IMPORT = /\b(?:mutasi|rekening\s+koran|e-?statement|statement\s+bank|riwayat\s+(?:bank|rekening|transaksi\s+bank))\b/;
const FEATURE_SCAN = /\b(?:struk|nota|kuitansi|receipt)\b/;
const FEATURE_PIN = /\bpin\b.*\b(?:pasang|kunci|aktif|aktifin|pakai|pake|set|bikin|buat|tambah)|\b(?:pasang|kunci|aktifin|pakai|pake|set|bikin|buat|tambah)\b.*\bpin\b|\bkunci\s+(?:aplikasi|aplikasinya|app|appnya)\b/;
const FEATURE_THEME = /\b(?:mode\s+gelap|dark\s*mode|mode\s+terang|light\s*mode|tema|warna\s+(?:aplikasi|app)|ganti\s+warna)\b/;
const START = /\b(?:atur|ngatur|mengatur|kelola|ngelola|mengelola|manage|rapihin|rapikan|beresin)\s+(?:keuangan|duit|uang|finansial)\b|\bkeuangan\s*(?:\w+\s+)?(?:ga|gak|nggak|tidak)\s+berantakan\b|\bbiar\s+(?:ga|gak|nggak|tidak)\s+boncos\b|\bmulai\s+(?:ngatur|atur|nabung\s+dan\s+atur)\b|\bdari\s+nol\b.*\b(?:keuangan|uang|duit)\b/;
const WISH_LATER = /\b(?:pengen|pengin|pingin|ingin|mau)\s+beli\b.*\b(?:nanti|ntar|suatu\s+hari|kapan[\s-]kapan|someday|tahun\s+depan)\b|\bsuatu\s+hari\b.*\bbeli\b/;

/** `sizes`: target amounts that fit the person's income ("10jt", "20jt"), offered when a saving goal has no target yet. */
export function readGoal(t: string, data: GoalData, today: string, v: Voice, sizes: string[] = []): GoalStep | null {
  // A question about what is there already ("tabungan laptop baru berapa", "target 5jt maret, per bulan nabung berapa"):
  // "baru" there names the thing and "mau tanya" asks, so nothing is set up.
  if (ASKING.test(t) && !CREATE.test(t.replace(/\bmau\s+tanya\b/g, ' ').replace(/\b(?:baru|new)\b/g, ' '))) return null;
  // "udah mau habis" asks about it: "mau" there is not wanting to make one.
  const a = amountIn(t), creating = CREATE.test(t.replace(/\bmau\s+(?:habis|abis|jebol|lewat|over|tanya|nanya)\b/g, ' '));
  // An anggaran: "budgeting baru", "bikin anggaran makan", "set limit jajan 500rb sebulan", "anggarin transport 700rb".
  const budgetish = BUDGET_WORD.test(t) && !/\b(?:anggaran|budget)\s+(?:dana|darurat)\b/.test(t) && !/\b(?:kartu\s+kredit|cc|paylater|pay\s+later|kredivo|akulaku|spaylater|atm|tarik\s+tunai|transfer)\b/.test(t);
  if (budgetish && (creating || /\b(?:limit|batasin|batasi|membatasi|anggarin|anggarkan|budgetin|ngebudget|budgeting|plafon|ngerem|ngeremin)\b/.test(t)) && !(STATUS.test(t) && !creating)) {
    const word = categoryWord(t.replace(BUDGET_WORD, ' '), data);
    if (word && a) return budgetCard(v, word, a.text);
    if (word) return askBudgetAmount(v, word, data, today);
    if (!a && !/\b(?:tips|cara|gimana|bagaimana)\b/.test(t)) return askBudgetCategory(v, data, today);
  }
  // A dompet: "tambah dompet baru", "nambah rekening", "add wallet seabank", "aku punya e-wallet baru".
  if (WALLET_WORD.test(t) && (creating || /\bpunya\b.*\bbaru\b/.test(t)) && !/\b(?:beli|harga|hilang|ketinggalan|jatuh|kulit|cowok|cewek|pria|wanita)\b/.test(t) && !(STATUS.test(t) && !/\b(?:saldo(?:nya)?|isi(?:nya)?)\s+\d/.test(t))) {
    const name = bankIn(t) || (t.match(/\bnamanya\s+([\p{L}\p{N} ]{2,20})/u)?.[1].trim());
    const balance = t.match(/\b(?:saldo(?:nya)?|isi(?:nya)?|isinya)\s+((?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k|jt|juta)?)/)?.[1];
    if (name) return walletCard(v, name, balance);
    if (!a) return askWalletName(v, data);
  }
  // A tujuan dana: "mau bikin tabungan", "pengen mulai nabung", "bikin target nabung motor 15jt", "target tabungan nikah 50jt".
  if (FUND_WORD.test(t) && (creating || /\btarget\b/.test(t)) && !/\b(?:ke|dari)\s+(?:tabungan|dana)\b/.test(t) && !(a && !/\b(?:target|tujuan\s+dana|bikin|bikinin|buatin|buatkan|celengan|celengin)\b|\bbuat\s+(?:target|tabungan|tujuan|celengan)\b/.test(t)) && !/\b(?:tips|cara|caranya|gimana|bagaimana|kapan|berapa\s+lama|bingung|mulai\s+dari\s+mana)\b/.test(t)) {
    // The purpose is what comes after "buat/untuk" ("nyimpen uang buat darurat" → darurat), else a short name left over.
    const after = t.replace(a ? a.text : '', ' ').match(/\b(?:buat|untuk|utk|for)\s+((?:beli\s+)?[\p{L}\p{N} ]{2,40})/u)?.[1];
    const left = nameIn(t.replace(a ? a.text : '', ' ').replace(/\b(?:mau|pengen|pengin|ingin|mulai|bikin|buat(?:in)?|tambah|nambah|set|ayo|yuk|aku|saya|gue|gw|kak|min|nyimpen|nyimpan|simpan|ngumpulin|ngumpulkan|kumpulin|uang|nyisihin|sisihin|nyisihkan|menyisihkan|celengin|celengan|dong|nih)\b/g, ' '));
    const named = after ? nameIn(after) : left.split(' ').length <= 3 ? left : '', purpose = named === 'darurat' ? 'dana darurat' : named;
    if (purpose && a) return fundCard(v, purpose, a.text, a.value);
    if (purpose && purpose.split(' ').length <= 4) return askFundTarget(v, purpose, sizes);
    if (!a) return askFundPurpose(v, data);
  }
  // A jadwal rutin: "bikin jadwal rutin", "atur tagihan bulanan biar otomatis".
  // Written out whole ("bikinin jadwal bayar kos tiap tgl 5 1,2jt"): the schedule card at once.
  const every = /\btiap\s+(?:tanggal|tgl)\s*\d{1,2}\b|\btiap\s+(?:bulan|minggu|pekan)\b/.test(t);
  if (a && every && (RECUR_WORD.test(t) || /\bjadwal(?:in|kan|nya)?\b/.test(t))) {
    const item = nameIn(t.replace(a.text, ' ').replace(/\btiap\s+(?:tanggal|tgl)\s*\d{1,2}\b|\btiap\s+(?:bulan|minggu|pekan)\b/g, ' ').replace(/\b(?:bikinin|bikin|buatin|buat|buatkan|atur|aturin|set|pasang|jadwal(?:in|kan|nya)?|rutin|tolong|dong|aku|gue|saya|otomatis)\b/g, ' '));
    if (item && item.split(' ').length <= 4) return schedule(item, t, a.text);
  }
  // "tagihan wifi tiap bulan biar otomatis kecatet gimana": a schedule, asked in the chat.
  if ((RECUR_WORD.test(t) || every && /\b(?:otomatis|jadwal|jadwalin)\b/.test(t)) && (creating || /\botomatis\b/.test(t)) && !a && !STATUS.test(t)) return askRecurringItem(v);
  // A kategori: "bikin kategori baru", "tambahin kategori".
  if (/\bkategori\b/.test(t) && /\b(?:baru|bikin|buat|buatin|tambah|tambahin|nambah|add|new|create)\b/.test(t) && !STATUS.test(t) && !a) {
    const name = nameIn(t.replace(/\b(?:bikin|buat|buatin|tambah|tambahin|nambah|add|new|create|kategori|baru)\b/g, ' ').replace(/\b(?:aku|saya|gue|mau|pengen|dong|tolong)\b/g, ' '));
    return name && name.split(' ').length <= 3 ? { plan: `kategori baru ${name}`, text: '' } : askCategoryName(v);
  }
  // Something to buy one day: Wish list (or a tujuan dana when it is big).
  if (WISH_LATER.test(t) && !a) {
    const thing = nameIn(t.replace(/\b(?:pengen|pengin|pingin|ingin|mau|beli|tapi|nanti|ntar|suatu|hari|kapan|kapan-kapan|someday|tahun|depan|aku|saya|gue)\b/g, ' '));
    return { title: 'Simpan dulu keinginannya', text: vo(v, {
      santai: `Masukin dulu ke Wish list biar nggak beli dadakan${thing ? `: ${thing}` : ''}. Kalau harganya besar, bikin tujuan dana sekalian biar bisa dicicil nabungnya. Harganya kira-kira berapa?`,
      sopan: `Sebaiknya dicatat dulu di Wish list${thing ? ` (${thing})` : ''}. Bila harganya besar, buat tujuan dana agar bisa ditabung bertahap. Kira-kira berapa harganya?`,
      singkat: `Masukkan ke Wish list. Harganya berapa?`,
      gaul: `Taruh dulu di Wish list biar nggak kalap${thing ? `: ${thing}` : ''}. Kalau mahal, bikin tujuan dana sekalian. Harganya berapaan?`,
    }), chips: thing ? [`${thing} 5jt`, `${thing} 8jt`] : ['5jt', '10jt'], open: OPEN.wish, flow: { kind: 'wish', asking: 'amount', slots: { name: thing || 'barang impian' } } };
  }
  // Split Bill: "patungan makan sama temen", "split bill dong", "bagi tagihan makan malam".
  // With an amount it is a record ("split bill makan 300rb ber 3" is noted as one's own share), as before.
  if (FEATURE_SPLIT.test(t) && !a && !/\b(?:belum\s+(?:lunas|bayar|dibayar)|yang\s+belum|siapa|berapa|sisa|daftar|riwayat|lunas|tagih)\b/.test(t)) {
    return { title: 'Split Bill', text: vo(v, {
      santai: 'Pakai Split Bill: masukkan total (atau foto strukmu), pilih siapa saja yang ikut, nanti tiap orang kebagian berapa langsung kelihatan, dan yang belum bayar jadi piutang. Mau kuhitung cepat dulu di sini? Bilang “berempat totalnya 480rb”.',
      sopan: 'Silakan gunakan Split Bill: isi total atau foto struk, pilih peserta, maka bagian tiap orang langsung terhitung dan yang belum membayar tercatat sebagai piutang. Ingin saya hitungkan dulu? Tulis misalnya “bertiga totalnya 450rb”.',
      singkat: 'Pakai Split Bill. Atau tulis “berempat totalnya 480rb”.',
      gaul: 'Pake Split Bill aja: isi total atau foto struk, pilih siapa aja yang ikut, bagian tiap orang langsung keitung, yang belum bayar jadi piutang. Mau gue itung cepet dulu? Bilang “berempat totalnya 480rb”.',
    }), chips: ['berdua', 'bertiga', 'berempat'], open: OPEN.split, flow: { kind: 'split', asking: 'people', slots: {} } };
  }
  if (FEATURE_IMPORT.test(t) && !a) return { title: 'Impor mutasi', text: vo(v, {
    santai: 'Bisa! Pakai Impor mutasi: unduh mutasi atau rekening koran dari aplikasi bank/e-wallet (CSV, Excel, atau PDF), lalu buka Perlu Dikonfirmasi → Impor mutasi. Barisnya dibaca otomatis, kategorinya ditebak, dan yang mirip catatan lama ditandai biar nggak dobel.',
    sopan: 'Bisa. Gunakan Impor mutasi: unduh mutasi atau rekening koran (CSV, Excel, atau PDF), lalu buka Perlu Dikonfirmasi → Impor mutasi. Setiap baris dibaca otomatis dan kategorinya ditebak.',
    singkat: 'Bisa: Perlu Dikonfirmasi → Impor mutasi (CSV/Excel/PDF).',
    gaul: 'Bisa banget! Pake Impor mutasi: download mutasi dari app bank (CSV, Excel, PDF), terus buka Perlu Dikonfirmasi → Impor mutasi. Langsung kebaca semua, kategorinya ditebak.',
  }), open: { view: 'inbox', label: 'Buka Impor mutasi' }, chips: ['males ngetik satu-satu'] };
  if (FEATURE_SCAN.test(t) && !a && /\b(?:scan|foto|poto|bisa|gimana|cara|pakai|pake|aja|males)\b/.test(t)) return { title: 'Scan struk', text: vo(v, {
    santai: 'Bisa! Pakai Scan struk: foto struk atau nota, isinya dibaca di HP-mu sendiri (nggak diunggah ke mana-mana), lalu barang dan totalnya tinggal dicek sebelum disimpan. Ada di tombol Tambah → Scan struk.',
    sopan: 'Bisa. Gunakan Scan struk: foto struk atau nota, isinya dibaca langsung di perangkat Anda, lalu periksa sebelum disimpan. Ada di Tambah → Scan struk.',
    singkat: 'Bisa: Tambah → Scan struk.',
    gaul: 'Bisa! Scan struk aja: foto strukmu, langsung kebaca di HP lo sendiri, tinggal cek terus simpan. Ada di Tambah → Scan struk.',
  }), open: { view: 'scan', label: 'Buka Scan struk' } };
  if (FEATURE_PIN.test(t) && !/\blupa\b/.test(t)) return { title: 'PIN aplikasi', text: vo(v, {
    santai: 'Bisa. Buka Pengaturan → Keamanan → Pasang PIN, lalu buat PIN 4 angka. Aplikasi akan minta PIN tiap dibuka lagi.',
    sopan: 'Bisa. Buka Pengaturan → Keamanan → Pasang PIN, lalu buat PIN 4 angka. Aplikasi akan meminta PIN setiap dibuka kembali.',
    singkat: 'Pengaturan → Keamanan → Pasang PIN.',
    gaul: 'Bisa. Ke Pengaturan → Keamanan → Pasang PIN, bikin 4 angka. Tiap buka app bakal ditanya PIN.',
  }), open: { view: 'settings', label: 'Buka Keamanan', target: 'security' } };
  if (FEATURE_THEME.test(t) && !a) return { title: 'Tampilan', text: vo(v, {
    santai: `Ada di Pengaturan → Tampilan: pilih mode ${/terang|light/.test(t) ? 'Terang' : 'Gelap'}, palet warna, dan ukuran teks. Langsung berubah, tersimpan otomatis.`,
    sopan: 'Silakan buka Pengaturan → Tampilan untuk memilih mode layar, palet warna, dan ukuran teks.',
    singkat: 'Pengaturan → Tampilan.',
    gaul: 'Ke Pengaturan → Tampilan: ada mode gelap/terang, palet warna, ukuran teks. Langsung ganti.',
  }), open: { view: 'settings', label: 'Buka Tampilan', target: 'appearance' } };
  if (START.test(t) && !/\b(?:berapa|brp|brapa|sehari|per\s*hari|harian|tips|saran|cara)\b/.test(t)) return startSteps(v, data, today);
  return null;
}

function splitEach(v: Voice, n: number, total: number): GoalStep {
  const each = Math.ceil(total / n);
  return { title: 'Bagi rata', text: vo(v, {
    santai: `${rpText(total)} dibagi ${n} orang = ${rpText(each)} per orang. Mau dicatat rapi beserta siapa yang belum bayar? Pakai Split Bill.`,
    sopan: `${rpText(total)} dibagi ${n} orang = ${rpText(each)} per orang. Untuk mencatat siapa yang belum membayar, gunakan Split Bill.`,
    singkat: `${rpText(each)} per orang.`,
    gaul: `${rpText(total)} bagi ${n} = ${rpText(each)} per orang. Biar ketahuan siapa yang belum bayar, pake Split Bill.`,
  }), open: OPEN.split, chips: [`bayar ${shortAmount(total)} makan bareng`] };
}

/** "Atur keuangan dari nol": the first steps, with the person's own biggest category. */
function startSteps(v: Voice, data: GoalData, today: string): GoalStep {
  const top = budgetChoices(data, today)[0] || 'makan';
  const steps = [
    `1. Catat semua yang keluar selama seminggu: ketik di chat (“kopi 20rb”), Scan struk, atau Impor mutasi dari bank.`,
    `2. Pasang anggaran untuk kategori terbesarmu dulu: ${top}. Bilang “budgeting baru” di sini.`,
    `3. Begitu gajian, langsung sisihkan tabungan (misalnya 10–20%) ke tujuan dana, sebelum dipakai jajan.`,
    `4. Pelan-pelan kumpulkan dana darurat 3–6× pengeluaran bulanan.`,
  ];
  return { title: 'Mulai atur keuangan', text: vo(v, {
    santai: 'Gampang, kita mulai pelan-pelan. Pertama, ikuti 4 langkah ini:',
    sopan: 'Baik, mari mulai bertahap. Pertama, ikuti empat langkah berikut:',
    singkat: 'Mulai dari langkah pertama:',
    gaul: 'Santai, kita mulai pelan-pelan. Pertama-tama, ikutin 4 langkah ini:',
  }), steps, chips: ['budgeting baru', 'mau bikin tabungan', 'ingetin aku nyatet tiap hari'] };
}

/* ---------------------------------------------------------------- the answer to the question just asked */
export function continueGoal(t: string, flow: GoalFlow, data: GoalData, today: string, v: Voice, sizes: string[] = []): GoalStep | null {
  const a = amountIn(t), words = t.split(' ').length;
  if (CANCEL.test(t) && !a) return { cancelled: true, text: vo(v, {
    santai: 'Oke, nggak jadi. Kalau berubah pikiran, bilang aja.', sopan: 'Baik, dibatalkan. Silakan kabari bila ingin melanjutkan.', singkat: 'Oke, batal.', gaul: 'Sip, nggak jadi. Kalau berubah pikiran, colek aja.',
  }) };
  const s = flow.slots;
  switch (flow.kind) {
    case 'budget': {
      if (SUGGEST_ASK.test(t) && s.category) return suggestBudgetAmount(v, s.category, data, today);
      const word = flow.asking === 'category' || !a ? categoryWord(t, data) : undefined;
      if (flow.asking === 'category') {
        const chosen = word || (words <= 3 && !a && /\p{L}{3,}/u.test(t) ? nameIn(t) : undefined);
        if (!chosen) return null;
        return a ? budgetCard(v, chosen, a.text) : askBudgetAmount(v, chosen, data, today);
      }
      if (a && s.category) return budgetCard(v, word || s.category, a.text);
      return null;
    }
    case 'wallet': {
      if (flow.asking === 'name') {
        const name = bankIn(t) || (words <= 3 && !a ? nameIn(t) : undefined);
        if (!name) return null;
        const balance = t.match(/\b(?:saldo(?:nya)?|isi(?:nya)?)\s+((?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k|jt|juta)?)/)?.[1];
        return walletCard(v, name, balance);
      }
      if (flow.asking === 'balance' && s.name && a) return walletCard(v, s.name, a.text);
      return null;
    }
    case 'fund': {
      if (flow.asking === 'purpose') {
        const purpose = !a || words > 1 ? nameIn(t.replace(a ? a.text : '', ' ')) : '';
        if (!purpose || purpose.split(' ').length > 4) return null;
        return a ? fundCard(v, purpose, a.text, a.value) : askFundTarget(v, purpose, sizes);
      }
      if (flow.asking === 'target' && a && s.purpose) return fundCard(v, s.purpose, a.text, a.value);
      if (flow.asking === 'monthly') return fundMonths(v, s, t);
      return null;
    }
    case 'recurring': {
      if (flow.asking === 'item') {
        if (a) { const item = nameIn(t.replace(a.text, ' ').replace(/\btiap\b.*$/, '')); return item ? schedule(item, t, a.text) : null; }
        const item = words <= 4 ? nameIn(t) : '';
        return item ? askRecurringSchedule(v, item) : null;
      }
      if (flow.asking === 'schedule' && s.item && a) return schedule(s.item, t, a.text);
      return null;
    }
    case 'category': {
      const name = words <= 3 && !a ? nameIn(t) : '';
      return name ? { plan: `kategori baru ${name}`, text: '' } : null;
    }
    case 'wish': {
      if (!a) return null;
      const thing = nameIn(t.replace(a.text, ' ')) || s.name || 'barang impian';
      return { plan: `wish list ${thing} ${a.text}`, text: vo(v, { santai: `Masuk Wish list: ${thing} ${a.text}.`, sopan: `Dicatat ke Wish list: ${thing} ${a.text}.`, singkat: '', gaul: `Masuk Wish list: ${thing} ${a.text}.` }) };
    }
    case 'split': {
      const n = peopleIn(t);
      if (n >= 2 && a) return splitEach(v, n, a.value);
      if (n >= 2) return { title: 'Bagi rata', text: vo(v, { santai: `${n} orang. Totalnya berapa?`, sopan: `${n} orang. Berapa totalnya?`, singkat: 'Totalnya?', gaul: `${n} orang. Totalnya berapa?` }), flow: { kind: 'split', asking: 'people', slots: { name: String(n) } } };
      if (a && s.name) return splitEach(v, Number(s.name), a.value);
      return null;
    }
  }
  return null;

}
/** A schedule card: "bayar kos 1,2jt tiap tanggal 5". */
function schedule(item: string, said: string, amount: string): GoalStep {
  const day = said.match(/\btanggal\s+(\d{1,2})\b|\btgl\s*(\d{1,2})\b/);
  const when = day ? `tiap tanggal ${day[1] || day[2]}` : /\btiap\s+(?:minggu|pekan)\b/.test(said) ? 'tiap minggu' : 'tiap bulan';
  return { plan: `${item} ${amount} ${when}`, text: '' };
}

/**
 * 10.0 Asked about a budget that does not exist ("budget jajan aman ga?"): said honestly, with what that category cost
 * this pay cycle, and the next message can set its limit ("400rb").
 */
export function budgetMissing(t: string, data: GoalData, today: string, cycleStart: string, v: Voice): GoalStep | null {
  if (!BUDGET_WORD.test(t) || !STATUS.test(t) || CREATE.test(t.replace(/\bmasih\b/g, ''))) return null;
  const word = categoryWord(t.replace(BUDGET_WORD, ' '), data); if (!word) return null;
  const cats = data.categories.filter(c => c.name.toLowerCase().includes(word) || word.includes(c.name.toLowerCase().split(/[\s&/]+/)[0]));
  if (!cats.length) return null;
  const ids = new Set(cats.flatMap(c => [c.id, c.parentId || ''])), covered = data.budgets.some(b => b.active !== false && (ids.has(b.categoryId) || cats.some(c => c.name.toLowerCase() === b.name.toLowerCase())));
  if (covered) return null;
  const own = new Set(cats.map(c => c.id));
  let spent = 0; for (const x of data.transactions) if (x.type === 'expense' && x.date >= cycleStart && x.date <= today && (own.has(x.subcategoryId || '') || own.has(x.categoryId || ''))) spent += x.amount;
  const usual = usualMonthly(word, data, today), shown = (cats.find(c => !c.parentId) || cats[0]).name;
  return { title: `Anggaran ${shown}`, text: vo(v, {
    santai: `Belum ada anggaran buat ${shown}. Siklus ini kepakai ${rpText(spent)} di situ. Mau pasang batasnya sekarang? Tulis aja nominalnya.`,
    sopan: `Belum ada anggaran untuk ${shown}. Pengeluarannya siklus ini ${rpText(spent)}. Ingin menetapkan batasnya sekarang?`,
    singkat: `Belum ada anggaran ${shown}. Siklus ini ${rpText(spent)}. Pasang?`,
    gaul: `Lo belum punya anggaran ${shown}. Siklus ini udah ${rpText(spent)}. Mau dipasang batasnya? Tulis nominalnya.`,
  }), chips: amountChoices(usual), open: OPEN.budget, flow: { kind: 'budget', asking: 'amount', slots: { category: word } } };
}
