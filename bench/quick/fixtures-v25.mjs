/**
 * Catat otomatis V2.5 development set: relations between actions (shared context, references, overrides, scoped
 * corrections, cancellations), money vs. relationship (talangan, lending direction, debt/claim matching), minimal
 * clarification, future vs. completed, slang amounts and numbers that are not money. Same truth format as fixtures.mjs,
 * plus `ask`: the one field the engine should ask for (and nothing else).
 * Today is Saturday 26 September 2026; salary day the 25th.
 */
import { ctx as base, today } from './fixtures.mjs';

export const ctx = {
  ...base,
  wallets: [...base.wallets, { id: 'jago', name: 'Jago', type: 'bank' }, { id: 'mandiri', name: 'Mandiri', type: 'bank' }],
  debts: [{ id: 'dm', name: 'Utang Motor', provider: 'Adira', outstandingAmount: 6_000_000 }, { id: 'dl', name: 'Utang Laptop', provider: 'Kredivo', outstandingAmount: 4_000_000 }],
  receivables: [{ id: 'rb', person: 'Budi', description: 'Makan', remainingAmount: 50_000, date: '2026-09-10' }],
  claims: [{ id: 'ch', name: 'Hotel Bandung', remainingAmount: 900_000 }, { id: 'cm', name: 'Makan klien', remainingAmount: 120_000 }],
};
const a = (kind, amount, extra = {}) => ({ kind, ...(amount !== undefined ? { amount } : {}), ...extra });
const T = today, KEMARIN = '2026-09-25', BESOK = '2026-09-27', SENIN_LALU = '2026-09-21';

