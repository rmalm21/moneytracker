/**
 * Catat otomatis 6.9 — everyday language, second round, development set (A). Used while building 6.9. State:
 * fixtures-v68state.mjs (the real default taxonomy, Thu 15 Oct 2026, 15:00). No regional language.
 *
 * From an exploration of what people type beyond food: small words around the amount ("abis", "keluar", "kena",
 * "harganya"), the period in the description ("wifi bulan ini"), rides with a destination ("gojek ke kantor"), buying
 * for someone ("beliin adek susu"), food delivery apps ("gofood ayam geprek"), paying with a wallet that is not set up
 * ("pake ovo"), a store alone ("indomaret 87rb"), money sent to family, and game top-ups (spending, not a transfer).
 * wallet '' = none named: the app uses the default wallet.
 */
import { C } from './fixtures-v68state.mjs';
const FOOD = 'expense.makan-minum', TRANS = 'expense.transportasi', MINUM = C('Kopi & Minuman'), JAJAN = C('Jajan');

export const cases = [
  // Small words around the amount.
  { id: 'a1', group: 'kata kecil', text: 'abis 30rb buat makan', expect: { kind: 'expense', amount: 30000, description: 'makan', cat: FOOD } },
  { id: 'a2', group: 'kata kecil', text: 'keluar 50rb buat bensin', expect: { kind: 'expense', amount: 50000, description: 'bensin', cat: C('Bensin') } },
  { id: 'a3', group: 'kata kecil', text: 'kena 25rb parkir', expect: { amount: 25000, description: 'parkir', cat: C('Parkir') } },
  { id: 'a4', group: 'kata kecil', text: 'parkir kena 5rb', expect: { amount: 5000, description: 'parkir', cat: C('Parkir') } },
  { id: 'a5', group: 'kata kecil', text: 'nasi padang harganya 25rb', expect: { amount: 25000, description: 'nasi padang', cat: FOOD } },
  { id: 'a6', group: 'kata kecil', text: 'habis 100rb buat belanja bulanan', expect: { amount: 100000, description: 'belanja bulanan', cat: C('Bahan Makanan') } },
  { id: 'a7', group: 'kata kecil', text: 'kepake 20rb buat parkir', expect: { amount: 20000, description: 'parkir', cat: C('Parkir') } },
  { id: 'a8', group: 'kata kecil', text: 'ngabisin 50rb buat nonton', expect: { amount: 50000, description: 'nonton', cat: C('Bioskop') } },
  { id: 'a9', group: 'kata kecil', text: 'bakso total 20rb', expect: { amount: 20000, description: 'bakso', cat: FOOD } },
  // The period is not part of the description.
  { id: 'b1', group: 'periode', text: 'wifi bulan ini 330rb', expect: { amount: 330000, description: 'wifi', cat: C('Internet') } },
  { id: 'b2', group: 'periode', text: 'spotify bulan ini 55rb', expect: { amount: 55000, description: 'spotify', cat: C('Musik') } },
  { id: 'b3', group: 'periode', text: 'iuran rt bulan ini 50rb', expect: { amount: 50000, description: 'iuran rt', cat: C('Iuran') } },
  { id: 'b4', group: 'periode', text: 'listrik minggu ini 50rb', expect: { amount: 50000, description: 'listrik', cat: C('Listrik') } },
  // Rides with a destination: the trip is the description, the destination is not where it was bought.
  { id: 'c1', group: 'perjalanan', text: 'gojek ke kantor 15rb', expect: { amount: 15000, description: 'gojek ke kantor', cat: TRANS, noMerchant: true } },
  { id: 'c2', group: 'perjalanan', text: 'grab pulang 25rb gopay', expect: { amount: 25000, description: 'grab pulang', cat: TRANS, wallet: 'gopay', noMerchant: true } },
  { id: 'c3', group: 'perjalanan', text: 'ojol ke stasiun 12rb', expect: { amount: 12000, description: 'ojol ke stasiun', cat: TRANS, noMerchant: true } },
  { id: 'c4', group: 'perjalanan', text: 'gocar ke bandara 120rb', expect: { amount: 120000, description: 'gocar ke bandara', cat: TRANS, noMerchant: true } },
  { id: 'c5', group: 'perjalanan', text: 'naik ojek ke pasar 10rb', expect: { amount: 10000, description: 'ojek ke pasar', cat: TRANS, noMerchant: true } },
  { id: 'c6', group: 'perjalanan', text: 'maxim ke kampus 9rb', expect: { amount: 9000, description: 'maxim ke kampus', cat: TRANS, noMerchant: true } },
  { id: 'c7', group: 'perjalanan', text: 'grab ke rumah 30rb jago', expect: { amount: 30000, description: 'grab ke rumah', cat: TRANS, wallet: 'jago', noMerchant: true } },
  { id: 'c8', group: 'perjalanan', text: 'krl ke bogor 5rb', expect: { amount: 5000, description: 'krl ke bogor', cat: TRANS, noMerchant: true } },
  // Bought for someone.
  { id: 'd1', group: 'untuk orang', text: 'beliin adek susu 20rb', expect: { amount: 20000, description: 'susu', cat: MINUM } },
  { id: 'd2', group: 'untuk orang', text: 'beliin mama obat 35rb', expect: { amount: 35000, description: 'obat', cat: C('Obat') } },
  { id: 'd3', group: 'untuk orang', text: 'beli obat 35rb buat ibu', expect: { amount: 35000, description: 'obat', cat: C('Obat') } },
  { id: 'd4', group: 'untuk orang', text: 'beliin istri martabak 40rb', expect: { amount: 40000, description: 'martabak', cat: JAJAN } },
  // Food delivery apps: the food is the description.
  { id: 'e1', group: 'pesan antar', text: 'gofood ayam geprek 25rb', expect: { amount: 25000, description: 'ayam geprek', cat: C('Delivery') } },
  { id: 'e2', group: 'pesan antar', text: 'shopeefood martabak 40rb', expect: { amount: 40000, description: 'martabak', cat: C('Delivery') } },
  { id: 'e3', group: 'pesan antar', text: 'pesen gofood bakso 30rb', expect: { amount: 30000, description: 'bakso', cat: C('Delivery') } },
  { id: 'e4', group: 'pesan antar', text: 'grabfood nasi goreng 28rb gopay', expect: { amount: 28000, description: 'nasi goreng', cat: C('Delivery'), wallet: 'gopay' } },
  // Paying with a wallet that is not set up: not the description, the default wallet stays.
  { id: 'f1', group: 'cara bayar', text: 'jajan 20rb pake ovo', expect: { amount: 20000, description: 'jajan', cat: JAJAN, wallet: '' } },
  { id: 'f2', group: 'cara bayar', text: 'parkir 5rb via shopeepay', expect: { amount: 5000, description: 'parkir', cat: C('Parkir'), wallet: '' } },
  { id: 'f3', group: 'cara bayar', text: 'kopi 18rb pakai linkaja', expect: { amount: 18000, description: 'kopi', cat: MINUM, wallet: '' } },
  { id: 'f4', group: 'cara bayar', text: 'makan 30rb via qris', expect: { amount: 30000, description: 'makan', cat: FOOD } },
  // A store alone.
  { id: 'g1', group: 'toko saja', text: 'indomaret 87rb', expect: { kind: 'expense', amount: 87000, merchant: 'indomaret' } },
  { id: 'g2', group: 'toko saja', text: 'alfamart 45rb gopay', expect: { kind: 'expense', amount: 45000, merchant: 'alfamart', wallet: 'gopay' } },
  { id: 'g3', group: 'toko saja', text: 'superindo 230rb', expect: { kind: 'expense', amount: 230000, merchant: 'superindo', cat: C('Bahan Makanan') } },
  // Money sent to family.
  { id: 'h1', group: 'keluarga', text: 'tf ke mama 500rb', expect: { kind: 'expense', amount: 500000, cat: C('Keluarga') } },
  { id: 'h2', group: 'keluarga', text: 'kirim uang ke adek 200rb', expect: { kind: 'expense', amount: 200000, cat: C('Keluarga') } },
  { id: 'h3', group: 'keluarga', text: 'transfer ke ibu 1jt', expect: { kind: 'expense', amount: 1000000, cat: C('Keluarga') } },
  // Game top-ups are spending; a wallet top-up stays a transfer.
  { id: 'i1', group: 'top up', text: 'top up game 30rb', expect: { kind: 'expense', amount: 30000 } },
  { id: 'i2', group: 'top up', text: 'topup diamond ml 50rb', expect: { kind: 'expense', amount: 50000 } },
  { id: 'i3', group: 'top up', text: 'top up gopay 100rb dari jago', expect: { kind: 'transfer', amount: 100000, wallet: 'jago', to: 'gopay' } },
  // Controls that must keep working.
  { id: 'j1', group: 'kontrol', text: 'makan di warteg 18rb pake cash', expect: { amount: 18000, description: 'makan', merchant: 'warteg', wallet: 'cash' } },
  { id: 'j2', group: 'kontrol', text: 'gajian 8jt', expect: { kind: 'income', amount: 8000000 } },
  { id: 'j3', group: 'kontrol', text: 'isi saldo gopay 100rb dari jago', expect: { kind: 'transfer', amount: 100000, wallet: 'jago', to: 'gopay' } },
  { id: 'j4', group: 'kontrol', text: 'soyjoy jajan 25k bedeng', expect: { amount: 25000, description: 'soyjoy', merchant: 'bedeng', cat: JAJAN } },
  { id: 'j5', group: 'kontrol', text: 'nasi padang buat makan malam 25rb', expect: { amount: 25000, description: 'nasi padang', cat: C('Makan Malam') } },
  { id: 'j6', group: 'kontrol', text: 'beli kopi 18rb sama roti 12rb', expect: { actions: [{ amount: 18000, description: 'kopi' }, { amount: 12000, description: 'roti' }] } },
  { id: 'j7', group: 'kontrol', text: 'ceban parkir', expect: { amount: 10000, description: 'parkir', cat: C('Parkir') } },
  { id: 'j8', group: 'kontrol', text: 'obat batuk 25rb apotek', expect: { amount: 25000, description: 'obat batuk', merchant: 'apotek', cat: C('Obat') } },
];
