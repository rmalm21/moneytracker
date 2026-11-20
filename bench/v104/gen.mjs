/**
 * 10.4 Asisten chat 4.5 — the assistant as a whole, generated with the answer for every case, on the accounts of
 * bench/v102/state.mjs (Dinda, Thursday 15 Oct 2026, 15.00, payday the 24th; wallets Jago, GoPay, Jenius, Mandiri, BRI,
 * Krom, Cash; three months of records, two debts, three receivables, three goals).
 *
 *   build('dev') / build('heldout') → cases in the bench/v102 format ({ id, fam, voice, turns: [{ say, check } | { save }] })
 *
 * Twelve families. The two splits share no list: words, items, amounts, sentence shapes, periods, menu wordings and
 * chit-chat are written twice, once per split; only the account's own names (wallets, goals, people it owes) and numbers
 * are common. The answers to questions about the records are worked out here, straight from the ledger (the same
 * records the assistant reads), so a wrong total is caught. Written before any 4.5 code; the held-out split is run once,
 * at the end. The sentences tried by hand while looking for weak spots before this file was written are in the dev
 * split only.
 */
import { accounts } from '../v102/state.mjs';

const TODAY = '2026-10-15', YDAY = '2026-10-14';
const DATA = accounts[0].data;
function random(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
const tidy = s => s.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
const rp = n => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const money = n => new RegExp(`${esc(rp(n))}(?![\\d.])`);
const NONE = /belum ada|tidak ada|nggak ada|gak ada|ga ada|kosong/i;
/** What an answer must show: the amount, or (for nothing at all) that there is none. */
const amountIs = n => Math.round(n) ? [money(n)] : [money(0), NONE];
const countIs = n => n ? [new RegExp(`\\b${n} ?(kali|transaksi|x)\\b`)] : [new RegExp('\\b0 (kali|transaksi)'), NONE];
const dayIs = iso => [new RegExp(`\\b${esc(shortDate(iso))}\\b`), ...(iso === TODAY ? [/hari ini/i] : iso === YDAY ? [/kemarin/i] : [])];

// ——— The ledger, read straight (for the answers) ———
const catById = new Map(DATA.categories.map(c => [c.id, c]));
const catName = id => catById.get(id)?.name || '';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const shortDate = iso => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const daysIn = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5) + 1;
/** Spending (or income) in [from, to] that `test` lets through: total, count, biggest, last. */
function ledger(test, from, to, type = 'expense') {
  const list = DATA.transactions.filter(t => t.type === type && t.date >= from && t.date <= to && test(t));
  const total = list.reduce((n, t) => n + t.amount, 0);
  const biggest = list.reduce((b, t) => !b || t.amount > b.amount ? t : b, null);
  const last = list.reduce((b, t) => !b || t.date > b.date ? t : b, null);
  return { total, count: list.length, biggest, last };
}
const inCat = name => t => catName(t.categoryId) === name || catName(t.subcategoryId) === name;
const merchantIs = name => t => (t.merchant || '').toLowerCase() === name.toLowerCase();
const walletIs = id => t => t.walletId === id;
const ALL = () => true;

// Periods: what was said, and the dates it covers up to today.
const PERIODS = {
  dev: [['bulan ini', '2026-10-01', TODAY], ['bulan lalu', '2026-09-01', '2026-09-30'], ['minggu ini', '2026-10-12', TODAY], ['kemarin', YDAY, YDAY], ['minggu lalu', '2026-10-05', '2026-10-11']],
  heldout: [['bln ini', '2026-10-01', TODAY], ['bulan kemarin', '2026-09-01', '2026-09-30'], ['pekan ini', '2026-10-12', TODAY], ['kemaren', YDAY, YDAY], ['pekan lalu', '2026-10-05', '2026-10-11'], ['september', '2026-09-01', '2026-09-30']],
};
// Words for a category in questions (what is said → the category whose records count).
const QCATS = {
  dev: [['makan', 'Makan & Minum'], ['kopi', 'Kopi & Minuman'], ['ojek', 'Ojek'], ['bensin', 'Bensin'], ['jajan', 'Jajan'], ['makan siang', 'Makan Siang'], ['transportasi', 'Transportasi']],
  heldout: [['ngopi', 'Kopi & Minuman'], ['bbm', 'Bensin'], ['makan malam', 'Makan Malam'], ['transport', 'Transportasi'], ['jajanan', 'Jajan'], ['makan minum', 'Makan & Minum'], ['ojol', 'Ojek']],
};
const QMERCHANTS = { dev: ['Starbucks', 'Indomaret', 'Gojek', 'Shell', 'Hokben'], heldout: ['Fore Coffee', 'Alfamart', 'Grab', 'Pertamina', 'Solaria'] };

