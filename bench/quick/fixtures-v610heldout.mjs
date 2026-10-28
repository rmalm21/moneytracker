/**
 * Catat otomatis 6.10 — everyday language, third round, held-out set (B). Written before the 6.10 engine changes, with
 * other items, wallets and phrasings than the development set, excluded from the shadow run and never run before the
 * first frozen run (heldout-first/v610-heldout-first.json). State: fixtures-v68state.mjs (Thu 15 Oct 2026, 15:00).
 */
import { C } from './fixtures-v68state.mjs';
const FOOD = 'expense.makan-minum', MINUM = C('Kopi & Minuman'), JAJAN = C('Jajan'), FAST = C('Fast Food');
const T = '2026-10-15';

export const cases = [
  { id: 'x1', group: 'dompet disingkat', text: 'soto 18rb mdr', expect: { amount: 18000, description: 'soto', wallet: 'mandiri', noMerchant: true } },
  { id: 'x2', group: 'dompet disingkat', text: 'roti 10rb gopy', expect: { amount: 10000, description: 'roti', wallet: 'gopay', noMerchant: true } },
  { id: 'x3', group: 'dompet disingkat', text: 'parkir 2rb jns', expect: { amount: 2000, description: 'parkir', cat: C('Parkir'), wallet: 'jenius', noMerchant: true } },
  { id: 'x4', group: 'dompet disingkat', text: 'mie ayam 15rb via gpy', expect: { amount: 15000, description: 'mie ayam', wallet: 'gopay', noMerchant: true } },
  { id: 'x5', group: 'dompet disingkat', text: 'teh tarik 12rb jgo', expect: { amount: 12000, description: 'teh tarik', cat: MINUM, wallet: 'jago', noMerchant: true } },
  { id: 'x6', group: 'dompet lain', text: 'bakso 15rb dana', expect: { amount: 15000, description: 'bakso', cat: FOOD, wallet: '', noMerchant: true } },
  { id: 'x7', group: 'dompet lain', text: 'parkir 4rb ovo', expect: { amount: 4000, description: 'parkir', wallet: '', noMerchant: true } },
  { id: 'x8', group: 'dompet lain', text: 'kopi 25rb bni', expect: { amount: 25000, description: 'kopi', cat: MINUM, wallet: '', noMerchant: true } },
  { id: 'x9', group: 'dompet lain', text: 'pulsa 25rb pake dana', expect: { amount: 25000, description: 'pulsa', cat: C('Pulsa'), wallet: '' } },
  { id: 'x10', group: 'kata seru', text: 'astaga mahal banget bensin 50rb', expect: { amount: 50000, description: 'bensin', cat: C('Bensin') } },
  { id: 'x11', group: 'kata seru', text: 'akhirnya beli helm 250rb', expect: { amount: 250000, description: 'helm' } },
  { id: 'x12', group: 'kata seru', text: 'cuma beli air mineral 5rb', expect: { amount: 5000, description: 'air mineral', cat: MINUM } },
  { id: 'x13', group: 'kata seru', text: 'yaampun parkir 15rb', expect: { amount: 15000, description: 'parkir', cat: C('Parkir') } },
  { id: 'x14', group: 'kata seru', text: 'gila mahal amat kopi 45rb', expect: { amount: 45000, description: 'kopi', cat: MINUM } },
  { id: 'x15', group: 'kata seru', text: 'lumayan dapet bonus 500rb', expect: { kind: 'income', amount: 500000, description: 'bonus', cat: C('Bonus') } },
  { id: 'x16', group: 'kata seru', text: 'huft bayar listrik 300rb', expect: { amount: 300000, description: 'listrik', cat: C('Listrik') } },
  { id: 'x17', group: 'waktu', text: 'pagi ini beli nasi uduk 12rb', expect: { amount: 12000, description: 'nasi uduk', cat: FOOD, date: T } },
  { id: 'x18', group: 'waktu', text: 'malam ini beli pecel lele 20rb', expect: { amount: 20000, description: 'pecel lele', cat: FOOD, date: T } },
  { id: 'x19', group: 'waktu', text: 'subuh tadi beli kopi 8rb', expect: { amount: 8000, description: 'kopi', cat: MINUM, date: T } },
  { id: 'x20', group: 'waktu', text: 'sore ini parkir 3rb', expect: { amount: 3000, description: 'parkir', cat: C('Parkir'), date: T } },
  { id: 'x21', group: 'waktu', text: 'barusan aja beli pulsa 10rb', expect: { amount: 10000, description: 'pulsa', cat: C('Pulsa'), date: T } },
  { id: 'x22', group: 'nominal', text: '10rb-an parkir', expect: { amount: 10000, description: 'parkir', cat: C('Parkir') } },
  { id: 'x23', group: 'nominal', text: 'token listrik 100 ribu rupiah', expect: { amount: 100000, description: 'token listrik', cat: C('Listrik'), noMerchant: true } },
  { id: 'x24', group: 'nominal', text: 'galon 20 ribu rupiah', expect: { amount: 20000, description: 'galon', noMerchant: true } },
  { id: 'x25', group: 'uang saku', text: 'uang saku anak 100rb', expect: { kind: 'expense', amount: 100000, description: 'uang saku anak' } },
  { id: 'x26', group: 'uang saku', text: 'lumayan uang kaget 10rb', expect: { kind: 'income', amount: 10000, description: 'uang kaget' } },
  { id: 'x27', group: 'uang saku', text: 'uang jajan dari papa 100rb', expect: { kind: 'income', amount: 100000, description: 'uang jajan' } },
  { id: 'x28', group: 'uang saku', text: 'menang lomba 200rb', expect: { kind: 'income', amount: 200000, cat: C('Hadiah Uang') } },
  { id: 'x29', group: 'dua barang', text: 'nasi sama ayam goreng 25rb', expect: { amount: 25000, description: 'nasi & ayam goreng', cat: FOOD } },
  { id: 'x30', group: 'dua barang', text: 'roti dan susu 20rb', expect: { amount: 20000, description: 'roti & susu', cat: FOOD } },
  { id: 'x31', group: 'dua barang', text: 'oli sama tambal ban 60rb', expect: { amount: 60000, description: 'oli & tambal ban' } },
  { id: 'x32', group: 'dua barang', text: 'ngopi sama temen 30rb', expect: { amount: 30000, description: 'ngopi', cat: MINUM } },
  { id: 'x33', group: 'merek', text: 'hokben 55rb', expect: { amount: 55000, merchant: 'hokben', cat: FAST } },
  { id: 'x34', group: 'merek', text: 'pizza hut 120rb jago', expect: { amount: 120000, merchant: 'pizza hut', cat: FOOD, wallet: 'jago' } },
  { id: 'x35', group: 'merek', text: 'janji jiwa 20rb', expect: { amount: 20000, merchant: 'janji jiwa', cat: MINUM } },
  { id: 'x36', group: 'merek', text: 'es kopi susu kopken 20rb', expect: { amount: 20000, description: 'es kopi susu', merchant: 'kopi kenangan', cat: MINUM } },
  { id: 'x37', group: 'merek', text: 'mekdi 40rb', expect: { amount: 40000, merchant: "mcdonald's", cat: FAST } },
  { id: 'x38', group: 'merek', text: 'martabk 30rb', expect: { amount: 30000, cat: JAJAN } },
  { id: 'x39', group: 'merek', text: 'seblack 15rb', expect: { amount: 15000, cat: FOOD } },
  { id: 'x40', group: 'paylater', text: 'bayar akulaku 250rb', expect: { kind: 'expense', amount: 250000, cat: C('Tagihan Lainnya'), person: '' } },
  { id: 'x41', group: 'paylater', text: 'cicilan spaylater 200rb', expect: { kind: 'expense', amount: 200000, cat: C('Tagihan Lainnya'), person: '' } },
  { id: 'x42', group: 'nitip', text: 'nitip beli martabak 30rb', expect: { amount: 30000, description: 'martabak', cat: JAJAN } },
  { id: 'x43', group: 'kontrol', text: 'makan siang di warteg 15rb gopay', expect: { amount: 15000, description: 'makan siang', merchant: 'warteg', wallet: 'gopay' } },
  { id: 'x44', group: 'kontrol', text: 'sabun cuci 12rb', expect: { amount: 12000, description: 'sabun cuci', wallet: '' } },
  { id: 'x45', group: 'kontrol', text: 'jual hp bekas 1,5jt', expect: { kind: 'income', amount: 1500000 } },
  { id: 'x46', group: 'kontrol', text: 'grab ke stasiun 20rb jago', expect: { amount: 20000, description: 'grab ke stasiun', wallet: 'jago', noMerchant: true } },
  { id: 'x47', group: 'kontrol', text: 'kopi 15rb kantin', expect: { amount: 15000, description: 'kopi', merchant: 'kantin', cat: MINUM } },
];
