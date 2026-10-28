/**
 * Catat otomatis 6.8 — everyday language, development set (A). Used while building 6.8, so its numbers are development
 * numbers. State: fixtures-v68state.mjs (the real default taxonomy, Thu 15 Oct 2026, 15:00).
 *
 * What people type every day, as the person reported it:
 *   - item + category word + amount + a place with no "di" after the amount ("soyjoy jajan 25k bedeng");
 *   - a meal time as the category, with the food as the description ("nasi padang buat makan malam", "sarapan bubur");
 *   - snacks and drinks known by their names (Soyjoy, Oreo, Aqua);
 *   - words after the amount that are not a place (units, fuel types, the vehicle, payment words, time words).
 * No regional language on purpose. wallet '' = none named: the app then uses the default wallet.
 */
import { C } from './fixtures-v68state.mjs';
const JAJAN = C('Jajan'), MINUM = C('Kopi & Minuman'), SARAPAN = C('Sarapan'), SIANG = C('Makan Siang'), MALAM = C('Makan Malam'), FOOD = 'expense.makan-minum';
const T = '2026-10-15', K = '2026-10-14';

export const cases = [
  // Item + category word + amount + place without "di".
  { id: 'p1', group: 'tempat', text: 'soyjoy jajan 25k bedeng', expect: { kind: 'expense', amount: 25000, description: 'soyjoy', cat: JAJAN, merchant: 'bedeng', wallet: '' } },
  { id: 'p2', group: 'tempat', text: 'chitato jajan 10rb indomaret', expect: { amount: 10000, description: 'chitato', cat: JAJAN, merchant: 'indomaret', wallet: '' } },
  { id: 'p3', group: 'tempat', text: 'soyjoy 25k bedeng', expect: { amount: 25000, description: 'soyjoy', cat: JAJAN, merchant: 'bedeng' } },
  { id: 'p4', group: 'tempat', text: 'soyjoy jajan 25k bedeng gopay', expect: { amount: 25000, description: 'soyjoy', cat: JAJAN, merchant: 'bedeng', wallet: 'gopay' } },
  { id: 'p5', group: 'tempat', text: 'es teh 5rb kantin', expect: { amount: 5000, description: 'es teh', cat: MINUM, merchant: 'kantin' } },
  { id: 'p6', group: 'tempat', text: 'bakso 15rb pak kumis', expect: { amount: 15000, description: 'bakso', cat: FOOD, merchant: 'pak kumis' } },
  { id: 'p7', group: 'tempat', text: 'roti jajan 8rb alfamart cash', expect: { amount: 8000, description: 'roti', cat: JAJAN, merchant: 'alfamart', wallet: 'cash' } },
  { id: 'p8', group: 'tempat', text: 'mie ayam 12k bedeng', expect: { amount: 12000, description: 'mie ayam', cat: FOOD, merchant: 'bedeng' } },
  { id: 'p9', group: 'tempat', text: 'jajan 25k bedeng', expect: { amount: 25000, description: 'jajan', cat: JAJAN, merchant: 'bedeng' } },
  { id: 'p10', group: 'tempat', text: 'kopi susu 18rb kopi kenangan jago', expect: { amount: 18000, description: 'kopi susu', cat: MINUM, merchant: 'kopi kenangan', wallet: 'jago' } },
  { id: 'p11', group: 'tempat', text: 'mie ayam di bedeng 12k', expect: { amount: 12000, description: 'mie ayam', merchant: 'bedeng' } },
  { id: 'p12', group: 'tempat', text: 'jajan di bedeng 25k', expect: { amount: 25000, description: 'jajan', cat: JAJAN, merchant: 'bedeng' } },
  { id: 'p13', group: 'tempat', text: 'tadi beli soyjoy 25k bedeng', expect: { amount: 25000, description: 'soyjoy', cat: JAJAN, merchant: 'bedeng', date: T } },
  // Meal times: the category, while the food stays the description.
  { id: 'm1', group: 'waktu makan', text: 'nasi padang buat makan malam 25rb', expect: { amount: 25000, description: 'nasi padang', cat: MALAM } },
  { id: 'm2', group: 'waktu makan', text: 'nasi padang buat sarapan 20rb', expect: { amount: 20000, description: 'nasi padang', cat: SARAPAN } },
  { id: 'm3', group: 'waktu makan', text: 'nasi padang sarapan 20rb', expect: { amount: 20000, description: 'nasi padang', cat: SARAPAN } },
  { id: 'm4', group: 'waktu makan', text: 'sarapan nasi padang 20rb', expect: { amount: 20000, description: 'nasi padang', cat: SARAPAN } },
  { id: 'm5', group: 'waktu makan', text: 'makan malam nasi padang 25rb', expect: { amount: 25000, description: 'nasi padang', cat: MALAM } },
  { id: 'm6', group: 'waktu makan', text: 'nasi padang 25rb buat makan siang', expect: { amount: 25000, description: 'nasi padang', cat: SIANG } },
  { id: 'm7', group: 'waktu makan', text: 'bubur ayam sarapan 12rb', expect: { amount: 12000, description: 'bubur ayam', cat: SARAPAN } },
  { id: 'm8', group: 'waktu makan', text: 'sarapan bubur ayam 12rb gopay', expect: { amount: 12000, description: 'bubur ayam', cat: SARAPAN, wallet: 'gopay' } },
  { id: 'm9', group: 'waktu makan', text: 'makan siang soto 18rb', expect: { amount: 18000, description: 'soto', cat: SIANG } },
  { id: 'm10', group: 'waktu makan', text: 'pecel lele makan malem 22rb', expect: { amount: 22000, description: 'pecel lele', cat: MALAM } },
  { id: 'm11', group: 'waktu makan', text: 'nasgor buat dinner 20rb', expect: { amount: 20000, description: 'nasgor', cat: MALAM } },
  { id: 'm12', group: 'waktu makan', text: 'lunch mie ayam 15rb', expect: { amount: 15000, description: 'mie ayam', cat: SIANG } },
  { id: 'm13', group: 'waktu makan', text: 'nasi padang untuk makan malam 25rb', expect: { amount: 25000, description: 'nasi padang', cat: MALAM } },
  { id: 'm14', group: 'waktu makan', text: 'beli nasi padang buat makan malam 25rb', expect: { amount: 25000, description: 'nasi padang', cat: MALAM } },
  { id: 'm15', group: 'waktu makan', text: 'nasi padang buat makan malam 25rb di sederhana', expect: { amount: 25000, description: 'nasi padang', cat: MALAM, merchant: 'sederhana' } },
  { id: 'm16', group: 'waktu makan', text: 'makan siang di warteg 15rb', expect: { amount: 15000, description: 'makan siang', cat: SIANG, merchant: 'warteg' } },
  { id: 'm17', group: 'waktu makan', text: 'sarapan 15rb', expect: { amount: 15000, description: 'sarapan', cat: SARAPAN } },
  { id: 'm18', group: 'waktu makan', text: 'makan malam 30rb', expect: { amount: 30000, description: 'makan malam', cat: MALAM } },
  { id: 'm19', group: 'waktu makan', text: 'kemarin sarapan nasi uduk 10rb', expect: { amount: 10000, description: 'nasi uduk', cat: SARAPAN, date: K } },
  { id: 'm20', group: 'waktu makan', text: 'ngemil keripik 10rb', expect: { amount: 10000, description: 'keripik', cat: JAJAN } },
  { id: 'm21', group: 'waktu makan', text: 'nasi padang 25rb', expect: { amount: 25000, description: 'nasi padang', cat: FOOD } },
  { id: 'm22', group: 'waktu makan', text: 'ayam geprek makan siang 20rb jago', expect: { amount: 20000, description: 'ayam geprek', cat: SIANG, wallet: 'jago' } },
  // Snacks and drinks by name.
  { id: 's1', group: 'barang', text: 'beli soyjoy 12rb di indomaret', expect: { amount: 12000, description: 'soyjoy', cat: JAJAN, merchant: 'indomaret' } },
  { id: 's2', group: 'barang', text: 'oreo 9rb alfamart', expect: { amount: 9000, description: 'oreo', cat: JAJAN, merchant: 'alfamart' } },
  { id: 's3', group: 'barang', text: 'silverqueen 18rb', expect: { amount: 18000, description: 'silverqueen', cat: JAJAN } },
  { id: 's4', group: 'barang', text: 'aqua 4rb', expect: { amount: 4000, description: 'aqua', cat: MINUM } },
  { id: 's5', group: 'barang', text: 'teh pucuk 4rb', expect: { amount: 4000, description: 'teh pucuk', cat: MINUM } },
  { id: 's6', group: 'barang', text: 'pocari 8rb', expect: { amount: 8000, description: 'pocari', cat: MINUM } },
  { id: 's7', group: 'barang', text: 'martabak 35rb', expect: { amount: 35000, description: 'martabak', cat: JAJAN } },
  { id: 's8', group: 'barang', text: 'gorengan 5rb', expect: { amount: 5000, description: 'gorengan', cat: JAJAN } },
  { id: 's9', group: 'barang', text: 'beng beng 3rb', expect: { amount: 3000, description: 'beng beng', cat: JAJAN } },
  { id: 's10', group: 'barang', text: 'yakult 10rb', expect: { amount: 10000, description: 'yakult', cat: MINUM } },
  // Words after the amount that are not a place.
  { id: 'n1', group: 'bukan tempat', text: 'bensin 30rb pertalite', expect: { amount: 30000, cat: C('Bensin'), noMerchant: true } },
  { id: 'n2', group: 'bukan tempat', text: 'parkir 2rb motor', expect: { amount: 2000, cat: C('Parkir'), noMerchant: true } },
  { id: 'n3', group: 'bukan tempat', text: 'nasi padang 25rb 2 bungkus', expect: { amount: 25000, cat: FOOD, noMerchant: true } },
  { id: 'n4', group: 'bukan tempat', text: 'soyjoy 25k qris', expect: { amount: 25000, cat: JAJAN, noMerchant: true } },
  { id: 'n5', group: 'bukan tempat', text: 'soyjoy 25k kemarin', expect: { amount: 25000, cat: JAJAN, noMerchant: true, date: K } },
  { id: 'n6', group: 'bukan tempat', text: 'kopi tubruk 18rb', expect: { amount: 18000, description: 'kopi tubruk', cat: MINUM, noMerchant: true } },
  { id: 'n7', group: 'bukan tempat', text: 'jajan 15rb doang', expect: { amount: 15000, cat: JAJAN, noMerchant: true } },
  { id: 'n8', group: 'bukan tempat', text: 'soyjoy 25k jajan', expect: { amount: 25000, description: 'soyjoy', cat: JAJAN, noMerchant: true } },
  { id: 'n9', group: 'bukan tempat', text: 'nasi padang 25rb tadi siang', expect: { amount: 25000, cat: FOOD, noMerchant: true, date: T } },
  { id: 'n10', group: 'bukan tempat', text: 'bensin 50rb full', expect: { amount: 50000, cat: C('Bensin'), noMerchant: true } },
  { id: 'n11', group: 'bukan tempat', text: 'parkir 5rb mobil cash', expect: { amount: 5000, cat: C('Parkir'), wallet: 'cash', noMerchant: true } },
  { id: 'n12', group: 'bukan tempat', text: 'aqua 4rb 2 botol', expect: { amount: 4000, cat: MINUM, noMerchant: true } },
  // Several in one message.
  { id: 'g1', group: 'beberapa', text: 'soyjoy 25k bedeng, kopi susu 18rb kopi kenangan', expect: { actions: [{ amount: 25000, description: 'soyjoy', merchant: 'bedeng', cat: JAJAN }, { amount: 18000, description: 'kopi susu', merchant: 'kopi kenangan', cat: MINUM }] } },
  { id: 'g2', group: 'beberapa', text: 'sarapan bubur 12rb, makan siang soto 18rb', expect: { actions: [{ amount: 12000, description: 'bubur', cat: SARAPAN }, { amount: 18000, description: 'soto', cat: SIANG }] } },
  { id: 'g3', group: 'beberapa', text: 'nasi padang buat makan malam 25rb terus es teh 5rb', expect: { actions: [{ amount: 25000, description: 'nasi padang', cat: MALAM }, { amount: 5000, description: 'es teh', cat: MINUM }] } },
];