// ——— Words for records ———
const LEX = {
  dev: {
    items: [['kopi susu', 'Makan & Minum'], ['nasi goreng', 'Makan & Minum'], ['bakso', 'Makan & Minum'], ['bensin', 'Transportasi'], ['parkir', 'Transportasi'], ['pulsa', 'Tagihan'], ['obat', 'Kesehatan'], ['buku', 'Pendidikan'], ['kaos', 'Belanja'], ['martabak', 'Makan & Minum']],
    english: [['coffee', 'Makan & Minum'], ['lunch', 'Makan & Minum'], ['dinner', 'Makan & Minum'], ['gas', 'Transportasi'], ['parking', 'Transportasi'], ['medicine', 'Kesehatan']],
    income: [['gaji', 'Gaji'], ['bonus', 'Gaji']],
    savings: ['jenius', 'krom'],
    people: ['andi', 'yoga'],
  },
  heldout: {
    items: [['es teh', 'Makan & Minum'], ['soto', 'Makan & Minum'], ['mie ayam', 'Makan & Minum'], ['pertalite', 'Transportasi'], ['tol', 'Transportasi'], ['token listrik', 'Tagihan'], ['vitamin', 'Kesehatan'], ['fotokopi', 'Pendidikan'], ['celana', 'Belanja'], ['gorengan', 'Makan & Minum']],
    english: [['breakfast', 'Makan & Minum'], ['snacks', 'Makan & Minum'], ['taxi', 'Transportasi'], ['toll', 'Transportasi'], ['pharmacy', 'Kesehatan'], ['shirt', 'Belanja']],
    income: [['gajian', 'Gaji'], ['thr', 'Gaji']],
    savings: ['bri', 'mandiri'],
    people: ['fajar', 'nisa'],
  },
};
const WNAME = { jago: 'Jago', gopay: 'GoPay', jenius: 'Jenius', mandiri: 'Mandiri', bri: 'BRI', krom: 'Krom', cash: 'Cash' };

// ——— Families ———
const Q = (extra = {}) => ({ notRecord: true, notUnknown: true, ...extra });
const one = (say, check, voice = 'santai') => ({ voice, turns: [{ say, check }] });
const dlg = (turns, check, voice = 'santai') => ({ voice, turns: turns.map((t, i) => ({ ...(typeof t === 'string' ? { say: t } : t), ...(i === turns.length - 1 ? { check } : {}) })) });
const S = { save: true };
const rec = (kind, total, extra = {}) => ({ rec: { kind, total, ...extra } });

/** 1 · Amounts said in words, slang and odd formats. */
function angka(split, rnd) {
  const dev = split === 'dev';
  const AMTS = dev
    ? [['satu koma lima juta', 1500000], ['1,5jt', 1500000], ['sejuta', 1000000], ['setengah juta', 500000], ['dua ratus ribu', 200000], ['seratus lima puluh ribu', 150000], ['goceng', 5000], ['ceban', 10000], ['gocap', 50000], ['cepek', 100000], ['25 rebu', 25000], ['rp 25.000,-', 25000], ['1jt 200', 1200000], ['dua juta', 2000000], ['tujuh puluh lima ribu', 75000]]
    : [['dua koma lima juta', 2500000], ['2.5jt', 2500000], ['1,2 juta', 1200000], ['satu setengah juta', 1500000], ['tiga ratus ribu', 300000], ['empat ratus lima puluh ribu', 450000], ['noban', 20000], ['gopek', 500], ['seceng', 1000], ['sejeti', 1000000], ['IDR 45.000', 45000], ['3 jt', 3000000], ['1jt500', 1500000], ['Rp. 30,000', 30000], ['enam puluh ribu', 60000], ['dua ratus lima puluh rb', 250000]];
  const SHAPES = dev
    ? [(i, a) => `${i} ${a}`, (i, a) => `beli ${i} ${a}`, (i, a) => `${a} buat ${i}`, (i, a) => `abis ${a} buat ${i}`]
    : [(i, a) => `${i} harganya ${a}`, (i, a) => `td bayar ${i} ${a}`, (i, a) => `${a} utk ${i}`, (i, a) => `keluar ${a} beli ${i}`];
  const incomeShapes = dev ? [(w, a) => `${w} ${a} masuk`, (w, a) => `dapet ${w} ${a}`] : [(w, a) => `${w} cair ${a}`, (w, a) => `terima ${w} ${a}`];
  const out = [];
  for (let k = 0; k < 100; k++) {
    const [text, value] = AMTS[k % AMTS.length];
    if (k % 5 === 4) { const [w, cat] = pick(rnd, LEX[split].income); out.push(one(pick(rnd, incomeShapes)(w, text), rec('income', value, { cat }))); continue; }
    const [item, cat] = pick(rnd, LEX[split].items);
    // Very small or very large sums on everyday items still count; the category is checked when the item says it.
    out.push(one(pick(rnd, SHAPES)(item, text), rec('expense', value, value <= 1000000 ? { cat } : {})));
  }
  return out;
}

/** 2 · English and mixed sentences (k = ribu, m = juta). */
function inggris(split, rnd) {
  const dev = split === 'dev';
  const AMT = dev ? [['25k', 25000], ['40k', 40000], ['120k', 120000], ['1.5m', 1500000], ['300k', 300000]] : [['35k', 35000], ['60k', 60000], ['85k', 85000], ['2.5m', 2500000], ['450k', 450000]];
  const DAYS = dev ? [['yesterday', YDAY], ['today', TODAY], ['', TODAY], ['last monday', '2026-10-12']] : [['this morning', TODAY], ['2 days ago', '2026-10-13'], ['last sunday', '2026-10-11'], ['', TODAY]];
  const W = dev ? ['gopay', 'jago', 'cash'] : ['jenius', 'mandiri', 'gopay'];
  const SHAPES = dev
    ? [(i, a, d, w) => `spent ${a} on ${i} ${d} with ${w}`, (i, a, d, w) => `${i} ${a} ${d} using ${w}`, (i, a, d, w) => `paid ${a} for ${i} ${d} via ${w}`]
    : [(i, a, d, w) => `bought ${i} for ${a} ${d}, paid with ${w}`, (i, a, d, w) => `${i} cost me ${a} ${d} on ${w}`, (i, a, d, w) => `${a} for ${i} ${d} from ${w}`];
  const INC = dev
    ? [(a, w) => [`got paid ${a} to ${w}`, a], (a, w) => [`salary ${a} received in ${w}`, a]]
    : [(a, w) => [`received my salary ${a} into ${w}`, a], (a, w) => [`payday! ${a} landed in ${w}`, a]];
  const BIG = dev ? [['8m', 8000000], ['6.5m', 6500000]] : [['7m', 7000000], ['9.2m', 9200000]];
  const out = [];
  for (let k = 0; k < 100; k++) {
    const w = pick(rnd, W);
    if (k % 5 === 4) { const [a, v] = pick(rnd, BIG), [s] = pick(rnd, INC)(a, w); out.push(one(s, rec('income', v, { wallet: WNAME[w] }))); continue; }
    const [item, cat] = pick(rnd, LEX[split].english), [a, v] = pick(rnd, AMT), [d, date] = pick(rnd, DAYS);
    out.push(one(tidy(pick(rnd, SHAPES)(item, a, d, w)), rec('expense', v, { wallet: WNAME[w], date, ...(v < 1000000 ? { cat } : {}) })));
  }
  return out;
}

