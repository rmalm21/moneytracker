/**
 * Catat otomatis V3 — first held-out set (v30-heldout-first).
 *
 * Written after V3 was built, before it was run on these sentences, and run once: its first result is kept as is in
 * bench/quick/REPORT-v3.md. Any fix made after that run turns this set into development data (the report says so).
 * Same context as the development set (bench/quick/fixtures-v30dev.mjs). Today is Saturday 26 September 2026.
 *
 * Covers (spec 104): merchant + wallet adjacent, person + wallet adjacent, multi-word and numeric merchants, implicit
 * wallets, no "di", no "pake", decimal money, two actions, corrections, references, debt, receivable, transfer,
 * ambiguous destination, and casual spelling / typos (spec 106).
 */
export { ctx, today } from './fixtures-v30dev.mjs';

const a = (kind, amount, extra = {}) => ({ kind, ...(amount !== undefined ? { amount } : {}), ...extra });
const T = '2026-09-26', KEMARIN = '2026-09-25';

const raw = [
  // Merchant + wallet adjacent, multi-word, numeric, implicit wallet.
  ['h01', ['merchant', 'boundary', 'wallet'], 'nasi padang di sederhana 28k jenius', [a('expense', 28000, { description: 'Nasi Padang', merchant: 'Sederhana', wallet: 'jenius' })]],
  ['h02', ['merchant', 'boundary', 'wallet'], 'beli es krim di mixue 16rb gopay', [a('expense', 16000, { description: 'Es Krim', merchant: 'Mixue', wallet: 'gopay' })]],
  ['h03', ['merchant', 'boundary', 'wallet'], 'cukur di barber king 35k cash', [a('expense', 35000, { description: 'Cukur', merchant: 'Barber King', wallet: 'cash' })]],
  ['h04', ['merchant', 'boundary', 'wallet'], 'roti bakar di 99 cafe 22rb bri', [a('expense', 22000, { description: 'Roti Bakar', merchant: '99 Cafe', wallet: 'bri' })]],
  ['h05', ['merchant', 'boundary', 'wallet'], 'tahu bulat di depan gang 5rb krom', [a('expense', 5000, { description: 'Tahu Bulat', merchant: 'Depan Gang', wallet: 'krom' })]],
  ['h06', ['merchant', 'wallet'], 'teh tarik janji jiwa 18k jago', [a('expense', 18000, { description: 'Teh Tarik', merchant: 'Janji Jiwa', wallet: 'jago' })]],
  ['h07', ['merchant', 'boundary', 'wallet'], 'beli charger di erafone 120rb mandiri', [a('expense', 120000, { description: 'Charger', merchant: 'Erafone', wallet: 'mandiri' })]],
  ['h08', ['merchant', 'boundary', 'wallet', 'date'], 'kemarin bakmi di gm 45rb pake jenius', [a('expense', 45000, { date: KEMARIN, description: 'Bakmi', merchant: 'Gm', wallet: 'jenius' })]],
  ['h09', ['merchant', 'wallet'], 'aqua 4rb krom', [a('expense', 4000, { description: 'Aqua', merchant: null, wallet: 'krom' })]],
  ['h10', ['merchant', 'boundary', 'wallet', 'amount'], 'sewa sepeda di taman kota 12,5k cash', [a('expense', 12500, { description: 'Sewa Sepeda', merchant: 'Taman Kota', wallet: 'cash' })]],
  ['h11', ['merchant', 'wallet'], 'kopi susu tomoro 19k gopay', [a('expense', 19000, { description: 'Kopi Susu', merchant: 'Tomoro', wallet: 'gopay' })]],
  ['h12', ['merchant', 'boundary', 'wallet'], 'beli sandal di toko pak haji 60rb krom', [a('expense', 60000, { description: 'Sandal', merchant: 'Toko Pak Haji', wallet: 'krom' })]],
  ['h13', ['merchant', 'wallet'], 'makan siang 27rb jago', [a('expense', 27000, { description: 'Makan Siang', merchant: null, wallet: 'jago' })]],
  // Typos / casual spelling of known entities.
  ['h14', ['merchant', 'wallet', 'typo'], 'roti indomart 9rb krom', [a('expense', 9000, { description: 'Roti', merchant: 'Indomaret', wallet: 'krom' })]],
  ['h15', ['merchant', 'wallet', 'typo'], 'susu di famili mart 21k jago', [a('expense', 21000, { description: 'Susu', merchant: 'Family Mart', wallet: 'jago' })]],
  ['h16', ['wallet', 'typo'], 'bensin 40rb mandri', [a('expense', 40000, { wallet: 'mandiri' })]],
  ['h17', ['wallet', 'typo'], 'pulsa 50rb pake jenus', [a('expense', 50000, { wallet: 'jenius' })]],
  ['h18', ['date', 'typo'], 'kmren beli gas 25rb cash', [a('expense', 25000, { date: KEMARIN, wallet: 'cash' })]],
  ['h19', ['to', 'from', 'typo'], 'trf 300rb dr jago ke mandri', [a('transfer', 300000, { wallet: 'jago', to: 'mandiri' })]],
  // Person + wallet adjacent, to / from, ambiguous destination.
  ['h20', ['to', 'person', 'wallet'], 'transfer ke dina 75rb dari jenius', [a('expense', 75000, { wallet: 'jenius', to: null, person: 'Dina' })]],
  ['h21', ['to', 'person', 'wallet'], 'kirim uang ke ibu 500rb pake bri', [a('expense', 500000, { wallet: 'bri', to: null, person: 'Ibu' })]],
  ['h22', ['to', 'from'], 'pindahin 250rb dari krom ke gopay', [a('transfer', 250000, { wallet: 'krom', to: 'gopay' })]],
  ['h23', ['to'], 'top up gopay 150rb', [a('transfer', 150000, { to: 'gopay', review: ['wallet'], ask: 'wallet' })]],
  ['h24', ['to', 'from'], 'isi saldo jago 1jt dari bri', [a('transfer', 1_000_000, { wallet: 'bri', to: 'jago' })]],
  ['h25', ['to', 'person'], 'tf ke rudi 100rb jago', [a('debt_payment', 100000, { link: 'd1', wallet: 'jago' })]],
  ['h26', ['from', 'person'], 'dapat transferan 300rb dari pak eko masuk mandiri', [a('income', 300000, { wallet: 'mandiri' })]],
  // Debt / receivable / claim and direction.
  ['h27', ['person', 'relation'], 'dina minjemin aku 200rb masuk jago', [a('debt_new', 200000, { person: 'Dina', wallet: 'jago' })]],
  ['h28', ['person', 'relation'], 'aku minjemin dina 200rb pake krom', [a('receivable_new', 200000, { person: 'Dina', wallet: 'krom' })]],
  ['h29', ['person', 'relation'], 'pinjem 500rb dari kak tio', [a('debt_new', 500000, { person: 'Tio' })]],
  ['h30', ['link'], 'bayar pinjaman rudi 150rb pake mandiri', [a('debt_payment', 150000, { link: 'd1', wallet: 'mandiri' })]],
  ['h31', ['link'], 'sinta udah balikin 250rb masuk jenius', [a('receivable_payment', 250000, { link: 'r1', wallet: 'jenius' })]],
  ['h32', ['person'], 'nalangin makan siang tono 40rb jago', [a('receivable_new', 40000, { person: 'Tono', wallet: 'jago' })]],
  ['h33', ['link'], 'klaim dinas surabaya cair 1,2jt masuk mandiri', [a('claim_payment', 1_200_000, { link: 'c1', wallet: 'mandiri' })]],
  // Corrections and negation on entities.
  ['h34', ['wallet', 'correction'], 'ayam geprek 20rb gopay eh cash', [a('expense', 20000, { wallet: 'cash' })]],
  ['h35', ['merchant', 'correction'], 'kopi di fore 25k eh di tomoro', [a('expense', 25000, { merchant: 'Tomoro' })]],
  ['h36', ['amount', 'correction'], 'parkir 3rb eh 5rb cash', [a('expense', 5000, { wallet: 'cash' })]],
  ['h37', ['wallet', 'correction'], 'beli buku 80rb bukan pake jago, krom', [a('expense', 80000, { wallet: 'krom' })]],
  ['h38', ['person', 'correction'], 'pinjemin bagas 100rb eh bukan bagas, dimas', [a('receivable_new', 100000, { person: 'Dimas' })]],
  ['h39', ['date', 'correction'], 'makan 30rb kemarin eh tadi', [a('expense', 30000, { date: T })]],
  // Two actions, references.
  ['h40', ['segmentation', 'merchant', 'wallet'], 'cilok di depan sekolah 10rb cash terus es teh di kantin 5rb cash', [a('expense', 10000, { merchant: 'Depan Sekolah', wallet: 'cash' }), a('expense', 5000, { merchant: 'Kantin', wallet: 'cash' })]],
  ['h41', ['segmentation', 'wallet'], 'bensin 30rb krom, makan 25rb jago', [a('expense', 30000, { wallet: 'krom' }), a('expense', 25000, { wallet: 'jago' })]],
  ['h42', ['coref', 'wallet'], 'beli pulsa 25rb sama kuota 50rb, yang kuota pake jenius', [a('expense', 25000), a('expense', 50000, { wallet: 'jenius' })]],
  ['h43', ['coref', 'merchant', 'wallet'], 'roti di indomaret 12rb sama kopi di fore 20rb, yang di fore pake gopay', [a('expense', 12000, { merchant: 'Indomaret' }), a('expense', 20000, { merchant: 'Fore', wallet: 'gopay' })]],
  ['h44', ['coref', 'wallet'], 'makan 20rb sama parkir 2rb, dua-duanya cash', [a('expense', 20000, { wallet: 'cash' }), a('expense', 2000, { wallet: 'cash' })]],
  // Decimal money, plain numbers, no-amount, negatives.
  ['h45', ['amount', 'wallet'], 'servis hp 1,5jt mandiri', [a('expense', 1_500_000, { wallet: 'mandiri' })]],
  ['h46', ['amount', 'merchant'], 'cetak foto di kodak 7.5k', [a('expense', 7500, { description: 'Cetak Foto', merchant: 'Kodak' })]],
  ['h47', ['negative'], 'iphone 16 bagus ga ya', []],
  ['h48', ['amount'], 'beli gorengan pake cash', [a('expense', undefined, { wallet: 'cash', review: ['amount'] })]],
  ['h49', ['person', 'amount'], 'kasih uang jajan adik 50rb cash', [a('expense', 50000, { wallet: 'cash' })]],
  ['h50', ['merchant', 'wallet'], 'nonton di xxi 50rb jenius', [a('expense', 50000, { description: 'Nonton', merchant: 'Xxi', wallet: 'jenius' })]],
];

export const cases = raw.map(([id, tags, text, actions]) => ({ id, tags, text, actions, set: 'heldout' }));
