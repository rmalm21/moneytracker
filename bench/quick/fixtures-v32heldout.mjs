/**
 * Catat otomatis V3.2 — first relationship / multi-action held-out set (v32-heldout-first).
 *
 * Written after V3.2 was built and before it ran on these sentences; run once, first result frozen in
 * bench/quick/heldout-first/ (v30-v32heldout-*.json). Fixes made after that run turn it into development data.
 * New names, new verbs and new phrasing on purpose. Same records and clock as fixtures-v32dev.mjs.
 */
import { ctx as dev } from './fixtures-v32dev.mjs';
export const today = '2026-10-15';
export const ctx = dev;

const a = (kind, amount, extra = {}) => ({ kind, ...(amount !== undefined ? { amount } : {}), ...extra });
const T = today, Y = '2026-10-14';

const raw = [
  ['h01', ['relation'], 'rian ngutang 30rb', [a('receivable_new', 30000, { person: 'Rian' })]],
  ['h02', ['relation', 'purpose'], 'rian ngutang 30rb buat beli pulsa', [a('receivable_new', 30000, { person: 'Rian', purpose: 'Beli Pulsa' })]],
  ['h03', ['relation'], 'gw ngutang 40k ke rian', [a('debt_new', 40000, { person: 'Rian' })]],
  ['h04', ['relation'], 'minjem 100rb dari kak nisa', [a('debt_new', 100000, { person: 'Nisa' })]],
  ['h05', ['relation'], 'nisa minjem 60rb', [a('receivable_new', 60000, { person: 'Nisa' })]],
  ['h06', ['relation'], 'aku minjemin rian 25rb', [a('receivable_new', 25000, { person: 'Rian' })]],
  ['h07', ['relation'], 'rian minjemin aku 80rb', [a('debt_new', 80000, { person: 'Rian' })]],
  ['h08', ['relation', 'third'], 'rian ngutang 50rb ke nisa', []],
  ['h09', ['relation', 'possession'], 'utang aku ke nisa 45rb', [a('debt_new', 45000, { person: 'Nisa' })]],
  ['h10', ['relation', 'possession'], 'utang rian ke aku 20rb', [a('receivable_new', 20000, { person: 'Rian' })]],
  ['h11', ['relation', 'date'], 'kemarin rian ngutang 15rb', [a('receivable_new', 15000, { person: 'Rian', date: Y })]],
  ['h12', ['relation', 'purpose', 'date'], 'nisa ngutang 35k buat ongkos pulang kmrn', [a('receivable_new', 35000, { person: 'Nisa', purpose: 'Ongkos Pulang', date: Y })]],
  ['h13', ['relation', 'wallet'], 'rian minjem 50rb dari gopay', [a('receivable_new', 50000, { person: 'Rian', wallet: 'gopay' })]],
  ['h14', ['relation'], 'ngutang 25rb sama nisa', [a('debt_new', 25000, { person: 'Nisa' })]],
  ['h15', ['relation', 'purpose'], 'pinjemin nisa 100rb untuk bayar listrik', [a('receivable_new', 100000, { person: 'Nisa', purpose: 'Bayar Listrik' })]],
  ['h16', ['relation'], 'saya pinjam uang 300rb ke mas dodi', [a('debt_new', 300000, { person: 'Dodi' })]],
  ['h17', ['repayment'], 'rian bayar utang 30rb', [a('receivable_payment', 30000, { person: 'Rian', review: ['link'] })]],
  ['h18', ['repayment'], 'sinta bayar utang 100rb ke jago', [a('receivable_payment', 100000, { person: 'Sinta', link: 'r1', wallet: 'jago' })]],
  ['h19', ['repayment'], 'aku bayar utang ke aldi 20rb', [a('debt_payment', 20000, { person: 'Aldi', link: 'd2' })]],
  ['h20', ['repayment', 'ambiguous'], 'dina balikin 10rb', [a('receivable_payment', 10000, { person: 'Dina', review: ['link'], ask: 'link' })]],
  ['h21', ['repayment', 'date'], 'kmrn sinta bayar utang 50rb', [a('receivable_payment', 50000, { person: 'Sinta', link: 'r1', date: Y })]],
  ['h22', ['repayment'], 'gue lunasin utang ke rudi 400rb', [a('debt_payment', 400000, { person: 'Rudi', link: 'd1' })]],
  ['h23', ['segmentation', 'implicit'], 'teh 5k gopay roti 12k jago', [a('expense', 5000, { wallet: 'gopay' }), a('expense', 12000, { wallet: 'jago' })]],
  ['h24', ['segmentation', 'implicit'], 'bakso 15k es jeruk 7k', [a('expense', 15000, { description: 'Bakso' }), a('expense', 7000, { description: 'Es Jeruk' })]],
  ['h25', ['segmentation', 'implicit', 'relation'], 'rian ngutang 10k nisa ngutang 15k', [a('receivable_new', 10000, { person: 'Rian' }), a('receivable_new', 15000, { person: 'Nisa' })]],
  ['h26', ['segmentation', 'implicit', 'repayment'], 'rian bayar utang 10k nisa bayar utang 5k', [a('receivable_payment', 10000, { person: 'Rian', review: ['link'] }), a('receivable_payment', 5000, { person: 'Nisa', review: ['link'] })]],
  ['h27', ['segmentation', 'implicit', 'date'], 'kemarin bakso 15k hari ini parkir 3k', [a('expense', 15000, { date: Y }), a('expense', 3000, { date: T })]],
  ['h28', ['segmentation', 'implicit', 'date', 'repayment'], 'mie ayam 12k kemarin bensin 20k krom hari ini rian bayar utang 10k', [a('expense', 12000, { date: Y }), a('expense', 20000, { date: T, wallet: 'krom' }), a('receivable_payment', 10000, { person: 'Rian', date: T, review: ['link'] })]],
  ['h29', ['segmentation', 'implicit', 'relation'], 'parkir 2rb rian minjem 20rb', [a('expense', 2000), a('receivable_new', 20000, { person: 'Rian' })]],
  ['h30', ['segmentation', 'nosplit'], 'makan 50k service 5k', [a('expense', undefined, { review: ['amount'] })]],
  ['h31', ['segmentation', 'nosplit'], 'beli 3 donat 15k', [a('expense', 15000)]],
  ['h32', ['segmentation', 'nosplit', 'purpose'], 'rian minjem 50rb buat beli bensin', [a('receivable_new', 50000, { person: 'Rian', purpose: 'Beli Bensin' })]],
  ['h33', ['segmentation', 'implicit'], 'pulsa 25k jenius kopi 18k gopay', [a('expense', 25000, { wallet: 'jenius' }), a('expense', 18000, { wallet: 'gopay' })]],
  ['h34', ['segmentation', 'implicit', 'date'], 'tadi sarapan 15k terus kmrn malem martabak 30k', [a('expense', 15000, { date: T }), a('expense', 30000, { date: Y })]],
  ['h35', ['segmentation', 'implicit'], 'gaji 5jt bonus 1jt', [a('income', 5000000), a('income', 1000000)]],
  ['h36', ['pronoun', 'segmentation'], 'rian ngutang 20rb terus doi bayar 10rb', [a('receivable_new', 20000, { person: 'Rian' }), a('receivable_payment', 10000, { person: 'Rian', review: ['link'] })]],
  ['h37', ['correction', 'relation'], 'rian ngutang 20rb eh 25rb', [a('receivable_new', 25000, { person: 'Rian' })]],
  ['h38', ['correction', 'relation'], 'nisa ngutang 30rb eh rian', [a('receivable_new', 30000, { person: 'Rian' })]],
  ['h39', ['correction', 'relation'], 'aku ngutang ke nisa eh ke rian 50rb', [a('debt_new', 50000, { person: 'Rian' })]],
  ['h40', ['negation', 'relation'], 'bukan rian, nisa ngutang 20rb', [a('receivable_new', 20000, { person: 'Nisa' })]],
  ['h41', ['relation', 'purpose'], 'dodi minjem 200rb buat modal usaha', [a('receivable_new', 200000, { person: 'Dodi', purpose: 'Modal Usaha' })]],
  ['h42', ['relation'], 'dipinjemin nisa 70rb', [a('debt_new', 70000, { person: 'Nisa' })]],
  ['h43', ['repayment'], 'dibayar rian 15rb', [a('receivable_payment', 15000, { person: 'Rian', review: ['link'] })]],
  ['h44', ['keep'], 'bayarin dina parkir 5rb', [a('receivable_new', 5000, { person: 'Dina' })]],
  ['h45', ['relation', 'date'], 'rian tadi pagi ngutang 12rb', [a('receivable_new', 12000, { person: 'Rian', date: T })]],
];

export const cases = raw.map(([id, tags, text, actions]) => ({ id, tags, text, actions, set: 'heldout' }));