/** 3 · An amount that is not something to record: prices, what-ifs, not-buying, someone else's purchase. A plan for
 * later ("rencana beli … bulan depan") is the app's Rencana card, which is right. */
function bukan(split, rnd) {
  const dev = split === 'dev';
  const AMT = dev ? [['10rb', 10000], ['300rb', 300000], ['2jt', 2000000], ['50rb', 50000], ['1,5jt', 1500000], ['750rb', 750000]] : [['15rb', 15000], ['450rb', 450000], ['3jt', 3000000], ['80rb', 80000], ['2,5jt', 2500000], ['600rb', 600000]];
  const ITEMS = dev ? ['bensin', 'sepatu', 'hp baru', 'kopi', 'laptop', 'tas'] : ['pertalite', 'jaket', 'tablet', 'boba', 'kamera', 'jam tangan'];
  const SHAPES = dev
    ? [(i, a) => `harga ${i} sekarang ${a} ya`, (i, a) => `kalau aku beli ${i} ${a} aman ga`, (i, a) => `gak jadi beli ${i} ${a}`, (i, a) => `temenku baru beli ${i} seharga ${a}`, (i, a) => `${a} cukup ga buat ${i}`, (i, a) => `katanya ${i} di sana ${a}`]
    : [(i, a) => `${i} di toko itu mahal bgt sampe ${a}`, (i, a) => `misal aku beli ${i} ${a} gimana`, (i, a) => `nggak jadi beli ${i} ${a} deh`, (i, a) => `pengen ${i} ${a} tapi mikir mikir dulu`, (i, a) => `worth it ga sih ${i} ${a}`, (i, a) => `tau ga ${i} skrg naik jadi ${a}`, (i, a) => `budget ${a} dapet ${i} ga ya`];
  const PLAN = dev ? (i, a) => `rencana beli ${i} ${a} bulan depan` : (i, a) => `mau beli ${i} ${a} minggu depan, catet rencananya`;
  const out = [];
  for (let k = 0; k < 90; k++) {
    const [a, v] = pick(rnd, AMT), i = pick(rnd, ITEMS);
    out.push(k % 9 === 8 ? one(PLAN(i, a), rec('plan_new', v)) : one(pick(rnd, SHAPES)(i, a), Q()));
  }
  return out;
}

