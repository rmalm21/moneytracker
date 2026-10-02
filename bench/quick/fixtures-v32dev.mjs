/**
 * Catat otomatis V3.2 — relationship, direction and multi-action development set (v32-dev).
 *
 * Built from the V3.2 spec examples (who owes whom, purpose, repayments, dates per action, actions without joining
 * words). Development data: V3.2 was tuned on it. Today is Thursday 15 October 2026, clock 15:00.
 * Records: receivables Sinta (r1), Dina ×2 (r2 bensin, r3 makan — a repayment by Dina must be asked);
 * debts Rudi (d1) and Aldi (d2). Atuy and Budi have no record.
 *
 * Truth fields as in run-v30.mjs plus `purpose` (null = must stay empty) and `subject` ('user' or the name before the
 * verb). `actions: []` = nothing may be recorded (a debt between two other people).
 */
import { ctx as base } from './fixtures-v30dev.mjs';
export const today = '2026-10-15';
export const ctx = {
  ...base, today, now: '15:00',
  receivables: [...base.receivables, { id: 'r2', person: 'Dina', description: 'Bensin', remainingAmount: 50_000, date: '2026-10-01' }, { id: 'r3', person: 'Dina', description: 'Makan', remainingAmount: 30_000, date: '2026-10-05' }],
  debts: [...base.debts, { id: 'd2', name: 'Pinjaman Aldi', provider: 'Aldi', outstandingAmount: 100_000 }],
};

const a = (kind, amount, extra = {}) => ({ kind, ...(amount !== undefined ? { amount } : {}), ...extra });
const T = today, Y = '2026-10-14';

