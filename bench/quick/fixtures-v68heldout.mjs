/**
 * Catat otomatis 6.8 — everyday language, held-out set (B). Written before the 6.8 engine changes, with other items,
 * places and phrasings than the development set, and never looked at while building. The first run is frozen in
 * heldout-first/v68-heldout-first.json. State: fixtures-v68state.mjs (Thu 15 Oct 2026, 15:00).
 */
import { C } from './fixtures-v68state.mjs';
const JAJAN = C('Jajan'), MINUM = C('Kopi & Minuman'), SARAPAN = C('Sarapan'), SIANG = C('Makan Siang'), MALAM = C('Makan Malam'), FOOD = 'expense.makan-minum';
const T = '2026-10-15', K = '2026-10-14';

export const cases = [
  // Place after the amount, no "di".
  { id: 'h1', group: 'tempat', text: 'taro jajan 7rb alfamidi', expect: { amount: 7000, description: 'taro', cat: JAJAN, merchant: 'alfamidi', wallet: '' } },
  { id: 'h2', group: 'tempat', text: 'pocky 12k indomaret gopay', expect: { amount: 12000, description: 'pocky', cat: JAJAN, merchant: 'indomaret', wallet: 'gopay' } },
  { id: 'h3', group: 'tempat', text: 'es jeruk 6rb kantin kantor', expect: { amount: 6000, description: 'es jeruk', cat: MINUM, merchant: 'kantin kantor' } },
  { id: 'h4', group: 'tempat', text: 'siomay 15rb mang ujang', expect: { amount: 15000, description: 'siomay', merchant: 'mang ujang' } },
  { id: 'h5', group: 'tempat', text: 'roti bakar jajan 18rb bedeng jago', expect: { amount: 18000, description: 'roti bakar', cat: JAJAN, merchant: 'bedeng', wallet: 'jago' } },
  { id: 'h6', group: 'tempat', text: 'kemarin beli richeese 10rb alfamart', expect: { amount: 10000, description: 'richeese', cat: JAJAN, merchant: 'alfamart', date: K } },
  { id: 'h7', group: 'tempat', text: 'thai tea 15rb dum dum', expect: { amount: 15000, description: 'thai tea', cat: MINUM, merchant: 'dum dum' } },
  { id: 'h8', group: 'tempat', text: 'jajan 30rb pasar', expect: { amount: 30000, description: 'jajan', cat: JAJAN, merchant: 'pasar' } },
  // Meal times.
  { id: 'h9', group: 'waktu makan', text: 'ayam penyet buat makan malem 23rb', expect: { amount: 23000, description: 'ayam penyet', cat: MALAM } },
  { id: 'h10', group: 'waktu makan', text: 'lontong sayur sarapan 10rb', expect: { amount: 10000, description: 'lontong sayur', cat: SARAPAN } },
  { id: 'h11', group: 'waktu makan', text: 'sarapan roti 8rb', expect: { amount: 8000, description: 'roti', cat: SARAPAN } },
  { id: 'h12', group: 'waktu makan', text: 'makan siang nasi goreng 20rb gopay', expect: { amount: 20000, description: 'nasi goreng', cat: SIANG, wallet: 'gopay' } },
  { id: 'h13', group: 'waktu makan', text: 'gado gado buat makan siang 15rb', expect: { amount: 15000, description: 'gado gado', cat: SIANG } },
  { id: 'h14', group: 'waktu makan', text: 'nasi kuning 12rb buat sarapan', expect: { amount: 12000, description: 'nasi kuning', cat: SARAPAN } },
  { id: 'h15', group: 'waktu makan', text: 'dinner sate ayam 30rb', expect: { amount: 30000, description: 'sate ayam', cat: MALAM } },
  { id: 'h16', group: 'waktu makan', text: 'breakfast nasi uduk 12rb', expect: { amount: 12000, description: 'nasi uduk', cat: SARAPAN } },
  { id: 'h17', group: 'waktu makan', text: 'beli bakso untuk makan malam 20rb', expect: { amount: 20000, description: 'bakso', cat: MALAM } },
  { id: 'h18', group: 'waktu makan', text: 'mie goreng makan siang 13rb di warung', expect: { amount: 13000, description: 'mie goreng', cat: SIANG, merchant: 'warung' } },
  { id: 'h19', group: 'waktu makan', text: 'tadi sarapan bubur 10rb', expect: { amount: 10000, description: 'bubur', cat: SARAPAN, date: T } },
  { id: 'h20', group: 'waktu makan', text: 'makan malam 45rb', expect: { amount: 45000, description: 'makan malam', cat: MALAM } },
  { id: 'h21', group: 'waktu makan', text: 'nasi rames 15rb', expect: { amount: 15000, description: 'nasi rames', cat: FOOD } },
  // Snacks and drinks by name.
  { id: 'h22', group: 'barang', text: 'chiki 5rb', expect: { amount: 5000, description: 'chiki', cat: JAJAN } },
  { id: 'h23', group: 'barang', text: 'le minerale 4rb', expect: { amount: 4000, description: 'le minerale', cat: MINUM } },
  { id: 'h24', group: 'barang', text: 'teh botol 5rb', expect: { amount: 5000, description: 'teh botol', cat: MINUM } },
  { id: 'h25', group: 'barang', text: 'beli wafer tango 6rb', expect: { amount: 6000, description: 'wafer tango', cat: JAJAN } },
  { id: 'h26', group: 'barang', text: 'cilok 5rb', expect: { amount: 5000, description: 'cilok', cat: JAJAN } },
  { id: 'h27', group: 'barang', text: 'ultra milk 6rb', expect: { amount: 6000, description: 'ultra milk', cat: MINUM } },
  { id: 'h28', group: 'barang', text: 'es krim 10rb', expect: { amount: 10000, description: 'es krim', cat: JAJAN } },
  // Not a place.
  { id: 'h29', group: 'bukan tempat', text: 'bensin 40rb pertamax', expect: { amount: 40000, cat: C('Bensin'), noMerchant: true } },
  { id: 'h30', group: 'bukan tempat', text: 'roti 8rb 2 bungkus', expect: { amount: 8000, cat: JAJAN, noMerchant: true } },
  { id: 'h31', group: 'bukan tempat', text: 'pocari 8rb tunai', expect: { amount: 8000, cat: MINUM, wallet: 'cash', noMerchant: true } },
  { id: 'h32', group: 'bukan tempat', text: 'jajan 10rb aja', expect: { amount: 10000, cat: JAJAN, noMerchant: true } },
  { id: 'h33', group: 'bukan tempat', text: 'parkir 3rb motor tadi', expect: { amount: 3000, cat: C('Parkir'), noMerchant: true, date: T } },
  { id: 'h34', group: 'bukan tempat', text: 'nasi goreng 20rb 1 porsi', expect: { amount: 20000, cat: FOOD, noMerchant: true } },
  { id: 'h35', group: 'bukan tempat', text: 'es kopi susu 20rb kemarin', expect: { amount: 20000, cat: MINUM, noMerchant: true, date: K } },
  // Several in one message.
  { id: 'h36', group: 'beberapa', text: 'taro 7rb alfamidi, aqua 4rb', expect: { actions: [{ amount: 7000, description: 'taro', merchant: 'alfamidi', cat: JAJAN }, { amount: 4000, description: 'aqua', cat: MINUM }] } },
  { id: 'h37', group: 'beberapa', text: 'sarapan lontong 8rb terus makan siang gado gado 15rb', expect: { actions: [{ amount: 8000, description: 'lontong', cat: SARAPAN }, { amount: 15000, description: 'gado gado', cat: SIANG }] } },
];