/** 4 · Questions about the records, answered from the ledger. */
function tanya(split, rnd) {
  const dev = split === 'dev', periods = PERIODS[split], cats = QCATS[split];
  const out = [];
  const TOTAL = dev
    ? [(c, p) => `${c} ${p} berapa`, (c, p) => `berapa pengeluaran ${c} ${p}`, (c, p) => `total ${c} ${p}`, (c, p) => `habis berapa buat ${c} ${p}`]
    : [(c, p) => `${p} ${c} abis brp`, (c, p) => `duit buat ${c} ${p} keluar brp`, (c, p) => `jumlah ${c} ${p}?`, (c, p) => `${c} ${p} totalnya brp ya`];
  const COUNT = dev ? [(c, p) => `berapa kali ${c} ${p}`, (c, p) => `${c} ${p} udah berapa kali`] : [(c, p) => `udah brp kali ${c} ${p}`, (c, p) => `sering ga aku ${c} ${p}, brp kali`];
  const AVG = dev ? [(c, p) => `rata rata ${c} per hari ${p}`, (c, p) => `${c} sehari rata-rata berapa ${p}`] : [(c, p) => `rata2 ${c} sehari ${p} brp`, (c, p) => `${p} ${c} per harinya rata2 brp`];
  const MAX = dev ? [p => `pengeluaran terbesar ${p} apa`, p => `${p} paling gede keluar buat apa`] : [p => `${p} transaksi paling mahal apa`, p => `yg paling boros ${p} yg mana`];
  const WAL = dev ? [(w, p) => `pengeluaran pake ${w} ${p}`, (w, p) => `berapa yang keluar dari ${w} ${p}`] : [(w, p) => `${p} abis brp lewat ${w}`, (w, p) => `total bayar pk ${w} ${p}`];
  const MER = dev ? [(m, p) => `habis berapa di ${m} ${p}`, (m, p) => `berapa kali ke ${m} ${p}`] : [(m, p) => `${p} jajan di ${m} brp`, (m, p) => `udh brp x ke ${m} ${p}`];
  const LAST = dev ? [c => `kapan terakhir ${c}`, c => `terakhir kali ${c} kapan`] : [c => `${c} terakhir tgl brp`, c => `kpn terakhir aku ${c}`];
  const INC = dev ? [p => `pemasukan ${p} berapa`] : [p => `uang masuk ${p} brp`];
  for (let k = 0; k < 120; k++) {
    const [ptext, from, to] = pick(rnd, periods), [ctext, cname] = pick(rnd, cats), kind = k % 8;
    if (kind <= 2) { const l = ledger(inCat(cname), from, to); out.push(one(pick(rnd, TOTAL)(ctext, ptext), Q({ any: amountIs(l.total) }))); }
    else if (kind === 3) { const l = ledger(inCat(cname), from, to); out.push(one(pick(rnd, COUNT)(ctext, ptext), Q({ any: countIs(l.count) }))); }
    else if (kind === 4) {
      const [p2, f2, t2] = pick(rnd, periods.filter(p => p[2] !== p[1])), l = ledger(inCat(cname), f2, t2);
      out.push(one(pick(rnd, AVG)(ctext, p2), Q({ any: amountIs(l.total / daysIn(f2, t2)) })));
    } else if (kind === 5) { const l = ledger(ALL, from, to); out.push(one(pick(rnd, MAX)(ptext), Q({ any: [money(l.biggest.amount)] }))); }
    else if (kind === 6) {
      if (k % 16 === 6) { const w = pick(rnd, ['gopay', 'jago', 'cash']), l = ledger(walletIs(w), from, to); out.push(one(pick(rnd, WAL)(w, ptext), Q({ any: amountIs(l.total) }))); }
      else { const m = pick(rnd, QMERCHANTS[split]), l = ledger(merchantIs(m), from, to), shape = pick(rnd, MER); const text = shape(m.toLowerCase(), ptext); out.push(one(text, Q({ any: /kali|\bx\b/i.test(text) ? countIs(l.count) : amountIs(l.total) }))); }
    } else {
      if (k % 16 === 7) { const l = ledger(ALL, from, to, 'income'); out.push(one(pick(rnd, INC)(ptext), Q({ any: amountIs(l.total) }))); }
      else { const l = ledger(inCat(cname), '2026-08-01', TODAY); out.push(one(pick(rnd, LAST)(ctext), Q({ any: dayIs(l.last.date) }))); }
    }
  }
  return out;
}

/** 5 · Following up on an answer: another period, another category, one wallet, how often, a day's average. */
function lanjut(split, rnd) {
  const dev = split === 'dev', periods = PERIODS[split], cats = QCATS[split];
  const FIRST = dev ? (c, p) => `${c} ${p} habis berapa` : (c, p) => `brp duit ${c} ${p}`;
  const PER = dev ? p => `kalau ${p}` : p => `trs ${p} gmn`;
  const CAT = dev ? c => `kalo ${c}` : c => `klo yg ${c}?`;
  const WAL = dev ? w => `yang pake ${w} aja` : w => `yg lewat ${w} doang`;
  const OFTEN = dev ? 'itu berapa kali' : 'brp transaksi tuh';
  const out = [];
  for (let k = 0; k < 80; k++) {
    const [p1, f1, t1] = pick(rnd, periods), [c1, n1] = pick(rnd, cats), first = FIRST(c1, p1), kind = k % 4;
    if (kind === 0) { const [p2, f2, t2] = pick(rnd, periods.filter(p => p[0] !== p1 && p[1] + p[2] !== f1 + t1)); out.push(dlg([first, PER(p2)], Q({ any: amountIs(ledger(inCat(n1), f2, t2).total) }))); }
    else if (kind === 1) { const [c2, n2] = pick(rnd, cats.filter(c => c[1] !== n1)); out.push(dlg([first, CAT(c2)], Q({ any: amountIs(ledger(inCat(n2), f1, t1).total) }))); }
    else if (kind === 2) { const w = pick(rnd, ['gopay', 'jago', 'cash']); out.push(dlg([first, WAL(w)], Q({ any: amountIs(ledger(t => inCat(n1)(t) && t.walletId === w, f1, t1).total) }))); }
    else out.push(dlg([first, OFTEN], Q({ any: countIs(ledger(inCat(n1), f1, t1).count) })));
  }
  return out;
}