/** [id, tags, text, actions] */
const raw = [
  // Required (spec)
  ['r01', ['relation', 'required'], 'atuy ngutang 12k', [a('receivable_new', 12000, { person: 'Atuy', subject: 'Atuy', purpose: null, date: T })]],
  ['r02', ['relation', 'purpose', 'required'], 'atuy ngutang 12k buat ngedate', [a('receivable_new', 12000, { person: 'Atuy', purpose: 'Ngedate' })]],
  ['r03', ['relation', 'date', 'required'], 'atuy ngutang 12k kmrn', [a('receivable_new', 12000, { person: 'Atuy', date: Y })]],
  ['r04', ['repayment', 'date', 'required'], 'kmrn atuy bayar utang 12k', [a('receivable_payment', 12000, { person: 'Atuy', date: Y, review: ['link'] })]],
  ['r05', ['relation', 'required'], 'gue ngutang 12k ke aldi', [a('debt_new', 12000, { person: 'Aldi', subject: 'user' })]],
  ['r06', ['relation', 'required'], 'ngutang ke aldi', [a('debt_new', undefined, { person: 'Aldi', ask: 'amount' })]],
  ['r07', ['relation', 'implicit-subject', 'required'], 'ngutang 12k ke aldi', [a('debt_new', 12000, { person: 'Aldi', subject: 'user' })]],
  ['r08', ['segmentation', 'implicit', 'date', 'repayment', 'required'], 'ayam dbesto 13k kmrin parkir 2k di kantor hri ini atuy bayar utang 12k', [
    a('expense', 13000, { description: 'Ayam', merchant: "D'Besto", date: Y }), a('expense', 2000, { description: 'Parkir', merchant: 'Kantor', date: T }), a('receivable_payment', 12000, { person: 'Atuy', date: T, review: ['link'] })]],
  // Direction
  ['d01', ['relation', 'third'], 'atuy ngutang 12k ke aldi', []],
  ['d02', ['relation'], 'gue minjem dari budi 50k', [a('debt_new', 50000, { person: 'Budi' })]],
  ['d03', ['relation'], 'budi minjem 50k', [a('receivable_new', 50000, { person: 'Budi' })]],
  ['d04', ['relation'], 'gue minjemin budi 50k', [a('receivable_new', 50000, { person: 'Budi' })]],
  ['d05', ['relation'], 'budi minjemin gue 50k', [a('debt_new', 50000, { person: 'Budi' })]],
  ['d06', ['relation', 'possession'], 'utang gue ke budi 12k', [a('debt_new', 12000, { person: 'Budi' })]],
  ['d07', ['relation', 'possession'], 'utang atuy ke gue 12k', [a('receivable_new', 12000, { person: 'Atuy' })]],
  ['d08', ['relation', 'wallet'], 'atuy ngutang 12k dari jago', [a('receivable_new', 12000, { person: 'Atuy', wallet: 'jago' })]],
  ['d09', ['relation'], 'aku pinjam 200rb ke budi', [a('debt_new', 200000, { person: 'Budi' })]],
  ['d10', ['relation'], 'saya ngutang ke budi 75rb', [a('debt_new', 75000, { person: 'Budi' })]],
  ['d11', ['relation'], 'budi ngutang ke gue 30k', [a('receivable_new', 30000, { person: 'Budi' })]],
  ['d12', ['relation'], 'dipinjemin budi 100rb', [a('debt_new', 100000, { person: 'Budi' })]],
  ['d13', ['relation', 'honorific'], 'kak tio ngutang 25k', [a('receivable_new', 25000, { person: 'Tio' })]],
  ['d14', ['relation', 'date'], 'atuy tadi ngutang 15k', [a('receivable_new', 15000, { person: 'Atuy', date: T })]],
  ['d15', ['relation', 'third'], 'budi minjem 50k dari atuy', []],
  ['d16', ['relation'], 'gw minjem 100k sama budi', [a('debt_new', 100000, { person: 'Budi' })]],
  // Purpose
  ['p01', ['relation', 'purpose'], 'budi minjem 100k buat bayar kos', [a('receivable_new', 100000, { person: 'Budi', purpose: 'Bayar Kos' })]],
  ['p02', ['relation', 'purpose'], 'gue ngutang ke aldi 50k untuk beli bensin', [a('debt_new', 50000, { person: 'Aldi', purpose: 'Beli Bensin' })]],
  ['p03', ['relation', 'purpose'], 'pinjemin dina 40rb buat makan', [a('receivable_new', 40000, { person: 'Dina', purpose: 'Makan' })]],
  ['p04', ['relation', 'purpose', 'date'], 'atuy ngutang 20k buat ngopi kemarin', [a('receivable_new', 20000, { person: 'Atuy', purpose: 'Ngopi', date: Y })]],
  ['p05', ['relation', 'purpose'], 'atuy ngutang 12k buat makan', [a('receivable_new', 12000, { person: 'Atuy', purpose: 'Makan' })]],
  ['p06', ['relation', 'purpose', 'wallet'], 'budi minjem 50k buat servis motor pake jago', [a('receivable_new', 50000, { person: 'Budi', purpose: 'Servis Motor', wallet: 'jago' })]],
  // Repayments
  ['y01', ['repayment'], 'sinta bayar utang 50k', [a('receivable_payment', 50000, { person: 'Sinta', link: 'r1' })]],
  ['y02', ['repayment'], 'gue bayar utang ke rudi 100k', [a('debt_payment', 100000, { person: 'Rudi', link: 'd1' })]],
  ['y03', ['repayment'], 'bayar utang ke aldi 50k', [a('debt_payment', 50000, { person: 'Aldi', link: 'd2' })]],
  ['y04', ['repayment', 'ambiguous'], 'dina bayar utang 20k', [a('receivable_payment', 20000, { person: 'Dina', review: ['link'], ask: 'link' })]],
  ['y05', ['repayment'], 'atuy balikin 12k', [a('receivable_payment', 12000, { person: 'Atuy', review: ['link'] })]],
  ['y06', ['repayment'], 'dibayar sinta 100rb', [a('receivable_payment', 100000, { person: 'Sinta', link: 'r1' })]],
  ['y07', ['repayment'], 'sinta lunasin utangnya 250rb', [a('receivable_payment', 250000, { person: 'Sinta', link: 'r1' })]],
  ['y08', ['repayment', 'wallet'], 'atuy bayar utang 12k ke jago', [a('receivable_payment', 12000, { person: 'Atuy', wallet: 'jago', review: ['link'] })]],
  // Multi-action without joining words
  ['m01', ['segmentation', 'implicit'], 'kopi 20k jago bensin 80k krom', [a('expense', 20000, { wallet: 'jago', description: 'Kopi' }), a('expense', 80000, { wallet: 'krom', description: 'Bensin' })]],
  ['m02', ['segmentation', 'implicit'], 'makan 25k parkir 3k', [a('expense', 25000, { description: 'Makan' }), a('expense', 3000, { description: 'Parkir' })]],
  ['m03', ['segmentation', 'implicit', 'relation'], 'atuy ngutang 12k budi ngutang 20k', [a('receivable_new', 12000, { person: 'Atuy' }), a('receivable_new', 20000, { person: 'Budi' })]],
  ['m04', ['segmentation', 'implicit', 'repayment'], 'atuy bayar utang 12k budi bayar utang 5k', [a('receivable_payment', 12000, { person: 'Atuy', review: ['link'] }), a('receivable_payment', 5000, { person: 'Budi', review: ['link'] })]],
  ['m05', ['segmentation', 'implicit', 'date'], 'kmrn kopi 20k hari ini bensin 80k', [a('expense', 20000, { date: Y }), a('expense', 80000, { date: T })]],
  // V3.3: tax is a charge of the same purchase (100.000 + 10.000), no longer two amounts to check.
  ['m06', ['segmentation', 'nosplit'], 'makan 100k pajak 10k', [a('expense', 110000)]],
  ['m07', ['segmentation', 'nosplit'], 'beli 2 ayam 20k', [a('expense', 20000)]],
  ['m08', ['segmentation', 'nosplit', 'purpose'], 'atuy ngutang 12k buat makan siang', [a('receivable_new', 12000, { person: 'Atuy', purpose: 'Makan Siang' })]],
  ['m09', ['segmentation', 'implicit', 'date'], 'kopi 15k kmrn roti 10k', [a('expense', 15000, { date: Y }), a('expense', 10000, { date: Y })]],
  ['m10', ['segmentation', 'implicit', 'relation'], 'makan 30k jago atuy ngutang 20k', [a('expense', 30000, { wallet: 'jago' }), a('receivable_new', 20000, { person: 'Atuy' })]],
  ['m11', ['segmentation', 'implicit'], 'nasi goreng 20k es teh 5k', [a('expense', 20000, { description: 'Nasi Goreng' }), a('expense', 5000, { description: 'Es Teh' })]],
  ['m12', ['segmentation', 'implicit', 'date', 'relation'], 'kemarin bensin 50k hari ini budi minjem 100k', [a('expense', 50000, { date: Y }), a('receivable_new', 100000, { person: 'Budi', date: T })]],
  ['m13', ['segmentation', 'nosplit'], 'transfer 100k ke gopay admin 2500', [a('transfer', 100000, { to: 'gopay' })]],
  ['m14', ['segmentation', 'nosplit'], 'makan 25rb 30rb', [a('expense', undefined, { review: ['amount'] })]],
  ['m15', ['segmentation', 'implicit', 'relation', 'purpose'], 'atuy ngutang 12k buat ngedate budi ngutang 20k', [a('receivable_new', 12000, { person: 'Atuy', purpose: 'Ngedate' }), a('receivable_new', 20000, { person: 'Budi', purpose: null })]],
  ['m16', ['segmentation', 'implicit'], 'parkir 2k di kantor bensin 30k pake krom', [a('expense', 2000, { merchant: 'Kantor' }), a('expense', 30000, { wallet: 'krom' })]],
  // Pronouns
  // V3.3: the payment settles the receivable created in the same message (12.000 → 7.000); no record left to pick.
  ['n01', ['pronoun', 'segmentation'], 'atuy ngutang 12k terus dia bayar 5k', [a('receivable_new', 12000, { person: 'Atuy' }), a('receivable_payment', 5000, { person: 'Atuy' })]],
  ['n02', ['pronoun', 'relation'], 'dia ngutang 12k', [a('receivable_new', 12000, { review: ['person'] })]],
  // Corrections and negations
  ['c01', ['correction', 'relation'], 'atuy ngutang 12k eh 15k', [a('receivable_new', 15000, { person: 'Atuy' })]],
  ['c02', ['correction', 'relation'], 'atuy ngutang 12k eh budi', [a('receivable_new', 12000, { person: 'Budi' })]],
  ['c03', ['correction', 'relation'], 'gue ngutang ke aldi eh ke budi 20k', [a('debt_new', 20000, { person: 'Budi' })]],
  ['c04', ['negation', 'relation'], 'bukan atuy, budi ngutang 12k', [a('receivable_new', 12000, { person: 'Budi' })]],
  ['c05', ['negation', 'repayment'], 'atuy bukan ngutang, dia bayar utang 12k', [a('receivable_payment', 12000, { person: 'Atuy', review: ['link'] })]],
  // Existing behaviour kept
  ['k01', ['keep'], 'bayarin sinta makan 50rb', [a('receivable_new', 50000, { person: 'Sinta' })]],
  ['k02', ['keep'], 'pinjam 500rb', [a('debt_new', 500000)]],
  ['k03', ['keep'], 'talangin makan siang tim kantor 250rb, nanti diklaim', [a('claim_new', 250000)]],
  ['k04', ['keep'], 'bayar cicilan rudi 100rb', [a('debt_payment', 100000, { link: 'd1' })]],
];

export const cases = raw.map(([id, tags, text, actions]) => ({ id, tags, text, actions, set: 'dev' }));
