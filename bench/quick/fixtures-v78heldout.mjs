/**
 * Catat otomatis 7.8 — "only my part", held-out: written before the engine changed, in other words than the
 * development set, and not used while building. Run once with --first (frozen). State: fixtures-v68state.mjs.
 */
import { C } from './fixtures-v68state.mjs';
const FOOD = 'expense.makan-minum', SOSIAL = 'expense.sosial-sedekah', TRANSPORT = 'expense.transportasi';
const MINUM = C('Kopi & Minuman');
const YDAY = '2026-10-14';

export const cases = [
  { id: 'ho1', group: 'bagian sendiri', text: 'bakso rame-rame 150rb aku cuma 25rb', expect: { kind: 'expense', amount: 25000, split: false, cat: FOOD } },
  { id: 'ho2', group: 'bagian sendiri', text: 'makan malam keluarga 800rb, bagianku cuma 200rb', expect: { kind: 'expense', amount: 200000, split: false, cat: FOOD } },
  { id: 'ho3', group: 'bagian sendiri', text: 'tiket konser bareng 2jt, punyaku 500rb', expect: { kind: 'expense', amount: 500000, split: false } },
  { id: 'ho4', group: 'bagian sendiri', text: 'gue cuma 30rb dari total 180rb martabak', expect: { kind: 'expense', amount: 30000, split: false, cat: FOOD } },
  { id: 'ho5', group: 'bagian sendiri', text: 'kemarin bukber 450rb aku bayar 90rb doang', expect: { kind: 'expense', amount: 90000, split: false, date: YDAY } },
  { id: 'ho6', group: 'bagian sendiri', text: 'grab bareng 80rb gw cuma 20rb', expect: { kind: 'expense', amount: 20000, split: false, cat: TRANSPORT } },
  { id: 'ho7', group: 'bagian sendiri', text: 'kado ultah dina 600rb aku kena 150rb', expect: { kind: 'expense', amount: 150000, split: false, cat: SOSIAL } },
  { id: 'ho8', group: 'bagian sendiri', text: 'starbucks 210rb yang aku pesen 55rb', expect: { kind: 'expense', amount: 55000, split: false, cat: MINUM } },
  { id: 'ho9', group: 'bagian sendiri', text: 'sewa villa 3jt jatah gue 600rb', expect: { kind: 'expense', amount: 600000, split: false } },
  { id: 'ho10', group: 'bagian sendiri', text: 'nasi padang 120rb tadi siang, porsiku 30rb', expect: { kind: 'expense', amount: 30000, split: false, cat: FOOD } },
  { id: 'ho11', group: 'bagian sendiri', text: 'bensin patungan 200rb aku cuma 50rb', expect: { kind: 'expense', amount: 50000, split: false, cat: C('Bensin') } },
  { id: 'ho12', group: 'bagian sendiri', text: 'hotpot 480rb aku cuma 120rb, sisanya biarin', expect: { kind: 'expense', amount: 120000, split: false, cat: FOOD } },
  { id: 'hg1', group: 'tetap', text: 'sushi 300rb aku 100rb rina 200rb', expect: { amount: 300000, split: true, share: 100000, people: ['rina'] } },
  { id: 'hg2', group: 'tetap', text: 'makan 90rb, 30rb punyaku 60rb traktir nisa', expect: { amount: 90000, lines: [[FOOD, 30000], [SOSIAL, 60000]] } },
];