/** 6 · Other kinds of records: saving to a wallet or a goal, debts both ways, a budget, an office claim. */
function jenis(split, rnd) {
  const dev = split === 'dev', L = LEX[split];
  const AMT = dev ? [['500rb', 500000], ['200rb', 200000], ['1jt', 1000000], ['150rb', 150000]] : [['300rb', 300000], ['750rb', 750000], ['2jt', 2000000], ['250rb', 250000]];
  const out = [];
  const shapes = dev ? {
    save: (a, w) => `nabung ${a} ke ${w}`, goal: (a, g) => `nabung ${a} buat ${g}`, iborrow: (a, p) => `pinjem ${a} ke ${p}`, lent: (a, p) => `${p} pinjem duit ${a}`,
    paydebt: a => `bayar cicilan hp ${a}`, gotback: (a, p) => `${p} bayar utangnya ${a}`, budget: (a, c) => `budget ${c} ${a} sebulan`, claim: (a, x) => `klaim kantor ${a} buat ${x}`,
  } : {
    save: (a, w) => `sisihin ${a} ke rekening ${w}`, goal: (a, g) => `tabung ${a} untuk ${g}`, iborrow: (a, p) => `ngutang ${a} sama ${p}`, lent: (a, p) => `${p} ngutang ke aku ${a}`,
    paydebt: a => `nyicil kredivo ${a}`, gotback: (a, p) => `${p} udah balikin ${a}`, budget: (a, c) => `anggaran ${c} ${a} per bulan`, claim: (a, x) => `ajuin reimburse ${a} buat ${x}`,
  };
  const GOALS = dev ? [['liburan', 'Liburan Bali'], ['dana darurat', 'Dana Darurat']] : [['laptop baru', 'Laptop Baru'], ['ke bali', 'Liburan Bali']];
  const BCATS = dev ? ['makan', 'transport'] : ['hiburan', 'belanja'];
  const CLAIM = dev ? ['taksi meeting', 'makan klien'] : ['tiket kereta dinas', 'hotel dinas'];
  const BACK = dev ? ['budi', 'dimas'] : ['sari', 'dimas'];
  for (let k = 0; k < 96; k++) {
    const [a, v] = pick(rnd, AMT), kind = k % 8;
    if (kind === 0) { const w = pick(rnd, L.savings); out.push(one(shapes.save(a, w), rec('transfer', v, { to: WNAME[w] }))); }
    else if (kind === 1) { const [g] = pick(rnd, GOALS); out.push(one(shapes.goal(a, g), rec('target', v))); }
    else if (kind === 2) out.push(one(shapes.iborrow(a, pick(rnd, L.people)), rec('debt_new', v)));
    else if (kind === 3) out.push(one(shapes.lent(a, pick(rnd, L.people)), rec('receivable_new', v)));
    else if (kind === 4) out.push(one(shapes.paydebt(['300rb', '300000', 'tiga ratus ribu'][k % 3]), rec('debt_payment', 300000)));
    else if (kind === 5) { const p = pick(rnd, BACK), amt = p === 'budi' ? ['100rb', 100000] : p === 'sari' ? ['50rb', 50000] : ['250rb', 250000]; out.push(one(shapes.gotback(amt[0], p), rec('receivable_payment', amt[1]))); }
    else if (kind === 6) out.push(one(shapes.budget(['2jt', '1,5jt'][k % 2], pick(rnd, BCATS)), rec('budget', k % 2 ? 1500000 : 2000000)));
    else out.push(one(shapes.claim(a, pick(rnd, CLAIM)), rec('claim_new', v)));
  }
  return out;
}

/** 7 · A long message with one record in it. */
function cerita(split, rnd) {
  const dev = split === 'dev', L = LEX[split];
  const W = dev ? ['gopay', 'jago'] : ['jenius', 'mandiri'];
  const AMT = dev ? [['36rb', 36000], ['48rb', 48000], ['22rb', 22000], ['65rb', 65000]] : [['27rb', 27000], ['54rb', 54000], ['19rb', 19000], ['88rb', 88000]];
  const SHAPES = dev
    ? [(i, a, w) => `tadi tuh ya pulang kerja capek banget terus mampir beli ${i} ${a} bayarnya pake ${w}`, (i, a, w) => `jadi ceritanya aku laper banget siang ini, akhirnya beli ${i} ${a} pake ${w} deh`, (i, a, w) => `hari ini hujan terus, males keluar, tapi tetep beli ${i} juga ${a} via ${w} hehe`]
    : [(i, a, w) => `duh hari ini ribet bgt, abis meeting langsung cabut, sempet beli ${i} ${a} pk ${w}`, (i, a, w) => `pagi2 udah macet parah, nyampe kantor stres, beli ${i} ${a} bayarnya lewat ${w}`, (i, a, w) => `anak kos sebelah ngajak keluar, ujung2nya aku beli ${i} ${a} dr ${w} wkwk`];
  const out = [];
  for (let k = 0; k < 80; k++) {
    const [i, cat] = pick(rnd, L.items.filter(x => x[1] === 'Makan & Minum' || x[1] === 'Transportasi')), [a, v] = pick(rnd, AMT), w = pick(rnd, W);
    out.push(one(pick(rnd, SHAPES)(i, a, w), rec('expense', v, { cat, wallet: WNAME[w] })));
  }
  return out;
}

/** 8 · Changing a record: in the same message, on the card before saving, and after Simpan. */
function koreksi(split, rnd) {
  const dev = split === 'dev', L = LEX[split];
  const PAIRS = dev ? [[25, 20], [50, 45], [30, 28], [100, 90]] : [[35, 30], [60, 55], [18, 15], [120, 110]];
  const W = dev ? ['jenius', 'gopay'] : ['krom', 'mandiri'];
  const SAME = dev ? [(i, x, y) => `${i} ${x}rb eh ${y}rb deng`, (i, x, y) => `${i} ${x}rb, eh salah ${y}rb`, (i, x, y) => `${i} ${x}rb maksudnya ${y}rb`]
    : [(i, x, y) => `${i} ${x}rb ralat ${y}rb`, (i, x, y) => `${i} ${x}rb eh bentar, ${y}rb ding`, (i, x, y) => `${i} ${x}rb, koreksi jadi ${y}rb`];
  const NEXT_AMT = dev ? y => `eh ${y}rb` : y => `salah nominal, harusnya ${y}rb`;
  const NEXT_W = dev ? w => `bukan, pake ${w}` : w => `ganti dompetnya ke ${w}`;
  const NEXT_D = dev ? 'itu kemarin' : 'yg barusan tuh kemaren bukan hari ini';
  const AFTER_W = dev ? w => `eh harusnya ${w}` : w => `tadi bayarnya pk ${w} bukan yg itu`;
  const AFTER_A = dev ? y => `nominalnya salah, ${y}rb` : y => `ralat jumlahnya ${y}rb`;
  const out = [];
  for (let k = 0; k < 100; k++) {
    const [i] = pick(rnd, L.items), [x, y] = pick(rnd, PAIRS), w = pick(rnd, W), kind = k % 6;
    if (kind <= 1) out.push(one(pick(rnd, SAME)(i, x, y), rec('expense', y * 1000)));
    else if (kind === 2) out.push(dlg([`${i} ${x}rb`, NEXT_AMT(y)], rec('expense', y * 1000)));
    else if (kind === 3) out.push(dlg([`${i} ${x}rb`, NEXT_W(w)], rec('expense', x * 1000, { wallet: WNAME[w] })));
    else if (kind === 4) out.push(dlg([`${i} ${x}rb`, NEXT_D], rec('expense', x * 1000, { date: YDAY })));
    else out.push(dlg([`${i} ${x}rb`, S, k % 12 === 5 ? AFTER_W(w) : AFTER_A(y)], { upd: k % 12 === 5 ? { target: 'saved', wallet: WNAME[w] } : { target: 'saved', total: y * 1000 } }));
  }
  return out;
}

