/**
 * Catat otomatis V3.1 — first temporal held-out set (v31-heldout-first).
 *
 * Written after V3.1 was built and before it ran on these sentences; run once, first result frozen in
 * bench/quick/heldout-first/ (v30-v31heldout-*.json). Fixes made after that run turn it into development data.
 * Casual typing on purpose. Today is Thursday 15 October 2026; reference clock 15:00 unless a case sets `now`.
 */
import { ctx as base } from './fixtures-v30dev.mjs';
export const today = '2026-10-15';
export const ctx = { ...base, today, now: '15:00' };

const a = (kind, amount, extra = {}) => ({ kind, ...(amount !== undefined ? { amount } : {}), ...extra });
const T = today, Y = '2026-10-14';
const at = now => ({ now });

const raw = [
  ['h01', ['half', 'daypart', 'date'], 'kmrin kopi 20k jm set 3 sore', [a('expense', 20000, { date: Y, time: '14:30' })]],
  ['h02', ['date', 'lewat', 'wallet'], 'tgl2 bensin 80rb krom jam 7 lwt 5', [a('expense', 80000, { date: '2026-10-02', wallet: 'krom', review: ['time'] })]],
  ['h03', ['ampm', 'wallet'], 'makan jam 1 jago 25k', [a('expense', 25000, { wallet: 'jago', time: '13:00' })]],
  ['h04', ['format', 'money'], 'kopi 19k jam 1205', [a('expense', 19000, { time: '12:05' })]],
  ['h05', ['date', 'daypart', 'half'], 'kemaren sore beli roti 12k jam set 6', [a('expense', 12000, { date: Y, time: '17:30' })]],
  ['h06', ['ampm'], 'jajan cilok 10rb jam 2', [a('expense', 10000, { time: '14:00' })]],
  ['h07', ['ampm', 'boundary'], 'es teh di kantin 5rb jam 11', [a('expense', 5000, { description: 'Es Teh', merchant: 'Kantin', time: '11:00' })]],
  ['h08', ['format'], 'parkir 3rb jam 9.45', [a('expense', 3000, { time: '09:45' })]],
  ['h09', ['words', 'daypart'], 'beli nasi uduk 12rb jam enam pagi', [a('expense', 12000, { time: '06:00' })]],
  ['h10', ['half', 'ampm'], 'kopi susu 18k jam stengah 2', [a('expense', 18000, { time: '13:30' })]],
  ['h11', ['ampm'], 'mie ayam 15k jm 12', [a('expense', 15000, { time: '12:00' })]],
  ['h12', ['ampm'], 'bensin 50rb jam 8', [a('expense', 50000, { time: '08:00' })], at('09:00')],
  ['h13', ['ampm'], 'nasi goreng 20k jam 9', [a('expense', 20000, { time: '21:00' })], at('22:30')],
  ['h14', ['lewat', 'ampm'], 'martabak 35rb jam 8 lewat 15', [a('expense', 35000, { time: '20:15' })], at('21:00')],
  ['h15', ['daypart'], 'gofood 45rb jam 7 malem', [a('expense', 45000, { time: '19:00' })], at('20:30')],
  ['h16', ['daypart', 'words'], 'kopi 15rb jam sepuluh pagi', [a('expense', 15000, { time: '10:00' })]],
  ['h17', ['format'], 'top up gopay 100rb dari jago jam 13:15', [a('transfer', 100000, { wallet: 'jago', to: 'gopay', time: '13:15' })]],
  ['h18', ['format', 'boundary'], 'beli obat di apotek k24 35k pukul 14.20', [a('expense', 35000, { description: 'Obat', merchant: 'Apotek K24', time: '14:20' })]],
  ['h19', ['date', 'ampm'], 'kemarin makan siang 30k jam 1', [a('expense', 30000, { date: Y, time: '13:00' })]],
  ['h20', ['date', 'absolute', 'format'], 'tgl 10 servis motor 150rb jam 10.30', [a('expense', 150000, { date: '2026-10-10', time: '10:30' })]],
  ['h21', ['date', 'absolute'], 'tanggal 3 bayar listrik 300rb', [a('expense', 300000, { date: '2026-10-03', time: null })]],
  ['h22', ['date', 'absolute'], '12/10 beli sepatu 250rb', [a('expense', 250000, { date: '2026-10-12', time: null })]],
  ['h23', ['date', 'absolute', 'daypart'], '5 okt nonton 50rb jam 7 malam', [a('expense', 50000, { date: '2026-10-05', time: '19:00' })]],
  ['h24', ['money'], 'beli air mineral 3500', [a('expense', 3500, { time: null })]],
  ['h25', ['money'], 'pulsa 25000 jago', [a('expense', 25000, { wallet: 'jago', time: null })]],
  ['h26', ['money', 'quantity'], 'beli 3 roti 15rb jam 9', [a('expense', 15000, { time: '09:00' })]],
  ['h27', ['money', 'date'], 'tgl 7 beli susu 8rb', [a('expense', 8000, { date: '2026-10-07' })]],
  ['h28', ['money'], 'jam dinding 75rb', [a('expense', 75000, { time: null })]],
  ['h29', ['correction'], 'kopi 20k jam 2 eh jam 3', [a('expense', 20000, { time: '15:00' })]],
  ['h30', ['correction', 'date'], 'kemarin bensin 40rb eh hari ini', [a('expense', 40000, { date: T })]],
  ['h31', ['negation'], 'makan 25k bukan jam 12, jam 1', [a('expense', 25000, { time: '13:00' })]],
  ['h32', ['correction', 'date'], 'tgl 5 eh tgl 6 beli gas 25rb', [a('expense', 25000, { date: '2026-10-06' })]],
  ['h33', ['context', 'segmentation'], 'sarapan 15rb jam 7 terus makan siang 25rb jam 12', [a('expense', 15000, { time: '07:00' }), a('expense', 25000, { time: '12:00' })]],
  ['h34', ['context', 'segmentation', 'date'], 'kemarin parkir 2rb jam 10 terus bensin 50rb jam 2', [a('expense', 2000, { date: Y, review: ['time'] }), a('expense', 50000, { date: Y, time: '14:00' })]],
  ['h35', ['context', 'segmentation'], 'kopi 18k jam 9 terus roti 12k', [a('expense', 18000, { time: '09:00' }), a('expense', 12000, { time: null })]],
  ['h36', ['future'], 'ntar bayar arisan 100rb jam 8', [a('expense', 100000, { time: '20:00' })]],
  ['h37', ['midnight'], 'tadi beli nasi goreng 20k jam 10', [a('expense', 20000, { date: Y, time: '22:00' })], at('00:45')],
  ['h38', ['midnight'], 'barusan beli kopi 15k jam 12 lewat 10', [a('expense', 15000, { date: T, time: '00:10' })], at('00:40')],
  ['h39', ['boundary', 'ampm'], 'ayam geprek di bensu 22k jam 1', [a('expense', 22000, { description: 'Ayam Geprek', merchant: 'Bensu', time: '13:00' })]],
  ['h40', ['boundary', 'half'], 'teh tarik janji jiwa 18k jam setengah 2', [a('expense', 18000, { description: 'Teh Tarik', merchant: 'Janji Jiwa', time: '13:30' })]],
  ['h41', ['boundary', 'date'], 'kmrn makan bakso di pak min 20k', [a('expense', 20000, { date: Y, description: 'Makan Bakso', merchant: 'Pak Min' })]],
  ['h42', ['boundary', 'person'], 'pinjemin dina 50rb jam 4', [a('receivable_new', 50000, { person: 'Dina', time: '04:00', review: ['time'] })]],
  ['h43', ['notime'], 'beli sabun 12rb', [a('expense', 12000, { time: null })]],
  ['h44', ['half', 'daypart'], 'roti bakar 20k jam set 9 malam', [a('expense', 20000, { time: '20:30' })], at('22:00')],
  ['h45', ['format', 'ampm'], 'makan 30k jam 7:30', [a('expense', 30000, { time: '07:30' })]],
];

export const cases = raw.map(([id, tags, text, actions, extra]) => ({ id, tags, text, actions, ...(extra ? { ctx: extra } : {}), set: 'heldout' }));
