/**
 * Catat otomatis 6.9 — everyday language, second round, held-out set (B). Written before the 6.9 engine changes, with
 * other phrasings than the development set, excluded from the shadow run and never run before the first frozen run
 * (heldout-first/v69-heldout-first.json). State: fixtures-v68state.mjs (Thu 15 Oct 2026, 15:00).
 */
import { C } from './fixtures-v68state.mjs';
const FOOD = 'expense.makan-minum', TRANS = 'expense.transportasi', MINUM = C('Kopi & Minuman'), JAJAN = C('Jajan');

export const cases = [
  { id: 'k1', group: 'kata kecil', text: 'abis 25rb buat ngopi', expect: { kind: 'expense', amount: 25000, description: 'ngopi', cat: MINUM } },
  { id: 'k2', group: 'kata kecil', text: 'keluar 15rb buat parkir', expect: { amount: 15000, description: 'parkir', cat: C('Parkir') } },
  { id: 'k3', group: 'kata kecil', text: 'soto harganya 18rb', expect: { amount: 18000, description: 'soto', cat: FOOD } },
  { id: 'k4', group: 'kata kecil', text: 'tol kena 12rb', expect: { amount: 12000, description: 'tol', cat: C('Tol') } },
  { id: 'k5', group: 'kata kecil', text: 'habis 40rb buat bensin', expect: { amount: 40000, description: 'bensin', cat: C('Bensin') } },
  { id: 'k6', group: 'periode', text: 'netflix bulan ini 54rb', expect: { amount: 54000, description: 'netflix', cat: C('Film & Streaming') } },
  { id: 'k7', group: 'periode', text: 'internet bulan ini 300rb', expect: { amount: 300000, description: 'internet', cat: C('Internet') } },
  { id: 'k8', group: 'periode', text: 'paket data bulan ini 75rb', expect: { amount: 75000, description: 'paket data', cat: C('Paket Data') } },
  { id: 'k9', group: 'perjalanan', text: 'gojek ke stasiun 18rb', expect: { amount: 18000, description: 'gojek ke stasiun', cat: TRANS, noMerchant: true } },
  { id: 'k10', group: 'perjalanan', text: 'grab ke kantor 22rb jago', expect: { amount: 22000, description: 'grab ke kantor', cat: TRANS, wallet: 'jago', noMerchant: true } },
  { id: 'k11', group: 'perjalanan', text: 'ojek pulang 15rb', expect: { amount: 15000, description: 'ojek pulang', cat: TRANS, noMerchant: true } },
  { id: 'k12', group: 'perjalanan', text: 'gocar ke mall 45rb gopay', expect: { amount: 45000, description: 'gocar ke mall', cat: TRANS, wallet: 'gopay', noMerchant: true } },
  { id: 'k13', group: 'perjalanan', text: 'ojol ke kampus 11rb', expect: { amount: 11000, description: 'ojol ke kampus', cat: TRANS, noMerchant: true } },
  { id: 'k14', group: 'untuk orang', text: 'beliin bapak rokok 30rb', expect: { amount: 30000, description: 'rokok' } },
  { id: 'k15', group: 'untuk orang', text: 'beliin anak susu 25rb', expect: { amount: 25000, description: 'susu' } },
  { id: 'k16', group: 'untuk orang', text: 'beliin pacar boba 30rb', expect: { amount: 30000, description: 'boba', cat: MINUM } },
  { id: 'k17', group: 'pesan antar', text: 'gofood seblak 23rb', expect: { amount: 23000, description: 'seblak', cat: C('Delivery') } },
  { id: 'k18', group: 'pesan antar', text: 'grabfood sate ayam 35rb', expect: { amount: 35000, description: 'sate ayam', cat: C('Delivery') } },
  { id: 'k19', group: 'pesan antar', text: 'shopeefood mie ayam 20rb gopay', expect: { amount: 20000, description: 'mie ayam', cat: C('Delivery'), wallet: 'gopay' } },
  { id: 'k20', group: 'cara bayar', text: 'parkir 3rb pake linkaja', expect: { amount: 3000, description: 'parkir', cat: C('Parkir'), wallet: '' } },
  { id: 'k21', group: 'cara bayar', text: 'es teh 5rb via ovo', expect: { amount: 5000, description: 'es teh', cat: MINUM, wallet: '' } },
  { id: 'k22', group: 'cara bayar', text: 'bakso 15rb pakai shopeepay', expect: { amount: 15000, description: 'bakso', cat: FOOD, wallet: '' } },
  { id: 'k23', group: 'toko saja', text: 'lawson 32rb', expect: { kind: 'expense', amount: 32000, merchant: 'lawson' } },
  { id: 'k24', group: 'toko saja', text: 'alfamidi 28rb jago', expect: { kind: 'expense', amount: 28000, merchant: 'alfamidi', wallet: 'jago' } },
  { id: 'k25', group: 'keluarga', text: 'tf ke papa 300rb', expect: { kind: 'expense', amount: 300000, cat: C('Keluarga') } },
  { id: 'k26', group: 'keluarga', text: 'kirim ke ortu 1jt', expect: { kind: 'expense', amount: 1000000, cat: C('Keluarga') } },
  { id: 'k27', group: 'top up', text: 'top up free fire 25rb', expect: { kind: 'expense', amount: 25000 } },
  { id: 'k28', group: 'top up', text: 'topup steam 100rb', expect: { kind: 'expense', amount: 100000 } },
  { id: 'k29', group: 'top up', text: 'top up ovo 50rb dari jago', expect: { kind: 'transfer', amount: 50000, wallet: 'jago' } },
  { id: 'k30', group: 'kontrol', text: 'beli kopi 20rb di fore pake jago', expect: { amount: 20000, description: 'kopi', merchant: 'fore', wallet: 'jago' } },
  { id: 'k31', group: 'kontrol', text: 'bensin 30rb pertalite', expect: { amount: 30000, cat: C('Bensin'), noMerchant: true } },
  { id: 'k32', group: 'kontrol', text: 'sarapan lontong 8rb', expect: { amount: 8000, description: 'lontong', cat: C('Sarapan') } },
];