/** 9 · When it happened. */
function tanggal(split, rnd) {
  const dev = split === 'dev', L = LEX[split];
  const DAYS = dev
    ? [['senin kemarin', '2026-10-12'], ['jumat lalu', '2026-10-09'], ['2 hari lalu', '2026-10-13'], ['kemarin lusa', '2026-10-13'], ['tgl 3', '2026-10-03'], ['tanggal 10 kemarin', '2026-10-10'], ['semalem', YDAY], ['tadi pagi', TODAY], ['minggu lalu hari rabu', '2026-10-07']]
    : [['selasa kemaren', '2026-10-13'], ['sabtu kemarin', '2026-10-10'], ['3 hari yg lalu', '2026-10-12'], ['tgl 9', '2026-10-09'], ['tanggal 2 bulan ini', '2026-10-02'], ['kemaren sore', YDAY], ['td siang', TODAY], ['minggu kemarin hari kamis', '2026-10-08'], ['4 hari lalu', '2026-10-11']];
  const SHAPES = dev ? [(d, i, a) => `${d} ${i} ${a}`, (d, i, a) => `${i} ${a} ${d}`] : [(d, i, a) => `${i} ${d} ${a}`, (d, i, a) => `${d} sempet beli ${i} ${a}`];
  const out = [];
  for (let k = 0; k < 90; k++) {
    const [d, date] = DAYS[k % DAYS.length], [i] = pick(rnd, L.items), n = pick(rnd, dev ? [15, 25, 40, 60] : [12, 33, 47, 70]);
    out.push(one(pick(rnd, SHAPES)(d, i, `${n}rb`), rec('expense', n * 1000, { date })));
  }
  return out;
}

/** 10 · Heavy typing shortcuts and typos in a record. */
function ketik(split, rnd) {
  const dev = split === 'dev';
  const ITEMS = dev ? [['mkn siang', 'Makan & Minum'], ['bli bnsin', 'Transportasi'], ['byr listrk', 'Tagihan'], ['prkir', 'Transportasi'], ['jjn', 'Makan & Minum'], ['kpi', 'Makan & Minum'], ['ojk', 'Transportasi']]
    : [['mkan mlm', 'Makan & Minum'], ['isi bensn', 'Transportasi'], ['bayr pulsa', 'Tagihan'], ['parkr', 'Transportasi'], ['ngopi2', 'Makan & Minum'], ['beli obt', 'Kesehatan'], ['grb', 'Transportasi']];
  const LEAD = dev ? ['pk', 'pke', 'pkai'] : ['pkek', 'lwt', 'dri'];
  const W = dev ? ['gopay', 'jago', 'cash'] : ['gopay', 'jenius', 'cash'];
  const AMT = dev ? [['25rb', 25000], ['15k', 15000], ['300rb', 300000], ['5rb', 5000]] : [['35rb', 35000], ['12k', 12000], ['50rb', 50000], ['3rb', 3000]];
  const out = [];
  for (let k = 0; k < 90; k++) {
    const [i, cat] = pick(rnd, ITEMS), [a, v] = pick(rnd, AMT), w = pick(rnd, W);
    out.push(one(`${i} ${a} ${pick(rnd, LEAD)} ${w}`, rec('expense', v, { cat, wallet: WNAME[w] })));
  }
  return out;
}

