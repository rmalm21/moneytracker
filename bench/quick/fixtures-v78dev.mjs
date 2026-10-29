/**
 * Catat otomatis 7.8 — "only my part" (development set): a shared bill where the person writes only their own part
 * ("290k hokben kemarin gue cuma 45k"). Only that part is recorded; the rest is ignored (no Split Bill, no receivable).
 * Plus guards that must read as before. State: fixtures-v68state.mjs (Thu 15 Oct 2026). Same truth conventions as
 * fixtures-v4dev.mjs. Used while building 7.8.
 */
import { C } from './fixtures-v68state.mjs';
const FOOD = 'expense.makan-minum', SOSIAL = 'expense.sosial-sedekah';
const MINUM = C('Kopi & Minuman'), FAST = C('Fast Food');
const YDAY = '2026-10-14';

export const cases = [
  { id: 'o1', group: 'bagian sendiri', text: '290k hokben kemarin gue cuma 45k', expect: { kind: 'expense', amount: 45000, split: false, cat: FAST, date: YDAY } },
  { id: 'o2', group: 'bagian sendiri', text: 'hokben 290rb kemarin, gue cuma 45rb', expect: { kind: 'expense', amount: 45000, split: false, cat: FAST, date: YDAY } },
  { id: 'o3', group: 'bagian sendiri', text: 'makan bareng 300rb bagianku 75rb', expect: { kind: 'expense', amount: 75000, split: false, cat: FOOD } },
  { id: 'o4', group: 'bagian sendiri', text: 'patungan kado 500rb aku cuma 100rb', expect: { kind: 'expense', amount: 100000, split: false, cat: SOSIAL } },
  { id: 'o5', group: 'bagian sendiri', text: 'bayar bareng 120rb punyaku 40rb', expect: { kind: 'expense', amount: 40000, split: false } },
  { id: 'o6', group: 'bagian sendiri', text: 'total 290k tapi aku cuma 45k', expect: { kind: 'expense', amount: 45000, split: false } },
  { id: 'o7', group: 'bagian sendiri', text: 'hokben 290rb yang aku makan 45rb', expect: { kind: 'expense', amount: 45000, split: false, cat: FOOD } },
  { id: 'o8', group: 'bagian sendiri', text: 'nonton rame-rame 400rb gue cuma bayar 80rb', expect: { kind: 'expense', amount: 80000, split: false } },
  { id: 'o9', group: 'bagian sendiri', text: 'sushi 350rb, punya gue 90rb', expect: { kind: 'expense', amount: 90000, split: false, cat: FOOD } },
  { id: 'o10', group: 'bagian sendiri', text: 'gue cuma 45k dari 290k hokben', expect: { kind: 'expense', amount: 45000, split: false, cat: FOOD } },
  { id: 'o11', group: 'bagian sendiri', text: 'pizza 200rb bagian gue 50rb doang', expect: { kind: 'expense', amount: 50000, split: false, cat: FOOD } },
  { id: 'o12', group: 'bagian sendiri', text: 'karaoke 600rb aku kena 120rb', expect: { kind: 'expense', amount: 120000, split: false } },
  { id: 'o13', group: 'bagian sendiri', text: 'belanja bulanan 1,2jt jatahku 300rb', expect: { kind: 'expense', amount: 300000, split: false } },
  { id: 'o14', group: 'bagian sendiri', text: 'kopi kantor 150rb aku cuma 25rb kemarin', expect: { kind: 'expense', amount: 25000, split: false, cat: MINUM, date: YDAY } },
  // Guards: these keep their 7.7 reading.
  { id: 'g1', group: 'tetap', text: 'makan 100rb aku 60rb ferdi 40rb', expect: { amount: 100000, split: true, share: 60000, people: ['ferdi'], cat: FOOD } },
  { id: 'g2', group: 'tetap', text: 'makan 60rb, 20rb punyaku 40rb traktir', expect: { amount: 60000, lines: [[FOOD, 20000], [SOSIAL, 40000]] } },
  { id: 'g3', group: 'tetap', text: 'cuma 20rb kopi', expect: { kind: 'expense', amount: 20000, split: false, cat: MINUM } },
  { id: 'g4', group: 'tetap', text: 'hokben 162.003 dibagi2 sama ferdi', expect: { amount: 162003, split: true, share: 81002, people: ['ferdi'], cat: FAST } },
];
