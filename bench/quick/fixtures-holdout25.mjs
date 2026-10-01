/**
 * Catat otomatis V2.5 held-out set: written after the V2.5 engine was tuned on fixtures-v25.mjs and run once
 * (out/holdout25-v25-first.json). Same context and format as fixtures-v25.mjs.
 */
import { ctx } from './fixtures-v25.mjs';
export { ctx };
const a = (kind, amount, extra = {}) => ({ kind, ...(amount !== undefined ? { amount } : {}), ...extra });
const T = '2026-09-26', KEMARIN = '2026-09-25', BESOK = '2026-09-27';
const raw = [
  ['k01', 'multi mixed', 'beli bensin 40rb pakai ovo, terus tf 200rb dari bca ke jago', [a('expense', 40_000, { wallet: 'ovo' }), a('transfer', 200_000, { wallet: 'bca', to: 'jago' })]],
  ['k02', 'coref date', 'sarapan 15rb, kopi 18rb, semuanya kemarin', [a('expense', 15_000, { date: KEMARIN }), a('expense', 18_000, { date: KEMARIN })]],
  ['k03', 'correction', 'parkir 3rb eh maksudnya 5rb', [a('expense', 5000)]],
  ['k04', 'correction wallet', 'bayar listrik 250rb pake bca, eh bukan, pake mandiri', [a('expense', 250_000, { wallet: 'mandiri' })]],
  ['k05', 'negation cancel', 'tadi tf 50rb ke gopay dari bca, batal deh', []],
  ['k06', 'coref ordinal', 'nasi padang 28rb, es jeruk 8rb. yang kedua pakai cash', [a('expense', 28_000), a('expense', 8000, { wallet: 'cash' })]],
  ['k07', 'coref override', 'beli buku 60rb sama pulpen 10rb pakai gopay, tapi buku pakai jago', [a('expense', 60_000, { wallet: 'jago' }), a('expense', 10_000, { wallet: 'gopay' })]],
  ['k08', 'relation direction', 'Dodi minjemin gue 300rb', [a('debt_new', 300_000, { person: 'Dodi' })]],
  ['k09', 'relation direction', 'gue pinjemin Dodi 300rb pake mandiri', [a('receivable_new', 300_000, { person: 'Dodi', wallet: 'mandiri' })]],
  ['k10', 'relation dependency', 'nalangin tiket konser Sinta 750rb, nanti dia ganti', [a('receivable_new', 750_000, { person: 'Sinta' })]],
  ['k11', 'relation match', 'nyicil utang laptop 500rb', [a('debt_payment', 500_000, { link: 'dl' })]],
  ['k12', 'relation match ambiguous', 'lunasin cicilan 200rb', [a('debt_payment', 200_000, { link: null, review: ['link'], ask: 'link' })]],
  ['k13', 'relation match', 'klaim hotel bandung udah cair', [a('claim_payment', undefined, { link: 'ch' })]],
  ['k14', 'clarify transfer', 'kirim 75rb ke mandiri', [a('transfer', 75_000, { to: 'mandiri', wallet: null, review: ['wallet'], ask: 'wallet' })]],
  ['k15', 'date', 'servis motor 150rb jumat kemarin', [a('expense', 150_000, { date: '2026-09-25' })]],
  ['k16', 'amount slang', 'beli monitor 1jt750', [a('expense', 1_750_000)]],
  ['k17', 'amount nonmoney', 'nonton bioskop 3 orang 120rb jam 8 malam', [a('expense', 120_000)]],
  ['k18', 'future', 'lusa bayar arisan 200rb', [a('plan_new', 200_000, { date: '2026-09-28' })]],
  ['k19', 'future recurring', 'tiap bulan tanggal 10 bayar kos 1,2jt', [a('recurring_new', 1_200_000, { date: '2026-10-10' })]],
  ['k20', 'context boundary', 'bonus 1jt masuk jago, beli kado 150rb', [a('income', 1_000_000, { wallet: 'jago' }), a('expense', 150_000, { wallet: null })]],
  ['k21', 'clarify balance', 'saldo sekarang 2,5jt', [a('balance', 2_500_000, { wallet: null, review: ['wallet'], ask: 'wallet' })]],
  ['k22', 'quantity', '3 bakso @15rb', [a('expense', 45_000)]],
  ['k23', 'simple', 'jajan cilok 5rb', [a('expense', 5000)]],
  ['k24', 'relation payment', 'Budi udah transfer balik 50rb', [a('receivable_payment', 50_000, { link: 'rb' })]],
];
export const cases = raw.map(([id, tags, text, actions, options = {}]) => ({ id, tags: tags.split(' '), text, actions, ...options, ctx }));