/** 11 · Menus and how-tos, in many ways of asking. */
function menu(split) {
  const dev = split === 'dev';
  const list = dev ? [
    ['where can i see my budget', ['budgets']], ['gmn cr hps dompet', ['wallets', 'help']], ['mau liat laporan bulanan', ['report', 'analytics']], ['cara ganti tema', ['settings']], ['pindah ke mode gelap', ['settings']],
    ['ganti pin', ['settings']], ['cara export ke excel', ['settings', 'transactions']], ['buka anggaran', ['budgets']], ['liat semua transaksi', ['transactions']], ['daftar utang', ['debts']],
    ['tujuan dana aku mana', ['funds']], ['buka wishlist', ['wishlist']], ['tagihan rutin', ['recurring']], ['cara split bill', ['splitbill', 'help']], ['scan struk dong', ['scan']],
    ['mau atur kategori', ['categories']], ['show my wallets', ['wallets']], ['open settings', ['settings']], ['cara bikin pengingat', ['recurring', 'upcoming', 'help', 'settings']], ['cara ubah ukuran huruf', ['settings']],
    ['gimana cara nyembunyiin nominal', ['settings']], ['klaim kantor', ['claims']], ['liat piutang', ['receivables']], ['kalender keuangan', ['calendar', 'upcoming']], ['insight keuangan', ['advisor']],
    ['cara hapus kategori', ['categories', 'help']], ['cara edit dompet', ['wallets', 'help']], ['bantuan', null], ['mau impor mutasi bank', ['settings', 'inbox']], ['cara undang pasangan ke ruang bersama', ['settings', 'help']],
  ] : [
    ['how do i check my spending report', ['report', 'analytics']], ['gmn cr tmbh dmpt', ['wallets']], ['pengen liat rekap per bulan', ['report', 'analytics']], ['tema warna ganti dimana', ['settings']], ['dark mode dong', ['settings']],
    ['ubah kode pin', ['settings']], ['download data ke csv', ['settings', 'transactions']], ['menu budget', ['budgets']], ['riwayat transaksi', ['transactions']], ['hutangku ada apa aja liatnya dimana', ['debts']],
    ['target tabungan', ['funds']], ['wish list ku', ['wishlist']], ['langganan bulanan', ['recurring']], ['patungan bareng temen gimana', ['splitbill', 'help']], ['foto struk', ['scan']],
    ['kelola kategori', ['categories']], ['take me to wallets', ['wallets']], ['pengaturan', ['settings']], ['cara pasang reminder', ['recurring', 'upcoming', 'help', 'settings']], ['font kegedean gimana ngecilinnya', ['settings']],
    ['sembunyiin saldo', ['settings']], ['reimburse kantor', ['claims']], ['yang utang ke aku siapa aja', ['receivables']], ['jadwal tagihan', ['calendar', 'upcoming', 'recurring']], ['analisa keuangan', ['advisor', 'analytics']],
    ['cara ganti nama kategori', ['categories', 'help']], ['ubah saldo awal dompet', ['wallets', 'help']], ['tolong panduannya', null], ['upload mutasi rekening', ['settings', 'inbox']], ['cara ngajak istri pakai bareng', ['settings', 'help']],
  ];
  return list.map(([say, views]) => one(say, views ? { notRecord: true, notUnknown: true, open: views } : { notRecord: true, notUnknown: true, intent: ['help', 'howto'] }));
}

/** 12 · Chit-chat and feelings: the right kind of answer, never a record or "tidak paham". */
function ngobrol(split) {
  const dev = split === 'dev';
  const list = dev ? [
    ['aku sedih banget hari ini', ['curhat', 'mood']], ['capek kerja terus', ['curhat', 'mood']], ['kamu pinter juga ya', ['smalltalk', 'banter', 'thanks']], ['makasih banyak ya bot', ['thanks']], ['kamu bego banget sih', ['angry']],
    ['kasih jokes dong', ['joke']], ['halo selamat pagi', ['greet']], ['kamu robot ya', ['about', 'smalltalk']], ['lagi bokek parah', ['mood']], ['tanggal tua nih pusing', ['mood']],
    ['wkwk receh', ['banter']], ['maaf ya tadi kasar', ['apology']], ['serius dong jawabnya', ['serious']], ['kamu bisa apa aja', ['help']], ['kasih contoh kalimat', ['examples']],
    ['main tebak angka yuk', ['game']], ['tips nabung dong', ['tips']], ['aku pengen beli rumah gimana caranya', ['goal', 'tips', 'afford']], ['bosen banget', ['smalltalk', 'curhat']], ['good night', ['smalltalk', 'greet']],
  ] : [
    ['hari ini rasanya berat bgt', ['curhat', 'mood']], ['lelah bgt sama kerjaan', ['curhat', 'mood']], ['keren juga kamu', ['smalltalk', 'banter', 'thanks']], ['thanks ya udah bantu', ['thanks']], ['dasar bot ga guna', ['angry']],
    ['ada lelucon ga', ['joke']], ['hai met siang', ['greet']], ['kamu ai beneran?', ['about', 'smalltalk']], ['duit abis tinggal receh', ['mood']], ['gajian masih lama bgt huhu', ['mood', 'payday']],
    ['ngakak wkwkwk', ['banter']], ['sori td ngegas', ['apology']], ['udah jangan becanda', ['serious']], ['fiturnya apa aja sih', ['help']], ['contoh cara nulisnya gmn', ['examples']],
    ['suit yuk', ['game']], ['gimana biar ga boros', ['tips']], ['mau mulai nabung buat nikah', ['goal', 'tips', 'afford']], ['gabut nih', ['smalltalk', 'curhat']], ['met bobo', ['smalltalk', 'greet']],
  ];
  return list.map(([say, intents]) => one(say, { notRecord: true, notUnknown: true, intent: intents }));
}

/** 13 · 10.4 Chit-chat the rules do not catch (English, shorthand, slang): the trained model decides. `label` is the
 * model's own intent for it (bench/v104/run-model.mjs scores the model alone on these). */
