/**
 * Catat otomatis 6.10 — everyday language, third round, development set (A). Used while building 6.10. State:
 * fixtures-v68state.mjs (the real default taxonomy, Thu 15 Oct 2026, 15:00; wallets Jago, GoPay, Jenius, Mandiri, BRI,
 * Krom, Cash). No regional language.
 *
 * From an exploration of what people type that 6.9 still misread: a wallet written short ("gpy", "mndr", "jns"), a
 * wallet that is not set up written bare after the amount ("15rb ovo"), exclamations and evaluative words ("duh boros
 * banget", "akhirnya", "cuma"), the time of day with "ini" or "subuh", amount forms ("15k-an", "50 ribu rupiah"),
 * pocket money and "uang kaget", two things joined by "sama / dan", chains and fast food by name ("kopken", "mcd"), a
 * typo of a food word ("bakzo"), paylater bills, and "nitip". wallet '' = none named: the app uses the default wallet.
 */
import { C } from './fixtures-v68state.mjs';
const FOOD = 'expense.makan-minum', TRANS = 'expense.transportasi', MINUM = C('Kopi & Minuman'), JAJAN = C('Jajan'), FAST = C('Fast Food');
const T = '2026-10-15';

export const cases = [
  // A wallet that is set up, written short.
  { id: 'a1', group: 'dompet disingkat', text: 'nasgor 15rb gpy', expect: { amount: 15000, description: 'nasgor', cat: FOOD, wallet: 'gopay', noMerchant: true } },
  { id: 'a2', group: 'dompet disingkat', text: 'kopi 18rb mndr', expect: { amount: 18000, description: 'kopi', cat: MINUM, wallet: 'mandiri', noMerchant: true } },
  { id: 'a3', group: 'dompet disingkat', text: 'bensin 30rb jns', expect: { amount: 30000, description: 'bensin', cat: C('Bensin'), wallet: 'jenius', noMerchant: true } },
  { id: 'a4', group: 'dompet disingkat', text: 'makan 20rb jgo', expect: { amount: 20000, description: 'makan', cat: FOOD, wallet: 'jago', noMerchant: true } },
  { id: 'a5', group: 'dompet disingkat', text: 'parkir 5rb pke gpy', expect: { amount: 5000, description: 'parkir', cat: C('Parkir'), wallet: 'gopay', noMerchant: true } },
  { id: 'a6', group: 'dompet disingkat', text: 'kopi 20rb pke jago', expect: { amount: 20000, description: 'kopi', wallet: 'jago', noMerchant: true } },
  // A wallet that is not set up, bare after the amount: how it was paid, not the item or the place.
  { id: 'b1', group: 'dompet lain', text: 'nasi goreng 15rb ovo', expect: { amount: 15000, description: 'nasi goreng', cat: FOOD, wallet: '', noMerchant: true } },
  { id: 'b2', group: 'dompet lain', text: 'bensin 30rb bca', expect: { amount: 30000, description: 'bensin', cat: C('Bensin'), wallet: '', noMerchant: true } },
  { id: 'b3', group: 'dompet lain', text: 'beli pulsa 20rb dana', expect: { amount: 20000, description: 'pulsa', cat: C('Pulsa'), wallet: '', noMerchant: true } },
  { id: 'b4', group: 'dompet lain', text: 'parkir 3rb shopeepay', expect: { amount: 3000, description: 'parkir', cat: C('Parkir'), wallet: '', noMerchant: true } },
  // Exclamations and evaluative words are not what was bought.
  { id: 'c1', group: 'kata seru', text: 'duh boros banget jajan 50rb', expect: { amount: 50000, description: 'jajan', cat: JAJAN } },
  { id: 'c2', group: 'kata seru', text: 'akhirnya beli sepatu 300rb', expect: { amount: 300000, description: 'sepatu', cat: C('Sepatu') } },
  { id: 'c3', group: 'kata seru', text: 'anjir mahal parkir 10rb', expect: { amount: 10000, description: 'parkir', cat: C('Parkir') } },
  { id: 'c4', group: 'kata seru', text: 'cuma jajan 10rb', expect: { amount: 10000, description: 'jajan', cat: JAJAN } },
  { id: 'c5', group: 'kata seru', text: 'hari ini cuma beli kopi 15rb', expect: { amount: 15000, description: 'kopi', cat: MINUM, date: T } },
  { id: 'c6', group: 'kata seru', text: 'lumayan dapet cashback 15rb', expect: { kind: 'income', amount: 15000, description: 'cashback', cat: C('Cashback') } },
  { id: 'c7', group: 'kata seru', text: 'wah beli boba 25rb', expect: { amount: 25000, description: 'boba', cat: MINUM } },
  { id: 'c8', group: 'kata seru', text: 'waduh kena tilang 100rb', expect: { amount: 100000, description: 'tilang', cat: C('Denda') } },
  { id: 'c9', group: 'kata seru', text: 'bensin rp 30.000 aja', expect: { amount: 30000, description: 'bensin', cat: C('Bensin') } },
  // The time of day is the date, not the description.
  { id: 'd1', group: 'waktu', text: 'pagi ini sarapan 15rb', expect: { amount: 15000, description: 'sarapan', cat: C('Sarapan'), date: T } },
  { id: 'd2', group: 'waktu', text: 'sore ini ngopi 25rb', expect: { amount: 25000, description: 'ngopi', cat: MINUM, date: T } },
  { id: 'd3', group: 'waktu', text: 'malam ini beli martabak 35rb', expect: { amount: 35000, description: 'martabak', cat: JAJAN, date: T } },
  { id: 'd4', group: 'waktu', text: 'tadi subuh beli bubur 10rb', expect: { amount: 10000, description: 'bubur', cat: FOOD, date: T } },
  { id: 'd5', group: 'waktu', text: 'barusan aja isi bensin 30rb', expect: { amount: 30000, description: 'bensin', cat: C('Bensin'), date: T } },
  { id: 'd6', group: 'waktu', text: 'siang ini makan 20rb', expect: { amount: 20000, description: 'makan', cat: FOOD, date: T } },
  // Amount forms.
  { id: 'e1', group: 'nominal', text: '15k-an parkir', expect: { amount: 15000, description: 'parkir', cat: C('Parkir') } },
  { id: 'e2', group: 'nominal', text: 'pulsa 50 ribu rupiah', expect: { amount: 50000, description: 'pulsa', cat: C('Pulsa'), noMerchant: true } },
  // Pocket money and "uang kaget".
  { id: 'f1', group: 'uang saku', text: 'uang saku adek 50rb', expect: { kind: 'expense', amount: 50000, description: 'uang saku adek' } },
  { id: 'f2', group: 'uang saku', text: 'uang kaget 20rb', expect: { kind: 'income', amount: 20000, description: 'uang kaget' } },
  { id: 'f3', group: 'uang saku', text: 'dapet uang kaget 50rb', expect: { kind: 'income', amount: 50000, description: 'uang kaget' } },
  { id: 'f4', group: 'uang saku', text: 'uang saku dari mama 200rb', expect: { kind: 'income', amount: 200000, description: 'uang saku' } },
  { id: 'f5', group: 'uang saku', text: 'jajan anak 20rb', expect: { kind: 'expense', amount: 20000, description: 'jajan anak' } },
  { id: 'f6', group: 'uang saku', text: 'menang giveaway 100rb', expect: { kind: 'income', amount: 100000, cat: C('Hadiah Uang') } },
  // Two things joined by "sama / dan" are both what was bought.
  { id: 'g1', group: 'dua barang', text: 'kopi sama roti 30rb', expect: { amount: 30000, description: 'kopi & roti', cat: FOOD } },
  { id: 'g2', group: 'dua barang', text: 'bensin sama parkir 35rb', expect: { amount: 35000, description: 'bensin & parkir', cat: TRANS } },
  { id: 'g3', group: 'dua barang', text: 'es teh dan gorengan 12rb', expect: { amount: 12000, description: 'es teh & gorengan', cat: FOOD } },
  { id: 'g4', group: 'dua barang', text: 'makan sama temen 50rb', expect: { amount: 50000, description: 'makan', cat: FOOD } },
  // Chains and fast food by name; a typo of a food word.
  { id: 'h1', group: 'merek', text: 'kopken 22rb', expect: { amount: 22000, merchant: 'kopi kenangan', cat: MINUM } },
  { id: 'h2', group: 'merek', text: 'gacoan 30rb', expect: { amount: 30000, merchant: 'gacoan', cat: FOOD } },
  { id: 'h3', group: 'merek', text: 'mcd 45rb', expect: { amount: 45000, merchant: "mcdonald's", cat: FAST } },
  { id: 'h4', group: 'merek', text: 'kfc 50rb gopay', expect: { amount: 50000, merchant: 'kfc', cat: FAST, wallet: 'gopay' } },
  { id: 'h5', group: 'merek', text: 'beli kopi gula aren di kopken 22rb', expect: { amount: 22000, description: 'kopi gula aren', merchant: 'kopi kenangan', cat: MINUM } },
  { id: 'h6', group: 'merek', text: 'burger king 60rb', expect: { amount: 60000, merchant: 'burger king', cat: FAST } },
  { id: 'h7', group: 'merek', text: 'makan di mekdi 50rb', expect: { amount: 50000, description: 'makan', merchant: "mcdonald's", cat: FAST } },
  { id: 'h8', group: 'merek', text: 'bakzo 15rb', expect: { amount: 15000, cat: FOOD } },
  // Paylater is a bill, never a person.
  { id: 'i1', group: 'paylater', text: 'bayar spaylater 150rb', expect: { kind: 'expense', amount: 150000, description: 'spaylater', cat: C('Tagihan Lainnya'), person: '' } },
  { id: 'i2', group: 'paylater', text: 'bayar kredivo 300rb', expect: { kind: 'expense', amount: 300000, cat: C('Tagihan Lainnya'), person: '' } },
  { id: 'i3', group: 'nitip', text: 'nitip kopi 20rb', expect: { amount: 20000, description: 'kopi', cat: MINUM } },
  // Controls that must keep working.
  { id: 'k1', group: 'kontrol', text: 'soyjoy jajan 25k bedeng', expect: { amount: 25000, description: 'soyjoy', merchant: 'bedeng', cat: JAJAN, wallet: '' } },
  { id: 'k2', group: 'kontrol', text: 'gojek ke kantor 15rb', expect: { amount: 15000, description: 'gojek ke kantor', cat: TRANS, noMerchant: true } },
  { id: 'k3', group: 'kontrol', text: 'beliin adek susu 20rb', expect: { amount: 20000, description: 'susu', cat: MINUM } },
  { id: 'k4', group: 'kontrol', text: 'makan di warteg 18rb pake cash', expect: { amount: 18000, description: 'makan', merchant: 'warteg', wallet: 'cash' } },
  { id: 'k5', group: 'kontrol', text: 'tf ke mama 500rb', expect: { kind: 'expense', amount: 500000, cat: C('Keluarga') } },
  { id: 'k6', group: 'kontrol', text: 'gajian 8jt', expect: { kind: 'income', amount: 8000000 } },
  { id: 'k7', group: 'kontrol', text: 'beli kopi 18rb sama roti 12rb', expect: { actions: [{ amount: 18000, description: 'kopi' }, { amount: 12000, description: 'roti' }] } },
  { id: 'k8', group: 'kontrol', text: 'kopi susu 18rb jago', expect: { amount: 18000, description: 'kopi susu', wallet: 'jago', noMerchant: true } },
  { id: 'k9', group: 'kontrol', text: 'sabun mandi 15rb', expect: { amount: 15000, description: 'sabun mandi', wallet: '' } },
  { id: 'k10', group: 'kontrol', text: 'jus alpukat 15rb', expect: { amount: 15000, description: 'jus alpukat', cat: MINUM, wallet: '' } },
  { id: 'k11', group: 'kontrol', text: 'uang bensin 50rb', expect: { amount: 50000, cat: C('Bensin') } },
  { id: 'k12', group: 'kontrol', text: 'top up gopay 100rb dari jago', expect: { kind: 'transfer', amount: 100000, wallet: 'jago', to: 'gopay' } },
];