const raw = [
  // Required tests (spec 107–127).
  ['r107', 'multi mixed', 'makan 25rb pake Jago, parkir 5rb cash, transfer 100rb dari Jenius ke Mandiri', [a('expense', 25_000, { wallet: 'jago' }), a('expense', 5000, { wallet: 'cash' }), a('transfer', 100_000, { wallet: 'jenius', to: 'mandiri' })]],
  ['r108', 'coref date', 'makan 25rb dan parkir 5rb, dua-duanya kemarin', [a('expense', 25_000, { date: KEMARIN }), a('expense', 5000, { date: KEMARIN })]],
  ['r109', 'coref override', 'makan 25rb dan parkir 5rb pake Jago, tapi makan cash', [a('expense', 25_000, { wallet: 'cash' }), a('expense', 5000, { wallet: 'jago' })]],
  ['r110', 'correction', 'makan 30rb eh 35rb', [a('expense', 35_000)]],
  ['r111', 'correction kind', '100rb ke Mandiri, eh bukan pengeluaran, transfer dari Jago', [a('transfer', 100_000, { wallet: 'jago', to: 'mandiri' })]],
  ['r112', 'negation cancel', 'makan 25rb, eh ga jadi', []],
  ['r113', 'coref', 'makan 25rb sama bensin 80rb. yang bensin pake Mandiri', [a('expense', 25_000), a('expense', 80_000, { wallet: 'mandiri' })]],
  ['r114', 'coref ordinal', 'makan 25rb sama parkir 5rb. yang pertama Jago, yang kedua cash', [a('expense', 25_000, { wallet: 'jago' }), a('expense', 5000, { wallet: 'cash' })]],
  ['r115', 'relation direction', 'Budi minjemin aku 100rb', [a('debt_new', 100_000, { person: 'Budi' })]],
  ['r116', 'relation direction', 'aku minjemin Budi 100rb', [a('receivable_new', 100_000, { person: 'Budi' })]],
  ['r117', 'relation dependency', 'gue talangin Aldi makan 40rb pake Jago, catat dia utang ke gue', [a('receivable_new', 40_000, { person: 'Aldi', wallet: 'jago' })]],
  ['r118', 'relation match', 'bayar utang motor 500rb', [a('debt_payment', 500_000, { link: 'dm' })]],
  ['r119', 'relation match ambiguous', 'bayar utang 500rb', [a('debt_payment', 500_000, { link: null, review: ['link'], ask: 'link' })]],
  ['r120', 'relation match claim', 'claim makan kemarin cair 120rb', [a('claim_payment', 120_000, { link: 'cm' })]],
  ['r121', 'clarify transfer', 'transfer 100rb ke Jago', [a('transfer', 100_000, { to: 'jago', wallet: null, review: ['wallet'], ask: 'wallet' })]],
  ['r122', 'date', 'bensin 80rb senin kemarin', [a('expense', 80_000, { date: SENIN_LALU })]],
  ['r123a', 'amount slang', 'beli sepatu 1.5jt', [a('expense', 1_500_000)]],
  ['r123b', 'amount slang', 'beli sepatu 1,5jt', [a('expense', 1_500_000)]],
  ['r123c', 'amount slang', 'beli kaos 350rbu', [a('expense', 350_000)]],
  ['r123d', 'amount slang', 'beli hp 1500k', [a('expense', 1_500_000)]],
  ['r123e', 'amount slang', 'beli kulkas 2jt200', [a('expense', 2_200_000)]],
  ['r124', 'amount nonmoney', 'makan 2 orang jam 7 malam 50rb', [a('expense', 50_000)]],
  ['r125', 'future', 'besok beli bensin 100rb', [a('plan_new', 100_000, { date: BESOK })]],
  // A reminder with an amount is a Rencana (a planned payment that reminds), the app's existing behaviour; never a posted expense.
  ['r126', 'future reminder', 'ingetin besok bayar wifi 121rb', [a('plan_new', 121_000, { date: BESOK })]],
  ['r127', 'future recurring', 'setiap tanggal 5 spotify 30rb', [a('recurring_new', 30_000, { date: '2026-10-05' })]],

  // Correction scope, local override, context boundaries.
  ['d01', 'correction scope', 'makan 25rb dan bensin 80rb, yang bensin 75 ternyata', [a('expense', 25_000), a('expense', 75_000)]],
  ['d02', 'correction scope', 'kopi 20rb terus parkir 5rb, eh parkirnya 4rb', [a('expense', 20_000), a('expense', 4000)]],
  ['d03', 'context boundary', 'gaji 6jt masuk Jenius, terus makan 25rb', [a('income', 6_000_000, { wallet: 'jenius' }), a('expense', 25_000, { wallet: null })]],
  ['d04', 'coref date', 'makan kemarin 25rb, parkir tadi pagi 5rb', [a('expense', 25_000, { date: KEMARIN }), a('expense', 5000, { date: T })]],
  ['d05', 'coref', 'makan 25rb pakai Jago. bensin 80rb. yang kedua Mandiri', [a('expense', 25_000, { wallet: 'jago' }), a('expense', 80_000, { wallet: 'mandiri' })]],
  ['d06', 'coref ambiguous', 'makan 25rb dan bensin 80rb, yang tadi pake jago', [a('expense', 25_000), a('expense', 80_000, { review: ['wallet'] })]],
  ['d07', 'negation cancel', 'catat parkir 5rb, ga jadi deh', []],
  ['d08', 'negation cancel partial', 'makan 25rb, parkir 5rb, yang parkir ga jadi', [a('expense', 25_000)]],
  ['d09', 'negation wallet', 'bukan dari Jago, dari Mandiri, bayar listrik 300rb', [a('expense', 300_000, { wallet: 'mandiri' })]],

  // Money vs relationship.
  ['d10', 'relation dependency', 'bayarin makan Aldi 40rb pake Jago, jadi dia utang ke gue', [a('receivable_new', 40_000, { person: 'Aldi', wallet: 'jago' })]],
  ['d11', 'relation dependency', 'talangin Aldi 40rb, jadi Aldi utang gue 40rb', [a('receivable_new', 40_000, { person: 'Aldi' })]],
  ['d12', 'relation dependency paraphrase', 'Budi gue bayarin dulu 40k', [a('receivable_new', 40_000, { person: 'Budi' })]],
  ['d13', 'relation dependency paraphrase', '40rb gue talangin buat Rani', [a('receivable_new', 40_000, { person: 'Rani' })]],
  ['d14', 'relation direction paraphrase', 'dipinjemin Sari 200rb', [a('debt_new', 200_000, { person: 'Sari' })]],
  ['d15', 'relation direction paraphrase', 'gue minjem 100rb dari Budi', [a('debt_new', 100_000, { person: 'Budi' })]],
  ['d16', 'relation payment', 'Budi bayar utangnya 50rb', [a('receivable_payment', 50_000, { link: 'rb' })]],
  ['d17', 'relation match', 'nyicil utang laptop 400rb pake bca', [a('debt_payment', 400_000, { link: 'dl', wallet: 'bca' })]],
  ['d18', 'relation two', 'bayar makan 40rb lalu beli kopi 20rb', [a('expense', 40_000), a('expense', 20_000)]],
  ['d19', 'ambiguous kind', 'Budi 100rb', [a('expense', 100_000, { review: ['kind'] })], { optional: true }],

  // Clarification and completed vs. planned.
  ['d20', 'clarify balance', 'saldo 500rb', [a('balance', 500_000, { wallet: null, review: ['wallet'], ask: 'wallet' })]],
  ['d21', 'future plan', 'mau bayar servis motor 300rb', [a('plan_new', 300_000)]],
  ['d22', 'completed', 'udah bayar servis motor 300rb', [a('expense', 300_000)]],
  ['d23', 'completed', 'tadi beli bensin 100rb', [a('expense', 100_000, { date: T })]],
  ['d24', 'multi mixed', 'makan 25rb dari Jago, transfer 100rb ke Mandiri dari Jenius, ingatkan bayar wifi besok', [a('expense', 25_000, { wallet: 'jago' }), a('transfer', 100_000, { wallet: 'jenius', to: 'mandiri' }), a('note_new', undefined, { date: BESOK })]],
  ['d25', 'quantity', '2 kopi 20rb', [a('expense', 20_000)]],
  ['d26', 'quantity', '2 kopi masing-masing 20rb', [a('expense', 40_000)]],
  ['d27', 'amount nonmoney', 'bensin motor 2 isi 30rb', [a('expense', 30_000)]],
  ['d28', 'amount ambiguous', 'parkir 750', [a('expense', 750, { review: ['amount'] })]],
  ['d29', 'simple', 'makan 25rb pake Jago', [a('expense', 25_000, { wallet: 'jago' })]],
  ['d30', 'simple', 'gaji 6jt', [a('income', 6_000_000)]],
  ['d31', 'full', 'makan 25rb sama parkir 5rb kemarin, yang makan pake Jago, terus transfer 100rb dari Jenius ke Mandiri', [a('expense', 25_000, { wallet: 'jago', date: KEMARIN }), a('expense', 5000, { date: KEMARIN }), a('transfer', 100_000, { wallet: 'jenius', to: 'mandiri' })]],
];

export const cases = raw.map(([id, tags, text, actions, options = {}]) => ({ id, tags: tags.split(' '), text, actions, ...options, ctx }));