const MAKSUD_OK = { greet: ['greet'], thanks: ['thanks'], help: ['help', 'examples', 'module', 'howto'], about: ['about', 'faq', 'smalltalk'], summary: ['summary'], budget: ['budget'], payday: ['payday'], tips: ['tips'], mood: ['mood', 'curhat'], curhat: ['curhat', 'mood'], joke: ['joke', 'riddle', 'fun'], banter: ['banter', 'smalltalk'], angry: ['angry', 'swear'], apology: ['apology'], smalltalk: ['smalltalk', 'banter'], goal: ['goal', 'tips'], game: ['game'], serious: ['serious'] };
function maksud(split) {
  const dev = split === 'dev';
  const list = dev ? {
    greet: ['good morning bot', 'hlo kak', 'pagi min ada orang?', 'hey there'],
    thanks: ['thank u so much', 'mksh bnyk ya', 'appreciate it', 'nuhun pisan'],
    help: ['what can you do', 'km bs ngapain aj', 'what features do you have', 'gw hrs ngetik apaan'],
    about: ['are you a real person', 'km tuh siapa sih sbnrnya', 'is my data safe', 'kamu pake chatgpt?'],
    summary: ['how are my finances', 'gmn kondisi keuanganku bln ini', 'give me a summary', 'rekapin dong duit gw'],
    budget: ['is my budget ok', 'budget gw aman ga sih', 'which budget is almost gone', 'anggrn ku gmn'],
    payday: ['when is payday', 'brp hr lg gajian', 'how many days until salary', 'gajian msh lama ga'],
    tips: ['any tips to save money', 'gmn biar irit', 'how do i stop overspending', 'kasih trik ngatur gaji dong'],
    mood: ['im broke', 'duit gw abis bgt', 'so stressed about money', 'kantong kering bgt nih'],
    curhat: ['i feel so sad today', 'lg galau parah', 'my boss yelled at me', 'abis putus sm pacar'],
    joke: ['tell me a joke', 'ksh jokes dong', 'make me laugh', 'pantun duit dong'],
    banter: ['lmao', 'wkwkwk garing bgt', 'haha so funny', 'receh lu'],
    angry: ['you are useless', 'bot goblok', 'this app sucks', 'lemot bgt sih lu'],
    apology: ['sorry about that', 'maap ya td', 'my bad', 'maafin gw ya bot'],
    smalltalk: ['how are you', 'lg ngapain km', 'what are you doing', 'udh makan blm'],
    goal: ['i want to save for a car', 'pgn nabung bwt nikah', 'i want to buy a house next year', 'mau ngumpulin duit bwt umroh'],
    game: ['lets play a game', 'main yuk gabut', 'play rock paper scissors', 'tebak2an angka yuk'],
    serious: ['be serious please', 'srius dong', 'stop joking', 'ga usah becanda deh'],
  } : {
    greet: ['hello assistant', 'hai bot met sore', 'evening!', 'halo2'],
    thanks: ['thanks a lot', 'trims ya kak', 'thank you very much', 'makasi bgt'],
    help: ['how does this work', 'ini bs dipake buat apa aj', 'what are your features', 'bingung cara makenya'],
    about: ['are you a robot', 'km manusia ato bot', 'do you need internet', 'siapa yg bikin km'],
    summary: ['how is my money doing', 'keuangan gw gmn bln ini', 'monthly overview please', 'rangkumin pengeluaran gw'],
    budget: ['check my budgets', 'budgetku over ga', 'any budget running out', 'cek anggaran dong min'],
    payday: ['how long until payday', 'kpn gajian', 'when do i get paid', 'gaji turun kapan ya'],
    tips: ['give me saving tips', 'biar hemat gmn caranya', 'how can i spend less', 'saran biar duit cukup'],
    mood: ['i have no money left', 'lg seret bgt', 'worried about my bills', 'dompet tipis bgt'],
    curhat: ['i am so tired of everything', 'lagi down bgt', 'had a terrible day', 'dimarahin ortu'],
    joke: ['say something funny', 'ada jokes ga', 'got any jokes', 'tebak tebakan dong'],
    banter: ['lol', 'hahaha jayus', 'that was funny', 'kocak lu'],
    angry: ['you are stupid', 'bot payah', 'worst app ever', 'ngeselin bgt sih'],
    apology: ['i am sorry', 'sori ya', 'my apologies', 'maaf td emosi'],
    smalltalk: ['whats up', 'km lg sibuk?', 'do you sleep', 'udh mandi blm'],
    goal: ['i want to save for vacation', 'pengen beli laptop thn depan', 'saving for my wedding', 'mau bikin dana darurat'],
    game: ['wanna play', 'ayo maen', 'flip a coin', 'main suit yuk bosen'],
    serious: ['please be serious', 'fokus dong', 'no more jokes', 'udahan becandanya'],
  };
  return Object.entries(list).flatMap(([label, says]) => says.map(say => ({ label, ...one(say, { notRecord: true, notUnknown: true, intent: MAKSUD_OK[label] }) })));
}

export const FAMILIES = { angka: 'Nominal kata & format', inggris: 'Bahasa Inggris', bukan: 'Ada angka, bukan catatan', tanya: 'Tanya catatan', lanjut: 'Pertanyaan lanjutan', jenis: 'Nabung, utang, anggaran, klaim', cerita: 'Cerita panjang', koreksi: 'Koreksi', tanggal: 'Tanggal', ketik: 'Singkatan & salah ketik', menu: 'Menu & cara', ngobrol: 'Ngobrol & perasaan', maksud: 'Obrolan di luar aturan (model)' };
const GEN = { angka, inggris, bukan, tanya, lanjut, jenis, cerita, koreksi, tanggal, ketik, menu, ngobrol, maksud };

export function build(split) {
  const out = [];
  for (const [fam, fn] of Object.entries(GEN)) {
    const rnd = random((split === 'dev' ? 1000 : 7000) + fam.length * 31 + fam.charCodeAt(0));
    fn(split, rnd).forEach((c, i) => out.push({ id: `${fam}${i + 1}`, fam, ...c }));
  }
  return out;
}
